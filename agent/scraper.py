"""
scraper.py — Multi-page markdown aggregator for Skill Maker

Priority chain for a given URL:
  0. Local pdf_inspector → PDF URLs (path ends in .pdf) are downloaded and
     converted to Markdown locally via the vendored Rust pdf-inspector binding
     (fast, no OCR for text-based PDFs). Falls back to the layers below on any
     failure.
  1. Jina Reader API     → single-page markdown (fast, preferred)
  2. SimpleScraper        /v1/extract → single-page markdown (fast)
  3. Firecrawl  /v1/scrape → single-page markdown (fallback)
  4. Firecrawl  /v1/crawl  → multi-page async crawl (deep-docs fallback)

Bulk entry point:
  - bulk_scrape_docs(urls) → dict[str, str] — scrapes ALL urls in parallel using
    the full layer chain per URL. Each result is a merged markdown string.

All scraped content is returned as markdown strings ready to be passed to the
LLM for skill generation, stored in Databricks vector embeddings, and fed to
SkillOpt as training context.

Secrets are injected via Infisical (SIMPLESCRAPER_API_KEY, FIRECRAWL_API_KEY, JINA_API_KEY).
No .env usage — this is a public repo.
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

import requests
from config import FIRECRAWL_API_KEY, JINA_API_KEY, SIMPLESCRAPER_API_KEY
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

# ── Constants ─────────────────────────────────────────────────────────────────

_SIMPLESCRAPER_EXTRACT = "https://api.simplescraper.io/v1/extract"
_FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v1/scrape"
_FIRECRAWL_CRAWL = "https://api.firecrawl.dev/v1/crawl"
_FIRECRAWL_CRAWL_GET = "https://api.firecrawl.dev/v1/crawl/{job_id}"

_CRAWL_POLL_INTERVAL = 3  # seconds between status checks
_CRAWL_MAX_WAIT = 120  # seconds before giving up on crawl job
_CRAWL_MAX_PAGES = 30  # cap pages to avoid massive context windows
_REQUEST_TIMEOUT = 60  # seconds for all HTTP calls


# ── Layer 0: Local PDF → Markdown (vendored pdf-inspector) ───────────────────


def _is_pdf_url(url: str) -> bool:
    """True when the URL path ends in `.pdf` (case-insensitive)."""
    return urlparse(url).path.lower().endswith(".pdf")


def _looks_like_pdf(headers: dict) -> bool:
    """True when an HTTP response advertises `application/pdf` content."""
    ctype = (headers.get("Content-Type") or "").lower()
    return "application/pdf" in ctype


def _scrape_pdf_local(url: str) -> str | None:
    """
    Local PDF → Markdown conversion (no OCR for text-based PDFs).

    Activates when the target URL is a PDF: the URL path ends in `.pdf` (or the
    downloaded response indicates `application/pdf`). The bytes are converted
    to Markdown locally via the vendored pdf-inspector Rust binding
    (agent/vendor/pdf-inspector). Returns None on any failure or when the
    target is not a PDF, so callers fall through to the remote layer chain.
    """
    if not _is_pdf_url(url):
        return None

    try:
        import pdf_inspector
    except ImportError:
        print("[scraper] pdf_inspector not installed — falling back to remote layers.")
        return None

    try:
        print(f"[scraper] Local pdf_inspector → {url}")
        resp = requests.get(url, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        if not _looks_like_pdf(resp.headers):
            print(
                "[scraper] URL ends in .pdf but response is not application/pdf — falling back."
            )
            return None

        result = pdf_inspector.process_pdf_bytes(resp.content)
        md = (result.markdown or "").strip()
        if not md:
            print(
                "[scraper] pdf_inspector produced no markdown (scanned/OCR needed?) — falling back."
            )
            return None
        print(
            f"[scraper] Local pdf_inspector ✓  ({len(md):,} chars, type={result.pdf_type})"
        )
        return md
    except Exception as exc:
        print(f"[scraper] Local PDF conversion failed: {exc}")
        return None


# ── Layer 1: Jina Reader API ──────────────────────────────────────────────────


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.exceptions.RequestException, requests.exceptions.Timeout)
    ),
)
def _scrape_jina_reader(url: str) -> str | None:
    """Single-page markdown extraction via Jina Reader API (https://r.jina.ai/)."""
    if not JINA_API_KEY:
        print("[scraper] JINA_API_KEY not set — skipping Jina Reader.")
        return None

    print(f"[scraper] Jina Reader → {url}")
    jina_url = f"https://r.jina.ai/{url}"
    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "X-With-Generated-Alt": "true",
        "X-Respond-With": "markdown",
    }
    resp = requests.get(jina_url, headers=headers, timeout=_REQUEST_TIMEOUT)
    resp.raise_for_status()
    md = resp.text
    if md and len(md.strip()) > 50:
        print(f"[scraper] Jina Reader ✓  ({len(md):,} chars)")
        return md
    return None


