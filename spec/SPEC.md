# OpenFeeder Protocol Specification v1.0 (Draft)

*Status: Draft — open for community feedback*

---

## 1. Overview

OpenFeeder defines a standard HTTP-based protocol for websites to expose structured, LLM-optimized content. The goal is to eliminate web scraping for AI agents by providing a first-class, server-controlled content endpoint.

---

## 2. Discovery

Every OpenFeeder-compliant site MUST expose a discovery document at:

```
GET /.well-known/openfeeder.json
```

This endpoint MUST:
- Return `Content-Type: application/json`
- Be publicly accessible (no auth required)
- Return HTTP 200

### 2.1 Discovery Document Schema

```json
{
  "version": "1.0",
  "site": {
    "name": "string (required)",
    "url": "string (required) — canonical base URL",
    "language": "string (required) — BCP 47 language tag",
    "description": "string (optional)"
  },
  "feed": {
    "endpoint": "string (required) — relative or absolute URL",
    "type": "paginated | stream | static"
  },
  "capabilities": ["search", "realtime", "embeddings", "auth"],
  "contact": "string (optional) — email or URL for issues"
}
```

---

## 3. Content Endpoint

The content endpoint is defined in the discovery document under `feed.endpoint`.

### 3.1 Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | No | Relative path of the page to fetch |
| `q` | string | No | Semantic query for relevance ranking |
| `page` | integer | No | Page number for paginated index (default: 1) |
| `limit` | integer | No | Max chunks to return (default: 10, max: 50) |

### 3.2 Response Schema

```json
{
  "schema": "openfeeder/1.0",
  "url": "string — canonical URL of the content",
  "title": "string",
  "author": "string | null",
  "published": "ISO 8601 datetime | null",
  "updated": "ISO 8601 datetime | null",
  "language": "string — BCP 47",
  "summary": "string — 1-3 sentence LLM-friendly summary",
  "chunks": [
    {
      "id": "string — unique within response",
      "text": "string — clean text content",
      "type": "paragraph | heading | list | code | quote",
      "relevance": "float 0-1 | null — only when q= was provided"
    }
  ],
  "meta": {
    "total_chunks": "integer",
    "returned_chunks": "integer",
    "cached": "boolean",
    "cache_age_seconds": "integer | null"
  }
}
```

### 3.3 Index Mode (no `url` param)

When called without `url`, the endpoint returns a paginated index of all available content:

```json
{
  "schema": "openfeeder/1.0",
  "type": "index",
  "page": 1,
  "total_pages": 42,
  "items": [
    {
      "url": "/article/my-post",
      "title": "My Post",
      "published": "2026-02-21T20:00:00Z",
      "summary": "Short description..."
    }
  ]
}
```

---

## 4. What to Exclude

OpenFeeder responses MUST NOT include:

- Advertisements
- Navigation menus
- Cookie banners / consent dialogs
- Sidebars unrelated to main content
- Footer boilerplate
- Social sharing widgets
- Comment sections (unless explicitly requested)
- Tracking scripts or pixels

---

## 5. Vector Database Integration (Recommended)

For sites with large amounts of content, implementing a vector database layer is strongly recommended:

1. On content publish/update → chunk → embed → upsert into vector DB
2. On `GET /api/openfeeder?q=<query>` → embed query → semantic search → return top-k chunks

Recommended embedding models:
- `sentence-transformers/all-MiniLM-L6-v2` (local, fast)
- `text-embedding-3-small` (OpenAI)
- Any model returning normalized float vectors

---

## 6. Caching

- Servers SHOULD cache chunked/embedded content
- Cache MUST be invalidated when content is updated
- Response SHOULD include `meta.cached` and `meta.cache_age_seconds`

---

## 7. Authentication (Optional)

Sites MAY require authentication for the content endpoint:

- Discovery document (`/.well-known/openfeeder.json`) MUST always be public
- Authenticated endpoints SHOULD use Bearer tokens
- Auth requirement MUST be listed in `capabilities: ["auth"]`

---

## 8. Error Responses

```json
{
  "schema": "openfeeder/1.0",
  "error": {
    "code": "NOT_FOUND | RATE_LIMITED | AUTH_REQUIRED | SERVER_ERROR",
    "message": "Human-readable description"
  }
}
```

---

## 9. HTTP Headers

OpenFeeder-compliant servers SHOULD return:

```
X-OpenFeeder: 1.0
X-OpenFeeder-Cache: HIT | MISS
```

---

## 10. robots.txt Relationship

OpenFeeder does not override `robots.txt`. Sites that wish to allow LLM access via OpenFeeder while blocking scrapers MAY add:

```
User-agent: *
Disallow: /

# OpenFeeder-compliant agents may use /.well-known/openfeeder.json
```

---

*This spec is a living document. Version 1.0 is a draft. Feedback welcome via GitHub issues.*
