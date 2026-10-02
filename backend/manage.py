"""Admin helper:   python manage.py create-user "Name" email@lab.com [--lab "Lab"]    (prompts for the password)
                   python manage.py create-token email@lab.com [--label "laptop"]      (prints a bridge token once)
                   python manage.py reset-link email@lab.com [--url http://localhost:8000]  (prints a password reset link)"""
from __future__ import annotations

import argparse
import getpass
import sys

from core.config import Settings
from core.env import load_env
from core.db import Database
from services import users


load_env()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user")
    cu.add_argument("name")
    cu.add_argument("email")
    cu.add_argument("--lab", default="")
    ct = sub.add_parser("create-token")
    ct.add_argument("email")
    ct.add_argument("--label", default="laptop bridge")
    rl = sub.add_parser("reset-link")
    rl.add_argument("email")
    rl.add_argument("--url", default="")
    a = ap.parse_args(argv)
    st = Settings()
    st.data_dir.mkdir(parents=True, exist_ok=True)
    db = Database(st.db_path)
    if a.cmd == "create-user":
        pw = getpass.getpass("Password (min 8 characters): ")
        try:
            u = users.create_user(db, a.name, a.email, pw, a.lab)
        except users.UserError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        print(f"Created {u['email']} (ID {u['public_id']})")
        return 0
    row = db.one("SELECT * FROM users WHERE email=?", (a.email.strip().lower(),))
    if row is None:
        print("Error: no such user", file=sys.stderr)
        return 1
    if a.cmd == "reset-link":
        token = users.create_reset_token(db, row["id"], st.reset_minutes)
        base = (a.url or st.public_url or "http://localhost:8000").rstrip("/")
        print(f"{base}/reset-password?token={token}   (valid for {st.reset_minutes} minutes, works once)")
        return 0
    print(users.create_api_token(db, row["id"], a.label))
    return 0


if __name__ == "__main__":
    sys.exit(main())
