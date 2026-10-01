import json

import httpx

from helpers import make_app, new_client
from services import ai, literature
from test_insights import good, reply
from test_sessions import post, token

ARXIV = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1</id><title>Temperature and reaction rate</title>
<summary>Rates grow with temperature.</summary><published>2010-01-01T00:00:00Z</published><author><name>A. Author</name></author></entry></feed>"""
CROSSREF = {"message": {"items": [{"title": ["Kinetics of X"], "DOI": "10.1/x", "issued": {"date-parts": [[2015]]}, "container-title": ["J Chem"],
                                   "author": [{"given": "B", "family": "Writer"}], "URL": "https://doi.org/10.1/x"}]}}


def router(down=(), assess=None, queries=None):
    seen = {"hosts": [], "scholar_bodies": []}

    def handler(req: httpx.Request):
        host = req.url.host
        seen["hosts"].append(host)
        if host == "api.deepseek.com":
            sys_prompt = json.loads(req.content)["messages"][0]["content"]
            if "search queries" in sys_prompt:
                return reply(queries if queries is not None else {"queries": ["temperature effect on reaction rate", "chemical kinetics temperature"]})
            if "how original" in sys_prompt:
                return reply(assess or {"originality_score": 64, "rationale": "known principle", "caveat": "limited search",
                                        "similar": [{"index": 0, "similarity": "high", "why": "same topic"}, {"index": 99, "similarity": "high", "why": "ghost"}]})
            return reply(good())
        seen["scholar_bodies"].append(str(req.url))
        if host in down:
            return httpx.Response(429, json={"message": "slow down"})
        if host == "export.arxiv.org":
            return httpx.Response(200, text=ARXIV)
        if host == "api.crossref.org":
            return httpx.Response(200, json=CROSSREF)
        return httpx.Response(429, json={})
    return handler, seen


def run(tmp_path, handler):
    app = make_app(tmp_path, handler, deepseek_api_key="sk-test-secret", literature_enabled=True)
    u = new_client(app, "r@x.com", "Researcher")
    eid = post(app, token(u)).json()["experiment_id"]
    return u, eid


def test_originality_uses_real_papers_and_drops_made_up_ones(tmp_path):
    handler, seen = router(down=("api.openalex.org", "api.semanticscholar.org"))
    u, eid = run(tmp_path, handler)
    res = u.get(f"/api/experiments/{eid}/insights").json()["result"]
    lit = res["literature"]
    assert lit["status"] == "ok" and lit["score"] == 64 and lit["sources"] == ["arXiv", "Crossref"]
    assert [p["title"] for p in lit["similar"]] != [] and all(p["url"] for p in lit["similar"])
    assert len(lit["similar"]) == 1 and lit["similar"][0]["similarity"] == "high"             # index 99 does not exist: dropped
    assert "abstract" not in lit["similar"][0]
    assert u.get(f"/api/experiments/{eid}").json()["originality"] == 64                        # the literature-checked number wins
    urls = " ".join(seen["scholar_bodies"])
    assert "temperature" in urls and "%D" not in urls                                          # only English search words leave the server


def test_only_search_queries_reach_the_scholarly_sources(tmp_path):
    handler, seen = router()
    u, eid = run(tmp_path, handler)
    joined = " ".join(seen["scholar_bodies"])
    assert "قسنا" not in joined and "جسنا" not in joined


def test_no_source_reachable_keeps_the_models_own_estimate(tmp_path):
    handler, _ = router(down=("api.openalex.org", "api.semanticscholar.org", "export.arxiv.org", "api.crossref.org"))
    u, eid = run(tmp_path, handler)
    r = u.get(f"/api/experiments/{eid}/insights").json()
    assert r["status"] == "done" and r["result"]["literature"]["status"] == "unavailable"
    assert u.get(f"/api/experiments/{eid}").json()["originality"] == 33


def test_non_scientific_notes_skip_the_search(tmp_path):
    handler, seen = router(queries={"queries": []})
    u, eid = run(tmp_path, handler)
    assert u.get(f"/api/experiments/{eid}/insights").json()["result"]["literature"]["status"] == "skipped"
    assert not seen["scholar_bodies"]


def test_bad_assessment_never_breaks_the_insights(tmp_path):
    handler, _ = router(assess={"nonsense": True})
    u, eid = run(tmp_path, handler)
    r = u.get(f"/api/experiments/{eid}/insights").json()
    assert r["status"] == "done" and r["result"]["literature"]["status"] == "failed" and r["result"]["summary"]


def test_parse_helpers():
    assert ai.parse_queries('{"queries": ["a b c d", "A B C D", "x"]}') == ["a b c d"]
    papers = [{"title": "T", "authors": [], "year": 2020, "venue": "", "url": "u", "doi": "", "abstract": "a", "source": "arXiv"}]
    out = ai.parse_assessment('{"originality_score": 150, "similar": [{"index": 0, "similarity": "weird"}, {"index": 0}]}', papers)
    assert out["score"] == 100 and len(out["similar"]) == 1 and out["similar"][0]["similarity"] == "low"
    assert literature._key({"doi": "10.1/X", "title": "a"}) == "10.1/x"
