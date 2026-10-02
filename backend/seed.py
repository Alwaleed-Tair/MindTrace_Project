"""Seed demo data (idempotent):  python seed.py

Creates the demo workspace the "Open demo workspace" button opens: four demo users, the four experiments from the
original frontend mock (seed_data/experiments.json), shared with some of the other users, a demo team, and every recorder
session JSON in ../bridge/samples ingested as a real experiment.

All demo users share one password (env MINDTRACE_DEMO_PASSWORD, default below) - for local demos only. Refused when
MINDTRACE_ENV=production unless --force.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import timedelta
from pathlib import Path

from core.config import Settings
from core.env import load_env
from core.db import Database
from schemas.session import SessionIn
from services import experiments as ex
from services import sessions as sessions_service
from services import teams as teams_service
from services import users as users_service

HERE = Path(__file__).resolve().parent
load_env()
DEFAULT_DEMO_PASSWORD = "MindTrace-Demo-2026"


def seed(db: Database, say=print, samples_dir: Path | None = None) -> dict:
    password = os.environ.get("MINDTRACE_DEMO_PASSWORD") or DEFAULT_DEMO_PASSWORD
    cfg = json.loads((HERE / "seed_data" / "users.json").read_text(encoding="utf-8"))
    by_email = {}
    for u in cfg["users"]:
        row = db.one("SELECT * FROM users WHERE email=?", (u["email"],))
        if row is None:
            row = users_service.create_user(db, u["name"], u["email"], password, u.get("lab", ""), is_demo=bool(u.get("is_demo")))
            say(f"user {u['email']} ({row['public_id']})")
        by_email[u["email"]] = row
    data = json.loads((HERE / "seed_data" / "experiments.json").read_text(encoding="utf-8"))
    owner = by_email[data["owner"]]
    created = 0
    for e in data["experiments"]:
        if db.one("SELECT 1 FROM experiments WHERE owner_id=? AND code=?", (owner["id"], e["code"])):
            continue
        h, m, s = (int(x) for x in e["duration"].split(":"))
        updated = users_service.now() - timedelta(minutes=e["updated_minutes_ago"])
        eid = ex.create_experiment(db, owner["id"], e["title"], e["summary"], e["tags"], code=e["code"], status=e["status"],
                                   originality=e["originality"], duration_sec=h * 3600 + m * 60 + s, color=e["color"],
                                   created_at=users_service.iso(updated - timedelta(days=7)))
        for n in e["notes"]:
            ex.add_note(db, eid, owner["id"], n["text"], n["kind"], notify=False)
            when = users_service.now() - timedelta(days=n["days_ago"])
            db.run("UPDATE notes SET created_at=?, updated_at=?, time_label=NULL WHERE id=(SELECT MAX(id) FROM notes WHERE experiment_id=?)",
                   (users_service.iso(when), users_service.iso(when), eid))
        for email in e["collaborators"]:
            db.run("INSERT OR IGNORE INTO collaborators (experiment_id, user_id, added_by, created_at) VALUES (?,?,?,?)",
                   (eid, by_email[email]["id"], owner["id"], users_service.iso(updated - timedelta(days=2))))
        db.run("UPDATE experiments SET updated_at=? WHERE id=?", (users_service.iso(updated), eid))
        created += 1
        say(f"experiment {e['code']} ({len(e['notes'])} notes)")
    # a demo team: the demo user owns it, Lina supervises, Omar and Sara are members; one experiment is shared with it
    if not db.one("SELECT 1 FROM teams WHERE owner_id=?", (owner["id"],)):
        t = teams_service.create_team(db, owner["id"], "Materials lab")
        tid = int(t["id"])
        for email, role in (("lina@mindtrace.app", "supervisor"), ("omar@mindtrace.app", "member"), ("sara@mindtrace.app", "member")):
            if email in by_email:
                db.run("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at) VALUES (?,?,?,?)",
                       (tid, by_email[email]["id"], role, users_service.iso(users_service.now() - timedelta(days=9))))
        db.run("UPDATE experiments SET team_id=? WHERE owner_id=? AND code='EXP-204'", (tid, owner["id"]))
        say("team Materials lab (4 members)")
    imported = 0
    for f in sorted((samples_dir or HERE.parent / "bridge" / "samples").glob("*.json")):
        raw = json.loads(f.read_text(encoding="utf-8"))
        s = SessionIn.model_validate(raw)
        existed, exp_id = sessions_service.upsert(db, owner["id"], raw, s, [])
        if not existed:
            imported += 1
            say(f"recorder session {s.session_id} -> experiment {exp_id} ({len(s.notes)} notes)")
    return {"users": len(by_email), "experiments_created": created, "sessions_imported": imported, "demo_password": password}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="allow seeding when MINDTRACE_ENV=production")
    a = ap.parse_args()
    st = Settings()
    if st.env == "production" and not a.force:
        print("Refusing to seed demo accounts with MINDTRACE_ENV=production (use --force if you really mean it).", file=sys.stderr)
        return 2
    st.data_dir.mkdir(parents=True, exist_ok=True)
    res = seed(Database(st.db_path))
    print(f"Done: {res['users']} users, {res['experiments_created']} new experiments, {res['sessions_imported']} recorder sessions.")
    print(f"Demo login: demo@mindtrace.app / {res['demo_password']}   (or the 'Open demo workspace' button)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
