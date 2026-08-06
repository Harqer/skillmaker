"""
rlm_bridge.py — RLM/REPL (Recursive Language Model) integration for EVE skills.

The full bulk-scraped documentation corpus (``{url: markdown}``) is written to
a temp file and passed to ``raven agent --corpus``, where it is loaded as
external variable ``P`` inside Raven's sandboxed Python REPL. The root model
slices/searchs/chunks ``P`` programmatically and delegates focused sub-queries
to parallel ``llm_batch`` sub-LLM calls (depth 1, hard budget/timeout/parallel
limits). On any failure the caller degrades to the legacy truncated
single-call path in ``raven_bridge.generate_skill_with_raven``.

Usage:
    from rlm_bridge import generate_skill_with_rlm
    result = generate_skill_with_rlm(pages, target_url, task_prompt)
"""

import json
import os
import subprocess
import sys
import tempfile
import textwrap
from typing import Any

from raven_bridge import (
    _extract_eve_from_raven_output,
    is_raven_available,
    verify_skill_bundle,
)

# ── RLM constants ──────────────────────────────────────────────────────────

RLM_TIMEOUT_SECONDS = 240  # generous: root model + llm_batch + synthesis
RLM_MAX_CORPUS_CHARS = 4_000_000  # guard against unbounded corpus files


def _cap_pages(pages: dict[str, str], max_chars: int) -> dict[str, str]:
    """Keep pages until the accumulated char budget is exhausted."""
    kept: dict[str, str] = {}
    total = 0
    for url, markdown in pages.items():
        if total + len(markdown) > max_chars:
            break
        kept[url] = markdown
        total += len(markdown)
    return kept


def _write_corpus_file(
    pages: dict[str, str] | None,
    markdown_corpus: str,
) -> str:
    """Persist the corpus to a temp file the ``raven agent --corpus`` loader
    understands: a JSON ``{url: markdown}`` object when pages exist, else a
    plain-text markdown document."""
    if pages:
        payload = json.dumps(_cap_pages(pages, RLM_MAX_CORPUS_CHARS), ensure_ascii=False)
        suffix = ".json"
    else:
        payload = markdown_corpus[:RLM_MAX_CORPUS_CHARS]
        suffix = ".md"
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=suffix, delete=False, encoding="utf-8"
    ) as f:
        f.write(payload)
        return f.name


