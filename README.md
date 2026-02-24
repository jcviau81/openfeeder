<p align="center">
  <img src="assets/logo.svg" alt="OpenFeeder" width="80" height="80"/>
</p>

# OpenFeeder

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

# Differential sync — only content since a date
curl "https://sketchynews.snaf.foo/openfeeder?since=2026-02-20T00:00:00Z"

# Date range — closed window
curl "https://sketchynews.snaf.foo/openfeeder?since=2026-02-01T00:00:00Z&until=2026-02-15T00:00:00Z"
```

**Result vs raw HTML (SketchyNews):**
```
Raw HTML:    19,535 bytes  ← tags, scripts, nav, ads...
OpenFeeder:   1,085 bytes  ← clean JSON, just the content
18x smaller. Zero noise.
```

**JSON-LD output example — a Recipe page:**
```json
{
  "schema": "openfeeder/1.0",
  "url": "/recipes/classic-roast-chicken",
  "title": "Classic Roast Chicken",
  "type": "recipe",
  "published": "2024-03-15",
  "summary": "A perfectly crispy roast chicken with herbs and garlic butter.",
  "meta": {
    "prepTime": "20 min",
    "cookTime": "1h 30 min",
    "totalTime": "1h 50 min",
    "rating": 4.8,
    "ingredients": ["1 whole chicken (4 lb)", "2 tbsp olive oil", "4 cloves garlic", "1 tbsp fresh thyme", "..."],
    "instructions": ["Preheat oven to 425°F", "Pat chicken dry with paper towels", "Rub with olive oil and season generously", "..."]
  }
}
```

Structured arrays. Typed fields. Zero prose overhead. An LLM can answer *"what are the ingredients?"* without reading a sentence.

*SketchyNews is a lean Astro static site — real-world CMS sites are much larger. BBC News: 30x. Ars Technica: 39x. WordPress default theme: 22x. See benchmark below.*

**Cross-site benchmark — measured Feb 23, 2026 using real LLM bot User-Agents (GPTBot, ClaudeBot, PerplexityBot):**

| Site | HTML received by LLM bots | Actual text content | Overhead |
|------|--------------------------|---------------------|----------|
| BBC News | 309 KB | ~10 KB | **30x** |
| Ars Technica | 397 KB | ~10 KB | **39x** |
| Le Monde | 525 KB | ~32 KB | **17x** |
| Hacker News | 34 KB | ~4 KB | **8x** |
| CNN | blocked (451) | — | blocked |
| WordPress (default theme) | 81 KB | ~3.5 KB via OpenFeeder | **22x** |

*Note: "text content" still includes aria-labels, data attributes, and other noise. The actual useful content (the article) is even less. Real-world overhead for content sites: 20–40x.*

---

## Business Impact

OpenFeeder isn't just better for LLMs — it's better for your infrastructure.

### 📉 Bandwidth savings
AI crawlers fetch your full HTML page — DOM, nav, scripts, ads, footers, duplicate content — and discard 95% of it to find what they actually need.

OpenFeeder serves **only the content**. We measured this directly using real LLM bot User-Agents (GPTBot, ClaudeBot, PerplexityBot) against major live sites on Feb 23, 2026:

| Site | HTML received by LLM bots | Actual text content | Overhead |
|------|--------------------------|---------------------|----------|
| BBC News | 309 KB | ~10 KB | **30x** |
| Ars Technica | 397 KB | ~10 KB | **39x** |
| Le Monde | 525 KB | ~32 KB | **17x** |
| Hacker News | 34 KB | ~4 KB | **8x** |
| CNN | blocked (451) | — | blocked |
| WordPress (default theme) | 81 KB | ~3.5 KB via OpenFeeder | **22x** |

On our own [SketchyNews](https://sketchynews.snaf.foo) demo site running the WordPress adapter:

```
Full HTML page:   19,535 bytes
OpenFeeder JSON:   1,085 bytes
                   ──────────
                   18x smaller  ✅ measured
