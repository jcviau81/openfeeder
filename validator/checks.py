"""Individual check functions for OpenFeeder validation."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from urllib.parse import urljoin, urlencode

import httpx


class Status(Enum):
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"
    SKIP = "skip"


@dataclass
class CheckResult:
    name: str
    status: Status
    message: str
    details: str = ""


@dataclass
class ValidationContext:
    """Accumulates state across checks so later checks can use earlier results."""
    base_url: str
    discovery: dict = field(default_factory=dict)
    feed_endpoint: str = ""
    index_data: dict = field(default_factory=dict)
    first_item_url: str = ""
    single_page_data: dict = field(default_factory=dict)
    results: list[CheckResult] = field(default_factory=list)


DEFAULT_TIMEOUT = 10.0


def _get(client: httpx.Client, url: str) -> httpx.Response:
    return client.get(url, timeout=DEFAULT_TIMEOUT, follow_redirects=True)


# ---------------------------------------------------------------------------
# 1. Discovery checks
# ---------------------------------------------------------------------------

def check_discovery(client: httpx.Client, ctx: ValidationContext) -> list[CheckResult]:
    results: list[CheckResult] = []
    url = urljoin(ctx.base_url.rstrip("/") + "/", ".well-known/openfeeder.json")

    try:
        resp = _get(client, url)
    except httpx.ConnectError:
        results.append(CheckResult("Discovery endpoint", Status.FAIL,
                                   "Could not connect", f"URL: {url}"))
        return results
    except httpx.TimeoutException:
        results.append(CheckResult("Discovery endpoint", Status.FAIL,
                                   "Request timed out", f"URL: {url}"))
        return results
    except httpx.HTTPError as exc:
        results.append(CheckResult("Discovery endpoint", Status.FAIL,
                                   f"HTTP error: {exc}", f"URL: {url}"))
        return results

    # HTTP 200
    if resp.status_code == 200:
        results.append(CheckResult("Discovery endpoint", Status.PASS,
                                   "Responds with HTTP 200"))
    else:
        results.append(CheckResult("Discovery endpoint", Status.FAIL,
                                   f"HTTP {resp.status_code}", f"Expected 200, got {resp.status_code}"))
        return results

    # Content-Type
    ct = resp.headers.get("content-type", "")
    if "application/json" in ct:
        results.append(CheckResult("Discovery Content-Type", Status.PASS,
                                   "application/json"))
    else:
        results.append(CheckResult("Discovery Content-Type", Status.FAIL,
                                   f"Got {ct}", "Expected application/json"))

    # Parse JSON
    try:
        data = resp.json()
    except Exception:
        results.append(CheckResult("Discovery JSON parse", Status.FAIL,
                                   "Response is not valid JSON"))
        return results

    ctx.discovery = data

    # Required fields
    required = {
        "version": data.get("version"),
        "site.name": (data.get("site") or {}).get("name"),
        "site.url": (data.get("site") or {}).get("url"),
        "feed.endpoint": (data.get("feed") or {}).get("endpoint"),
    }

    for field_name, value in required.items():
        if value:
            results.append(CheckResult(f"Discovery field: {field_name}", Status.PASS,
                                       f"Present: {value}"))
        else:
            results.append(CheckResult(f"Discovery field: {field_name}", Status.FAIL,
                                       "Missing required field"))

    # Version check (warn if not 1.0)
    version = data.get("version", "")
    if version and version != "1.0":
        results.append(CheckResult("Discovery version", Status.WARN,
                                   f"Version is {version}, expected 1.0"))

    # Store feed endpoint for next checks
    endpoint = (data.get("feed") or {}).get("endpoint", "")
    if endpoint:
        if endpoint.startswith("http"):
            ctx.feed_endpoint = endpoint
        else:
            ctx.feed_endpoint = urljoin(ctx.base_url.rstrip("/") + "/", endpoint.lstrip("/"))

    return results


# ---------------------------------------------------------------------------
# 2. Index mode checks
# ---------------------------------------------------------------------------

def check_index(client: httpx.Client, ctx: ValidationContext) -> list[CheckResult]:
    results: list[CheckResult] = []

    if not ctx.feed_endpoint:
        results.append(CheckResult("Index endpoint", Status.SKIP,
                                   "No feed endpoint discovered"))
        return results

    start = time.monotonic()
    try:
        resp = _get(client, ctx.feed_endpoint)
    except httpx.TimeoutException:
        results.append(CheckResult("Index endpoint", Status.FAIL,
                                   "Request timed out"))
        return results
    except httpx.HTTPError as exc:
        results.append(CheckResult("Index endpoint", Status.FAIL,
                                   f"HTTP error: {exc}"))
        return results
    elapsed = time.monotonic() - start

    # HTTP 200
    if resp.status_code == 200:
        results.append(CheckResult("Index endpoint", Status.PASS,
                                   "Responds with HTTP 200"))
    else:
        results.append(CheckResult("Index endpoint", Status.FAIL,
                                   f"HTTP {resp.status_code}"))
        return results

    try:
        data = resp.json()
    except Exception:
        results.append(CheckResult("Index JSON parse", Status.FAIL,
                                   "Response is not valid JSON"))
        return results

    ctx.index_data = data

    # schema field
    schema = data.get("schema", "")
    if schema == "openfeeder/1.0":
        results.append(CheckResult("Index schema", Status.PASS,
                                   "schema = openfeeder/1.0"))
    else:
        results.append(CheckResult("Index schema", Status.FAIL,
                                   f"schema = {schema!r}", "Expected openfeeder/1.0"))

    # type field
    idx_type = data.get("type", "")
    if idx_type == "index":
        results.append(CheckResult("Index type", Status.PASS,
                                   "type = index"))
    else:
        results.append(CheckResult("Index type", Status.FAIL,
                                   f"type = {idx_type!r}", "Expected 'index'"))

    # items array
    items = data.get("items")
    if isinstance(items, list):
        results.append(CheckResult("Index items", Status.PASS,
                                   f"{len(items)} items returned"))
    else:
        results.append(CheckResult("Index items", Status.FAIL,
                                   "Missing or invalid items array"))
        items = []

    # Each item has url + title
    bad_items = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            bad_items.append(f"Item {i}: not an object")
            continue
        if not item.get("url"):
            bad_items.append(f"Item {i}: missing url")
        if not item.get("title"):
            bad_items.append(f"Item {i}: missing title")

    if items and not bad_items:
        results.append(CheckResult("Index item fields", Status.PASS,
                                   "All items have url and title"))
    elif bad_items:
        results.append(CheckResult("Index item fields", Status.FAIL,
                                   f"{len(bad_items)} issues",
                                   "; ".join(bad_items[:5])))

    # Response time
    if elapsed > 5:
        results.append(CheckResult("Index response time", Status.FAIL,
                                   f"{elapsed:.1f}s", "Must be < 5s"))
    elif elapsed > 2:
        results.append(CheckResult("Index response time", Status.WARN,
                                   f"{elapsed:.1f}s", "Recommended < 2s"))
    else:
        results.append(CheckResult("Index response time", Status.PASS,
                                   f"{elapsed:.1f}s"))

    # Store first item URL for single page check
    if items and isinstance(items[0], dict) and items[0].get("url"):
        item_url = items[0]["url"]
        if item_url.startswith("http"):
            ctx.first_item_url = item_url
        else:
            ctx.first_item_url = urljoin(ctx.base_url.rstrip("/") + "/", item_url.lstrip("/"))

    return results


# ---------------------------------------------------------------------------
# 3. Single page mode checks
# ---------------------------------------------------------------------------

def check_single_page(client: httpx.Client, ctx: ValidationContext) -> list[CheckResult]:
    results: list[CheckResult] = []

    if not ctx.first_item_url:
        results.append(CheckResult("Single page fetch", Status.SKIP,
                                   "No items in index to test"))
        return results

    if not ctx.feed_endpoint:
        results.append(CheckResult("Single page fetch", Status.SKIP,
                                   "No feed endpoint"))
        return results

    sep = "&" if "?" in ctx.feed_endpoint else "?"
    url = f"{ctx.feed_endpoint}{sep}{urlencode({'url': ctx.first_item_url})}"

    try:
        resp = _get(client, url)
    except httpx.TimeoutException:
        results.append(CheckResult("Single page fetch", Status.FAIL,
                                   "Request timed out"))
        return results
    except httpx.HTTPError as exc:
        results.append(CheckResult("Single page fetch", Status.FAIL,
                                   f"HTTP error: {exc}"))
        return results

    if resp.status_code == 200:
        results.append(CheckResult("Single page fetch", Status.PASS,
                                   "Responds with HTTP 200"))
    else:
        results.append(CheckResult("Single page fetch", Status.FAIL,
                                   f"HTTP {resp.status_code}"))
        return results

    try:
        data = resp.json()
    except Exception:
        results.append(CheckResult("Single page JSON", Status.FAIL,
                                   "Response is not valid JSON"))
        return results

    ctx.single_page_data = data

    # schema field
    if data.get("schema"):
        results.append(CheckResult("Single page schema", Status.PASS,
                                   f"schema = {data['schema']}"))
    else:
        results.append(CheckResult("Single page schema", Status.FAIL,
                                   "Missing schema field"))

    # title field
    if data.get("title"):
        results.append(CheckResult("Single page title", Status.PASS,
                                   f"title = {data['title']!r}"))
    else:
        results.append(CheckResult("Single page title", Status.FAIL,
                                   "Missing title field"))

    # chunks array
    chunks = data.get("chunks")
    if isinstance(chunks, list):
        results.append(CheckResult("Single page chunks", Status.PASS,
                                   f"{len(chunks)} chunks"))
    else:
        results.append(CheckResult("Single page chunks", Status.FAIL,
                                   "Missing or invalid chunks array"))
        chunks = []

    # Chunk fields
    bad_chunks = []
    empty_chunks = 0
    for i, chunk in enumerate(chunks):
        if not isinstance(chunk, dict):
            bad_chunks.append(f"Chunk {i}: not an object")
            continue
        for req_field in ("id", "text", "type"):
            if not chunk.get(req_field) and chunk.get(req_field) != 0:
                bad_chunks.append(f"Chunk {i}: missing {req_field}")
        if isinstance(chunk.get("text"), str) and chunk["text"].strip() == "":
            empty_chunks += 1

    if chunks and not bad_chunks:
        results.append(CheckResult("Chunk fields", Status.PASS,
                                   "All chunks have id, text, type"))
    elif bad_chunks:
        results.append(CheckResult("Chunk fields", Status.FAIL,
                                   f"{len(bad_chunks)} issues",
                                   "; ".join(bad_chunks[:5])))

    if empty_chunks:
        results.append(CheckResult("Empty chunks", Status.FAIL,
                                   f"{empty_chunks} chunk(s) have empty text"))
    elif chunks:
        results.append(CheckResult("Empty chunks", Status.PASS,
                                   "No empty chunks"))

    # meta.total_chunks
    meta = data.get("meta") or {}
    if "total_chunks" in meta:
        results.append(CheckResult("meta.total_chunks", Status.PASS,
                                   f"total_chunks = {meta['total_chunks']}"))
    else:
        results.append(CheckResult("meta.total_chunks", Status.FAIL,
                                   "Missing meta.total_chunks"))

    return results


# ---------------------------------------------------------------------------
# 4. Header checks (warn only)
# ---------------------------------------------------------------------------

def check_headers(client: httpx.Client, ctx: ValidationContext) -> list[CheckResult]:
    results: list[CheckResult] = []

    if not ctx.feed_endpoint:
        return results

    try:
        resp = _get(client, ctx.feed_endpoint)
    except httpx.HTTPError:
        return results

    # X-OpenFeeder header
    if resp.headers.get("x-openfeeder"):
        results.append(CheckResult("X-OpenFeeder header", Status.PASS,
                                   f"X-OpenFeeder: {resp.headers['x-openfeeder']}"))
    else:
        results.append(CheckResult("X-OpenFeeder header", Status.WARN,
                                   "X-OpenFeeder header missing (optional)"))

    # CORS
    acao = resp.headers.get("access-control-allow-origin", "")
    if acao == "*":
        results.append(CheckResult("CORS header", Status.PASS,
                                   "Access-Control-Allow-Origin: *"))
    elif acao:
        results.append(CheckResult("CORS header", Status.WARN,
                                   f"CORS set to {acao!r}, not *",
                                   "LLMs may call from any origin"))
    else:
        results.append(CheckResult("CORS header", Status.WARN,
                                   "No CORS header (optional)",
                                   "Consider Access-Control-Allow-Origin: *"))

    return results


# ---------------------------------------------------------------------------
# 5. Noise check (warn only)
# ---------------------------------------------------------------------------

def check_noise(client: httpx.Client, ctx: ValidationContext) -> list[CheckResult]:
    results: list[CheckResult] = []

    if not ctx.first_item_url:
        results.append(CheckResult("Noise check", Status.SKIP,
                                   "No item URL to check"))
        return results

    chunks = (ctx.single_page_data.get("chunks") or [])
    if not chunks:
        results.append(CheckResult("Noise check", Status.SKIP,
                                   "No chunks to verify"))
        return results

    try:
        resp = _get(client, ctx.first_item_url)
    except httpx.HTTPError:
        results.append(CheckResult("Noise check", Status.SKIP,
                                   "Could not fetch raw HTML"))
        return results

    html = resp.text
    matched = 0
    for chunk in chunks[:5]:  # check first 5 chunks
        text = (chunk.get("text") or "").strip()
        if text and len(text) > 20 and text[:80] in html:
            matched += 1

    checked = min(len(chunks), 5)
    if matched > 0:
        results.append(CheckResult("Noise check", Status.PASS,
                                   f"{matched}/{checked} chunks found in raw HTML",
                                   "Content appears real"))
    else:
        results.append(CheckResult("Noise check", Status.WARN,
                                   "No chunk text found in raw HTML",
                                   "Content may be transformed or generated"))

    return results


# ---------------------------------------------------------------------------
# 6. Search check
# ---------------------------------------------------------------------------

def check_search(client: httpx.Client, ctx: ValidationContext) -> list[CheckResult]:
    """Verify that the search endpoint works if search is in capabilities."""
    results: list[CheckResult] = []

    capabilities = ctx.discovery.get("capabilities", [])
    if "search" not in capabilities:
        results.append(CheckResult("Search endpoint", Status.SKIP,
                                   "search not in capabilities"))
        return results

    if not ctx.feed_endpoint:
        results.append(CheckResult("Search endpoint", Status.SKIP,
                                   "No feed endpoint discovered"))
        return results

    sep = "&" if "?" in ctx.feed_endpoint else "?"
    url = f"{ctx.feed_endpoint}{sep}{urlencode({'q': 'test'})}"

    try:
        resp = _get(client, url)
    except httpx.TimeoutException:
        results.append(CheckResult("Search endpoint", Status.FAIL,
                                   "Request timed out"))
        return results
    except httpx.HTTPError as exc:
        results.append(CheckResult("Search endpoint", Status.FAIL,
                                   f"HTTP error: {exc}"))
        return results

    # Accept 200 (results found) or 404 (no results for "test" — still valid)
    if resp.status_code == 200:
        results.append(CheckResult("Search endpoint", Status.PASS,
                                   "Responds with HTTP 200"))
    elif resp.status_code == 404:
        results.append(CheckResult("Search endpoint", Status.PASS,
                                   "Responds with HTTP 404 (no results, but endpoint works)"))
        return results
    else:
        results.append(CheckResult("Search endpoint", Status.FAIL,
                                   f"HTTP {resp.status_code}"))
        return results

    try:
        data = resp.json()
    except Exception:
        results.append(CheckResult("Search JSON parse", Status.FAIL,
                                   "Response is not valid JSON"))
        return results

    # Verify response has expected structure (either index with items or single page with chunks)
    if "items" in data:
        items = data["items"]
        if isinstance(items, list):
            results.append(CheckResult("Search results", Status.PASS,
                                       f"{len(items)} items returned"))
        else:
            results.append(CheckResult("Search results", Status.FAIL,
                                       "items is not an array"))
    elif "chunks" in data:
        chunks = data["chunks"]
        if isinstance(chunks, list):
            results.append(CheckResult("Search results", Status.PASS,
                                       f"{len(chunks)} chunks returned"))
        else:
            results.append(CheckResult("Search results", Status.FAIL,
                                       "chunks is not an array"))
    else:
        results.append(CheckResult("Search results", Status.WARN,
                                   "Response has neither items nor chunks array"))

    return results


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_all_checks(base_url: str, endpoint_override: str | None = None) -> ValidationContext:
    ctx = ValidationContext(base_url=base_url.rstrip("/"))

    with httpx.Client(
        headers={"User-Agent": "OpenFeeder-Validator/1.0"},
        follow_redirects=True,
    ) as client:
        # 1. Discovery
        try:
            ctx.results.extend(check_discovery(client, ctx))
        except Exception:
            ctx.results.append(CheckResult("Discovery", Status.FAIL,
                                           "Could not reach site"))
            return ctx

        # Override endpoint if specified
        if endpoint_override:
            ctx.feed_endpoint = endpoint_override

        # 2. Index
        ctx.results.extend(check_index(client, ctx))

        # 3. Single page
        ctx.results.extend(check_single_page(client, ctx))

        # 4. Headers
        ctx.results.extend(check_headers(client, ctx))

        # 5. Noise check
        ctx.results.extend(check_noise(client, ctx))

        # 6. Search
        ctx.results.extend(check_search(client, ctx))

    return ctx
