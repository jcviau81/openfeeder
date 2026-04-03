# RSS for AI: Why LLMs Shouldn't Scrape Your Website

*The web was not designed for LLMs. We can fix that without breaking it.*

---

When an LLM needs information from the web, it does something remarkably wasteful: it downloads the entire HTML page — navigation bars, cookie banners, JavaScript bundles, ad slots, footer links — and then throws away 95% of it to find the paragraph it actually needs.

This is scraping. And it's the default mode for every AI system that interacts with the web today.

It's also broken.

## The numbers are staggering

We measured real HTML pages served to LLM bots (GPTBot, ClaudeBot, PerplexityBot) against the actual text content an AI model needs:

| Site | HTML served to bots | Useful content | Overhead |
|------|---------------------|----------------|----------|
| BBC News | 309 KB | ~10 KB | **30x** |
| Ars Technica | 397 KB | ~10 KB | **39x** |
| Le Monde | 525 KB | ~32 KB | **17x** |
| WordPress (default theme) | 81 KB | ~3.5 KB | **22x** |
| CNN | blocked (451) | — | **blocked** |

That "useful content" column is generous — it still includes aria-labels, data attributes, and structural noise. The actual article text is even less.

Scale this to the web:

```
100M crawl requests/day × ~96 KB wasted per request = ~9.6 TB/day
                                                     = ~3.5 PB/year
```

That's petabytes of nav bars, cookie banners, and JavaScript bundles transferred daily and immediately discarded.

## It's not just bandwidth — it's tokens

Tokens cost money and consume context windows. The overhead isn't just a network problem — it's an inference cost problem:

```
BBC News HTML:      309 KB  ≈  77,000 tokens to process
Structured JSON:     ~3 KB  ≈     750 tokens to process
                             ─────────────────────────
                             ~100x fewer tokens
```

For companies running RAG pipelines, AI agents, or bulk content processing: that's 30-100x fewer input tokens per page. Faster responses. Lower API costs. More context window left for actual reasoning.

## The scraping arms race helps nobody

Site operators are increasingly hostile to AI crawlers — and understandably so. When bots hammer your server to download 300 KB pages and extract 10 KB of content, you're subsidizing someone else's AI pipeline with your bandwidth and compute.

The response has been predictable: `robots.txt` blocks, CAPTCHA walls, 451 status codes. CNN blocks AI bots entirely. Cloudflare offers "AI bot blocking" as a feature.

This creates a lose-lose situation:
- **AI systems** get inconsistent, incomplete, or blocked content
- **Site operators** spend engineering time on cat-and-mouse bot detection
- **Users** get worse AI responses because the underlying data is noisy or missing

We've seen this before. It's the same arms race that played out with ad blockers, paywalls, and web scrapers in the 2010s. Nobody won.

## What RSS got right (and what it didn't)

RSS solved a version of this problem 25 years ago. Instead of scraping every news site's HTML to build a feed reader, sites published structured XML feeds. Clean separation between content and presentation.

RSS worked because:
- Sites opted in by publishing a feed
- Consumers got exactly the content they needed
- No scraping, no parsing, no guessing

But RSS was designed for humans reading headlines. It's not suitable for LLMs because:
- No semantic search or filtering
- No content types or structured metadata
- No pagination or differential sync
- No rate limiting or access control
- No support for JSON-LD, Schema.org, or modern structured data

LLMs need something built for them.

## OpenFeeder: RSS for AI

