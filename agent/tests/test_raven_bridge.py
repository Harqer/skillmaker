"""
test_raven_bridge.py — unit + integration tests for the Raven deep research bridge.

The integration test (`test_generate_skill_with_raven_real_boundary`) exercises
the REAL subprocess boundary — the vendored Raven CLI (through the Go runner when
built, otherwise the direct CLI) — with no mocks, in line with the no-mock
discipline. It skips when Raven is not installed/configured in the environment,
which is reported honestly instead of being replaced with a fake.

The remaining tests are deterministic unit tests over pure functions and the
bounded-retry/fast-fail control flow.
"""

import json

import pytest
from raven_bridge import (
    _extract_eve_from_raven_output,
    _output_is_structural_failure,
    generate_skill_card_with_raven,
    generate_skill_with_raven,
    is_raven_available,
    verify_skill_bundle,
)

PIXABAY_CORPUS = """# Pixabay API
## Authentication
API key via query param `key=YOUR_KEY`.
## Endpoints
GET /api/ — search photos. Params q, image_type, orientation, category, min_width, colors, safesearch, order, page, per_page. Returns hits with id, pageURL, type, tags, previewURL, webformatURL, largeImageURL, views, downloads, likes, user_id, user.
## Response
totalHits, hits array.
## Rate limits
100 requests per minute.
## Video API
GET /api/videos/ — params q, video_type, per_page. Returns videos array.
"""

VALID_BUNDLE = {
    "instructions.md": "# Lead Agent Coordinator\n\nRouting rules that direct every incoming task to the correct specialist subagent based on intent classification, with explicit bounded-loop execution and telemetry reporting throughout the run.",
    "skills/SKILL.md": "# Domain Skill\n\nTrigger conditions that activate this skill, operational constraints that must never be violated, and the negative constraints that guard against misuse of the underlying platform APIs.",
    "subagents/specialist.md": "# Specialist\n\nExecutes tasks in bounded loops with explicit evaluator checks after each iteration. max_iterations: 5",
    "rules/boundary_checks.md": "# Boundary Checks\n\nEdge-case handling rules covering malformed payloads, rate limits, retries with backoff, and idempotency requirements for safe production operation.",
}


class FakeProc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


# ── Extraction (pure functions, real data shapes) ────────────────────────────


def test_extract_from_raw_json():
    raw = json.dumps(VALID_BUNDLE)
    assert _extract_eve_from_raven_output(raw) == VALID_BUNDLE


def test_extract_from_fenced_json():
    raw = "```json\n" + json.dumps(VALID_BUNDLE) + "\n```\n"
    assert _extract_eve_from_raven_output(raw) == VALID_BUNDLE


def test_extract_from_banner_plus_json():
    raw = "[everos] recall failed\n" + json.dumps(VALID_BUNDLE) + "\n[DONE]"
    assert _extract_eve_from_raven_output(raw) == VALID_BUNDLE


def test_extract_fails_on_wrap_corrupted_json():
    # Old CLI would wrap markdown inside the JSON object, corrupting the bundle.
    corrupted = json.dumps({"instructions.md": "# H"})[:-2] + "} }\n```"
    assert _extract_eve_from_raven_output(corrupted) == {}


def test_extract_fails_on_banner_only():
    assert _extract_eve_from_raven_output("EverosBackend.recall failed\n") == {}


def test_extract_empty():
    assert _extract_eve_from_raven_output("") == {}


def test_normalize_non_string_values():
    raw = '{"a.md": {"nested": [1, 2]}, "empty.md": null}'
    out = _extract_eve_from_raven_output(raw)
    assert out["a.md"] == '{\n  "nested": [\n    1,\n    2\n  ]\n}'
    assert out["empty.md"] == ""


# ── Structural failure detection ─────────────────────────────────────────────


def test_structural_reason_empty():
    assert _output_is_structural_failure("") == "Raven returned empty output"


