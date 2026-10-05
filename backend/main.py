"""MindTrace platform backend.

  * accounts (register / login / logout, scrypt passwords, HttpOnly cookie sessions, API tokens for the laptop bridge)
  * experiments, notes, collaborators, notifications, stats (what the web UI shows)
  * INPUT from the recorder: POST /api/sessions takes a session.json (+ audio) and turns it into an experiment
  * DeepSeek insights, called from here only (the key never reaches the browser)
  * serves the built frontend (../frontend/dist) so one process is the whole app

Run:  uvicorn main:app --port 8000      (see ../README.md)
"""
from __future__ import annotations

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from api import auth, bridge, experiments, misc, sessions, teams
from core.config import Settings
from core.env import load_env
from core.db import Database
from services import experiments as ex
from services import users as users_service

API_VERSION = "2.0.0"
load_env()                      # DEEPSEEK_API_KEY etc. from backend/.env or the repository .env (never committed)


def create_app(settings: Settings | None = None, ai_client: httpx.Client | None = None) -> FastAPI:
    st = settings or Settings()
    st.data_dir.mkdir(parents=True, exist_ok=True)
    db = Database(st.db_path)
    users_service.purge_expired(db)
    app = FastAPI(title="MindTrace platform API", version=API_VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.settings, app.state.db, app.state.ai_client, app.state.login_fails = st, db, ai_client, {}
    app.add_middleware(CORSMiddleware, allow_origins=st.cors_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type", "Authorization", "X-Requested-With"])

    # ---- clear, consistent errors: {"detail": "..."} with the right status code
    @app.exception_handler(ex.NotFound)
    async def _nf(_r: Request, exc: ex.NotFound):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(ex.Forbidden)
    async def _fb(_r: Request, exc: ex.Forbidden):
        return JSONResponse({"detail": str(exc)}, status_code=403)

    @app.exception_handler(ex.Invalid)
    async def _iv(_r: Request, exc: ex.Invalid):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(RequestValidationError)
    async def _val(_r: Request, exc: RequestValidationError):
        errs = exc.errors()
        msg = "; ".join(f"{'.'.join(str(p) for p in e['loc'] if p != 'body')}: {e['msg']}" for e in errs[:4])
        return JSONResponse({"detail": msg or "invalid request", "errors": [{"field": ".".join(str(p) for p in e["loc"]), "problem": e["msg"]} for e in errs[:10]]},
                            status_code=422)

    @app.get("/api/health")
    def health():
        ok_db = True
        try:
            db.one("SELECT 1")
        except Exception:
            ok_db = False
        return {"ok": ok_db, "version": API_VERSION, "ai_configured": st.ai_configured,
                "dev_tools": st.dev_tools}

    for r in (auth.router, bridge.router, experiments.router, misc.router, sessions.router, teams.router):
        app.include_router(r)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def _api_404(rest: str):
        raise HTTPException(404, "not found")

    # ---- the built web UI (npm run build in ../frontend), single-page-app fallback
    dist = st.frontend_dir.resolve()
    if (dist / "index.html").is_file():
        @app.get("/{path:path}", include_in_schema=False)
        def _spa(path: str):
            target = (dist / path).resolve()
            if path and target.is_file() and dist in target.parents:
                return FileResponse(target)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
