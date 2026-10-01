"""INPUT of the platform: the recorder's session.json (+ audio). Authenticated with the laptop bridge's API token
(or a browser login); everything is stored under the caller."""
from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

from api.deps import current_user, db, settings
from schemas.session import SessionIn
from services import experiments as ex
from services import insights as insights_service
from services import sessions as repo
from services import storage

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", status_code=201)
async def post_session(request: Request, background: BackgroundTasks, user=Depends(current_user)):
    """Either `Content-Type: application/json` (the session.json as the body) or `multipart/form-data` with the field
    `session` (session.json) and any number of `files` (WAV; filename = its path in the session folder)."""
    st, d = settings(request), db(request)
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > st.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"upload larger than {st.max_upload_mb} MB")
    uploads: list[tuple[str, bytes]] = []
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        part = form.get("session")
        if part is None:
            raise HTTPException(422, "multipart upload needs a 'session' field with the session.json")
        raw_bytes = await part.read() if isinstance(part, StarletteUploadFile) else str(part).encode("utf-8")
        for key, value in form.multi_items():
            if key == "files" and isinstance(value, StarletteUploadFile):
                uploads.append((value.filename or "", await value.read()))
    else:
        raw_bytes = await request.body()
    try:
        raw = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"the session is not valid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise HTTPException(422, "the session must be a JSON object")
    try:
        s = SessionIn.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(422, [{"field": ".".join(map(str, e["loc"])), "problem": e["msg"]} for e in exc.errors()[:10]]) from exc
    try:
        for name, data in uploads:
            storage.save_audio(st.audio_dir, user["id"], s.session_id, name, data)
    except storage.BadAudioName as exc:
        raise HTTPException(422, str(exc)) from exc
    files = storage.list_audio(st.audio_dir, user["id"], s.session_id)
    existed, exp_id = repo.upsert(d, user["id"], raw, s, files)
    if st.ai_configured and st.ai_auto:
        insights_service.set_state(d, exp_id, "queued")
        background.add_task(insights_service.run, d, st, exp_id, request.app.state.ai_client)
        ai_status = "queued"
    else:
        ai_status = "disabled" if not st.ai_configured else "none"
        insights_service.set_state(d, exp_id, ai_status, error=None if st.ai_configured else "DEEPSEEK_API_KEY is not set")
    return {"session_id": s.session_id, "experiment_id": str(exp_id), "updated_existing": existed, "notes": len(s.notes),
            "audio_files": files, "ai_status": ai_status}


@router.get("")
def list_sessions(request: Request, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), user=Depends(current_user)):
    total, items = repo.list_sessions(db(request), user["id"], limit, offset)
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/{session_id}")
def get_session(session_id: str, request: Request, user=Depends(current_user)):
    row = repo.get_session(db(request), user["id"], session_id)
    if row is None:
        raise HTTPException(404, "no such session")
    return row


@router.get("/{session_id}/audio/{name:path}")
def get_audio(session_id: str, name: str, request: Request, user=Depends(current_user)):
    p = storage.audio_path(settings(request).audio_dir, user["id"], session_id, name) if repo.get_session(db(request), user["id"], session_id) else None
    if p is None:
        raise HTTPException(404, "no such audio file")
    return FileResponse(p, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})
