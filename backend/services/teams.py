"""Teams (a lab or research group). Everyone in a team sees, and can add notes to, the experiments shared with it.

Roles: owner (one per team, created it), supervisor (can add and remove members and reset the invite link), member.
A team member who is a stranger to an experiment gets the same "not found" as anyone else: only experiments shared with
the team are visible through it.
"""
from __future__ import annotations

import secrets
from datetime import timedelta

from core.db import Database
from services.experiments import Forbidden, Invalid, NotFound, notify_user, serialize
from services.users import iso, now, public

ROLES = ("owner", "supervisor", "member")
MAX_NAME = 80


def _clean_name(name) -> str:
    name = str(name or "").strip()
    if not name or len(name) > MAX_NAME:
        raise Invalid(f"team name is required (max {MAX_NAME} characters)")
    return name


def role_in(db: Database, team_id: int, user_id: int) -> str | None:
    row = db.one("SELECT role FROM team_members WHERE team_id=? AND user_id=?", (team_id, user_id))
    return row["role"] if row else None


def _require(db: Database, team_id: int, user_id: int, *roles: str) -> str:
    """The user's role in the team. Someone outside it gets NotFound: nothing about the team is revealed."""
    role = role_in(db, team_id, user_id)
    if role is None:
        raise NotFound("no such team")
    if roles and role not in roles:
        raise Forbidden("your role in this team cannot do this")
    return role


def _summary(db: Database, t, user_id: int) -> dict:
    role = role_in(db, t["id"], user_id)
    members = db.one("SELECT COUNT(*) AS n FROM team_members WHERE team_id=?", (t["id"],))["n"]
    exps = db.one("SELECT COUNT(*) AS n FROM experiments WHERE team_id=?", (t["id"],))["n"]
    return {"id": str(t["id"]), "name": t["name"], "role": role, "member_count": members, "experiment_count": exps,
            "created_at": t["created_at"]}


def list_teams(db: Database, user_id: int) -> list[dict]:
    rows = db.all("""SELECT t.* FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.user_id=? ORDER BY t.created_at, t.id""", (user_id,))
    return [_summary(db, t, user_id) for t in rows]


def create_team(db: Database, user_id: int, name) -> dict:
    name = _clean_name(name)
    ts = iso()
    with db.tx() as c:
        tid = c.execute("INSERT INTO teams (name, owner_id, invite_token, created_at) VALUES (?,?,?,?)",
                        (name, user_id, secrets.token_urlsafe(18), ts)).lastrowid
        c.execute("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?,?,?,?)", (tid, user_id, "owner", ts))
    return get_team(db, tid, user_id)


def get_team(db: Database, team_id: int, user_id: int) -> dict:
    role = _require(db, team_id, user_id)
    t = db.one("SELECT * FROM teams WHERE id=?", (team_id,))
    since = iso(now() - timedelta(days=14))
    members = []
    for m in db.all("""SELECT u.*, m.role, m.joined_at FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=?
                       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END, m.joined_at""", (team_id,)):
        notes = db.one("""SELECT COUNT(*) AS n FROM notes n JOIN experiments e ON e.id=n.experiment_id
                          WHERE e.team_id=? AND n.author_id=? AND n.created_at>=?""", (team_id, m["id"], since))["n"]
        owned = db.one("SELECT COUNT(*) AS n FROM experiments WHERE team_id=? AND owner_id=?", (team_id, m["id"]))["n"]
        members.append({**public(m, include_email=role in ("owner", "supervisor")), "role": m["role"], "joined_at": m["joined_at"],
                        "experiment_count": owned, "notes_14d": notes})
    exps = [serialize(db, e, user_id) for e in db.all("SELECT * FROM experiments WHERE team_id=? ORDER BY updated_at DESC, id DESC", (team_id,))]
    out = {**_summary(db, t, user_id), "members": members, "experiments": exps}
    if role in ("owner", "supervisor"):
        out["invite_token"] = t["invite_token"]
    return out


def rename_team(db: Database, team_id: int, user_id: int, name) -> dict:
    _require(db, team_id, user_id, "owner")
    db.run("UPDATE teams SET name=? WHERE id=?", (_clean_name(name), team_id))
    return get_team(db, team_id, user_id)


