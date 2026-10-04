"""Experiments, their notes, collaborators and notifications (the domain the web UI shows)."""
from __future__ import annotations

import difflib
import json
import re
import unicodedata
from datetime import timedelta

from core.db import Database
from services.users import iso, now, public

STATUSES = ("Active", "Paused", "Completed")
NOTE_KINDS = ("observation", "hypothesis", "decision")
COLORS = ("mint", "lilac", "sand", "blue")
MAX_NOTE_CHARS = 5000


class NotFound(LookupError):
    pass


class Forbidden(PermissionError):
    pass


class Invalid(ValueError):
    pass


def fmt_duration(sec: float) -> str:
    sec = int(max(0, sec))
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


# ------------------------------------------------------------------ access
def role_of(db: Database, exp_id: int, user_id: int) -> str | None:
    row = db.one("SELECT owner_id FROM experiments WHERE id=?", (exp_id,))
    if row is None:
        return None
    if row["owner_id"] == user_id:
        return "owner"
    if db.one("SELECT 1 FROM collaborators WHERE experiment_id=? AND user_id=?", (exp_id, user_id)):
        return "editor"
    # shared with a team the user is in
    if db.one("""SELECT 1 FROM experiments e JOIN team_members m ON m.team_id=e.team_id WHERE e.id=? AND m.user_id=?""", (exp_id, user_id)):
        return "editor"
    return None


# an experiment the user can see: owns it, was added to it, or it is shared with one of the user's teams (3 user-id args)
VISIBLE = """(e.owner_id=? OR EXISTS (SELECT 1 FROM collaborators c WHERE c.experiment_id=e.id AND c.user_id=?)
             OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=e.team_id AND tm.user_id=?))"""


def require(db: Database, exp_id: int, user_id: int, owner_only: bool = False) -> str:
    """The user's role. A stranger gets NotFound (same answer as a missing experiment: nothing is revealed)."""
    role = role_of(db, exp_id, user_id)
    if role is None:
        raise NotFound("no such experiment")
    if owner_only and role != "owner":
        raise Forbidden("only the owner can do this")
    return role


# ------------------------------------------------------------ serializing
def _people(db: Database, exp_id: int) -> list[dict]:
    rows = db.all("""SELECT u.* FROM collaborators c JOIN users u ON u.id=c.user_id WHERE c.experiment_id=? ORDER BY c.created_at""", (exp_id,))
    return [public(r, include_email=False) for r in rows]


def audio_files_of(db: Database, exp_id: int) -> set[tuple[str, str]]:
    """(session_id, file name) of every audio file stored for the recordings this experiment came from."""
    out: set[tuple[str, str]] = set()
    for r in db.all("""SELECT s.session_id, s.audio_files FROM sessions s JOIN experiments e ON e.owner_id=s.owner_id
                       WHERE e.id=? AND s.experiment_id=e.id""", (exp_id,)):
        out |= {(r["session_id"], f) for f in json.loads(r["audio_files"])}
    return out


def _norm_ar(t: str) -> str:
    t = unicodedata.normalize("NFKC", t or "").casefold()
    t = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", t)
    t = re.sub(r"[أإآٱ]", "ا", t).replace("ة", "ه").replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]|_", " ", t)).strip()


REVIEW_SIMILAR_ABOVE = 0.90     # the second reading says (almost) the same words: not worth a human look...
REVIEW_ALWAYS_BELOW = 0.70      # ...unless the first reading itself was very unsure


def _worth_reviewing(text: str, asr: dict) -> bool:
    """The device flags every note whose confidence is a bit low. The second reading is a weaker model, so when it agrees with
    the text (ignoring punctuation, hamza, taa marbuta, vowel marks) the flag is just noise. Only show it when the two disagree,
    or when there is no second reading, or the confidence is very low."""
    alt = (asr.get("alternative") or {}).get("text")
    conf = asr.get("confidence")
    if not alt or (isinstance(conf, (int, float)) and conf < REVIEW_ALWAYS_BELOW):
        return True
    return difflib.SequenceMatcher(None, _norm_ar(text), _norm_ar(alt)).ratio() < REVIEW_SIMILAR_ABOVE


