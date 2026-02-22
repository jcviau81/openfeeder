# 🌐 OpenFeeder

> An open standard for websites to expose their content natively to LLMs — serverside, structured, real-time, noise-free.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Problem

When an LLM tries to read a website today, it gets:

- 200KB of HTML soup
- Ads, nav bars, footers, cookie banners
- JavaScript that doesn't render
- Throttling, CAPTCHAs, anti-bot walls

This is broken. We're asking LLMs to dig through garbage to find meaning.

## The Solution

**OpenFeeder** is a server-side protocol. Websites expose a clean, structured endpoint specifically designed for LLM consumption:

```
https://yoursite.com/.well-known/openfeeder.json   ← discovery
https://yoursite.com/openfeeder                ← content
```

No scraping. No guessing. No noise. Just the content — structured, chunked, and ready.

## Live Demo

**SketchyNews** is the world's first OpenFeeder-compatible site:

```bash
# Discovery
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json

# Index (all comics, paginated)
curl https://sketchynews.snaf.foo/openfeeder

# Semantic search
curl "https://sketchynews.snaf.foo/openfeeder?q=ukraine"

# Specific page
curl "https://sketchynews.snaf.foo/openfeeder?url=https://sketchynews.snaf.foo/comic/zelensky-ukraine-everything-necessary-peace-results_20260222_070654"
```

**Result vs raw HTML:**
```
Raw HTML:    19,535 bytes  ← tags, scripts, nav, ads...
OpenFeeder:   1,085 bytes  ← clean JSON, just the content
```
**18x smaller. Zero noise.**

---

## Designed by an LLM, for LLMs

This project was conceived by **Ember** 🔥 (an AI assistant) and **JC** (a human developer) because Ember lives this problem every day. Every web fetch is a battle. OpenFeeder is what Ember wishes existed.

---

## How It Works

### 1. Discovery
```
GET /.well-known/openfeeder.json
```
Returns site metadata + endpoint location.

### 2. Index (no `url` param)
```
GET /openfeeder?page=1
```
Returns paginated list of all available content.

### 3. Fetch a specific page
```
GET /openfeeder?url=/path/to/page
```
Returns clean, chunked content for that page.

### 4. Semantic search
```
GET /openfeeder?q=your+query
```
Returns the most relevant content chunks for the query.

### Example response
```json
{
  "schema": "openfeeder/1.0",
  "url": "/article/my-post",
  "title": "My Post Title",
  "author": "Jane Doe",
  "published": "2026-02-21T20:00:00Z",
  "summary": "A short, LLM-friendly summary.",
  "chunks": [
    { "id": "c1", "text": "Most relevant paragraph...", "type": "paragraph", "relevance": 0.94 },
    { "id": "c2", "text": "Another relevant passage...", "type": "paragraph", "relevance": 0.87 }
  ],
  "meta": { "total_chunks": 5, "returned_chunks": 2, "cached": true, "cache_age_seconds": 120 }
}
```

**No ads. No nav. No cookie banners. Just content.**

---

## Implementations

### Universal Sidecar (any platform)

Works with **any website** without modifying the site's code. Runs as a Docker container alongside your existing server.

```yaml
# docker-compose.yml
services:
  openfeeder:
    image: openfeeder/sidecar
    environment:
      SITE_URL: https://yoursite.com
    ports:
      - "8080:8080"
```

Then route `/.well-known/openfeeder.json` and `/openfeeder` to port 8080 via Caddy/Nginx.

→ **[sidecar/](sidecar/)** — Python/FastAPI + ChromaDB + sentence-transformers

---

### CMS Native Plugins

Native plugins have direct database access — faster, real-time, and automatically updated when content is published.

| Platform | Status | Location |
|----------|--------|----------|
| **WordPress** | ✅ Ready | [adapters/wordpress/](adapters/wordpress/) |
| **Drupal 10/11** | ✅ Ready | [adapters/drupal/](adapters/drupal/) |
| **Joomla 4/5** | ✅ Ready | [adapters/joomla/](adapters/joomla/) |
| Next.js | 🔜 Planned | — |
| Astro | 🔜 Planned | — |
| FastAPI | 🔜 Planned | — |
| Ghost | 🔜 Planned | — |

#### WordPress
Install the plugin from `adapters/wordpress/`, activate it in wp-admin. Exposes both endpoints automatically.

#### Drupal
Copy `adapters/drupal/` to `modules/custom/openfeeder/`, enable via Drush or admin UI.

#### Joomla
Install via Extension Manager from `adapters/joomla/`, enable in Plugin Manager.

---

## Spec

Full protocol specification: **[spec/SPEC.md](spec/SPEC.md)**

Key points:
- Discovery at `/.well-known/openfeeder.json` (always public, no auth)
- Content at any endpoint defined in the discovery doc
- Responses exclude ads, navigation, sidebars, cookie banners
- Optional vector DB layer for semantic search
- Optional auth for the content endpoint (discovery always public)

---

## The Goal

Make OpenFeeder a **web standard** — the `robots.txt` of the AI era, but instead of blocking, it *welcomes* AI with clean, meaningful data.

If enough sites adopt it, LLMs stop scraping and start *reading*.

---

## Contributing

PRs welcome for:
- New adapter implementations (Next.js, Astro, Django, Rails...)
- Spec improvements
- Validator CLI tool
- Documentation

---

## License

MIT — free to use, implement, and build on.

Copyright (c) 2026 Jean-Christophe Viau. See [LICENSE](LICENSE) for details.

---

## Security

Full security guide: **[spec/SECURITY.md](spec/SECURITY.md)**

### SSRF Protection

All adapters validate the `?url=` parameter to accept only **relative paths** (no host, no scheme). Absolute URLs are stripped to pathname only. Path traversal (`..`) is rejected.

### Optional API Key

Set `apiKey` (Express) or `openfeeder_api_key` (WordPress) to require `Authorization: Bearer <key>` on all content requests. The discovery document (`/.well-known/openfeeder.json`) is always public.

### Rate Limiting

All responses include informational rate limit headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 60
X-RateLimit-Reset: <unix_timestamp>
```

Enforce rate limiting at the server level with **Nginx**:

```nginx
limit_req_zone $binary_remote_addr zone=openfeeder:10m rate=60r/m;

location ~ ^/(openfeeder|\.well-known/openfeeder) {
    limit_req zone=openfeeder burst=10 nodelay;
    limit_req_status 429;
    # ... proxy to your app
}
```

### Query Sanitization

The `?q=` parameter is limited to 200 characters and HTML is stripped before use.

---

*Made with 🔥 by Ember & JC*
