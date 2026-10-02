import pytest
from fastapi.testclient import TestClient

from helpers import H, make_app, make_exp, new_client


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path)


def test_create_list_get_update_delete(app):
    c = new_client(app, "a@x.com", "Alice")
    e = make_exp(c, "Surface tension under vibration", "What changes?")
    assert e["status"] == "Active" and e["code"] == f"EXP-{e['id']}" and e["role"] == "owner" and e["notes"] == []
    assert [x["id"] for x in c.get("/api/experiments").json()["items"]] == [e["id"]]
    assert c.get(f"/api/experiments/{e['id']}").json()["title"] == "Surface tension under vibration"
    r = c.patch(f"/api/experiments/{e['id']}", json={"title": "Renamed", "summary": "new", "tags": ["Fluids", " "]})
    assert r.status_code == 200 and r.json()["title"] == "Renamed" and r.json()["tags"] == ["Fluids"]
    assert c.delete(f"/api/experiments/{e['id']}").status_code == 204
    assert c.get(f"/api/experiments/{e['id']}").status_code == 404 and c.get("/api/experiments").json()["items"] == []


@pytest.mark.parametrize("body", [{}, {"title": ""}, {"title": "   "}, {"title": "x" * 161}, {"title": "ok", "tags": "nope"}, {"title": "ok", "bad": 1}])
def test_create_validation(app, body):
    assert new_client(app, "v@x.com").post("/api/experiments", json=body).status_code == 422


def test_status_buttons_persist(app):
    c = new_client(app, "s@x.com")
    e = make_exp(c)
    for status in ("Completed", "Paused", "Active"):
        r = c.patch(f"/api/experiments/{e['id']}", json={"status": status})
        assert r.status_code == 200 and r.json()["status"] == status
        assert c.get(f"/api/experiments/{e['id']}").json()["status"] == status
    assert c.patch(f"/api/experiments/{e['id']}", json={"status": "Done"}).status_code == 422
    assert c.patch(f"/api/experiments/{e['id']}", json={}).status_code == 422


def test_filter_search_sort(app):
    c = new_client(app, "f@x.com")
    a, b = make_exp(c, "Alpha catalyst"), make_exp(c, "Beta ceramic")
    c.patch(f"/api/experiments/{b['id']}", json={"status": "Paused"})
    names = lambda **p: [x["title"] for x in c.get("/api/experiments", params=p).json()["items"]]
    assert names(status="Paused") == ["Beta ceramic"] and names(status="All") == ["Beta ceramic", "Alpha catalyst"]
    assert names(q="CATALYST") == ["Alpha catalyst"] and names(q="zzz") == []
    assert names(sort="oldest") == ["Alpha catalyst", "Beta ceramic"]
    assert c.get("/api/experiments", params={"status": "Nope"}).status_code == 422


@pytest.mark.parametrize("bad", ["abc", "999", "-1", "1.5"])
def test_invalid_ids_are_404(app, bad):
    c = new_client(app, "i@x.com")
    assert c.get(f"/api/experiments/{bad}").status_code == 404
    assert c.patch(f"/api/experiments/{bad}", json={"status": "Paused"}).status_code == 404
    assert c.delete(f"/api/experiments/{bad}").status_code == 404


def test_users_cannot_see_or_touch_each_others_data(app):
    a, b = new_client(app, "a@x.com", "Alice"), new_client(app, "b@x.com", "Bob")
    e = make_exp(a, "Alice private")
    n = a.post(f"/api/experiments/{e['id']}/notes", json={"text": "secret observation"}).json()
    assert b.get("/api/experiments").json()["items"] == []
    assert b.get(f"/api/experiments/{e['id']}").status_code == 404                      # same answer as "does not exist"
    assert b.patch(f"/api/experiments/{e['id']}", json={"status": "Paused"}).status_code == 404
    assert b.delete(f"/api/experiments/{e['id']}").status_code == 404
    assert b.post(f"/api/experiments/{e['id']}/notes", json={"text": "intruder"}).status_code == 404
    assert b.patch(f"/api/notes/{n['id']}", json={"text": "hacked"}).status_code == 404
    assert b.delete(f"/api/notes/{n['id']}").status_code == 404
    assert b.get(f"/api/experiments/{e['id']}/insights").status_code == 404
    assert b.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": a.user["email"]}).status_code == 404
    assert b.get("/api/stats").json()["total_threads"] == 0
    assert a.get(f"/api/experiments/{e['id']}").json()["notes"][0]["text"] == "secret observation"          # untouched


