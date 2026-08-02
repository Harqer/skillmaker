"""
rlm_engine.py — Recursive Language Models (RLM) for Raven AI Researcher.

Based on MIT CSAIL paper "Recursive Language Models" (Zhang, Kraska & Khattab, arXiv:2512.24601)
and Prime Intellect's RLM paradigm.

Key Principles:
1. Treat long prompts/corpora as external environment variables (P) inside a Python REPL.
2. Root LLM (Depth 0) programmatically inspects, decomposes, and searches P without loading full prompt into context.
3. Sub-calls (llm_query / llm_batch) delegate isolated text snippets to sub-LLMs at Depth 1 in parallel.
4. Strict max_depth = 1 guardrail to prevent exponential overthinking and format collapse.
"""

import json
import os
import re
import sys
import traceback
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional, Tuple


# ── Gemini Low-level REST Helper ──────────────────────────────────────────────

def _gemini_generate(
    prompt: str,
    system_instruction: Optional[str] = None,
    model: str = "gemini-2.5-flash",
    temperature: float = 0.2,
) -> str:
    """Execute a direct Gemini API completion using Python urllib."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    contents = []
    if system_instruction:
        contents.append({"role": "user", "parts": [{"text": f"System Instruction:\n{system_instruction}\n\nTask:\n{prompt}"}]})
    else:
        contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 8192,
        },
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join([p.get("text", "") for p in parts]).strip()
    except Exception as e:
        print(f"[rlm_engine] Gemini call error: {e}")
        return f"Error calling Gemini model ({model}): {e}"


# ── RLM REPL Sandbox ──────────────────────────────────────────────────────────

class RLMREPL:
    """Python REPL Environment for RLM root model execution."""

    def __init__(
        self,
        corpus: str,
        sub_model: str = "gemini-2.5-flash",
        max_workers: int = 5,
        token_budget: int = 500000,
    ):
        self.corpus = corpus
        self.sub_model = sub_model
        self.max_workers = max_workers
        self.token_budget = token_budget
        self.tokens_used = 0
        self.sub_call_history: List[Dict[str, Any]] = []

        # REPL globals namespace
        self.globals_dict: Dict[str, Any] = {}
        self._reset_namespace()

    def _reset_namespace(self):
        """Initialize REPL namespace with variable P and RLM helper API."""
        self.globals_dict = {
            "P": self.corpus,
            "len_p": self.len_p,
            "peek": self.peek,
            "search_regex": self.search_regex,
            "chunk_p": self.chunk_p,
            "llm_query": self.llm_query,
            "llm_batch": self.llm_batch,
            "combine_results": self.combine_results,
            "answer": None,
            "ready": False,
            "re": re,
            "json": json,
        }

    def len_p(self) -> int:
        """Return length of corpus variable P in characters."""
        return len(self.corpus)

    def peek(self, start: int = 0, end: int = 2000) -> str:
        """Peek into slice of P."""
        return self.corpus[start:end]

    def search_regex(self, pattern: str, max_matches: int = 20, context_chars: int = 300) -> List[Dict[str, Any]]:
        """Find matches for regex pattern in P with surrounding context."""
        matches = []
        for m in re.finditer(pattern, self.corpus, flags=re.IGNORECASE):
            start = max(0, m.start() - context_chars)
            end = min(len(self.corpus), m.end() + context_chars)
            matches.append({
                "match": m.group(0),
                "start": m.start(),
                "end": m.end(),
                "snippet": self.corpus[start:end],
            })
            if len(matches) >= max_matches:
                break
        return matches

    def chunk_p(self, chunk_size: int = 40000, overlap: int = 2000) -> List[str]:
        """Partition P into manageable text chunks with overlap."""
        chunks = []
        i = 0
        n = len(self.corpus)
        while i < n:
            end = min(n, i + chunk_size)
            chunks.append(self.corpus[i:end])
            if end == n:
                break
            i += (chunk_size - overlap)
        return chunks

    def llm_query(self, prompt: str, sub_model: Optional[str] = None) -> str:
        """Sub-LLM query at Depth 1."""
        model_to_use = sub_model or self.sub_model
        print(f"[RLM Sub-Call Depth 1] Querying {model_to_use} ({len(prompt)} chars)...")
        res = _gemini_generate(prompt=prompt, model=model_to_use)
        self.sub_call_history.append({
            "prompt_length": len(prompt),
            "response_length": len(res),
            "model": model_to_use,
        })
        self.tokens_used += (len(prompt) + len(res)) // 4
        return res

    def llm_batch(self, prompts: List[str], sub_model: Optional[str] = None, max_workers: Optional[int] = None) -> List[str]:
        """Parallel sub-LLM calls at Depth 1."""
        workers = max_workers or self.max_workers
        model_to_use = sub_model or self.sub_model
        print(f"[RLM Sub-Batch Depth 1] Spawning {len(prompts)} sub-calls in parallel (workers={workers})...")

        results = [""] * len(prompts)
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_idx = {
                executor.submit(self.llm_query, prompt, model_to_use): idx
                for idx, prompt in enumerate(prompts)
            }
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    results[idx] = future.result()
                except Exception as e:
                    results[idx] = f"Sub-call error: {e}"

        return results

    def combine_results(self, results: List[str], instruction: str = "Synthesize these findings into a unified result.") -> str:
        """Helper to combine sub-LLM findings using a sub-LLM call."""
        combined_text = "\n\n--- ITEM ---\n\n".join(results)
        prompt = f"{instruction}\n\nFindings:\n{combined_text[:120000]}"
        return self.llm_query(prompt)

    def execute_code(self, code: str) -> Tuple[bool, str, Dict[str, Any]]:
        """Execute Python code snippet in REPL namespace."""
        import io
        from contextlib import redirect_stdout

        buffer = io.StringIO()
        success = True
        error_msg = ""

        try:
            with redirect_stdout(buffer):
                exec(code, self.globals_dict)
        except Exception as e:
            success = False
            error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

        output = buffer.getvalue()
        if error_msg:
            output += f"\n[Execution Error]\n{error_msg}"

        return success, output, self.globals_dict


# ── RLM Core Engine ───────────────────────────────────────────────────────────

class RLMEngine:
    """MIT Recursive Language Model Orchestrator (Depth 0)."""

    def __init__(
        self,
        root_model: str = "gemini-2.5-flash",
        sub_model: str = "gemini-2.5-flash",
        max_depth: int = 1,  # Strictly bounded depth = 1
        max_iterations: int = 8,
        token_budget: int = 500000,
    ):
        self.root_model = root_model
        self.sub_model = sub_model
        self.max_depth = min(max_depth, 1)  # Guardrail: force max_depth <= 1
        self.max_iterations = max_iterations
        self.token_budget = token_budget

    def _extract_python_code(self, text: str) -> Optional[str]:
        """Extract Python code blocks from LLM output."""
        matches = re.findall(r"```python\s*(.*?)\s*```", text, re.DOTALL)
        if matches:
            return "\n\n".join(matches)
        matches_generic = re.findall(r"```\s*(.*?)\s*```", text, re.DOTALL)
        if matches_generic and ("def " in matches_generic[0] or "P[" in matches_generic[0] or "llm_" in matches_generic[0]):
            return "\n\n".join(matches_generic)
        return None

    def run(self, corpus: str, task: str) -> Dict[str, Any]:
        """Run RLM processing loop over long prompt corpus P."""
        print(f"[RLM Engine] Starting RLM processing over corpus of {len(corpus):,} chars (~{len(corpus)//4:,} tokens)...")

        repl = RLMREPL(
            corpus=corpus,
            sub_model=self.sub_model,
            token_budget=self.token_budget,
        )

        system_prompt = f"""\
