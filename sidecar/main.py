"""
OpenFeeder Sidecar — FastAPI Application

A Docker sidecar that crawls a target website, chunks and embeds the content
into ChromaDB, and exposes it via the OpenFeeder protocol.

Environment variables:
    SITE_URL                   — Required. Base URL of the site to crawl.
    CRAWL_INTERVAL             — Seconds between re-crawls (default: 3600).
    MAX_PAGES                  — Maximum pages to crawl (default: 500).
    PORT                       — HTTP listen port (default: 8080).
    EMBEDDING_MODEL            — Sentence-transformer model (default: all-MiniLM-L6-v2).
    OPENFEEDER_WEBHOOK_SECRET  — Optional. If set, POST /openfeeder/update requires
                                 Authorization: Bearer <secret>.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from analytics import Analytics, detect_bot
from chunker import chunk_html
from crawler import crawl
from indexer import Indexer
from sync_utils import (
    add_tombstone,
    encode_sync_token,
    get_tombstones_since,
    _load_tombstones,
    parse_since,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SITE_URL = os.environ.get("SITE_URL", "")
CRAWL_INTERVAL = int(os.environ.get("CRAWL_INTERVAL", "3600"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "500"))
PORT = int(os.environ.get("PORT", "8080"))
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
WEBHOOK_SECRET = os.environ.get("OPENFEEDER_WEBHOOK_SECRET", "")

ANALYTICS_PROVIDER = os.environ.get("ANALYTICS_PROVIDER", "none")
ANALYTICS_URL = os.environ.get("ANALYTICS_URL", "")
ANALYTICS_SITE_ID = os.environ.get("ANALYTICS_SITE_ID", "")
ANALYTICS_API_KEY = os.environ.get("ANALYTICS_API_KEY", "")

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

analytics = Analytics(ANALYTICS_PROVIDER, ANALYTICS_URL, ANALYTICS_SITE_ID, ANALYTICS_API_KEY)


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
    _load_tombstones()

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
async def discovery(request: Request):
    """OpenFeeder discovery document (spec §2)."""
    start_time = time.time()
    body = {
        "version": "1.0",
        "site": {
            "name": SITE_NAME,
            "url": SITE_URL,
            "language": SITE_LANG,
            "description": f"OpenFeeder sidecar for {SITE_NAME}",
        },
        "feed": {
            "endpoint": "/openfeeder",
            "type": "paginated",
        },
        "capabilities": ["search", "embeddings", "diff-sync"],
        "contact": None,
    }
    bot_name, bot_family = detect_bot(request.headers.get("user-agent", ""))
    await analytics.track({
        "hostname": SITE_NAME,
        "url": str(request.url),
        "bot_name": bot_name,
        "bot_family": bot_family,
        "endpoint": "discovery",
        "query": "",
        "intent": request.headers.get("x-openfeeder-intent", ""),
        "results": 0,
        "cached": False,
        "response_ms": int((time.time() - start_time) * 1000),
    })
    return body


# ---------------------------------------------------------------------------
# Content endpoint
# ---------------------------------------------------------------------------

@app.get("/openfeeder")
async def content(
    request: Request,
    url: str | None = Query(None, description="Relative path of the page to fetch"),
    q: str | None = Query(None, description="Semantic search query"),
    since: str | None = Query(None, description="RFC3339 datetime or sync_token for differential sync"),
    until: str | None = Query(None, description="RFC3339 datetime upper bound for differential sync date range"),
    page: int = Query(1, ge=1, description="Page number (index mode)"),
    limit: int = Query(10, ge=1, le=50, description="Max chunks / items to return"),
    min_score: float = Query(0.0, ge=0.0, le=1.0, description="Minimum relevance score (0.0–1.0). Filters out chunks below threshold. Only applies to search (?q=) mode."),
):
    """
    OpenFeeder content endpoint (spec §3).

    - No params or just page/limit → paginated index of all content.
    - url param → chunks for that specific page.
    - q param → semantic search across all content.
    - since param → differential sync (returns only changed content).
    - until param → upper date bound (combined with since for closed ranges).
    """
    start_time = time.time()
    bot_name, bot_family = detect_bot(request.headers.get("user-agent", ""))

    cache_age = int(time.time() - _last_crawl_ts) if _last_crawl_ts else None
    cached = _last_crawl_ts > 0

    async def _track(endpoint: str, result_count: int, is_cached: bool) -> None:
        await analytics.track({
            "hostname": SITE_NAME,
            "url": str(request.url),
            "bot_name": bot_name,
            "bot_family": bot_family,
            "endpoint": endpoint,
            "query": q or "",
            "intent": request.headers.get("x-openfeeder-intent", ""),
            "results": result_count,
            "cached": is_cached,
            "response_ms": int((time.time() - start_time) * 1000),
        })

    # ── Differential sync mode (?since= and/or ?until= without ?q=) ─────
    if (since or until) and not q:
        since_ts: float | None = None
        until_ts: float | None = None

        if since:
            since_ts = parse_since(since)
            if since_ts is None:
                return _error_response("INVALID_PARAM", "Invalid ?since= value. Provide an RFC3339 datetime or a valid sync_token.", 400)

        if until:
            until_ts = parse_since(until)
            if until_ts is None:
                return _error_response("INVALID_PARAM", "Invalid ?until= value. Provide an RFC3339 datetime.", 400)

        if since_ts is not None and until_ts is not None and until_ts < since_ts:
            return _error_response("INVALID_PARAM", "?until= must be after ?since=.", 400)

        added, updated = indexer.get_pages_in_range(since_ts, until_ts)
        deleted = get_tombstones_since(since_ts) if since_ts is not None else []

        as_of = datetime.now(timezone.utc).isoformat()
        since_iso = datetime.fromtimestamp(since_ts, tz=timezone.utc).isoformat() if since_ts is not None else None
        until_iso = datetime.fromtimestamp(until_ts, tz=timezone.utc).isoformat() if until_ts is not None else None
        token = encode_sync_token(as_of)

        sync_meta: dict = {
            "as_of": as_of,
            "sync_token": token,
            "counts": {
                "added": len(added),
                "updated": len(updated),
                "deleted": len(deleted),
            },
        }
        if since_iso is not None:
            sync_meta["since"] = since_iso
        if until_iso is not None:
            sync_meta["until"] = until_iso

        body = {
            "openfeeder_version": "1.0",
            "sync": sync_meta,
            "added": added,
            "updated": updated,
            "deleted": deleted,
        }

        total = len(added) + len(updated) + len(deleted)
        await _track("sync", total, cached)
        return JSONResponse(content=body, headers={"X-OpenFeeder-Cache": "MISS"})

    # ── Index mode (no url) ──────────────────────────────────────────
    if url is None and q is None:
        items, total = indexer.get_all_pages(page=page, limit=limit)
        total_pages = max(1, math.ceil(total / limit))
        response = JSONResponse(
            content={
                "schema": "openfeeder/1.0",
                "type": "index",
                "page": page,
                "total_pages": total_pages,
                "items": items,
            },
            headers={"X-OpenFeeder-Cache": "HIT" if cached else "MISS"},
        )
        await _track("index", len(items), cached)
        return response

    # ── Search mode (q param) ───────────────────────────────────────
    if q:
        results = indexer.search(query=q, limit=limit, url_filter=url)
        if min_score > 0.0:
            results = [r for r in results if r.relevance >= min_score]
        if not results:
            await _track("search", 0, cached)
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

        response = JSONResponse(
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
        await _track("search", len(chunks), cached)
        return response

    # ── Single page mode (url param, no q) ──────────────────────────
    # Resolve the url parameter to a full URL for lookup
    full_url = url if url.startswith("http") else SITE_URL.rstrip("/") + "/" + url.lstrip("/")

    page_meta = indexer.get_page_meta(full_url)
    if not page_meta:
        await _track("fetch", 0, cached)
        return _error_response("NOT_FOUND", f"Page not found: {url}", 404)

    chunks = indexer.get_chunks_for_url(full_url, limit=limit)

    response = JSONResponse(
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
    await _track("fetch", len(chunks), cached)
    return response


# ---------------------------------------------------------------------------
# Webhook — incremental update endpoint
# ---------------------------------------------------------------------------

class UpdateRequest(BaseModel):
    action: Literal["upsert", "delete"] = Field(..., description="'upsert' or 'delete'")
    urls: list[str] = Field(..., min_length=1, description="Relative URL paths to process")


class UpdateResponse(BaseModel):
    status: str
    processed: int
    errors: list[str]


def _check_webhook_auth(request: Request) -> None:
    """Raise 401 if WEBHOOK_SECRET is set and the request doesn't provide it."""
    if not WEBHOOK_SECRET:
        return  # Auth disabled — no secret configured

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = auth_header[len("Bearer "):]
    if token != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")


