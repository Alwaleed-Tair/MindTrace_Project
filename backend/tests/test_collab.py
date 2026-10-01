import pytest

from helpers import make_app, make_exp, new_client


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path, dev_tools=True)


def team(app):
    a, b, c = new_client(app, "a@x.com", "Alice"), new_client(app, "b@x.com", "Bob"), new_client(app, "c@x.com", "Carol")
    return a, b, c


def test_search_finds_exact_email_or_id_only(app):
    a, b, _ = team(app)
    by_email = a.get("/api/users/search", params={"q": "B@X.com"}).json()["items"]
    by_id = a.get("/api/users/search", params={"q": b.user["id"].lower()}).json()["items"]
    assert [u["name"] for u in by_email] == [u["name"] for u in by_id] == ["Bob"] and by_id[0]["id"] == b.user["id"]
    for q in ("b@x", "bob", "Bo", b.user["id"][:6], "", "   ", "MT-ZZZZZZZZ", "nobody@x.com", "' OR 1=1 --"):
        assert a.get("/api/users/search", params={"q": q}).json()["items"] == [], q
    assert a.get("/api/users/search", params={"q": "a@x.com"}).json()["items"] == []                  # not yourself


def test_add_people_by_email_and_by_id(app):
    a, b, c = team(app)
    e = make_exp(a)
    r = a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    assert r.status_code == 201 and r.json()["collaborator"]["name"] == "Bob" and "email" not in r.json()["collaborator"]
    assert [p["name"] for p in r.json()["experiment"]["collaborators"]] == ["Bob"]
    assert a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": c.user["id"]}).status_code == 201
    assert {p["name"] for p in a.get(f"/api/experiments/{e['id']}").json()["collaborators"]} == {"Bob", "Carol"}
    assert [x["id"] for x in c.get("/api/experiments").json()["items"]] == [e["id"]]                 # it shows up for them


@pytest.mark.parametrize("identifier,code", [("nobody@x.com", 404), ("MT-ZZZZZZZZ", 404), ("not an id", 404), ("", 404), ("a@x.com", 422), ("b@x.com", 422)])
def test_add_people_errors(app, identifier, code):
    a, b, _ = team(app)
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    assert a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": identifier}).status_code == code


def test_recent_collaborators(app):
    a, b, c = team(app)
    e1, e2 = make_exp(a, "one"), make_exp(a, "two")
    assert a.get("/api/collaborators/recent").json()["items"] == []
    a.post(f"/api/experiments/{e1['id']}/collaborators", json={"identifier": "b@x.com"})
    a.post(f"/api/experiments/{e2['id']}/collaborators", json={"identifier": "c@x.com"})
    a.post(f"/api/experiments/{e2['id']}/collaborators", json={"identifier": "b@x.com"})
    names = [u["name"] for u in a.get("/api/collaborators/recent").json()["items"]]
    assert names == ["Bob", "Carol"] and len(names) == len(set(names))                                # newest first, no duplicates
    assert b.get("/api/collaborators/recent").json()["items"] == []                                  # each user has their own list


def test_owner_can_remove_a_collaborator(app):
    a, b, _ = team(app)
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    assert b.delete(f"/api/experiments/{e['id']}/collaborators/{b.user['id']}").status_code == 403
    assert a.delete(f"/api/experiments/{e['id']}/collaborators/{b.user['id']}").status_code == 204
    assert b.get(f"/api/experiments/{e['id']}").status_code == 404
    assert a.delete(f"/api/experiments/{e['id']}/collaborators/{b.user['id']}").status_code == 404


