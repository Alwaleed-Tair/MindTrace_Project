"""AI insights for an experiment (DeepSeek): summary, documentation quality, originality estimate, note suggestions.

The model only SUGGESTS. The one thing applied automatically is the kind label (observation / hypothesis / decision)
of notes that came from a recording, and the originality number; the text of a note is never changed by the AI.
"""
from __future__ import annotations

import dataclasses
import json

import httpx

from core.config import Settings
from core.db import Database
from services import ai as ai_service
from services import literature
from services.users import iso


def build_input(db: Database, exp_id: int) -> dict:
    e = db.one("SELECT * FROM experiments WHERE id=?", (exp_id,))
    notes = []
    for n in db.all("SELECT * FROM notes WHERE experiment_id=? ORDER BY created_at, id", (exp_id,)):
        meta = json.loads(n["meta"] or "{}")
        notes.append({"id": n["id"], "kind": n["kind"], "time_label": n["time_label"] or n["created_at"][11:16], "text": n["text"],
                      "asr": meta.get("asr"), "speaker_check": meta.get("speaker_check")})
    return {"title": e["title"], "description": e["summary"], "notes": notes, "duration_sec": e["duration_sec"],
            "experiment_status": {"state": {"Active": "ongoing", "Paused": "paused_will_resume", "Completed": "completed"}[e["status"]]}}


def set_state(db: Database, exp_id: int, status: str, result: dict | None = None, error: str | None = None) -> None:
    with db.tx() as c:
        if result is None and status in ("queued", "running"):       # keep showing the previous result while a new one is being made
            c.execute("UPDATE experiments SET ai_status=?, ai_error=?, ai_updated_at=ai_updated_at WHERE id=?", (status, error, exp_id))
            return
        c.execute("UPDATE experiments SET ai_status=?, ai_json=?, ai_error=?, ai_updated_at=? WHERE id=?",
                  (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, iso(), exp_id))


LANGUAGES = {"ar": "Arabic", "en": "English"}


def run(db: Database, settings: Settings, exp_id: int, client: httpx.Client | None = None, language: str | None = None) -> None:
    """Never raises: the outcome is stored on the experiment (ai_status done / failed). `language` ('ar' / 'en') is what the
    reader's interface is set to: every text the model writes comes back in it."""
    if language in LANGUAGES:
        settings = dataclasses.replace(settings, ai_language=LANGUAGES[language])
    code = next((k for k, v in LANGUAGES.items() if v == settings.ai_language), None)
    if db.one("SELECT 1 FROM experiments WHERE id=?", (exp_id,)) is None:
        return
    set_state(db, exp_id, "running")
    try:
        data = build_input(db, exp_id)
        if not data["notes"]:
            set_state(db, exp_id, "failed", error="add at least one note first")
            return
        result = ai_service.analyze(settings, data, client)
    except ai_service.AiError as exc:
        set_state(db, exp_id, "failed", error=str(exc))
        return
    except Exception as exc:                                         # never leave an experiment stuck on "running"
        set_state(db, exp_id, "failed", error=f"unexpected error: {exc.__class__.__name__}")
        return
    result["meta"]["language"] = code
    originality = int(result["novelty"]["score"])
    result["literature"] = _literature(settings, data, client)
    if result["literature"]["status"] == "ok":
        originality = result["literature"]["score"]                  # an estimate checked against real papers beats the model's guess
    with db.tx() as c:
        c.execute("UPDATE experiments SET ai_status='done', ai_json=?, ai_error=NULL, ai_updated_at=?, originality=? WHERE id=?",
                  (json.dumps(result, ensure_ascii=False), iso(), originality, exp_id))
        for k in result.get("note_kinds", []):                       # labels only, and only for notes that came from a recording
            c.execute("UPDATE notes SET kind=? WHERE id=? AND experiment_id=? AND source='recording'", (k["kind"], k["note_id"], exp_id))


def _literature(settings: Settings, data: dict, client: httpx.Client | None) -> dict:
    """Originality against scholarly papers. Never raises: a failure only means the model's own estimate stays."""
    if not settings.literature_enabled:
        return {"status": "off"}
    try:
        queries = ai_service.make_queries(settings, data, client)
        if not queries:
            return {"status": "skipped", "queries": [], "error": "the notes do not look like a scientific study"}
        papers, sources = literature.search(queries, client)
        if not papers:
            return {"status": "unavailable", "queries": queries, "sources": sources, "error": "no scholarly source returned results"}
        verdict = ai_service.assess_originality(settings, data, papers, client)
    except ai_service.AiError as exc:
        return {"status": "failed", "error": str(exc)}
    except Exception as exc:
        return {"status": "failed", "error": f"unexpected error: {exc.__class__.__name__}"}
    return {"status": "ok", "queries": queries, "sources": sources, "searched": len(papers), **verdict, "generated_at": iso()}


def get(db: Database, exp_id: int) -> dict:
    e = db.one("SELECT ai_status, ai_json, ai_error, ai_updated_at FROM experiments WHERE id=?", (exp_id,))
    return {"status": e["ai_status"], "result": json.loads(e["ai_json"]) if e["ai_json"] else None,
            "error": e["ai_error"], "updated_at": e["ai_updated_at"]}
