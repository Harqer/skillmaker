"""RLM environment + ``rlm`` tool: REPL execution, serialization, depth guard."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from raven.agent.loop import AgentLoop
from raven.agent.rlm.environment import RLMEnvironment
from raven.agent.rlm.limits import RLMBatchLimits
from raven.agent.tools.rlm import RLMReplTool
from raven.providers.base import LLMProvider, LLMResponse

PAGES = {
    "https://docs.example.com/api": "# API Reference\n\n- GET /v1/users\n",
    "https://docs.example.com/guide": "# Getting Started\n\nInstall via pip.\n",
}


class _MockProvider(LLMProvider):
    def __init__(self, responses=None):
        super().__init__(api_key="test")
        self.responses = list(responses or ["mock answer"])

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
        content = self.responses[0] if len(self.responses) == 1 else self.responses.pop(0)
        return LLMResponse(content=content, finish_reason="stop", usage={"completion_tokens": 10})

    async def chat_with_retry(self, **kwargs):
        return await self.chat(**kwargs)

    def get_default_model(self) -> str:
        return "stub"


def _make_env(responses=None, limits=None) -> RLMEnvironment:
    provider = _MockProvider(responses)
    return RLMEnvironment(
        provider=provider,
        corpus="\n\n".join(PAGES.values()),
        pages=PAGES,
        model="stub",
        limits=limits,
    )


async def test_environment_runs_llm_batch():
    env = _make_env(["answer A", "answer B"])
    out = await env.execute("llm_batch(['q1', 'q2'])")
    data = json.loads(out)
    assert data["status"] == "ok"
    assert [item["response"] for item in data["items"]] == ["answer A", "answer B"]
    assert env.stats.sub_llm_calls == 2
    assert env.stats.sub_llm_tokens == 20


async def test_environment_serializes_corpus_values():
    env = _make_env()
    assert json.loads(await env.execute("P.urls()")) == list(PAGES)
    assert json.loads(await env.execute("len(P)")) >= 1
    assert await env.execute("P[0:5]") == "\n\n".join(PAGES.values())[0:5]


async def test_environment_sandbox_error_is_json():
    env = _make_env()
    out = await env.execute("import os")
    data = json.loads(out)
    assert "error" in data


async def test_environment_depth_refusal():
    env = _make_env(limits=RLMBatchLimits(max_depth=0))
    out = await env.execute("llm_batch(['q1'])")
    data = json.loads(out)
    assert data["status"] == "depth_exceeded"
    assert env.stats.depth_refusals == 1


async def test_environment_truncates_large_outputs():
    env = _make_env(limits=RLMBatchLimits(max_output_chars=20))
    out = await env.execute("P.urls()")
    assert "[output truncated" in out


async def test_rlm_tool_executes_expression():
    env = _make_env()
    tool = RLMReplTool(env)
    out = await tool.execute(code="len(P)")
    assert out.isdigit()


async def test_rlm_tool_registered_when_environment_provided():
    with tempfile.TemporaryDirectory() as td:
        provider = _MockProvider()
        env = RLMEnvironment(
            provider=provider,
            corpus="# API docs",
            pages={"https://x": "# API docs"},
            model="stub",
        )
        agent = AgentLoop(
            provider=provider,
            workspace=Path(td),
            model="stub",
            rlm_environment=env,
        )
        assert agent.tools.has("rlm")
        result = await agent.tools.execute("rlm", {"code": "P.urls()"})
        assert "https://x" in result


async def test_rlm_tool_absent_without_environment():
    with tempfile.TemporaryDirectory() as td:
        provider = _MockProvider()
        agent = AgentLoop(
            provider=provider,
            workspace=Path(td),
            model="stub",
        )
        assert not agent.tools.has("rlm")


async def test_environment_rejects_recursion_from_batch_answers():
    env = _make_env(limits=RLMBatchLimits(max_depth=1))
    out = await env.execute("llm_batch(['q1', 'q2', 'q3'])")
    data = json.loads(out)
    assert data["status"] == "ok"
    assert len(data["items"]) == 3
