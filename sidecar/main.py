"""
OpenFeeder Sidecar — FastAPI Application

A Docker sidecar that crawls a target website, chunks and embeds the content
into ChromaDB, and exposes it via the OpenFeeder protocol.

Environment variables:
    SITE_URL          — Required. Base URL of the site to crawl.
    CRAWL_INTERVAL    — Seconds between re-crawls (default: 3600).
    MAX_PAGES         — Maximum pages to crawl (default: 500).
    PORT              — HTTP listen port (default: 8080).
    EMBEDDING_MODEL   — Sentence-transformer model (default: all-MiniLM-L6-v2).
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import sys
import time
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

from chunker import chunk_html
from crawler import crawl
from indexer import Indexer

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SITE_URL = os.environ.get("SITE_URL", "")
CRAWL_INTERVAL = int(os.environ.get("CRAWL_INTERVAL", "3600"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "500"))
PORT = int(os.environ.get("PORT", "8080"))
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

if not SITE_URL:
    sys.exit("FATAL: SITE_URL environment variable is required.")

SITE_NAME = urlparse(SITE_URL).netloc
SITE_LANG = os.environ.get("SITE_LANG", "en")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("openfeeder")

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

indexer: Indexer | None = None
scheduler: AsyncIOScheduler | None = None
_last_crawl_ts: float = 0.0
_crawl_running = False


async def run_crawl() -> None:
    """Execute a full crawl → chunk → index pipeline."""
    global _last_crawl_ts, _crawl_running

    if _crawl_running:
        logger.warning("Crawl already in progress, skipping.")
        return

    _crawl_running = True
    logger.info("Starting crawl of %s (max %d pages)…", SITE_URL, MAX_PAGES)

    try:
        result = await crawl(SITE_URL, max_pages=MAX_PAGES)
        logger.info("Crawled %d pages, %d errors.", len(result.pages), len(result.errors))

        parsed_pages = []
        for page in result.pages:
            parsed = chunk_html(page.url, page.html)
            parsed_pages.append(parsed)

        total_chunks = indexer.index_pages(parsed_pages)
        _last_crawl_ts = time.time()
        logger.info("Indexed %d total chunks across %d pages.", total_chunks, len(parsed_pages))

        if result.errors:
            for err in result.errors[:10]:
                logger.warning("Crawl error: %s", err)
    except Exception:
        logger.exception("Crawl failed")
    finally:
        _crawl_running = False


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the indexer, run the initial crawl, and schedule periodic re-crawls."""
    global indexer, scheduler

    indexer = Indexer(model_name=EMBEDDING_MODEL)

    # Initial crawl in background so the server starts responding immediately
    asyncio.create_task(run_crawl())

    # Schedule periodic re-crawls
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_crawl, "interval", seconds=CRAWL_INTERVAL)
    scheduler.start()
    logger.info("Scheduled re-crawl every %d seconds.", CRAWL_INTERVAL)

    yield

    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="OpenFeeder Sidecar",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Middleware — add OpenFeeder headers to every response
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_openfeeder_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-OpenFeeder"] = "1.0"
    return response


# ---------------------------------------------------------------------------
# Discovery endpoint
# ---------------------------------------------------------------------------

@app.get("/.well-known/openfeeder.json")
async def discovery():
    """OpenFeeder discovery document (spec §2)."""
    return {
        "version": "1.0",
        "site": {
            "name": SITE_NAME,
            "url": SITE_URL,
            "language": SITE_LANG,
            "description": f"OpenFeeder sidecar for {SITE_NAME}",
        },
        "feed": {
            "endpoint": "/api/openfeeder",
            "type": "paginated",
        },
        "capabilities": ["search", "embeddings"],
        "contact": None,
    }


# ---------------------------------------------------------------------------
# Content endpoint
# ---------------------------------------------------------------------------