def serialize_note(db: Database, n, user_id: int, owner_id: int, audio_files: set[tuple[str, str]] | None = None) -> dict:
    author = db.one("SELECT * FROM users WHERE id=?", (n["author_id"],))
    meta = json.loads(n["meta"] or "{}")
    if audio_files is None:
        audio_files = audio_files_of(db, n["experiment_id"])
    first_session = (db.one("SELECT session_id FROM experiments WHERE id=?", (n["experiment_id"],)) or {"session_id": None})["session_id"]
    asr = meta.get("asr")
    if asr and asr.get("needs_review"):
        if n["text_source"] == "human":                                          # a person already corrected it: nothing left to review
            asr = {**asr, "needs_review": False}
        elif not _worth_reviewing(n["text"], asr):
            asr = {**asr, "needs_review": False}
    return {"id": n["id"], "text": n["text"], "kind": n["kind"], "source": n["source"], "text_source": n["text_source"],
            "time_label": n["time_label"], "created_at": n["created_at"], "updated_at": n["updated_at"],
            "author": public(author, include_email=False) if author else None,
            "asr": asr, "speaker_check": meta.get("speaker_check"), "audio_file": meta.get("audio_file"),
            "has_audio": bool(meta.get("audio_file")) and (meta.get("session_id") or first_session, meta.get("audio_file")) in audio_files,
            "can_edit": n["author_id"] == user_id or owner_id == user_id}


def _team_of(db: Database, e) -> dict | None:
    if not e["team_id"]:
        return None
    t = db.one("SELECT id, name FROM teams WHERE id=?", (e["team_id"],))
    return {"id": str(t["id"]), "name": t["name"]} if t else None


def serialize(db: Database, e, user_id: int, with_notes: bool = False) -> dict:
    owner = db.one("SELECT * FROM users WHERE id=?", (e["owner_id"],))
    note_count = db.one("SELECT COUNT(*) AS n FROM notes WHERE experiment_id=?", (e["id"],))["n"]
    d = {"id": str(e["id"]), "code": e["code"], "title": e["title"], "summary": e["summary"], "status": e["status"],
         "duration": fmt_duration(e["duration_sec"]), "duration_sec": e["duration_sec"], "originality": e["originality"],
         "tags": json.loads(e["tags"]), "color": e["color"], "created_at": e["created_at"], "updated_at": e["updated_at"],
         "role": "owner" if e["owner_id"] == user_id else "editor",
         "owner": public(owner, include_email=False), "collaborators": _people(db, e["id"]), "note_count": note_count,
         "session_id": e["session_id"], "ai_status": e["ai_status"], "team": _team_of(db, e)}
    # the "trace" the cards draw: when each note happened and its kind (last 40), plus how many of each kind
    marks = db.all("""SELECT created_at, kind, time_label FROM notes WHERE experiment_id=? ORDER BY created_at DESC, id DESC LIMIT 40""", (e["id"],))
    d["trace"] = [{"at": m["created_at"], "kind": m["kind"], "time_label": m["time_label"]} for m in reversed(marks)]
    counts = {r["kind"]: r["n"] for r in db.all("SELECT kind, COUNT(*) AS n FROM notes WHERE experiment_id=? GROUP BY kind", (e["id"],))}
    d["kind_counts"] = {k: counts.get(k, 0) for k in NOTE_KINDS}
    if with_notes:
        rows = db.all("SELECT * FROM notes WHERE experiment_id=? ORDER BY created_at, id", (e["id"],))
        files = audio_files_of(db, e["id"])
        d["notes"] = [serialize_note(db, n, user_id, e["owner_id"], files) for n in rows]
    return d


