import os

from core import env


def test_parse_handles_quotes_comments_and_export():
    got = env.parse('# comment\nA=1\nB="two words"\nexport C=3\nD=\'x\'\nE=plain # trailing\n\nBAD LINE\nF=\n')
    assert got == {"A": "1", "B": "two words", "C": "3", "D": "x", "E": "plain", "F": ""}


def test_real_environment_wins_and_missing_files_are_fine(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("MT_TEST_A=from-file\nMT_TEST_B=from-file\n", encoding="utf-8")
    monkeypatch.setenv("MT_TEST_A", "from-env")
    monkeypatch.delenv("MT_TEST_B", raising=False)
    assert env.load_env([f, tmp_path / "missing.env"]) == [f]
    assert os.environ["MT_TEST_A"] == "from-env" and os.environ["MT_TEST_B"] == "from-file"
    monkeypatch.delenv("MT_TEST_B", raising=False)
