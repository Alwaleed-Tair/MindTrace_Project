"""Users, login sessions (cookie) and API tokens (laptop bridge)."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from core import security
from core.db import Database

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PUBLIC_ID_RE = re.compile(r"^MT-[A-Z0-9]{8}$")


class UserError(ValueError):
    pass


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None = None) -> str:
    return (dt or now()).isoformat(timespec="seconds")


def initials(name: str) -> str:
    words = [w for w in re.split(r"\s+", re.sub(r"^(dr|prof)\.?\s+", "", name.strip(), flags=re.IGNORECASE)) if w]
    return "".join(w[0] for w in words[:2]).upper() or "?"


def public(row, include_email: bool = True) -> dict:
    d = {"id": row["public_id"], "name": row["name"], "lab": row["lab"], "initials": initials(row["name"])}
    if include_email:
        d["email"] = row["email"]
    return d


def create_user(db: Database, name: str, email: str, password: str, lab: str = "", is_demo: bool = False):
    name, email, lab = name.strip(), email.strip().lower(), lab.strip()
    if not name or len(name) > 80:
        raise UserError("name is required (max 80 characters)")
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise UserError("enter a valid email address")
    if len(password) < 8 or len(password) > 200:
        raise UserError("password must be 8 to 200 characters")
    if db.one("SELECT 1 FROM users WHERE email=?", (email,)):
        raise UserError("an account with this email already exists")
    for _ in range(10):                                           # public ids are random: retry on the (unlikely) clash
        pid = security.new_public_id()
        if not db.one("SELECT 1 FROM users WHERE public_id=?", (pid,)):
            break
    uid = db.run("INSERT INTO users (public_id, email, name, lab, password_hash, is_demo, created_at) VALUES (?,?,?,?,?,?,?)",
                 (pid, email, name, lab[:80], security.hash_password(password), int(is_demo), iso()))
    return db.one("SELECT * FROM users WHERE id=?", (uid,))


def authenticate(db: Database, email: str, password: str):
    row = db.one("SELECT * FROM users WHERE email=?", (email.strip().lower(),))
    # always run one scrypt so "unknown email" and "wrong password" take the same time
    ok = security.verify_password(password, row["password_hash"] if row else "scrypt$16384$8$1$AAAA$AAAA")
    return row if (row and ok) else None


def find_by_identifier(db: Database, identifier: str):
    """A user by exact email or by MT-XXXXXXXX id (case-insensitive). Never a partial match."""
    q = identifier.strip()
    if not q:
        return None
    if "@" in q:
        return db.one("SELECT * FROM users WHERE email=?", (q.lower(),))
    if PUBLIC_ID_RE.match(q.upper()):
        return db.one("SELECT * FROM users WHERE public_id=?", (q.upper(),))
    return None


# ----------------------------------------------------------- login sessions
def start_session(db: Database, user_id: int, days: int) -> str:
    token = security.new_token()
    created = now()
    db.run("INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
           (security.token_hash(token), user_id, iso(created), iso(created + timedelta(days=days))))
    return token


def user_for_session(db: Database, token: str):
    h = security.token_hash(token)
    row = db.one("""SELECT u.*, s.expires_at AS _exp FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?""", (h,))
    if not row:
        return None
    if row["_exp"] <= iso():
        db.run("DELETE FROM auth_sessions WHERE token_hash=?", (h,))
        return None
    return row


def end_session(db: Database, token: str) -> None:
    db.run("DELETE FROM auth_sessions WHERE token_hash=?", (security.token_hash(token),))


def purge_expired(db: Database) -> None:
    db.run("DELETE FROM auth_sessions WHERE expires_at <= ?", (iso(),))


# ---------------------------------------------------------------- api tokens
def create_api_token(db: Database, user_id: int, label: str) -> str:
    token = security.new_token("mt_")
    db.run("INSERT INTO api_tokens (token_hash, user_id, label, created_at) VALUES (?,?,?,?)",
           (security.token_hash(token), user_id, label.strip()[:60], iso()))
    return token


def user_for_api_token(db: Database, token: str):
    h = security.token_hash(token)
    row = db.one("SELECT u.*, t.id AS _tid FROM api_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=?", (h,))
    if row:
        db.run("UPDATE api_tokens SET last_used_at=? WHERE id=?", (iso(), row["_tid"]))
    return row


def recent_collaborators(db: Database, user_id: int, limit: int = 8) -> list[dict]:
    # newest first by insertion order (rowid): timestamps only have one-second resolution, so they tie
    rows = db.all("""SELECT u.*, MAX(c.rowid) AS last_added FROM collaborators c JOIN users u ON u.id=c.user_id
                     WHERE c.added_by=? AND u.id<>? GROUP BY u.id ORDER BY last_added DESC LIMIT ?""", (user_id, user_id, limit))
    return [public(r) for r in rows]
