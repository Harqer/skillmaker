"""
rlm_routing.py — single source of truth for RLM routing thresholds.

Contract 1 (routing-threshold reconciliation): every layer that decides "does
this job route through the RLM/REPL path" consults this module instead of
hardcoding its own character/page cutoffs. The policy is one line: a job
routes through RLM when the input is a long document OR a large number of
URLs. Short single-input jobs keep the direct path.

Consumers:
    - raven_bridge.generate_skill_with_raven   (RLM dispatch gate)
    - raven_bridge._build_research_brief        (RLM synthesis on the fallback path)
    - orchestrator.scraper_analyze_node         (RLM REPL for pruned context)
    - rlm_bridge                                (corpus-size guard)

Usage:
    from rlm_routing import should_route_through_rlm
    if should_route_through_rlm(pages, len(markdown_corpus)):
        ...
"""

from __future__ import annotations

# ── Routing thresholds ───────────────────────────────────────────────────────

#: A single corpus document at or above this many characters is "long".
RLM_ROUTE_MIN_CHARS = 25_000

#: A corpus with at least this many distinct pages/URLs is "a large number".
RLM_ROUTE_MIN_PAGES = 2

# ── Corpus/brief budgets ─────────────────────────────────────────────────────

#: Hard guard against unbounded corpus files on the RLM/REPL path.
RLM_MAX_CORPUS_CHARS = 4_000_000

#: Legacy brief truncation when no RLM synthesis was produced.
BRIEF_TRUNCATION_CHARS = 40_000

#: Excerpt kept alongside an RLM synthesis (the corpus is read programmatically).
RLM_SYNTHESIS_EXCERPT_CHARS = 5_000

#: Direct-path pruned-context budget when RLM/cache retrieval is unavailable.
PRUNED_CONTEXT_FALLBACK_CHARS = 12_000


def should_route_through_rlm(
    pages: dict[str, str] | None = None,
    corpus_chars: int = 0,
) -> bool:
    """Return True when the input must route through the RLM/REPL path.

    The routing policy (Contract 1): a long document (``corpus_chars`` at or
    above ``RLM_ROUTE_MIN_CHARS``) OR a large number of URLs (``pages`` with
    at least ``RLM_ROUTE_MIN_PAGES`` entries) routes through RLM. Everything
    else is a short single-input job and keeps the direct path.
    """
    if corpus_chars >= RLM_ROUTE_MIN_CHARS:
        return True
    return bool(pages) and len(pages) >= RLM_ROUTE_MIN_PAGES


__all__ = [
    "BRIEF_TRUNCATION_CHARS",
    "PRUNED_CONTEXT_FALLBACK_CHARS",
    "RLM_MAX_CORPUS_CHARS",
    "RLM_ROUTE_MIN_CHARS",
    "RLM_ROUTE_MIN_PAGES",
    "RLM_SYNTHESIS_EXCERPT_CHARS",
    "should_route_through_rlm",
]
