from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from helpers import H, make_app, new_client


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path)


def test_register_sets_an_httponly_cookie_and_me_works(app):
    c = TestClient(app, headers=H)
    r = c.post("/api/auth/register", json={"name": "Dr. Noor Rahman", "email": "Noor@Lab.com", "password": "correct-horse-1", "lab": "Materials"})
    assert r.status_code == 201
    u = r.json()["user"]
    assert u["email"] == "noor@lab.com" and u["id"].startswith("MT-") and len(u["id"]) == 11 and u["initials"] == "NR"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "mt_session=" in cookie
    assert c.get("/api/auth/me").json()["user"]["id"] == u["id"]


def test_password_is_hashed_never_stored_or_returned(app):
    c = new_client(app, "a@x.com")
    row = app.state.db.one("SELECT password_hash FROM users WHERE email='a@x.com'")
    assert "correct-horse-1" not in row["password_hash"] and row["password_hash"].startswith("scrypt$")
    assert "password" not in str(c.get("/api/auth/me").json()).lower()


@pytest.mark.parametrize("body,code", [
    ({"name": "A", "email": "not-an-email", "password": "correct-horse-1"}, 422),
    ({"name": "A", "email": "a@x.com", "password": "short"}, 422),
    ({"name": "", "email": "a@x.com", "password": "correct-horse-1"}, 422),
    ({"name": "A", "email": "a@x.com"}, 422),
    ({"email": "a@x.com", "password": "correct-horse-1"}, 422),
    ({"name": "A", "email": "a@x.com", "password": "correct-horse-1", "role": "admin"}, 422),
])
def test_register_validation(app, body, code):
    r = TestClient(app, headers=H).post("/api/auth/register", json=body)
    assert r.status_code == code and r.json()["detail"]


def test_duplicate_email_is_refused_case_insensitively(app):
    new_client(app, "dup@x.com")
    r = TestClient(app, headers=H).post("/api/auth/register", json={"name": "B", "email": "DUP@x.com", "password": "correct-horse-1"})
    assert r.status_code == 409 and "already exists" in r.json()["detail"]


def test_login_logout_cycle(app):
    new_client(app, "l@x.com")
    c = TestClient(app, headers=H)
    assert c.get("/api/auth/me").status_code == 401
    assert c.post("/api/auth/login", json={"email": "L@x.com", "password": "correct-horse-1"}).status_code == 200
    assert c.get("/api/auth/me").status_code == 200
    assert c.post("/api/auth/logout").status_code == 200
    assert c.get("/api/auth/me").status_code == 401


def test_wrong_password_and_unknown_email_look_the_same(app):
    new_client(app, "w@x.com")
    c = TestClient(app, headers=H)
    a = c.post("/api/auth/login", json={"email": "w@x.com", "password": "wrong-password"})
    b = c.post("/api/auth/login", json={"email": "nobody@x.com", "password": "wrong-password"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_brute_force_is_throttled(app):
    new_client(app, "t@x.com")
    c = TestClient(app, headers=H)
    for _ in range(5):
        assert c.post("/api/auth/login", json={"email": "t@x.com", "password": "nope-nope-1"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": "t@x.com", "password": "correct-horse-1"})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_garbage_and_expired_sessions_are_rejected(app):
    c = new_client(app, "e@x.com")
    assert TestClient(app, headers=H, cookies={"mt_session": "garbage"}).get("/api/auth/me").status_code == 401
    app.state.db.run("UPDATE auth_sessions SET expires_at=?", ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(timespec="seconds"),))
    assert c.get("/api/auth/me").status_code == 401
    assert app.state.db.one("SELECT COUNT(*) AS n FROM auth_sessions")["n"] == 0          # the expired row was cleaned


def test_not_remembered_login_is_a_session_cookie(app):
    new_client(app, "r@x.com")
    r = TestClient(app, headers=H).post("/api/auth/login", json={"email": "r@x.com", "password": "correct-horse-1", "remember": False})
    assert "max-age" not in r.headers["set-cookie"].lower()


def test_cookie_writes_need_the_csrf_header_but_reads_do_not(app):
    new_client(app, "c@x.com")
    c = TestClient(app)                                          # a page on another site cannot add this header
    c.post("/api/auth/login", json={"email": "c@x.com", "password": "correct-horse-1"})
    assert c.get("/api/experiments").status_code == 200
    r = c.post("/api/experiments", json={"title": "x"})
    assert r.status_code == 403
    assert c.post("/api/experiments", json={"title": "x"}, headers=H).status_code == 201


def test_api_token_for_the_bridge(app):
    c = new_client(app, "b@x.com")
    r = c.post("/api/auth/api-token", json={"label": "laptop"})
    assert r.status_code == 201 and r.json()["token"].startswith("mt_")
    token = r.json()["token"]
    assert "mt_" not in str(app.state.db.one("SELECT token_hash FROM api_tokens")["token_hash"])       # only a hash is stored
    bridge = TestClient(app)                                      # no cookie, no CSRF header: just the token
    assert bridge.get("/api/experiments", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert bridge.post("/api/experiments", json={"title": "from bridge"}, headers={"Authorization": f"Bearer {token}"}).status_code == 201
    assert bridge.get("/api/experiments", headers={"Authorization": "Bearer mt_wrong"}).status_code == 401
    assert bridge.post("/api/auth/api-token", json={}, headers={"Authorization": f"Bearer {token}"}).status_code == 403   # no token from a token


def test_unauthenticated_requests_are_refused_everywhere(app):
    c = TestClient(app, headers=H)
    for method, path in [("get", "/api/experiments"), ("get", "/api/experiments/1"), ("post", "/api/experiments"), ("get", "/api/stats"),
                         ("get", "/api/notifications"), ("get", "/api/sessions"), ("post", "/api/sessions"), ("get", "/api/users/search?q=a@b.co"),
                         ("get", "/api/collaborators/recent"), ("patch", "/api/notes/1"), ("delete", "/api/notes/1")]:
        assert getattr(c, method)(path).status_code == 401, (method, path)
    assert c.get("/api/health").status_code == 200
    assert c.get("/api/nope").status_code == 404 and c.get("/api/nope").json()["detail"]


def test_initials_skip_titles():
    from services.users import initials
    assert initials("Dr. Noor Rahman") == "NR"
    assert initials("د. وليد الطير") == "وا"
    assert initials("محمد") == "م"
