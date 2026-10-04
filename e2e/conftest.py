"""Real end-to-end fixtures: a real backend process (uvicorn) serving the real built frontend, driven by a real browser.

Needs: `cd frontend && npm install && npm run build` first, and `pip install -r e2e/requirements.txt`.
DeepSeek tests run only if DEEPSEEK_API_KEY is set in the environment (they call the real API).
"""
from __future__ import annotations

import glob
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DIST = ROOT / "frontend" / "dist"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    def __init__(self, data_dir: Path, port: int, env: dict):
        self.data_dir, self.port, self.env = data_dir, port, env
        self.url = f"http://127.0.0.1:{port}"
        self.proc: subprocess.Popen | None = None
        self.log = data_dir.parent / f"server-{port}.log"

    def start(self) -> None:
        env = {**os.environ, "MINDTRACE_DATA_DIR": str(self.data_dir), "MINDTRACE_FRONTEND_DIR": str(DIST), **self.env}
        self.proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--port", str(self.port), "--log-level", "warning"],
                                     cwd=BACKEND, env=env, stdout=open(self.log, "ab"), stderr=subprocess.STDOUT)
        for _ in range(100):
            try:
                if httpx.get(self.url + "/api/health", timeout=1).status_code == 200:
                    return
            except httpx.HTTPError:
                time.sleep(0.1)
        raise RuntimeError("backend did not start:\n" + self.log.read_text(errors="replace")[-2000:])

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.send_signal(signal.SIGTERM)
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def restart(self) -> None:
        self.stop()
        self.start()


@pytest.fixture(scope="session")
def built():
    if not (DIST / "index.html").is_file():
        pytest.skip("build the frontend first: cd frontend && npm install && npm run build")


@pytest.fixture()
def server(tmp_path, built):
    data = tmp_path / "data"
    env = {"MINDTRACE_DEV_TOOLS": "true", "DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY", "")}
    s = Server(data, free_port(), env)
    s.start()
    yield s
    s.stop()


@pytest.fixture(scope="session")
def browser_obj():
    exe = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe[0]) if exe else p.chromium.launch()
        yield b
        b.close()


class Page:
    """A browser window with helpers; collects JavaScript errors so a test can assert there were none."""

    def __init__(self, browser, base: str, viewport=None):
        self.ctx = browser.new_context(viewport=viewport or {"width": 1440, "height": 900})
        self.ctx.set_default_timeout(15000)
        self.pg = self.ctx.new_page()
        self.base = base
        self.errors: list[str] = []
        self.pg.on("pageerror", lambda e: self.errors.append(str(e)))
        self.pg.on("console", lambda m: self.errors.append(m.text) if m.type == "error" and "ERR_CERT" not in m.text and "401" not in m.text and "Failed to load resource" not in m.text else None)

    def goto(self, path="/"):
        self.pg.goto(self.base + path)

    def tid(self, name):
        return self.pg.locator(f"[data-testid={name}]")

    def register(self, name, email, password="correct-horse-1"):
        self.goto("/")
        self.tid("button-switch-mode").click()
        self.tid("input-name").fill(name)
        self.tid("input-email").fill(email)
        self.tid("input-password").fill(password)
        self.tid("button-sign-in").click()
        self.tid("button-new-experiment").wait_for()

    def login(self, email, password="correct-horse-1"):
        self.goto("/")
        self.tid("input-email").fill(email)
        self.tid("input-password").fill(password)
        self.tid("button-sign-in").click()
        self.tid("button-new-experiment").wait_for()

    def create_experiment(self, title, summary="a question"):
        self.tid("button-new-experiment").click()
        self.tid("input-experiment-title").fill(title)
        self.tid("input-experiment-summary").fill(summary)
        self.tid("button-submit-create").click()
        self.tid("experiment-page").wait_for()
        return self.pg.url.rsplit("/", 1)[-1]

    def add_note(self, text):
        self.tid("textarea-new-note").fill(text)
        self.tid("button-save-note").click()
        self.pg.locator(f"[data-testid^=note-]:has-text({text[:30]!r})").first.wait_for()

    def close(self):
        self.ctx.close()


@pytest.fixture()
def make_page(browser_obj, server):
    pages: list[Page] = []

    def make(viewport=None, base=None) -> Page:
        p = Page(browser_obj, base or server.url, viewport)
        pages.append(p)
        return p
    yield make
    for p in pages:
        p.close()
