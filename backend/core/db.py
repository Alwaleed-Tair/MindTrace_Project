"""SQLite storage (one file). The original session.json is kept verbatim; a few columns are copied out for listing."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id       TEXT PRIMARY KEY,
    received_at      TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    title            TEXT NOT NULL,
    started_at       TEXT NOT NULL,
    duration_sec     REAL NOT NULL,
    note_count       INTEGER NOT NULL,
    status           TEXT NOT NULL,
    experiment_state TEXT,
    review_count     INTEGER NOT NULL DEFAULT 0,
    other_voice_count INTEGER NOT NULL DEFAULT 0,
    session_json     TEXT NOT NULL,
    audio_files      TEXT NOT NULL DEFAULT '[]',
    ai_status        TEXT NOT NULL DEFAULT 'pending',
    ai_json          TEXT,
    ai_error         TEXT,
    ai_updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
"""


class Database:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    @contextmanager
    def tx(self):
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def one(self, sql: str, args: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, args).fetchone()

    def all(self, sql: str, args: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, args).fetchall()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
