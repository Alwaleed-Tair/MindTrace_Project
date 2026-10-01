"""MindTrace platform backend: takes the laptop app's session.json (+ audio) as INPUT, stores it, serves it back
for the web UI, and asks DeepSeek for a review. Run:  uvicorn main:app --port 8000   (see ../README.md)."""
from __future__ import annotations

import json
import secrets
from pathlib import Path

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

from core.config import Settings
from core.db import Database
from schemas.session import SessionIn
from services import ai as ai_service
from services import sessions as repo
from services import storage

API_VERSION = "1.0.0"


def create_app(settings: Settings | None = None, ai_client: httpx.Client | None = None) -> FastAPI:
    st = settings or Settings()
    st.data_dir.mkdir(parents=True, exist_ok=True)
    db = Database(st.db_path)
    app = FastAPI(title="MindTrace platform API", version=API_VERSION)
    app.state.settings, app.state.db = st, db
    app.add_middleware(CORSMiddleware, allow_origins=st.cors_origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "X-API-Key"])

    def require_key(x_api_key: str | None = Header(default=None)) -> None:
        if st.api_key and not (x_api_key and secrets.compare_digest(x_api_key, st.api_key)):
            raise HTTPException(401, "missing or wrong X-API-Key")

    # ------------------------------------------------------------ background AI
    def run_ai(session_id: str) -> None:
        row = repo.get_session(db, session_id)
        if row is None:
            return
        stamp = row["updated_at"]
        repo.set_ai(db, session_id, "running")
        try:
            result = ai_service.analyze(st, row["session"], ai_client)
        except ai_service.AiError as exc:
            repo.set_ai(db, session_id, "failed", error=str(exc))
            return
        except Exception as exc:                                    # never leave a session stuck on "running"
            repo.set_ai(db, session_id, "failed", error=f"unexpected error: {exc.__class__.__name__}")
            return
        now = repo.get_session(db, session_id)
        if now is None or now["updated_at"] != stamp:              # the session was re-posted meanwhile: that run will redo it
            return
        repo.set_ai(db, session_id, "done", result=result)

    # ------------------------------------------------------------------ routes
    @app.get("/api/health")
    def health():
        return {"ok": True, "version": API_VERSION, "schema_version": 1, "ai_configured": st.ai_configured,
                "auth_required": bool(st.api_key)}

    @app.post("/api/sessions", status_code=201, dependencies=[Depends(require_key)])
    async def post_session(request: Request, background: BackgroundTasks):
        """INPUT of the platform. Either  Content-Type: application/json  (the session.json as body), or
        multipart/form-data with the field `session` (session.json) and any number of `files` (WAV, filename =
        its path inside the session folder: notes/note_01.wav, notes/title.wav, full_session.wav)."""
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > st.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"upload larger than {st.max_upload_mb} MB")
        ctype = request.headers.get("content-type", "")
        uploads: list[tuple[str, bytes]] = []
        if ctype.startswith("multipart/form-data"):
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
                storage.save_audio(st.audio_dir, s.session_id, name, data)
        except storage.BadAudioName as exc:
            raise HTTPException(422, str(exc)) from exc
        files = storage.list_audio(st.audio_dir, s.session_id)
        existed = repo.upsert(db, raw, s, files)
        if st.ai_configured and st.ai_auto:
            repo.set_ai(db, s.session_id, "queued")
            background.add_task(run_ai, s.session_id)
            ai_status = "queued"
        else:
            ai_status = "pending" if st.ai_configured else "disabled"
            repo.set_ai(db, s.session_id, ai_status, error=None if st.ai_configured else "DEEPSEEK_API_KEY is not set")
        return {"session_id": s.session_id, "updated_existing": existed, "notes": len(s.notes), "audio_files": files,
                "ai_status": ai_status}

    @app.get("/api/sessions", dependencies=[Depends(require_key)])
    def list_sessions(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
        total, items = repo.list_sessions(db, limit, offset)
        return {"total": total, "limit": limit, "offset": offset, "items": items}

    @app.get("/api/sessions/{session_id}", dependencies=[Depends(require_key)])
    def get_session(session_id: str):
        row = repo.get_session(db, session_id)
        if row is None:
            raise HTTPException(404, "no such session")
        return row

    @app.get("/api/sessions/{session_id}/audio/{name:path}", dependencies=[Depends(require_key)])
    def get_audio(session_id: str, name: str):
        p = storage.audio_path(st.audio_dir, session_id, name) if repo.get_session(db, session_id) else None
        if p is None:
            raise HTTPException(404, "no such audio file")
        return FileResponse(p, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})

    @app.post("/api/sessions/{session_id}/analyze", status_code=202, dependencies=[Depends(require_key)])
    def analyze(session_id: str, background: BackgroundTasks):
        if repo.get_session(db, session_id) is None:
            raise HTTPException(404, "no such session")
        if not st.ai_configured:
            raise HTTPException(503, "DEEPSEEK_API_KEY is not set on the server")
        repo.set_ai(db, session_id, "queued")
        background.add_task(run_ai, session_id)
        return {"session_id": session_id, "ai_status": "queued"}

    return app


app = create_app()