def delete_team(db: Database, team_id: int, user_id: int) -> None:
    """Owner only. The experiments stay with their owners; they are just no longer shared with the team."""
    _require(db, team_id, user_id, "owner")
    db.run("DELETE FROM teams WHERE id=?", (team_id,))


def add_member(db: Database, team_id: int, user_id: int, target, role: str = "member") -> dict:
    my_role = _require(db, team_id, user_id, "owner", "supervisor")
    if role not in ("supervisor", "member"):
        raise Invalid("role must be supervisor or member")
    if role == "supervisor" and my_role != "owner":
        raise Forbidden("only the team owner can add supervisors")
    if target is None:
        raise NotFound("no account with that email or ID")
    if role_in(db, team_id, target["id"]):
        raise Invalid("this person is already in the team")
    db.run("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?,?,?,?)", (team_id, target["id"], role, iso()))
    name = db.one("SELECT name FROM teams WHERE id=?", (team_id,))["name"]
    notify_user(db, target["id"], user_id, "team_added", f"added you to the team “{name}”")
    return get_team(db, team_id, user_id)


def set_role(db: Database, team_id: int, user_id: int, public_id: str, role: str) -> dict:
    _require(db, team_id, user_id, "owner")
    if role not in ("supervisor", "member"):
        raise Invalid("role must be supervisor or member")
    target = db.one("SELECT id FROM users WHERE public_id=?", (public_id.upper(),))
    current = role_in(db, team_id, target["id"]) if target else None
    if current is None:
        raise NotFound("this person is not in the team")
    if current == "owner":
        raise Invalid("the owner's role cannot change")
    db.run("UPDATE team_members SET role=? WHERE team_id=? AND user_id=?", (role, team_id, target["id"]))
    return get_team(db, team_id, user_id)


def remove_member(db: Database, team_id: int, user_id: int, public_id: str) -> None:
    """Anyone can leave. The owner and supervisors can remove members; only the owner can remove a supervisor.
    The owner cannot leave (delete the team instead)."""
    my_role = _require(db, team_id, user_id)
    target = db.one("SELECT id FROM users WHERE public_id=?", (public_id.upper(),))
    their_role = role_in(db, team_id, target["id"]) if target else None
    if their_role is None:
        raise NotFound("this person is not in the team")
    if their_role == "owner":
        raise Invalid("the owner cannot leave the team; delete it instead")
    if target["id"] != user_id:
        if my_role == "member" or (their_role == "supervisor" and my_role != "owner"):
            raise Forbidden("your role in this team cannot remove this person")
    db.run("DELETE FROM team_members WHERE team_id=? AND user_id=?", (team_id, target["id"]))


def reset_invite(db: Database, team_id: int, user_id: int) -> dict:
    """A new invite link; the old one stops working."""
    _require(db, team_id, user_id, "owner", "supervisor")
    db.run("UPDATE teams SET invite_token=? WHERE id=?", (secrets.token_urlsafe(18), team_id))
    return get_team(db, team_id, user_id)


def _team_for_invite(db: Database, token: str):
    t = db.one("SELECT * FROM teams WHERE invite_token=?", (token,)) if token else None
    if t is None:
        raise NotFound("this invite link is not valid (it may have been reset)")
    return t


def preview_invite(db: Database, token: str, user_id: int) -> dict:
    t = _team_for_invite(db, token)
    owner = db.one("SELECT * FROM users WHERE id=?", (t["owner_id"],))
    members = db.one("SELECT COUNT(*) AS n FROM team_members WHERE team_id=?", (t["id"],))["n"]
    return {"team": {"id": str(t["id"]), "name": t["name"], "member_count": members}, "owner": public(owner, include_email=False),
            "already_member": role_in(db, t["id"], user_id) is not None}


def accept_invite(db: Database, token: str, user_id: int) -> dict:
    t = _team_for_invite(db, token)
    if role_in(db, t["id"], user_id) is None:
        db.run("INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?,?,?,?)", (t["id"], user_id, "member", iso()))
        for m in db.all("SELECT user_id FROM team_members WHERE team_id=? AND role IN ('owner','supervisor') AND user_id<>?", (t["id"], user_id)):
            notify_user(db, m["user_id"], user_id, "team_joined", f"joined the team “{t['name']}”")
    return get_team(db, t["id"], user_id)
