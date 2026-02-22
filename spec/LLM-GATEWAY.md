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

- **Express.js:** `adapters/express/src/gateway.js`
- **WordPress:** `adapters/wordpress/includes/class-gateway.php`
