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
    cors_origins: list[str] = field(default_factory=lambda: [
        o.strip() for o in os.environ.get("MINDTRACE_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()])
    env: str = field(default_factory=lambda: os.environ.get("MINDTRACE_ENV", "development"))
    cookie_secure: bool = field(default_factory=lambda: _flag("MINDTRACE_COOKIE_SECURE", False))    # true when served over https
    session_days: int = field(default_factory=lambda: int(os.environ.get("MINDTRACE_SESSION_DAYS", "30")))
    demo_enabled: bool = field(default_factory=lambda: _flag("MINDTRACE_DEMO_ENABLED", True))       # "Open demo workspace" button
    dev_tools: bool = field(default_factory=lambda: _flag("MINDTRACE_DEV_TOOLS", False))            # mock collaborator endpoints
    frontend_dir: Path = field(default_factory=lambda: Path(os.environ.get("MINDTRACE_FRONTEND_DIR", "../frontend/dist")))
    max_upload_mb: int = field(default_factory=lambda: int(os.environ.get("MINDTRACE_MAX_UPLOAD_MB", "300")))
    # DeepSeek (OpenAI-compatible chat API). Only transcript TEXT is sent, never audio.
    deepseek_api_key: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_API_KEY", ""))
    deepseek_base_url: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
    deepseek_model: str = field(default_factory=lambda: os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"))
    ai_auto: bool = field(default_factory=lambda: _flag("MINDTRACE_AI_AUTO", True))             # analyse right after a session arrives
    literature_enabled: bool = field(default_factory=lambda: _flag("MINDTRACE_LITERATURE", True))   # originality: search scholarly sources
    ai_timeout_sec: float = field(default_factory=lambda: float(os.environ.get("MINDTRACE_AI_TIMEOUT_SEC", "90")))
    ai_language: str = field(default_factory=lambda: os.environ.get("MINDTRACE_AI_LANGUAGE", "Arabic"))
    # Password reset e-mails. Without SMTP_HOST the reset link is written to the server log instead
    # (fine on a lab machine; `python manage.py reset-link EMAIL` prints one too).
    public_url: str = field(default_factory=lambda: os.environ.get("MINDTRACE_PUBLIC_URL", "").rstrip("/"))
    smtp_host: str = field(default_factory=lambda: os.environ.get("MINDTRACE_SMTP_HOST", ""))
    smtp_port: int = field(default_factory=lambda: int(os.environ.get("MINDTRACE_SMTP_PORT", "587")))
    smtp_user: str = field(default_factory=lambda: os.environ.get("MINDTRACE_SMTP_USER", ""))
    smtp_password: str = field(default_factory=lambda: os.environ.get("MINDTRACE_SMTP_PASSWORD", ""))
    smtp_from: str = field(default_factory=lambda: os.environ.get("MINDTRACE_SMTP_FROM", ""))
    reset_minutes: int = field(default_factory=lambda: int(os.environ.get("MINDTRACE_RESET_MINUTES", "60")))

    @property
    def ai_configured(self) -> bool:
        return bool(self.deepseek_api_key)

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "mindtrace.sqlite3"

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "audio"
