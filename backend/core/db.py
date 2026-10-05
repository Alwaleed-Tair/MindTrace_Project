"""SQLite storage (one file, WAL, foreign keys on).

Tables: users, auth_sessions (login cookies), api_tokens (the laptop bridge), password_resets, experiments, notes, collaborators,
notifications, sessions (the recorder's session.json kept verbatim, linked to an experiment), and teams / team_members (a lab:
everyone in the team sees the experiments shared with it).
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id     TEXT NOT NULL UNIQUE,                 -- what people share to be added: MT-XXXXXXXX
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    lab           TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash   TEXT NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label        TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,                         -- only the hash of the emailed token is kept
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT
);
CREATE TABLE IF NOT EXISTS experiments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Paused','Completed')),
    duration_sec REAL NOT NULL DEFAULT 0,
    originality  INTEGER NOT NULL DEFAULT 50 CHECK (originality BETWEEN 0 AND 100),
    tags         TEXT NOT NULL DEFAULT '[]',
    color        TEXT NOT NULL DEFAULT 'mint',
    session_id   TEXT,                                   -- the recording this experiment came from (if any)
    ai_status    TEXT NOT NULL DEFAULT 'none',           -- none | disabled | queued | running | done | failed
    ai_json      TEXT,
    ai_error     TEXT,
    ai_updated_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_experiments_owner ON experiments(owner_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_experiments_session ON experiments(owner_id, session_id) WHERE session_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    author_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text          TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'observation' CHECK (kind IN ('observation','hypothesis','decision')),
    source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','recording')),
    text_source   TEXT NOT NULL DEFAULT 'human' CHECK (text_source IN ('human','asr')),
    time_label    TEXT,                                  -- position in the recording (recorded notes)
    meta          TEXT NOT NULL DEFAULT '{}',            -- session note id, audio file, asr / speaker flags
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_experiment ON notes(experiment_id, id);
CREATE TABLE IF NOT EXISTS collaborators (
    experiment_id INTEGER NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (experiment_id, user_id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- recipient
    actor_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    note_id       INTEGER,
    kind          TEXT NOT NULL,                         -- note_added | note_updated | collaborator_added
    message       TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    read_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);
CREATE TABLE IF NOT EXISTS sessions (
    owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id       TEXT NOT NULL,
    experiment_id    INTEGER REFERENCES experiments(id) ON DELETE SET NULL,
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
    PRIMARY KEY (owner_id, session_id)
);
CREATE TABLE IF NOT EXISTS teams (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_token TEXT UNIQUE,                            -- the join link's secret; owners/supervisors can copy or reset it
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
    team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','supervisor','member')),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
"""

# columns added after the first release: (table, column, definition). Applied once to older database files.
MIGRATIONS = [
    ("experiments", "team_id", "INTEGER REFERENCES teams(id) ON DELETE SET NULL"),
    ("api_tokens", "last_seen_at", "TEXT"),          # last heartbeat from the laptop app using this token
    ("api_tokens", "status_json", "TEXT"),           # what the laptop app last reported (device connected, recording, levels)
]


class Database:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(SCHEMA)
            for table, column, definition in MIGRATIONS:
                cols = {r["name"] for r in self._conn.execute(f"PRAGMA table_info({table})")}
                if column not in cols:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @contextmanager
    def tx(self):
        """One transaction; everything inside commits together or not at all."""
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    def one(self, sql: str, args: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, args).fetchone()

    def all(self, sql: str, args: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, args).fetchall()

    def run(self, sql: str, args: tuple = ()) -> int:
        """Single write statement in its own transaction. Returns lastrowid."""
        with self.tx() as c:
            return c.execute(sql, args).lastrowid

    def close(self) -> None:
        with self._lock:
            self._conn.close()