def test_collaborator_note_notifies_the_others_but_not_the_author(app):
    a, b, c = team(app)
    e = make_exp(a, "Shared run")
    for who in ("b@x.com", "c@x.com"):
        a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": who})
    b.post("/api/notifications/read", json={})                                          # clear the "added you" ones
    c.post("/api/notifications/read", json={})
    a.post("/api/notifications/read", json={})
    b.post(f"/api/experiments/{e['id']}/notes", json={"text": "Bob saw drift"})
    na = a.get("/api/notifications").json()
    assert na["unread_count"] == 1 and na["items"][0]["kind"] == "note_added" and na["items"][0]["actor"]["name"] == "Bob"
    assert na["items"][0]["experiment"]["title"] == "Shared run" and na["items"][0]["read"] is False
    assert c.get("/api/notifications").json()["unread_count"] == 1                       # Carol is told too
    assert b.get("/api/notifications").json()["unread_count"] == 0                       # the author is not


def test_note_update_status_change_and_added_you_notifications(app):
    a, b, _ = team(app)
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    nb = b.get("/api/notifications").json()
    assert nb["unread_count"] == 1 and nb["items"][0]["kind"] == "collaborator_added" and nb["items"][0]["actor"]["name"] == "Alice"
    n = b.post(f"/api/experiments/{e['id']}/notes", json={"text": "first"}).json()
    a.post("/api/notifications/read", json={})
    b.patch(f"/api/notes/{n['id']}", json={"text": "edited"})
    b.patch(f"/api/experiments/{e['id']}", json={"status": "Paused"})
    kinds = [x["kind"] for x in a.get("/api/notifications", params={"unread": True}).json()["items"]]
    assert kinds == ["status_changed", "note_updated"]


def test_mark_read_and_unread_filter(app):
    a, b, _ = team(app)
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    for t in ("one", "two", "three"):
        b.post(f"/api/experiments/{e['id']}/notes", json={"text": t})
    items = a.get("/api/notifications").json()["items"]
    assert len(items) == 3 and a.get("/api/notifications").json()["unread_count"] == 3
    assert a.post("/api/notifications/read", json={"ids": [items[0]["id"]]}).json()["marked"] == 1
    assert a.get("/api/notifications").json()["unread_count"] == 2
    assert len(a.get("/api/notifications", params={"unread": True}).json()["items"]) == 2
    assert b.post("/api/notifications/read", json={"ids": [items[1]["id"]]}).json()["marked"] == 0           # not yours
    assert a.get("/api/notifications").json()["unread_count"] == 2
    assert a.post("/api/notifications/read", json={}).json()["marked"] == 2 and a.get("/api/notifications").json()["unread_count"] == 0


def test_notifications_are_private(app):
    a, b, c = team(app)
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    b.post(f"/api/experiments/{e['id']}/notes", json={"text": "hello"})
    assert c.get("/api/notifications").json() == {"unread_count": 0, "items": []}


def test_mock_trigger_goes_through_the_real_notification_path(app):
    a = new_client(app, "a@x.com", "Alice")
    assert a.post("/api/dev/simulate-collaborator-note", json={}).status_code == 422                   # no experiment yet
    e = make_exp(a, "Mock target")
    r = a.post("/api/dev/simulate-collaborator-note", json={"experiment_id": e["id"]})
    assert r.status_code == 200 and "Mock colleague" in r.json()["note"]["text"]
    n = a.get("/api/notifications").json()
    assert n["unread_count"] == 1 and n["items"][0]["actor"]["name"].startswith("Dr. Lina")
    assert a.get(f"/api/experiments/{e['id']}").json()["notes"][-1]["author"]["name"].startswith("Dr. Lina")
    assert a.post("/api/dev/simulate-collaborator-note", json={"experiment_id": "999"}).status_code == 404


def test_mock_trigger_is_off_by_default(tmp_path):
    a = new_client(make_app(tmp_path), "a@x.com", "Alice")
    make_exp(a)
    assert a.post("/api/dev/simulate-collaborator-note", json={}).status_code == 404


def test_deleting_an_experiment_removes_its_notifications(app):
    a, b, _ = team(app)
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    assert b.get("/api/notifications").json()["unread_count"] == 1
    a.delete(f"/api/experiments/{e['id']}")
    assert b.get("/api/notifications").json() == {"unread_count": 0, "items": []}
