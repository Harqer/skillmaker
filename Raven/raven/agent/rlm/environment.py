"""RLM environment: corpus, REPL, and batch layer wired together.

The environment owns the corpus, the ``LLMProvider`` used for sub-LLM calls,
the depth counter, and per-run statistics. ``execute`` evaluates one REPL
expression and turns a resulting ``BatchCommand`` into a real parallel batch,
serializing every outcome to a compact string for the agent loop.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from raven.agent.rlm.batch import RLMBatchResult, run_llm_batch
from raven.agent.rlm.corpus import RLMCorpus
from raven.agent.rlm.limits import RLMBatchLimits
from raven.agent.rlm.repl import BatchCommand, RLMRepl, RLMReplError

if TYPE_CHECKING:
    from raven.providers.base import LLMProvider


@dataclass
class RLMStats:
    """Cumulative counters for an RLM session (for observability/logging)."""

    tool_calls: int = 0
    sub_llm_calls: int = 0
    sub_llm_tokens: int = 0
    budget_spent: int = 0
    timeouts: int = 0
    depth_refusals: int = 0


class RLMEnvironment:
    """Sandboxed corpus REPL with bounded sub-LLM delegation."""

    def __init__(
        self,
        provider: "LLMProvider",
        corpus: str = "",
        pages: dict[str, str] | None = None,
        model: str | None = None,
        limits: RLMBatchLimits | None = None,
        depth: int = 0,
    ) -> None:
        self.provider = provider
        self.model = model
        self.limits = limits or RLMBatchLimits()
        self.depth = depth
        self.stats = RLMStats()
        self.corpus = RLMCorpus(
            corpus,
            pages,
            max_matches=self.limits.max_matches,
            max_chunks=self.limits.max_chunks,
        )

    def describe(self) -> str:
        """One-line description of the corpus and limits, for tool/CLI text."""
        return (
            f"RLM corpus P: {self.corpus.length:,} chars across {self.corpus.page_count} pages. "
            f"Limits: max_depth={self.limits.max_depth}, "
            f"parallel_limit={self.limits.parallel_limit}, "
            f"token_budget={self.limits.token_budget}, "
            f"timeout={self.limits.timeout:.0f}s"
        )

    async def execute(self, code: str) -> str:
        """Evaluate one REPL expression and serialize the result."""
        self.stats.tool_calls += 1
        repl = RLMRepl(self.corpus, llm_batch=BatchCommand)
        try:
            value = repl.evaluate(code)
        except RLMReplError as exc:
            return _serialize(
                {"error": str(exc), "hint": "use P slices, P.search(), P.sections(), llm_batch([...])"},
                self.limits.max_output_chars,
            )
        except Exception as exc:  # noqa: BLE001 - the sandbox must never crash the loop
            return _serialize(
                {"error": f"evaluation error: {exc.__class__.__name__}: {exc}"},
                self.limits.max_output_chars,
            )
        if isinstance(value, BatchCommand):
            return await self._run_batch(value.prompts)
        return _serialize(value, self.limits.max_output_chars)

    async def _run_batch(self, prompts: list[str]) -> str:
        result = await run_llm_batch(
            self.provider,
            prompts,
            self.model,
            self.limits,
            depth=self.depth,
        )
        self.stats.sub_llm_calls += len(result.items)
        self.stats.sub_llm_tokens += sum(item.tokens for item in result.items)
        self.stats.budget_spent += result.spent_tokens
        if result.status == "timed_out":
            self.stats.timeouts += 1
        if result.status == "depth_exceeded":
            self.stats.depth_refusals += 1
        return _serialize_batch_result(result, self.limits.max_output_chars)


def _serialize(value: Any, max_chars: int) -> str:
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False)
        except TypeError:
            text = repr(value)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[output truncated: slice P smaller, or use P.search()/P.chunk()]"


def _serialize_batch_result(result: RLMBatchResult, max_chars: int) -> str:
    payload = {
        "status": result.status,
        "depth": result.depth,
        "notes": result.notes,
        "items": [
            {
                "index": item.index,
                "status": item.status,
                "response": item.response[:2000],
                "tokens": item.tokens,
                "error": item.error,
            }
            for item in result.items
        ],
    }
    return _serialize(payload, max_chars)
