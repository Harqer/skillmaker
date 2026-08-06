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
from raven.agent.rlm.graph import RLMGraph, RLMGraphLimits, rlm_graph_limits_from_env
from raven.agent.rlm.limits import RLMBatchLimits
from raven.agent.rlm.repl import (
    Answer,
    BatchCommand,
    RecurseCommand,
    RLMRepl,
    RLMReplError,
)

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
    final_answers: int = 0


class RLMEnvironment:
    """Sandboxed corpus/graph REPL with bounded sub-LLM delegation."""

    def __init__(
        self,
        provider: "LLMProvider",
        corpus: str = "",
        pages: dict[str, str] | None = None,
        model: str | None = None,
        limits: RLMBatchLimits | None = None,
        graph_limits: RLMGraphLimits | None = None,
        depth: int = 0,
    ) -> None:
        self.provider = provider
        self.model = model
        self.limits = limits or RLMBatchLimits()
        self.graph_limits = graph_limits or rlm_graph_limits_from_env()
        self.depth = depth
        self.stats = RLMStats()
        self.corpus = RLMCorpus(
            corpus,
            pages,
            max_matches=self.limits.max_matches,
            max_chunks=self.limits.max_chunks,
        )
        self.graph = RLMGraph(
            pages,
            corpus,
            limits=self.graph_limits,
        )

    def describe(self) -> str:
        """One-line description of the corpus, graph, and limits, for tool/CLI text."""
        return (
            f"RLM corpus P: {self.corpus.length:,} chars across {self.corpus.page_count} pages. "
            f"{self.graph.describe()}. "
            f"Limits: max_depth={self.limits.max_depth}, "
            f"parallel_limit={self.limits.parallel_limit}, "
            f"token_budget={self.limits.token_budget}, "
            f"timeout={self.limits.timeout:.0f}s"
        )

    async def execute(self, code: str) -> str:
        """Evaluate one REPL expression and serialize the result."""
        self.stats.tool_calls += 1
        repl = RLMRepl(self.corpus, llm_batch=BatchCommand, graph=self.graph, recurse=RecurseCommand)
        try:
            value = repl.evaluate(code)
        except RLMReplError as exc:
            return _serialize(
                {
                    "error": str(exc),
                    "hint": "use P slices, P.search(), G.search(), G.find(), G.neighbors(), "
                    "G.subgraph(), llm_batch([...]), recurse(query, node_ids), answer(text, evidence)",
                },
                self.limits.max_output_chars,
            )
        except Exception as exc:  # noqa: BLE001 - the sandbox must never crash the loop
            return _serialize(
                {"error": f"evaluation error: {exc.__class__.__name__}: {exc}"},
                self.limits.max_output_chars,
            )
        if isinstance(value, BatchCommand):
            return await self._run_batch(value.prompts)
        if isinstance(value, RecurseCommand):
            return await self._run_recurse(value)
        if isinstance(value, Answer):
            self.stats.tool_calls -= 1  # final answer is not a graph/LLM call
            self.stats.final_answers += 1
            return _serialize({"answer": value.text, "evidence": value.evidence}, self.limits.max_output_chars)
        return _serialize(value, self.limits.max_output_chars)

    async def _run_recurse(self, command: RecurseCommand) -> str:
        """Resolve one ``recurse(query, node_ids)`` into a scoped sub-LLM call.

        The scoped context is built from the referenced graph nodes and the
        sub-query is dispatched through the same ``LLMProvider`` the loop uses
        (never a direct backend call), depth-capped by ``max_depth``.
        """
        context = self.graph.scope_text(command.node_ids, max_chars=self.graph_limits.max_scope_chars)
        prompt = (
            f"Scoped documentation context:\n\n{context}\n\n"
            f"Question: {command.query}\n\n"
            "Answer concisely and factually based only on the context above; "
            "cite the [node-id label] tags you relied on. Never invent APIs."
        )
        result = await run_llm_batch(
            self.provider,
            [prompt],
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
        return _serialize_recurse_result(result, self.limits.max_output_chars)

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


def _serialize_recurse_result(result: RLMBatchResult, max_chars: int) -> str:
    payload = {
        "status": result.status,
        "depth": result.depth,
        "notes": result.notes,
        "items": [
            {
                "index": item.index,
                "status": item.status,
                "response": item.response[:4000],
                "tokens": item.tokens,
                "error": item.error,
            }
            for item in result.items
        ],
    }
    return _serialize(payload, max_chars)