@app.get("/api/openfeeder")
async def content(
    url: str | None = Query(None, description="Relative path of the page to fetch"),
    q: str | None = Query(None, description="Semantic search query"),
    page: int = Query(1, ge=1, description="Page number (index mode)"),
    limit: int = Query(10, ge=1, le=50, description="Max chunks / items to return"),
):
    """
    OpenFeeder content endpoint (spec §3).

    - No params or just page/limit → paginated index of all content.
    - url param → chunks for that specific page.
    - q param → semantic search across all content.
    """

    cache_age = int(time.time() - _last_crawl_ts) if _last_crawl_ts else None
    cached = _last_crawl_ts > 0

    # ── Index mode (no url) ──────────────────────────────────────────
    if url is None and q is None:
        items, total = indexer.get_all_pages(page=page, limit=limit)
        total_pages = max(1, math.ceil(total / limit))
        return JSONResponse(
            content={
                "schema": "openfeeder/1.0",
                "type": "index",
                "page": page,
                "total_pages": total_pages,
                "items": items,
            },
            headers={"X-OpenFeeder-Cache": "HIT" if cached else "MISS"},
        )

    # ── Search mode (q param) ───────────────────────────────────────
    if q:
        results = indexer.search(query=q, limit=limit, url_filter=url)
        if not results:
            return _error_response("NOT_FOUND", "No results found for query.", 404)

        # Group by URL for response — use first result's page metadata
        first = results[0]
        page_meta = indexer.get_page_meta(first.url) or {}

        chunks = [
            {
                "id": r.chunk_id,
                "text": r.text,
                "type": r.chunk_type,
                "relevance": r.relevance,
            }
            for r in results
        ]

        return JSONResponse(
            content={
                "schema": "openfeeder/1.0",
                "url": first.url,
                "title": page_meta.get("title", first.title),
                "author": page_meta.get("author") or None,
                "published": page_meta.get("published") or None,
                "updated": page_meta.get("updated") or None,
                "language": page_meta.get("language", SITE_LANG),
                "summary": page_meta.get("summary", ""),
                "chunks": chunks,
                "meta": {
                    "total_chunks": len(chunks),
                    "returned_chunks": len(chunks),
                    "cached": cached,
                    "cache_age_seconds": cache_age,
                },
            },
            headers={"X-OpenFeeder-Cache": "HIT" if cached else "MISS"},
        )

    # ── Single page mode (url param, no q) ──────────────────────────
    # Resolve the url parameter to a full URL for lookup
    full_url = url if url.startswith("http") else SITE_URL.rstrip("/") + "/" + url.lstrip("/")

    page_meta = indexer.get_page_meta(full_url)
    if not page_meta:
        return _error_response("NOT_FOUND", f"Page not found: {url}", 404)

    chunks = indexer.get_chunks_for_url(full_url, limit=limit)

    return JSONResponse(
        content={
            "schema": "openfeeder/1.0",
            "url": full_url,
            "title": page_meta.get("title", ""),
            "author": page_meta.get("author") or None,
            "published": page_meta.get("published") or None,
            "updated": page_meta.get("updated") or None,
            "language": page_meta.get("language", SITE_LANG),
            "summary": page_meta.get("summary", ""),
            "chunks": chunks,
            "meta": {
                "total_chunks": page_meta.get("chunk_count", len(chunks)),
                "returned_chunks": len(chunks),
                "cached": cached,
                "cache_age_seconds": cache_age,
            },
        },
        headers={"X-OpenFeeder-Cache": "HIT" if cached else "MISS"},
    )


# ---------------------------------------------------------------------------
# Error helper
# ---------------------------------------------------------------------------

def _error_response(code: str, message: str, status: int = 400) -> JSONResponse:
    """Return a spec-compliant error response (spec §8)."""
    return JSONResponse(
        status_code=status,
        content={
            "schema": "openfeeder/1.0",
            "error": {
                "code": code,
                "message": message,
            },
        },
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "crawl_running": _crawl_running, "last_crawl": _last_crawl_ts}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="info")
