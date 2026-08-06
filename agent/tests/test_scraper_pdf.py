"""
test_scraper_pdf.py — tests for the local PDF path in scraper.py.

The PDF path downloads a PDF URL and converts it to Markdown locally via
pdf_inspector, falling back to the remote layer chain on any failure.
"""

import pytest

from scraper import (
    _is_pdf_url,
    _looks_like_pdf,
    _scrape_pdf_local,
    scrape_docs,
)

pytest.importorskip("pdf_inspector")

from test_pdf_inspector import _make_text_pdf


class _FakeResponse:
    def __init__(self, content: bytes, content_type: str = "application/pdf"):
        self.content = content
        self.headers = {"Content-Type": content_type}

    def raise_for_status(self):
        pass


def test_is_pdf_url_detects_pdf_paths():
    assert _is_pdf_url("https://example.com/docs/manual.pdf")
    assert _is_pdf_url("https://example.com/manual.PDF?download=1")
    assert not _is_pdf_url("https://example.com/docs/manual.html")
    assert not _is_pdf_url("https://example.com/docs/manual.pdfx")


def test_looks_like_pdf_checks_content_type():
    assert _looks_like_pdf({"Content-Type": "application/pdf"})
    assert _looks_like_pdf({"Content-Type": "Application/PDF; charset=binary"})
    assert not _looks_like_pdf({})
    assert not _looks_like_pdf({"Content-Type": "text/html"})


def test_scrape_pdf_local_converts_pdf_url(monkeypatch):
    pdf_bytes = _make_text_pdf()

    def fake_get(url, timeout=60):
        assert url == "https://example.com/manual.pdf"
        return _FakeResponse(pdf_bytes)

    monkeypatch.setattr("scraper.requests.get", fake_get)
    md = _scrape_pdf_local("https://example.com/manual.pdf")
    assert md
    assert "Hello pdf-inspector" in md


def test_scrape_pdf_local_skips_non_pdf_url(monkeypatch):
    def fake_get(url, timeout=60):
        raise AssertionError("must not download a non-PDF URL")

    monkeypatch.setattr("scraper.requests.get", fake_get)
    assert _scrape_pdf_local("https://example.com/page.html") is None


def test_scrape_pdf_local_falls_back_on_wrong_content_type(monkeypatch):
    pdf_bytes = _make_text_pdf()

    def fake_get(url, timeout=60):
        return _FakeResponse(pdf_bytes, content_type="text/html")

    monkeypatch.setattr("scraper.requests.get", fake_get)
    assert _scrape_pdf_local("https://example.com/manual.pdf") is None


def test_scrape_pdf_local_falls_back_on_malformed_pdf(monkeypatch):
    def fake_get(url, timeout=60):
        return _FakeResponse(b"%PDF-1.4 garbage not a real pdf")

    monkeypatch.setattr("scraper.requests.get", fake_get)
    assert _scrape_pdf_local("https://example.com/manual.pdf") is None


def test_scrape_docs_uses_local_pdf_path(monkeypatch):
    """A .pdf URL is converted locally before any remote layer runs."""
    pdf_bytes = _make_text_pdf()

    def fake_get(url, timeout=60):
        return _FakeResponse(pdf_bytes)

    monkeypatch.setattr("scraper.requests.get", fake_get)
    md = scrape_docs("https://example.com/manual.pdf")
    assert "Hello pdf-inspector" in md
    assert not md.startswith("[scraper] Failed")
