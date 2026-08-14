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


def test_extract_empty_object_is_no_bundle():
    assert _extract_eve_from_raven_output("{}") == {}


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
# These tests fake subprocess.run and MUST pin the runner discovery to the CLI
# path (_find_go_runner -> None); otherwise a compiled Go runner in
# backend/go/bin silently hijacks the fake and the assertions break.


def _pin_cli_path(monkeypatch) -> None:
    monkeypatch.setattr("raven_bridge._find_go_runner", lambda: None)


def test_fast_fail_on_structural_output(monkeypatch):
    def fake_run(*args, **kwargs):
        return FakeProc(
            stdout="EverosBackend.recall failed; returning empty\n",
            returncode=1,
        )

    _pin_cli_path(monkeypatch)
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

    _pin_cli_path(monkeypatch)
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

    _pin_cli_path(monkeypatch)
    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
    )
    assert result["success"] is True
    assert result["attempt_count"] == 1
    assert result["issues"] == []


# ── Contract 1 dispatch: long/large jobs route through RLM, short jobs don't ─


def _rlm_result():
    return {
        "success": True,
        "eve_files": VALID_BUNDLE,
        "skill_content": json.dumps(VALID_BUNDLE),
        "attempt_count": 1,
        "issues": [],
        "error": None,
    }


def test_long_corpus_routes_through_rlm(monkeypatch):
    """A document at/above RLM_ROUTE_MIN_CHARS must dispatch through the RLM
    engine; the direct truncated-brief path must never run."""
    calls = []

    def fake_rlm(**kwargs):
        calls.append(kwargs)
        return _rlm_result()

    monkeypatch.setattr("rlm_bridge.generate_skill_with_rlm", fake_rlm)
    monkeypatch.setattr(
        "raven_bridge.subprocess.run",
        lambda *a, **k: (_ for _ in ()).throw(
            AssertionError("direct subprocess path must not run on RLM jobs")
        ),
    )
    result = generate_skill_with_raven(
        markdown_corpus="# docs\n" + "x" * 30_000,
        target_url="https://example.com/docs",
    )
    assert result["success"] is True
    assert len(calls) == 1
    assert result["eve_files"] == VALID_BUNDLE


def test_many_urls_route_through_rlm(monkeypatch):
    """Two+ source URLs route through RLM regardless of corpus size."""
    calls = []

    def fake_rlm(**kwargs):
        calls.append(kwargs)
        return _rlm_result()

    monkeypatch.setattr("rlm_bridge.generate_skill_with_rlm", fake_rlm)
    result = generate_skill_with_raven(
        markdown_corpus="",
        target_url="https://example.com/docs",
        pages={"https://a": "# A", "https://b": "# B"},
    )
    assert result["success"] is True
    assert len(calls) == 1
    assert set(calls[0]["pages"]) == {"https://a", "https://b"}


def test_short_single_input_keeps_direct_path(monkeypatch):
    """Short single-URL jobs keep the direct path: RLM must not be consulted."""
    calls = []

    def fake_rlm(**kwargs):
        calls.append(kwargs)
        return _rlm_result()

    def fake_run(*args, **kwargs):
        return FakeProc(stdout=json.dumps(VALID_BUNDLE))

    monkeypatch.setattr("rlm_bridge.generate_skill_with_rlm", fake_rlm)
    _pin_cli_path(monkeypatch)
    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
        pages={"https://pixabay.com/api/docs/": PIXABAY_CORPUS},
    )
    assert result["success"] is True
    assert calls == []  # RLM never consulted on the direct path


# ── Go runner path (compiled deep-research runner, no mocks on dispatch) ─────


def test_go_runner_path_success(monkeypatch):
    """A compiled Go runner emitting its contract JSON is exercised end to end:
    ``_run_go_runner`` normalizes {success, eve_files} and the verifier passes."""
    contract = json.dumps(
        {"success": True, "eve_files": VALID_BUNDLE, "output": "bundle", "error": None}
    )

    def fake_run(*args, **kwargs):
        return FakeProc(stdout=contract)

    monkeypatch.setattr("raven_bridge._find_go_runner", lambda: "/fake/go-runner")
    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
    )
    assert result["success"] is True
    assert result["attempt_count"] == 1
    assert result["eve_files"] == VALID_BUNDLE
    assert result["issues"] == []


def test_go_runner_research_failure_not_retried_via_cli(monkeypatch):
    """A research-level failure from the Go runner (it ran, Raven produced no
    usable bundle) must NOT fall back to the direct CLI — that would burn a
    duplicate 120s research run on an unfixable output contract."""
    calls = []

    def fake_run(*args, **kwargs):
        calls.append(args[0])
        return FakeProc(
            stdout=json.dumps(
                {
                    "success": False,
                    "error": "Raven output contains no JSON object",
                    "structural": True,
                }
            )
        )

    monkeypatch.setattr("raven_bridge._find_go_runner", lambda: "/fake/go-runner")
    monkeypatch.setattr("raven_bridge.subprocess.run", fake_run)
    result = generate_skill_with_raven(
        markdown_corpus=PIXABAY_CORPUS,
        target_url="https://pixabay.com/api/docs/",
    )
    assert result["success"] is False
    assert result["attempt_count"] == 1  # fast-fail on structural failure
    assert len(calls) == 1, "only the Go runner invocation, no CLI fallback"
    assert calls[0][0] == "/fake/go-runner"


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


def test_generate_skill_with_raven_real_boundary():
    """Real end-to-end run: brief → Raven deep research → verified EVE bundle.

    No mocks anywhere on this path. When the compiled Go runner is present
    (backend/go/bin/deep-research-runner) it is exercised first; otherwise the
    direct vendored CLI is exercised. Verifier must pass on the real output.
    """
    if not is_raven_available():
        pytest.skip(
            "Raven CLI not installed/configured in this environment — real-boundary "
            "integration test skipped (reported as unverified, not faked)"
        )
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
