"""Audio files of a session, stored under <data>/audio/u<owner>/<session_id>/ with strictly whitelisted names."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ALLOWED_AUDIO = re.compile(r"^(full_session\.wav|notes/(title|note_\d{2,3})\.wav)$")


class BadAudioName(ValueError):
    pass


def check_name(name: str) -> str:
    name = name.replace("\\", "/")
    if not ALLOWED_AUDIO.match(name):
        raise BadAudioName(f"audio file name not allowed: {name!r} (only full_session.wav and notes/title.wav, notes/note_NN.wav)")
    return name


def session_dir(audio_root: Path, owner_id: int, session_id: str) -> Path:
    return audio_root / f"u{owner_id}" / session_id


def save_audio(audio_root: Path, owner_id: int, session_id: str, name: str, data: bytes) -> str:
    name = check_name(name)
    if not data.startswith(b"RIFF") or b"WAVE" not in data[:16]:
        raise BadAudioName(f"{name} is not a WAV file")
    target = session_dir(audio_root, owner_id, session_id) / name
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(target)
    return name


def audio_path(audio_root: Path, owner_id: int, session_id: str, name: str) -> Path | None:
    try:
        name = check_name(name)
    except BadAudioName:
        return None
    p = session_dir(audio_root, owner_id, session_id) / name
    return p if p.is_file() else None


def list_audio(audio_root: Path, owner_id: int, session_id: str) -> list[str]:
    d = session_dir(audio_root, owner_id, session_id)
    if not d.is_dir():
        return []
    return sorted(str(p.relative_to(d)).replace("\\", "/") for p in d.rglob("*.wav"))


def delete_session_audio(audio_root: Path, owner_id: int, session_id: str) -> None:
    shutil.rmtree(session_dir(audio_root, owner_id, session_id), ignore_errors=True)
