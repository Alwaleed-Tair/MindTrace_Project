"""Recorder sessions: keep the posted session.json untouched, and turn it into an experiment with notes.

One recording = one experiment (experiments.session_id). Posting the same session again (for example after
`--retranscribe`) updates the experiment in place: ASR notes get the new text, notes a person edited by hand keep
their text, notes added by hand stay.
"""
from __future__ import annotations

import json
import re
import unicodedata

from core.db import Database
from schemas.session import SessionIn, other_voice_note_ids, review_note_ids
from services import experiments as ex
from services.users import iso

STATE_TO_STATUS = {"completed": "Completed", "paused_will_resume": "Paused"}
_RESUME_STATUS = {"completed": "Completed", "paused_will_resume": "Paused", "ongoing": "Active"}


def title_key(title: str | None) -> str:
    """Spoken titles are compared loosely: case, punctuation, Arabic diacritics/tatweel and spacing do not matter."""
    t = unicodedata.normalize("NFKC", title or "").casefold()
    t = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", t)               # tashkeel + tatweel
    t = re.sub(r"[أإآ]", "ا", t)
    return re.sub(r"[\W_]+", " ", t).strip()


def find_by_title(db: Database, owner_id: int, title: str | None) -> int | None:
    """An experiment of this owner whose title is the same as the one just spoken (the recording continues it)."""
    key = title_key(title)
    if not key:
        return None
    for r in db.all("SELECT id, title FROM experiments WHERE owner_id=? ORDER BY id", (owner_id,)):
        if title_key(r["title"]) == key:
            return r["id"]
    return None


def summary_row(r) -> dict:
    return {"session_id": r["session_id"], "title": r["title"], "started_at": r["started_at"],
            "duration_sec": r["duration_sec"], "note_count": r["note_count"], "status": r["status"],
            "experiment_state": r["experiment_state"], "needs_review_notes": r["review_count"],
            "possible_other_voice_notes": r["other_voice_count"], "received_at": r["received_at"],
            "experiment_id": str(r["experiment_id"]) if r["experiment_id"] else None}


TITLE_MAX = 160


