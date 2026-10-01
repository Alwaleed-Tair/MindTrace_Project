from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict

from api.deps import current_user, db, settings
from services import experiments as ex
from services import users as users_service

router = APIRouter(prefix="/api", tags=["people, notifications, stats"])


class ReadIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[int] | None = None          # omit (or null) = mark everything read


@router.get("/users/search")
def search_users(request: Request, q: str = Query("", max_length=254), user=Depends(current_user)):
    """Exact email or MT-XXXXXXXX id only (no browsing the user list). Empty list when nothing matches."""
    row = users_service.find_by_identifier(db(request), q)
    if row is None or row["id"] == user["id"]:
        return {"items": []}
    return {"items": [users_service.public(row)]}


@router.get("/collaborators/recent")
def recent_collaborators(request: Request, user=Depends(current_user)):
    return {"items": users_service.recent_collaborators(db(request), user["id"])}


@router.get("/notifications")
def notifications(request: Request, limit: int = Query(30, ge=1, le=100), unread: bool = Query(False), user=Depends(current_user)):
    return ex.list_notifications(db(request), user["id"], limit, unread)


@router.post("/notifications/read")
def read_notifications(body: ReadIn, request: Request, user=Depends(current_user)):
    return {"marked": ex.mark_read(db(request), user["id"], body.ids)}


@router.get("/stats")
def stats(request: Request, user=Depends(current_user)):
    return ex.stats(db(request), user["id"])


@router.post("/dev/simulate-collaborator-note")
def simulate_collaborator_note(request: Request, body: dict | None = None, user=Depends(current_user)):
    """TESTING ONLY (MINDTRACE_DEV_TOOLS=true): a made-up colleague joins one of your experiments and adds a note,
    which produces a real notification through the normal path."""
    if not settings(request).dev_tools:
        raise HTTPException(404, "not found")
    d = db(request)
    eid = (body or {}).get("experiment_id")
    if eid is None:
        row = d.one("SELECT id FROM experiments WHERE owner_id=? ORDER BY updated_at DESC LIMIT 1", (user["id"],))
        if row is None:
            raise HTTPException(422, "create an experiment first")
        eid = row["id"]
    eid = int(eid)
    ex.require(d, eid, user["id"])
    bot = d.one("SELECT * FROM users WHERE email='lina.mock@mindtrace.app'")
    if bot is None:
        bot = users_service.create_user(d, "Dr. Lina Haddad (mock)", "lina.mock@mindtrace.app", "mock-colleague-" + users_service.iso(), "Mock colleague")
    if ex.role_of(d, eid, bot["id"]) is None:
        d.run("INSERT INTO collaborators (experiment_id, user_id, added_by, created_at) VALUES (?,?,?,?)", (eid, bot["id"], user["id"], users_service.iso()))
    note = ex.add_note(d, eid, bot["id"], "Mock colleague note: the second run shows the same drift after 20 minutes.", "observation")
    return {"experiment_id": str(eid), "note": note}
