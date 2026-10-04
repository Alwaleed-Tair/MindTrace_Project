from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from api.deps import COOKIE, current_user, db, settings
from services import mailer
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


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    lab: str | None = None


class PasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str
    new_password: str


class ForgotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)


class ResetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=10, max_length=200)
    new_password: str


class DeleteAccountIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str


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


# ------------------------------------------------------------- own account
@router.patch("/me")
def update_me(body: ProfileIn, request: Request, user=Depends(current_user)):
    try:
        row = users_service.update_profile(db(request), user["id"], body.model_dump(exclude_unset=True))
    except UserError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"user": users_service.public(row)}


@router.post("/password")
def change_password(body: PasswordIn, request: Request, user=Depends(current_user)):
    """Needs the current password. Other browsers are signed out; this one stays signed in."""
    if request.headers.get("authorization"):
        raise HTTPException(403, "change the password from a browser login, not with an API token")
    try:
        users_service.change_password(db(request), user, body.current_password, body.new_password, request.cookies.get(COOKIE))
    except UserError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"ok": True}


@router.post("/forgot")
def forgot_password(body: ForgotIn, request: Request):
    """E-mails a one-time reset link. Always answers the same, so it never reveals whether an address has an account."""
    d, st = db(request), settings(request)
    key = "forgot|" + _throttle_key(request, body.email)
    _check_throttle(request, key)
    request.app.state.login_fails.setdefault(key, []).append(time.monotonic())   # at most MAX_FAILS requests per window
    row = d.one("SELECT * FROM users WHERE email=?", (body.email.strip().lower(),))
    if row is not None:
        token = users_service.create_reset_token(d, row["id"], st.reset_minutes)
        base = st.public_url or str(request.base_url).rstrip("/")
        link = f"{base}/reset-password?token={token}"
        mailer.send(st, row["email"], "MindTrace: reset your password",
                    f"Hello {row['name']},\n\nUse this link to choose a new password (valid for {st.reset_minutes} minutes):\n{link}\n\n"
                    "If you did not ask for this, you can ignore this e-mail.\n\n"
                    f"مرحباً {row['name']}،\nاستخدم الرابط أعلاه لاختيار كلمة مرور جديدة. إذا لم تطلب ذلك فتجاهل هذه الرسالة.\n")
    return {"ok": True, "email_configured": st.email_configured}


@router.post("/reset")
def reset_password(body: ResetIn, request: Request, response: Response):
    """Sets the new password from the e-mailed link and signs this browser in."""
    d, st = db(request), settings(request)
    try:
        row = users_service.reset_password(d, body.token, body.new_password)
    except UserError as exc:
        raise HTTPException(422, str(exc)) from exc
    _set_cookie(response, request, users_service.start_session(d, row["id"], st.session_days), True)
    return {"user": users_service.public(row)}


@router.delete("/me")
def delete_me(body: DeleteAccountIn, request: Request, response: Response, user=Depends(current_user)):
    """Deletes the account for good (password required)."""
    if request.headers.get("authorization"):
        raise HTTPException(403, "delete the account from a browser login, not with an API token")
    try:
        users_service.delete_account(db(request), user, body.password, settings(request).audio_dir)
    except UserError as exc:
        raise HTTPException(422, str(exc)) from exc
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}