async def _process_update(action: str, urls: list[str]) -> tuple[int, list[str]]:
    """
    Core update logic: upsert or delete a list of relative URL paths.
    Returns (processed_count, error_list).
    """
    processed = 0
    errors: list[str] = []

    for relative_url in urls:
        full_url = SITE_URL.rstrip("/") + "/" + relative_url.lstrip("/")
        try:
            if action == "delete":
                indexer.delete_page(full_url)
                add_tombstone(full_url)
                logger.info("Webhook: deleted %s", full_url)
                processed += 1

            elif action == "upsert":
                async with httpx.AsyncClient(
                    headers={"User-Agent": "OpenFeeder/1.0 (webhook updater)"},
                    follow_redirects=True,
                    timeout=30,
                ) as client:
                    resp = await client.get(full_url)

                if resp.status_code >= 400:
                    errors.append(f"{full_url}: HTTP {resp.status_code}")
                    continue

                parsed = chunk_html(full_url, resp.text)
                indexer.index_page(parsed)
                logger.info("Webhook: upserted %s (%d chunks)", full_url, len(parsed.chunks))
                processed += 1

        except Exception as exc:
            logger.exception("Webhook update failed for %s", full_url)
            errors.append(f"{full_url}: {exc}")

    return processed, errors


def _schedule_background_update(action: str, urls: list[str]) -> None:
    """Fire-and-forget wrapper for background update tasks."""
    asyncio.create_task(_process_update(action, urls))


