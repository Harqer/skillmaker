"""RLM REPL tool exposing the external corpus ``P`` and ``llm_batch``.

``P`` is loaded from the bulk-scraped markdown corpus when the agent is
launched with ``--corpus``; without it the tool is never registered.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from raven.agent.tools.base import Tool

if TYPE_CHECKING:
    from raven.agent.rlm.environment import RLMEnvironment

_DESCRIPTION = """\
Evaluate a Python REPL expression against the external documentation corpus P
and its knowledge graph G. P is a read-only string-like object (len(P),
P[100:500] slicing) with helpers:
  P.urls() -> list of page URLs
  P.read(url) -> full markdown of one page
  P.search(pattern) -> regex matches [{start, end, line, snippet, page}]
  P.sections() -> heading-anchored sections [{heading, level, start, end, chars, page}]
  P.headings(level=None) -> markdown heading texts
  P.chunk(size=4000, overlap=0) -> [{start, end, text}] chunks of P
  P.lines(start, end=None) -> raw line range of P
  P.find(needle) -> character offsets; P.count(needle) -> occurrence count
G is the corpus graphified as Doc -> HAS_SECTION -> Section -> HAS_CHUNK ->
Chunk nodes plus Chunk -MENTIONS-> Entity edges:
  G.summary() -> node/edge counts
  G.search(query, top_k=5) -> chunks ranked by lexical similarity to the query
  G.find(label, properties={}, limit=10) -> nodes by exact property match
  G.get(node_id) -> one node with its outgoing edges
  G.neighbors(node_id, rel_type=None, direction="BOTH", limit=50) -> neighbors
  G.subgraph([seed_ids], k_hops=1) -> BFS subgraph around seeds
Start with G.search() to find entry chunks, then expand via G.neighbors()/
G.get() to reach the parent Section/Doc or related Entities.
Delegation (depth 1 only): llm_batch([prompt1, prompt2, ...]) runs the prompts
in parallel through sub-LLM calls and returns their answers as JSON.
recurse(query, [node_id, ...]) runs a focused sub-query scoped to those graph
nodes through one sub-LLM call (capped, no further recursion). answer(text,
evidence=[node_id, ...]) records the final synthesis. Sub-calls respect the
max_depth, token budget, and timeout limits; slice what you need instead of
dumping large ranges; outputs are capped."""


class RLMReplTool(Tool):
    """Exposes the RLM corpus REPL to the agent loop."""

    timeout_seconds = 660.0

    def __init__(self, environment: "RLMEnvironment") -> None:
        self._environment = environment

    @property
    def name(self) -> str:
        return "rlm"

    @property
    def description(self) -> str:
        return self._environment.describe() + "\n\n" + _DESCRIPTION

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": (
                        "Python expression to evaluate (single expression only; no imports, assignments, or loops)"
                    ),
                }
            },
            "required": ["code"],
        }

    async def execute(self, code: str, **_: Any) -> str:
        return await self._environment.execute(code)