# ------------------------------------------------------------ experiments
def list_experiments(db: Database, user_id: int, status: str | None = None, q: str = "", sort: str = "newest") -> list[dict]:
    rows = db.all(f"""SELECT e.* FROM experiments e WHERE {VISIBLE} ORDER BY e.updated_at DESC, e.id DESC""", (user_id, user_id, user_id))
    out = []
    for e in rows:
        if status and status != "All" and e["status"] != status:
            continue
        hay = f"{e['title']} {e['summary']} {e['code']} {' '.join(json.loads(e['tags']))}".lower()
        if q and q.lower() not in hay:
            continue
        out.append(serialize(db, e, user_id))
    if sort == "oldest":
        out.reverse()
    return out


def get_experiment(db: Database, exp_id: int, user_id: int) -> dict:
    require(db, exp_id, user_id)
    return serialize(db, db.one("SELECT * FROM experiments WHERE id=?", (exp_id,)), user_id, with_notes=True)


def _clean_title(title: str) -> str:
    title = (title or "").strip()
    if not title or len(title) > 160:
        raise Invalid("title is required (max 160 characters)")
    return title


def _clean_tags(tags) -> list[str]:
    if tags is None:
        return []
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        raise Invalid("tags must be a list of strings")
    return [t.strip()[:30] for t in tags if t.strip()][:12]


def _check_team(db: Database, team_id, user_id: int) -> int:
    """Sharing with a team needs you to be in it (any role)."""
    try:
        tid = int(team_id)
    except (TypeError, ValueError):
        raise Invalid("team_id must be a team id") from None
    if not db.one("SELECT 1 FROM team_members WHERE team_id=? AND user_id=?", (tid, user_id)):
        raise NotFound("no such team")
    return tid


