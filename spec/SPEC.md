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

The content endpoint path is defined in the discovery document. The **recommended default** is `/openfeeder` (avoids conflicts with platform-specific API routers like Joomla, Django REST Framework, etc.).

### 3.1 Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | No | Relative path of the page to fetch |
| `q` | string | No | Semantic query for relevance ranking |
| `page` | integer | No | Page number for paginated index (default: 1) |
| `limit` | integer | No | Max chunks to return (default: 10, max: 50) |
| `min_score` | float | No | Minimum relevance score 0.0–1.0 (default: 0.0). Filters out chunks below threshold. Only applies when `?q=` is set. Higher = more precise, fewer results. |

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

### 3.4 Differential Sync (`?since=` / `?until=`)

The `?since=` and `?until=` parameters enable incremental synchronisation and closed date-range queries. Instead of fetching the full index on every request, an LLM can pass one or both timestamps to receive only content within the specified window.

#### Query

```
GET /openfeeder?since=<RFC3339-datetime-or-sync_token>
GET /openfeeder?until=<RFC3339-datetime>
GET /openfeeder?since=<RFC3339>&until=<RFC3339>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `since` | string | RFC 3339 datetime (e.g. `2026-02-20T00:00:00Z`) **or** a `sync_token` returned by a previous response. Lower bound (inclusive). |
| `until` | string | RFC 3339 datetime (e.g. `2026-02-15T00:00:00Z`). Upper bound (inclusive). Optional — omit for open-ended "since only". |

**Usage examples:**

- `?since=2026-02-01T00:00:00Z` — everything changed from Feb 1 to now (existing behaviour)
- `?until=2026-02-15T00:00:00Z` — everything published on or before Feb 15
- `?since=2026-02-01T00:00:00Z&until=2026-02-15T00:00:00Z` — closed range Feb 1–15

When `?since=` or `?until=` is combined with `?q=`, the search parameter takes priority and date range params are ignored — they are different modes.

#### Response Schema

```json
{
  "openfeeder_version": "1.0",
  "sync": {
    "since": "2026-02-01T00:00:00Z",
    "until": "2026-02-15T00:00:00Z",
    "as_of": "2026-02-23T02:00:00Z",
    "sync_token": "eyJ0IjoiMjAyNi0wMi0yMyJ9",
    "counts": { "added": 5, "updated": 3, "deleted": 2 }
  },
  "added": [ ],
  "updated": [ ],
  "deleted": [
    { "url": "https://example.com/old-post", "deleted_at": "2026-02-21T14:30:00Z" }
  ]
}
```

- **`added`** — page objects whose first publication date is ≥ the `since` timestamp (absent when `?until=` is used alone).
- **`updated`** — page objects that existed before `since` but were modified within the requested window.
- **`deleted`** — tombstone objects for content that was removed after `since` (empty when `?until=` is used alone).

Each tombstone contains:
| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Canonical URL of the deleted page |
| `deleted_at` | string | RFC 3339 datetime when the page was removed |

#### `sync_token`

The `sync_token` is an opaque cursor that encodes the `as_of` timestamp:

```
sync_token = base64( JSON.stringify({ "t": "<as_of ISO timestamp>" }) )
```

Clients SHOULD save the `sync_token` from each response and pass it as `?since=<sync_token>` in subsequent requests. Servers MUST accept both a raw RFC 3339 datetime and a valid `sync_token` in the `since` parameter.

#### Implementation Notes

- `?until=` accepts only a raw RFC 3339 datetime (not a `sync_token`).
- When `?until=` is used without `?since=`, the response returns all content published on or before the `until` date. The `since` key is omitted from the `sync` object.
- When both are provided, `?until=` MUST be ≥ `?since=`. Servers SHOULD return `400 INVALID_PARAM` if `until < since`.
- Servers that cannot distinguish "added" from "updated" MAY place all changed items in the `updated` array.
- Servers that cannot track deletions (e.g. static file servers) SHOULD return an empty `deleted` array and MAY include `"deleted_tracking": false` in the `sync` object.
- Tombstone storage is implementation-defined. A FIFO list capped at 1 000 entries is recommended.
- `GET /openfeeder` without `?since=` or `?until=` MUST continue to work exactly as before (full index mode).

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
2. On `GET /openfeeder?q=<query>` → embed query → semantic search → return top-k chunks

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

## 10. Security & Privacy

### What OpenFeeder exposes
By default, OpenFeeder exposes ONLY:
- Published, public content (no drafts, no private posts, no password-protected content)
- Display names (no email addresses, no user IDs)
- Explicitly configured fields (no internal metadata)

### OpenFeeder as Gatekeeper
Without OpenFeeder, AI bots scrape whatever HTML they can reach. With OpenFeeder, you have explicit control:
- Define exactly which content types are exposed
- Exclude sensitive paths (/checkout, /my-account, /admin)
- Hide author information entirely
- Require an API key to restrict access to trusted AI systems only
- Your content, your rules — LLMs see what you decide

### API Key Authentication
Set `apiKey` in your adapter config to require `Authorization: Bearer <key>` on all content requests. The discovery document (`/.well-known/openfeeder.json`) is always public.

### Gatekeeper Configuration

Implementations SHOULD support the following configuration options:

| Option | Type | Description |
|--------|------|-------------|
| `excludedPaths` | string[] | Path prefixes to exclude from content listing (e.g. `/checkout`, `/cart`, `/my-account`) |
| `excludedTypes` | string[] | Content types to exclude (e.g. `page`, `attachment` in WordPress) |
| `authorDisplay` | `"name"` \| `"hidden"` | Whether to include author display names or hide them entirely |
| `apiKey` | string | Require `Authorization: Bearer <key>` on all content endpoints |

### Recommended exclusions
Always exclude from your OpenFeeder endpoint:
- User account pages
- Checkout/payment flows
- Admin/dashboard pages
- Any page containing personal data (GDPR)
- Drafts and internal review content

---

## 11. robots.txt Relationship

OpenFeeder does not override `robots.txt`. Sites that wish to allow LLM access via OpenFeeder while blocking scrapers MAY add:

```
User-agent: *
Disallow: /

# OpenFeeder-compliant agents may use /.well-known/openfeeder.json
```

---

## 12. Analytics

OpenFeeder supports optional server-side analytics to help site owners understand LLM usage patterns.

### Tracked Events

| Field | Description |
|-------|-------------|
| `bot_name` | Detected bot (GPTBot, ClaudeBot, etc.) |
| `bot_family` | Company (openai, anthropic, google, perplexity, common-crawl, cohere, meta, amazon, you, bytedance) |
| `endpoint` | search / fetch / index / discovery |
| `query` | Search query string (?q=) |
| `intent` | X-OpenFeeder-Intent value if present |
| `results` | Number of items/chunks returned |
| `cached` | Whether response was served from cache |
| `response_ms` | Response time in milliseconds |

### Privacy

Analytics track bot requests only. No human user data is collected.
Queries are logged as-is — if you need to anonymize, hash queries before sending.

### Supported Providers

- **Umami** — recommended (GDPR-friendly, self-hosted)
- **GA4** — via Measurement Protocol (no cookies)
- **none** — default, analytics disabled

---

*This spec is a living document. Version 1.0 is a draft. Feedback welcome via GitHub issues.*

---

Copyright (c) 2026 Jean-Christophe Viau. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
