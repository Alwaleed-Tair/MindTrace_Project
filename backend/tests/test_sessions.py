import json

import pytest
from fastapi.testclient import TestClient

from helpers import H, make_app, make_exp, make_wav, new_client, sample


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path)


def token(c) -> dict:
    return {"Authorization": "Bearer " + c.post("/api/auth/api-token", json={"label": "t"}).json()["token"]}


def post(app, headers, s=None, files=()):
    s = s or sample()
    c = TestClient(app)
    return c.post("/api/sessions", files=[("session", ("s.json", json.dumps(s).encode(), "application/json")), *files], headers=headers)


def test_a_recorded_session_becomes_an_experiment_with_notes(app):
    u = new_client(app, "r@x.com", "Researcher")
    s = sample()
    r = post(app, token(u), s, [("files", ("notes/note_01.wav", make_wav(), "audio/wav")), ("files", ("full_session.wav", make_wav(), "audio/wav"))])
    assert r.status_code == 201 and r.json()["audio_files"] == ["full_session.wav", "notes/note_01.wav"]
    exp = u.get(f"/api/experiments/{r.json()['experiment_id']}").json()
    assert exp["title"] == s["title"] and exp["status"] == "Completed" and exp["session_id"] == s["session_id"]
    assert len(exp["notes"]) == 7                                               # the spoken title became the title, not a note
    n = exp["notes"][3]
    assert n["source"] == "recording" and n["text_source"] == "asr" and n["asr"]["needs_review"] is True
    assert n["asr"]["alternative"]["text"] and n["time_label"] and n["speaker_check"]["status"] == "match"
    assert u.get(f"/api/sessions/{s['session_id']}").json()["session"] == s       # the original JSON, untouched
    flags = {n["audio_file"]: n["has_audio"] for n in exp["notes"]}
    assert flags["notes/note_01.wav"] is True and flags["notes/note_02.wav"] is False        # the UI only shows a player where there is audio


def test_unknown_fields_are_kept(app):
    u = new_client(app, "k@x.com")
    s = sample()
    s["future"] = {"x": 1}
    s["notes"][1]["future_note_field"] = "kept"
    post(app, token(u), s)
    got = u.get(f"/api/sessions/{s['session_id']}").json()["session"]
    assert got["future"] == {"x": 1} and got["notes"][1]["future_note_field"] == "kept"


def test_json_body_and_cookie_login_also_work(app):
    u = new_client(app, "j@x.com")
    assert u.post("/api/sessions", json=sample()).status_code == 201                 # a browser login, plain JSON


def test_ingest_requires_login(app):
    assert TestClient(app).post("/api/sessions", json=sample()).status_code == 401
    assert post(app, {"Authorization": "Bearer mt_nope"}).status_code == 401


@pytest.mark.parametrize("name", ["../evil.wav", "notes/../../evil.wav", "evil.wav", "notes/note_01.exe", "/etc/passwd", "notes/note_1.wav", "..\\evil.wav"])
def test_bad_audio_names_are_refused(app, name):
    u = new_client(app, "b@x.com")
    assert post(app, token(u), files=[("files", (name, make_wav(), "audio/wav"))]).status_code == 422
    assert u.get("/api/experiments").json()["items"] == []


def test_non_wav_and_malformed_inputs(app):
    u = new_client(app, "m@x.com")
    h = token(u)
    assert post(app, h, files=[("files", ("notes/note_01.wav", b"not a wav", "audio/wav"))]).status_code == 422
    c = TestClient(app)
    assert c.post("/api/sessions", content=b"{oops", headers={**h, "content-type": "application/json"}).status_code == 422
    assert c.post("/api/sessions", json=[1], headers=h).status_code == 422
    assert c.post("/api/sessions", files=[("files", ("notes/note_01.wav", make_wav(), "audio/wav"))], headers=h).status_code == 422
    for mutate in (lambda s: s.pop("session_id"), lambda s: s.__setitem__("session_id", "../x"), lambda s: s.__setitem__("schema_version", 2),
                   lambda s: s["notes"][0].pop("text"), lambda s: s.__setitem__("notes", "nope")):
        s = sample()
        mutate(s)
        assert c.post("/api/sessions", json=s, headers=h).status_code == 422