def create_experiment(db: Database, user_id: int, title: str, summary: str = "", tags=None, *, code: str | None = None,
                      status: str = "Active", originality: int = 50, duration_sec: float = 0, color: str | None = None,
                      session_id: str | None = None, created_at: str | None = None, team_id: int | None = None) -> int:
    title = _clean_title(title)
    if team_id is not None:
        _check_team(db, team_id, user_id)
    if status not in STATUSES:
        raise Invalid(f"status must be one of {', '.join(STATUSES)}")
    ts = created_at or iso()
    with db.tx() as c:
        eid = c.execute("""INSERT INTO experiments (owner_id, code, title, summary, status, duration_sec, originality, tags, color,
                           session_id, created_at, updated_at, team_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (user_id, code or "EXP-?", title, (summary or "").strip()[:1000], status, duration_sec, int(originality),
                         json.dumps(_clean_tags(tags), ensure_ascii=False), color or "mint", session_id, ts, ts, team_id)).lastrowid
        if code is None:
            c.execute("UPDATE experiments SET code=?, color=? WHERE id=?", (f"EXP-{eid}", color or COLORS[eid % len(COLORS)], eid))
    return eid


def update_experiment(db: Database, exp_id: int, user_id: int, patch: dict) -> dict:
    role = require(db, exp_id, user_id)
    sets, args = [], []
    if "status" in patch:
        if patch["status"] not in STATUSES:
            raise Invalid(f"status must be one of {', '.join(STATUSES)}")
        sets.append("status=?"); args.append(patch["status"])
    for field in ("title", "summary", "tags"):
        if field in patch:
            if role != "owner":
                raise Forbidden("only the owner can edit the title, summary and tags")
            if field == "title":
                sets.append("title=?"); args.append(_clean_title(patch["title"]))
            elif field == "summary":
                sets.append("summary=?"); args.append(str(patch["summary"]).strip()[:1000])
            else:
                sets.append("tags=?"); args.append(json.dumps(_clean_tags(patch["tags"]), ensure_ascii=False))
    if "team_id" in patch:
        if role != "owner":
            raise Forbidden("only the owner can share the experiment with a team")
        sets.append("team_id=?"); args.append(None if patch["team_id"] in (None, "") else _check_team(db, patch["team_id"], user_id))
    if not sets:
        raise Invalid("nothing to update")
    with db.tx() as c:
        c.execute(f"UPDATE experiments SET {', '.join(sets)}, updated_at=? WHERE id=?", (*args, iso(), exp_id))
    if "status" in patch:
        notify_members(db, exp_id, user_id, "status_changed", f"changed the status to {patch['status']}")
    return serialize(db, db.one("SELECT * FROM experiments WHERE id=?", (exp_id,)), user_id)


def delete_experiment(db: Database, exp_id: int, user_id: int, audio_root=None) -> None:
    """Owner only. Notes, collaborators and notifications go with it (cascade), and so do the recordings it came from."""
    require(db, exp_id, user_id, owner_only=True)
    rec = db.all("SELECT owner_id, session_id FROM sessions WHERE experiment_id=?", (exp_id,))
    db.run("DELETE FROM sessions WHERE experiment_id=?", (exp_id,))
    db.run("DELETE FROM experiments WHERE id=?", (exp_id,))
    if audio_root is not None:
        from services import storage
        for r in rec:
            storage.delete_session_audio(audio_root, r["owner_id"], r["session_id"])


def touch(db: Database, exp_id: int) -> None:
    db.run("UPDATE experiments SET updated_at=? WHERE id=?", (iso(), exp_id))


# ------------------------------------------------------------------- notes
def _clean_text(text) -> str:
    text = (text or "").strip() if isinstance(text, str) else ""
    if not text:
        raise Invalid("the note is empty")
    if len(text) > MAX_NOTE_CHARS:
        raise Invalid(f"the note is longer than {MAX_NOTE_CHARS} characters")
    return text


def add_note(db: Database, exp_id: int, user_id: int, text, kind: str = "observation", *, source: str = "manual",
             text_source: str = "human", time_label: str | None = None, meta: dict | None = None, notify: bool = True) -> dict:
    require(db, exp_id, user_id)
    text = _clean_text(text)
    if kind not in NOTE_KINDS:
        raise Invalid(f"kind must be one of {', '.join(NOTE_KINDS)}")
    ts = iso()
    with db.tx() as c:
        nid = c.execute("""INSERT INTO notes (experiment_id, author_id, text, kind, source, text_source, time_label, meta, created_at, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)""", (exp_id, user_id, text, kind, source, text_source, time_label,
                                                             json.dumps(meta or {}, ensure_ascii=False), ts, ts)).lastrowid
        c.execute("UPDATE experiments SET updated_at=? WHERE id=?", (ts, exp_id))
    if notify:
        notify_members(db, exp_id, user_id, "note_added", "added a note", note_id=nid)
    return serialize_note(db, db.one("SELECT * FROM notes WHERE id=?", (nid,)), user_id, db.one("SELECT owner_id FROM experiments WHERE id=?", (exp_id,))["owner_id"])


def _note_for(db: Database, note_id: int, user_id: int):
    n = db.one("SELECT * FROM notes WHERE id=?", (note_id,))
    if n is None or role_of(db, n["experiment_id"], user_id) is None:
        raise NotFound("no such note")
    return n


def update_note(db: Database, note_id: int, user_id: int, patch: dict) -> dict:
    n = _note_for(db, note_id, user_id)
    owner_id = db.one("SELECT owner_id FROM experiments WHERE id=?", (n["experiment_id"],))["owner_id"]
    if n["author_id"] != user_id and owner_id != user_id:
        raise Forbidden("only the author or the experiment owner can edit this note")
    sets, args = [], []
    if "text" in patch:
        sets += ["text=?", "text_source='human'"]; args.append(_clean_text(patch["text"]))
    if "kind" in patch:
        if patch["kind"] not in NOTE_KINDS:
            raise Invalid(f"kind must be one of {', '.join(NOTE_KINDS)}")
        sets.append("kind=?"); args.append(patch["kind"])
    if not sets:
        raise Invalid("nothing to update")
    ts = iso()
    with db.tx() as c:
        c.execute(f"UPDATE notes SET {', '.join(sets)}, updated_at=? WHERE id=?", (*args, ts, note_id))
        c.execute("UPDATE experiments SET updated_at=? WHERE id=?", (ts, n["experiment_id"]))
    notify_members(db, n["experiment_id"], user_id, "note_updated", "updated a note", note_id=note_id)
    return serialize_note(db, db.one("SELECT * FROM notes WHERE id=?", (note_id,)), user_id, owner_id)


def delete_note(db: Database, note_id: int, user_id: int) -> None:
    n = _note_for(db, note_id, user_id)
    owner_id = db.one("SELECT owner_id FROM experiments WHERE id=?", (n["experiment_id"],))["owner_id"]
    if n["author_id"] != user_id and owner_id != user_id:
        raise Forbidden("only the author or the experiment owner can delete this note")
    db.run("DELETE FROM notes WHERE id=?", (note_id,))
    touch(db, n["experiment_id"])


# ----------------------------------------------------------- collaborators
def add_collaborator(db: Database, exp_id: int, user_id: int, target) -> dict:
    require(db, exp_id, user_id)
    if target["id"] == user_id:
        raise Invalid("you are already part of this experiment")
    exp = db.one("SELECT * FROM experiments WHERE id=?", (exp_id,))
    if target["id"] == exp["owner_id"]:
        raise Invalid("this person owns the experiment")
    if db.one("SELECT 1 FROM collaborators WHERE experiment_id=? AND user_id=?", (exp_id, target["id"])):
        raise Invalid("this person is already added")
    db.run("INSERT INTO collaborators (experiment_id, user_id, added_by, created_at) VALUES (?,?,?,?)", (exp_id, target["id"], user_id, iso()))
    touch(db, exp_id)
    _notify_one(db, target["id"], user_id, exp_id, "collaborator_added", "added you to an experiment")
    return public(target, include_email=False)


def remove_collaborator(db: Database, exp_id: int, user_id: int, public_id: str) -> None:
    require(db, exp_id, user_id, owner_only=True)
    row = db.one("SELECT id FROM users WHERE public_id=?", (public_id.upper(),))
    if row is None or not db.one("SELECT 1 FROM collaborators WHERE experiment_id=? AND user_id=?", (exp_id, row["id"])):
        raise NotFound("this person is not a collaborator")
    db.run("DELETE FROM collaborators WHERE experiment_id=? AND user_id=?", (exp_id, row["id"]))


# ----------------------------------------------------------- notifications
def _notify_one(db: Database, recipient_id: int, actor_id: int, exp_id: int, kind: str, message: str, note_id: int | None = None) -> None:
    db.run("""INSERT INTO notifications (user_id, actor_id, experiment_id, note_id, kind, message, created_at) VALUES (?,?,?,?,?,?,?)""",
           (recipient_id, actor_id, exp_id, note_id, kind, message, iso()))


def notify_user(db: Database, recipient_id: int, actor_id: int, kind: str, message: str) -> None:
    """A notification that is not about one experiment (e.g. being added to a team)."""
    db.run("""INSERT INTO notifications (user_id, actor_id, experiment_id, note_id, kind, message, created_at) VALUES (?,?,NULL,NULL,?,?,?)""",
           (recipient_id, actor_id, kind, message, iso()))


def notify_members(db: Database, exp_id: int, actor_id: int, kind: str, message: str, note_id: int | None = None) -> int:
    """Everyone in the experiment except the person who did it."""
    exp = db.one("SELECT owner_id FROM experiments WHERE id=?", (exp_id,))
    if exp is None:
        return 0
    ids = {exp["owner_id"]} | {r["user_id"] for r in db.all("SELECT user_id FROM collaborators WHERE experiment_id=?", (exp_id,))}
    ids |= {r["user_id"] for r in db.all("""SELECT m.user_id FROM team_members m JOIN experiments e ON e.team_id=m.team_id WHERE e.id=?""", (exp_id,))}
    ids.discard(actor_id)
    for rid in ids:
        _notify_one(db, rid, actor_id, exp_id, kind, message, note_id)
    return len(ids)


def serialize_notification(db: Database, n) -> dict:
    actor = db.one("SELECT * FROM users WHERE id=?", (n["actor_id"],)) if n["actor_id"] else None
    exp = db.one("SELECT id, title FROM experiments WHERE id=?", (n["experiment_id"],)) if n["experiment_id"] else None
    return {"id": n["id"], "kind": n["kind"], "message": n["message"], "created_at": n["created_at"], "read": n["read_at"] is not None,
            "actor": public(actor, include_email=False) if actor else None,
            "experiment": {"id": str(exp["id"]), "title": exp["title"]} if exp else None, "note_id": n["note_id"]}


def list_notifications(db: Database, user_id: int, limit: int = 30, unread_only: bool = False) -> dict:
    where = "user_id=?" + (" AND read_at IS NULL" if unread_only else "")
    rows = db.all(f"SELECT * FROM notifications WHERE {where} ORDER BY id DESC LIMIT ?", (user_id, limit))
    unread = db.one("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL", (user_id,))["n"]
    return {"unread_count": unread, "items": [serialize_notification(db, n) for n in rows]}


def mark_read(db: Database, user_id: int, ids: list[int] | None) -> int:
    with db.tx() as c:
        if ids is None:
            cur = c.execute("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", (iso(), user_id))
        else:
            marks = ",".join("?" * len(ids)) or "NULL"
            cur = c.execute(f"UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL AND id IN ({marks})", (iso(), user_id, *ids))
        return cur.rowcount


# -------------------------------------------------------------------- stats
def stats(db: Database, user_id: int) -> dict:
    exps = list_experiments(db, user_id)
    ids = [int(e["id"]) for e in exps]
    week_ago, two_weeks = iso(now() - timedelta(days=7)), iso(now() - timedelta(days=14))
    marks = ",".join("?" * len(ids)) or "NULL"
    this_week = db.one(f"SELECT COUNT(*) AS n FROM notes WHERE experiment_id IN ({marks}) AND created_at>=?", (*ids, week_ago))["n"]
    last_week = db.one(f"SELECT COUNT(*) AS n FROM notes WHERE experiment_id IN ({marks}) AND created_at>=? AND created_at<?", (*ids, two_weeks, week_ago))["n"]
    analysed, review, quality, latest = 0, 0, [], None
    for e in exps:
        row = db.one("SELECT ai_json, ai_updated_at FROM experiments WHERE id=?", (int(e["id"]),))
        if row["ai_json"]:
            analysed += 1
            res = json.loads(row["ai_json"])
            review += len(res.get("notes_to_review", []))
            quality.append(res.get("documentation_quality", {}).get("score", 0))
            if latest is None or (row["ai_updated_at"] or "") > latest["at"]:
                latest = {"at": row["ai_updated_at"] or "", "experiment_id": e["id"], "title": e["title"], "summary": res.get("summary", "")}
    return {"active_threads": sum(1 for e in exps if e["status"] == "Active"), "total_threads": len(exps),
            "notes_this_week": this_week, "notes_last_week": last_week,
            "avg_originality": round(sum(e["originality"] for e in exps) / len(exps)) if exps else 0,
            "insights": {"experiments_analyzed": analysed, "notes_to_review": review,
                         "avg_documentation_quality": round(sum(quality) / len(quality)) if quality else None,
                         "latest": {k: v for k, v in latest.items() if k != "at"} if latest else None}}
