from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict

from api.deps import current_user, db, settings
from services import experiments as ex
from services import ai as ai_service
from services import insights as insights_service
from services import mentions
from services import storage
from services import users as users_service

router = APIRouter(prefix="/api", tags=["experiments"])


class ExperimentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    summary: str = ""
    tags: list[str] | None = None
    team_id: str | None = None           # share with one of your teams from the start


class ExperimentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str | None = None
    title: str | None = None
    summary: str | None = None
    tags: list[str] | None = None
    team_id: str | None = None           # null = stop sharing with the team


class NoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str
    kind: str = "observation"


class NotePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str | None = None
    kind: str | None = None


class CollaboratorIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identifier: str          # an email address or an MT-XXXXXXXX id


def _id(raw: str) -> int:
    if not raw.isdigit():
        raise HTTPException(404, "no such experiment")
    return int(raw)


@router.get("/experiments")
def list_experiments(request: Request, status: str | None = Query(None), q: str = Query("", max_length=100),
                     sort: str = Query("newest", pattern="^(newest|oldest)$"), user=Depends(current_user)):
    if status and status not in (*ex.STATUSES, "All"):
        raise HTTPException(422, f"status must be one of All, {', '.join(ex.STATUSES)}")
    return {"items": ex.list_experiments(db(request), user["id"], status, q, sort)}


@router.post("/experiments", status_code=201)
def create_experiment(body: ExperimentIn, request: Request, user=Depends(current_user)):
    d = db(request)
    eid = ex.create_experiment(d, user["id"], body.title, body.summary or "A new research thread, ready to be observed.", body.tags or ["New thread"],
                               team_id=body.team_id or None)
    return ex.get_experiment(d, eid, user["id"])


@router.get("/experiments/{exp_id}")
def get_experiment(exp_id: str, request: Request, user=Depends(current_user)):
    return ex.get_experiment(db(request), _id(exp_id), user["id"])


@router.patch("/experiments/{exp_id}")
def patch_experiment(exp_id: str, body: ExperimentPatch, request: Request, user=Depends(current_user)):
    d = db(request)
    ex.update_experiment(d, _id(exp_id), user["id"], body.model_dump(exclude_unset=True))
    return ex.get_experiment(d, _id(exp_id), user["id"])


@router.delete("/experiments/{exp_id}", status_code=204)
def delete_experiment(exp_id: str, request: Request, user=Depends(current_user)):
    ex.delete_experiment(db(request), _id(exp_id), user["id"], settings(request).audio_dir)


@router.get("/experiments/{exp_id}/members")
def members(exp_id: str, request: Request, user=Depends(current_user)):
    """The people who can be @mentioned in this experiment's notes."""
    d = db(request)
    ex.require(d, _id(exp_id), user["id"])
    return {"items": mentions.member_list(d, _id(exp_id))}


# ------------------------------------------------------------------ notes
@router.post("/experiments/{exp_id}/notes", status_code=201)
def add_note(exp_id: str, body: NoteIn, request: Request, user=Depends(current_user)):
    return ex.add_note(db(request), _id(exp_id), user["id"], body.text, body.kind)


@router.patch("/notes/{note_id}")
def patch_note(note_id: int, body: NotePatch, request: Request, user=Depends(current_user)):
    return ex.update_note(db(request), note_id, user["id"], body.model_dump(exclude_unset=True))


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, request: Request, user=Depends(current_user)):
    ex.delete_note(db(request), note_id, user["id"])


@router.get("/experiments/{exp_id}/notes/{note_id}/audio")
def note_audio(exp_id: str, note_id: int, request: Request, user=Depends(current_user)):
    """The recorded audio of a note, for the owner and collaborators (the file lives in the owner's recording)."""
    d, eid = db(request), _id(exp_id)
    ex.require(d, eid, user["id"])
    n = d.one("SELECT meta FROM notes WHERE id=? AND experiment_id=?", (note_id, eid))
    e = d.one("SELECT owner_id, session_id FROM experiments WHERE id=?", (eid,))
    meta = json.loads(n["meta"] or "{}") if n else {}
    name, sid = meta.get("audio_file"), meta.get("session_id") or e["session_id"]
    p = storage.audio_path(settings(request).audio_dir, e["owner_id"], sid or "", name) if name and sid else None
    if p is None:
        raise HTTPException(404, "no audio for this note")
    return FileResponse(p, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})


# ----------------------------------------------------------- collaborators
@router.post("/experiments/{exp_id}/collaborators", status_code=201)
def add_collaborator(exp_id: str, body: CollaboratorIn, request: Request, user=Depends(current_user)):
    d, eid = db(request), _id(exp_id)
    ex.require(d, eid, user["id"])
    target = users_service.find_by_identifier(d, body.identifier)
    if target is None:
        raise HTTPException(404, "no user with that email or ID")
    person = ex.add_collaborator(d, eid, user["id"], target)
    return {"collaborator": person, "experiment": ex.serialize(d, d.one("SELECT * FROM experiments WHERE id=?", (eid,)), user["id"])}


@router.delete("/experiments/{exp_id}/collaborators/{public_id}", status_code=204)
def remove_collaborator(exp_id: str, public_id: str, request: Request, user=Depends(current_user)):
    ex.remove_collaborator(db(request), _id(exp_id), user["id"], public_id)


# ---------------------------------------------------------------- insights
@router.get("/experiments/{exp_id}/insights")
def get_insights(exp_id: str, request: Request, language: str | None = None, user=Depends(current_user)):
    d, eid = db(request), _id(exp_id)
    ex.require(d, eid, user["id"])
    return {**insights_service.get(d, eid, language), "ai_configured": settings(request).ai_configured}


@router.post("/experiments/{exp_id}/insights", status_code=202)
def refresh_insights(exp_id: str, background: BackgroundTasks, request: Request, language: str | None = None, user=Depends(current_user)):
    d, st, eid = db(request), settings(request), _id(exp_id)
    ex.require(d, eid, user["id"])
    if not st.ai_configured:
        raise HTTPException(503, "DEEPSEEK_API_KEY is not set on the server")
    insights_service.set_state(d, eid, "queued")
    background.add_task(insights_service.run, d, st, eid, request.app.state.ai_client, language if language in ("ar", "en") else None)
    return {"status": "queued"}


@router.post("/experiments/{exp_id}/insights/translate")
def translate_insights(exp_id: str, request: Request, language: str, user=Depends(current_user)):
    """Translate the texts of the existing analysis (one short call, then kept: switching language again costs nothing)."""
    d, st, eid = db(request), settings(request), _id(exp_id)
    ex.require(d, eid, user["id"])
    if language not in ("ar", "en"):
        raise HTTPException(422, "language must be ar or en")
    if not st.ai_configured:
        raise HTTPException(503, "DEEPSEEK_API_KEY is not set on the server")
    try:
        insights_service.translate(d, st, eid, language, request.app.state.ai_client)
    except ai_service.AiError as exc:
        raise HTTPException(502, str(exc))
    return {**insights_service.get(d, eid, language), "ai_configured": True}
