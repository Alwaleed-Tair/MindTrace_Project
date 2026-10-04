import pytest
from fastapi.testclient import TestClient

from helpers import make_app, make_exp, new_client


@pytest.fixture
def app(tmp_path):
    return make_app(tmp_path)


def team(c, name="Materials lab"):
    r = c.post("/api/teams", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_a_team_and_see_it(app):
    a = new_client(app, "owner@x.com", "Noor")
    t = team(a)
    assert t["name"] == "Materials lab" and t["role"] == "owner" and t["member_count"] == 1 and t["invite_token"]
    assert [m["name"] for m in t["members"]] == ["Noor"] and t["members"][0]["role"] == "owner"
    assert [x["id"] for x in a.get("/api/teams").json()["items"]] == [t["id"]]
    for bad in ({"name": ""}, {"name": "  "}, {"name": "x" * 81}, {}):
        assert a.post("/api/teams", json=bad).status_code == 422


def test_strangers_see_nothing(app):
    a, s = new_client(app, "o@x.com", "Owner"), new_client(app, "s@x.com", "Stranger")
    t = team(a)
    assert s.get(f"/api/teams/{t['id']}").status_code == 404
    assert s.post(f"/api/teams/{t['id']}/members", json={"identifier": "s@x.com"}).status_code == 404
    assert s.get("/api/teams").json()["items"] == []
    assert TestClient(app).get("/api/teams").status_code == 401


def test_join_with_the_invite_link_and_reset_it(app):
    a, b = new_client(app, "o@x.com", "Owner"), new_client(app, "b@x.com", "Bob")
    t = team(a)
    token = t["invite_token"]
    p = b.get(f"/api/invites/{token}").json()
    assert p["team"]["name"] == "Materials lab" and p["owner"]["name"] == "Owner" and p["already_member"] is False
    joined = b.post(f"/api/invites/{token}/accept").json()
    assert joined["role"] == "member" and joined["member_count"] == 2 and "invite_token" not in joined   # members don't see the link
    assert b.post(f"/api/invites/{token}/accept").status_code == 200                                     # twice is harmless
    assert any(n["kind"] == "team_joined" for n in a.get("/api/notifications").json()["items"])
    new = a.post(f"/api/teams/{t['id']}/invite").json()["invite_token"]
    assert new != token and b.get(f"/api/invites/{token}").status_code == 404
    assert b.post(f"/api/teams/{t['id']}/invite").status_code == 403


def test_add_members_and_roles(app):
    a = new_client(app, "o@x.com", "Owner")
    sup, m, z = new_client(app, "sup@x.com", "Sara"), new_client(app, "m@x.com", "Omar"), new_client(app, "z@x.com", "Zed")
    t = team(a)
    tid = t["id"]
    r = a.post(f"/api/teams/{tid}/members", json={"identifier": "sup@x.com", "role": "supervisor"})
    assert r.status_code == 201 and {x["name"]: x["role"] for x in r.json()["members"]} == {"Owner": "owner", "Sara": "supervisor"}
    assert any(n["kind"] == "team_added" for n in sup.get("/api/notifications").json()["items"])
    assert a.post(f"/api/teams/{tid}/members", json={"identifier": "sup@x.com"}).status_code == 422        # already in
    assert a.post(f"/api/teams/{tid}/members", json={"identifier": "nobody@x.com"}).status_code == 404
    assert a.post(f"/api/teams/{tid}/members", json={"identifier": "m@x.com", "role": "owner"}).status_code == 422
    # a supervisor adds members but not supervisors
    assert sup.post(f"/api/teams/{tid}/members", json={"identifier": "m@x.com", "role": "supervisor"}).status_code == 403
    assert sup.post(f"/api/teams/{tid}/members", json={"identifier": "m@x.com"}).status_code == 201
    # a member cannot add or remove anyone
    assert m.post(f"/api/teams/{tid}/members", json={"identifier": "z@x.com"}).status_code == 403
    sara = next(x for x in r.json()["members"] if x["name"] == "Sara")["id"]
    assert m.delete(f"/api/teams/{tid}/members/{sara}").status_code == 403
    # only the owner changes roles; the owner's role never changes
    omar = next(x for x in a.get(f"/api/teams/{tid}").json()["members"] if x["name"] == "Omar")["id"]
    assert sup.patch(f"/api/teams/{tid}/members/{omar}", json={"role": "supervisor"}).status_code == 403
    assert a.patch(f"/api/teams/{tid}/members/{omar}", json={"role": "supervisor"}).json()["members"][2]["role"] == "supervisor"
    owner_id = a.get("/api/auth/me").json()["user"]["id"]
    assert a.patch(f"/api/teams/{tid}/members/{owner_id}", json={"role": "member"}).status_code == 422
    # leaving, removing, and the owner who cannot leave
    assert a.delete(f"/api/teams/{tid}/members/{owner_id}").status_code == 422
    assert m.delete(f"/api/teams/{tid}/members/{omar}").status_code == 204
    assert m.get(f"/api/teams/{tid}").status_code == 404
    assert a.delete(f"/api/teams/{tid}/members/{sara}").status_code == 204
    assert z.get("/api/teams").json()["items"] == []


def test_team_experiments_are_shared_with_every_member(app):
    a, b, s = new_client(app, "o@x.com", "Owner"), new_client(app, "b@x.com", "Bob"), new_client(app, "s@x.com", "Stranger")
    t = team(a)
    b.post(f"/api/invites/{t['invite_token']}/accept")
    private = make_exp(a, "Private one")
    r = a.post("/api/experiments", json={"title": "Team one", "team_id": t["id"]})
    assert r.status_code == 201 and r.json()["team"] == {"id": t["id"], "name": "Materials lab"}
    shared = r.json()
    assert [e["title"] for e in b.get("/api/experiments").json()["items"]] == ["Team one"]
    assert b.get(f"/api/experiments/{private['id']}").status_code == 404
    got = b.get(f"/api/experiments/{shared['id']}").json()
    assert got["role"] == "editor"
    assert b.post(f"/api/experiments/{shared['id']}/notes", json={"text": "seen by Bob", "kind": "hypothesis"}).status_code == 201
    assert any(n["kind"] == "note_added" for n in a.get("/api/notifications").json()["items"])
    assert b.patch(f"/api/experiments/{shared['id']}", json={"team_id": None}).status_code == 403   # only the owner shares
    assert b.delete(f"/api/experiments/{shared['id']}").status_code == 403
    # share an existing experiment, then stop sharing
    assert a.patch(f"/api/experiments/{private['id']}", json={"team_id": t["id"]}).json()["team"]["id"] == t["id"]
    assert len(b.get("/api/experiments").json()["items"]) == 2
    assert a.patch(f"/api/experiments/{private['id']}", json={"team_id": None}).json()["team"] is None
    assert b.get(f"/api/experiments/{private['id']}").status_code == 404
    # you can only share with a team you are in
    other = team(s, "Other lab")
    assert a.post("/api/experiments", json={"title": "x", "team_id": other["id"]}).status_code == 404
    assert a.patch(f"/api/experiments/{private['id']}", json={"team_id": other["id"]}).status_code == 404
    detail = a.get(f"/api/teams/{t['id']}").json()
    assert [e["title"] for e in detail["experiments"]] == ["Team one"] and detail["experiment_count"] == 1
    bob = next(x for x in detail["members"] if x["name"] == "Bob")
    assert bob["notes_14d"] == 1 and bob["email"] == "b@x.com"
    assert "email" not in next(x for x in b.get(f"/api/teams/{t['id']}").json()["members"] if x["name"] == "Owner")


def test_deleting_a_team_keeps_the_experiments(app):
    a, b = new_client(app, "o@x.com", "Owner"), new_client(app, "b@x.com", "Bob")
    t = team(a)
    b.post(f"/api/invites/{t['invite_token']}/accept")
    e = a.post("/api/experiments", json={"title": "Team one", "team_id": t["id"]}).json()
    assert b.delete(f"/api/teams/{t['id']}").status_code == 403
    assert a.patch(f"/api/teams/{t['id']}", json={"name": "Renamed lab"}).json()["name"] == "Renamed lab"
    assert a.delete(f"/api/teams/{t['id']}").status_code == 204
    assert a.get(f"/api/experiments/{e['id']}").json()["team"] is None
    assert b.get(f"/api/experiments/{e['id']}").status_code == 404 and b.get("/api/teams").json()["items"] == []
