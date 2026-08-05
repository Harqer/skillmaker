"""
test_pdf_inspector.py — tests for the vendored pdf-inspector Python binding.

Generates a minimal text-based PDF on the fly (no fixture files) and verifies
that pdf-inspector converts it to clean Markdown locally.
"""

import os
import tempfile

import pytest

pdf_inspector = pytest.importorskip("pdf_inspector")


def _make_text_pdf(text: str = "Hello pdf-inspector") -> bytes:
    """Build a minimal one-page text-based PDF with a correct xref table."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream_data = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode("latin-1")
    objects.append(
        b"<< /Length %d >>\nstream\n" % len(stream_data) + stream_data + b"\nendstream"
    )

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += b"%d 0 obj\n" % i
        pdf += obj
        pdf += b"\nendobj\n"

    xref_offset = len(pdf)
    pdf += b"xref\n0 %d\n" % (len(objects) + 1)
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += b"%010d 00000 n \n" % off
    pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1)
    pdf += b"startxref\n%d\n%%%%EOF\n" % xref_offset
    return bytes(pdf)


def test_process_pdf_bytes_converts_text_to_markdown():
    result = pdf_inspector.process_pdf_bytes(_make_text_pdf())
    assert result.pdf_type == "text_based"
    assert result.page_count == 1
    assert result.confidence > 0.0
    assert result.markdown
    assert "Hello pdf-inspector" in result.markdown


def test_process_pdf_from_file():
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(_make_text_pdf())
        path = f.name
    try:
        result = pdf_inspector.process_pdf(path)
        assert result.markdown
        assert "Hello pdf-inspector" in result.markdown
    finally:
        os.unlink(path)


def test_extract_text_bytes_returns_text():
    text = pdf_inspector.extract_text_bytes(_make_text_pdf())
    assert isinstance(text, str)
    assert "Hello pdf-inspector" in text


def test_non_pdf_bytes_raise():
    with pytest.raises(ValueError):
        pdf_inspector.process_pdf_bytes(b"this is not a pdf")
