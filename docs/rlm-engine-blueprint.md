# Go RLM Engine — Blueprint

Recursive Language Models (RLM) for the ABSO skill pipeline, implemented as a
native Go engine (`backend/go/rlm/`) behind the existing
`deep-research-runner` binary. This is the execution vehicle for the MIT-RLM
paradigm (Zhang, Kraska & Khattab; Prime Intellect) already referenced by
`agent/rlm_engine.py`, now with no Python-interpreter dependence in the loop.

## Why Go

- One statically-linked binary (`backend/go/bin/deep-research-runner`) runs the
  root-model loop, owns the token budget, and delegates depth-1 sub-calls to a
  bounded worker pool — no per-call Python or agent harness in the hot path.
- The sandbox stays Python (real `exec` semantics), but it is a *data-plane*
  subprocess: it owns the corpus `P` and executes root-model code blocks, while
  every LLM call round-trips to the Go engine. Depth-1 recursion is therefore
  structurally impossible (sub-calls never execute user code).
- Real tests run in-process with a real `python3` sandbox and a real Gemini
  REST client; no mocks or hardcoded outputs in any shipped path.

## Architecture

```
agent/rlm_go_bridge.py (Python adapter)
        │  writes corpus file, invokes binary
        ▼
deep-research-runner rlm --corpus <file> --task <task>
        │
        ▼
rlm.Engine (backend/go/rlm/engine.go)
   ├── gemini.go      root model + sub-LLM REST client (budget-aware)
   ├── repl.go        sandboxed REPL subprocess (JSON-lines, bidirectional)
   │        └── sandbox/runner.py (embedded via go:embed)
   ├── corpus.go      P: full corpus text + page map + offsets
   └── graph.go       G: Doc→Section→Chunk(+MENTIONS→Entity) lattice
```

Subcommands (stdout JSON, exit 0 on completed run regardless of research
outcome; exit 1 only on internal errors):

- `research` — existing single-shot Raven runner (unchanged).
- `rlm --corpus <file> --task <task>` — Contract 1: RLM synthesis of the corpus.
- `skillplan --skills <dir> --task <task> --mode sequence|parallel` — Contract 2.

## Contracts

### Result schema (both subcommands)

```json
{"success": bool, "answer": str, "iterations": int,
 "tokens_used": int, "sub_calls_count": int,
 "fallback_used": bool, "selected_skills": [str], "applications": [{"skill": str, "output": str}],
 "error": str}
```

### Routing (Contract 1) — single authority `agent/rlm_routing.py`

A job routes through RLM when the input is a long document
(`RLM_ROUTE_MIN_CHARS = 25_000` chars) OR a large number of URLs
(`RLM_ROUTE_MIN_PAGES = 2` pages). Short single-input jobs keep the direct path.
No layer hardcodes its own cutoffs.

### No silent truncation

The engine loads the **entire** corpus file into `P`. The only capping happens
explicitly at the Python boundary (`RLM_MAX_CORPUS_CHARS = 4_000_000`), and it
is loud: when a corpus must be capped, the adapter logs the actual numbers to
stderr. `P` inside the sandbox is never silently sliced.

### Budgets

| Constant | Value | Enforcement |
|---|---|---|
| Root loop iterations | 8 (env `RLM_MAX_ITERATIONS`) | engine loop bound |
| Token budget (root+sub) | 500_000 (approx chars/4) | engine refuses sub-calls past budget |
| Worker pool (sub-batch) | 5 (`--max-workers`) | parallel depth-1 sub-calls |
| Sub-call timeout | 120s | per-Gemini request |
| Fallback batch cap | 10 prompts | `llm_batch` auto-synthesis (mirrors `RLMREPL._fallback_answer`) |
| Exec wall-clock | 0 (none by default) | bounded by the engine ctx; the Python adapter caps the whole run at 240s |

The sandbox is still killed (process tree) on ctx cancellation, but the engine
imposes no per-code-block timer of its own — the tightest bound is the adapter
subprocess timeout, with per-Gemini requests at 120s each.

## Sandbox protocol (JSON-lines, both directions)

Engine → sandbox:
```
{"cmd":"init","corpus_path": "...", "guard_chars": 4000000}
{"cmd":"exec","id":1,"code":"..."}
{"cmd":"quit"}
```

