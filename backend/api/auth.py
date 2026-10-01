from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from api.deps import COOKIE, current_user, db, settings
from services import users as users_service
from services.users import UserError

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILS, WINDOW_SEC = 5, 300


class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    email: str
    password: str
    lab: str = ""


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str
    remember: bool = True


class TokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(default="laptop bridge", max_length=60)


def _set_cookie(response: Response, request: Request, token: str, remember: bool) -> None:
    st = settings(request)
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=st.cookie_secure, path="/",
                        max_age=st.session_days * 86400 if remember else None)


def _throttle_key(request: Request, email: str) -> str:
    return f"{(request.client.host if request.client else '?')}|{email.strip().lower()}"


def _check_throttle(request: Request, key: str) -> None:
    fails = [t for t in request.app.state.login_fails.get(key, []) if time.monotonic() - t < WINDOW_SEC]
    request.app.state.login_fails[key] = fails
    if len(fails) >= MAX_FAILS:
        raise HTTPException(429, "too many failed sign-in attempts: wait a few minutes", headers={"Retry-After": str(WINDOW_SEC)})


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response):
    d, st = db(request), settings(request)
    try:
        user = users_service.create_user(d, body.name, body.email, body.password, body.lab)
    except UserError as exc:
        raise HTTPException(409 if "already exists" in str(exc) else 422, str(exc)) from exc
    _set_cookie(response, request, users_service.start_session(d, user["id"], st.session_days), True)
    return {"user": users_service.public(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    d, st = db(request), settings(request)
    key = _throttle_key(request, body.email)
    _check_throttle(request, key)
    user = users_service.authenticate(d, body.email, body.password)
    if user is None:
        request.app.state.login_fails.setdefault(key, []).append(time.monotonic())
        raise HTTPException(401, "wrong email or password")
    request.app.state.login_fails.pop(key, None)
    days = st.session_days if body.remember else 1
    _set_cookie(response, request, users_service.start_session(d, user["id"], days), body.remember)
    return {"user": users_service.public(user)}


@router.post("/demo")
def demo(request: Request, response: Response):
    """Opens the seeded demo account (no password typed). Off unless MINDTRACE_DEMO_ENABLED and the demo user exists."""
    d, st = db(request), settings(request)
    row = d.one("SELECT * FROM users WHERE is_demo=1 ORDER BY id LIMIT 1")
    if not st.demo_enabled or row is None:
        raise HTTPException(404, "the demo workspace is not available (run the seed script)")
    _set_cookie(response, request, users_service.start_session(d, row["id"], 1), False)
    return {"user": users_service.public(row)}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        users_service.end_session(db(request), token)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user=Depends(current_user)):
    return {"user": users_service.public(user)}


@router.post("/api-token", status_code=201)
def api_token(body: TokenIn, request: Request, user=Depends(current_user)):
    """A long-lived token for the laptop bridge. Shown once; only its hash is stored."""
    if request.headers.get("authorization"):
        raise HTTPException(403, "create tokens from a browser login, not with another token")
    return {"token": users_service.create_api_token(db(request), user["id"], body.label), "label": body.label}
