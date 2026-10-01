"""A fake platform API for building the web UI WITHOUT the real backend, DeepSeek, or any install (Python only).

Same URLs and JSON shapes as the real backend (docs/API_CONTRACT.md), filled from ../bridge/samples/*.json with a
made-up AI review. Audio requests return a short placeholder tone. Data lives in memory (gone on restart).

    python mock_backend.py            # http://localhost:8000
    python mock_backend.py --port 9000
"""
from __future__ import annotations

import argparse
import io
import json
import math
import struct
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

SAMPLES = Path(__file__).resolve().parent.parent / "bridge" / "samples"
SESSIONS: dict[str, dict] = {}


def tone_wav(seconds: float = 1.5) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(int(16000 * seconds))))
    return buf.getvalue()


def fake_ai(s: dict) -> dict:
    review = [n["id"] for n in s["notes"] if (n.get("asr") or {}).get("needs_review")]
    return {"summary": "ملخص تجريبي (مو حقيقي): تجربة سجّل فيها الباحث قياسات ومشاهدات بالعربي مع مصطلحات إنجليزية.",
            "documentation_quality": {"score": 70, "strengths": ["الوحدات مذكورة"], "gaps": ["ما ذُكر الهدف من التجربة"]},
            "novelty": {"score": 30, "rationale": "قياس معتاد (تجريبي).", "caveat": "تقدير من النموذج بدون بحث في الأدبيات."},
            "note_suggestions": [{"note_id": i, "suggested_text": f"(اقتراح تجريبي للنوت {i})", "reason": "مثال", "confidence": "low"}
                                 for i in review[:2]],
            "notes_to_review": review, "meta": {"model": "mock", "provider": "mock", "generated_at": "2026-01-01T00:00:00+00:00"}}


def summary(s: dict, ai_status: str) -> dict:
    return {"session_id": s["session_id"], "title": s["title"], "started_at": s["started_at"], "duration_sec": s["duration_sec"],
            "note_count": s["note_count"], "status": s["status"], "experiment_state": (s.get("experiment_status") or {}).get("state"),
            "needs_review_notes": sum(1 for n in s["notes"] if (n.get("asr") or {}).get("needs_review")),
            "possible_other_voice_notes": sum(1 for n in s["notes"] if (n.get("speaker_check") or {}).get("possible_other_voice")),
            "received_at": "2026-01-01T00:00:00+00:00", "ai_status": ai_status}


def detail(s: dict) -> dict:
    return {**summary(s, "done"), "updated_at": "2026-01-01T00:00:00+00:00", "session": s,
            "audio_files": [n["audio_file"] for n in s["notes"]] + ["full_session.wav"],
            "ai": {"status": "done", "result": fake_ai(s), "error": None, "updated_at": "2026-01-01T00:00:00+00:00"}}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._send(204, b"")

    def do_GET(self):
        u = urlparse(self.path)
        parts = [unquote(p) for p in u.path.strip("/").split("/")]
        if parts == ["api", "health"]:
            return self._json(200, {"ok": True, "version": "mock", "schema_version": 1, "ai_configured": False, "auth_required": False})
        if parts == ["api", "sessions"]:
            q = parse_qs(u.query)
            limit, offset = int(q.get("limit", ["50"])[0]), int(q.get("offset", ["0"])[0])
            items = sorted(SESSIONS.values(), key=lambda s: s["started_at"], reverse=True)
            return self._json(200, {"total": len(items), "limit": limit, "offset": offset,
                                    "items": [summary(s, "done") for s in items[offset:offset + limit]]})
        if len(parts) == 3 and parts[:2] == ["api", "sessions"]:
            s = SESSIONS.get(parts[2])
            return self._json(200, detail(s)) if s else self._json(404, {"detail": "no such session"})
        if len(parts) >= 5 and parts[:2] == ["api", "sessions"] and parts[3] == "audio":
            return self._send(200, tone_wav(), "audio/wav") if parts[2] in SESSIONS else self._json(404, {"detail": "no such audio file"})
        self._json(404, {"detail": "not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/sessions":
            return self._json(404, {"detail": "not found"})
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            s = json.loads(body.decode("utf-8"))
            sid = s["session_id"]
        except (ValueError, KeyError, UnicodeDecodeError):
            return self._json(422, {"detail": "the mock accepts the session.json as a JSON body"})
        existed = sid in SESSIONS
        SESSIONS[sid] = s
        self._json(201, {"session_id": sid, "updated_existing": existed, "notes": len(s.get("notes", [])), "audio_files": [], "ai_status": "done"})

    def log_message(self, fmt, *args):
        print("  " + fmt % args)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    for f in sorted(SAMPLES.glob("*.json")):
        s = json.loads(f.read_text(encoding="utf-8"))
        SESSIONS[s["session_id"]] = s
    print(f"Mock MindTrace API on http://localhost:{a.port}  ({len(SESSIONS)} sample session(s))  Ctrl+C to stop")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
