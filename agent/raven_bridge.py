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
from pathlib import Path
from typing import Optional

# ── Circuit breaker constants ─────────────────────────────────────────────

MAX_GENERATION_ATTEMPTS = 3
VERIFIER_CIRCUIT_BREAKER_SECONDS = 300  # 5 min total timeout
REQUIRED_EVE_FILES = {"instructions.md", "skills/SKILL.md"}

# ── Raven availability check ──────────────────────────────────────────────

_RAVEN_AVAILABLE: Optional[bool] = None


def is_raven_available() -> bool:
    global _RAVEN_AVAILABLE
    if _RAVEN_AVAILABLE is not None:
        return _RAVEN_AVAILABLE
    try:
        result = subprocess.run(
            [sys.executable, "-m", "raven", "--help"],
            capture_output=True, text=True, timeout=15,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        _RAVEN_AVAILABLE = result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        _RAVEN_AVAILABLE = False
    if not _RAVEN_AVAILABLE:
        print("[raven_bridge] Raven not available. Install with: pip install -e /path/to/Raven")
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

    if "mcp/" in str(list(eve_files.keys())) or "scripts/" in str(list(eve_files.keys())):
        has_script = any(
            k.startswith("mcp/") or k.startswith("scripts/") for k in eve_files
        )
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
    """Build a structured research brief for Raven's deep research agent."""
    truncated = markdown_corpus[:80000] if len(markdown_corpus) > 80000 else markdown_corpus
    summary_note = ""
    if len(markdown_corpus) > 80000:
        summary_note = (
            f"\n[NOTE: The full documentation corpus is {len(markdown_corpus):,} characters. "
            f"The first 80,000 are shown above. The remaining content has been vector-indexed "
            f"in the Databricks Lakehouse for retrieval during research.]"
        )

    return textwrap.dedent(f"""\
    You are an expert EVE Skill Bundle creator. Your task is deep research and
    skill generation based on the provided documentation corpus.

    ## Target URL
    {target_url}

    ## Task
    {task_prompt}

    ## Documentation Corpus (markdown)
    {truncated}
    {summary_note}

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


def generate_skill_with_raven(
    markdown_corpus: str,
    target_url: str,
    task_prompt: str = "Generate a comprehensive domain expert EVE skill bundle.",
    include_mcp: bool = False,
) -> dict:
    """Generate an EVE skill bundle using Raven deep research.

    Applies Loop Engineering patterns:
    - Maker/checker split: Raven generates, verifier validates
    - Bounded iterations: max {MAX_GENERATION_ATTEMPTS} attempts
    - Circuit breaker: 5-minute total timeout

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

    while attempt < MAX_GENERATION_ATTEMPTS:
        attempt += 1

        if time.time() - start_time > VERIFIER_CIRCUIT_BREAKER_SECONDS:
            return {
                "success": False,
                "eve_files": {},
                "skill_content": "",
                "attempt_count": attempt - 1,
                "issues": [f"Circuit breaker tripped after {VERIFIER_CIRCUIT_BREAKER_SECONDS}s"],
                "error": f"Circuit breaker: exceeded {VERIFIER_CIRCUIT_BREAKER_SECONDS}s timeout",
            }

        print(f"[raven_bridge] Generation attempt {attempt}/{MAX_GENERATION_ATTEMPTS} ...")

        brief = _build_research_brief(markdown_corpus, target_url, task_prompt, include_mcp)

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
                "RAVEN_SKILL_MODE": "1",
            }
            result = subprocess.run(
                [sys.executable, "-m", "raven", "agent", "-m", brief],
                capture_output=True, text=True, timeout=120,
                env=raven_env,
            )

            raven_output = result.stdout or ""
            raven_error = result.stderr or ""

            if result.returncode != 0:
                last_error = f"Raven exited with code {result.returncode}: {raven_error[:500]}"
                print(f"[raven_bridge] Raven attempt {attempt} failed: {last_error}")
                continue

            eve_files = _extract_eve_from_raven_output(raven_output)

            if not eve_files:
                last_error = "Could not extract EVE bundle from Raven output"
                print(f"[raven_bridge] {last_error}")
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
            else:
                last_error = f"Verifier rejected bundle: {issues}"
                print(f"[raven_bridge] Verifier failed attempt {attempt}: {issues}")
                context_hint = (
                    "\n\n## Previous attempt feedback\n"
                    f"The verifier found these issues with your last output:\n"
                    + "\n".join(f"- {i}" for i in issues)
                )
                task_prompt += context_hint

        except subprocess.TimeoutExpired:
            last_error = f"Raven timed out (120s) on attempt {attempt}"
            print(f"[raven_bridge] {last_error}")
        except Exception as e:
            last_error = f"Raven bridge error on attempt {attempt}: {e}"
            print(f"[raven_bridge] {last_error}")
        finally:
            try:
                os.unlink(brief_path)
            except OSError:
                pass

    return {
        "success": False,
        "eve_files": {},
        "skill_content": "",
        "attempt_count": attempt,
        "issues": [f"All {MAX_GENERATION_ATTEMPTS} attempts failed"],
        "error": last_error,
    }


# ── EVE bundle extraction from Raven output ───────────────────────────────


def _extract_eve_from_raven_output(output: str) -> dict:
    """Extract EVE file bundle from Raven's agent output.

    Raven returns markdown text. We look for a JSON code block or any
    well-formed JSON dictionary in the response.
    """
    output = output.strip()
    if not output:
        return {}

    json_block = None

    lines = output.split("\n")
    in_block = False
    block_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```json") or stripped.startswith("```"):
            if in_block:
                in_block = False
                json_block = "\n".join(block_lines)
                break
            else:
                in_block = True
                block_lines = []
                continue
        if in_block:
            block_lines.append(line)

    if json_block:
        try:
            parsed = json.loads(json_block)
            if isinstance(parsed, dict):
                return _normalize_eve_files(parsed)
        except json.JSONDecodeError:
            pass

    try:
        parsed = json.loads(output)
        if isinstance(parsed, dict):
            return _normalize_eve_files(parsed)
    except json.JSONDecodeError:
        pass

    return {}


def _normalize_eve_files(files: dict) -> dict:
    """Normalize EVE file entries, ensuring string values."""
    normalized = {}
    for key, value in files.items():
        if isinstance(value, str):
            normalized[str(key)] = value
        elif isinstance(value, dict):
            normalized[str(key)] = json.dumps(value, indent=2)
        elif isinstance(value, list):
            normalized[str(key)] = json.dumps(value, indent=2)
        else:
            normalized[str(key)] = str(value) if value is not None else ""
    return normalized


def generate_skill_card_with_raven(
    state: dict,
    markdown_corpus: str = "",
) -> dict:
    """Orchestrator-compatible wrapper: takes agent state, returns skill card.

    Args:
        state: The codegen agent state dict with target_url, task_prompt, etc.
        markdown_corpus: Pre-scraped markdown documentation.

    Returns:
        dict with skill_content (JSON string) and folder_name.
    """
    target_url = state.get("target_url", "")
    task_prompt = state.get("task_prompt", "Generate a comprehensive domain expert EVE skill bundle.")
    include_mcp = state.get("include_mcp", False)
    folder_name = (target_url.split("/")[-1] or "custom-skill").replace(".", "-").lower()

    if not is_raven_available():
        print("[raven_bridge] Raven unavailable — falling through to Gemini codegen path")
        return {
            "skill_content": "",
            "folder_name": folder_name,
            "_raven_unavailable": True,
        }

    result = generate_skill_with_raven(
        markdown_corpus=markdown_corpus,
        target_url=target_url,
        task_prompt=task_prompt,
        include_mcp=include_mcp,
    )

    if result["success"]:
        print(f"[raven_bridge] Raven generated EVE bundle in {result['attempt_count']} attempt(s)")
        return {
            "skill_content": result["skill_content"],
            "folder_name": folder_name,
        }

    print(f"[raven_bridge] Raven generation failed after {result['attempt_count']} attempts: {result.get('error', 'unknown')}")
    return {
        "skill_content": "",
        "folder_name": folder_name,
        "_raven_unavailable": True,
    }


__all__ = [
    "is_raven_available",
    "generate_skill_with_raven",
    "generate_skill_card_with_raven",
    "verify_skill_bundle",
]
