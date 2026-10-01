import io
import json
import wave
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from core.config import Settings
from main import create_app

SAMPLE = Path(__file__).resolve().parents[2] / "bridge" / "samples" / "session_demo.json"
H = {"X-Requested-With": "mindtrace"}


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


def make_app(tmp_path, ai_handler=None, **kw):
    settings = Settings(data_dir=tmp_path / "data", deepseek_api_key=kw.pop("deepseek_api_key", ""),
                        literature_enabled=kw.pop("literature_enabled", False), **kw)
    ai_client = httpx.Client(transport=httpx.MockTransport(ai_handler)) if ai_handler else None
    return create_app(settings, ai_client)


def new_client(app, email=None, name="Tester", password="correct-horse-1", register=True) -> TestClient:
    """A browser: own cookie jar, sends the CSRF header like the frontend does."""
    c = TestClient(app, headers=H)
    if register:
        email = email or f"{name.lower().replace(' ', '.')}@example.com"
        r = c.post("/api/auth/register", json={"name": name, "email": email, "password": password})
        assert r.status_code == 201, r.text
        c.email, c.user = email, r.json()["user"]
    return c


def make_exp(c, title="Ambient temperature", summary="s") -> dict:
    r = c.post("/api/experiments", json={"title": title, "summary": summary})
    assert r.status_code == 201, r.text
    return r.json()
