"""The mock must keep the same shapes as the real backend, so the UI built on it keeps working."""
import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import mock_backend as mb
from test_api import SAMPLE, make_client


def test_mock_and_real_backend_have_the_same_keys(tmp_path):
    real, _ = make_client(tmp_path)
    s = json.loads(SAMPLE.read_text(encoding="utf-8"))
    real.post("/api/sessions", json=s)
    mb.SESSIONS.clear()
    mb.SESSIONS[s["session_id"]] = s
    srv = ThreadingHTTPServer(("127.0.0.1", 0), mb.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        base = f"http://127.0.0.1:{srv.server_port}"
        get = lambda p: json.loads(urllib.request.urlopen(base + p, timeout=5).read())
        a, b = real.get("/api/sessions").json(), get("/api/sessions")
        assert set(a) == set(b) and set(a["items"][0]) == set(b["items"][0])
        a, b = real.get(f"/api/sessions/{s['session_id']}").json(), get(f"/api/sessions/{s['session_id']}")
        assert set(a) == set(b) and set(a["ai"]) == set(b["ai"]) and set(a["ai"]["result"] or b["ai"]["result"]) >= {"summary", "documentation_quality", "novelty", "note_suggestions", "notes_to_review", "meta"}
        assert set(get("/api/health")) == set(real.get("/api/health").json())
        wav = urllib.request.urlopen(f"{base}/api/sessions/{s['session_id']}/audio/notes/note_01.wav", timeout=5).read()
        assert wav.startswith(b"RIFF")
        req = urllib.request.Request(base + "/api/sessions", data=json.dumps(dict(s, session_id="x2")).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        assert json.loads(urllib.request.urlopen(req, timeout=5).read())["session_id"] == "x2"
    finally:
        srv.shutdown()
