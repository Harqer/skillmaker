"""
deep_wiki_memory.py — LangChain-powered Deep Wiki Memory for semantic document searching.

Uses LangChain's RecursiveCharacterTextSplitter to split wiki/markdown documents
and GoogleGenerativeAIEmbeddings to embed them. Stores the resulting chunk vectors
in a dedicated Redis index ("wiki_chunks") via RedisVL.
"""

from __future__ import annotations

import uuid

from config import REDIS_URI
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from redisvl.index import SearchIndex
from redisvl.query import VectorQuery
from redisvl.schema import IndexSchema

# ── Index Schema ──────────────────────────────────────────────────────────────

WIKI_SCHEMA = IndexSchema.from_dict(
    {
        "index": {
            "name": "wiki_chunks",
            "prefix": "wiki_chunk",
            "storage_type": "json",
        },
        "fields": [
            {"name": "id", "type": "tag"},
            {"name": "doc_id", "type": "tag"},
            {"name": "title", "type": "text"},
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


# ── Embeddings Model ──────────────────────────────────────────────────────────


def _get_embeddings() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")


# ── Deep Wiki Memory Client ───────────────────────────────────────────────────


class DeepWikiMemory:
    """
    Durable, LangChain-powered semantic memory for wikis and search documentation.

    Provides:
      1. Chunking of long wiki/documentation markdown.
      2. Embedding-based indexing into Redis.
      3. KNN semantic query retrieval.
    """

    def __init__(self):
        self._index: SearchIndex | None = None
        self._embeddings = _get_embeddings()

    def _get_index(self) -> SearchIndex:
        if self._index is None:
            self._index = SearchIndex(schema=WIKI_SCHEMA, redis_url=REDIS_URI)
            # create is idempotent when overwrite=False
            self._index.create(overwrite=False)
        return self._index

    def store_document(self, doc_id: str, title: str, content: str) -> int:
        """
        Loads, splits, embeds, and indexes a wiki document.

        Uses LangChain's RecursiveCharacterTextSplitter to create optimal chunks.
        """
        if not content.strip():
            return 0

        # Chunk using LangChain
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=100, separators=["\n\n", "\n", " ", ""]
        )
        chunks = splitter.split_text(content)
        if not chunks:
            return 0

        # Create embeddings
        embeddings = self._embeddings.embed_documents(chunks)

        index = self._get_index()
        records = [
            {
                "id": str(uuid.uuid4()),
                "doc_id": doc_id,
                "title": title,
                "content": chunks[i],
                "embedding": embeddings[i],
            }
            for i in range(len(chunks))
        ]

        # Ingest into Redis search index
        index.load(records, id_field="id")
        return len(records)

    def search_wiki(
        self, query: str, doc_id: str | None = None, k: int = 5
    ) -> list[dict]:
        """
        Query the wiki chunks index semantically using vector search.
        """
        embedding = self._embeddings.embed_query(query)

        vq = VectorQuery(
            vector=embedding,
            vector_field_name="embedding",
            return_fields=["doc_id", "title", "content"],
            num_results=k,
        )

        if doc_id:
            vq.set_filter(f"@doc_id:{{{doc_id}}}")

        index = self._get_index()
        results = index.query(vq)
        return [
            {
                "doc_id": r.get("doc_id"),
                "title": r.get("title"),
                "content": r.get("content"),
                "score": float(r.get("vector_distance", 1.0)),
            }
            for r in results
        ]
