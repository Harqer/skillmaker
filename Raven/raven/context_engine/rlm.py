"""
Raven Native RLM (Recursive Language Model) Context Engine Module.

Implements the 2026 RLM paradigm (Zhang, Kraska & Khattab, MIT CSAIL, arXiv:2512.24601):
- Treats massive context prompts (up to 10M+ tokens) as an external string environment P.
- Root Language Model (Depth 0) executes in a Python REPL to inspect, search, and partition P.
- Sub-calls (llm_query / llm_batch) delegate isolated snippets to sub-LLMs at Depth 1 in parallel.
- Bounded recursion (max_depth = 1) prevents format collapse and token inflation.
"""

from __future__ import annotations

import json
import re
import sys
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

# Try importing rlm_engine from agent or local
try:
    from rlm_engine import RLMEngine, RLMChatCompletion, recursive_research_query
except ImportError:
    sys.path.append(os.path.join(os.path.dirname(__file__), "../../../agent"))
    try:
        from rlm_engine import RLMEngine, RLMChatCompletion, recursive_research_query
    except ImportError:
        RLMEngine = None  # type: ignore


@dataclass
class RLMContextConfig:
    enabled: bool = True
    root_model: str = "gemini-2.5-flash"
    sub_model: str = "gemini-2.5-flash"
    max_depth: int = 1  # Strictly bounded depth = 1
    max_iterations: int = 8
    threshold_chars: int = 40000


class RavenRLMManager:
    """Manager for running RLM queries on Raven session context and long prompts."""

    def __init__(self, config: Optional[RLMContextConfig] = None):
        self.config = config or RLMContextConfig()

    def process_long_context(self, corpus: str, task: str) -> Dict[str, Any]:
        """Process long context with RLM if corpus size exceeds threshold."""
        if not corpus or len(corpus) < self.config.threshold_chars:
            return {
                "success": True,
                "used_rlm": False,
                "answer": corpus,
            }

        print(f"[Raven RLM] Corpus size ({len(corpus):,} chars) exceeds threshold ({self.config.threshold_chars:,} chars). Dispatching RLM engine...")

        if RLMEngine is None:
            return {
                "success": False,
                "used_rlm": False,
                "error": "RLMEngine not available in Python path.",
            }

        engine = RLMEngine(
            root_model=self.config.root_model,
            sub_model=self.config.sub_model,
            max_depth=self.config.max_depth,
            max_iterations=self.config.max_iterations,
        )

        res = engine.run(corpus=corpus, task=task)
        res["used_rlm"] = True
        return res