# ── Layer 2: SimpleScraper /v1/extract ───────────────────────────────────────


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.exceptions.RequestException, requests.exceptions.Timeout)
    ),
)
def _scrape_simplescraper(url: str) -> str | None:
    """Single-page extraction via SimpleScraper (primary)."""
    if not SIMPLESCRAPER_API_KEY:
        print("[scraper] SIMPLESCRAPER_API_KEY not set — skipping SimpleScraper.")
        return None

    print(f"[scraper] SimpleScraper → {url}")
    resp = requests.post(
        _SIMPLESCRAPER_EXTRACT,
        headers={
            "Authorization": f"Bearer {SIMPLESCRAPER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"url": url, "extract_format": "markdown"},
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()

    # API returns {"markdown": "..."} or {"data": {"markdown": "..."}}
    md = data.get("markdown") or data.get("data", {}).get("markdown")
    if md:
        print(f"[scraper] SimpleScraper ✓  ({len(md):,} chars)")
        return md

    print("[scraper] SimpleScraper: no markdown field in response.")
    return None


# ── Layer 2: Firecrawl /v1/scrape (single page) ──────────────────────────────


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.exceptions.RequestException, requests.exceptions.Timeout)
    ),
)
def _scrape_firecrawl_single(url: str) -> str | None:
    """Single-page markdown via Firecrawl /v1/scrape (first fallback)."""
    if not FIRECRAWL_API_KEY:
        print("[scraper] FIRECRAWL_API_KEY not set — skipping Firecrawl scrape.")
        return None

    print(f"[scraper] Firecrawl /scrape → {url}")
    resp = requests.post(
        _FIRECRAWL_SCRAPE,
        headers={"Authorization": f"Bearer {FIRECRAWL_API_KEY}"},
        json={"url": url, "formats": ["markdown"]},
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("success"):
        md = data.get("data", {}).get("markdown")
        if md:
            print(f"[scraper] Firecrawl /scrape ✓  ({len(md):,} chars)")
            return md

    print("[scraper] Firecrawl /scrape: no markdown or success=False.")
    return None


# ── Layer 3: Firecrawl /v1/crawl (multi-page async) ──────────────────────────


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(
        (requests.exceptions.RequestException, requests.exceptions.Timeout)
    ),
)
def _scrape_firecrawl_crawl(url: str) -> str | None:
    """
    Multi-page async crawl via Firecrawl /v1/crawl (deep-docs fallback).

    Kicks off a crawl job, polls until complete, then aggregates all page
    markdowns into a single string separated by '---' section dividers.
    """
    if not FIRECRAWL_API_KEY:
        print("[scraper] FIRECRAWL_API_KEY not set — skipping Firecrawl crawl.")
        return None

    print(f"[scraper] Firecrawl /crawl (async multi-page) → {url}")
    headers = {"Authorization": f"Bearer {FIRECRAWL_API_KEY}"}

    # 1. Submit crawl job
    resp = requests.post(
        _FIRECRAWL_CRAWL,
        headers=headers,
        json={
            "url": url,
            "limit": _CRAWL_MAX_PAGES,
            "scrapeOptions": {"formats": ["markdown"]},
            "ignoreSitemap": False,
            "allowBackwardLinks": False,
        },
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    job_id = resp.json().get("id")
    if not job_id:
        print("[scraper] Firecrawl /crawl: no job id returned.")
        return None
    print(f"[scraper] Firecrawl /crawl job started: {job_id}")

    # 2. Poll for completion with local retries on transient failures
    status_url = _FIRECRAWL_CRAWL_GET.format(job_id=job_id)
    deadline = time.time() + _CRAWL_MAX_WAIT
    pages: list[dict] = []

    while time.time() < deadline:
        time.sleep(_CRAWL_POLL_INTERVAL)

        # Retry individual poll on transient failure (do not break the whole crawl)
        status_data = None
        for poll_attempt in range(3):
            try:
                status_resp = requests.get(
                    status_url, headers=headers, timeout=_REQUEST_TIMEOUT
                )
                status_resp.raise_for_status()
                status_data = status_resp.json()
                break
            except Exception as exc:
                if poll_attempt < 2:
                    print(
                        f"[scraper] Firecrawl poll error (attempt {poll_attempt + 1}/3): {exc}"
                    )
                    time.sleep(2)
                else:
                    print(f"[scraper] Firecrawl poll error after 3 attempts: {exc}")

        if status_data is None:
            # All poll retries failed — continue outer loop to try next interval
            continue

        job_status = status_data.get("status", "")
        print(
            f"[scraper] Firecrawl /crawl status: {job_status} "
            f"({status_data.get('completed', 0)}/{status_data.get('total', '?')} pages)"
        )

        if job_status == "completed":
            pages = status_data.get("data", [])
            break
        elif job_status in ("failed", "cancelled"):
            print(f"[scraper] Firecrawl /crawl job {job_status}.")
            return None
        # else: scraping / queued — keep polling

    if not pages:
        print("[scraper] Firecrawl /crawl: timed out or returned no pages.")
        return None

    # 3. Aggregate all pages into one markdown document
    sections: list[str] = []
    for page in pages:
        md = page.get("markdown", "").strip()
        meta = page.get("metadata", {})
        src = meta.get("sourceURL") or meta.get("url", "")
        if md:
            header = f"## Page: {src}\n\n" if src else ""
            sections.append(header + md)

    if not sections:
        print("[scraper] Firecrawl /crawl: pages had no markdown content.")
        return None

    combined = "\n\n---\n\n".join(sections)
    print(
        f"[scraper] Firecrawl /crawl ✓  ({len(pages)} pages, {len(combined):,} chars)"
    )
    return combined


# ── Public API ────────────────────────────────────────────────────────────────


def scrape_docs(url: str) -> str:
    """
    Main entry point. Tries each layer in order and returns the first
    successful markdown result. Always returns a non-empty string.

    Layer order:
      0. Local pdf_inspector (PDF URLs only)
      1. Jina Reader API    (fast markdown reader)
      2. SimpleScraper      (single page extraction)
      3. Firecrawl /scrape  (single page fallback)
      4. Firecrawl /crawl   (multi-page deep crawl, last resort)
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        err = f"[scraper] Invalid URL (must be http/https): {url}"
        print(err)
        return err

    layer_names = {
        _scrape_pdf_local: "local_pdf",
        _scrape_jina_reader: "jina_reader",
        _scrape_simplescraper: "simplescraper",
        _scrape_firecrawl_single: "firecrawl_scrape",
        _scrape_firecrawl_crawl: "firecrawl_crawl",
    }

    for scraper_fn in (
        _scrape_pdf_local,
        _scrape_jina_reader,
        _scrape_simplescraper,
        _scrape_firecrawl_single,
        _scrape_firecrawl_crawl,
    ):
        try:
            content = scraper_fn(url)
            if content:
                source = layer_names[scraper_fn]
                print(f"[scraper] Succeeded with {source}")
                return content
        except Exception as exc:
            print(f"[scraper] {layer_names[scraper_fn]} failed after retries: {exc}")
            continue

    return (
        f"[scraper] Failed to retrieve content from {url} "
        f"via local pdf_inspector, Jina Reader, SimpleScraper, "
        f"Firecrawl /scrape, or Firecrawl /crawl. "
        f"SkillOpt training data for this URL will be limited."
    )


def bulk_scrape_docs(urls: list[str], max_workers: int = 5) -> dict[str, str]:
    """
    Scrape ALL URLs in bulk using the full layer chain per URL.

    Each URL is processed in parallel via a thread pool.  For every URL the
    same fallback chain runs (local pdf_inspector → Jina → SimpleScraper →
    Firecrawl /scrape → Firecrawl /crawl) and the first successful markdown
    result is kept.

    Returns a dict mapping each input URL to its merged markdown string.
    URLs that failed all layers still have an entry with an error message
    so callers can distinguish "scraped but empty" from "not attempted".
    """
    results: dict[str, str] = {}

    def _scrape_one(u: str) -> tuple[str, str]:
        return u, scrape_docs(u)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_scrape_one, u): u for u in urls}
        for future in as_completed(futures):
            u = futures[future]
            try:
                url_out, md = future.result()
                results[url_out] = md
                print(
                    f"[scraper] bulk done ({len(results)}/{len(urls)}): {url_out} "
                    f"({len(md):,} chars)"
                )
            except Exception as exc:
                results[u] = f"[scraper] bulk scrape failed for {u}: {exc}"
                print(f"[scraper] bulk error for {u}: {exc}")

    return results


def scrape_docs_to_temp_store(url: str) -> dict:
    """
    NOTE: This function is currently unused (the SkillOpt pipeline references
    it in comments but does not call it). Kept for future structured use.

    Scrape a URL and return a structured result for downstream use.

    Returns:
        {
          "url": str,
          "markdown": str,
          "page_count": int,
          "source": "local_pdf" | "jina_reader" | "simplescraper" | "firecrawl_scrape" | "firecrawl_crawl" | "failed",
          "char_count": int,
        }

    This is the richer entry point used by the SkillOpt training pipeline
    to build skill_card training items from real scraped documentation.
    """
    result = {
        "url": url,
        "markdown": "",
        "page_count": 0,
        "source": "failed",
        "char_count": 0,
    }

    # Try each layer, record which succeeded
    content = _scrape_pdf_local(url)
    if content:
        result.update(
            markdown=content,
            source="local_pdf",
            page_count=1,
            char_count=len(content),
        )
        return result

    content = _scrape_jina_reader(url)
    if content:
        result.update(
            markdown=content,
            source="jina_reader",
            page_count=1,
            char_count=len(content),
        )
        return result

    content = _scrape_simplescraper(url)
    if content:
        result.update(
            markdown=content,
            source="simplescraper",
            page_count=1,
            char_count=len(content),
        )
        return result

    content = _scrape_firecrawl_single(url)
    if content:
        result.update(
            markdown=content,
            source="firecrawl_scrape",
            page_count=1,
            char_count=len(content),
        )
        return result

    content = _scrape_firecrawl_crawl(url)
    if content:
        page_count = content.count("## Page:") or 1
        result.update(
            markdown=content,
            source="firecrawl_crawl",
            page_count=page_count,
            char_count=len(content),
        )
        return result

    result["markdown"] = (
        f"Failed to scrape {url}. "
        f"All layers (local pdf_inspector, SimpleScraper, Firecrawl /scrape, Firecrawl /crawl) failed."
    )
    return result
