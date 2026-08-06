"""In-memory knowledge graph over the scraped documentation corpus.

Port of the RLM-Graph schema (arxiv 2512.24601) with no external graph or
embedding dependencies: the markdown corpus from ``agent.scraper.bulk_scrape_docs``
is graphified into ``Doc -> HAS_SECTION -> Section -> HAS_CHUNK -> Chunk`` nodes
plus ``Chunk -MENTIONS-> Entity`` edges, and exposed to the RLM REPL as the
variable ``G``. ``G.search`` uses a deterministic lexical scorer instead of a
neural embedding model, so a run needs no torch/kuzu wheels; ``recurse`` never
calls a backend directly - it returns a command the environment resolves
through the loop's ``LLMProvider``.
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, fields
from typing import Any, Iterable, Mapping

_HEADING_RE = re.compile(r"(?m)^(#{1,6})\s+(.+?)\s*$")
_CODE_RE = re.compile(r"`([^`\n]+)`")
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_TOKEN_RE = re.compile(r"[a-z0-9]+")

_NODE_LABELS = ("Doc", "Section", "Chunk", "Entity")


@dataclass(frozen=True)
class RLMGraphLimits:
    """Bounding knobs for graphify and graph traversal (env-tunable)."""

    chunk_size: int = 500
    chunk_overlap: int = 50
    max_chunks_total: int = 2000
    max_chunks_per_section: int = 40
    max_entities_per_chunk: int = 8
    max_node_results: int = 20
    max_neighbors: int = 50
    max_subgraph_nodes: int = 300
    max_scope_chars: int = 12_000

    def snapshot(self) -> dict[str, int]:
        return {f.name: getattr(self, f.name) for f in fields(self)}


def rlm_graph_limits_from_env(env: Mapping[str, str] | None = None) -> RLMGraphLimits:
    """Build :class:`RLMGraphLimits` from ``RAVEN_RLM_GRAPH_*`` env vars."""
    source = os.environ if env is None else env
    kwargs: dict[str, int] = {}
    for field in fields(RLMGraphLimits):
        raw = source.get(f"RAVEN_RLM_GRAPH_{field.name.upper()}")
        if raw is None or raw.strip() == "":
            continue
        try:
            value = int(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            kwargs[field.name] = value
    return RLMGraphLimits(**kwargs)


def _node_id(*parts: str) -> str:
    return hashlib.md5("\u0000".join(parts).encode("utf-8")).hexdigest()


def _parse_sections(markdown: str) -> list[dict[str, Any]]:
    """Split markdown into heading-anchored sections (heading, level, text)."""
    anchors = [
        (match.start(), len(match.group(1)), match.group(2).strip())
        for match in _HEADING_RE.finditer(markdown)
    ]
    sections: list[dict[str, Any]] = []
    for index, (start, level, heading) in enumerate(anchors):
        end = anchors[index + 1][0] if index + 1 < len(anchors) else len(markdown)
        text = markdown[start:end].lstrip("\n")
        if not text.strip() and not sections:
            text = markdown[:start]
        sections.append({"heading": heading, "level": level, "text": text})
    if not sections and markdown.strip():
        sections.append({"heading": "Root", "level": 0, "text": markdown.strip()})
    return sections


def _chunk_text(text: str, chunk_size: int, overlap: int) -> list[tuple[int, str]]:
    """Character sliding-window chunking; returns ``(start, text)`` pairs."""
    chunks: list[tuple[int, str]] = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunks.append((start, text[start:end]))
        if end >= text_len:
            break
        start += max(chunk_size - overlap, 1)
    return chunks


def _extract_entities(text: str, limit: int) -> list[dict[str, Any]]:
    """Entity extraction via backticked code tokens and markdown links."""
    entities: list[dict[str, Any]] = []
    seen: set[str] = set()
    for match in _CODE_RE.finditer(text):
        name = match.group(1).strip()
        if not 2 <= len(name) <= 50 or name in seen:
            continue
        entities.append({"name": name, "type": "Code"})
        seen.add(name)
        if len(entities) >= limit:
            return entities
    for match in _LINK_RE.finditer(text):
        name = match.group(1).strip()
        if not name or name in seen:
            continue
        entities.append({"name": name, "type": "Reference", "url": match.group(2)})
        seen.add(name)
        if len(entities) >= limit:
            return entities
    return entities


class RLMGraph:
    """Read-only in-memory graph over a markdown corpus, exposed as ``G``."""

    def __init__(
        self,
        pages: dict[str, str] | None = None,
        corpus: str = "",
        *,
        limits: RLMGraphLimits | None = None,
    ) -> None:
        self.limits = limits or RLMGraphLimits()
        self._nodes: dict[str, dict[str, Any]] = {}
        self._adjacency: dict[str, list[tuple[str, str]]] = {}
        self._chunks: list[dict[str, Any]] = []
        self._token_index: dict[str, dict[int, float]] = {}
        self._term_df: dict[str, int] = {}
        self._build(pages, corpus)

    # ------------------------------------------------------------------
    # Graphify
    # ------------------------------------------------------------------

    def _build(self, pages: dict[str, str] | None, corpus: str) -> None:
        if pages:
            for url, markdown in pages.items():
                self._add_doc(url, markdown)
        elif corpus.strip():
            self._add_doc("(corpus)", corpus)
        self._compute_token_index()

    def _add_node(self, label: str, node_id: str, **props: Any) -> None:
        props = {"id": node_id, "_label": label, **props}
        self._nodes[node_id] = props
        self._adjacency.setdefault(node_id, [])

    def _add_edge(self, src: str, rel: str, dst: str) -> None:
        if dst not in self._nodes or src not in self._nodes:
            return
        existing = [d for r, d in self._adjacency.get(src, []) if r == rel and d == dst]
        if existing:
            return
        self._adjacency[src].append((rel, dst))

    def _add_doc(self, source: str, markdown: str) -> None:
        limit = self.limits
        doc_id = _node_id("Doc", source)
        self._add_node("Doc", doc_id, title=source[:300], source=source)

        sections = _parse_sections(markdown)
        for order, section in enumerate(sections):
            if limit.max_chunks_total <= 0:
                break
            section_id = _node_id(doc_id, str(order), section["heading"])
            self._add_node(
                "Section",
                section_id,
                doc_id=doc_id,
                heading=section["heading"][:200],
                section_order=order,
            )
            self._add_edge(doc_id, "HAS_SECTION", section_id)

            chunked = _chunk_text(section["text"], limit.chunk_size, limit.chunk_overlap)
            for index, (start, text) in enumerate(chunked):
                if index >= limit.max_chunks_per_section or len(self._chunks) >= limit.max_chunks_total:
                    break
                chunk_id = _node_id(section_id, str(index))
                self._add_node("Chunk", chunk_id, section_id=section_id, text=text)
                self._add_edge(section_id, "HAS_CHUNK", chunk_id)
                self._chunks.append(
                    {
                        "id": chunk_id,
                        "section_id": section_id,
                        "text": text,
                        "start_offset": start,
                    }
                )
                for entity in _extract_entities(text, limit.max_entities_per_chunk):
                    entity_id = _node_id("Entity", entity["name"], entity["type"])
                    self._add_node(
                        "Entity",
                        entity_id,
                        name=entity["name"][:200],
                        type=entity["type"],
                        aliases=[],
                    )
                    self._add_edge(chunk_id, "MENTIONS", entity_id)

    def _compute_token_index(self) -> None:
        doc_count = max(len(self._chunks), 1)
        for index, chunk in enumerate(self._chunks):
            terms = _TOKEN_RE.findall(chunk["text"].lower())
            frequencies: dict[str, int] = {}
            for term in terms:
                frequencies[term] = frequencies.get(term, 0) + 1
            self._token_index[index] = frequencies
            for term in frequencies:
                self._term_df[term] = self._term_df.get(term, 0) + 1
        self._idf = {
            term: (1.0 + (doc_count - df) / (df + 0.5))
            for term, df in self._term_df.items()
        }

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def describe(self) -> str:
        counts: dict[str, int] = {}
        for node in self._nodes.values():
            counts[node["_label"]] = counts.get(node["_label"], 0) + 1
        labels = ", ".join(f"{label}={counts.get(label, 0)}" for label in _NODE_LABELS)
        return f"knowledge graph G ({labels}, {len(self._chunks)} chunks)"

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def chunk_count(self) -> int:
        return len(self._chunks)

    def has(self, node_id: str) -> bool:
        return node_id in self._nodes

    def summary(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        for node in self._nodes.values():
            counts[node["_label"]] = counts.get(node["_label"], 0) + 1
        return {
            "labels": counts,
            "chunks": len(self._chunks),
            "edges": sum(len(edges) for edges in self._adjacency.values()),
        }

    # ------------------------------------------------------------------
    # Graph tools (mirror the RLM-Graph tool surface)
    # ------------------------------------------------------------------

    def find(self, label: str | None = None, properties: dict[str, Any] | None = None, limit: int = 10) -> list[dict[str, Any]]:
        """Find nodes by exact property match (``label`` and/or ``properties``)."""
        props = dict(properties or {})
        label = label or props.pop("_label", None)
        results: list[dict[str, Any]] = []
        for node in self._nodes.values():
            if label is not None and node["_label"] != label:
                continue
            if any(node.get(key) != value for key, value in props.items()):
                continue
            results.append(self._outgoing(node["id"]))
            if len(results) >= min(limit, self.limits.max_node_results):
                break
        return results

    def get(self, node_id: str) -> dict[str, Any] | None:
        """Return one node with its outgoing edges summarized."""
        node = self._nodes.get(node_id)
        if node is None:
            return None
        return self._outgoing(node_id)

    def neighbors(
        self,
        node_id: str,
        rel_type: str | None = None,
        direction: str = "BOTH",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Neighbors of ``node_id`` along ``rel_type`` in ``direction``."""
        if node_id not in self._nodes:
            return []
        results: list[dict[str, Any]] = []
        outgoing = direction in {"BOTH", "OUT"}
        incoming = direction in {"BOTH", "IN"}
        for rel, other in self._adjacency.get(node_id, []):
            if outgoing and (rel_type is None or rel == rel_type):
                results.append(self._nodes[other])
        if incoming:
            for other, edges in self._adjacency.items():
                if other == node_id:
                    continue
                for rel, dst in edges:
                    if dst != node_id:
                        continue
                    if rel_type is None or rel == rel_type:
                        results.append(self._nodes[other])
                        break
            seen: set[str] = set()
            deduped: list[dict[str, Any]] = []
            for node in results:
                if node["id"] in seen:
                    continue
                seen.add(node["id"])
                deduped.append(node)
            results = deduped
        return results[: min(limit, self.limits.max_neighbors)]

    def subgraph(self, seed_ids: Iterable[str], k_hops: int = 1) -> dict[str, Any]:
        """BFS expansion around ``seed_ids``; returns nodes and edges."""
        visited: set[str] = set()
        frontier = [nid for nid in seed_ids if nid in self._nodes]
        visited.update(frontier)
        for _hop in range(max(0, int(k_hops))):
            if not frontier or len(visited) >= self.limits.max_subgraph_nodes:
                break
            next_frontier: set[str] = set()
            for nid in frontier:
                for rel, other in self._adjacency.get(nid, []):
                    if len(visited) >= self.limits.max_subgraph_nodes:
                        break
                    if other not in visited:
                        visited.add(other)
                        next_frontier.add(other)
            frontier = list(next_frontier)
        nodes = [self._nodes[nid] for nid in visited if nid in self._nodes]
        edges: list[dict[str, str]] = []
        for nid in visited:
            for rel, other in self._adjacency.get(nid, []):
                if other in visited:
                    edges.append({"src": nid, "rel": rel, "dst": other})
        return {"nodes": nodes, "edges": edges}

    def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Lexical semantic search over chunks (BM25-style scoring)."""
        terms = [term for term in _TOKEN_RE.findall(query.lower()) if term in self._idf]
        if not terms or not self._chunks:
            return []
        scores: list[tuple[float, int]] = []
        for index, frequencies in self._token_index.items():
            score = 0.0
            for term in terms:
                tf = frequencies.get(term, 0.0)
                if tf:
                    score += (1.0 + tf) * self._idf[term]
            if score > 0:
                scores.append((score, index))
        scores.sort(key=lambda pair: pair[0], reverse=True)
        results: list[dict[str, Any]] = []
        for score, index in scores[: max(1, top_k)]:
            chunk = dict(self._chunks[index])
            chunk["similarity_score"] = round(score, 3)
            results.append(chunk)
        return results

    def scope_text(self, node_ids: Iterable[str], max_chars: int | None = None) -> str:
        """Concatenate node content for a scoped sub-query context."""
        limit = self.limits
        budget = max_chars or limit.max_scope_chars
        parts: list[str] = []
        used = 0
        for nid in node_ids:
            node = self._nodes.get(nid)
            if node is None:
                continue
            label = node["_label"]
            if label == "Chunk":
                content = node.get("text", "")
            elif label == "Section":
                content = node.get("heading", "")
            elif label == "Doc":
                content = node.get("title", "")
            else:
                content = f"{node.get('type', '')} {node.get('name', '')}"
            block = f"[{nid} {label}] {content}"
            block = block[:800]
            if used + len(block) + 1 > budget:
                break
            parts.append(block)
            used += len(block) + 1
        return "\n\n".join(parts)

    def _outgoing(self, node_id: str) -> dict[str, Any]:
        node = dict(self._nodes[node_id])
        node["_edges"] = [
            {"rel": rel, "target": other} for rel, other in self._adjacency.get(node_id, [])
        ]
        return node


__all__ = [
    "RLMGraph",
    "RLMGraphLimits",
    "rlm_graph_limits_from_env",
]
