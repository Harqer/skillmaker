"""RLM corpus variable ``P``: page-aware access, search, sections, chunking."""

from __future__ import annotations

import json

from raven.agent.rlm.corpus import RLMCorpus, load_corpus_file, merge_pages

PAGES = {
    "https://docs.example.com/api": (
        "# API Reference\n\n## Endpoints\n\n- GET /v1/users\n- POST /v1/items\n\n"
        "Authentication is required for every request.\n"
    ),
    "https://docs.example.com/guide": "# Getting Started\n\n## Setup\n\nInstall via pip.\n",
}


def test_merge_pages_wraps_each_page_in_header():
    merged = merge_pages(PAGES)
    assert "## Page: https://docs.example.com/api" in merged
    assert "## Page: https://docs.example.com/guide" in merged
    assert "GET /v1/users" in merged


def test_load_corpus_file_json_pages(tmp_path):
    path = tmp_path / "corpus.json"
    path.write_text(json.dumps(PAGES), encoding="utf-8")
    text, pages = load_corpus_file(path)
    assert pages == PAGES
    assert text == merge_pages(PAGES)


def test_load_corpus_file_plain_text(tmp_path):
    path = tmp_path / "corpus.md"
    path.write_text("# Plain\n\ndoc body\n", encoding="utf-8")
    text, pages = load_corpus_file(path)
    assert pages == {}
    assert text.startswith("# Plain")


def _corpus() -> RLMCorpus:
    return RLMCorpus(merge_pages(PAGES), PAGES)


def test_corpus_length_and_slicing():
    corpus = _corpus()
    assert len(corpus) == corpus.length == corpus.size
    assert corpus[0:5] == merge_pages(PAGES)[0:5]


def test_corpus_page_lookup():
    corpus = _corpus()
    assert corpus.page_count == 2
    assert set(corpus.urls()) == set(PAGES)
    assert corpus.read("https://docs.example.com/api") == PAGES["https://docs.example.com/api"]
    assert corpus.page("https://missing.example.com") is None


def test_corpus_search_returns_snippets_with_page():
    corpus = _corpus()
    matches = corpus.search(r"GET /v1/users")
    assert len(matches) == 1
    assert matches[0]["page"] == "https://docs.example.com/api"
    assert "GET /v1/users" in matches[0]["snippet"]
    assert matches[0]["line"] >= 1


def test_corpus_search_respects_max_bound():
    corpus = _corpus()
    assert len(corpus.search(r"API|the|pip")) >= 3
    matches = corpus.search(r"API|the|pip", max=2)
    assert len(matches) == 2


def test_corpus_find_and_count():
    corpus = _corpus()
    text = merge_pages(PAGES)
    expected = [i for i in range(len(text)) if text.startswith("API", i)]
    assert corpus.find("API") == expected
    assert corpus.count("API") == len(expected)


def test_corpus_headings_and_sections():
    corpus = _corpus()
    headings = corpus.headings()
    assert any(h.startswith("## ") for h in headings)
    assert any(h == "# API Reference" for h in headings)
    level2 = corpus.headings(level=2)
    assert all(h.startswith("## ") for h in level2)
    sections = corpus.sections()
    assert sections
    assert all("start" in s and "chars" in s for s in sections)
    assert sections[0]["page"] == "https://docs.example.com/api"


def test_corpus_chunk_bounded():
    text = merge_pages(PAGES) * 5
    corpus = RLMCorpus(text, PAGES, max_chunks=2)
    chunks = corpus.chunk(size=256)
    assert len(chunks) == 2
    assert chunks[0]["text"] == text[chunks[0]["start"] : chunks[0]["end"]]


def test_corpus_lines():
    corpus = _corpus()
    lines = corpus.lines(0, 2)
    assert lines == "\n".join(merge_pages(PAGES).splitlines()[0:2])
