"""@mentions inside notes.

A mention is stored in the note text as @{MT-XXXXXXXX} (the person's public id), so renaming someone never breaks it.
Only people in the experiment (owner, collaborators, members of its team) can be mentioned; any other id stays plain text.
"""
import re

from core.db import Database
from services.users import public

TOKEN_RE = re.compile(r"@\{(MT-[A-Z0-9]{8})\}")


def members(db: Database, exp_id: int) -> list:
    """Everyone in the experiment, owner first, each person once."""
    rows = db.all("""SELECT u.*, 0 AS rank, e.created_at AS since FROM experiments e JOIN users u ON u.id=e.owner_id WHERE e.id=?
                     UNION ALL SELECT u.*, 1, c.created_at FROM collaborators c JOIN users u ON u.id=c.user_id WHERE c.experiment_id=?
                     UNION ALL SELECT u.*, 2, m.joined_at FROM team_members m JOIN experiments e ON e.team_id=m.team_id
                               JOIN users u ON u.id=m.user_id WHERE e.id=?
                     ORDER BY rank, since""", (exp_id, exp_id, exp_id))
    seen, out = set(), []
    for r in rows:
        if r["id"] not in seen:
            seen.add(r["id"]); out.append(r)
    return out


def member_list(db: Database, exp_id: int) -> list[dict]:
    """What the @ picker shows (no emails)."""
    owner = db.one("SELECT owner_id FROM experiments WHERE id=?", (exp_id,))["owner_id"]
    return [{**public(r, include_email=False), "role": "owner" if r["id"] == owner else "member"} for r in members(db, exp_id)]


def mentioned(db: Database, exp_id: int, text: str) -> list:
    """The experiment members mentioned in the text (user rows, in order, each once)."""
    ids = list(dict.fromkeys(TOKEN_RE.findall(text or "")))
    if not ids:
        return []
    by_pid = {r["public_id"]: r for r in members(db, exp_id)}
    return [by_pid[p] for p in ids if p in by_pid]


def render_plain(db: Database, text: str) -> str:
    """@{MT-...} -> @Name, for places that only take plain text (the AI, exports)."""
    def name(m):
        u = db.one("SELECT name FROM users WHERE public_id=?", (m.group(1),))
        return "@" + u["name"] if u else m.group(0)
    return TOKEN_RE.sub(name, text or "")
