"""The external corpus variable ``P`` available inside the RLM REPL.

The corpus is the raw markdown produced by the Firecrawl/Scraper stage
(``agent.scraper.bulk_scrape_docs`` returns ``dict[url, markdown]``). It is
exposed read-only as ``P`` with helpers for slicing, regex search, heading
structure, section extraction, and chunking so the root model fetches the exact
slices it needs instead of receiving a truncated dump.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_PAGE_RE = re.compile(r"(?m)^## Page: (.+?)\s*$")
_HEADING_RE = re.compile(r"(?m)^(#{1,6})\s+(.+?)\s*$")


def merge_pages(pages: dict[str, str]) -> str:
    """Merge ``{url: markdown}`` into one ``P`` document with page headers."""
    if not pages:
        return ""
    blocks = [f"## Page: {url}\n\n{markdown.strip()}" for url, markdown in pages.items()]
    return "\n\n".join(blocks)


def load_corpus_file(path: str | Path) -> tuple[str, dict[str, str]]:
    """Load a corpus file into ``(text, pages)``.

    A JSON object mapping URL -> markdown string is treated as pages and merged
    into a single ``P`` document; anything else is used verbatim as ``P``.
    """
    raw = Path(path).read_text(encoding="utf-8")
    stripped = raw.lstrip()
    if not stripped.startswith("{"):
        return raw, {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return raw, {}
    if isinstance(data, dict) and data and all(isinstance(v, str) for v in data.values()):
        return merge_pages(data), dict(data)
    return raw, {}


def _snippet(text: str, start: int, end: int, radius: int = 90) -> str:
    left = text[max(0, start - radius) : start]
    right = text[end : end + radius]
    core = text[start:end]
    return ("..." if left else "") + core + ("..." if right else "")


class RLMCorpus:
    """Read-only view of the corpus exposed to the REPL as ``P``."""

    def __init__(
        self,
        corpus: str,
        pages: dict[str, str] | None = None,
        *,
        max_matches: int = 20,
        max_chunks: int = 50,
    ) -> None:
        self._text = corpus or ""
        self._pages = dict(pages or {})
        self._max_matches = max_matches
        self._max_chunks = max_chunks
        self._page_offsets = [(match.start(), match.group(1).strip()) for match in _PAGE_RE.finditer(self._text)]

    def _page_at(self, offset: int) -> str | None:
        current = None
        for start, url in self._page_offsets:
            if start > offset:
                break
            current = url
        return current

    @property
    def length(self) -> int:
        return len(self._text)

    @property
    def size(self) -> int:
        return len(self._text)

    @property
    def page_count(self) -> int:
        return len(self._pages)

    def __len__(self) -> int:
        return len(self._text)

    def __getitem__(self, key: int | slice) -> str:
        return self._text[key]

    def urls(self) -> list[str]:
        return list(self._pages)

    def page(self, url: str) -> str | None:
        return self._pages.get(url)

    def read(self, url: str) -> str | None:
        return self._pages.get(url)

    def find(self, needle: str) -> list[int]:
        """Character offsets of every occurrence of ``needle``."""
        return [m.start() for m in re.finditer(re.escape(needle), self._text)]

    def count(self, needle: str) -> int:
        return len(re.findall(re.escape(needle), self._text))

    def search(self, pattern: str, max: int | None = None) -> list[dict[str, Any]]:
        """Regex search over ``P``; returns matches with offsets and snippets."""
        limit = self._max_matches if max is None else max
        results: list[dict[str, Any]] = []
        for match in re.finditer(pattern, self._text):
            if len(results) >= limit:
                break
            start = match.start()
            line = self._text.count("\n", 0, start) + 1
            results.append(
                {
                    "start": start,
                    "end": match.end(),
                    "line": line,
                    "match": match.group(0),
                    "snippet": _snippet(self._text, start, match.end()),
                    "page": self._page_at(start),
                }
            )
        return results

    def headings(self, level: int | None = None) -> list[str]:
        """Markdown heading texts, optionally filtered by heading level."""
        results = []
        for match in _HEADING_RE.finditer(self._text):
            depth = len(match.group(1))
            if level is not None and depth != level:
                continue
            results.append(f"{'#' * depth} {match.group(2).strip()}")
        return results

    def sections(self) -> list[dict[str, Any]]:
        """Split ``P`` into heading-anchored sections with char ranges."""
        anchors = [
            (match.start(), len(match.group(1)), match.group(2).strip()) for match in _HEADING_RE.finditer(self._text)
        ]
        sections: list[dict[str, Any]] = []
        for index, (start, level, heading) in enumerate(anchors):
            end = anchors[index + 1][0] if index + 1 < len(anchors) else len(self._text)
            sections.append(
                {
                    "heading": heading,
                    "level": level,
                    "start": start,
                    "end": end,
                    "chars": end - start,
                    "page": self._page_at(start),
                }
            )
        return sections

    def chunk(self, size: int = 4000, overlap: int = 0) -> list[dict[str, int | str]]:
        """Character chunking of ``P`` with optional overlap (bounded)."""
        size = max(256, int(size))
        overlap = max(0, min(int(overlap), size // 2))
        chunks: list[dict[str, int | str]] = []
        start = 0
        while start < len(self._text) and len(chunks) < self._max_chunks:
            end = min(start + size, len(self._text))
            chunks.append({"start": start, "end": end, "text": self._text[start:end]})
            if end >= len(self._text):
                break
            start = max(end - overlap, start + 1)
        return chunks

    def lines(self, start: int, end: int | None = None) -> str:
        """Return a 0-indexed line range of ``P`` as text."""
        lines = self._text.splitlines()
        return "\n".join(lines[start:end])