def _build_rlm_brief(
    target_url: str,
    task_prompt: str,
    include_mcp: bool,
    corpus_chars: int,
    page_count: int,
) -> str:
    """Build the compact task brief for Raven's agent with ``--corpus``.

    The corpus itself is never embedded here — it lives in ``P`` and is read
    programmatically through the ``rlm`` tool, so the prompt window stays
    small no matter how large the corpus is.
    """
    return textwrap.dedent(f"""\
    You are an expert EVE Skill Bundle creator. You have access to a large
    documentation corpus through the ``rlm`` tool, exposed as variable ``P``
    ({page_count} pages, {corpus_chars:,} chars total) and as knowledge graph
    ``G`` built from the same corpus.

    ## Target URL
    {target_url}

    ## Task
    {task_prompt}

    ## Corpus access (use the rlm tool — do NOT dump big slices)
    P is a string-like corpus with page awareness. Useful expressions:
      * len(P), P.urls(), P.read("https://...")
      * P.search("regex") for targeted snippets with offsets
      * P.sections(), P.headings(2), P.chunk(4000) to map structure
      * P.lines(100, 400), P[1000:2000], P.find("needle"), P.count("needle")
    G is the corpus graphified (Doc -> Section -> Chunk nodes, plus
    Chunk -MENTIONS-> Entity). Useful expressions:
      * G.summary(), G.search("query", 5) — ranked entry chunks
      * G.get(node_id), G.neighbors(node_id) — expand around a relevant node
      * G.find(label, {{"key": "value"}}) — exact property lookup
      * G.subgraph(["node_id", ...], 2) — local context around seeds
    Start with G.search() to find entry points, then expand through the graph
    to the parent Section/Doc or related Entities instead of dumping slices.

    For many focused sub-questions, delegate to parallel sub-LLM calls:
      * llm_batch(["question about page A", "question about section B", ...])
    To synthesize a sub-query over a specific set of graph nodes:
      * recurse("question", ["node_id_1", "node_id_2", ...])
    Sub-LLM calls are depth-1 only, run in parallel, and respect a hard token
    budget and timeout. Finish with answer(your_synthesis, evidence=[node_ids]).

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


def generate_skill_with_rlm(
    pages: dict[str, str] | None,
    target_url: str,
    task_prompt: str = "Generate a comprehensive domain expert EVE skill bundle.",
    include_mcp: bool = False,
    markdown_corpus: str = "",
    rlm_timeout: int = RLM_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Generate an EVE skill bundle through Raven's RLM/REPL middle layer.

    Args:
        pages: Full ``{url: markdown}`` corpus from ``bulk_scrape_docs``.
        target_url: The primary documentation URL.
        task_prompt: The skill-generation task description.
        include_mcp: Whether the bundle must include an MCP server.
        markdown_corpus: Fallback plain-text corpus when ``pages`` is empty.
        rlm_timeout: Hard wall-clock cap for the subprocess.

    Returns:
        dict with keys: success, eve_files, skill_content, error (on failure).
    """
    if not is_raven_available():
        return {"success": False, "eve_files": {}, "skill_content": "", "error": "raven unavailable"}

    if pages:
        pages = {
            url: markdown
            for url, markdown in pages.items()
            if not markdown.startswith("[scraper] bulk scrape failed")
        }

    corpus_path = _write_corpus_file(pages, markdown_corpus)
    try:
        brief = _build_rlm_brief(
            target_url,
            task_prompt,
            include_mcp,
            corpus_chars=len(markdown_corpus) if not pages else _corpus_chars(pages),
            page_count=len(pages) if pages else (1 if markdown_corpus else 0),
        )
        raven_env = {
            **os.environ,
            "PYTHONUNBUFFERED": "1",
            "TERM": "xterm-256color",
            "RAVEN_SKILL_MODE": "1",
        }
        print("[rlm_bridge] Dispatching raven agent with --corpus (RLM/REPL path)")
        result = subprocess.run(
            [sys.executable, "-m", "raven", "agent", "-m", brief, "--corpus", corpus_path],
            capture_output=True,
            text=True,
            timeout=rlm_timeout,
            env=raven_env,
        )

        raven_output = result.stdout or ""
        raven_error = result.stderr or ""

        if result.returncode != 0:
            return {
                "success": False,
                "eve_files": {},
                "skill_content": "",
                "error": f"raven exited with code {result.returncode}: {raven_error[:500]}",
            }

        eve_files = _extract_eve_from_raven_output(raven_output)
        if not eve_files:
            return {
                "success": False,
                "eve_files": {},
                "skill_content": "",
                "error": "could not extract EVE bundle from raven output",
            }

        passes, issues = verify_skill_bundle(eve_files)
        if not passes:
            return {
                "success": False,
                "eve_files": {},
                "skill_content": "",
                "error": f"verifier rejected bundle: {issues}",
            }

        print("[rlm_bridge] Verified EVE bundle generated via RLM/REPL path")
        return {
            "success": True,
            "eve_files": eve_files,
            "skill_content": json.dumps(eve_files, indent=2),
            "attempt_count": 1,
            "issues": [],
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "eve_files": {},
            "skill_content": "",
            "error": f"RLM path timed out after {rlm_timeout}s",
        }
    except Exception as e:
        return {
            "success": False,
            "eve_files": {},
            "skill_content": "",
            "error": f"RLM bridge error: {e}",
        }
    finally:
        try:
            os.unlink(corpus_path)
        except OSError:
            pass


def _corpus_chars(pages: dict[str, str]) -> int:
    return sum(len(markdown) for markdown in pages.values())


__all__ = [
    "RLM_MAX_CORPUS_CHARS",
    "RLM_TIMEOUT_SECONDS",
    "generate_skill_with_rlm",
]
