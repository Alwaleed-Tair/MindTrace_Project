from fastapi.testclient import TestClient

from helpers import H, make_app
import seed


def test_seed_is_idempotent_and_builds_a_usable_demo_workspace(tmp_path):
    app = make_app(tmp_path)
    first = seed.seed(app.state.db, say=lambda m: None)
    assert first["users"] == 4 and first["experiments_created"] == 4 and first["sessions_imported"] >= 1
    second = seed.seed(app.state.db, say=lambda m: None)
    assert second["experiments_created"] == 0 and second["sessions_imported"] == 0
    c = TestClient(app, headers=H)
    assert c.post("/api/auth/demo").status_code == 200
    items = c.get("/api/experiments").json()["items"]
    codes = {e["code"] for e in items}
    assert {"EXP-204", "EXP-203", "EXP-198", "EXP-191"} <= codes and len(items) == first["experiments_created"] + first["sessions_imported"]
    e204 = next(e for e in items if e["code"] == "EXP-204")
    assert e204["status"] == "Active" and e204["originality"] == 82 and [p["name"] for p in e204["collaborators"]] == ["Dr. Lina Haddad", "Omar Khalid"]
    assert [n["kind"] for n in c.get(f"/api/experiments/{e204['id']}").json()["notes"]] == ["observation", "hypothesis"]
    st = c.get("/api/stats").json()
    assert st["active_threads"] >= 1 and st["notes_this_week"] >= 3
    assert {p["name"] for p in c.get("/api/collaborators/recent").json()["items"]} == {"Dr. Lina Haddad", "Omar Khalid", "Sara Al-Mansour"}


def test_demo_users_can_log_in_with_the_documented_password_and_see_shared_work(tmp_path):
    app = make_app(tmp_path)
    seed.seed(app.state.db, say=lambda m: None)
    lina = TestClient(app, headers=H)
    assert lina.post("/api/auth/login", json={"email": "lina@mindtrace.app", "password": seed.DEFAULT_DEMO_PASSWORD}).status_code == 200
    assert [e["code"] for e in lina.get("/api/experiments").json()["items"]] == ["EXP-204"]          # only what was shared with her
    assert lina.get("/api/notifications").json()["unread_count"] == 0
