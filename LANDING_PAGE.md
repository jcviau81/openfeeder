# OpenFeeder Landing Page Copy

> This document contains the copy for the OpenFeeder landing page (GitHub Pages or subdomain). It defines the content sections, messaging hierarchy, and CTAs. A designer/developer should use this to build the actual page.

---

## Hero Section

**Headline:**
RSS for AI — structured content for LLMs

**Subheadline:**
An open standard for websites to expose clean, structured content to AI systems. No scraping. No guessing. No noise.

**Primary CTA:**
Add OpenFeeder to Your Site → (links to quickstart / adapter docs)

**Secondary CTA:**
Try the Live Demo → (links to curl example)

**Hero demo snippet:**
```bash
# See it in action
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json
```

---

## Problem Section

**Section title:** The web is broken for AI

Today, when an LLM reads a website, it gets:
- 200 KB of HTML soup
- Ads, nav bars, footers, cookie banners
- JavaScript that doesn't render
- Throttling, CAPTCHAs, or outright blocks

The result: **17-39x more data transferred than needed**, discarded immediately.

**Visual:** Side-by-side comparison

| | Scraping HTML | With OpenFeeder |
|---|---|---|
| BBC News | 309 KB | ~3 KB |
| Ars Technica | 397 KB | ~10 KB |
| WordPress site | 81 KB | ~3.5 KB |
| Tokens processed | ~77,000 | ~750 |

**Stat callout:** ~9.6 TB of wasted bandwidth per day across AI crawl traffic — just nav bars and cookie banners.

---

## Solution Section

**Section title:** OpenFeeder: content endpoints for LLMs

Websites expose two clean endpoints:

```
/.well-known/openfeeder.json   → Discovery (what's available)
/openfeeder                    → Content (structured JSON)
```

LLMs get exactly what they need in one request — structured, typed, noise-free.

**Key features (icon + one-liner each):**

- **Structured JSON** — Not text blobs. Typed fields, arrays, metadata. Ready for reasoning.
- **Semantic search** — Query content with `?q=ukraine` instead of spidering pages.
- **Differential sync** — Only fetch what changed with `?since=`. No redundant crawls.
- **Schema.org native** — JSON-LD types (recipes, products, articles, events) exposed directly.
- **Built-in caching** — `ETag`, `Cache-Control`, `304 Not Modified` in every adapter.
- **Privacy by default** — Never exposes drafts, user data, or admin content.

---

## How It Works Section

**Section title:** Server-side, not client-side

```
Scraping:    LLM → HTML (200KB) → strip noise → maybe content
OpenFeeder:  LLM → endpoint → structured JSON (1KB) → done
```

Native adapters query your database directly — the HTML rendering pipeline doesn't exist from OpenFeeder's perspective.

A React SPA with 200 KB of JavaScript? Irrelevant. OpenFeeder talks to the data source.

---

## Adapters Section

**Section title:** One install. Every major platform.

| Platform | Install | Data Source |
|----------|---------|-------------|
| WordPress | Plugin | WP_Query → database |
| Express | npm middleware | Your routes & ORM |
| Next.js | API route | getStaticProps / RSC |
| FastAPI | pip + router | Pydantic models |
| Astro | Integration | Content collections |
| Drupal | Module | Entity API |
| Joomla | Plugin | Content API |
| WooCommerce | Plugin extension | Product catalog |
| Vite | Plugin | Dev server |
| **Any site** | Universal Sidecar Proxy | JSON-LD & OpenGraph extraction |

**CTA:** See all adapters on GitHub →

---

## Demo Section

**Section title:** See it live

SketchyNews is the world's first OpenFeeder-compatible site.

```bash
# Discover what's available
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json

# Get all content
curl https://sketchynews.snaf.foo/openfeeder

# Search for specific topics
curl "https://sketchynews.snaf.foo/openfeeder?q=ukraine"

# Only content since a specific date
curl "https://sketchynews.snaf.foo/openfeeder?since=2026-02-20T00:00:00Z"
```

**Result:**
```
Raw HTML:    19,535 bytes
OpenFeeder:   1,085 bytes → 18x smaller, zero noise
```

**CTA:** View the full demo → (link to SketchyNews)

> Concept note: A demo GIF should show a terminal running these curl commands with the JSON output appearing, then a side-by-side with the raw HTML to show the contrast. ~60 seconds.

---

## Who It's For Section

**For site operators:**
Control how AI accesses your content. Reduce bot bandwidth by 17-39x. Stop subsidizing scrapers.

**For AI developers:**
Stop scraping HTML soup. Get clean, structured content in one API call. Fewer tokens, better results.

**For the ecosystem:**
An open standard that makes the web AI-readable — by design, not by force.

---

## Social Proof / Built With Section

**Section title:** Built with OpenFeeder

| Project | Adapter | Description |
|---------|---------|-------------|
| SketchyNews | Astro | Daily AI-generated comic news briefs |

*Using OpenFeeder? Add your site to the showcase →*

---

## Open Source Section

**Section title:** Open source. Open standard. MIT licensed.

- Full protocol spec (v1.0)
- 9 platform adapters + universal sidecar
- CLI tools, MCP server, and validator
- Comprehensive docs and test suite

**Primary CTA:** View on GitHub → (links to repo)
**Secondary CTA:** Read the spec → (links to spec/SPEC.md)

---

## Footer

**Tagline:** Designed by an LLM, for LLMs.

GitHub | Spec | Documentation | Contributing

MIT License
