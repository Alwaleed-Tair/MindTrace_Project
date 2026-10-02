from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from api.deps import current_user, db
from services import teams as teams_service
from services import users as users_service

router = APIRouter(prefix="/api", tags=["teams"])


class TeamIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str


class MemberIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identifier: str          # an email address or an MT-XXXXXXXX id
    role: str = "member"


class RoleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str


def _id(raw: str) -> int:
    if not raw.isdigit():
        raise HTTPException(404, "no such team")
    return int(raw)


@router.get("/teams")
def list_teams(request: Request, user=Depends(current_user)):
    return {"items": teams_service.list_teams(db(request), user["id"])}


@router.post("/teams", status_code=201)
def create_team(body: TeamIn, request: Request, user=Depends(current_user)):
    return teams_service.create_team(db(request), user["id"], body.name)


@router.get("/teams/{team_id}")
def get_team(team_id: str, request: Request, user=Depends(current_user)):
    return teams_service.get_team(db(request), _id(team_id), user["id"])


@router.patch("/teams/{team_id}")
def rename_team(team_id: str, body: TeamIn, request: Request, user=Depends(current_user)):
    return teams_service.rename_team(db(request), _id(team_id), user["id"], body.name)


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(team_id: str, request: Request, user=Depends(current_user)):
    teams_service.delete_team(db(request), _id(team_id), user["id"])


@router.post("/teams/{team_id}/members", status_code=201)
def add_member(team_id: str, body: MemberIn, request: Request, user=Depends(current_user)):
    d, tid = db(request), _id(team_id)
    teams_service.get_team(d, tid, user["id"])          # a stranger learns nothing, not even whether the email exists
    return teams_service.add_member(d, tid, user["id"], users_service.find_by_identifier(d, body.identifier), body.role)


@router.patch("/teams/{team_id}/members/{public_id}")
def set_role(team_id: str, public_id: str, body: RoleIn, request: Request, user=Depends(current_user)):
    return teams_service.set_role(db(request), _id(team_id), user["id"], public_id, body.role)


@router.delete("/teams/{team_id}/members/{public_id}", status_code=204)
def remove_member(team_id: str, public_id: str, request: Request, user=Depends(current_user)):
    teams_service.remove_member(db(request), _id(team_id), user["id"], public_id)


@router.post("/teams/{team_id}/invite")
def reset_invite(team_id: str, request: Request, user=Depends(current_user)):
    return teams_service.reset_invite(db(request), _id(team_id), user["id"])


@router.get("/invites/{token}")
def preview_invite(token: str, request: Request, user=Depends(current_user)):
    return teams_service.preview_invite(db(request), token, user["id"])


@router.post("/invites/{token}/accept")
def accept_invite(token: str, request: Request, user=Depends(current_user)):
    return teams_service.accept_invite(db(request), token, user["id"])
