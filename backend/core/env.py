"""A tiny .env loader (no dependency): KEY=VALUE lines, # comments, optional quotes. Real environment variables win."""
from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def parse(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key.startswith("export "):
            key = key[7:].strip()
        if value[:1] in ('"', "'") and value[-1:] == value[:1] and len(value) >= 2:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if key:
            out[key] = value
    return out


def load_env(paths: list[Path] | None = None) -> list[Path]:
    """Loads backend/.env then the repository root .env (the first one to define a name wins). Returns the files read."""
    read: list[Path] = []
    for p in paths if paths is not None else [HERE / ".env", HERE.parent / ".env"]:
        if p.is_file():
            for k, v in parse(p.read_text(encoding="utf-8")).items():
                os.environ.setdefault(k, v)
            read.append(p)
    return read