@app.post("/openfeeder/update", response_model=UpdateResponse)
async def webhook_update(
    body: UpdateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Incremental update webhook (OpenFeeder sidecar extension).

    POST /openfeeder/update
    Authorization: Bearer <OPENFEEDER_WEBHOOK_SECRET>

    Body:
        { "action": "upsert" | "delete", "urls": ["/slug-1", "/slug-2"] }

    - upsert: re-fetches each URL from the site, re-chunks, and upserts into ChromaDB.
    - delete: removes all chunks for each URL from ChromaDB.

    For ≤10 URLs the update is processed inline and the result is returned immediately.
    For >10 URLs the update is queued as a background task and the response is returned
    immediately with processed=0 (processing continues asynchronously).
    """
    _check_webhook_auth(request)

    if indexer is None:
        raise HTTPException(status_code=503, detail="Indexer not ready")

    INLINE_LIMIT = 10

    if len(body.urls) <= INLINE_LIMIT:
        # Small batch — process inline and return the real counts
        processed, errors = await _process_update(body.action, body.urls)
        return UpdateResponse(status="ok", processed=processed, errors=errors)
    else:
        # Large batch — hand off to background and return immediately
        background_tasks.add_task(_process_update, body.action, body.urls)
        return UpdateResponse(
            status="queued",
            processed=0,
            errors=[],
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
# Manual crawl trigger
# ---------------------------------------------------------------------------

@app.post("/crawl")
async def trigger_crawl(background_tasks: BackgroundTasks):
    """Trigger a manual re-crawl."""
    if _crawl_running:
        return {"status": "already_running", "message": "A crawl is already in progress"}
    background_tasks.add_task(run_crawl)
    return {"status": "crawl_started", "message": "Re-crawl triggered in background"}


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
