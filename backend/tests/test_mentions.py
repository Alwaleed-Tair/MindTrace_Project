import pytest
from fastapi.testclient import TestClient

from helpers import make_app, make_exp, new_client


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path)


def tag(c):
    return "@{" + c.user["id"] + "}"


def kinds(c):
    """Note-related notifications only (setup also sends 'added you' ones)."""
    return [n["kind"] for n in c.get("/api/notifications").json()["items"] if n["kind"] in ("mentioned", "note_added", "note_updated")]


def setup(app):
    a, b, t, s = (new_client(app, "o@x.com", "Owner"), new_client(app, "b@x.com", "Bob"),
                  new_client(app, "t@x.com", "Tala"), new_client(app, "s@x.com", "Stranger"))
    e = make_exp(a)
    a.post(f"/api/experiments/{e['id']}/collaborators", json={"identifier": "b@x.com"})
    team = a.post("/api/teams", json={"name": "Lab"}).json()
    t.post(f"/api/invites/{team['invite_token']}/accept")
    a.patch(f"/api/experiments/{e['id']}", json={"team_id": team["id"]})
    return a, b, t, s, e


def test_members_lists_owner_collaborators_and_team_without_emails(app):
    a, b, t, s, e = setup(app)
    items = b.get(f"/api/experiments/{e['id']}/members").json()["items"]
    assert [(m["name"], m["role"]) for m in items] == [("Owner", "owner"), ("Bob", "member"), ("Tala", "member")]
    assert all("email" not in m for m in items) and items[0]["id"] == a.user["id"]
    assert s.get(f"/api/experiments/{e['id']}/members").status_code == 404
    assert TestClient(app).get(f"/api/experiments/{e['id']}/members").status_code == 401


def test_a_mention_notifies_that_person_once_and_is_shown_on_the_note(app):
    a, b, t, s, e = setup(app)
    r = a.post(f"/api/experiments/{e['id']}/notes", json={"text": f"{tag(b)} check the sample, {tag(b)} and {tag(s)}"})
    assert r.status_code == 201
    note = r.json()
    assert [m["name"] for m in note["mentions"]] == ["Bob"]          # the stranger is not a member: not a mention
    assert kinds(b) == ["mentioned"]                                  # one specific notification, not also "note_added"
    assert kinds(t) == ["note_added"] and kinds(s) == [] and kinds(a) == []
    msg = next(n for n in b.get("/api/notifications").json()["items"] if n["kind"] == "mentioned")
    assert msg["note_id"] == note["id"] and msg["actor"]["name"] == "Owner"


def test_mentioning_yourself_sends_nothing(app):
    a, b, t, s, e = setup(app)
    a.post(f"/api/experiments/{e['id']}/notes", json={"text": f"{tag(a)} remember this"})
    assert kinds(a) == []


def test_editing_only_tells_people_newly_mentioned(app):
    a, b, t, s, e = setup(app)
    n = a.post(f"/api/experiments/{e['id']}/notes", json={"text": f"{tag(b)} look"}).json()
    r = a.patch(f"/api/notes/{n['id']}", json={"text": f"{tag(b)} {tag(t)} look again"})
    assert [m["name"] for m in r.json()["mentions"]] == ["Bob", "Tala"]
    assert kinds(b) == ["note_updated", "mentioned"]                  # Bob was already mentioned: a plain update
    assert kinds(t) == ["mentioned", "note_added"]


def test_renaming_keeps_the_mention_and_the_ai_sees_the_name(app):
    a, b, t, s, e = setup(app)
    a.post(f"/api/experiments/{e['id']}/notes", json={"text": f"{tag(b)} weigh it"})
    b.patch("/api/auth/me", json={"name": "Dr. Bob Ali"})
    note = a.get(f"/api/experiments/{e['id']}").json()["notes"][0]
    assert note["mentions"][0]["name"] == "Dr. Bob Ali" and note["text"].startswith("@{MT-")
    from services import insights
    data = insights.build_input(app.state.db, int(e["id"]))
    assert data["notes"][0]["text"] == "@Dr. Bob Ali weigh it"
