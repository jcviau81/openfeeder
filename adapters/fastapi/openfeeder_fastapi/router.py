"""
OpenFeeder FastAPI Adapter — Router factory.

Creates a FastAPI APIRouter that serves the OpenFeeder protocol endpoints:
  GET /.well-known/openfeeder.json  → discovery document
  GET /openfeeder                   → paginated index / single page / search
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, Response

from .chunker import chunk_content, summarise

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 10
MAX_LIMIT = 100

OPENFEEDER_HEADERS = {
    "X-OpenFeeder": "1.0",
    "Access-Control-Allow-Origin": "*",
}


def _get_headers() -> dict:
    """Return OpenFeeder headers including dynamic rate limit headers."""
    reset = str(int(time.time()) + 60)
    return {
        **OPENFEEDER_HEADERS,
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "60",
        "X-RateLimit-Reset": reset,
    }


def make_etag(data: dict) -> str:
    """Compute a quoted MD5 ETag from a dict (serialised as JSON-like str)."""
    import json
    return '"' + hashlib.md5(json.dumps(data, separators=(',', ':')).encode()).hexdigest()[:16] + '"'


def get_last_modified(items: list[dict]) -> str:
    """Return RFC 7231 date string of the most recently published item."""
    best: datetime | None = None
    for item in items:
        pub = item.get("published") or item.get("updated")
        if not pub:
            continue
        try:
            # Handle ISO 8601 with or without timezone
            dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if best is None or dt > best:
                best = dt
        except (ValueError, AttributeError):
            pass
    if best is None:
        best = datetime.now(timezone.utc)
    return best.strftime("%a, %d %b %Y %H:%M:%S GMT")


def sanitize_url_param(raw: str) -> str | None:
    """
    Sanitize the ?url= parameter: extract pathname only, reject path traversal.
    Absolute URLs are stripped to pathname. Returns None on invalid input.
    """
    if not raw:
        return None
    path = urlparse(raw).path.rstrip('/') or '/'
    if '..' in path:
        return None
    return path


def _error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "schema": "openfeeder/1.0",
            "error": {"code": code, "message": message},
        },
        headers=_get_headers(),
    )


def openfeeder_router(
    *,
    site_name: str,
    site_url: str,
    get_items: Callable,
    get_item: Callable,
    language: str = "en",
    site_description: str = "",
) -> APIRouter:
    """
    Create a FastAPI APIRouter serving the OpenFeeder protocol.

    Args:
        site_name: Display name of the site
        site_url: Canonical URL of the site (e.g. "https://mysite.com")
        get_items: async def get_items(page: int, limit: int) -> dict
                   Must return {"items": [...], "total": int}
                   Each item needs: url, title, content, published
        get_item: async def get_item(url: str) -> dict | None
                  Receives a pathname (e.g. "/my-post").
                  Returns dict with: url, title, content, published
                  Or None if not found.
        language: BCP-47 language tag (default "en")
        site_description: Brief description of the site

    Returns:
        FastAPI APIRouter with both OpenFeeder endpoints mounted
    """
    if not site_name or not site_url:
        raise ValueError("[openfeeder] openfeeder_router requires site_name and site_url")
    if not callable(get_items) or not callable(get_item):
        raise ValueError("[openfeeder] openfeeder_router requires callable get_items and get_item")

    router = APIRouter()

    # ------------------------------------------------------------------
    # Discovery endpoint
    # ------------------------------------------------------------------

    @router.get("/.well-known/openfeeder.json")
    async def discovery(request: Request) -> Response:
        body = {
            "version": "1.0",
            "site": {
                "name": site_name,
                "url": site_url,
                "language": language,
                "description": site_description,
            },
            "feed": {
                "endpoint": "/openfeeder",
                "type": "paginated",
            },
            "capabilities": ["search"],
            "contact": None,
        }

        etag = make_etag(body)
        # Discovery is static per deployment; Last-Modified = today at midnight UTC
        today = datetime.now(timezone.utc).strftime("%a, %d %b %Y 00:00:00 GMT")

        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)

        headers = {
            **_get_headers(),
            "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
            "ETag": etag,
            "Last-Modified": today,
            "Vary": "Accept-Encoding",
        }
        return JSONResponse(content=body, headers=headers)

    # ------------------------------------------------------------------
    # Content endpoint
    # ------------------------------------------------------------------

    @router.get("/openfeeder")
    async def content(
        request: Request,
        url: Optional[str] = Query(default=None),
        page: Optional[str] = Query(default=None),
        limit: Optional[str] = Query(default=None),
        q: Optional[str] = Query(default=None),
    ) -> Response:

        # Sanitize ?q=: limit to 200 chars, strip HTML is implicit (not rendered)
        query = (q or '')[:200]

        # ── Single page mode ─────────────────────────────────────────
        if url is not None:
            # Sanitize: extract pathname only, reject path traversal
            normalized_url = sanitize_url_param(str(url))

            if normalized_url is None:
                return _error_response(
                    "INVALID_URL",
                    "The ?url= parameter must be a valid relative path.",
                    400,
                )

            try:
                item = await get_item(normalized_url)
            except Exception as exc:
                logger.error("[openfeeder] get_item error: %s", exc)
                return _error_response("INTERNAL_ERROR", "Failed to fetch item.", 500)

            if item is None:
                return _error_response("NOT_FOUND", "No item found at the given URL.", 404)

            chunks_raw = chunk_content(item.get("content", ""), item.get("url", normalized_url))
            summary = summarise(item.get("content", ""))

            body = {
                "schema": "openfeeder/1.0",
                "url": item.get("url", normalized_url),
                "title": item.get("title", ""),
                "published": item.get("published") or None,
                "language": language,
                "summary": summary,
                "chunks": chunks_raw,
                "meta": {
                    "total_chunks": len(chunks_raw),
                    "returned_chunks": len(chunks_raw),
                    "cached": False,
                    "cache_age_seconds": None,
                },
            }

            etag = make_etag(body)
            last_mod = get_last_modified([item])

            if request.headers.get("if-none-match") == etag:
                return Response(status_code=304)

            headers = {
                **_get_headers(),
                "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
                "ETag": etag,
                "Last-Modified": last_mod,
                "Vary": "Accept-Encoding",
            }
            return JSONResponse(content=body, headers=headers)

        # ── Index mode ───────────────────────────────────────────────
        try:
            page_num = max(1, int(page or "1") or 1)
        except (ValueError, TypeError):
            page_num = 1

        try:
            limit_num = min(MAX_LIMIT, max(1, int(limit or str(DEFAULT_LIMIT)) or DEFAULT_LIMIT))
        except (ValueError, TypeError):
            limit_num = DEFAULT_LIMIT

        try:
            result = await get_items(page_num, limit_num)
            raw_items = result.get("items", [])
            total = result.get("total", 0)
        except Exception as exc:
            logger.error("[openfeeder] get_items error: %s", exc)
            return _error_response("INTERNAL_ERROR", "Failed to fetch items.", 500)

        # Optional search filter (substring match on title + content)
        if query:
            query_lower = query.lower()
            raw_items = [
                item for item in raw_items
                if query_lower in (item.get("title") or "").lower()
                or query_lower in (item.get("content") or "").lower()
            ]

        total_pages = max(1, -(-total // limit_num))  # ceiling division

        items_out = [
            {
                "url": item.get("url", ""),
                "title": item.get("title", ""),
                "published": item.get("published") or None,
                "summary": summarise(item.get("content") or ""),
            }
            for item in raw_items
        ]

        body = {
            "schema": "openfeeder/1.0",
            "type": "index",
            "page": page_num,
            "total_pages": total_pages,
            "items": items_out,
        }

        etag = make_etag(body)
        last_mod = get_last_modified(raw_items)

        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)

        headers = {
            **_get_headers(),
            "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
            "ETag": etag,
            "Last-Modified": last_mod,
            "Vary": "Accept-Encoding",
        }
        return JSONResponse(content=body, headers=headers)

    return router
