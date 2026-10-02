"""Own account: profile, password change, password reset by e-mail link, account deletion."""
import re

import pytest
from fastapi.testclient import TestClient

from helpers import H, make_app, make_exp, new_client
from services import mailer


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path)


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(mailer, "send", lambda st, to, subject, text: sent.append((to, subject, text)) or True)
    return sent


def link_token(text: str) -> str:
    return re.search(r"reset-password\?token=([\w-]+)", text).group(1)


# ------------------------------------------------------------------ profile
def test_update_name_and_lab(app):
    c = new_client(app, "a@x.com", name="Old Name")
    r = c.patch("/api/auth/me", json={"name": "  Dr. Noor Rahman ", "lab": "Materials"})
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["name"] == "Dr. Noor Rahman" and u["lab"] == "Materials" and u["initials"] == "NR"
    assert c.get("/api/auth/me").json()["user"]["name"] == "Dr. Noor Rahman"


@pytest.mark.parametrize("body", [{"name": ""}, {"name": "x" * 81}, {"lab": "y" * 81}, {}, {"email": "new@x.com"}])
def test_profile_validation_and_email_cannot_change(app, body):
    c = new_client(app, "a@x.com")
    assert c.patch("/api/auth/me", json=body).status_code == 422
    assert c.get("/api/auth/me").json()["user"]["email"] == "a@x.com"


def test_profile_needs_login_and_csrf_header(app):
    assert TestClient(app, headers=H).patch("/api/auth/me", json={"name": "X"}).status_code == 401
    c = new_client(app, "a@x.com")
    assert c.patch("/api/auth/me", json={"name": "X"}, headers={"X-Requested-With": ""}).status_code == 403


# ------------------------------------------------------------------ password
def test_change_password_keeps_this_browser_and_signs_out_the_others(app):
    c = new_client(app, "a@x.com")
    other = TestClient(app, headers=H)
    assert other.post("/api/auth/login", json={"email": "a@x.com", "password": "correct-horse-1"}).status_code == 200
    r = c.post("/api/auth/password", json={"current_password": "correct-horse-1", "new_password": "new-secret-22"})
    assert r.status_code == 200
    assert c.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    fresh = TestClient(app, headers=H)
    assert fresh.post("/api/auth/login", json={"email": "a@x.com", "password": "correct-horse-1"}).status_code == 401
    assert fresh.post("/api/auth/login", json={"email": "a@x.com", "password": "new-secret-22"}).status_code == 200


@pytest.mark.parametrize("current,new", [("wrong-pass-1", "new-secret-22"), ("correct-horse-1", "short"), ("correct-horse-1", "correct-horse-1")])
def test_change_password_refusals(app, current, new):
    c = new_client(app, "a@x.com")
    r = c.post("/api/auth/password", json={"current_password": current, "new_password": new})
    assert r.status_code == 422 and r.json()["detail"]


def test_api_token_cannot_change_the_password(app):
    c = new_client(app, "a@x.com")
    token = c.post("/api/auth/api-token", json={}).json()["token"]
    bridge = TestClient(app, headers={"Authorization": f"Bearer {token}"})
    assert bridge.post("/api/auth/password", json={"current_password": "correct-horse-1", "new_password": "new-secret-22"}).status_code == 403


