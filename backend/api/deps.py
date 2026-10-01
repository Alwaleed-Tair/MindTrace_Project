"""Shared request helpers: settings, database, and who is calling (cookie login or a laptop API token)."""
from __future__ import annotations

from fastapi import HTTPException, Request

from services import users as users_service

COOKIE = "mt_session"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "mindtrace"
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def settings(request: Request):
    return request.app.state.settings


def db(request: Request):
    return request.app.state.db


def current_user(request: Request):
    """The logged-in user row, or 401. A Bearer `mt_...` API token (the laptop bridge) or the login cookie.
    Cookie logins must also send `X-Requested-With: mindtrace` on writes: a browser will not add that header on a
    cross-site request, which closes the CSRF hole."""
    d = request.app.state.db
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        row = users_service.user_for_api_token(d, auth[7:].strip())
        if row is None:
            raise HTTPException(401, "invalid API token")
        return row
    token = request.cookies.get(COOKIE)
    row = users_service.user_for_session(d, token) if token else None
    if row is None:
        raise HTTPException(401, "not signed in")
    if request.method in MUTATING and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise HTTPException(403, "missing X-Requested-With header")
    return row
