"""In-memory RLM knowledge graph: graphify, traversal tools, lexical search."""

from __future__ import annotations

import json

from raven.agent.rlm.environment import RLMEnvironment
from raven.agent.rlm.graph import RLMGraph, RLMGraphLimits, rlm_graph_limits_from_env
from raven.agent.rlm.limits import RLMBatchLimits
from raven.providers.base import LLMProvider, LLMResponse

PAGES = {
    "https://docs.example.com/api": "# API Reference\n\n## Endpoints\n\n- `GET /v1/users` lists users\n- `POST /v1/users` creates one\n",
    "https://docs.example.com/guide": "# Getting Started\n\nInstall via pip.\n\n## Auth\n\nUse an [API key](https://docs.example.com/keys).\n",
}


def _graph() -> RLMGraph:
    return RLMGraph(pages=PAGES)


async def test_graphify_produces_doc_section_chunk_entities():
    graph = _graph()
    summary = graph.summary()
    assert summary["labels"]["Doc"] == 2
    assert summary["labels"]["Section"] >= 3
    assert summary["labels"]["Chunk"] >= 3
    assert summary["labels"]["Entity"] >= 2


async def test_graph_find_by_label_and_properties():
    graph = _graph()
    docs = graph.find("Doc")
    assert len(docs) == 2
    assert all(doc["_label"] == "Doc" for doc in docs)
    endpoints = graph.find("Section", {"heading": "Endpoints"})
    assert len(endpoints) == 1
    assert endpoints[0]["heading"] == "Endpoints"


async def test_graph_get_returns_node_with_edges():
    graph = _graph()
    doc = graph.find("Doc")[0]
    node = graph.get(doc["id"])
    assert node is not None
    assert any(edge["rel"] == "HAS_SECTION" for edge in node["_edges"])


async def test_graph_neighbors_walks_edges():
    graph = _graph()
    doc = graph.find("Doc")[0]
    sections = graph.neighbors(doc["id"], "HAS_SECTION", direction="OUT")
    assert sections
    assert all(section["_label"] == "Section" for section in sections)
    section = sections[0]
    chunks = graph.neighbors(section["id"], "HAS_CHUNK", direction="OUT")
    assert chunks
    assert all(chunk["_label"] == "Chunk" for chunk in chunks)


async def test_graph_subgraph_bfs_expansion():
    graph = _graph()
    doc = graph.find("Doc")[0]
    sub = graph.subgraph([doc["id"]], k_hops=1)
    assert sub["nodes"]
    assert sub["edges"]
    assert any(edge["rel"] == "HAS_SECTION" for edge in sub["edges"])


async def test_graph_search_ranks_chunks_by_relevance():
    graph = _graph()
    hits = graph.search("list users endpoint", top_k=3)
    assert hits
    assert all("similarity_score" in hit for hit in hits)
    assert hits[0]["similarity_score"] >= hits[-1]["similarity_score"]
    texts = " ".join(hit["text"] for hit in hits)
    assert "users" in texts


async def test_graph_search_empty_corpus():
    empty = RLMGraph(pages={})
    assert empty.search("anything") == []


async def test_graph_limits_bind_chunking():
    graph = RLMGraph(pages=PAGES, limits=RLMGraphLimits(max_chunks_total=2))
    assert graph.chunk_count <= 2


async def test_graph_limits_from_env():
    limits = rlm_graph_limits_from_env(
        {"RAVEN_RLM_GRAPH_MAX_CHUNKS_TOTAL": "3", "RAVEN_RLM_GRAPH_MAX_ENTITIES_PER_CHUNK": "99"}
    )
    assert limits.max_chunks_total == 3
    assert limits.max_entities_per_chunk == 99
    assert limits.chunk_size == RLMGraphLimits().chunk_size

    bogus = rlm_graph_limits_from_env(
        {"RAVEN_RLM_GRAPH_MAX_CHUNKS_TOTAL": "nope", "RAVEN_RLM_GRAPH_CHUNK_SIZE": "-5"}
    )
    assert bogus == RLMGraphLimits()


async def test_environment_graph_limits_tunable():
    provider = _MockProvider()
    env = RLMEnvironment(
        provider=provider,
        corpus="",
        pages=PAGES,
        model="stub",
        graph_limits=RLMGraphLimits(max_chunks_total=2),
    )
    assert env.graph.chunk_count <= 2


async def test_graph_scope_text_contains_only_referenced_nodes():
    graph = _graph()
    chunk = graph.search("install pip")[0]
    text = graph.scope_text([chunk["id"]], max_chars=500)
    assert "Install" in text or "install" in text


async def test_graph_has_node_ids():
    graph = _graph()
    doc = graph.find("Doc")[0]
    assert graph.has(doc["id"])
    assert not graph.has("does-not-exist")


class _MockProvider(LLMProvider):
    def __init__(self, responses=None):
        super().__init__(api_key="test")
        self.responses = list(responses or ["scoped answer"])

    async def chat(self, messages, tools=None, model=None, max_tokens=4096, temperature=0.7, reasoning_effort=None, tool_choice=None):
        content = self.responses[0] if len(self.responses) == 1 else self.responses.pop(0)
        return LLMResponse(content=content, finish_reason="stop", usage={"completion_tokens": 10})

    async def chat_with_retry(self, **kwargs):
        return await self.chat(**kwargs)

    def get_default_model(self) -> str:
        return "stub"


async def test_environment_exposes_graph():
    provider = _MockProvider()
    env = RLMEnvironment(provider=provider, corpus="", pages=PAGES, model="stub")
    out = await env.execute("G.summary()")
    data = json.loads(out)
    assert data["labels"]["Doc"] == 2


async def test_environment_recurse_runs_scoped_sub_llm():
    provider = _MockProvider(["scoped synthesis"])
    env = RLMEnvironment(provider=provider, corpus="", pages=PAGES, model="stub")
    chunk = env.graph.search("install pip")[0]
    out = await env.execute(f"recurse('install steps', ['{chunk['id']}'])")
    data = json.loads(out)
    assert data["status"] == "ok"
    assert data["items"][0]["response"] == "scoped synthesis"
    assert env.stats.sub_llm_calls == 1


async def test_environment_answer_records_final():
    provider = _MockProvider()
    env = RLMEnvironment(provider=provider, corpus="", pages=PAGES, model="stub")
    out = await env.execute("answer('installed via pip', ['chunk_a'])")
    data = json.loads(out)
    assert data["answer"] == "installed via pip"
    assert env.stats.final_answers == 1


async def test_environment_recurse_respects_depth():
    provider = _MockProvider()
    env = RLMEnvironment(
        provider=provider,
        corpus="",
        pages=PAGES,
        model="stub",
        limits=RLMBatchLimits(max_depth=0),
    )
    chunk = env.graph.search("install pip")[0]
    out = await env.execute(f"recurse('install steps', ['{chunk['id']}'])")
    data = json.loads(out)
    assert data["status"] == "depth_exceeded"
    assert env.stats.depth_refusals == 1
