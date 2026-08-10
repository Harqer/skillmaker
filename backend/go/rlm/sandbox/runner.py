#!/usr/bin/env python3
"""
Sandboxed RLM REPL runner — data plane for the Go RLM engine.

This process owns the corpus variable ``P`` and executes root-model Python
code blocks, but never calls an LLM itself. Every LLM touchpoint
(``llm_query`` / ``llm_batch`` / ``combine_results``) and every knowledge-graph
``G`` operation round-trips to the Go engine over a JSON-lines duplex.

Protocol (one JSON object per line, UTF-8):

  parent -> sandbox:  {"cmd":"init","corpus_path": "...", "guard_chars": 4000000}
                      {"cmd":"exec","id":1,"code":"..."}
                      {"cmd":"quit"}
  sandbox -> parent:  {"cmd":"request","req_id":N,"method":"llm_query","args":{...}}
                      {"cmd":"result","id":1,"ok":true,"output":"...","answer":"...","ready":true}
  parent -> sandbox:  {"cmd":"response","req_id":N,"result":...}
                      {"cmd":"response","req_id":N,"error":"..."}

``llm_batch`` is a single round-trip: Go owns the parallelism, so this process
never issues concurrent pipe reads.
"""

import io
import json
import re
import sys
import traceback
from contextlib import redirect_stdout

_BANNED = {
    "__import__",
    "open",
    "eval",
    "exec",
    "compile",
    "input",
    "breakpoint",
    "globals",
    "locals",
    "getattr",
    "setattr",
    "delattr",
    "__builtins__",
    "__loader__",
    "__spec__",
    "__package__",
    "memoryview",
}

_SAFE_BUILTINS = {
    name: getattr(__builtins__, name)
    for name in dir(__builtins__)
    if name not in _BANNED
}
_SAFE_BUILTINS.update(
    {
        "True": True,
        "False": False,
        "None": None,
        "print": print,
        "__build_class__": __build_class__,
        "__name__": "rlm_repl",
    }
)


def _recv():
    line = sys.stdin.buffer.readline()
    if not line:
        raise EOFError("parent closed stdin")
    return json.loads(line.decode("utf-8"))


class RLMClient:
    """Bidirectional bridge to the Go engine.

    ``stdout`` must be the real parent pipe captured before any
    ``redirect_stdout`` — protocol messages must bypass user-print capture.
    """

    def __init__(self, stdout):
        self._stdout = stdout
        self._req = 0

    def _send(self, obj):
        self._stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        self._stdout.flush()

    def _request(self, method, **args):
        self._req += 1
        req_id = self._req
        self._send({"cmd": "request", "req_id": req_id, "method": method, "args": args})
        while True:
            msg = _recv()
            if msg.get("cmd") != "response" or msg.get("req_id") != req_id:
                continue
            if msg.get("error"):
                raise RuntimeError(msg["error"])
            return msg.get("result")


def build_repl(P, client):
    """Build the RLMREPL-compatible helper API over the full corpus P."""

    def len_p():
        return len(P)

    def peek(start=0, end=2000):
        return P[start:end]

    def search_regex(pattern, max_matches=20, context_chars=300):
        matches = []
        for m in re.finditer(pattern, P, flags=re.IGNORECASE):
            start = max(0, m.start() - context_chars)
            end = min(len(P), m.end() + context_chars)
            matches.append(
                {
                    "match": m.group(0),
                    "start": m.start(),
                    "end": m.end(),
                    "snippet": P[start:end],
                }
            )
            if len(matches) >= max_matches:
                break
        return matches

    def chunk_p(chunk_size=40000, overlap=2000):
        chunks = []
        i = 0
        n = len(P)
        while i < n:
            end = min(n, i + chunk_size)
            chunks.append(P[i:end])
            if end == n:
                break
            i += chunk_size - overlap
        return chunks

    def llm_query(prompt, sub_model=None):
        return client._request("llm_query", prompt=prompt, model=sub_model)

    def llm_batch(prompts, sub_model=None, max_workers=None):
        return client._request(
            "llm_batch",
            prompts=list(prompts),
            model=sub_model,
            max_workers=max_workers,
        )

    def combine_results(results, instruction="Synthesize these findings into a unified result."):
        return client._request(
            "combine_results",
            results=list(results),
            instruction=instruction,
        )

    class _G:
        """Knowledge-graph proxy: every call is served by the Go engine."""

        @staticmethod
        def summary():
            return client._request("g_summary")

        @staticmethod
        def search(query, k=5):
            return client._request("g_search", query=query, k=k)

        @staticmethod
        def get(node_id):
            return client._request("g_get", node_id=node_id)

        @staticmethod
        def neighbors(node_id, depth=1):
            return client._request("g_neighbors", node_id=node_id, depth=depth)

        @staticmethod
        def subgraph(node_ids, depth=2):
            return client._request("g_subgraph", node_ids=list(node_ids), depth=depth)

        @staticmethod
        def find(label="", type="", url=""):
            return client._request("g_find", label=label, type=type, url=url)

    return {
        "P": P,
        "len_p": len_p,
        "peek": peek,
        "search_regex": search_regex,
        "chunk_p": chunk_p,
        "llm_query": llm_query,
        "llm_batch": llm_batch,
        "combine_results": combine_results,
        "G": _G,
        "answer": None,
        "ready": False,
        "re": re,
        "json": json,
    }


def main():
    client = RLMClient(sys.stdout)

    init = _recv()
    if init.get("cmd") != "init":
        client._send({"cmd": "result", "id": -1, "ok": False, "output": "expected init", "answer": None, "ready": False})
        return 1

    corpus_path = init.get("corpus_path")
    with open(corpus_path, "r", encoding="utf-8") as f:
        P = f.read()

    guard = init.get("guard_chars", 0)
    if guard and len(P) > guard:
        sys.stderr.write(
            f"[rlm sandbox] WARNING: corpus {len(P)} chars exceeds guard {guard}; "
            "P is loaded in full (no silent truncation).\n"
        )

    globals_dict = build_repl(P, client)
    globals_dict["__builtins__"] = _SAFE_BUILTINS

    while True:
        msg = _recv()
        if msg.get("cmd") == "quit":
            break
        if msg.get("cmd") != "exec":
            client._send({"cmd": "result", "id": msg.get("id", -1), "ok": False, "output": "unknown cmd", "answer": None, "ready": False})
            continue

        code = msg.get("code", "")
        buffer = io.StringIO()
        ok = True
        error_text = ""
        try:
            with redirect_stdout(buffer):
                exec(code, globals_dict)
        except Exception as e:  # noqa: BLE001 — sandbox surfaces all failures
            ok = False
            error_text = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

        output = buffer.getvalue()
        if error_text:
            output += "\n[Execution Error]\n" + error_text

        client._send(
            {
                "cmd": "result",
                "id": msg.get("id", -1),
                "ok": ok,
                "output": output,
                "answer": globals_dict.get("answer"),
                "ready": bool(globals_dict.get("ready")),
            }
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
