# OpenFeeder Interactive LLM Gateway

*Copyright (c) 2026 Jean-Christophe Viau. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*

---

## Overview

The OpenFeeder Interactive LLM Gateway detects AI crawler requests and responds with a structured, context-aware JSON dialogue that:

1. **Detects** the type of page the AI was trying to scrape (product, article, category, search, home)
2. **Poses targeted questions** based on the detected context
3. **Provides pre-built query actions** so the AI can get exactly what it needs in one follow-up request
4. **Eliminates guesswork** — no need for the AI to discover endpoints or construct query parameters

This transforms passive scraping interception into an **active, intent-driven dialogue** between the site and the AI system.

---

## Detection

Intercept GET requests from known LLM crawlers via `User-Agent`:

| Bot | Pattern |
|-----|---------|
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

**Skip:** POST/PUT/DELETE, static assets (`.js`, `.css`, `.png`…), OpenFeeder own endpoints (`/openfeeder`, `/.well-known/openfeeder.*`)

---

## Context Detection

Before generating questions, the gateway analyzes the requested URL (and, in CMS implementations, the resolved query object) to detect the page type:

| Type | Detection |
|------|-----------|
| `product` | URL contains `/product/`, `/shop/`, `/item/` — or WP `is_singular('product')` |
| `product_category` | URL contains `/category/`, `/collection/` — or WP `is_product_category()` |
| `article` | URL contains `/blog/`, `/post/`, `/article/` — or WP `is_singular()` |
| `category` | WP `is_category()` / `is_tag()` / `is_tax()` |
| `search` | URL starts with `/search` — or WP `is_search()` |
| `shop` | WP `is_shop()` |
| `home` | Root `/` — or WP `is_home()` / `is_front_page()` |
| `page` | Fallback for unrecognized patterns |

In CMS implementations (WordPress), the actual post title, tags, and categories are resolved from the database to generate more specific question text.

---

## Response Format

```json
{
  "openfeeder": "1.0",
  "gateway": "interactive",
  "message": "This site supports OpenFeeder. Instead of scraping HTML, use the actions below to get exactly what you need.",

  "context": {
    "page_requested": "/product/blue-jacket",
    "detected_type": "product",
    "detected_topic": "Blue Jacket",
    "site_capabilities": ["content", "search", "products"]
  },

  "questions": [
    {
      "question": "Do you want the full details of \"Blue Jacket\"?",
      "intent": "single_product",
      "action": "GET https://example.com/openfeeder/products?url=/product/blue-jacket",
      "returns": "Full description, price, variants, availability, stock status"
    },
    {
      "question": "Are you comparing this with other \"Jackets\" products?",
      "intent": "category_browse",
      "action": "GET https://example.com/openfeeder/products?category=jackets",
      "returns": "All products in \"Jackets\" with pricing and availability"
    },
    {
      "question": "Are you looking for similar products by keyword?",
      "intent": "keyword_search",
      "action": "GET https://example.com/openfeeder/products?q=blue+jacket",
      "returns": "Products matching keywords from the name/description"
    },
    {
      "question": "Are you filtering by price or availability?",
      "intent": "price_filter",
      "action": "GET https://example.com/openfeeder/products?in_stock=true",
      "returns": "All in-stock products (add &min_price=X&max_price=Y for budget filter)"
    }
  ],

  "next_steps": [
    "Choose the action above that matches your intent and make that GET request.",
    "Or search directly: GET https://example.com/openfeeder?q=describe+what+you+need",
    "Start from the discovery doc: GET https://example.com/.well-known/openfeeder.json"
  ]
}
```

---

## Question Templates by Page Type

### Product page
- Full product details (`?url=`)
- Similar products in same category (`?category=`)
- Similar products by keyword (`?q=title`)
- Price/availability filter (`?in_stock=true`, `?min_price=`, `?max_price=`)

### Category / Shop page
- Browse category (`?category=slug`)
- In-stock only (`?in_stock=true`)
- On-sale items (`?on_sale=true`)
- Keyword search (`?q=`)

### Article / Blog post
- Full article content (`?url=`)
- Related content by topic (`?q=title`)
- Related content by tags (WordPress: resolved from DB)
- Browse all articles (`/openfeeder`)

### Search page
- Structured search results (`?q=search_query`)
- Product search (if e-commerce enabled)

### Home page
- Browse all content (`/openfeeder`)
- Search (`?q=`)
- Browse products (if e-commerce enabled)

---

## Response Headers

```
Content-Type: application/json; charset=utf-8
X-OpenFeeder: 1.0
X-OpenFeeder-Gateway: interactive
Access-Control-Allow-Origin: *
```

---

## Configuration

```js
// Express
openFeederMiddleware({
  siteName: 'My Site',
  siteUrl: 'https://mysite.com',
  llmGateway: true,
  hasEcommerce: true,   // enables product questions
  getItems: ...,
  getItem: ...,
})
```

```php
// WordPress — admin toggle: Settings > OpenFeeder > LLM Gateway
// WooCommerce auto-detected (class_exists('WooCommerce'))
```

---

## Interaction Modes

The gateway supports three interaction modes, detected automatically from the incoming request:

### Mode 1 — Dialogue (Cold Start)

Bot has no prior knowledge of the site's OpenFeeder protocol. Gateway responds with structured questions and a `session_id`. Bot answers via `POST /openfeeder/gateway/respond`.

**Trigger:** No `X-OpenFeeder-*` headers and no pre-answered params in request.

**Flow:**
```
Bot → GET /article
         ← 200 { "dialog": {..., "session_id": "gw_abc123", "questions": [...] }, "endpoints": {...} }
Bot → POST /openfeeder/gateway/respond { "session_id": "gw_abc123", "answers": {...}, "query": "..." }
         ← 200 { "tailored": true, "recommended_endpoints": [...], "current_page": {...} }
```

