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

Login (once): the bridge is a separate program, so it needs its own key to your account (a "token"). The easy way:

    python mindtrace_bridge.py --setup            # asks your platform email + password once, saves a token in .bridge_token

After that just run it (the saved token is used). Other ways: copy a token from the web app (Settings), or set
$env:MINDTRACE_API_TOKEN = "mt_...", or `python backend/manage.py create-token you@lab.com`.
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
TOKEN_FILE = HERE / ".bridge_token"


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


def load_saved_token(url: str, path: Path | None = None) -> str:
    """The token saved by --setup, only if it was made for this platform address."""
    path = path or TOKEN_FILE
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ""
    return d.get("token", "") if d.get("url", "").rstrip("/") == url.rstrip("/") else ""


def setup_token(client: httpx.Client, base_url: str, email: str, password: str, path: Path | None = None) -> str:
    """Log in with email + password, ask the platform for a token, and save it for next time. The password is never stored."""
    path = path or TOKEN_FILE
    base = base_url.rstrip("/")
    h = {"X-Requested-With": "mindtrace"}
    r = client.post(base + "/api/auth/login", json={"email": email, "password": password, "remember": True}, headers=h, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(r.json().get("detail", f"HTTP {r.status_code}") if r.headers.get("content-type", "").startswith("application/json") else f"HTTP {r.status_code}")
    r = client.post(base + "/api/auth/api-token", json={"label": "laptop bridge"}, headers=h, timeout=20)
    if r.status_code != 201:
        raise RuntimeError(f"could not create a token (HTTP {r.status_code})")
    token = r.json()["token"]
    path.write_text(json.dumps({"url": base, "token": token}), encoding="utf-8")
    return token


LIVE_FILE = ".live.json"          # written by the listener every couple of seconds (device connected, recording, levels)
VERSION = "2.1"


def whoami(client: httpx.Client, base_url: str, token: str) -> dict | None:
    """The account this token uploads to, or None if the platform does not accept the token."""
    r = client.get(base_url.rstrip("/") + "/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if r.status_code == 401:
        return None
    r.raise_for_status()
    return r.json()["user"]


def read_live(sessions_dir: Path) -> dict | None:
    """What the listener last reported, with its age in seconds. None when the listener never ran here."""
    p = sessions_dir / LIVE_FILE
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        age = max(0.0, time.time() - float(d.get("updated_unix", 0)))
    except (OSError, ValueError, TypeError):
        return None
    return {"running": bool(d.get("running")), "device_connected": bool(d.get("device_connected")),
            "recording": bool(d.get("recording")), "firmware": d.get("firmware"), "mic": d.get("mic"),
            "session_notes": int(d.get("session_notes") or 0), "levels": list(d.get("levels") or [])[-32:], "age_sec": round(age, 1)}


def heartbeat(client: httpx.Client, base_url: str, token: str, sessions_dir: Path) -> bool:
    """Tell the platform this laptop app is alive and what the device is doing. Never raises."""
    import platform as _pf
    body = {"bridge_version": VERSION, "computer": _pf.node()[:60], "sessions_dir_ok": sessions_dir.is_dir(),
            "listener": read_live(sessions_dir)}
    try:
        r = client.post(base_url.rstrip("/") + "/api/bridge/heartbeat", json=body, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def state_key(url: str, token: str) -> str:
    """What was uploaded is remembered per platform AND account: a different server, account or a wiped database starts fresh."""
    return hashlib.sha256(f"{url.rstrip('/')}|{token}".encode("utf-8")).hexdigest()[:16]


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


def upload(client: httpx.Client, base_url: str, folder: Path, with_full: bool, token: str = "") -> dict:
    """POST one session. Raises httpx.HTTPError / RuntimeError on failure."""
    headers = {"Authorization": f"Bearer {token}"} if token else {}
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


def verify_session(client: httpx.Client, base_url: str, folder: Path, with_full: bool, token: str) -> tuple[list[str], list[str]]:
    """Compare one local session folder with what the platform stored: the session.json byte-for-byte (as JSON), every
    WAV by sha256, and every spoken note (text, time, audio) in the experiment. Returns (problems, info)."""
    base, h = base_url.rstrip("/"), {"Authorization": f"Bearer {token}"}
    local = json.loads((folder / "session.json").read_text(encoding="utf-8"))
    sid = local.get("session_id")
    r = client.get(f"{base}/api/sessions/{sid}", headers=h, timeout=30)
    if r.status_code == 404:
        return [f"not on the platform yet (session {sid})"], []
    r.raise_for_status()
    remote = r.json()
    problems, info = [], []
    if remote["session"] != local:
        diff = sorted(k for k in set(local) | set(remote["session"]) if local.get(k) != remote["session"].get(k))
        problems.append("session.json differs from what the platform stored (fields: " + ", ".join(diff[:8]) + "). Upload again.")
    else:
        info.append("session.json identical")
    ok_audio = 0
    for p in audio_parts(folder, with_full):
        rel = p.relative_to(folder).as_posix()
        if rel not in remote["audio_files"]:
            problems.append(f"audio {rel} missing on the platform")
            continue
        a = client.get(f"{base}/api/sessions/{sid}/audio/{rel}", headers=h, timeout=120)
        if a.status_code != 200 or hashlib.sha256(a.content).hexdigest() != sha256_of(p):
            problems.append(f"audio {rel} differs on the platform")
        else:
            ok_audio += 1
    info.append(f"{ok_audio} audio file(s) identical (sha256)")
    exp_id = remote.get("experiment_id")
    if not exp_id:
        problems.append("the session is not linked to an experiment")
        return problems, info
    e = client.get(f"{base}/api/experiments/{exp_id}", headers=h, timeout=30)
    e.raise_for_status()
    exp = e.json()
    by_id = {n["session_note_id"]: n for n in exp.get("notes", []) if n.get("session_id") == sid and n.get("session_note_id") is not None}
    ok = edited = 0
    for sn in local.get("notes", []):
        text = " ".join(str(sn.get("text", "")).split())
        long_title = sn.get("kind") == "title" and len(text) > 160      # a long spoken title is also kept as a note
        if not text or (sn.get("kind", "note") != "note" and not long_title):
            continue                                                  # the spoken title becomes the experiment title
        n = by_id.get(sn.get("id"))
        if n is None:
            problems.append(f"note {sn.get('id')} ({sn.get('time_label')}) is missing in the experiment")
            continue
        bad = []
        if n["text_source"] == "human":
            edited += 1                                               # a person corrected it on the platform: expected to differ
        elif n["text"] != sn["text"].strip():
            bad.append("text")
        if n.get("time_label") != sn.get("time_label"):
            bad.append("time")
        if sn.get("audio_file") and (folder / sn["audio_file"]).is_file() and not n.get("has_audio"):
            bad.append("audio")                                       # only when the laptop has the file but the platform does not
        if bad:
            problems.append(f"note {sn.get('id')} ({sn.get('time_label')}): {', '.join(bad)} differ")
        else:
            ok += 1
    info.append(f"{ok} note(s) match in \"{exp.get('title')}\"" + (f", {edited} corrected by a person on the platform" if edited else ""))
    return problems, info


def verify_all(client: httpx.Client, base_url: str, sessions_dir: Path, with_full: bool, token: str, say=print) -> int:
    folders = find_sessions(sessions_dir)
    if not folders:
        say(f"No finished sessions in {sessions_dir}.")
        return 0
    bad = 0
    for folder in folders:
        try:
            problems, info = verify_session(client, base_url, folder, with_full, token)
        except (httpx.HTTPError, OSError, ValueError, KeyError) as exc:
            problems, info = [f"could not check ({exc.__class__.__name__}: {str(exc)[:150]})"], []
        bad += bool(problems)
        say(f"{'OK ' if not problems else 'BAD'} {folder.name}: " + "; ".join(info + problems))
    say(f"\n{len(folders) - bad} of {len(folders)} session(s) arrived exactly as recorded." + ("" if not bad else "  Run the bridge again to re-upload."))
    return 1 if bad else 0


def run_once(client: httpx.Client, base_url: str, sessions_dir: Path, state: dict, with_full: bool, token: str,
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
            res = upload(client, base_url, folder, with_full, token)
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
    ap.add_argument("--verify", action="store_true", help="check that every finished session on this laptop is on the platform exactly as recorded")
    ap.add_argument("--setup", action="store_true", help="log in once with your platform email + password and save a token")
    a = ap.parse_args(argv)
    if a.setup:
        import getpass
        email = input("Platform email: ").strip()
        password = getpass.getpass("Platform password (not shown, not saved): ")
        try:
            with httpx.Client() as c:
                setup_token(c, a.url, email, password)
        except httpx.ConnectError:
            print(f"Setup failed: the platform is not running at {a.url}.\n"
                  f"Start it first in another window:  cd backend  then  python -m uvicorn main:app --port 8000\n"
                  f"then run  python mindtrace_bridge.py --setup  again.", file=sys.stderr)
            return 1
        except (httpx.HTTPError, RuntimeError) as exc:
            print(f"Setup failed: {exc}", file=sys.stderr)
            return 1
        print(f"Done. This computer now uploads to {email}. Token saved in {TOKEN_FILE.name}.")
        print("Now run:  python mindtrace_bridge.py --watch --sessions-dir <sessions folder>")
        return 0
    # the token saved by --setup wins: an old MINDTRACE_API_TOKEN left in the window must not send recordings to another account
    token = load_saved_token(a.url) or os.environ.get("MINDTRACE_API_TOKEN", "")
    sessions_dir = Path(a.sessions_dir)
    if not sessions_dir.is_dir():
        print(f"Sessions folder not found: {sessions_dir}  (use --sessions-dir)", file=sys.stderr)
        return 2
    with_full = cfg("UPLOAD_FULL_RECORDING", True) and not a.no_full_audio
    all_state = load_state()
    state = all_state.setdefault(state_key(a.url, token), {})
    with httpx.Client() as client:
        try:
            h = client.get(a.url.rstrip("/") + "/api/health", timeout=10).json()
            print(f"Platform {a.url}: OK (AI {'on' if h.get('ai_configured') else 'off'})")
        except (httpx.HTTPError, ValueError) as exc:
            if not a.dry_run:
                print(f"Cannot reach the platform at {a.url} ({exc.__class__.__name__}). Is the backend running?", file=sys.stderr)
                if not a.watch:
                    return 1
        if not token and not a.dry_run:
            print("No token yet. Run once:  python mindtrace_bridge.py --setup   (or set MINDTRACE_API_TOKEN).", file=sys.stderr)
            return 2
        if token and not a.dry_run:
            try:
                me = whoami(client, a.url, token)
            except (httpx.HTTPError, ValueError, KeyError):
                me = {}
            if me is None:
                src = TOKEN_FILE.name if load_saved_token(a.url) else "MINDTRACE_API_TOKEN"
                print(f"The platform does not accept this token (from {src}): it belongs to another server or a deleted "
                      f"account/database.\nFix: run  python mindtrace_bridge.py --setup", file=sys.stderr)
                return 2
            if me:
                print(f"Uploading to the account: {me.get('name')} <{me.get('email')}>   "
                      f"(not yours? run  python mindtrace_bridge.py --setup)")
        if a.verify:
            return verify_all(client, a.url, sessions_dir, with_full, token)
        next_scan = 0.0
        while True:
            if time.monotonic() >= next_scan:
                sent, failed = run_once(client, a.url, sessions_dir, state, with_full, token, a.dry_run)
                if sent:
                    save_state(all_state)
                if not a.watch:
                    if not (sent or failed):
                        print("Nothing new to upload.")
                    return 1 if failed else 0
                next_scan = time.monotonic() + a.interval
            if token and not a.dry_run:
                heartbeat(client, a.url, token, sessions_dir)       # the web app shows "recording device connected"
            time.sleep(min(5.0, a.interval))


if __name__ == "__main__":
    sys.exit(main())
