"""Go RLM bridge: runner discovery, subprocess dispatch, and contract mapping."""

from __future__ import annotations

import json
import os
import stat
import textwrap

import pytest
import rlm_go_bridge


@pytest.fixture(autouse=True)
def _reset_runner_cache():
    """Each test re-resolves the runner path so env-based discovery is fresh."""
    rlm_go_bridge._GO_BIN = None
    yield
    rlm_go_bridge._GO_BIN = None


@pytest.fixture
def fake_runner(tmp_path):
    """An executable stub that echoes a canned rlm result JSON on stdout."""
    script = tmp_path / "fake-runner"
    script.write_text(
        textwrap.dedent(
            """\
            #!/usr/bin/env python3
            import json, sys
            if sys.argv[1] == "skillplan":
                out = {"success": True, "selected_skills": ["eve"], "applications": [{"skill": "eve", "output": "applied"}]}
            else:
                out = {"success": True, "answer": "synthesized answer", "iterations": 3, "tokens_used": 1000, "sub_calls_count": 5, "fallback_used": False}
            sys.stdout.write(json.dumps(out))
            """
        ),
        encoding="utf-8",
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return str(script)


def test_find_go_runner_via_env(tmp_path):
    runner = tmp_path / "bin" / "deep-research-runner"
    runner.parent.mkdir(parents=True)
    runner.write_text("#!/bin/sh\n", encoding="utf-8")
    runner.chmod(runner.stat().st_mode | stat.S_IEXEC)
    os.environ["ABSO_RAVEN_GO_BIN"] = str(runner)
    try:
        assert rlm_go_bridge.find_go_runner() == str(runner)
    finally:
        os.environ.pop("ABSO_RAVEN_GO_BIN", None)


def test_find_go_runner_missing():
    os.environ.pop("ABSO_RAVEN_GO_BIN", None)
    # A cached miss stays a miss.
    rlm_go_bridge._GO_BIN = ""
    assert rlm_go_bridge.find_go_runner() is None
    assert rlm_go_bridge.find_go_runner() is None
    rlm_go_bridge._GO_BIN = None


def test_rlm_synthesize_normalizes_contract(fake_runner, monkeypatch):
    monkeypatch.setenv("ABSO_RAVEN_GO_BIN", fake_runner)
    res = rlm_go_bridge.rlm_synthesize("some corpus", "some task")
    assert res["success"] is True
    assert res["answer"] == "synthesized answer"
    assert res["iterations"] == 3
    assert res["tokens_used"] == 1000
    assert res["sub_calls_count"] == 5
    assert res["fallback_used"] is False
    assert res["error"] is None


def test_apply_skills_contract(fake_runner, monkeypatch):
    monkeypatch.setenv("ABSO_RAVEN_GO_BIN", fake_runner)
    res = rlm_go_bridge.apply_skills("/tmp/skills", "a task", mode="parallel")
    assert res["success"] is True
    assert res["selected_skills"] == ["eve"]
    assert res["applications"][0]["skill"] == "eve"
    assert res["error"] is None


def test_rlm_synthesize_runner_missing(monkeypatch):
    monkeypatch.delenv("ABSO_RAVEN_GO_BIN", raising=False)
    monkeypatch.setattr(rlm_go_bridge, "_GO_BIN", "")
    res = rlm_go_bridge.rlm_synthesize("corpus", "task")
    assert res["success"] is False
    assert "not built" in res["error"]


def test_rlm_synthesize_nonzero_exit(tmp_path, monkeypatch):
    script = tmp_path / "bad-runner"
    script.write_text("#!/bin/sh\necho 'boom' >&2\nexit 3\n", encoding="utf-8")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("ABSO_RAVEN_GO_BIN", str(script))
    res = rlm_go_bridge.rlm_synthesize("corpus", "task")
    assert res["success"] is False
    assert "exited with code 3" in res["error"]


def test_rlm_synthesize_non_json_output(tmp_path, monkeypatch):
    script = tmp_path / "garbage-runner"
    script.write_text("#!/bin/sh\necho 'not json'\n", encoding="utf-8")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("ABSO_RAVEN_GO_BIN", str(script))
    res = rlm_go_bridge.rlm_synthesize("corpus", "task")
    assert res["success"] is False
    assert "not JSON" in res["error"]


def test_write_corpus_plain_vs_pages(tmp_path, monkeypatch):
    monkeypatch.setenv("ABSO_RAVEN_GO_BIN", str(tmp_path / "missing"))
    plain = rlm_go_bridge._write_corpus("## Hello\nbody", pages=None)
    try:
        with open(plain, encoding="utf-8") as f:
            assert f.read() == "## Hello\nbody"
    finally:
        os.unlink(plain)

    paged = rlm_go_bridge._write_corpus("", pages={"https://a": "# A\nbody"})
    try:
        with open(paged, encoding="utf-8") as f:
            assert json.load(f) == {"https://a": "# A\nbody"}
    finally:
        os.unlink(paged)


def test_rlm_synthesize_oversized_corpus_warns(fake_runner, monkeypatch, capsys):
    monkeypatch.setenv("ABSO_RAVEN_GO_BIN", fake_runner)
    from rlm_routing import RLM_MAX_CORPUS_CHARS

    big = "x" * (RLM_MAX_CORPUS_CHARS + 1)
    res = rlm_go_bridge.rlm_synthesize(big, "task")
    assert res["success"] is True
    assert "exceeds RLM_MAX_CORPUS_CHARS" in capsys.readouterr().out
