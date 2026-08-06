"""
context_surfaces.py — Production Redis vector store client for skill context retrieval.

Replaces the previous stub implementation.  Uses RedisVL (redisvl) to:
  1. Create/manage a SearchIndex backed by the live Redis instance.
  2. Store skill chunks as vector embeddings (768-dim, Gemini text-embedding-004).
  3. Perform KNN semantic search at query time.

Index schema is kept simple and flat — one index per deployment, filtering
by skill_id at query time using a tag field.
"""

from __future__ import annotations

import json
import uuid

from config import (  # noqa: F401 — GOOGLE_API_KEY set by config
    GEMINI_API_KEY,
    REDIS_URI,
)
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from redisvl.index import SearchIndex
from redisvl.query import VectorQuery
from redisvl.schema import IndexSchema

# ── Index schema ──────────────────────────────────────────────────────────────

SCHEMA = IndexSchema.from_dict(
    {
        "index": {
            "name": "skill_chunks",
            "prefix": "skill_chunk",
            "storage_type": "json",
        },
        "fields": [
            {"name": "id", "type": "tag"},
            {"name": "skill_id", "type": "tag"},
            {"name": "header", "type": "text"},
            {"name": "content", "type": "text"},
            {
                "name": "embedding",
                "type": "vector",
                "attrs": {
                    "dims": 768,
                    "distance_metric": "cosine",
                    "algorithm": "hnsw",
                    "datatype": "float32",
                },
            },
        ],
    }
)


# ── Embeddings model ──────────────────────────────────────────────────────────


def _get_embeddings() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-2")


# ── Public client ─────────────────────────────────────────────────────────────


class SkillVectorStore:
    """
    Manages ingestion and retrieval of SKILL.md content chunks in Redis.

    Usage:
        store = SkillVectorStore()
        store.ingest(skill_id="42", markdown=skill_md_content)
        chunks = store.search(query="onboarding steps", skill_id="42", k=3)
    """

    def __init__(self):
        self._index: SearchIndex | None = None
        self._embeddings = _get_embeddings()

    def _get_index(self) -> SearchIndex:
        if self._index is None:
            self._index = SearchIndex(schema=SCHEMA, redis_url=REDIS_URI)
            # create_index is idempotent when overwrite=False
            self._index.create(overwrite=False)
        return self._index

    # ── Ingestion ─────────────────────────────────────────────────────────────

    def ingest(self, skill_id: str, markdown: str) -> int:
        """
        Chunks a SKILL.md file by markdown headers (H1, H2, H3) and stores
        each chunk as a vector in Redis.

        Returns the number of chunks stored.
        """
        from langchain_text_splitters import MarkdownHeaderTextSplitter

        splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=[
                ("#", "h1"),
                ("##", "h2"),
                ("###", "h3"),
            ],
            strip_headers=False,
        )
        docs = splitter.split_text(markdown)
        if not docs:
            return 0

        texts = [d.page_content for d in docs]
        headers = [
            d.metadata.get("h3") or d.metadata.get("h2") or d.metadata.get("h1") or ""
            for d in docs
        ]

        embeddings = self._embeddings.embed_documents(texts)

        index = self._get_index()
        records = [
            {
                "id": str(uuid.uuid4()),
                "skill_id": skill_id,
                "header": headers[i],
                "content": texts[i],
                "embedding": embeddings[i],
            }
            for i in range(len(texts))
        ]
        index.load(records, id_field="id")
        return len(records)

    # ── Retrieval ─────────────────────────────────────────────────────────────

    def search_dynamic(
        self,
        query: str,
        skill_id: str | None = None,
        score_threshold: float = 0.5,
        num_results: int = 20,
    ) -> list[dict]:
        """
        Finds semantically relevant chunks dynamically using a similarity threshold (distance).
        No hardcoded limit of results — uses num_results parameter (default 20).
        """
        embedding = self._embeddings.embed_query(query)

        vq = VectorQuery(
            vector=embedding,
            vector_field_name="embedding",
            return_fields=["skill_id", "header", "content"],
            num_results=num_results,
        )

        if skill_id:
            vq.set_filter(f"@skill_id:{{{skill_id}}}")

        index = self._get_index()
        results = index.query(vq)

        filtered = []
        for r in results:
            dist = float(r.get("vector_distance", 1.0))
            # HNSW Cosine distance is [0, 2], lower means more similar
            if dist <= score_threshold:
                filtered.append(
                    {
                        "skill_id": r.get("skill_id"),
                        "header": r.get("header"),
                        "content": r.get("content"),
                        "score": dist,
                    }
                )
        return filtered

    def get_langchain_retriever(
        self, index_name: str = "skill_chunks", score_threshold: float = 0.5
    ):
        """
        Returns a LangChain VectorStoreRetriever with similarity score threshold filtering
        conforming exactly to standard LangChain guidelines.
        """
        from langchain_community.vectorstores import Redis as LangChainRedis

        try:
            # Parallel Redis connection for LangChain retriever compatibility.
            # The existing SearchIndex handles ingestion/query directly;
            # LangChain's Redis wrapper provides a standard LangChain
            # VectorStoreRetriever interface for framework interop.
            vector_store = LangChainRedis.from_existing_index(
                embedding=self._embeddings, index_name=index_name, redis_url=REDIS_URI
            )
            return vector_store.as_retriever(
                search_type="similarity_score_threshold",
                search_kwargs={"score_threshold": score_threshold},
            )
        except Exception as e:
            print(f"[SkillVectorStore] LangChain retriever construction fallback: {e}")
            return None

    def search(self, query: str, skill_id: str | None = None, k: int = 3) -> list[dict]:
        """
        Finds the k most semantically relevant chunks for the given query.
        Optionally filter to a specific skill by skill_id tag.

        Returns a list of dicts: {header, content, score}.
        """
        embedding = self._embeddings.embed_query(query)

        vq = VectorQuery(
            vector=embedding,
            vector_field_name="embedding",
            return_fields=["skill_id", "header", "content"],
            num_results=k,
        )

        if skill_id:
            vq.set_filter(f"@skill_id:{{{skill_id}}}")

        index = self._get_index()
        results = index.query(vq)
        return [
            {
                "skill_id": r.get("skill_id"),
                "header": r.get("header"),
                "content": r.get("content"),
                "score": float(r.get("vector_distance", 1.0)),
            }
            for r in results
        ]


# ── Backwards-compat shim (used by context_retriever.py) ─────────────────────
# context_retriever.py imports UnifiedClient; keep the name but wire it to
# SkillVectorStore so existing callers don't break.


class UnifiedClient:
    """Thin async context-manager wrapper around SkillVectorStore."""

    def __init__(self):
        self._store = SkillVectorStore()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def query_tool(self, agent_key: str, tool_name: str, arguments: dict) -> str:
        """Route legacy tool calls to the vector store."""
        query = arguments.get("query", "")
        skill_id = arguments.get("skill_id")
        k = arguments.get("limit", 5)
        results = self._store.search(query=query, skill_id=skill_id, k=k)
        return json.dumps(results, indent=2)


# ContextModel / ContextField are kept as no-ops so context_retriever.py imports
# don't break while we transition.
class ContextModel:
    pass


def ContextField(**kwargs):
    return kwargs