def experiment_title(title: str | None) -> str:
    """The spoken title as an experiment title: empty -> "Untitled recording"; a long one (the researcher kept talking
    without a pause) is cut at a word, and the full text is kept as a note (see _sync_notes)."""
    t = " ".join((title or "").split())
    if not t:
        return "Untitled recording"
    if len(t) <= TITLE_MAX:
        return t
    cut = t[:TITLE_MAX - 1]
    return (cut[:cut.rfind(" ")] if " " in cut[TITLE_MAX // 2:] else cut).rstrip(" ,.،؛") + "…"


def _is_long_title(sn) -> bool:
    return sn.kind == "title" and len(" ".join(sn.text.split())) > TITLE_MAX


def upsert(db: Database, owner_id: int, raw: dict, s: SessionIn, audio_files: list[str]) -> tuple[bool, int]:
    """Store the session and sync its experiment. Returns (already_existed, experiment_id)."""
    prev = db.one("SELECT experiment_id FROM sessions WHERE owner_id=? AND session_id=?", (owner_id, s.session_id))
    state = (s.experiment_status or {}).get("state")
    now = iso()
    exp_id = prev["experiment_id"] if prev and prev["experiment_id"] else None
    if exp_id is not None and db.one("SELECT 1 FROM experiments WHERE id=?", (exp_id,)) is None:
        exp_id = None
    if exp_id is None and s.title.strip():
        exp_id = find_by_title(db, owner_id, s.title)                 # same spoken title: continue that experiment
        if exp_id is not None and state in _RESUME_STATUS:
            with db.tx() as c:
                c.execute("UPDATE experiments SET status=? WHERE id=?", (_RESUME_STATUS[state], exp_id))
    if exp_id is None:
        exp_id = ex.create_experiment(db, owner_id, experiment_title(s.title), "", ["Recording"], status=STATE_TO_STATUS.get(state, "Active"),
                                      originality=50, duration_sec=s.duration_sec, session_id=s.session_id)
    with db.tx() as c:
        c.execute("""INSERT INTO sessions (owner_id, session_id, experiment_id, received_at, updated_at, title, started_at, duration_sec,
                     note_count, status, experiment_state, review_count, other_voice_count, session_json, audio_files)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                     ON CONFLICT(owner_id, session_id) DO UPDATE SET experiment_id=excluded.experiment_id, updated_at=excluded.updated_at,
                       title=excluded.title, started_at=excluded.started_at, duration_sec=excluded.duration_sec, note_count=excluded.note_count,
                       status=excluded.status, experiment_state=excluded.experiment_state, review_count=excluded.review_count,
                       other_voice_count=excluded.other_voice_count, session_json=excluded.session_json, audio_files=excluded.audio_files""",
                  (owner_id, s.session_id, exp_id, now, now, s.title, s.started_at, s.duration_sec, s.note_count, s.status, state,
                   len(review_note_ids(s)), len(other_voice_note_ids(s)), json.dumps(raw, ensure_ascii=False), json.dumps(audio_files)))
    with db.tx() as c:                                                # an experiment continued over several recordings: total time
        c.execute("UPDATE experiments SET duration_sec=(SELECT COALESCE(SUM(duration_sec),0) FROM sessions WHERE owner_id=? AND experiment_id=?), "
                  "updated_at=? WHERE id=?", (owner_id, exp_id, now, exp_id))
    added = _sync_notes(db, owner_id, exp_id, s)
    if added:
        ex.notify_members(db, exp_id, owner_id, "note_added", f"added {added} recorded note(s)")
    return prev is not None, exp_id


def _sync_notes(db: Database, owner_id: int, exp_id: int, s: SessionIn) -> int:
    first = db.one("SELECT session_id FROM experiments WHERE id=?", (exp_id,))["session_id"]
    existing = {}
    for n in db.all("SELECT id, meta, text_source FROM notes WHERE experiment_id=? AND source='recording'", (exp_id,)):
        m = json.loads(n["meta"] or "{}")
        if m.get("session_note_id") is not None:                     # notes saved before sessions could be merged have no session_id
            existing[(m.get("session_id") or first, m["session_note_id"])] = n
    added = 0
    for sn in s.notes:
        if not sn.text.strip() or (sn.kind != "note" and not _is_long_title(sn)):
            continue                                                  # the spoken title became the experiment title (a long one is also kept as a note)
        meta = {"session_id": s.session_id, "session_note_id": sn.id, "audio_file": sn.audio_file, "asr": sn.asr, "speaker_check": sn.speaker_check}
        hit = existing.get((s.session_id, sn.id))
        if hit is None:
            ex.add_note(db, exp_id, owner_id, sn.text, "observation", source="recording", text_source="asr", time_label=sn.time_label,
                        meta=meta, notify=False)
            added += 1
        else:
            with db.tx() as c:
                if hit["text_source"] == "asr":                        # a person's own edit is never overwritten
                    c.execute("UPDATE notes SET text=?, meta=?, time_label=?, updated_at=? WHERE id=?",
                              (sn.text, json.dumps(meta, ensure_ascii=False), sn.time_label, iso(), hit["id"]))
                else:
                    c.execute("UPDATE notes SET meta=?, updated_at=? WHERE id=?", (json.dumps(meta, ensure_ascii=False), iso(), hit["id"]))
    return added


def list_sessions(db: Database, owner_id: int, limit: int, offset: int) -> tuple[int, list[dict]]:
    total = db.one("SELECT COUNT(*) AS n FROM sessions WHERE owner_id=?", (owner_id,))["n"]
    rows = db.all("SELECT * FROM sessions WHERE owner_id=? ORDER BY started_at DESC LIMIT ? OFFSET ?", (owner_id, limit, offset))
    return total, [summary_row(r) for r in rows]


def get_session(db: Database, owner_id: int, session_id: str) -> dict | None:
    r = db.one("SELECT * FROM sessions WHERE owner_id=? AND session_id=?", (owner_id, session_id))
    if r is None:
        return None
    return {**summary_row(r), "updated_at": r["updated_at"], "session": json.loads(r["session_json"]), "audio_files": json.loads(r["audio_files"])}