# ------------------------------------------------------------------ reset
def test_forgot_and_reset_password_by_link(app, outbox):
    c = new_client(app, "a@x.com")
    stranger = TestClient(app, headers=H)
    r = stranger.post("/api/auth/forgot", json={"email": "A@x.com"})
    assert r.status_code == 200 and r.json()["ok"] is True
    assert len(outbox) == 1 and outbox[0][0] == "a@x.com"
    token = link_token(outbox[0][2])
    assert token not in str(app.state.db.one("SELECT * FROM password_resets"))       # only the hash is stored

    r = stranger.post("/api/auth/reset", json={"token": token, "new_password": "brand-new-33"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "a@x.com"
    assert stranger.get("/api/auth/me").status_code == 200                           # signed in by the reset
    assert c.get("/api/auth/me").status_code == 401                                  # old sessions ended
    assert stranger.post("/api/auth/reset", json={"token": token, "new_password": "again-new-44"}).status_code == 422   # once only
    assert TestClient(app, headers=H).post("/api/auth/login", json={"email": "a@x.com", "password": "brand-new-33"}).status_code == 200


def test_forgot_answers_the_same_for_unknown_addresses(app, outbox):
    r = TestClient(app, headers=H).post("/api/auth/forgot", json={"email": "nobody@x.com"})
    assert r.status_code == 200 and r.json()["ok"] is True and outbox == []


def test_asking_again_replaces_the_previous_link(app, outbox):
    new_client(app, "a@x.com")
    s = TestClient(app, headers=H)
    s.post("/api/auth/forgot", json={"email": "a@x.com"})
    s.post("/api/auth/forgot", json={"email": "a@x.com"})
    first, second = link_token(outbox[0][2]), link_token(outbox[1][2])
    assert s.post("/api/auth/reset", json={"token": first, "new_password": "brand-new-33"}).status_code == 422
    assert s.post("/api/auth/reset", json={"token": second, "new_password": "brand-new-33"}).status_code == 200


def test_expired_link_is_refused(app, outbox):
    new_client(app, "a@x.com")
    s = TestClient(app, headers=H)
    s.post("/api/auth/forgot", json={"email": "a@x.com"})
    app.state.db.run("UPDATE password_resets SET expires_at='2000-01-01T00:00:00+00:00'")
    assert s.post("/api/auth/reset", json={"token": link_token(outbox[0][2]), "new_password": "brand-new-33"}).status_code == 422


def test_forgot_is_rate_limited(app, outbox):
    new_client(app, "a@x.com")
    s = TestClient(app, headers=H)
    codes = [s.post("/api/auth/forgot", json={"email": "a@x.com"}).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and codes[-1] == 429


def test_without_smtp_the_link_goes_to_the_server_log(app, caplog):
    new_client(app, "a@x.com")
    with caplog.at_level("WARNING", logger="mindtrace.mail"):
        r = TestClient(app, headers=H).post("/api/auth/forgot", json={"email": "a@x.com"})
    assert r.json()["email_configured"] is False
    assert "reset-password?token=" in caplog.text


# ------------------------------------------------------------------ delete
def test_delete_account_removes_own_work_but_not_shared_experiments(app):
    a = new_client(app, "a@x.com", name="Ann")
    b = new_client(app, "b@x.com", name="Bob")
    c = new_client(app, "c@x.com", name="Cat")
    own = make_exp(b, "Bob's own")
    shared = make_exp(a, "Ann's")
    a.post(f"/api/experiments/{shared['id']}/collaborators", json={"identifier": "b@x.com"})
    b.post(f"/api/experiments/{shared['id']}/collaborators", json={"identifier": "c@x.com"})     # Bob adds Cat
    b.post(f"/api/experiments/{shared['id']}/notes", json={"text": "Bob's note"})

    assert b.request("DELETE", "/api/auth/me", json={"password": "wrong-pass-1"}).status_code == 422
    r = b.request("DELETE", "/api/auth/me", json={"password": "correct-horse-1"})
    assert r.status_code == 200
    assert b.get("/api/auth/me").status_code == 401
    assert a.get(f"/api/experiments/{own['id']}").status_code == 404
    e = a.get(f"/api/experiments/{shared['id']}").json()
    assert [p["name"] for p in e["collaborators"]] == ["Cat"]                    # Cat stays, though Bob added her
    assert all(n["text"] != "Bob's note" for n in e["notes"])
    assert c.get(f"/api/experiments/{shared['id']}").status_code == 200
    assert TestClient(app, headers=H).post("/api/auth/login", json={"email": "b@x.com", "password": "correct-horse-1"}).status_code == 401


def test_demo_account_cannot_be_deleted_or_its_password_changed(app):
    c = new_client(app, "demo@x.com")
    app.state.db.run("UPDATE users SET is_demo=1 WHERE email='demo@x.com'")
    assert c.request("DELETE", "/api/auth/me", json={"password": "correct-horse-1"}).status_code == 403
    assert c.post("/api/auth/password", json={"current_password": "correct-horse-1", "new_password": "new-secret-22"}).status_code == 422
