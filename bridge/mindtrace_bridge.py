"""Bridge: laptop sessions folder -> MindTrace platform.

The MindTrace laptop app writes one folder per session (session.json + notes/*.wav + full_session.wav). This script
uploads every COMPLETE session to the platform backend (session.json is the input; the audio goes with it) and
remembers what it sent, so a session is uploaded once, and again only if session.json changed (for example after
`python mindtrace_listener.py --retranscribe <folder>`).

    python mindtrace_bridge.py                       # upload what is new, then exit
    python mindtrace_bridge.py --watch               # keep running, upload new sessions as they finish
    python mindtrace_bridge.py --dry-run             # show what would be uploaded
    python mindtrace_bridge.py --url http://host:8000 --sessions-dir ..\\MindTrace2\\sessions

It never modifies or deletes anything in the sessions folder. Failures are retried on the next round.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import httpx

try:                                   # optional local defaults (config.py is git-ignored)
    import config as _cfg
except ImportError:
    _cfg = None

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / ".bridge_state.json"


def cfg(name: str, default):
    return getattr(_cfg, name, default) if _cfg else default


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_state(path: Path = STATE_FILE) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(state: dict, path: Path = STATE_FILE) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1), encoding="utf-8")
    tmp.replace(path)


def find_sessions(sessions_dir: Path) -> list[Path]:
    """Folders with a readable session.json whose status is 'complete' (a session still recording or being
    transcribed is skipped until it finishes)."""
    out = []
    for d in sorted(p for p in sessions_dir.iterdir() if p.is_dir()):
        j = d / "session.json"
        try:
            if json.loads(j.read_text(encoding="utf-8")).get("status") == "complete":
                out.append(d)
        except (OSError, ValueError):
            continue
    return out


def audio_parts(folder: Path, with_full: bool) -> list[Path]:
    files = sorted((folder / "notes").glob("*.wav")) if (folder / "notes").is_dir() else []
    if with_full and (folder / "full_session.wav").is_file():
        files.append(folder / "full_session.wav")
    return files


def upload(client: httpx.Client, base_url: str, folder: Path, with_full: bool, api_key: str = "") -> dict:
    """POST one session. Raises httpx.HTTPError / RuntimeError on failure."""
    headers = {"X-API-Key": api_key} if api_key else {}
    handles = []
    try:
        files = [("session", ("session.json", (folder / "session.json").read_bytes(), "application/json"))]
        for p in audio_parts(folder, with_full):
            rel = p.relative_to(folder).as_posix()                  # notes/note_01.wav or full_session.wav
            fh = open(p, "rb")
            handles.append(fh)
            files.append(("files", (rel, fh, "audio/wav")))
        r = client.post(base_url.rstrip("/") + "/api/sessions", files=files, headers=headers, timeout=120)
    finally:
        for fh in handles:
            fh.close()
    if r.status_code != 201:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return r.json()


def run_once(client: httpx.Client, base_url: str, sessions_dir: Path, state: dict, with_full: bool, api_key: str,
             dry_run: bool = False, say=print) -> tuple[int, int]:
    sent = failed = 0
    for folder in find_sessions(sessions_dir):
        digest = sha256_of(folder / "session.json")
        if state.get(folder.name, {}).get("sha256") == digest:
            continue
        if dry_run:
            say(f"would upload {folder.name} ({len(audio_parts(folder, with_full))} audio files)")
            continue
        try:
            res = upload(client, base_url, folder, with_full, api_key)
        except (httpx.HTTPError, RuntimeError, OSError) as exc:
            failed += 1
            say(f"! {folder.name}: not uploaded ({exc.__class__.__name__}: {str(exc)[:200]}). Will retry.")
            continue
        state[folder.name] = {"sha256": digest, "uploaded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                              "session_id": res.get("session_id")}
        sent += 1
        say(f"uploaded {folder.name}: {res.get('notes')} notes, {len(res.get('audio_files', []))} audio files, "
            f"{'updated' if res.get('updated_existing') else 'new'}, AI: {res.get('ai_status')}")
    return sent, failed


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=os.environ.get("MINDTRACE_PLATFORM_URL") or cfg("PLATFORM_URL", "http://localhost:8000"))
    ap.add_argument("--sessions-dir", default=os.environ.get("MINDTRACE_SESSIONS_DIR") or cfg("SESSIONS_DIR", "../MindTrace2/sessions"))
    ap.add_argument("--no-full-audio", action="store_true", help="do not upload full_session.wav (notes only)")
    ap.add_argument("--watch", action="store_true", help="keep running and upload new sessions")
    ap.add_argument("--interval", type=float, default=cfg("WATCH_INTERVAL_SEC", 20))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    api_key = os.environ.get("MINDTRACE_API_KEY", "")
    sessions_dir = Path(a.sessions_dir)
    if not sessions_dir.is_dir():
        print(f"Sessions folder not found: {sessions_dir}  (use --sessions-dir)", file=sys.stderr)
        return 2
    with_full = cfg("UPLOAD_FULL_RECORDING", True) and not a.no_full_audio
    state = load_state()
    with httpx.Client() as client:
        try:
            h = client.get(a.url.rstrip("/") + "/api/health", timeout=10).json()
            print(f"Platform {a.url}: OK (AI {'on' if h.get('ai_configured') else 'off'}, key {'required' if h.get('auth_required') else 'not required'})")
            if h.get("auth_required") and not api_key:
                print("The platform wants an API key: set the MINDTRACE_API_KEY environment variable.", file=sys.stderr)
                return 2
        except (httpx.HTTPError, ValueError) as exc:
            if not a.dry_run:
                print(f"Cannot reach the platform at {a.url} ({exc.__class__.__name__}). Is the backend running?", file=sys.stderr)
                if not a.watch:
                    return 1
        while True:
            sent, failed = run_once(client, a.url, sessions_dir, state, with_full, api_key, a.dry_run)
            if sent:
                save_state(state)
            if not a.watch:
                if not (sent or failed):
                    print("Nothing new to upload.")
                return 1 if failed else 0
            time.sleep(a.interval)


if __name__ == "__main__":
    sys.exit(main())
