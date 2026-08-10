"""
rlm_go_bridge.py — Python adapter for the Go RLM engine.

The Go engine (backend/go, `rlm` and `skillplan` subcommands) replaces the
Python RLM engine for the Contract 1 RLM route. This bridge is a thin
subprocess shim: it writes the corpus to a temp file, runs the compiled
deep-research-runner binary, and normalizes the result JSON into the same
dict contract rlm_engine.recursive_research_query used to return, so callers
(rlm_bridge, orchestrator, raven_bridge) only need to swap the import.

Usage:
    from rlm_go_bridge import rlm_synthesize, apply_skills
    res = rlm_synthesize(markdown_corpus, task)
"""

import json
import os
import subprocess
import sys
import tempfile

from rlm_routing import RLM_MAX_CORPUS_CHARS

# None = not yet resolved, "" = resolved miss, str = binary path.
_GO_BIN: str | None = None

DEFAULT_RLM_TIMEOUT = 240
DEFAULT_SKILLPLAN_TIMEOUT = 300


def find_go_runner() -> str | None:
    """Locate the compiled deep-research runner binary.

    Search order: explicit env var, then build output paths under the repo.
    Returns None when the runner is not built — callers fall back to the
    Python RLM engine (loudly).
    """
    global _GO_BIN
    if _GO_BIN is not None:
        return _GO_BIN or None
    env_bin = os.environ.get("ABSO_RAVEN_GO_BIN", "")
    if env_bin and os.path.isfile(env_bin):
        _GO_BIN = env_bin
        return _GO_BIN
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for candidate in (
        os.path.join(repo_root, "backend", "go", "bin", "deep-research-runner"),
        os.path.join(repo_root, "backend", "go", "deep-research-runner"),
    ):
        if os.path.isfile(candidate):
            _GO_BIN = candidate
            return _GO_BIN
    _GO_BIN = ""
    return None


def _write_corpus(markdown_corpus: str, pages: dict[str, str] | None) -> str:
    """Write the corpus to a temp file the Go engine can LoadCorpus.

    JSON objects are treated as {url: markdown} page maps by the Go side, so
    when pages are available we emit JSON; otherwise plain markdown.
    """
    fd, path = tempfile.mkstemp(suffix=".corpus", prefix="rlm-corpus-", text=True)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        if pages:
            json.dump(pages, f, ensure_ascii=False)
        else:
            f.write(markdown_corpus)
    return path


def _run_go_bridge(args: list[str], timeout: int) -> dict:
    go_bin = find_go_runner()
    if not go_bin:
        return {
            "success": False,
            "error": "Go RLM runner not built (backend/go/bin/deep-research-runner missing)",
        }
    try:
        result = subprocess.run(
            [go_bin, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        return {"success": False, "error": f"rlm runner error: {e}"}
    if result.returncode != 0:
        return {
            "success": False,
            "error": (
                f"rlm runner exited with code {result.returncode}: "
                f"{(result.stderr or result.stdout)[:500]}"
            ),
        }
    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"rlm runner output was not JSON: {e}"}


def rlm_synthesize(
    markdown_corpus: str,
    task: str,
    pages: dict[str, str] | None = None,
    timeout: int = DEFAULT_RLM_TIMEOUT,
) -> dict:
    """Run the Go RLM engine over the corpus and return the synthesis.

    Mirrors the rlm_engine.recursive_research_query contract:
        {success, answer, iterations, tokens_used, sub_calls_count,
         fallback_used, error}

    No silent truncation: an over-budget corpus warns loudly and is still
    passed to the engine in full (P loads the entire file).
    """
    if len(markdown_corpus) > RLM_MAX_CORPUS_CHARS:
        print(
            f"[rlm_go_bridge] WARNING: corpus {len(markdown_corpus):,} chars "
            f"exceeds RLM_MAX_CORPUS_CHARS ({RLM_MAX_CORPUS_CHARS:,}); "
            "the Go engine will not truncate."
        )
    corpus_path = _write_corpus(markdown_corpus, pages)
    try:
        parsed = _run_go_bridge(
            ["rlm", "--corpus", corpus_path, "--task", task, "--python", sys.executable],
            timeout,
        )
    finally:
        try:
            os.unlink(corpus_path)
        except OSError:
            pass
    if not parsed or parsed.get("success") is None:
        return {
            "success": False,
            "answer": "",
            "iterations": 0,
            "tokens_used": 0,
            "sub_calls_count": 0,
            "fallback_used": False,
            "error": parsed.get("error", "rlm runner produced no result"),
        }
    return {
        "success": bool(parsed.get("success")),
        "answer": parsed.get("answer", ""),
        "iterations": int(parsed.get("iterations", 0)),
        "tokens_used": int(parsed.get("tokens_used", 0)),
        "sub_calls_count": int(parsed.get("sub_calls_count", 0)),
        "fallback_used": bool(parsed.get("fallback_used", False)),
        "error": parsed.get("error") or None,
    }


def apply_skills(
    skills_dir: str,
    task: str,
    mode: str = "sequence",
    top_k: int = 3,
    timeout: int = DEFAULT_SKILLPLAN_TIMEOUT,
) -> dict:
    """Select and apply the top-k skills from the EVE library (Contract 2).

    Returns {success, selected_skills, applications, error} where
    applications is [{skill, output}].
    """
    parsed = _run_go_bridge(
        [
            "skillplan",
            "--skills",
            skills_dir,
            "--task",
            task,
            "--mode",
            mode,
            "--top-k",
            str(top_k),
        ],
        timeout,
    )
    if not parsed or parsed.get("success") is None:
        return {
            "success": False,
            "selected_skills": [],
            "applications": [],
            "error": parsed.get("error", "skillplan runner produced no result"),
        }
    return {
        "success": bool(parsed.get("success")),
        "selected_skills": parsed.get("selected_skills", []),
        "applications": parsed.get("applications", []),
        "error": parsed.get("error") or None,
    }