Sandbox → engine (stdout, one JSON object per line):
```
{"cmd":"request","req_id":1,"method":"llm_query","args":{"prompt":"..."}}
{"cmd":"request","req_id":2,"method":"g_search","args":{"query":"...","k":5}}
{"cmd":"result","id":1,"ok":true,"output":"...","answer":"...","ready":true}
```

Engine → sandbox (response to a request):
```
{"cmd":"response","req_id":1,"result":"..."}
{"cmd":"response","req_id":2,"error":"..."}
```

The sandbox exposes the RLMREPL-compatible helper API over `P`
(`len_p`, `peek`, `search_regex`, `chunk_p`) plus `llm_query`, `llm_batch`,
`combine_results` and the graph proxy `G` (`G.summary`, `G.search`, `G.get`,
`G.neighbors`, `G.subgraph`, `G.find`). `llm_batch` is a *single* round-trip —
Go owns the parallelism, so the sandbox never issues concurrent pipe reads.

Sandbox hardening: restricted builtins (no `__import__`, `open`, `eval`,
`exec`, `compile`, `input`, `breakpoint`, `getattr`); no `threading`; the Go
engine kills the process tree on ctx cancellation. Two lifecycle details worth
remembering: the protocol `RLMClient` writes to the stdout pipe captured
*before* the engine applies `redirect_stdout` during `exec` (otherwise protocol
messages get captured into the exec buffer and the loop deadlocks), and the
temporary sandbox script is deleted only in `Close()` after `Wait()` (deleting
right after `Start()` races the child's `execve`).

## Root loop (parity with `agent/rlm_engine.py::RLMEngine.run`)

1. Root-model system prompt describes the REPL helper API and the rules
   (inspect/slice `P` programmatically; depth-1 sub-calls only; finish with
   `answer = ...` and `ready = True`).
2. Root call → extract first ```` ```python ```` code block (fallback: any
   fenced block; else treat the whole response as the answer).
3. Sandbox `exec` → capture stdout, `answer`, `ready`.
4. On `ready` or a non-empty `answer`, return success immediately.
5. Otherwise append the iteration output to `conversation_history` and repeat
   (≤ `RLM_MAX_ITERATIONS`).
6. Fallback auto-synthesis: chunk `P` at 50k/2k overlap (capped at 10
   chunks), parallel `llm_batch` over the task, `combine_results`, return with
   `fallback_used: true`. When the root model errors every iteration, the
   fallback answer is still returned with `error` annotated.

## Knowledge graph G

Deterministic node IDs (`doc:N`, `section:doc:N:M`, `chunk:section:N:M:K`,
`entity:<label>`), edges `HAS_SECTION`, `HAS_CHUNK`, `MENTIONS`, `RELATED`.
`G.search` is BM25 over chunk tokens with IDF from document frequency. The
graph is a pure Go implementation (`graph.go`) with unit tests against
synthetic-but-real markdown; `G` is reachable from the sandbox and also powers
the `skillplan` selection scorer.

## Skill library (Contract 2)

`skillplan` discovers `*/SKILL.md` under `--skills` (the repo library lives at
`agent/skills/`), scores skills against the task with a deterministic lexical
scorer (name×3, description×2, body×1 token overlap), and applies the selected
skills in `sequence` or `parallel` mode via real depth-1 sub-LLM calls. Each
application returns the skill-shaped contribution for the task.

## Wiring

- `agent/rlm_go_bridge.py` — `rlm_synthesize(corpus, task, pages=...)` and
  `apply_skills(skills_dir, task, mode=...)`. The corpus file is written with
  the same shape `rlm_bridge._write_corpus_file` uses (`{url: markdown}` JSON,
  or plain `.md`), with loud over-budget reporting.
- `raven_bridge._build_research_brief` and `orchestrator.scraper_analyze_node`
  call `rlm_synthesize` instead of `rlm_engine.recursive_research_query`;
  `rlm_engine.py` remains as a loudly-warned fallback only.
- The direct path and the Raven-native `rlm_bridge` (`raven agent --corpus`)
  are untouched.

## Tests

- Go (in-process, real `python3` sandbox, no LLM): corpus loading, graph
  search/neighbors/subgraph/find, sandbox protocol round-trip, code
  extraction, skill scoring, budget accounting, exec hang-kill.
- Go integration (gated on `GEMINI_API_KEY`): full `Engine.Run` over a real
  large markdown corpus; `skillplan` over the repo `agent/skills` library.
- Python (venv): `test_rlm_go_bridge.py` — adapter arg building, result
  parsing, error/fallback behavior, plus a real-boundary run when the binary
  and key are present.
