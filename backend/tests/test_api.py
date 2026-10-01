import io
import json
import wave
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from core.config import Settings
from main import create_app

SAMPLE = Path(__file__).resolve().parents[2] / "bridge" / "samples" / "session_demo.json"


def make_wav(seconds=0.2) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * int(16000 * seconds))
    return buf.getvalue()


def sample() -> dict:
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def make_client(tmp_path, ai_handler=None, **kw):
    settings = Settings(data_dir=tmp_path / "data", api_key=kw.pop("api_key", ""), deepseek_api_key=kw.pop("deepseek_api_key", ""),
                        **kw)
    ai_client = httpx.Client(transport=httpx.MockTransport(ai_handler)) if ai_handler else None
    return TestClient(create_app(settings, ai_client)), settings


@pytest.fixture
def client(tmp_path):
    c, _ = make_client(tmp_path)
    return c


def test_health_is_open_and_reports_config(tmp_path):
    c, _ = make_client(tmp_path, api_key="secret")
    r = c.get("/api/health")
    assert r.status_code == 200 and r.json()["auth_required"] is True and r.json()["ai_configured"] is False


def test_post_json_stores_the_session_untouched_and_lists_it(client):
    s = sample()
    r = client.post("/api/sessions", json=s)
    assert r.status_code == 201 and r.json()["session_id"] == s["session_id"] and r.json()["notes"] == 8
    got = client.get(f"/api/sessions/{s['session_id']}").json()
    assert got["session"] == s                                   # nothing dropped, including asr / speaker_check / experiment_status
    lst = client.get("/api/sessions").json()
    assert lst["total"] == 1 and lst["items"][0]["needs_review_notes"] == 3 and lst["items"][0]["experiment_state"] == "completed"
    assert lst["items"][0]["title"] == s["title"]


def test_unknown_future_fields_are_kept(client):
    s = sample()
    s["new_top_field"] = {"x": 1}
    s["notes"][0]["new_note_field"] = "kept"
    assert client.post("/api/sessions", json=s).status_code == 201
    got = client.get(f"/api/sessions/{s['session_id']}").json()["session"]
    assert got["new_top_field"] == {"x": 1} and got["notes"][0]["new_note_field"] == "kept"


def test_multipart_with_audio_and_download(client):
    s = sample()
    wav = make_wav()
    files = [("files", ("notes/note_01.wav", wav, "audio/wav")), ("files", ("full_session.wav", make_wav(0.4), "audio/wav"))]
    r = client.post("/api/sessions", data={}, files=[("session", ("session.json", json.dumps(s).encode(), "application/json")), *files])
    assert r.status_code == 201 and r.json()["audio_files"] == ["full_session.wav", "notes/note_01.wav"]
    a = client.get(f"/api/sessions/{s['session_id']}/audio/notes/note_01.wav")
    assert a.status_code == 200 and a.content == wav and a.headers["content-type"] == "audio/wav"
    assert client.get(f"/api/sessions/{s['session_id']}/audio/notes/note_02.wav").status_code == 404
    assert client.get(f"/api/sessions/{s['session_id']}").json()["audio_files"] == ["full_session.wav", "notes/note_01.wav"]


@pytest.mark.parametrize("name", ["../evil.wav", "notes/../../evil.wav", "evil.wav", "notes/note_01.exe", "/etc/passwd",
                                  "notes/note_1.wav", "..\\evil.wav"])
def test_bad_audio_names_are_refused(client, name):
    s = sample()
    r = client.post("/api/sessions", files=[("session", ("s.json", json.dumps(s).encode(), "application/json")),
                                           ("files", (name, make_wav(), "audio/wav"))])
    assert r.status_code == 422, name
    assert client.get("/api/sessions").json()["total"] == 0          # nothing half-stored


def test_non_wav_content_is_refused(client):
    r = client.post("/api/sessions", files=[("session", ("s.json", json.dumps(sample()).encode(), "application/json")),
                                           ("files", ("notes/note_01.wav", b"not a wav at all", "audio/wav"))])
    assert r.status_code == 422