You are an RLM (Recursive Language Model) Root Orchestrator operating in a Python REPL.

## Context Environment
- The entire input corpus ({len(corpus):,} chars) is stored in variable `P`.
- Do NOT try to view or print all of `P` directly into your context window.
- Instead, write Python code to programmatically inspect, slice, regex search, partition, and delegate sub-tasks to sub-LLMs.

## Available Helper APIs in REPL:
1. `len_p()` -> int: returns total character length of P.
2. `peek(start=0, end=2000)` -> str: returns substring slice of P.
3. `search_regex(pattern, max_matches=20, context_chars=300)` -> list[dict]: finds regex pattern matches in P with context snippets.
4. `chunk_p(chunk_size=40000, overlap=2000)` -> list[str]: partitions P into overlapping chunks.
5. `llm_query(prompt, sub_model=None)` -> str: calls a sub-LLM (Depth 1) on a specific prompt snippet.
6. `llm_batch(prompts, sub_model=None, max_workers=5)` -> list[str]: executes multiple sub-LLM calls in parallel across snippets.
7. `combine_results(results, instruction)` -> str: synthesizes list of sub-call findings into a consolidated summary.

## Rules:
1. Write Python code in ```python ... ``` blocks.
2. Your goal is to construct the final response for the user's task.
3. When you are ready with the final result, set `answer = <your final output string>` and `ready = True` in your Python code.
4. Always bound recursion: sub-calls are Depth 1. Do NOT spawn recursive sub-calls within sub-calls.
"""

        conversation_history = f"Task to solve:\n{task}\n\nCorpus Length: {len(corpus):,} chars.\n\nWrite your first Python code block to inspect or partition P and execute sub-calls."

        iteration = 0
        repl_history = []

        while iteration < self.max_iterations:
            iteration += 1
            print(f"\n[RLM Iteration {iteration}/{self.max_iterations}] Querying Root Model...")

            root_response = _gemini_generate(
                prompt=conversation_history,
                system_instruction=system_prompt,
                model=self.root_model,
                temperature=0.1,
            )

            code = self._extract_python_code(root_response)

            if not code:
                # If no code block generated, check if response contains the answer
                print("[RLM Engine] No code block generated. Assuming direct synthesis.")
                repl.globals_dict["answer"] = root_response
                repl.globals_dict["ready"] = True

            if code:
                print(f"[RLM Executing Python REPL Code]:\n{code[:300]}...\n")
                success, output, globals_state = repl.execute_code(code)

                repl_history.append({
                    "iteration": iteration,
                    "code": code,
                    "output": output[:2000],
                    "success": success,
                })

                # Check if answer variable is set or ready is True
                answer = globals_state.get("answer")
                ready = globals_state.get("ready", False)

                if ready or (answer and str(answer).strip() and answer != "None"):
                    print(f"[RLM Engine] Completed successfully at iteration {iteration}!")
                    return {
                        "success": True,
                        "answer": str(answer),
                        "iterations": iteration,
                        "tokens_used": repl.tokens_used,
                        "sub_calls_count": len(repl.sub_call_history),
                        "repl_history": repl_history,
                    }

                # Feed execution output back to Root LLM
                conversation_history += f"\n\n--- Iteration {iteration} Code Executed ---\nOutput:\n{output[:4000]}\n\nNext Step: Analyze output and continue or assign `answer = ...` and `ready = True`."
            else:
                if repl.globals_dict.get("answer"):
                    return {
                        "success": True,
                        "answer": str(repl.globals_dict["answer"]),
                        "iterations": iteration,
                        "tokens_used": repl.tokens_used,
                        "sub_calls_count": len(repl.sub_call_history),
                        "repl_history": repl_history,
                    }

        # Fallback if iterations exhausted: chunk P and auto-synthesize
        print("[RLM Engine] Max iterations reached without explicit answer variable. Executing fallback auto-synthesis...")
        chunks = repl.chunk_p(chunk_size=50000)
        batch_prompts = [
            f"Extract all key information, endpoints, rules, and details relevant to:\n{task}\n\nContent Chunk ({i+1}/{len(chunks)}):\n{c}"
            for i, c in enumerate(chunks)
        ]
        sub_results = repl.llm_batch(batch_prompts)
        final_answer = repl.combine_results(sub_results, f"Synthesize all findings for the task: {task}")

        return {
            "success": True,
            "answer": final_answer,
            "iterations": iteration,
            "tokens_used": repl.tokens_used,
            "sub_calls_count": len(repl.sub_call_history),
            "repl_history": repl_history,
            "fallback_used": True,
        }


# ── RLMChatCompletion Convenience Interface ───────────────────────────────────

class RLMChatCompletion:
    """Drop-in chat completion wrapper implementing RLM strategy."""

    @staticmethod
    def create(
        messages: List[Dict[str, str]],
        prompt_as_env: Optional[str] = None,
        model: str = "gemini-2.5-flash",
        rlm_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        config = rlm_config or {}
        root_model = config.get("root_model", model)
        sub_model = config.get("sub_model", "gemini-2.5-flash")
        max_depth = config.get("max_depth", 1)
        max_iterations = config.get("max_iterations", 8)

        # Extract last user task prompt
        user_task = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_task = msg.get("content", "")
                break

        corpus = prompt_as_env or user_task

        engine = RLMEngine(
            root_model=root_model,
            sub_model=sub_model,
            max_depth=max_depth,
            max_iterations=max_iterations,
        )

        result = engine.run(corpus=corpus, task=user_task)

        return {
            "id": "rlm-" + str(os.urandom(4).hex()),
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result.get("answer", ""),
                    },
                    "finish_reason": "stop",
                }
            ],
            "rlm_metadata": {
                "iterations": result.get("iterations"),
                "sub_calls_count": result.get("sub_calls_count"),
                "tokens_used": result.get("tokens_used"),
            },
        }


def recursive_research_query(corpus: str, task: str) -> Dict[str, Any]:
    """High-level function for Raven AI Researcher to process huge corpora with RLM."""
    engine = RLMEngine(root_model="gemini-2.5-flash", sub_model="gemini-2.5-flash", max_depth=1)
    return engine.run(corpus=corpus, task=task)
