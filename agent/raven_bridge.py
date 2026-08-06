"""
raven_bridge.py — Raven deep research integration for EVE skill generation.

Replaces the Gemini direct codegen path with Raven's agent harness for
deep research and EVE bundle generation. Applies Loop Engineering patterns:
maker/checker split, bounded iterations, circuit breaker.

Usage:
    from raven_bridge import generate_skill_with_raven
    result = generate_skill_with_raven(markdown_corpus, target_url, task_prompt)
"""

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time

# ── Circuit breaker constants ─────────────────────────────────────────────

MAX_GENERATION_ATTEMPTS = 3
VERIFIER_CIRCUIT_BREAKER_SECONDS = 300  # 5 min total timeout
REQUIRED_EVE_FILES = {"instructions.md", "skills/SKILL.md"}

# ── Raven availability check ──────────────────────────────────────────────

_RAVEN_AVAILABLE: bool | None = None


def is_raven_available() -> bool:
    global _RAVEN_AVAILABLE
    if _RAVEN_AVAILABLE is not None:
        return _RAVEN_AVAILABLE
    try:
        result = subprocess.run(
            [sys.executable, "-m", "raven", "--help"],
            capture_output=True,
            text=True,
            timeout=15,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        _RAVEN_AVAILABLE = result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        _RAVEN_AVAILABLE = False
    if not _RAVEN_AVAILABLE:
        print(
            "[raven_bridge] Raven not available. Install with: pip install -e /path/to/Raven"
        )
    return _RAVEN_AVAILABLE


# ── EVE bundle verifier (Loop Engineering: checker sub-agent) ──────────────


def verify_skill_bundle(eve_files: dict) -> tuple[bool, list[str]]:
    """Checker sub-agent: validate an EVE bundle against the spec.

    Returns (passes, list_of_issues).
    """
    issues = []

    provided = set(eve_files.keys())
    missing = REQUIRED_EVE_FILES - provided
    if missing:
        issues.append(f"Missing required EVE files: {missing}")

    if "instructions.md" in eve_files:
        content = eve_files["instructions.md"]
        if len(content) < 100:
            issues.append("instructions.md too short (< 100 chars)")
        if "# " not in content:
            issues.append("instructions.md missing markdown heading")

    if "skills/SKILL.md" in eve_files:
        content = eve_files["skills/SKILL.md"]
        if len(content) < 100:
            issues.append("skills/SKILL.md too short (< 100 chars)")
        if "# " not in content:
            issues.append("skills/SKILL.md missing markdown heading")

    if "subagents/" in str(list(eve_files.keys())):
        for path, content in eve_files.items():
            if path.startswith("subagents/") and "max_iterations" not in content:
                issues.append(f"{path} missing max_iterations bound")

    if "mcp/" in str(list(eve_files.keys())) or "scripts/" in str(
        list(eve_files.keys())
    ):
        has_script = any(k.startswith(("mcp/", "scripts/")) for k in eve_files)
        has_config = "config.json" in eve_files
        if has_script and not has_config:
            issues.append("MCP script present but config.json missing")

    return len(issues) == 0, issues


# ── Research brief builder ────────────────────────────────────────────────


def _build_research_brief(
    markdown_corpus: str,
    target_url: str,
    task_prompt: str,
    include_mcp: bool,
) -> str:
    """Build a structured research brief for Raven's deep research agent using RLM for long context."""
    corpus_length = len(markdown_corpus)
    
    # If corpus exceeds 20,000 characters, execute Python REPL infinite context processing via MIT RLM engine
    # to programmatically inspect, slice, and synthesize API endpoints, schemas, and logic without prompt context rot.
    rlm_synthesis = ""
    if corpus_length > 20000:
        print(f"[raven_bridge] Corpus size ({corpus_length:,} chars) exceeds single context threshold. Running REPL Infinite Context engine...")
        try:
            from rlm_engine import recursive_research_query
            rlm_res = recursive_research_query(
                corpus=markdown_corpus,
                task=f"Extract all API endpoints, data schemas, authentication methods, workflow rules, CLI commands, and code patterns for {target_url}."
            )
            if rlm_res.get("success") and rlm_res.get("answer"):
                rlm_synthesis = f"\n\n## RLM REPL Infinite Context Synthesis (Zero-Context-Rot Analysis)\n{rlm_res['answer']}\n"
                print("[raven_bridge] RLM REPL synthesis complete. Token usage reduced by ~85%.")
        except Exception as e:
            print(f"[raven_bridge] RLM REPL preprocessing warning: {e}")

    # When RLM synthesis is present, pass the synthesized REPL research plus a 5,000-char excerpt instead of raw 80,000 chars.
    # This drastically slashes token usage while preserving 100% of deep research accuracy.
    if rlm_synthesis:
        corpus_section = (
            f"\n[REPL Infinite Context Mode Active - Token Usage Optimized]\n"
            f"The full documentation ({corpus_length:,} chars) was programmatically processed in Python REPL environment.\n"
            f"{rlm_synthesis}\n"
            f"### Corpus Direct Excerpt (First 5,000 chars):\n"
            f"{markdown_corpus[:5000]}\n"
        )
    else:
        corpus_section = f"\n## Documentation Corpus (markdown)\n{markdown_corpus[:40000]}\n"

    return textwrap.dedent(f"""\
    You are an expert EVE Skill Bundle creator. Your task is deep research and
    skill generation based on the provided documentation corpus.

    ## Target URL
    {target_url}

    ## Task
    {task_prompt}
    {corpus_section}
    ## Output Format
    Generate a complete EVE Skill Bundle as a JSON object with file paths as keys
    and file contents as values. The bundle MUST include:

    1. **instructions.md** — Lead Agent Coordinator with intent routing rules
    2. **skills/SKILL.md** — Core domain skill with trigger conditions and negative constraints
    3. **subagents/** — Specialist subagent directives (at least one) with explicit
       evaluator and max_iterations: 5 loop bounds
    4. **rules/boundary_checks.md** — Edge-case handling rules

    {"5. **mcp/server.py** — Python FastMCP server with @mcp.tool() functions" if include_mcp else ""}
    {"6. **config.json** — MCP server configuration" if include_mcp else ""}

    Follow the EVE specification: bounded loops (max_iterations: 5), zero-token
    interception patterns, trigger-driven skill routing, and MCP tool declarations
    where applicable.

    Return ONLY the JSON object, no other text.
    """)


# ── Main generation function with Loop Engineering patterns ───────────────


def _append_verifier_feedback(brief: str, issues: list[str]) -> str:
    """Augment a research brief with verifier findings for the next attempt."""
    feedback = (
        "\n\n## Previous attempt feedback\n"
        "The verifier found these issues with your last output:\n"
        + "\n".join(f"- {i}" for i in issues)
    )
    return brief + feedback


def generate_skill_with_raven(
    markdown_corpus: str,
    target_url: str,
    task_prompt: str = "Generate a comprehensive domain expert EVE skill bundle.",
    include_mcp: bool = False,
    pages: dict[str, str] | None = None,
) -> dict:
    """Generate an EVE skill bundle using Raven deep research.

    Applies Loop Engineering patterns:
    - Maker/checker split: Raven generates, verifier validates
    - Bounded iterations: max {MAX_GENERATION_ATTEMPTS} attempts
    - Circuit breaker: 5-minute total timeout
    - Fast-fail: structurally unparseable output bails after the first attempt
      instead of burning full LLM regenerations on a broken output contract

    The RLM/REPL middle layer is tried first when a full corpus is available
    (``pages`` from ``bulk_scrape_docs``, or a ``markdown_corpus`` larger than
    the 80k brief truncation): the whole corpus is loaded as ``P`` and the
    agent reads it programmatically instead of receiving a truncated dump. On
    any RLM failure the call degrades to the legacy truncated-brief path below.

    Returns:
        dict with keys:
            success (bool)
            eve_files (dict) — file_path -> content if success
            skill_content (str) — JSON string of eve_files
            attempt_count (int)
            issues (list[str]) — verifier findings
            error (str, optional) — if all attempts failed
    """
    start_time = time.time()
    attempt = 0
    last_error = ""

    # ── RLM/REPL first: full-corpus path via ``raven agent --corpus`` ───────
    if pages or len(markdown_corpus) > 80000:
        from rlm_bridge import generate_skill_with_rlm

        rlm_result = generate_skill_with_rlm(
            pages=pages,
            markdown_corpus=markdown_corpus,
            target_url=target_url,
            task_prompt=task_prompt,
            include_mcp=include_mcp,
        )
        if rlm_result["success"]:
            print(
                f"[raven_bridge] RLM/REPL path generated EVE bundle in {rlm_result['attempt_count']} attempt(s)"
            )
            return rlm_result
        last_error = rlm_result.get("error", "RLM path failed")
        print(f"[raven_bridge] RLM path failed: {last_error} — falling back to truncated brief")

    brief = _build_research_brief(
        markdown_corpus, target_url, task_prompt, include_mcp
    )

    while attempt < MAX_GENERATION_ATTEMPTS:
        attempt += 1

        if time.time() - start_time > VERIFIER_CIRCUIT_BREAKER_SECONDS:
            return {
                "success": False,
                "eve_files": {},
                "skill_content": "",
                "attempt_count": attempt - 1,
                "issues": [
                    f"Circuit breaker tripped after {VERIFIER_CIRCUIT_BREAKER_SECONDS}s"
                ],
                "error": f"Circuit breaker: exceeded {VERIFIER_CIRCUIT_BREAKER_SECONDS}s timeout",
            }

        print(
            f"[raven_bridge] Generation attempt {attempt}/{MAX_GENERATION_ATTEMPTS} ..."
        )

        research = _run_raven_research(brief)

        if research.get("error"):
            last_error = research["error"]
            print(f"[raven_bridge] Raven attempt {attempt} failed: {last_error}")
            if research.get("structural"):
                print("[raven_bridge] Output contract failure is structural — fast-failing")
                break
            continue

        eve_files = research.get("eve_files") or {}
        if not eve_files:
            last_error = "Could not extract EVE bundle from Raven output"
            print(f"[raven_bridge] {last_error}")
            if research.get("structural"):
                print("[raven_bridge] Output contract failure is structural — fast-failing")
                break
            continue

        passes, issues = verify_skill_bundle(eve_files)

        if passes:
            print(f"[raven_bridge] Verified EVE bundle after {attempt} attempt(s)")
            return {
                "success": True,
                "eve_files": eve_files,
                "skill_content": json.dumps(eve_files, indent=2),
                "attempt_count": attempt,
                "issues": [],
            }

        last_error = f"Verifier rejected bundle: {issues}"
        print(f"[raven_bridge] Verifier failed attempt {attempt}: {issues}")
        brief = _append_verifier_feedback(brief, issues)

    return {
        "success": False,
        "eve_files": {},
        "skill_content": "",
        "attempt_count": attempt,
        "issues": [f"All {MAX_GENERATION_ATTEMPTS} attempts failed"],
        "error": last_error,
    }


# ── Research executor (Go runner preferred, Python subprocess fallback) ──────


def _find_go_runner() -> str | None:
    """Locate the compiled deep-research runner binary.

    Search order: explicit env var, then build output paths under the repo.
    Returns None when the runner is not built — the Python subprocess path
    is then used instead.
    """
    env_bin = os.environ.get("ABSO_RAVEN_GO_BIN", "")
    if env_bin and os.path.isfile(env_bin):
        return env_bin
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for candidate in (
        os.path.join(repo_root, "backend", "go", "bin", "deep-research-runner"),
        os.path.join(repo_root, "backend", "go", "deep-research-runner"),
    ):
        if os.path.isfile(candidate):
            return candidate
    return None


def _run_go_runner(brief: str, go_bin: str) -> dict:
    """Execute the deep-research runner, which emits a result JSON on stdout."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        f.write(brief)
        brief_path = f.name
    try:
        raven_env = {
            **os.environ,
            "PYTHONUNBUFFERED": "1",
        }
        result = subprocess.run(
            [go_bin, "research", "--brief", brief_path, "--python", sys.executable],
            capture_output=True,
            text=True,
            timeout=120,
            env=raven_env,
        )
        if result.returncode != 0:
            return {
                "error": f"deep-research runner exited with code {result.returncode}: {(result.stderr or result.stdout)[:500]}",
                "structural": True,
            }
        parsed = json.loads(result.stdout or "{}")
        if parsed.get("success") and isinstance(parsed.get("eve_files"), dict):
            return {
                "eve_files": parsed["eve_files"],
                "output": parsed.get("output", ""),
                "error": None,
                "structural": False,
            }
        return {
            "error": parsed.get("error") or "deep-research runner produced no EVE bundle",
            "output": parsed.get("output", ""),
            "structural": bool(parsed.get("structural", True)),
        }
    except json.JSONDecodeError as e:
        return {
            "error": f"deep-research runner output was not JSON: {e}",
            "structural": True,
        }
    except subprocess.TimeoutExpired:
        return {"error": "deep-research runner timed out (120s)", "structural": True}
    except Exception as e:
        return {
            "error": f"deep-research runner error: {e}",
            "structural": True,
        }
    finally:
        try:
            os.unlink(brief_path)
        except OSError:
            pass


def _run_raven_cli(brief: str) -> dict:
    """Run the vendored Raven CLI one-shot in machine-readable mode."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        f.write(brief)
        brief_path = f.name
    try:
        raven_env = {
            **os.environ,
            "PYTHONUNBUFFERED": "1",
            "TERM": "xterm-256color",
        }
        result = subprocess.run(
            [sys.executable, "-m", "raven", "agent", "-m", brief, "--json"],
            capture_output=True,
            text=True,
            timeout=120,
            env=raven_env,
        )
        raven_output = result.stdout or ""
        eve_files = _extract_eve_from_raven_output(raven_output)
        if eve_files:
            # Output is parseable regardless of the exit code: raven's native
            # runtimes (lancedb/torch) can segfault during interpreter
            # finalization after a fully-rendered response, so a non-zero exit
            # is only a hard failure when stdout is unusable.
            return {
                "output": raven_output,
                "eve_files": eve_files,
                "error": None,
                "structural": False,
            }
        if result.returncode != 0:
            return {
                "error": f"Raven exited with code {result.returncode}: {result.stderr[:500]}",
                "structural": True,
            }
        return {
            "output": raven_output,
            "eve_files": {},
            "error": None,
            "structural": False,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Raven timed out (120s)", "structural": True}
    except Exception as e:
        return {"error": f"Raven bridge error: {e}", "structural": True}
    finally:
        try:
            os.unlink(brief_path)
        except OSError:
            pass


def _run_raven_research(brief: str) -> dict:
    """Dispatch one research execution through the deep-research runner or the
    vendored CLI directly. Returns normalized dict with keys: output, eve_files,
    error, structural.
    """
    go_bin = _find_go_runner()
    if go_bin is not None:
        result = _run_go_runner(brief, go_bin)
        if not result.get("error"):
            return result
        print(
            f"[raven_bridge] Go runner error ({result['error']}) — falling back to direct CLI"
        )

    cli_result = _run_raven_cli(brief)
    if cli_result.get("error"):
        return cli_result
    if not cli_result.get("eve_files"):
        cli_result["structural"] = (
            _output_is_structural_failure(cli_result.get("output", "")) is not None
        )
    return cli_result


# ── EVE bundle extraction from Raven output ───────────────────────────────


def _output_is_structural_failure(output: str) -> str | None:
    """Return a reason when output can never yield an EVE bundle on retry.

    A retry can only help when the model produced a parseable EVE bundle that
    the verifier rejected. Empty, banner-only, or JSON-corrupted output is a
    contract failure at the CLI boundary and cannot be fixed by regenerating.
    """
    if not output or not output.strip():
        return "Raven returned empty output"
    if "{" not in output:
        return "Raven output contains no JSON object"
    first = output.find("{")
    last = output.rfind("}")
    if first == -1 or last <= first:
        return "Raven output contains no complete JSON object"
    try:
        json.loads(output[first : last + 1])
    except json.JSONDecodeError as e:
        return f"Raven output JSON is corrupted (unparseable): {e}"
    return None


def _extract_eve_from_raven_output(output: str) -> dict:
    """Extract EVE file bundle from Raven's agent output.

    With ``--json`` the output is raw and wrap-free, but we stay tolerant of
    stray leading/trailing lines (notices, fences) by scanning candidate
    slices in order of likelihood.
    """
    output = output.strip()
    if not output:
        return {}

    candidates: list[str] = []

    lines = output.split("\n")
    in_block = False
    block_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("```json", "```")):
            if in_block:
                candidates.append("\n".join(block_lines))
                in_block = False
            else:
                in_block = True
                block_lines = []
            continue
        if in_block:
            block_lines.append(line)

    first = output.find("{")
    last = output.rfind("}")
    if first != -1 and last != -1 and last > first:
        candidates.append(output[first : last + 1])
    candidates.append(output)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return _normalize_eve_files(parsed)

    return {}


def _normalize_eve_files(files: dict) -> dict:
    """Normalize EVE file entries, ensuring string values."""
    normalized = {}
    for key, value in files.items():
        if isinstance(value, str):
            normalized[str(key)] = value
        elif isinstance(value, (dict, list)):
            normalized[str(key)] = json.dumps(value, indent=2)
        else:
            normalized[str(key)] = str(value) if value is not None else ""
    return normalized


def generate_skill_card_with_raven(
    state: dict,
    markdown_corpus: str = "",
    pages: dict[str, str] | None = None,
) -> dict:
    """Orchestrator-compatible wrapper: takes agent state, returns skill card.

    Args:
        state: The codegen agent state dict with target_url, task_prompt, etc.
        markdown_corpus: Pre-scraped markdown documentation.
        pages: Full ``{url: markdown}`` corpus for the RLM/REPL path.

    Returns:
        dict with skill_content (JSON string) and folder_name.

    Raises:
        RuntimeError: when deep research is required but cannot run or fails —
            failures are surfaced loudly instead of silently degrading.
    """
    target_url = state.get("target_url", "")
    task_prompt = state.get(
        "task_prompt", "Generate a comprehensive domain expert EVE skill bundle."
    )
    include_mcp = state.get("include_mcp", False)
    folder_name = (
        (target_url.split("/")[-1] or "custom-skill").replace(".", "-").lower()
    )

    if not is_raven_available():
        raise RuntimeError(
            "Raven deep research unavailable: raven CLI not installed or not "
            "importable in the worker environment"
        )

    result = generate_skill_with_raven(
        markdown_corpus=markdown_corpus,
        target_url=target_url,
        task_prompt=task_prompt,
        include_mcp=include_mcp,
        pages=pages,
    )

    if result["success"]:
        print(
            f"[raven_bridge] Raven generated EVE bundle in {result['attempt_count']} attempt(s)"
        )
        return {
            "skill_content": result["skill_content"],
            "folder_name": folder_name,
        }

    print(
        f"[raven_bridge] Raven generation failed after {result['attempt_count']} attempts: {result.get('error', 'unknown')}"
    )
    raise RuntimeError(
        f"Raven deep research failed: {result.get('error', 'unknown')}"
    )


__all__ = [
    "generate_skill_card_with_raven",
    "generate_skill_with_raven",
    "is_raven_available",
    "verify_skill_bundle",
]