def test_audio_path_traversal_on_download(client):
    s = sample()
    client.post("/api/sessions", json=s)
    for bad in ("../../../etc/passwd", "..%2f..%2fmindtrace.sqlite3", "notes/../full_session.wav"):
        assert client.get(f"/api/sessions/{s['session_id']}/audio/{bad}").status_code == 404


@pytest.mark.parametrize("mutate,expect", [
    (lambda s: s.pop("session_id"), "session_id"),
    (lambda s: s.__setitem__("session_id", "../x"), "session_id"),
    (lambda s: s.__setitem__("session_id", "a b"), "session_id"),
    (lambda s: s.__setitem__("schema_version", 2), "schema_version"),
    (lambda s: s["notes"][0].pop("text"), "text"),
    (lambda s: s["notes"][0].__setitem__("kind", "other"), "kind"),
    (lambda s: s.__setitem__("notes", "nope"), "notes"),
])
def test_invalid_sessions_are_refused_with_the_field_named(client, mutate, expect):
    s = sample()
    mutate(s)
    r = client.post("/api/sessions", json=s)
    assert r.status_code == 422 and expect in json.dumps(r.json())


def test_not_json_and_not_object(client):
    assert client.post("/api/sessions", content=b"{oops", headers={"content-type": "application/json"}).status_code == 422
    assert client.post("/api/sessions", json=[1, 2]).status_code == 422
    assert client.post("/api/sessions", files=[("files", ("notes/note_01.wav", make_wav(), "audio/wav"))]).status_code == 422


def test_upload_size_limit(tmp_path):
    c, _ = make_client(tmp_path, max_upload_mb=1)
    r = c.post("/api/sessions", content=b"x" * (2 * 1024 * 1024), headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_api_key(tmp_path):
    c, _ = make_client(tmp_path, api_key="secret")
    s = sample()
    assert c.post("/api/sessions", json=s).status_code == 401
    assert c.post("/api/sessions", json=s, headers={"X-API-Key": "wrong"}).status_code == 401
    assert c.post("/api/sessions", json=s, headers={"X-API-Key": "secret"}).status_code == 201
    assert c.get("/api/sessions").status_code == 401 and c.get("/api/sessions", headers={"X-API-Key": "secret"}).status_code == 200
    assert c.get(f"/api/sessions/{s['session_id']}/audio/full_session.wav").status_code == 401


def test_repost_updates_in_place_keeps_audio_and_marks_ai_stale(tmp_path):
    c, _ = make_client(tmp_path)
    s = sample()
    c.post("/api/sessions", files=[("session", ("s.json", json.dumps(s).encode(), "application/json")),
                                   ("files", ("notes/note_01.wav", make_wav(), "audio/wav"))])
    s["notes"][3]["text"] = "قسنا الـ temperature بعد الظهر"
    r = c.post("/api/sessions", json=s)                       # e.g. after re-transcribing: JSON only
    assert r.status_code == 201 and r.json()["updated_existing"] is True and r.json()["audio_files"] == ["notes/note_01.wav"]
    assert c.get("/api/sessions").json()["total"] == 1
    assert c.get(f"/api/sessions/{s['session_id']}").json()["session"]["notes"][3]["text"].startswith("قسنا")


def test_list_pagination_and_404(client):
    for i in range(3):
        s = sample()
        s["session_id"] = f"s{i}"
        s["started_at"] = f"2026-10-0{i + 1}T10:00:00+03:00"
        client.post("/api/sessions", json=s)
    r = client.get("/api/sessions?limit=2").json()
    assert r["total"] == 3 and [x["session_id"] for x in r["items"]] == ["s2", "s1"]
    assert client.get("/api/sessions?limit=2&offset=2").json()["items"][0]["session_id"] == "s0"
    assert client.get("/api/sessions/nope").status_code == 404
    assert client.get("/api/sessions?limit=0").status_code == 422


def test_ai_is_disabled_without_a_key_but_ingest_still_works(client):
    s = sample()
    r = client.post("/api/sessions", json=s)
    assert r.json()["ai_status"] == "disabled"
    assert client.get(f"/api/sessions/{s['session_id']}").json()["ai"]["status"] == "disabled"
    assert client.post(f"/api/sessions/{s['session_id']}/analyze").status_code == 503