def test_structural_reason_no_json():
    reason = _output_is_structural_failure("just prose, no braces")
    assert "no JSON" in reason


def test_structural_reason_corrupted():
    reason = _output_is_structural_failure("{foo}")
    assert "corrupted" in reason


def test_structural_reason_none_for_valid():
    assert _output_is_structural_failure(json.dumps(VALID_BUNDLE)) is None


# ── Verifier ─────────────────────────────────────────────────────────────────


def test_verify_valid_bundle():
    passes, issues = verify_skill_bundle(VALID_BUNDLE)
    assert passes is True
    assert issues == []


def test_verify_missing_required_files():
    passes, issues = verify_skill_bundle({"skills/SKILL.md": "# x"})
    assert passes is False
    assert any("Missing required" in i for i in issues)


# ── Fast-fail / bounded retry control flow (fake subprocess boundary) ────────


def test_fast_fail_on_structural_output(monkeypatch):
    def fake_run(*args, **kwargs):
        return FakeProc(
            stdout="EverosBackend.recall failed; returning empty\n",
            returncode=1,
        )

    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
    )
    assert result["success"] is False
    assert result["attempt_count"] == 1  # fast-fail: no full retries burned


def test_retries_on_verifier_rejection(monkeypatch):
    bundle = dict(VALID_BUNDLE)
    del bundle["skills/SKILL.md"]

    def fake_run(*args, **kwargs):
        return FakeProc(stdout=json.dumps(bundle))

    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
    )
    assert result["success"] is False
    assert result["attempt_count"] == 3  # bounded retries, then loud failure


def test_success_path(monkeypatch):
    def fake_run(*args, **kwargs):
        return FakeProc(stdout=json.dumps(VALID_BUNDLE))

    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
    )
    assert result["success"] is True
    assert result["attempt_count"] == 1
    assert result["issues"] == []


# ── Loud failure: orchestrator-compatible wrapper must raise, never degrade ──


def test_generate_skill_card_raises_when_raven_unavailable(monkeypatch):
    monkeypatch.setattr("raven_bridge.is_raven_available", lambda: False)
    with pytest.raises(RuntimeError, match="Raven deep research unavailable"):
        generate_skill_card_with_raven(
            {"target_url": "https://example.com/docs"},
            markdown_corpus=PIXABAY_CORPUS,
        )


def test_generate_skill_card_raises_when_generation_fails(monkeypatch):
    monkeypatch.setattr("raven_bridge.is_raven_available", lambda: True)
    monkeypatch.setattr(
        "raven_bridge.generate_skill_with_raven",
        lambda **kwargs: {
            "success": False,
            "eve_files": {},
            "skill_content": "",
            "attempt_count": 3,
            "issues": ["All 3 attempts failed"],
            "error": "boom",
        },
    )
    with pytest.raises(RuntimeError, match="Raven deep research failed: boom"):
        generate_skill_card_with_raven(
            {"target_url": "https://example.com/docs"},
            markdown_corpus=PIXABAY_CORPUS,
        )


# ── Integration test: the REAL subprocess/runner boundary (no mocks) ─────────


@pytest.mark.skipif(
    not is_raven_available(),
    reason="Raven CLI not installed/configured in this environment — real-boundary "
    "integration test skipped (reported as unverified, not faked)",
)
def test_generate_skill_with_raven_real_boundary():
    """Real end-to-end run: brief → Raven deep research → verified EVE bundle.

    No mocks anywhere on this path. When the compiled Go runner is present
    (backend/go/bin/deep-research-runner) it is exercised first; otherwise the
    direct vendored CLI is exercised. Verifier must pass on the real output.
    """
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
        task_prompt="Generate a Pixabay API EVE skill bundle.",
    )
    assert result["success"] is True, result.get("error")
    assert result["issues"] == []
    assert "instructions.md" in result["eve_files"]
    assert "skills/SKILL.md" in result["eve_files"]
    passes, issues = verify_skill_bundle(result["eve_files"])
    assert passes is True, issues
