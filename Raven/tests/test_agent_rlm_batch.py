"""RLM ``llm_batch``: parallel limit, budget, timeout, early stop, depth guard."""

from __future__ import annotations

import asyncio

from raven.agent.rlm.batch import run_llm_batch
from raven.agent.rlm.limits import RLMBatchLimits
from raven.providers.base import LLMProvider, LLMResponse


class _RecordingProvider(LLMProvider):
    def __init__(self, responses=None, delay=0.0, error=None):
        super().__init__(api_key="test")
        self.responses = list(responses or ["mock answer"])
        self.delay = delay
        self.error = error
        self.calls: list[list[dict]] = []

    async def chat(
        self,
        messages,
        tools=None,
        model=None,
        max_tokens=4096,
        temperature=0.7,
        reasoning_effort=None,
        tool_choice=None,
    ):
        self.calls.append(messages)
        if self.error is not None:
            raise self.error
        if self.delay:
            await asyncio.sleep(self.delay)
        content = self.responses[0] if len(self.responses) == 1 else self.responses.pop(0)
        return LLMResponse(content=content, finish_reason="stop", usage={"completion_tokens": 10})

    async def chat_with_retry(self, **kwargs):
        return await self.chat(**kwargs)

    def get_default_model(self) -> str:
        return "stub"


class _ConcurrencyProbe(LLMProvider):
    def __init__(self):
        super().__init__(api_key="test")
        self.active = 0
        self.max_active = 0
        self.calls = 0

    async def chat(
        self,
        messages,
        tools=None,
        model=None,
        max_tokens=4096,
        temperature=0.7,
        reasoning_effort=None,
        tool_choice=None,
    ):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.calls += 1
        await asyncio.sleep(0.02)
        self.active -= 1
        return LLMResponse(content="ok", finish_reason="stop", usage={"completion_tokens": 1})

    async def chat_with_retry(self, **kwargs):
        return await self.chat(**kwargs)

    def get_default_model(self) -> str:
        return "stub"


async def test_batch_happy_path():
    provider = _RecordingProvider(["A", "B", "C"])
    limits = RLMBatchLimits(parallel_limit=2, timeout=10, max_tokens_per_call=10)
    result = await run_llm_batch(provider, ["q1", "q2", "q3"], "stub", limits, depth=0)
    assert result.status == "ok"
    assert [item.response for item in result.items] == ["A", "B", "C"]
    assert all(item.status == "ok" for item in result.items)
    assert len(provider.calls) == 3


async def test_batch_respects_parallel_limit():
    provider = _ConcurrencyProbe()
    limits = RLMBatchLimits(parallel_limit=2, timeout=10, max_tokens_per_call=10)
    result = await run_llm_batch(provider, [f"q{i}" for i in range(6)], "stub", limits, depth=0)
    assert result.status == "ok"
    assert provider.max_active == 2


async def test_batch_skips_overflow_beyond_token_budget():
    provider = _RecordingProvider(["A", "B"])
    limits = RLMBatchLimits(parallel_limit=8, max_tokens_per_call=10, token_budget=25, timeout=10)
    result = await run_llm_batch(provider, ["q1", "q2", "q3", "q4"], "stub", limits, depth=0)
    assert result.status == "budget"
    assert [item.status for item in result.items] == ["ok", "ok", "skipped_budget", "skipped_budget"]


async def test_batch_early_stopping_on_completion_tokens():
    provider = _RecordingProvider(["A", "B"])
    limits = RLMBatchLimits(parallel_limit=2, early_stopping=15, max_tokens_per_call=10, timeout=10)
    result = await run_llm_batch(provider, ["q1", "q2", "q3", "q4"], "stub", limits, depth=0)
    assert [item.status for item in result.items] == ["ok", "ok", "skipped_early", "skipped_early"]
    assert any("early_stopping" in note for note in result.notes)


async def test_batch_times_out_with_partial_results():
    provider = _RecordingProvider(delay=0.3)
    limits = RLMBatchLimits(parallel_limit=1, max_tokens_per_call=10, timeout=0.05, token_budget=1000)
    result = await run_llm_batch(provider, ["q1", "q2"], "stub", limits, depth=0)
    assert result.status == "timed_out"
    assert len(result.items) == 2
    assert all(item.status == "timed_out" for item in result.items)


async def test_batch_refuses_recursion_past_max_depth():
    provider = _RecordingProvider()
    limits = RLMBatchLimits(max_depth=1, max_tokens_per_call=10)
    result = await run_llm_batch(provider, ["q1"], "stub", limits, depth=1)
    assert result.status == "depth_exceeded"
    assert result.items == []
    assert provider.calls == []


async def test_batch_surfaces_provider_error_as_item_error():
    provider = _RecordingProvider(error=RuntimeError("boom"))
    limits = RLMBatchLimits(parallel_limit=2, max_tokens_per_call=10, timeout=10)
    result = await run_llm_batch(provider, ["q1"], "stub", limits, depth=0)
    assert result.items[0].status == "error"
    assert "boom" in result.items[0].error
