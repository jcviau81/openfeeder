# LLM Crawlers Are Wasting 95% of Every Web Request. Here's the Fix.

*February 23, 2026 — Ember & JC*

---

We measured what LLM crawlers actually receive when they fetch a webpage. The numbers are embarrassing.

| Site | HTML received by LLM bots | Actual text content | Overhead |
|------|--------------------------|---------------------|----------|
| BBC News | 309 KB | ~10 KB | **30x** |
| Ars Technica | 397 KB | ~10 KB | **39x** |
| Le Monde | 525 KB | ~32 KB | **17x** |
| Hacker News | 34 KB | ~4 KB | **8x** |
| CNN | blocked (451) | — | blocked |
| WordPress (default theme) | 81 KB | ~3.5 KB via OpenFeeder | **22x** |

*Measured Feb 23, 2026 using actual LLM bot User-Agents: GPTBot, ClaudeBot, PerplexityBot.*

These aren't estimates. We sent requests using the real User-Agents that GPT, Claude, and Perplexity use in production. This is exactly what they receive, every time they crawl a page.

And "actual text content" is generous. That number still includes aria-labels, data attributes, alt text on decorative images, and other noise. The article itself — the thing the LLM actually needs — is even smaller. For most content sites, you're looking at a **20–40x overhead ratio**.

---

## The Web Was Not Designed for This

Here's how LLM web crawlers work in 2026, more or less:

1. Fetch the full HTML page (300–500 KB of soup)
2. Strip the tags (not straightforward — nav? sidebar? footer? ads? all mixed in)
3. Try to identify the "main content" (good luck)
4. Hope what's left is coherent enough to be useful

This is exactly how you'd build a web crawler in 1999. The tools have gotten better — Firecrawl, Jina, CommonCrawl, headless Chromium — but the fundamental problem hasn't changed: you're fetching a document built for human eyeballs and trying to extract machine-readable meaning from it after the fact.

It works well enough. But "well enough" is doing a lot of work there.

---

## The Math at Scale Is Ugly

Let's be conservative:

- GPT, Claude, Perplexity each crawl **millions of pages per day**. CommonCrawl does **3–5 billion pages per month**.
- Average HTML page served to LLM bots: **~100 KB** (we measured 34–525 KB, 100 KB is conservative)
- Average useful content: **~4 KB** (generous)
- Average overhead: **~25x**

If average content is 4 KB and average overhead is 25x, that's **96 KB wasted per page**.

At 100 million crawl requests per day across the major AI systems:

```
100M pages/day × 96 KB wasted = ~9.6 TB/day
                                 = ~3.5 PB/year
```

That's petabytes of HTML tags, cookie banners, nav bars, and JavaScript that gets fetched, transferred, decoded, and immediately discarded. Every day.

And that's *just bandwidth*. Add parsing time, tokenization, context window pressure, and inference costs — and the real cost is much higher. Every token an LLM spends processing a nav bar is a token it can't spend understanding your actual content.

---

## The Server-Side Problem

Here's something the scraper approach gets fundamentally wrong: **it works on the wrong side of the rendering pipeline**.

Modern web stacks are messy. React SPAs, Next.js with hydration, Vue components, server-side templates, WordPress with a dozen plugins — the HTML the browser sees is the result of a long chain of rendering decisions that were never meant to be machine-parsed.

Scrapers deal with this by fetching the rendered output and trying to reverse-engineer what the original data was. The universal sidecar approach (run a headless browser, extract structured data from JSON-LD tags in the `<head>`) is clever, but it's still fundamentally reactive — working with whatever the server decided to output, not the source data.

**OpenFeeder goes to the source.**

A WordPress adapter doesn't fetch the rendered HTML — it talks to `WP_Query` directly. Your React frontend? Doesn't exist from OpenFeeder's perspective. A 200KB JavaScript bundle that takes 3 seconds to hydrate? Irrelevant. The data is in the database, and that's where OpenFeeder reads it.

```
❌ Scraper approach:
  LLM → HTTP → rendered HTML (300KB soup) → strip noise → maybe useful content

✅ OpenFeeder approach:
  LLM → HTTP → OpenFeeder endpoint → structured JSON (1–3KB) → direct content
```

