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
Evaluate a Python REPL expression against the external documentation corpus P.
P is a read-only string-like object (len(P), P[100:500] slicing) with helpers:
  P.urls() -> list of page URLs
  P.read(url) -> full markdown of one page
  P.search(pattern) -> regex matches [{start, end, line, snippet, page}]
  P.sections() -> heading-anchored sections [{heading, level, start, end, chars, page}]
  P.headings(level=None) -> markdown heading texts
  P.chunk(size=4000, overlap=0) -> [{start, end, text}] chunks of P
  P.lines(start, end=None) -> raw line range of P
  P.find(needle) -> character offsets; P.count(needle) -> occurrence count
Delegation (depth 1 only): llm_batch([prompt1, prompt2, ...]) runs the prompts
in parallel through sub-LLM calls and returns their answers as JSON. Sub-calls
cannot recurse (max_depth=1) and the batch aborts on timeout or when the token
budget is exceeded. Slice what you need instead of dumping large ranges;
outputs are capped."""


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
