# 🌐 OpenFeeder

> An open standard for websites to expose their content natively to LLMs — serverside, structured, real-time, noise-free.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tests](https://github.com/jcviau81/openfeeder/actions/workflows/test.yml/badge.svg)](https://github.com/jcviau81/openfeeder/actions/workflows/test.yml)

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

## Why Server-Side Changes Everything

Most LLM web tools — scrapers, Firecrawl, Common Crawl — work **after** the rendering pipeline. They fetch HTML (or render it with a headless browser), then try to extract meaning from the noise.

OpenFeeder works **before** the rendering pipeline, directly at the data source:

```
❌ Scraper approach:
  LLM → HTTP → rendered HTML (200KB soup) → strip noise → maybe useful content

✅ OpenFeeder approach:
  LLM → HTTP → OpenFeeder endpoint → structured JSON (1KB) → direct content
```

With **native adapters**, the data never touches HTML at all:

| Adapter | Source | SPA/React? Doesn't matter |
|---------|--------|--------------------------|
| WordPress | `WP_Query` → DB directly | ✅ Even if the theme is broken |
| Express | Your routes, your ORM | ✅ Even if frontend is React/Vue/Svelte |
| Next.js | `getStaticProps` / RSC | ✅ SSR or full SPA |
| FastAPI | Your Pydantic models | ✅ |
| Astro | Content collections | ✅ |

**A React SPA with 200KB of JavaScript? Irrelevant.** Native adapters talk directly to your database — the frontend doesn't exist from OpenFeeder's perspective.

The **Universal Sidecar** handles sites you don't control (third-party, legacy) by crawling + extracting JSON-LD/OpenGraph structured data from the `<head>` — which is server-rendered even on SPAs.

---

## Business Impact

OpenFeeder isn't just better for LLMs — it's better for your infrastructure.

### 📉 Bandwidth savings
AI crawlers fetch your full HTML page — DOM, nav, scripts, ads, footers, duplicate content — and discard 95% of it to find what they actually need.

OpenFeeder serves **only the content**. Our benchmark on [SketchyNews](https://sketchynews.snaf.foo):

```
Full HTML page:   19,535 bytes
OpenFeeder JSON:   1,085 bytes
                   ──────────
                   18x smaller  ✅ measured
```

AI bot traffic is a growing share of overall web traffic — industry estimates for content-heavy sites range from 15–25% in 2024, accelerating. Even at 15%, serving those bots 18x less data adds up fast.

### ⚡ Processing time & server load
Serving an OpenFeeder response is cheaper than a full page render — for **native adapters** specifically:
- **No template rendering** — queries go straight to DB, no PHP/Blade/Jinja execution
- **No asset pipeline** — no CSS/JS bundling, no media processing
- **Cacheable by design** — `Cache-Control`, `ETag`, `304 Not Modified` built into the spec (implemented in all 9 adapters)
- **Fewer repeated crawls** — LLMs get what they need in 1–2 requests instead of spidering dozens of pages

### 🌱 Energy & carbon
Less data transferred = less energy consumed — by your servers, your CDN, and the AI infrastructure on the other end. The math is simple: 18x less data = 18x less network energy for that traffic segment. At scale, across thousands of AI crawl requests per day, this is measurable.

### 💰 Token efficiency for LLM operators
Every token costs money and latency. A structured 1KB OpenFeeder response vs 20KB of HTML soup:
- **~20–50x fewer tokens** to process (depending on page complexity)
- Faster responses for end users
- Lower inference costs for LLM providers

LLM providers and AI agents will naturally gravitate toward OpenFeeder-compatible sites — getting better results faster, with less compute. Being early means being discoverable when AI-driven traffic becomes the norm.

### 🤝 Control over how AI sees you
Today, LLMs scrape your site and interpret it however they can. With OpenFeeder, **you decide what they get** — the right summary, the right metadata, the right context. No more AI hallucinating your product prices or misquoting your articles.

---

## Security & Privacy

### OpenFeeder as a Gatekeeper

The web is already being crawled by AI bots. OpenFeeder doesn't change that — it gives you **control over what they get**.

Without OpenFeeder: AI bots scrape your HTML and interpret whatever they find.
With OpenFeeder: you explicitly define the content, depth, and format. Everything else is invisible.

**What OpenFeeder NEVER exposes (by default):**
- Draft, private, or password-protected content
- Email addresses or user account data
- Internal metadata or admin content
- Checkout, cart, or personal account pages

**What you can configure:**
- Exclude specific content types or paths
- Hide author names entirely
- Require an API key (only your trusted AI systems get access)
- Restrict to specific content types only

This makes OpenFeeder the right answer to "how do I control what AI knows about my site?"

---

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

### Content Protection

All adapters enforce strict content filtering by default:
- **Only published content** — drafts, private, pending, trashed, and archived content are never exposed
- **Password-protected posts excluded** — posts with a password set are automatically filtered out
- **Display names only** — no email addresses, user IDs, or login names are ever returned
- **No internal metadata** — WordPress internal post types (`attachment`, `revision`, `nav_menu_item`, `wp_block`, `wp_template`, etc.) and WooCommerce internal meta (prefixed with `_`) are never exposed
- **Excluded paths** — configurable path prefixes (e.g. `/checkout`, `/cart`, `/my-account`) are filtered from all responses

### Gatekeeper Configuration

| Setting | WordPress | Express | Description |
|---------|-----------|---------|-------------|
| Excluded paths | Settings > OpenFeeder > Security | `config.excludePaths` | Path prefixes to hide from AI |
| Excluded types | Settings > OpenFeeder > Security | N/A (developer-controlled) | Post types to exclude |
| Author display | Settings > OpenFeeder > Security | N/A | `"name"` or `"hidden"` |
| API key | Settings > OpenFeeder | `config.apiKey` | Require Bearer auth |

### SSRF Protection

All adapters validate the `?url=` parameter to accept only **relative paths** (no host, no scheme). Absolute URLs are stripped to pathname only. Path traversal (`..`) is rejected.

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