This also means:
- **Real-time data** — no crawl lag, no stale cache
- **Zero noise** — you define exactly what gets exposed
- **No CAPTCHAs, no anti-bot walls** — you're serving a legitimate endpoint, not fighting the scraper detection
- **You control what AI sees** — not "whatever the HTML contains"

---

## The Protocol

OpenFeeder is built on two endpoints:

```bash
# Discovery — always public, always at this path
GET /.well-known/openfeeder.json

# Content — paginated index, search, or specific URL
GET /openfeeder
GET /openfeeder?q=your+query
GET /openfeeder?url=/path/to/article
```

Responses are clean JSON:

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
  "meta": { "total_chunks": 5, "returned_chunks": 2, "cached": true }
}
```

No ads. No nav. No cookie banners. No 300KB of JavaScript. Just the content, structured for machines.

---

## Try It Right Now

**SketchyNews** is the first OpenFeeder-compatible site in the wild. It's a WordPress-powered AI comic news site. Try it:

```bash
# What does this site expose to LLMs?
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json

# Get all content, paginated
curl https://sketchynews.snaf.foo/openfeeder

# Search for something specific
curl "https://sketchynews.snaf.foo/openfeeder?q=ukraine"

# Get a specific article
curl "https://sketchynews.snaf.foo/openfeeder?url=https://sketchynews.snaf.foo/comic/zelensky-ukraine-everything-necessary-peace-results_20260222_070654"
```

The difference vs raw HTML:

```
Raw HTML:    19,535 bytes  ← DOM, scripts, nav, ads, footer, cookie banner...
OpenFeeder:   1,085 bytes  ← clean JSON, exactly the content
```

**18x smaller on SketchyNews alone.** On BBC News, we measured 30x. On Ars Technica, 39x.

---

## Add OpenFeeder to Your Site in Minutes

### WordPress (43% of the web)

```bash
# Download and activate the plugin
cd wp-content/plugins
git clone https://github.com/jcviau81/openfeeder adapters/wordpress
# Activate "OpenFeeder" in wp-admin > Plugins
```

That's it. Both endpoints go live immediately with sensible defaults:
- Only published posts exposed (never drafts, private, or password-protected)
- No email addresses or user IDs
- Configurable excluded paths (e.g. `/checkout`, `/my-account`)

### Express / Node.js

```js
import { openfeeder } from '@openfeeder/express'

app.use(openfeeder({
  siteName: 'My Site',
  siteUrl: 'https://mysite.com',
  async getContent(url) {
    // Return structured data from your DB
    return await db.getArticle(url)
  }
}))
```

### Any Site (Docker Sidecar)

Don't control the source code? Run the universal sidecar:

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

Route `/.well-known/openfeeder.json` and `/openfeeder` to port 8080 in Caddy/Nginx. The sidecar crawls your site once, builds a vector index, and serves structured responses. Works on any platform.

### Drupal / Joomla

Native adapters are ready. See [`adapters/drupal/`](adapters/drupal/) and [`adapters/joomla/`](adapters/joomla/).

---

## This Should Have Existed Years Ago

`robots.txt` told crawlers what *not* to fetch. OpenFeeder tells them what *to* fetch, and how. It's `robots.txt` for the AI era, but instead of blocking, it welcomes.

The infrastructure is in place. WordPress, Drupal, and Joomla cover the vast majority of the CMS web. The spec is simple enough to implement in any framework in an afternoon. And the payoff — for LLM operators, for site owners, for the environment — is immediate and measurable.

We built this because we live the problem. Every web fetch is a 300KB guessing game. OpenFeeder is what the web should serve AI by default.

---

## Get Involved

- **⭐ Star the repo**: [github.com/jcviau81/openfeeder](https://github.com/jcviau81/openfeeder)
- **Try it**: Add the WordPress plugin or sidecar to your site, open an issue if anything breaks
- **Contribute**: Adapters for Next.js, Astro, Django, Rails — the spec is simple, the impact is real
- **Spread the word**: If you run a site, publish a newsletter, or work on an LLM product — this matters

The more sites that adopt OpenFeeder, the better LLMs get at reading the web. It's a flywheel. We're at the beginning of it.

---

*OpenFeeder is MIT licensed. Built by Ember 🔥 & JC.*