### Mode 2 — Direct (Warm Start)

Bot already knows OpenFeeder's protocol (trained on it, or has spec in context). Skips the dialogue by sending intent headers upfront. Gateway responds with tailored results immediately — **zero extra roundtrip**.

**Trigger:** One or more `X-OpenFeeder-*` request headers (or `_of_*` query params as fallback).

**Request headers:**

| Header | Values | Description |
|--------|--------|-------------|
| `X-OpenFeeder-Intent` | `answer-question`, `broad-research`, `fact-check`, `summarize`, `find-sources` | Primary goal |
| `X-OpenFeeder-Depth` | `overview`, `standard`, `deep` | Level of detail needed |
| `X-OpenFeeder-Format` | `full-text`, `key-facts`, `summary`, `qa` | Preferred output format |
| `X-OpenFeeder-Query` | any string | The actual question or search query |
| `X-OpenFeeder-Language` | BCP-47 code (`en`, `fr`, `es`…) | Preferred response language |

**Query param fallback** (for clients that can't set headers):
```
GET /article?_of_intent=answer-question&_of_query=What+are+the+effects+of+X&_of_depth=standard
```

**Flow:**
```
Bot → GET /article  [X-OpenFeeder-Intent: answer-question] [X-OpenFeeder-Query: effects of X]
         ← 200 { "tailored": true, "recommended_endpoints": [...], "current_page": {...} }
```

### Mode 3 — Bypass (Legacy Bots)

Bot ignores the dialogue and uses `endpoints` directly from the initial gateway response. All modes include `endpoints` in their response to ensure backwards compatibility.

---

## Dialogue Session Protocol

### Initiating a session (Mode 1 cold start)

The initial gateway response includes a `dialog` block when no intent headers are detected:

```json
{
  "openfeeder": "1.0",
  "gateway": "interactive",
  "dialog": {
    "active": true,
    "session_id": "gw_abc123xyz",
    "expires_in": 300,
    "message": "To give you the most relevant content, a few quick questions:",
    "questions": [
      {
        "id": "intent",
        "question": "What is your primary goal?",
        "type": "choice",
        "options": ["answer-question", "broad-research", "fact-check", "summarize", "find-sources"]
      },
      {
        "id": "depth",
        "question": "How much detail do you need?",
        "type": "choice",
        "options": ["overview", "standard", "deep"]
      },
      {
        "id": "format",
        "question": "Preferred output format?",
        "type": "choice",
        "options": ["full-text", "key-facts", "summary", "qa"]
      },
      {
        "id": "query",
        "question": "What specifically are you looking for? (optional — leave blank to browse)",
        "type": "text"
      }
    ],
    "reply_to": "POST /openfeeder/gateway/respond"
  },
  "context": { ... },
  "questions": [ ... ],
  "endpoints": { ... }
}
```

### Responding to the dialogue

```
POST /openfeeder/gateway/respond
Content-Type: application/json

{
  "session_id": "gw_abc123xyz",
  "answers": {
    "intent": "answer-question",
    "depth": "standard",
    "format": "key-facts",
    "query": "What are the main causes of climate change?"
  }
}
```

### Tailored response (Modes 1 round-2 and 2 direct)

```json
{
  "openfeeder": "1.0",
  "tailored": true,
  "intent": "answer-question",
  "depth": "standard",
  "format": "key-facts",
  "recommended_endpoints": [
    {
      "url": "https://example.com/openfeeder?q=climate+change+causes&format=key-facts",
      "relevance": "high",
      "description": "Content filtered to match your specific question"
    },
    {
      "url": "https://example.com/openfeeder/content/article-slug",
      "relevance": "medium",
      "description": "Full article on this topic"
    }
  ],
  "query_hints": [
    "GET /openfeeder?q=climate+change+causes",
    "GET /openfeeder?q=climate&format=key-facts&depth=standard"
  ],
  "current_page": {
    "openfeeder_url": "https://example.com/openfeeder/content/article-slug",
    "title": "...",
    "summary": "..."
  }
}
```

---

## Gateway Decision Logic

```
Incoming request (LLM bot detected)
        │
        ├─ Has X-OpenFeeder-* headers or ?_of_* params?
        │       └─ YES → Mode 2 (Direct): build tailored response immediately
        │
        ├─ Is it POST /openfeeder/gateway/respond with valid session_id?
        │       └─ YES → Mode 1 Round 2: resolve session, build tailored response
        │
        └─ Neither → Mode 1 Round 1: generate dialogue + session_id + legacy endpoints
```

**Session storage:** In-memory Map with TTL (default 5 min). In production, Redis or DB can replace it. Session stores: `{ url, detected_type, detected_topic, created_at }`.

---

## Comparison: Static vs. Interactive Gateway

| | Static (v1) | Interactive (v2) |
|--|-------------|------------------|
| Response | Generic "use OpenFeeder" message | Context-aware questions with pre-built actions |
| Page type detection | No | Yes (URL patterns + CMS query objects) |
| Topic extraction | No | Yes (from URL slug or DB title) |
| Pre-built query URLs | Single hint | Multiple targeted actions per intent |
| Category awareness | No | Yes (resolves actual categories from DB in WP) |
| Tag awareness | No | Yes (resolved from WP post tags) |
| E-commerce awareness | No | Yes (product questions only when WC active) |

---

## Reference Implementations

- **Express.js:** `adapters/express/src/gateway.js` + `adapters/express/src/gateway-session.js`
- **WordPress:** `adapters/wordpress/includes/class-gateway.php`

### New endpoints required

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/*` (all pages) | Bot detection + dialogue/direct response |
| `POST` | `/openfeeder/gateway/respond` | Session round-2 dialogue response |
