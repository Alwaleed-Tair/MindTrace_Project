"""The session.json written by the MindTrace laptop app (schema_version 1).

Unknown fields are kept (extra="allow"): the laptop app only ever ADDS fields, and the platform must not drop them.
"""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SUPPORTED_SCHEMA_VERSION = 1
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")


class Note(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int
    kind: Literal["title", "note"]
    start_sec: float
    end_sec: float
    duration_sec: float
    time_label: str
    audio_file: str
    text: str
    word_count: int
    transcript_status: str
    speaker_check: dict[str, Any] | None = None     # possible-other-voice flag (a hint, never proof)
    asr: dict[str, Any] | None = None               # speech-to-text confidence and second reading


class SessionIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    schema_version: int
    session_id: str
    status: str
    stop_reason: str | None = None
    title: str = ""
    started_at: str
    ended_at: str | None = None
    duration_sec: float
    note_count: int
    notes: list[Note] = Field(default_factory=list)
    audio: dict[str, Any] = Field(default_factory=dict)
    transcription: dict[str, Any] = Field(default_factory=dict)
    device: dict[str, Any] = Field(default_factory=dict)
    speaker_verification: dict[str, Any] | None = None
    experiment_status: dict[str, Any] | None = None

    @field_validator("session_id")
    @classmethod
    def _safe_id(cls, v: str) -> str:
        if not SESSION_ID_RE.match(v) or v in (".", ".."):
            raise ValueError("session_id may only contain letters, digits, '_', '-' and '.' (max 80)")
        return v

    @field_validator("schema_version")
    @classmethod
    def _known_version(cls, v: int) -> int:
        if v != SUPPORTED_SCHEMA_VERSION:
            raise ValueError(f"unsupported schema_version {v} (this backend reads {SUPPORTED_SCHEMA_VERSION})")
        return v


def review_note_ids(s: SessionIn) -> list[int]:
    return [n.id for n in s.notes if (n.asr or {}).get("needs_review")]


def other_voice_note_ids(s: SessionIn) -> list[int]:
    return [n.id for n in s.notes if (n.speaker_check or {}).get("possible_other_voice")]
