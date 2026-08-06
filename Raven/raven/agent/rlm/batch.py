"""Bounded parallel sub-LLM batches (``llm_batch``) for the RLM layer.

Prompts are dispatched through the same ``LLMProvider`` the agent loop uses.
Concurrency is capped by ``parallel_limit``; spending is accounted against
``token_budget`` (estimated upfront plus reported completion tokens); the whole
batch aborts at ``timeout`` seconds with partial results; and recursion is
refused once ``depth >= max_depth``.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from raven.agent.rlm.limits import RLMBatchLimits

if TYPE_CHECKING:
    from raven.providers.base import LLMProvider

_SUB_SYSTEM_PROMPT = (
    "You are a focused sub-LLM in a recursive language model (RLM) pipeline. "
    "You receive one focused slice of a documentation corpus plus a specific "
    "question. Answer concisely and factually based only on the slice you were "
    "given; never invent APIs. Keep the answer under ~200 words unless the "
    "question explicitly asks for more."
)


@dataclass
class RLMBatchItem:
    """Outcome of a single ``llm_batch`` prompt."""

    index: int
    prompt: str
    response: str = ""
    tokens: int = 0
    error: str = ""
    status: str = "ok"
    depth: int = 0


@dataclass
class RLMBatchResult:
    """Aggregate outcome of an ``llm_batch`` run."""

    status: str = "ok"
    depth: int = 0
    items: list[RLMBatchItem] = field(default_factory=list)
    spent_tokens: int = 0
    notes: list[str] = field(default_factory=list)


def estimate_tokens(text: str) -> int:
    """Rough heuristic for budgeting: ~4 chars per token (English)."""
    return max(1, len(text) // 4)


async def run_llm_batch(
    provider: "LLMProvider",
    prompts: list[str],
    model: str | None,
    limits: RLMBatchLimits,
    depth: int = 0,
) -> RLMBatchResult:
    """Run ``prompts`` as a bounded parallel batch of sub-LLM calls.

    Recursion guard first: a call arriving at ``depth >= max_depth`` is refused
    up front so a rogue root model cannot stack unbounded model calls. The
    batch never exceeds ``limits.timeout``; anything not finished when the
    timeout fires is cancelled and reported as ``timed_out``.
    """
    result = RLMBatchResult(depth=depth)
    if depth >= limits.max_depth:
        result.status = "depth_exceeded"
        result.notes.append(f"max_depth={limits.max_depth} reached; refusing to recurse into sub-LLM calls")
        return result

    tasks: set[asyncio.Task] = set()
    timed_out = False

    async def scheduler() -> None:
        spent = 0
        completion_tokens = 0
        index = 0
        while index < len(prompts):
            if limits.early_stopping > 0 and completion_tokens >= limits.early_stopping:
                for _ in range(index, len(prompts)):
                    result.items.append(RLMBatchItem(index=index, prompt=prompts[index], status="skipped_early"))
                    index += 1
                result.notes.append(f"early_stopping: halted after {completion_tokens} completion tokens")
                break
            wave: list[asyncio.Task] = []
            while index < len(prompts) and len(wave) < limits.parallel_limit:
                prompt = prompts[index]
                cost = estimate_tokens(prompt) + limits.max_tokens_per_call
                if spent + cost > limits.token_budget:
                    result.items.append(RLMBatchItem(index=index, prompt=prompt, status="skipped_budget"))
                    index += 1
                    continue
                spent += cost
                task = asyncio.create_task(_call_one(provider, model, prompt, index, limits, depth))
                tasks.add(task)
                wave.append(task)
                index += 1
            if not wave:
                result.status = "budget"
                result.notes.append("token_budget exhausted before all prompts were launched")
                break
            pending: set[asyncio.Task] = set(wave)
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    item = task.result()
                    result.items.append(item)
                    if item.status == "ok":
                        completion_tokens += item.tokens
        result.spent_tokens = spent

    try:
        await asyncio.wait_for(scheduler(), timeout=limits.timeout)
    except asyncio.TimeoutError:
        timed_out = True
    finally:
        for task in list(tasks):
            if not task.done():
                task.cancel()

    if timed_out:
        result.status = "timed_out"
        result.notes.append(f"batch exceeded {limits.timeout:.0f}s; returning partial results")
    elif result.status == "ok" and any(item.status == "skipped_budget" for item in result.items):
        result.status = "budget"
    seen = {item.index for item in result.items}
    for index in range(len(prompts)):
        if index not in seen:
            result.items.append(RLMBatchItem(index=index, prompt=prompts[index], status="timed_out"))
    result.items.sort(key=lambda item: item.index)
    return result


async def _call_one(
    provider: "LLMProvider",
    model: str | None,
    prompt: str,
    index: int,
    limits: RLMBatchLimits,
    depth: int,
) -> RLMBatchItem:
    try:
        response = await provider.chat_with_retry(
            messages=[
                {"role": "system", "content": _SUB_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            model=model,
            max_tokens=limits.max_tokens_per_call,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any provider failure as an item error
        return RLMBatchItem(index=index, prompt=prompt, error=str(exc), status="error", depth=depth + 1)
    if response.finish_reason == "error":
        return RLMBatchItem(
            index=index,
            prompt=prompt,
            error=response.content or "provider error",
            status="error",
            depth=depth + 1,
        )
    usage = response.usage or {}
    tokens = int(usage.get("completion_tokens") or usage.get("total_tokens") or 0)
    return RLMBatchItem(
        index=index,
        prompt=prompt,
        response=response.content or "",
        tokens=tokens,
        status="ok",
        depth=depth + 1,
    )
