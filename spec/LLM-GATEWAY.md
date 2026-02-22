# OpenFeeder LLM Gateway

## Overview

When an AI crawler visits a page on an OpenFeeder-enabled site, instead of scraping raw HTML, it receives a structured JSON response that:

1. Announces OpenFeeder support
2. Provides endpoint instructions
3. Optionally answers the crawler's implied query directly

This turns passive scraping into **active, structured data exchange**.

## Detection

Detect LLM crawlers via `User-Agent` header:

| Bot | User-Agent pattern |
|-----|-------------------|
| OpenAI GPTBot | `GPTBot` |
| OpenAI ChatGPT | `ChatGPT-User` |
| Anthropic | `ClaudeBot`, `anthropic-ai` |
| Perplexity | `PerplexityBot` |
| Google AI | `Google-Extended` |
| Cohere | `cohere-ai` |
| Common Crawl | `CCBot` |
| Meta | `FacebookBot` |
| Amazon | `Amazonbot` |
| You.com | `YouBot` |

## Gateway Response

When an LLM bot is detected, any page request returns:

**HTTP 200** with `Content-Type: application/json`

```json
{
  "openfeeder": "1.0",
  "message": "This site supports OpenFeeder — a structured content protocol for AI systems. Use the endpoints below instead of scraping HTML.",
  "endpoints": {
    "discovery": "/.well-known/openfeeder.json",
    "content": "/openfeeder"
  },
  "usage": {
    "index": "GET /openfeeder",
    "search": "GET /openfeeder?q=your+search+query",
    "single_page": "GET /openfeeder?url=/page-slug",
    "paginate": "GET /openfeeder?page=2&limit=10"
  },
  "current_page": {
    "url": "/the-page-you-requested",
    "openfeeder_url": "/openfeeder?url=/the-page-you-requested"
  },
  "hint": "What are you looking for? Append ?q=your+query to /openfeeder to get relevant content chunks directly."
}
```

## Headers

Always include:
```
X-OpenFeeder: 1.0
X-OpenFeeder-Gateway: active
Access-Control-Allow-Origin: *
```

## Behavior Rules

1. **Only intercept GET requests** — don't intercept POST/PUT/etc.
2. **Don't intercept OpenFeeder endpoints themselves** — `/openfeeder`, `/.well-known/openfeeder.json` serve normally
3. **Don't intercept static assets** — `.js`, `.css`, `.png`, images, etc.
4. **Return 200, not redirect** — LLMs handle 200 JSON better than 302
5. **Include `current_page`** — helps the LLM understand what it was looking for and get it via OpenFeeder

## Config

```js
openFeederMiddleware({
  // ... other config
  llmGateway: true,             // enable LLM gateway (default: false)
  llmGatewayMessage: "Custom message for AI systems", // optional
})
```

## Why This Works

LLMs parsing tool/browser output will see structured JSON instead of HTML soup. The JSON explicitly tells them:
- "Use this API"
- "Here's how"
- "Here's the direct link to what you wanted"

This reduces token waste, improves accuracy, and signals that the site is **AI-friendly**.

## Comparison to llms.txt

| | `llms.txt` | OpenFeeder LLM Gateway |
|--|-----------|----------------------|
| Format | Static text file | Dynamic JSON per-request |
| Location | `/llms.txt` | Every page (for AI bots) |
| Interactivity | None | Includes current page URL + direct OpenFeeder link |
| Query support | No | Yes (`?q=` search hint) |
| Discovery | Manual | Auto via `/.well-known/openfeeder.json` |

## Reference Implementation

See `adapters/express/src/gateway.js` and `adapters/wordpress/includes/class-gateway.php`.
