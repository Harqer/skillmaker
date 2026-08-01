"""Recursive Language Model (RLM) middle layer for the Raven agent loop.

Exposes a bulk-scraped documentation corpus as external variable ``P`` inside a
sandboxed Python REPL. The root model can slice/search/chunk ``P``
programmatically and delegate focused sub-queries to parallel ``llm_batch``
sub-LLM calls executed through the same ``LLMProvider`` the loop already uses.
Recursion is capped at depth 1 and every batch enforces hard limits on
parallelism, token budget, timeout, and early stopping; on violation the caller
falls back to the legacy truncated single-call path.
"""

from __future__ import annotations

from raven.agent.rlm.batch import RLMBatchItem, RLMBatchResult, run_llm_batch
from raven.agent.rlm.corpus import RLMCorpus, load_corpus_file, merge_pages
from raven.agent.rlm.environment import RLMEnvironment, RLMStats
from raven.agent.rlm.limits import RLMBatchLimits, rlm_limits_from_env
from raven.agent.rlm.repl import RLMRepl, RLMReplError

__all__ = [
    "RLMBatchItem",
    "RLMBatchLimits",
    "RLMBatchResult",
    "RLMCorpus",
    "RLMEnvironment",
    "RLMRepl",
    "RLMReplError",
    "RLMStats",
    "load_corpus_file",
    "merge_pages",
    "rlm_limits_from_env",
    "run_llm_batch",
]
