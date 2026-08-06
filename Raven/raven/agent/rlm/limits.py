"""Hard limits and tuning knobs for the RLM/REPL batch layer.

Every value can be overridden through ``RAVEN_RLM_*`` environment variables so
deployments can tune budgets without touching code. The defaults are chosen so
an ``llm_batch`` run stays inside one agent turn without wedging the loop.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, fields
from typing import Mapping


@dataclass(frozen=True)
class RLMBatchLimits:
    """Limits enforced by ``run_llm_batch`` and the RLM REPL environment."""

    parallel_limit: int = 4
    token_budget: int = 32_000
    timeout: float = 120.0
    max_depth: int = 1
    early_stopping: int = 0
    max_tokens_per_call: int = 2048
    max_output_chars: int = 8_000
    max_matches: int = 20
    max_chunks: int = 50

    def snapshot(self) -> dict[str, int | float]:
        return {f.name: getattr(self, f.name) for f in fields(self)}


def rlm_limits_from_env(env: Mapping[str, str] | None = None) -> RLMBatchLimits:
    """Build :class:`RLMBatchLimits` from ``RAVEN_RLM_*`` env vars.

    Unparsable or non-positive values fall back to the dataclass default for
    that field.
    """
    source = os.environ if env is None else env
    kwargs: dict[str, int | float] = {}
    casts: dict[str, type[int] | type[float]] = {
        "parallel_limit": int,
        "token_budget": int,
        "timeout": float,
        "max_depth": int,
        "early_stopping": int,
        "max_tokens_per_call": int,
        "max_output_chars": int,
        "max_matches": int,
        "max_chunks": int,
    }
    for field_name, cast in casts.items():
        raw = source.get(f"RAVEN_RLM_{field_name.upper()}")
        if raw is None or raw.strip() == "":
            continue
        try:
            value = cast(raw)
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        kwargs[field_name] = value
    return RLMBatchLimits(**kwargs)
