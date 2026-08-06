"""RLM batch limits: env-driven overrides with sane fallbacks."""

from __future__ import annotations

from raven.agent.rlm.limits import RLMBatchLimits, rlm_limits_from_env


def test_defaults_are_sane():
    limits = RLMBatchLimits()
    assert limits.parallel_limit == 4
    assert limits.max_depth == 1
    assert limits.max_tokens_per_call == 2048


def test_env_overrides_known_fields():
    env = {
        "RAVEN_RLM_PARALLEL_LIMIT": "8",
        "RAVEN_RLM_TOKEN_BUDGET": "64000",
        "RAVEN_RLM_TIMEOUT": "90.5",
        "RAVEN_RLM_MAX_DEPTH": "2",
    }
    limits = rlm_limits_from_env(env)
    assert limits.parallel_limit == 8
    assert limits.token_budget == 64000
    assert limits.timeout == 90.5
    assert limits.max_depth == 2


def test_env_ignores_garbage_and_unknown_keys():
    env = {
        "RAVEN_RLM_PARALLEL_LIMIT": "not-a-number",
        "RAVEN_RLM_TIMEOUT": "-5",
        "RAVEN_RLM_UNKNOWN": "1",
    }
    limits = rlm_limits_from_env(env)
    assert limits.parallel_limit == 4
    assert limits.timeout == 120.0
