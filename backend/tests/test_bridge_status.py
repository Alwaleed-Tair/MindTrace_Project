"""The device-to-platform link made visible: heartbeat from the laptop app, status for the web app."""
import json
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bridge"))
import mindtrace_bridge as br  # noqa: E402
from helpers import make_app, new_client  # noqa: E402
from test_bridge import make_session_folder  # noqa: E402


def setup(tmp_path):
    app = make_app(tmp_path / "srv")
    u = new_client(app, "r@x.com", "Researcher")
    token = u.post("/api/auth/api-token", json={"label": "laptop"}).json()["token"]
    return app, u, token


def test_not_linked_then_offline_then_live(tmp_path):
    app, u, token = setup(tmp_path)
    fresh = new_client(app, "n@x.com", "New")
    assert fresh.get("/api/bridge/status").json()["linked"] is False                 # no laptop linked yet
    st = u.get("/api/bridge/status").json()
    assert st["linked"] is True and st["online"] is False                             # token exists, app not running
    live = {"running": True, "device_connected": True, "recording": False, "firmware": "2.0.0", "levels": [-50, -40, 5, -200], "age_sec": 1}
    r = TestClient(app).post("/api/bridge/heartbeat", json={"bridge_version": "2.1", "computer": "LAB-PC", "listener": live},
                             headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["account"]["email"] == "r@x.com"
    st = u.get("/api/bridge/status").json()
    assert st["online"] and st["device_connected"] and st["listener_running"] and not st["recording"]
    assert st["firmware"] == "2.0.0" and st["levels"] == [-50, -40, 0, -100] and st["computers"][0]["computer"] == "LAB-PC"


def test_stale_listener_is_not_reported_as_connected(tmp_path):
    app, u, token = setup(tmp_path)
    live = {"running": True, "device_connected": True, "recording": True, "age_sec": 120}
    TestClient(app).post("/api/bridge/heartbeat", json={"listener": live}, headers={"Authorization": f"Bearer {token}"})
    st = u.get("/api/bridge/status").json()
    assert st["online"] and not st["listener_running"] and not st["device_connected"] and not st["recording"]


def test_heartbeat_needs_the_laptop_token_and_status_is_private(tmp_path):
    app, u, token = setup(tmp_path)
    assert u.post("/api/bridge/heartbeat", json={}).status_code == 403                # a browser cookie is not the laptop app
    assert TestClient(app).post("/api/bridge/heartbeat", json={}, headers={"Authorization": "Bearer mt_wrong"}).status_code == 401
    other = new_client(app, "o@x.com", "Other")
    TestClient(app).post("/api/bridge/heartbeat", json={"listener": {"running": True, "device_connected": True}},
                         headers={"Authorization": f"Bearer {token}"})
    assert other.get("/api/bridge/status").json()["online"] is False                 # someone else's laptop is not mine
    assert TestClient(app).get("/api/bridge/status").status_code == 401


def test_last_upload_shows_after_a_bridge_upload(tmp_path):
    app, u, token = setup(tmp_path)
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    make_session_folder(sessions, "s1")
    br.run_once(TestClient(app), "http://testserver", sessions, {}, True, token, say=lambda m: None)
    st = u.get("/api/bridge/status").json()
    assert st["uploads"] == 1 and st["last_upload_at"]


def test_bridge_reads_the_listener_file_and_sends_heartbeats(tmp_path):
    app, u, token = setup(tmp_path)
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    (sessions / ".live.json").write_text(json.dumps({"updated_unix": time.time(), "running": True, "device_connected": True,
                                                     "recording": True, "session_notes": 3, "levels": [-35.0], "firmware": "2.0.0"}))
    live = br.read_live(sessions)
    assert live["device_connected"] and live["recording"] and live["session_notes"] == 3 and live["age_sec"] < 5
    assert br.heartbeat(TestClient(app), "http://testserver", token, sessions) is True
    st = u.get("/api/bridge/status").json()
    assert st["recording"] and st["levels"] == [-35.0]
    assert br.read_live(tmp_path / "nothing-here") is None
    assert br.heartbeat(TestClient(app), "http://testserver", "mt_bad", sessions) is False   # never raises


def test_whoami_names_the_account_the_recordings_go_to(tmp_path):
    """The bug that hid recordings: a token made in another account (the old demo workspace) uploads THERE."""
    app, u, token = setup(tmp_path)
    assert br.whoami(TestClient(app), "http://testserver", token)["email"] == "r@x.com"
    assert br.whoami(TestClient(app), "http://testserver", "mt_from_a_deleted_database") is None


def test_saved_setup_token_wins_over_an_old_environment_token(tmp_path, monkeypatch):
    f = tmp_path / ".bridge_token"
    f.write_text(json.dumps({"url": "http://localhost:8000", "token": "mt_new_from_setup"}))
    monkeypatch.setattr(br, "TOKEN_FILE", f)
    monkeypatch.setenv("MINDTRACE_API_TOKEN", "mt_old_demo_token")
    seen = {}
    monkeypatch.setattr(br, "whoami", lambda c, url, tok: seen.setdefault("tok", tok) and None)
    monkeypatch.setattr(br.httpx.Client, "get", lambda self, *a, **k: type("R", (), {"json": lambda s: {"ai_configured": False}})())
    (tmp_path / "s").mkdir()
    assert br.main(["--sessions-dir", str(tmp_path / "s"), "--url", "http://localhost:8000"]) == 2   # whoami None -> clear stop
    assert seen["tok"] == "mt_new_from_setup"