def test_upload_size_limit(tmp_path):
    app = make_app(tmp_path, max_upload_mb=1)
    u = new_client(app, "s@x.com")
    r = TestClient(app).post("/api/sessions", content=b"x" * (2 * 1024 * 1024), headers={**token(u), "content-type": "application/json"})
    assert r.status_code == 413


def test_audio_download_and_isolation(app):
    a, b = new_client(app, "a@x.com", "Alice"), new_client(app, "b@x.com", "Bob")
    s = sample()
    wav = make_wav()
    post(app, token(a), s, [("files", ("notes/note_03.wav", wav, "audio/wav"))])
    assert a.get(f"/api/sessions/{s['session_id']}/audio/notes/note_03.wav").content == wav
    assert b.get(f"/api/sessions/{s['session_id']}/audio/notes/note_03.wav").status_code == 404
    assert b.get(f"/api/sessions/{s['session_id']}").status_code == 404 and b.get("/api/sessions").json()["total"] == 0
    for bad in ("../../../etc/passwd", "..%2f..%2fmindtrace.sqlite3", "notes/../full_session.wav"):
        assert a.get(f"/api/sessions/{s['session_id']}/audio/{bad}").status_code == 404


def test_same_session_id_for_two_researchers_does_not_clash(app):
    a, b = new_client(app, "a@x.com", "Alice"), new_client(app, "b@x.com", "Bob")
    s = sample()
    assert post(app, token(a), s, [("files", ("notes/note_01.wav", make_wav(0.1), "audio/wav"))]).status_code == 201
    s2 = sample()
    s2["title"] = "Bob's recording"
    assert post(app, token(b), s2, [("files", ("notes/note_01.wav", make_wav(0.3), "audio/wav"))]).status_code == 201
    assert a.get(f"/api/sessions/{s['session_id']}").json()["title"] == s["title"]
    assert b.get(f"/api/sessions/{s['session_id']}").json()["title"] == "Bob's recording"
    assert a.get(f"/api/sessions/{s['session_id']}/audio/notes/note_01.wav").content != b.get(f"/api/sessions/{s['session_id']}/audio/notes/note_01.wav").content


def test_repost_updates_asr_notes_but_never_a_humans_edit(app):
    u = new_client(app, "u@x.com")
    h = token(u)
    s = sample()
    r = post(app, h, s, [("files", ("notes/note_01.wav", make_wav(), "audio/wav"))])
    eid = r.json()["experiment_id"]
    notes = u.get(f"/api/experiments/{eid}").json()["notes"]
    u.patch(f"/api/notes/{notes[0]['id']}", json={"text": "my own correction"})                  # a person edited note 1
    my = u.post(f"/api/experiments/{eid}/notes", json={"text": "typed by hand"}).json()
    s["notes"][4]["text"] = "قسنا الـ temperature بعد الظهر"                                       # re-transcribed
    s["notes"][4]["asr"]["needs_review"] = False
    r2 = post(app, h, s)
    assert r2.status_code == 201 and r2.json()["updated_existing"] is True and r2.json()["experiment_id"] == eid
    after = u.get(f"/api/experiments/{eid}").json()["notes"]
    texts = [n["text"] for n in after]
    assert "my own correction" in texts and "typed by hand" in texts and "قسنا الـ temperature بعد الظهر" in texts
    assert len(after) == 8 and u.get("/api/sessions").json()["total"] == 1 and len(u.get("/api/experiments").json()["items"]) == 1
    assert r2.json()["audio_files"] == ["notes/note_01.wav"]                                      # the old audio is kept