[OpenFeeder](https://github.com/jcviau81/openfeeder) is an open protocol that lets websites expose their content to LLMs the way RSS exposes content to feed readers — structured, clean, and opt-in.

Every OpenFeeder-compatible site exposes two endpoints:

```
/.well-known/openfeeder.json   → discovery (capabilities, content types)
/openfeeder                    → content (structured JSON)
```

An LLM can discover what a site offers, query its content with semantic search, paginate through results, and sync only what's changed since the last visit — all in structured JSON, without ever touching HTML.

```bash
# Discovery
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json

# Search
curl "https://sketchynews.snaf.foo/openfeeder?q=ukraine"

# Differential sync — only new content since last check
curl "https://sketchynews.snaf.foo/openfeeder?since=2026-02-20T00:00:00Z"
```

The result for SketchyNews (a live production site):

```
Full HTML page:   19,535 bytes
OpenFeeder JSON:   1,085 bytes
                   ──────────
                   18x smaller
```

## Server-side, not client-side

Most LLM web tools — scrapers, Firecrawl, headless browsers — work *after* the rendering pipeline. They fetch HTML (or render it), then try to extract meaning from the noise.

OpenFeeder works *before* the rendering pipeline, directly at the data source:

```
Scraper approach:
  LLM → HTTP → rendered HTML (200KB) → strip noise → maybe useful content

OpenFeeder approach:
  LLM → HTTP → OpenFeeder endpoint → structured JSON (1KB) → direct content
```

Native adapters don't touch HTML at all. The WordPress adapter queries `WP_Query` directly. The Express adapter reads from your ORM. The FastAPI adapter uses your Pydantic models. A React SPA with 200 KB of JavaScript? Irrelevant — native adapters talk to the database, not the frontend.

## Adoption is one install away

OpenFeeder ships adapters for the platforms that power the web:

| Platform | Installation | Source |
|----------|-------------|--------|
| WordPress | Plugin upload or directory | `WP_Query` → DB |
| Express | `npm install openfeeder` + middleware | Your routes |
| Next.js | API route or middleware | `getStaticProps` / RSC |
| FastAPI | `pip install openfeeder` + router | Pydantic models |
| Astro | Integration | Content collections |
| Drupal | Module | Entity API |
| Joomla | Plugin | Content API |
| WooCommerce | Plugin extension | Product API |
| Vite | Plugin | Dev server |

For sites you don't control, the **Universal Sidecar Proxy** sits in front of any website and extracts structured data from JSON-LD and OpenGraph metadata in the `<head>` — which is server-rendered even on SPAs.

## Structured data, not just text

If your site uses Schema.org JSON-LD (most modern CMS sites do), OpenFeeder exposes that structure directly:

```json
{
  "schema": "openfeeder/1.0",
  "url": "/recipes/classic-roast-chicken",
  "title": "Classic Roast Chicken",
  "type": "recipe",
  "meta": {
    "prepTime": "20 min",
    "cookTime": "1h 30 min",
    "ingredients": ["1 whole chicken (4 lb)", "2 tbsp olive oil", "4 cloves garlic"],
    "instructions": ["Preheat oven to 425°F", "Pat chicken dry", "Rub with oil and season"]
  }
}
```

An LLM can answer "what are the ingredients?" without reading a single sentence. Structured arrays, typed fields, zero prose overhead.

## You control what AI sees

Without OpenFeeder, AI bots scrape your HTML and interpret whatever they find. With OpenFeeder, you explicitly define the content, depth, and format. Everything else is invisible.

OpenFeeder never exposes draft content, private pages, user data, or admin content by default. You can further restrict access with API keys, content type filters, and path exclusions.

This isn't about blocking AI — it's about giving site operators the same control they have over their RSS feed, but for LLMs.

## The web needs this

The current model — AI scraping HTML and site operators blocking AI — is unsustainable. It produces worse results for everyone.

OpenFeeder offers a third path: cooperation. Sites opt in to structured content delivery. LLMs get clean, efficient access. Both sides benefit.

RSS transformed how humans consume web content. OpenFeeder can do the same for AI.

---

**OpenFeeder is open source (MIT license) and free to use.** The spec, adapters, CLI tools, MCP server, and validator are all on GitHub:

[github.com/jcviau81/openfeeder](https://github.com/jcviau81/openfeeder)

*Try it yourself:*
```bash
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json
```
