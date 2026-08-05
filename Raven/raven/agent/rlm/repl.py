"""Sandboxed Python REPL for the RLM environment.

Evaluates a single expression (``ast.parse(code, mode="eval")``) against a
strict allowlist of names and attributes. Only the corpus variable ``P``,
``len``, and ``llm_batch(...)`` are reachable; imports, assignments,
comprehensions, lambdas, and attribute chains off arbitrary objects are
rejected so an adversarial or sloppy expression cannot escape the sandbox.
"""

from __future__ import annotations

import ast
from typing import Any, Callable

from raven.agent.rlm.corpus import RLMCorpus


class RLMReplError(ValueError):
    """Raised when an expression violates the RLM sandbox allowlist."""


#: Attribute names reachable off the corpus object.
_P_ALLOWED = {
    "length",
    "size",
    "page_count",
    "urls",
    "read",
    "page",
    "find",
    "count",
    "search",
    "sections",
    "headings",
    "chunk",
    "lines",
}


class BatchCommand:
    """Sentinel produced by ``llm_batch(...)`` inside the REPL.

    Evaluation returns this to the environment, which converts it into a real
    parallel batch of sub-LLM calls; it never runs Python itself.
    """

    def __init__(self, prompts: list[str]) -> None:
        self.prompts = prompts


_BINOPS: dict[type[ast.operator], Callable[[Any, Any], Any]] = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b,
    ast.Mod: lambda a, b: a % b,
}

_UNARYOPS: dict[type[ast.unaryop], Callable[[Any], Any]] = {
    ast.USub: lambda value: -value,
    ast.Not: lambda value: not value,
}

_COMPARISONS: dict[type[ast.cmpop], Callable[[Any, Any], bool]] = {
    ast.Eq: lambda a, b: a == b,
    ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b,
    ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b,
    ast.GtE: lambda a, b: a >= b,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


class RLMRepl:
    """Evaluate single expressions against the corpus under an allowlist."""

    def __init__(
        self,
        corpus: RLMCorpus,
        llm_batch: Callable[[list[str]], BatchCommand],
    ) -> None:
        self._corpus = corpus
        self._llm_batch = llm_batch

    def evaluate(self, code: str) -> Any:
        if not code or not code.strip():
            raise RLMReplError("empty expression")
        try:
            tree = ast.parse(code, mode="eval")
        except SyntaxError as exc:
            raise RLMReplError(f"syntax error: {exc}") from exc
        try:
            return self._eval(tree.body)
        except RLMReplError:
            raise
        except (TypeError, ValueError, IndexError, KeyError, AttributeError) as exc:
            raise RLMReplError(f"evaluation error: {exc}") from exc

    def _eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (str, int, float, bool)) or node.value is None:
                return node.value
            raise RLMReplError(f"unsupported literal: {node.value!r}")
        if isinstance(node, ast.Name):
            return self._lookup(node.id)
        if isinstance(node, ast.Attribute):
            return self._eval_attribute(node)
        if isinstance(node, ast.Subscript):
            return self._eval(node.value)[self._eval_slice(node.slice)]
        if isinstance(node, ast.Call):
            return self._eval_call(node)
        if isinstance(node, ast.BinOp):
            op = _BINOPS.get(type(node.op))
            if op is None:
                raise RLMReplError(f"unsupported binary operator: {type(node.op).__name__}")
            return op(self._eval(node.left), self._eval(node.right))
        if isinstance(node, ast.UnaryOp):
            op = _UNARYOPS.get(type(node.op))
            if op is None:
                raise RLMReplError(f"unsupported unary operator: {type(node.op).__name__}")
            return op(self._eval(node.operand))
        if isinstance(node, ast.BoolOp):
            values = [self._eval(value) for value in node.values]
            return all(values) if isinstance(node.op, ast.And) else any(values)
        if isinstance(node, ast.Compare):
            left = self._eval(node.left)
            for op_node, comparator in zip(node.ops, node.comparators):
                op = _COMPARISONS.get(type(op_node))
                if op is None:
                    raise RLMReplError(f"unsupported comparison: {type(op_node).__name__}")
                right = self._eval(comparator)
                if not op(left, right):
                    return False
                left = right
            return True
        if isinstance(node, (ast.List, ast.Tuple)):
            items = [self._eval(item) for item in node.elts]
            return list(items) if isinstance(node, ast.List) else tuple(items)
        if isinstance(node, ast.Dict):
            return {self._eval(key): self._eval(value) for key, value in zip(node.keys, node.values) if key is not None}
        raise RLMReplError(f"unsupported expression: {type(node).__name__}")

    def _eval_slice(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Slice):
            lower = self._eval(node.lower) if node.lower is not None else None
            upper = self._eval(node.upper) if node.upper is not None else None
            step = self._eval(node.step) if node.step is not None else None
            return slice(lower, upper, step)
        return self._eval(node)

    def _eval_attribute(self, node: ast.Attribute) -> Any:
        value = self._eval(node.value)
        if value is not self._corpus:
            raise RLMReplError("attribute access is only allowed on P")
        if node.attr not in _P_ALLOWED:
            allowed = ", ".join(sorted(_P_ALLOWED))
            raise RLMReplError(f"P.{node.attr} is not available; allowed: {allowed}")
        return getattr(self._corpus, node.attr)

    def _eval_call(self, node: ast.Call) -> Any:
        if isinstance(node.func, ast.Name):
            if node.func.id == "len":
                if node.keywords:
                    raise RLMReplError("len() does not accept keyword arguments")
                if len(node.args) != 1:
                    raise RLMReplError("len() requires exactly one argument")
                return len(self._eval(node.args[0]))
            if node.func.id == "llm_batch":
                return self._eval_llm_batch(node)
            raise RLMReplError(f"unknown function: {node.func.id!r}")
        if isinstance(node.func, ast.Attribute):
            value = self._eval(node.func.value)
            if value is not self._corpus:
                raise RLMReplError("method calls are only allowed on P")
            if node.func.attr not in _P_ALLOWED:
                raise RLMReplError(f"P.{node.func.attr} is not available")
            method = getattr(self._corpus, node.func.attr)
            args = [self._eval(arg) for arg in node.args]
            kwargs = {kw.arg: self._eval(kw.value) for kw in node.keywords if kw.arg is not None}
            try:
                return method(*args, **kwargs)
            except TypeError as exc:
                raise RLMReplError(f"P.{node.func.attr}(...) {exc}") from exc
        raise RLMReplError("call target must be len, llm_batch, or a P method")

    def _eval_llm_batch(self, node: ast.Call) -> BatchCommand:
        if node.keywords:
            raise RLMReplError("llm_batch() only accepts positional prompt strings")
        prompts: list[str] = []
        for arg in node.args:
            value = self._eval(arg)
            if isinstance(value, str):
                prompts.append(value)
            elif isinstance(value, (list, tuple)):
                prompts.extend(value)
            else:
                raise RLMReplError("llm_batch() prompts must be strings or a list of strings")
        if not prompts:
            raise RLMReplError("llm_batch() requires at least one prompt")
        for prompt in prompts:
            if not isinstance(prompt, str) or not prompt.strip():
                raise RLMReplError("llm_batch() prompts must be non-empty strings")
        return self._llm_batch(prompts)

    def _lookup(self, name: str) -> Any:
        if name == "P":
            return self._corpus
        if name == "len":
            return len
        if name in {"True", "False", "None"}:
            return {"True": True, "False": False, "None": None}[name]
        raise RLMReplError(f"name {name!r} is not allowed; available: P, len, llm_batch")
