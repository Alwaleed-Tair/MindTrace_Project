"""A person using the real app in a real browser against the real backend and database."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from playwright.sync_api import expect

from conftest import BACKEND, ROOT

PW = "correct-horse-1"


def test_register_use_logout_login_and_everything_is_still_there(make_page, server):
    p = make_page()
    p.register("Dr. Alia Saeed", "alia@lab.com")
    expect(p.tid("greeting")).to_contain_text("Dr. Alia")
    expect(p.tid("experiments-empty")).to_be_visible()            # a brand new account is empty: no demo data leaks in
    exp_id = p.create_experiment("Surface tension under vibration", "What changes?")
    p.add_note("The film broke at 40 Hz")
    p.add_note("مرحبا: ملاحظة بالعربي مع English words")
    expect(p.tid("notes-count")).to_contain_text("2 entries")
    p.tid("button-complete-" + exp_id).click()
    expect(p.tid("experiment-page")).to_have_attribute("data-status", "Completed")

    p.pg.reload()                                                  # a refresh keeps everything (it is in the database, not in the page)
    expect(p.tid("experiment-title")).to_have_text("Surface tension under vibration")
    expect(p.tid("experiment-page")).to_have_attribute("data-status", "Completed")
    expect(p.pg.locator("text=The film broke at 40 Hz")).to_be_visible()
    expect(p.pg.locator("text=مرحبا: ملاحظة بالعربي مع English words")).to_be_visible()

    p.tid("avatar-user").click()
    p.tid("button-sign-out").click()
    p.tid("button-sign-in").wait_for()
    p.goto(f"/experiments/{exp_id}")                               # signed out: the private page sends you to sign-in
    p.tid("button-sign-in").wait_for()
    p.login("alia@lab.com")
    expect(p.tid(f"card-experiment-{exp_id}")).to_have_attribute("data-status", "Completed")
    assert p.errors == []


def test_wrong_password_and_duplicate_account_show_clear_errors(make_page, server):
    p = make_page()
    p.register("Dr. Alia Saeed", "alia@lab.com")
    p.tid("avatar-user").click()
    p.tid("button-sign-out").click()
    p.tid("input-email").fill("alia@lab.com")
    p.tid("input-password").fill("not-the-password")
    p.tid("button-sign-in").click()
    expect(p.tid("auth-error")).to_have_text("wrong email or password")
    p.tid("button-switch-mode").click()
    p.tid("input-name").fill("Someone Else")
    p.tid("input-email").fill("ALIA@lab.com")
    p.tid("input-password").fill(PW)
    p.tid("button-sign-in").click()
    expect(p.tid("auth-error")).to_contain_text("already exists")


def test_one_user_can_never_see_anothers_data(make_page, server):
    a, b = make_page(), make_page()
    a.register("Alice A", "a@lab.com")
    a_id = a.create_experiment("Alice private experiment")
    a.add_note("alice secret observation")
    b.register("Bob B", "b@lab.com")
    expect(b.tid("experiments-empty")).to_be_visible()
    b.goto(f"/experiments/{a_id}")                                  # guessing the URL
    expect(b.tid("experiment-missing")).to_be_visible()
    assert "alice secret" not in b.pg.content()
    r = httpx.get(server.url + f"/api/experiments/{a_id}")          # and no login at all
    assert r.status_code == 401


def test_sharing_collaboration_and_notifications(make_page, server):
    a, b = make_page(), make_page()
    a.register("Alice A", "a@lab.com")
    b.register("Bob B", "b@lab.com")
    b_id = b.pg.evaluate("fetch('/api/auth/me').then(r=>r.json()).then(j=>j.user.id)")
    exp_id = a.create_experiment("Shared run")
    a.goto("/dashboard")

    # Add People: by email; wrong address; then by ID
    a.tid(f"button-add-people-{exp_id}").click()
    a.tid("input-people-search").fill("nobody@lab.com")
    expect(a.tid("people-no-match")).to_be_visible()
    a.tid("input-people-search").fill("b@lab.com")
    a.tid(f"button-add-{b_id}").click()
    expect(a.tid("people-success")).to_be_visible()
    expect(a.tid("people-with-access")).to_contain_text("Bob B")
    a.pg.keyboard.press("Escape")

    # Bob sees it, with an alert that Alice added him
    b.pg.reload()
    expect(b.tid(f"card-experiment-{exp_id}")).to_contain_text("Shared by Alice A")
    expect(b.tid("badge-notifications")).to_have_text("1")
    b.tid("button-notifications").click()
    expect(b.tid("popover-notifications")).to_contain_text("Alice A added you to Shared run")
    b.pg.keyboard.press("Escape")

    # Bob adds a note: Alice gets an active alert (toast) and a badge without reloading
    b.goto(f"/experiments/{exp_id}")
    b.add_note("Bob saw the drift again")
    expect(a.tid("toast-notification").first).to_contain_text("Bob B added a note in Shared run", timeout=15000)
    expect(a.tid("badge-notifications")).to_have_text("1")
    a.tid("button-notifications").click()
    a.tid("popover-notifications").locator("button", has_text="Bob B added a note").click()
    expect(a.tid("experiment-page")).to_be_visible()
    expect(a.pg.locator("text=Bob saw the drift again")).to_be_visible()      # the shared note arrived
    expect(a.tid("badge-notifications")).to_have_count(0)                       # clicking it marked it read

    # a collaborator can pause it, the owner sees it
    b.tid(f"button-pause-{exp_id}").click()
    expect(b.tid("experiment-page")).to_have_attribute("data-status", "Paused")
    a.pg.reload()
    expect(a.tid("experiment-page")).to_have_attribute("data-status", "Paused")

    # recent collaborators: Alice's second experiment offers Bob with one click
    a.goto("/dashboard")
    exp2 = a.create_experiment("Second experiment")
    a.goto("/dashboard")
    a.tid(f"button-add-people-{exp2}").click()
    expect(a.tid(f"recent-{b_id}")).to_be_visible()
    a.tid(f"button-add-{b_id}").click()
    expect(a.tid("people-with-access")).to_contain_text("Bob B")
    assert a.errors == [] and b.errors == []


def test_mock_triggers_for_the_notification_ui(make_page, server):
    p = make_page()
    p.register("Alice A", "a@lab.com")
    p.create_experiment("Mock target")
    p.goto("/settings")
    p.tid("button-mock-local").click()
    expect(p.tid("toast-notification").first).to_be_visible()
    expect(p.tid("badge-notifications")).to_have_text("1")
    p.tid("button-mock-server").click()                              # the server makes a fake colleague add a real note
    expect(p.tid("mock-result")).to_have_text("server")
    expect(p.tid("badge-notifications")).to_have_text("2", timeout=10000)
    p.goto("/dashboard")
    expect(p.pg.locator("[data-testid^=card-experiment-]").first.locator("[data-testid^=people-]")).to_contain_text("LH")   # she joined the experiment


def test_data_survives_a_backend_restart(make_page, server):
    p = make_page()
    p.register("Alice A", "a@lab.com")
    exp_id = p.create_experiment("Survives restarts")
    p.add_note("before the restart")
    server.restart()                                                 # the database is a file: a new process finds everything
    p.pg.reload()
    expect(p.tid("experiment-title")).to_have_text("Survives restarts")   # and the login cookie is still valid
    expect(p.pg.locator("text=before the restart")).to_be_visible()


def test_backend_offline_is_explained_not_a_blank_page(make_page, server):
    p = make_page()
    p.register("Alice A", "a@lab.com")
    p.create_experiment("Offline test")
    p.goto("/dashboard")
    p.tid("experiments-grid").wait_for()
    server.stop()                                                    # the backend dies while the page is open
    p.tid("input-search-experiments").fill("Offline")                # the next request fails
    expect(p.tid("experiments-error")).to_contain_text("Cannot reach the MindTrace server", timeout=20000)
    server.start()                                                   # it comes back: the Retry button recovers, nothing was lost
    p.pg.locator("[data-testid=experiments-error] button").click()
    expect(p.tid("experiments-grid")).to_contain_text("Offline test")
    # and signing in while the backend is down says so instead of hanging
    q = make_page()
    q.goto("/")
    q.tid("input-email").fill("a@lab.com")
    q.tid("input-password").fill(PW)
    server.stop()
    q.tid("button-sign-in").click()
    expect(q.tid("auth-error")).to_contain_text("Cannot reach the MindTrace server")
    server.start()


def test_theme_language_and_sidebar_are_remembered(make_page, server):
    p = make_page()
    p.register("Alice A", "a@lab.com")
    p.tid("button-toggle-theme").click()
    assert "dark" in p.pg.evaluate("document.documentElement.className")
    p.tid("button-toggle-sidebar").click()
    expect(p.tid("sidebar")).to_have_attribute("data-state", "closed")
    p.tid("button-toggle-language").click()
    assert p.pg.evaluate("document.documentElement.dir") == "rtl"
    p.pg.reload()
    p.tid("button-new-experiment").wait_for()
    assert "dark" in p.pg.evaluate("document.documentElement.className")
    assert p.pg.evaluate("document.documentElement.dir") == "rtl"
    expect(p.tid("sidebar")).to_have_attribute("data-state", "closed")
    p.tid("button-toggle-sidebar").click()
    expect(p.tid("sidebar")).to_have_attribute("data-state", "open")


def test_phone_layout_sidebar_overlay(make_page, server):
    p = make_page(viewport={"width": 390, "height": 800})
    p.register("Alice A", "a@lab.com")
    expect(p.tid("sidebar")).to_have_attribute("data-state", "closed")
    p.tid("button-toggle-sidebar").click()
    expect(p.tid("sidebar")).to_have_attribute("data-state", "open")
    p.tid("button-close-mobile-nav").click(position={"x": 370, "y": 400})
    expect(p.tid("sidebar")).to_have_attribute("data-state", "closed")
    assert p.pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")      # no sideways scrolling


def test_hostile_and_awkward_input(make_page, server):
    p = make_page()
    p.register("Alice A", "a@lab.com")
    p.create_experiment("<img src=x onerror=alert(1)> title")
    expect(p.tid("experiment-title")).to_have_text("<img src=x onerror=alert(1)> title")      # shown as text, never executed
    p.add_note("<script>window.__pwned=1</script> note")
    assert p.pg.evaluate("window.__pwned") is None
    expect(p.tid("button-save-note")).to_be_disabled()                                         # an empty note cannot be saved
    p.tid("textarea-new-note").fill("   ")
    expect(p.tid("button-save-note")).to_be_disabled()
    p.tid("textarea-new-note").fill("x" * 5000)
    p.tid("button-save-note").click()
    expect(p.tid("notes-count")).to_contain_text("2 entries")
    p.goto("/experiments/not-a-number")
    expect(p.tid("experiment-missing")).to_be_visible()
    p.goto("/no/such/page")
    expect(p.pg.locator("text=404")).to_be_visible()


def test_recorder_session_arrives_through_the_bridge_and_shows_up(make_page, server, tmp_path):
    p = make_page()
    p.register("Alice A", "a@lab.com")
    p.goto("/settings")
    p.tid("button-create-token").click()
    token = p.tid("bridge-token").inner_text()
    assert token.startswith("mt_")
    # a laptop sessions folder with a real recorder session.json (and tiny audio files)
    import wave
    sample = json.loads((ROOT / "bridge" / "samples" / "session_demo.json").read_text(encoding="utf-8"))
    folder = tmp_path / "sessions" / "2026-10-01_16-09-29"
    (folder / "notes").mkdir(parents=True)
    (folder / "session.json").write_text(json.dumps(sample, ensure_ascii=False), encoding="utf-8")
    for name in ("notes/title.wav", "notes/note_01.wav", "full_session.wav"):
        with wave.open(str(folder / name), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b"\x00\x00" * 1600)
    r = subprocess.run([sys.executable, str(ROOT / "bridge" / "mindtrace_bridge.py"), "--url", server.url, "--sessions-dir", str(tmp_path / "sessions")],
                       env={**os.environ, "MINDTRACE_API_TOKEN": token}, capture_output=True, text=True, cwd=tmp_path)
    assert r.returncode == 0 and "uploaded 2026-10-01_16-09-29" in r.stdout, r.stdout + r.stderr
    again = subprocess.run([sys.executable, str(ROOT / "bridge" / "mindtrace_bridge.py"), "--url", server.url, "--sessions-dir", str(tmp_path / "sessions")],
                           env={**os.environ, "MINDTRACE_API_TOKEN": token}, capture_output=True, text=True, cwd=tmp_path)
    assert "Nothing new to upload" in again.stdout
    p.goto("/dashboard")
    card = p.pg.locator("[data-testid^=card-experiment-]", has_text=sample["title"])
    expect(card).to_be_visible()
    card.locator("a").first.click()
    expect(p.tid("experiment-page")).to_be_visible()
    expect(p.pg.locator("[data-testid^=note-review-]").first).to_be_visible()                 # recorded notes flagged for review
    expect(p.pg.locator("[data-testid^=note-alt-]").first).to_contain_text("جسنا")           # with the second reading
    expect(p.pg.locator("audio")).to_have_count(1)                                            # a player only for the note that has audio
    wrong = subprocess.run([sys.executable, str(ROOT / "bridge" / "mindtrace_bridge.py"), "--url", server.url, "--sessions-dir", str(tmp_path / "sessions")],
                           env={**os.environ, "MINDTRACE_API_TOKEN": "mt_wrong"}, capture_output=True, text=True, cwd=tmp_path)
    assert wrong.returncode == 2 and "does not accept this token" in wrong.stderr and "--setup" in wrong.stderr   # a bad token is never silent
    assert "Uploading to the account: Alice A <a@lab.com>" in r.stdout                        # the bridge says WHERE the recordings go


@pytest.mark.skipif(not os.environ.get("DEEPSEEK_API_KEY"), reason="set DEEPSEEK_API_KEY to call the real DeepSeek API")
def test_real_deepseek_insights(make_page, server):
    p = make_page()
    p.register("Dr. Noor", "noor@e2e.test")
    p.create_experiment("Ambient temperature & reaction time", "Mapping how a small temperature shift changes the catalyst response curve.")
    for text in ("At 23.4°C the color change appeared 8 seconds earlier than the baseline run.",
                 "Check whether the room ventilation is introducing a second variable.",
                 "Repeat the run at 26°C with the vents closed before drawing a conclusion."):
        p.add_note(text)
    p.tid("tab-insights").click()
    p.tid("button-refresh-insights").click()
    expect(p.tid("insights-summary")).to_be_visible(timeout=150000)   # a real round trip to DeepSeek
    summary = p.tid("insights-summary").inner_text()
    assert len(summary) > 40
    expect(p.tid("insights-doc-score")).to_contain_text("%")
    expect(p.tid("insights-caveat")).to_be_visible()                 # the novelty estimate says it is not a literature search
    # switching the interface language translates the analysis ONCE by itself (no regeneration), and remembers it
    p.tid("button-toggle-language").click()
    expect(p.tid("insights-summary")).not_to_have_text(summary, timeout=90000)
    expect(p.tid("translate-banner")).to_have_count(0)
    p.tid("button-toggle-language").click()                            # back: instant, from the stored original
    expect(p.tid("insights-summary")).to_have_text(summary)
    p.tid("button-toggle-language").click()                            # and forth again: still instant, no new call
    expect(p.tid("insights-summary")).not_to_have_text(summary)
    expect(p.tid("translate-banner")).to_have_count(0)
    p.goto("/dashboard")
    expect(p.tid("card-insights-summary")).to_have_count(0)           # no Insights on the home page
    assert os.environ["DEEPSEEK_API_KEY"] not in p.pg.content()      # the key never reaches the browser
    me = httpx.get(server.url + "/api/health").text
    assert os.environ["DEEPSEEK_API_KEY"] not in me


def test_delete_an_experiment_for_real(make_page, server):
    p = make_page()
    p.register("Dr. Del", "del@lab.com")
    keep = p.create_experiment("Keep me", "")
    p.goto("/dashboard")
    gone = p.create_experiment("Throw me away", "")
    p.add_note("a note that goes with it")
    p.goto("/dashboard")
    p.tid("button-delete-" + gone).click()
    p.tid("button-cancel-delete").click()
    expect(p.tid("card-experiment-" + gone)).to_be_visible()          # cancel keeps it
    p.tid("button-delete-" + gone).click()
    p.tid("button-confirm-delete").click()
    expect(p.tid("card-experiment-" + gone)).to_have_count(0)
    p.pg.reload()                                                      # gone from the database too
    expect(p.tid("card-experiment-" + keep)).to_be_visible()
    expect(p.tid("card-experiment-" + gone)).to_have_count(0)
    p.goto("/experiments/" + gone)
    expect(p.tid("experiment-missing")).to_be_visible()
    p.goto("/experiments/" + keep)                                     # delete from the experiment page: back to the dashboard
    p.tid("button-delete-experiment").click()
    p.tid("button-confirm-delete").click()
    expect(p.tid("experiments-empty")).to_be_visible()


def test_edit_and_delete_a_note(make_page, server):
    p = make_page()
    p.register("Dr. Edit", "edit@lab.com")
    p.create_experiment("Notes to fix", "")
    p.add_note("first version of the note")
    note = p.pg.locator("[data-testid^=note-]:has-text('first version')").first
    nid = note.get_attribute("data-testid").split("-")[-1]
    p.tid("note-edit-" + nid).click()
    p.tid("note-edit-text-" + nid).fill("second version")
    p.tid("note-edit-save-" + nid).click()
    expect(p.pg.locator("text=second version")).to_be_visible()
    p.pg.reload()
    expect(p.pg.locator("text=second version")).to_be_visible()        # saved in the database
    p.tid("button-delete-note-" + nid).click()
    p.tid("note-delete-cancel-" + nid).click()
    expect(p.pg.locator("text=second version")).to_be_visible()        # cancel keeps it
    p.tid("button-delete-note-" + nid).click()
    p.tid("button-confirm-delete-note-" + nid).click()
    expect(p.tid("notes-empty")).to_be_visible()
    p.pg.reload()
    expect(p.tid("notes-empty")).to_be_visible()


def test_mention_a_person_in_a_note(make_page, server):
    a, b = make_page(), make_page()
    a.register("Alice A", "a@lab.com")
    b.register("بدر الحربي", "b@lab.com")
    exp_id = a.create_experiment("Mention run")
    r = a.pg.evaluate(f"""fetch('/api/experiments/{exp_id}/collaborators', {{method: 'POST', credentials: 'include',
        headers: {{'Content-Type': 'application/json', 'X-Requested-With': 'mindtrace'}}, body: JSON.stringify({{identifier: 'b@lab.com'}})}}).then(r => r.status)""")
    assert r == 201
    a.pg.reload()
    box = a.tid("textarea-new-note")
    box.click()
    box.press_sequentially("check this @بد")
    expect(a.tid("mention-list")).to_contain_text("بدر الحربي")
    expect(a.tid("mention-list")).not_to_contain_text("Alice A")          # filtered by what was typed
    box.press("Enter")                                                      # Enter picks the person, it does not save
    box.press_sequentially("please weigh the sample")
    expect(a.tid("mention-list")).to_have_count(0)                         # typing on after the name closes the list
    expect(box).to_have_value("check this @بدر الحربي please weigh the sample")
    a.tid("button-save-note").click()
    chip = a.tid("mention-chip").first
    expect(chip).to_have_text("@بدر الحربي")
    # Bob gets a "mentioned you" alert, and only that one for this note
    expect(b.tid("toast-notification").first).to_contain_text("Alice A", timeout=15000)
    items = b.pg.evaluate("fetch('/api/notifications').then(r=>r.json()).then(j=>j.items.map(i=>i.kind))")
    assert items.count("mentioned") == 1 and "note_added" not in items
    # editing shows the name, not the stored id, and keeps the mention
    nid = a.pg.locator("[data-testid^=note-text-]").first.get_attribute("data-testid").split("-")[-1]
    a.tid("note-edit-" + nid).click()
    expect(a.tid("note-edit-text-" + nid)).to_have_value("check this @بدر الحربي please weigh the sample")
    a.tid("note-edit-text-" + nid).fill("check this @بدر الحربي please weigh it twice")
    a.tid("note-edit-save-" + nid).click()
    expect(a.tid("note-text-" + nid)).to_contain_text("weigh it twice")
    expect(a.tid("mention-chip").first).to_have_text("@بدر الحربي")
    assert a.errors == [] and b.errors == []
