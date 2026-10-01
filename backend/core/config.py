"""Backend settings, all from environment variables (see ../.env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _flag(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("MINDTRACE_DATA_DIR", "./data")))
    api_key: str = field(default_factory=lambda: os.environ.get("MINDTRACE_API_KEY", ""))      # empty = no auth (local prototype)
    cors_origins: list[str] = field(default_factory=lambda: [
        o.strip() for o in os.environ.get("MINDTRACE_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()])
    max_upload_mb: int = field(default_factory=lambda: int(os.environ.get("MINDTRACE_MAX_UPLOAD_MB", "300")))
    # DeepSeek (OpenAI-compatible chat API). Only transcript TEXT is sent, never audio.
    deepseek_api_key: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_API_KEY", ""))
    deepseek_base_url: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
    deepseek_model: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"))
    ai_auto: bool = field(default_factory=lambda: _flag("MINDTRACE_AI_AUTO", True))             # analyse right after a session arrives
    ai_timeout_sec: float = field(default_factory=lambda: float(os.environ.get("MINDTRACE_AI_TIMEOUT_SEC", "90")))
    ai_language: str = field(default_factory=lambda: os.environ.get("MINDTRACE_AI_LANGUAGE", "Arabic"))

    @property
    def ai_configured(self) -> bool:
        return bool(self.deepseek_api_key)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "mindtrace.sqlite3"

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "audio"
