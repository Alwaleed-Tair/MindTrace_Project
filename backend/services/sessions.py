"""Session repository: store the posted session.json untouched, list and read it back."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from core.db import Database
from schemas.session import SessionIn, other_voice_note_ids, review_note_ids


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def upsert(db: Database, raw: dict, s: SessionIn, audio_files: list[str]) -> bool:
    """Insert or replace. Returns True if the session already existed (a re-post, e.g. after re-transcribing):
    the AI result is then marked stale so it is computed again from the new text."""
    existed = db.one("SELECT 1 FROM sessions WHERE session_id=?", (s.session_id,)) is not None
    exp = (s.experiment_status or {}).get("state")
    now = _now()
    with db.tx() as c:
        if existed:
            c.execute("""UPDATE sessions SET updated_at=?, title=?, started_at=?, duration_sec=?, note_count=?, status=?,
                         experiment_state=?, review_count=?, other_voice_count=?, session_json=?, audio_files=?,
                         ai_status='pending', ai_error=NULL WHERE session_id=?""",
                      (now, s.title, s.started_at, s.duration_sec, s.note_count, s.status, exp, len(review_note_ids(s)),
                       len(other_voice_note_ids(s)), json.dumps(raw, ensure_ascii=False), json.dumps(audio_files), s.session_id))
        else:
            c.execute("""INSERT INTO sessions (session_id, received_at, updated_at, title, started_at, duration_sec, note_count,
                         status, experiment_state, review_count, other_voice_count, session_json, audio_files)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                      (s.session_id, now, now, s.title, s.started_at, s.duration_sec, s.note_count, s.status, exp,
                       len(review_note_ids(s)), len(other_voice_note_ids(s)), json.dumps(raw, ensure_ascii=False),
                       json.dumps(audio_files)))
    return existed


def merge_audio_list(db: Database, session_id: str, files: list[str]) -> None:
    with db.tx() as c:
        c.execute("UPDATE sessions SET audio_files=? WHERE session_id=?", (json.dumps(files), session_id))


def summary_row(r) -> dict:
    return {"session_id": r["session_id"], "title": r["title"], "started_at": r["started_at"],
            "duration_sec": r["duration_sec"], "note_count": r["note_count"], "status": r["status"],
            "experiment_state": r["experiment_state"], "needs_review_notes": r["review_count"],
            "possible_other_voice_notes": r["other_voice_count"], "received_at": r["received_at"],
            "ai_status": r["ai_status"]}


def list_sessions(db: Database, limit: int, offset: int) -> tuple[int, list[dict]]:
    total = db.one("SELECT COUNT(*) AS n FROM sessions")["n"]
    rows = db.all("SELECT * FROM sessions ORDER BY started_at DESC, received_at DESC LIMIT ? OFFSET ?", (limit, offset))
    return total, [summary_row(r) for r in rows]


def get_session(db: Database, session_id: str) -> dict | None:
    r = db.one("SELECT * FROM sessions WHERE session_id=?", (session_id,))
    if r is None:
        return None
    return {
        **summary_row(r),
        "updated_at": r["updated_at"],
        "session": json.loads(r["session_json"]),
        "audio_files": json.loads(r["audio_files"]),
        "ai": {"status": r["ai_status"], "result": json.loads(r["ai_json"]) if r["ai_json"] else None,
               "error": r["ai_error"], "updated_at": r["ai_updated_at"]},
    }


def set_ai(db: Database, session_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
    with db.tx() as c:
        c.execute("UPDATE sessions SET ai_status=?, ai_json=?, ai_error=?, ai_updated_at=? WHERE session_id=?",
                  (status, json.dumps(result, ensure_ascii=False) if result is not None else None, error, _now(), session_id))
