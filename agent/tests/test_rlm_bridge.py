"""RLM bridge: subprocess dispatch, extraction, and raven_bridge fallback."""

from __future__ import annotations

import json

import rlm_bridge
import raven_bridge

GOOD_BUNDLE = json.dumps(
    {
        "instructions.md": (
            "# Lead Agent Coordinator\n\nRouting rules for the EVE skill bundle. "
            "This file coordinates intent routing across specialist subagents and "
            "enforces bounded loop execution with explicit evaluators."
        ),
        "skills/SKILL.md": (
            "# Skill\n\nTrigger conditions, core integration patterns, and "
            "negative constraints for the domain. Progressive disclosure from "
            "advertise through load to read resources."
        ),
        "subagents/specialist.md": (
            "# Specialist Subagent\n\nmax_iterations: 5\n\nFocused execution "
            "directives for a single sub-task with an explicit evaluator loop."
        ),
        "rules/boundary_checks.md": (
            "# Boundary & Safety Rules\n\n1. Validate payloads.\n2. Retry with backoff.\n"
        ),
    },
    indent=2,
)

FAKE_OK_OUTPUT = f"```json\n{GOOD_BUNDLE}\n```"


class _Result:
    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_cap_pages_respects_char_budget():
    pages = {"a": "x" * 100, "b": "y" * 100, "c": "z" * 100}
    kept = rlm_bridge._cap_pages(pages, 250)
    assert set(kept) == {"a", "b"}
    assert sum(len(v) for v in kept.values()) == 200


def test_generate_skill_with_rlm_drops_failed_scrape_pages(monkeypatch):
    """Placeholder pages from failed bulk scrapes must not enter the corpus."""
    captured = {}

    def fake_write(pages, markdown_corpus):
        captured["pages"] = pages
        return "/tmp/fake-corpus.json"

    def fake_run(cmd, *args, **kwargs):
        return _Result(returncode=0, stdout=FAKE_OK_OUTPUT)

    monkeypatch.setattr(rlm_bridge, "is_raven_available", lambda: True)
    monkeypatch.setattr(rlm_bridge, "_write_corpus_file", fake_write)
    monkeypatch.setattr(rlm_bridge.subprocess, "run", fake_run)
    result = rlm_bridge.generate_skill_with_rlm(
        pages={
            "https://ok": "# Fine docs",
            "https://bad": "[scraper] bulk scrape failed: timeout",
        },
        target_url="https://ok",
    )
    assert result["success"] is True
    assert captured["pages"] == {"https://ok": "# Fine docs"}


def test_generate_skill_with_rlm_requires_raven(monkeypatch):
    monkeypatch.setattr(rlm_bridge, "is_raven_available", lambda: False)
    result = rlm_bridge.generate_skill_with_rlm(
        pages={"https://x": "# Docs"}, target_url="https://x"
    )
    assert result["success"] is False
    assert result["error"] == "raven unavailable"


def test_generate_skill_with_rlm_subprocess_failure(monkeypatch):
    monkeypatch.setattr(rlm_bridge, "is_raven_available", lambda: True)
    monkeypatch.setattr(
        rlm_bridge.subprocess,
        "run",
        lambda *a, **kw: _Result(returncode=1, stderr="boom"),
    )
    result = rlm_bridge.generate_skill_with_rlm(
        pages={"https://x": "# Docs"}, target_url="https://x"
    )
    assert result["success"] is False
    assert "boom" in result["error"]


def test_generate_skill_with_rlm_success(monkeypatch):
    monkeypatch.setattr(rlm_bridge, "is_raven_available", lambda: True)
    monkeypatch.setattr(
        rlm_bridge.subprocess,
        "run",
        lambda *a, **kw: _Result(returncode=0, stdout=FAKE_OK_OUTPUT),
    )
    result = rlm_bridge.generate_skill_with_rlm(
        pages={"https://x": "# Docs"}, target_url="https://x"
    )
    assert result["success"] is True
    assert result["eve_files"]["skills/SKILL.md"].startswith("# Skill")
    assert result["issues"] == []


def test_generate_skill_with_rlm_uses_corpus_flag(monkeypatch):
    captured = {}

    def fake_run(cmd, *args, **kwargs):
        captured["cmd"] = cmd
        return _Result(returncode=0, stdout=FAKE_OK_OUTPUT)

    monkeypatch.setattr(rlm_bridge, "is_raven_available", lambda: True)
    monkeypatch.setattr(rlm_bridge.subprocess, "run", fake_run)
    rlm_bridge.generate_skill_with_rlm(
        pages={"https://x": "# Docs"}, target_url="https://x"
    )
    assert "--corpus" in captured["cmd"]
    assert any(part.endswith(".json") for part in captured["cmd"])


def test_generate_skill_with_raven_falls_back_to_truncated_brief(monkeypatch):
    """RLM-first path fails -> legacy truncated-brief path still succeeds."""

    def fake_rlm(**kwargs):
        return {"success": False, "eve_files": {}, "skill_content": "", "error": "nope"}

    monkeypatch.setattr(rlm_bridge, "generate_skill_with_rlm", fake_rlm)
    monkeypatch.setattr(
        raven_bridge.subprocess,
        "run",
        lambda *a, **kw: _Result(returncode=0, stdout=FAKE_OK_OUTPUT),
    )
    result = raven_bridge.generate_skill_with_raven(
        markdown_corpus="x" * 100000,
        target_url="https://x",
        pages={"https://x": "x" * 100000},
    )
    assert result["success"] is True
    assert result["attempt_count"] == 1
