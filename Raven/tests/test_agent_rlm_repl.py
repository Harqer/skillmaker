"""RLM REPL sandbox: allowlisted expression evaluation over the corpus ``P``."""

from __future__ import annotations

import pytest

from raven.agent.rlm.corpus import RLMCorpus, merge_pages
from raven.agent.rlm.repl import BatchCommand, RLMRepl, RLMReplError

PAGES = {
    "https://docs.example.com/api": ("# API Reference\n\n## Endpoints\n\n- GET /v1/users\n- POST /v1/items\n"),
    "https://docs.example.com/guide": "# Getting Started\n\n## Setup\n\nInstall via pip.\n",
}


@pytest.fixture
def corpus() -> RLMCorpus:
    return RLMCorpus(merge_pages(PAGES), PAGES)


@pytest.fixture
def repl(corpus) -> RLMRepl:
    return RLMRepl(corpus, llm_batch=BatchCommand)


def test_repl_len_and_slice(repl, corpus):
    assert repl.evaluate("len(P)") == len(corpus)
    assert repl.evaluate("P[0:5]") == corpus[0:5]


def test_repl_page_helpers(repl):
    assert repl.evaluate("P.page_count") == 2
    assert "https://docs.example.com/api" in repl.evaluate("P.urls()")
    assert repl.evaluate("P.page('https://docs.example.com/api')").startswith("# API")


def test_repl_search_and_sections(repl):
    matches = repl.evaluate("P.search('GET /v1/users')")
    assert len(matches) == 1
    assert matches[0]["page"] == "https://docs.example.com/api"
    sections = repl.evaluate("P.sections()")
    assert all(s["chars"] >= 0 for s in sections)


def test_repl_len_of_method_result(repl):
    assert repl.evaluate("len(P.search('the'))") >= 0
    assert repl.evaluate("len(P.chunk(50))") >= 1
    assert repl.evaluate("P.count('Install') >= 1") is True


def test_repl_llm_batch_returns_command(repl):
    command = repl.evaluate("llm_batch(['q1', 'q2'])")
    assert isinstance(command, BatchCommand)
    assert command.prompts == ["q1", "q2"]


@pytest.mark.parametrize(
    "code",
    [
        "import os",
        "x = 1",
        "open('/etc/passwd')",
        "P.__class__",
        "P.foo",
        "os.environ",
        "getattr(P, 'read')",
        "object()",
        "lambda: 1",
        "[i for i in range(3)]",
        "P.read('x')[:10].upper()",
        "llm_batch()",
        "llm_batch([123])",
    ],
)
def test_repl_rejects_unsafe_expressions(repl, code):
    with pytest.raises(RLMReplError):
        repl.evaluate(code)


def test_repl_empty_expression(repl):
    with pytest.raises(RLMReplError):
        repl.evaluate("")
    with pytest.raises(RLMReplError):
        repl.evaluate("   ")
