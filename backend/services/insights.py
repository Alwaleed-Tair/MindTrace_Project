"""AI insights for an experiment (DeepSeek): summary, documentation quality, originality estimate, note suggestions.

The model only SUGGESTS. The one thing applied automatically is the kind label (observation / hypothesis / decision)
of notes that came from a recording, and the originality number; the text of a note is never changed by the AI.
"""
from __future__ import annotations

import json

import httpx

from core.config import Settings
from core.db import Database
from services import ai as ai_service
from services.users import iso


def build_input(db: Database, exp_id: int) -> dict:
    e = db.one("SELECT * FROM experiments WHERE id=?", (exp_id,))
    notes = []
    for n in db.all("SELECT * FROM notes WHERE experiment_id=? ORDER BY created_at, id", (exp_id,)):
        meta = json.loads(n["meta"] or "{}")
        notes.append({"id": n["id"], "kind": n["kind"], "time_label": n["time_label"] or n["created_at"][11:16], "text": n["text"],
                      "asr": meta.get("asr"), "speaker_check": meta.get("speaker_check")})
    return {"title": e["title"], "notes": notes, "duration_sec": e["duration_sec"],
            "experiment_status": {"state": {"Active": "ongoing", "Paused": "paused_will_resume", "Completed": "completed"}[e["status"]]}}


def set_state(db: Database, exp_id: int, status: str, result: dict | None = None, error: str | None = None) -> None:
    with db.tx() as c:
        c.execute("UPDATE experiments SET ai_status=?, ai_json=?, ai_error=?, ai_updated_at=? WHERE id=?",
                  (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, iso(), exp_id))


def run(db: Database, settings: Settings, exp_id: int, client: httpx.Client | None = None) -> None:
    """Never raises: the outcome is stored on the experiment (ai_status done / failed)."""
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
    with db.tx() as c:
        c.execute("UPDATE experiments SET ai_status='done', ai_json=?, ai_error=NULL, ai_updated_at=?, originality=? WHERE id=?",
                  (json.dumps(result, ensure_ascii=False), iso(), int(result["novelty"]["score"]), exp_id))
        for k in result.get("note_kinds", []):                       # labels only, and only for notes that came from a recording
            c.execute("UPDATE notes SET kind=? WHERE id=? AND experiment_id=? AND source='recording'", (k["kind"], k["note_id"], exp_id))


def get(db: Database, exp_id: int) -> dict:
    e = db.one("SELECT ai_status, ai_json, ai_error, ai_updated_at FROM experiments WHERE id=?", (exp_id,))
    return {"status": e["ai_status"], "result": json.loads(e["ai_json"]) if e["ai_json"] else None,
            "error": e["ai_error"], "updated_at": e["ai_updated_at"]}
