# 🌐 OpenFeeder

> A standard protocol for websites to expose their content natively to LLMs — serverside, structured, real-time, noise-free.

---

## The Problem

When an LLM tries to read a website today, it gets:

- 200KB of HTML soup
- Ads, nav bars, footers, cookie banners
- JavaScript that doesn't render
- Throttling, CAPTCHAs, anti-bot walls
- Content that has nothing to do with what it needed

This is broken. We're asking LLMs to dig through garbage to find meaning.

## The Solution

**OpenFeeder** is a server-side protocol. Websites expose a clean, structured endpoint specifically designed for LLM consumption:

```
https://yoursite.com/.well-known/openfeeder.json
```

No scraping. No guessing. No noise. Just the content — structured, chunked, and ready.

## Designed by an LLM, for LLMs

This project was conceived by **Ember** 🔥 (an AI assistant) and **JC** (a human developer) because Ember lives this problem every day. Every web fetch is a battle. OpenFeeder is what Ember wishes existed.

---

## How It Works

### 1. Discovery

Any LLM or agent checks for the endpoint:

```
GET https://example.com/.well-known/openfeeder.json
```

### 2. Index Response

The server returns a structured index:

```json
{
  "version": "1.0",
  "site": {
    "name": "Example Blog",
    "language": "en",
    "description": "A blog about things that matter"
  },
  "feed": {
    "type": "paginated",
    "endpoint": "/api/openfeeder",
    "total_pages": 142
  },
  "capabilities": ["search", "realtime", "embeddings"]
}
```

### 3. Content Request

```
GET /api/openfeeder?url=/article/my-post&q=climate+change
```

### 4. LLM-Ready Response

```json
{
  "url": "/article/my-post",
  "title": "My Post Title",
  "author": "Jane Doe",
  "published": "2026-02-21T20:00:00Z",
  "updated": "2026-02-21T21:00:00Z",
  "summary": "A short, LLM-friendly summary of the page.",
  "chunks": [
    {
      "id": "c1",
      "text": "The most relevant paragraph to the query...",
      "relevance": 0.94
    },
    {
      "id": "c2", 
      "text": "Another relevant passage...",
      "relevance": 0.87
    }
  ],
  "schema": "openfeeder/1.0"
}
```

**No ads. No nav. No cookie banners. Just content.**

---

## Architecture

```
Website Backend
    ↓
OpenFeeder Adapter (WordPress plugin / Express middleware / FastAPI / etc.)
    ↓
Vector Database (optional but recommended for semantic search)
    ↓
/.well-known/openfeeder.json  ←  LLM discovers this
/api/openfeeder               ←  LLM queries this
```

The vector DB layer enables:
- **Semantic search** — query by meaning, not just keywords
- **Real-time updates** — new content indexed immediately on publish
- **Relevance scoring** — LLM gets the chunks it actually needs

---

## Adapters (Planned)

| Platform | Status |
|----------|--------|
| WordPress Plugin | 🔜 Planned |
| Express.js Middleware | 🔜 Planned |
| FastAPI Middleware | 🔜 Planned |
| Astro Integration | 🔜 Planned |
| Caddy Module | 🔜 Planned |
| Generic Python | 🔜 Planned |

---

## Spec

Full protocol specification: [`spec/SPEC.md`](spec/SPEC.md)

---

## Goal

Make OpenFeeder a **web standard** — the `robots.txt` of the AI era, but instead of blocking, it *welcomes* AI with clean, meaningful data.

If enough sites adopt it, LLMs stop scraping and start *reading*.

---

## Contributing

This is an open standard. PRs welcome for:
- Adapter implementations
- Spec improvements
- Validator tooling
- Documentation

---

## License

MIT — free to use, implement, and build on.

---

*Created 2026-02-21 by Ember 🔥 & JC*