def test_collaborators_can_play_recorded_note_audio_strangers_cannot(app):
    a, b, c = new_client(app, "a@x.com", "Alice"), new_client(app, "b@x.com", "Bob"), new_client(app, "c@x.com", "Carol")
    wav = make_wav()
    r = post(app, token(a), sample(), [("files", ("notes/note_01.wav", wav, "audio/wav"))])
    eid = r.json()["experiment_id"]
    note = next(n for n in a.get(f"/api/experiments/{eid}").json()["notes"] if n["audio_file"] == "notes/note_01.wav")
    a.post(f"/api/experiments/{eid}/collaborators", json={"identifier": "b@x.com"})
    assert b.get(f"/api/experiments/{eid}/notes/{note['id']}/audio").content == wav
    assert c.get(f"/api/experiments/{eid}/notes/{note['id']}/audio").status_code == 404
    assert a.get(f"/api/experiments/{eid}/notes/999/audio").status_code == 404


def test_session_list_pagination(app):
    u = new_client(app, "p@x.com")
    h = token(u)
    for i in range(3):
        s = sample()
        s["session_id"], s["started_at"] = f"s{i}", f"2026-10-0{i + 1}T10:00:00+03:00"
        post(app, h, s)
    r = u.get("/api/sessions?limit=2").json()
    assert r["total"] == 3 and [x["session_id"] for x in r["items"]] == ["s2", "s1"]
    assert u.get("/api/sessions?limit=0").status_code == 422


def test_a_second_recording_with_the_same_title_continues_that_experiment(app):
    u = new_client(app, "c@x.com")
    h = token(u)
    s1 = sample()
    r1 = post(app, h, s1, [("files", ("notes/note_01.wav", make_wav(0.1), "audio/wav"))])
    eid = r1.json()["experiment_id"]
    n1 = len(u.get(f"/api/experiments/{eid}").json()["notes"])
    s2 = sample()
    s2["session_id"] = "2026-10-02_10-00-00"
    s2["title"] = s1["title"].upper() + " ،"                                   # same words, different case/punctuation
    s2["duration_sec"] = 30.0
    s2["experiment_status"] = {"state": "ongoing", "source": "user", "answered_at": None}
    r2 = post(app, h, s2, [("files", ("notes/note_01.wav", make_wav(0.3), "audio/wav"))])
    assert r2.status_code == 201 and r2.json()["experiment_id"] == eid and r2.json()["updated_existing"] is False
    items = u.get("/api/experiments").json()["items"]
    assert len(items) == 1
    exp = u.get(f"/api/experiments/{eid}").json()
    assert len(exp["notes"]) == n1 * 2 and exp["status"] == "Active"
    assert exp["session_id"] == s1["session_id"]
    # each note plays the audio of ITS recording
    played = [n for n in exp["notes"] if n["has_audio"]]
    assert len(played) == 2
    bodies = {u.get(f"/api/experiments/{eid}/notes/{n['id']}/audio").content for n in played}
    assert len(bodies) == 2
    # re-posting the second recording updates its own notes only
    s2["notes"][4]["text"] = "نص جديد للتسجيل الثاني"
    post(app, h, s2)
    after = u.get(f"/api/experiments/{eid}").json()["notes"]
    assert len(after) == n1 * 2 and sum(n["text"] == "نص جديد للتسجيل الثاني" for n in after) == 1


def test_a_different_title_makes_a_new_experiment(app):
    u = new_client(app, "d@x.com")
    h = token(u)
    post(app, h, sample())
    s2 = sample()
    s2["session_id"], s2["title"] = "2026-10-03_09-00-00", "تجربة مختلفة تماماً"
    post(app, h, s2)
    assert len(u.get("/api/experiments").json()["items"]) == 2


def test_titles_never_merge_across_researchers(app):
    a, b = new_client(app, "a2@x.com"), new_client(app, "b2@x.com")
    post(app, token(a), sample())
    post(app, token(b), sample())
    assert len(a.get("/api/experiments").json()["items"]) == 1 and len(b.get("/api/experiments").json()["items"]) == 1