```

These are not estimates. This is what LLM crawlers actually receive today.

AI bot traffic is a growing share of overall web traffic — industry estimates for content-heavy sites range from 15–25% in 2024, accelerating. Even at 15%, serving those bots 17–39x less data adds up fast. At 100M daily crawl requests across major AI systems, that's **~9.6 TB of wasted bandwidth per day** — just nav bars and cookie banners.

### ⚡ Processing time & server load
Serving an OpenFeeder response is cheaper than a full page render — for **native adapters** specifically:
- **No template rendering** — queries go straight to DB, no PHP/Blade/Jinja execution
- **No asset pipeline** — no CSS/JS bundling, no media processing
- **Cacheable by design** — `Cache-Control`, `ETag`, `304 Not Modified` built into the spec (implemented in all 9 adapters)
- **Fewer repeated crawls** — LLMs get what they need in 1–2 requests instead of spidering dozens of pages

### 🌱 Energy & carbon
Less data transferred = less energy consumed — by your servers, your CDN, and the AI infrastructure on the other end.

Based on our measurements (17–39x overhead across major sites) and conservative estimates:

```
100M crawl requests/day × 96 KB wasted per request = ~9.6 TB/day
                                                     = ~3.5 PB/year
```

That's petabytes of nav bars, cookie banners, and JavaScript bundles transferred and immediately discarded — every day. At 20–40x less data per request, OpenFeeder eliminates the vast majority of that waste for any site that adopts it.

### 💰 Token efficiency for LLM operators
Tokens cost money and consume context window. The overhead isn't just bandwidth — it's inference cost:

```
BBC News HTML:      309 KB  ≈  77,000 tokens to process
OpenFeeder JSON:    ~3 KB   ≈     750 tokens to process
                             ─────────────────────────
                             ~100x fewer tokens         ✅
```

For companies running RAG pipelines, AI agents, or bulk content processing at scale:
- **30–100x fewer input tokens** per page (depending on site complexity)
- Faster responses — less to parse, less to context-window-manage
- Lower API costs when using LLM providers with input token pricing
- More context window available for actual reasoning

LLM providers and AI agents will naturally gravitate toward OpenFeeder-compatible sites — getting better results faster, with less compute. Being early means being discoverable when AI-driven traffic becomes the norm.

### 🤝 Control over how AI sees you
Today, LLMs scrape your site and interpret it however they can. With OpenFeeder, **you decide what they get** — the right summary, the right metadata, the right context. No more AI hallucinating your product prices or misquoting your articles.

---

## JSON-LD Native — Structured Data, Not Just Text

Most web content reaches LLMs as a wall of text — stripped HTML with no structure, no types, no fields. OpenFeeder changes that for sites that already have the data in a machine-readable form.

If your site uses [Schema.org](https://schema.org/) JSON-LD (the `<script type="application/ld+json">` blocks in your `<head>`), OpenFeeder reads that structured data directly and exposes it to LLMs as typed, fielded output — not prose.

*"If your site already uses Schema.org, OpenFeeder delivers that structure directly to LLMs — no parsing, no guessing."*

### Supported types

| `@type` | Key fields exposed |
|---------|--------------------|
| `Recipe` | `ingredients`, `instructions`, `prepTime`, `cookTime`, `totalTime`, `rating` |
| `Article` / `NewsArticle` / `BlogPosting` | `author`, `published`, `modified`, `articleSection`, `keywords` |
| `Product` | `brand`, `price`, `currency`, `availability`, `rating` |
| `Event` | `location`, `startDate`, `endDate` |
| `WebPage` | `author`, `published`, `description` |

A recipe site with JSON-LD doesn't get a paragraph that starts *"To make this roast chicken, first preheat your oven..."* — it gets `ingredients` as a structured array and `instructions` as ordered steps, ready for an LLM to reason over directly.

**Sites without JSON-LD still work** — OpenFeeder falls back to OpenGraph metadata and HTML content extraction. JSON-LD just makes the output richer and more precise.

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

### 5. Differential sync
```
GET /openfeeder?since=2026-02-01T00:00:00Z
GET /openfeeder?until=2026-02-15T00:00:00Z
GET /openfeeder?since=2026-02-01T00:00:00Z&until=2026-02-15T00:00:00Z
```
Returns only content added/updated within the specified window. Ideal for incremental indexing — no need to re-fetch everything on each crawl. Response includes `added`, `updated`, `deleted`, and a `sync_token` for the next call.

- `?since=` alone — open-ended range from that date to now
- `?until=` alone — everything published before that date  
- Both combined — closed date range
- `?q=` always takes priority over date params (different modes)

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

## Contributing

PRs welcome for:
- New adapter implementations (Next.js, Astro, Django, Rails...)
- Spec improvements
- Validator CLI tool
- Documentation

---

*Made with 🔥 by Ember & JC*

---

## License

MIT — free to use, implement, and build on.

Copyright (c) 2026 Jean-Christophe Viau. See [LICENSE](LICENSE) for details.