def test_notes_crud_and_validation(app):
    c = new_client(app, "n@x.com")
    e = make_exp(c)
    n = c.post(f"/api/experiments/{e['id']}/notes", json={"text": "  At 23.4°C the colour changed.  ", "kind": "hypothesis"})
    assert n.status_code == 201 and n.json()["text"] == "At 23.4°C the colour changed." and n.json()["kind"] == "hypothesis"
    nid = n.json()["id"]
    assert c.patch(f"/api/notes/{nid}", json={"text": "edited", "kind": "decision"}).json()["kind"] == "decision"
    assert c.get(f"/api/experiments/{e['id']}").json()["notes"][0]["text"] == "edited"
    for bad in ({"text": ""}, {"text": "   "}, {"text": "x" * 5001}, {"text": "ok", "kind": "rumour"}, {}):
        assert c.post(f"/api/experiments/{e['id']}/notes", json=bad).status_code == 422, bad
    assert c.patch(f"/api/notes/{nid}", json={}).status_code == 422
    assert c.delete(f"/api/notes/{nid}").status_code == 204 and c.get(f"/api/experiments/{e['id']}").json()["notes"] == []
    assert c.patch("/api/notes/99999", json={"text": "x"}).status_code == 404


def test_malformed_json_is_a_clean_422(app):
    c = new_client(app, "m@x.com")
    r = c.post("/api/experiments", content=b"{broken", headers={"content-type": "application/json", **H})
    assert r.status_code == 422 and r.json()["detail"]


def test_data_survives_a_backend_restart_and_a_new_login(app, tmp_path):
    c = new_client(app, "p@x.com", "Persist")
    e = make_exp(c, "Persistent")
    c.post(f"/api/experiments/{e['id']}/notes", json={"text": "still here"})
    c.patch(f"/api/experiments/{e['id']}", json={"status": "Completed"})
    app.state.db.close()
    app2 = make_app(tmp_path)                                    # a brand new process on the same database file
    assert c.cookies                                             # the old cookie is still valid: sessions live in the database
    c2 = TestClient(app2, headers=H, cookies=c.cookies)
    got = c2.get(f"/api/experiments/{e['id']}").json()
    assert got["status"] == "Completed" and got["notes"][0]["text"] == "still here"
    fresh = TestClient(app2, headers=H)
    assert fresh.post("/api/auth/login", json={"email": "p@x.com", "password": "correct-horse-1"}).status_code == 200
    assert fresh.get(f"/api/experiments/{e['id']}").json()["title"] == "Persistent"


def test_owner_vs_collaborator_rights(app):
    a, b = new_client(app, "a@x.com", "Alice"), new_client(app, "b@x.com", "Bob")
    e = make_exp(a)
    assert a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"}).status_code == 201
    got = b.get(f"/api/experiments/{e['id']}").json()
    assert got["role"] == "editor" and got["owner"]["name"] == "Alice"
    assert b.patch(f"/api/experiments/{e['id']}", json={"status": "Paused"}).status_code == 200          # a collaborator can change status
    assert b.patch(f"/api/experiments/{e['id']}", json={"title": "mine now"}).status_code == 403          # ...but not rename
    assert b.delete(f"/api/experiments/{e['id']}").status_code == 403
    mine = b.post(f"/api/experiments/{e['id']}/notes", json={"text": "bob's note"}).json()
    theirs = a.post(f"/api/experiments/{e['id']}/notes", json={"text": "alice's note"}).json()
    assert b.patch(f"/api/notes/{theirs['id']}", json={"text": "x"}).status_code == 403
    assert a.patch(f"/api/notes/{mine['id']}", json={"text": "owner edits"}).status_code == 200            # the owner can edit any note
    assert b.delete(f"/api/notes/{theirs['id']}").status_code == 403


def test_list_includes_the_note_trace_and_kind_counts(tmp_path):
    from helpers import make_app, make_exp, new_client
    c = new_client(make_app(tmp_path), "trace@x.com")
    e = make_exp(c)
    for text, kind in [("seen", "observation"), ("maybe", "hypothesis"), ("do it", "decision"), ("again", "observation")]:
        assert c.post(f"/api/experiments/{e['id']}/notes", json={"text": text, "kind": kind}).status_code == 201
    item = c.get("/api/experiments").json()["items"][0]
    assert [m["kind"] for m in item["trace"]] == ["observation", "hypothesis", "decision", "observation"]
    assert all(m["at"] for m in item["trace"])
    assert item["kind_counts"] == {"observation": 2, "hypothesis": 1, "decision": 1}
