"""The bridge uploading into the real backend (in-process): the whole input path laptop folder -> platform."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "bridge"))
import mindtrace_bridge as br  # noqa: E402
from test_api import SAMPLE, make_client, make_wav  # noqa: E402


def make_session_folder(root: Path, name="2026-10-01_16-09-29", status="complete", text=None) -> Path:
    s = json.loads(SAMPLE.read_text(encoding="utf-8"))
    s["session_id"], s["status"] = name, status
    if text:
        s["notes"][3]["text"] = text
    d = root / name
    (d / "notes").mkdir(parents=True)
    (d / "session.json").write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")
    (d / "notes" / "title.wav").write_bytes(make_wav())
    (d / "notes" / "note_01.wav").write_bytes(make_wav())
    (d / "full_session.wav").write_bytes(make_wav(1))
    return d


def test_uploads_new_sessions_once_and_again_when_changed(tmp_path):
    client, _ = make_client(tmp_path / "srv")
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    make_session_folder(sessions, "a1")
    make_session_folder(sessions, "recording-now", status="recording")          # not finished: skipped
    state, log = {}, []
    assert br.run_once(client, "http://t", sessions, state, True, "", say=log.append) == (1, 0)
    assert client.get("/api/sessions").json()["total"] == 1
    assert client.get("/api/sessions/a1").json()["audio_files"] == ["full_session.wav", "notes/note_01.wav", "notes/title.wav"]
    assert br.run_once(client, "http://t", sessions, state, True, "", say=log.append) == (0, 0)       # nothing changed
    make_session_folder(tmp_path / "again", "a1", text="قسنا الـ temperature بعد الظهر")
    (sessions / "a1" / "session.json").write_text((tmp_path / "again" / "a1" / "session.json").read_text(encoding="utf-8"), encoding="utf-8")
    assert br.run_once(client, "http://t", sessions, state, True, "", say=log.append) == (1, 0)       # re-transcribed: sent again
    assert client.get("/api/sessions/a1").json()["session"]["notes"][3]["text"].startswith("قسنا")
    assert client.get("/api/sessions").json()["total"] == 1


def test_no_full_audio_option(tmp_path):
    client, _ = make_client(tmp_path / "srv")
    sessions = tmp_path / "s"
    sessions.mkdir()
    make_session_folder(sessions, "b1")
    br.run_once(client, "http://t", sessions, {}, False, "", say=lambda m: None)
    assert "full_session.wav" not in client.get("/api/sessions/b1").json()["audio_files"]


def test_failure_is_reported_and_retried_not_remembered(tmp_path):
    client, _ = make_client(tmp_path / "srv", api_key="secret")
    sessions = tmp_path / "s"
    sessions.mkdir()
    make_session_folder(sessions, "c1")
    state, log = {}, []
    assert br.run_once(client, "http://t", sessions, state, True, "wrong-key", say=log.append) == (0, 1)
    assert state == {} and "401" in log[0]
    assert br.run_once(client, "http://t", sessions, state, True, "secret", say=log.append) == (1, 0)
    assert "c1" in state


def test_dry_run_and_broken_folders(tmp_path):
    client, _ = make_client(tmp_path / "srv")
    sessions = tmp_path / "s"
    sessions.mkdir()
    make_session_folder(sessions, "d1")
    (sessions / "junk").mkdir()
    (sessions / "bad").mkdir()
    (sessions / "bad" / "session.json").write_text("{not json", encoding="utf-8")
    log = []
    assert br.run_once(client, "http://t", sessions, {}, True, "", dry_run=True, say=log.append) == (0, 0)
    assert log == ["would upload d1 (3 audio files)"] and client.get("/api/sessions").json()["total"] == 0
    assert not list(sessions.rglob(".bridge_state.json"))                          # the bridge never writes into the sessions folder


def test_state_file_roundtrip(tmp_path):
    p = tmp_path / "st.json"
    assert br.load_state(p) == {}
    br.save_state({"x": {"sha256": "1"}}, p)
    assert br.load_state(p) == {"x": {"sha256": "1"}}
