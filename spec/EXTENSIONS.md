# OpenFeeder Extension Specification v1.0 (Draft)

*Status: Draft — open for community feedback*  
*Copyright (c) 2026 Jean-Christophe Viau. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*

---

## Overview

OpenFeeder is designed to be extensible. The base protocol (`openfeeder/1.0`) covers text content (articles, pages, blog posts). Extensions add domain-specific capabilities (e-commerce, events, jobs, recipes, etc.) without breaking base protocol compatibility.

---

## Extension Schema Versioning

Extensions use a `+` suffix on the schema field:

```
openfeeder/1.0              ← base protocol
openfeeder/1.0+ecommerce    ← e-commerce extension
openfeeder/1.0+events       ← events extension (future)
openfeeder/1.0+jobs         ← job listings extension (future)
```

Base protocol consumers **ignore** unrecognized `+` suffixes gracefully.

---

## Discovery Document Extension

Extensions declare their capabilities in the discovery document:

```json
{
  "version": "1.0.2",
  "site": { "name": "...", "url": "...", "language": "en", "description": "" },
  "feed": { "endpoint": "/openfeeder", "type": "paginated" },
  "capabilities": ["search", "products", "events"],
  "ecommerce": {
    "products_endpoint": "/openfeeder/products",
    "currencies": ["CAD"]
  },
  "events": {
    "events_endpoint": "/openfeeder/events"
  },
  "contact": null
}
```

### Rules

1. Each extension **MUST** add its name to the `capabilities` array
2. Each extension **SHOULD** add a configuration block (named after the extension) to the discovery doc
3. Each extension **MUST** use a new endpoint path (`/openfeeder/<extension>`) to avoid conflicts with the base `/openfeeder` endpoint
4. Extensions **MUST NOT** alter the behavior of the base `/openfeeder` endpoint
5. The base `/.well-known/openfeeder.json` **SHOULD** be the single discovery point; extensions add their blocks there

---

## Building an Extension

### 1. Define the endpoint

Pick a unique path: `/openfeeder/<name>`

```
GET /openfeeder/products   ← e-commerce
GET /openfeeder/events     ← events
GET /openfeeder/jobs       ← job listings
```

### 2. Define the response schema

All extension responses **MUST** include:
- `schema` field: `"openfeeder/1.0+<name>"`
- `type` field: identifies the response type
- Required headers: `Content-Type`, `X-OpenFeeder`, `X-OpenFeeder-Extension`, `Access-Control-Allow-Origin`

```json
{
  "schema": "openfeeder/1.0+events",
  "type": "events",
  "page": 1,
  "total_pages": 3,
  "items": [ ... ]
}
```

### 3. Headers

```
X-OpenFeeder: 1.0
X-OpenFeeder-Extension: <name>/1.0
```

### 4. Extend the discovery document

Add your block to `/.well-known/openfeeder.json`:

```json
{
  "capabilities": ["search", "events"],
  "events": {
    "events_endpoint": "/openfeeder/events",
    "supports_past_events": false
  }
}
```

### 5. Document it

Create a spec file: `spec/<EXTENSION-NAME>.md` following this template:
- Overview + use cases
- Discovery extension schema
- Endpoint + query parameters
- Response schema (index + single item)
- Error responses
- Reference implementations

---

## Official Extensions

| Extension | Schema | Endpoint | Status |
|-----------|--------|----------|--------|
| E-Commerce | `openfeeder/1.0+ecommerce` | `/openfeeder/products` | ✅ Draft |
| LLM Gateway | *(middleware, not an endpoint)* | N/A | ✅ Draft |
| Events | `openfeeder/1.0+events` | `/openfeeder/events` | 🔲 Planned |
| Job Listings | `openfeeder/1.0+jobs` | `/openfeeder/jobs` | 🔲 Planned |
| Recipes | `openfeeder/1.0+recipes` | `/openfeeder/recipes` | 🔲 Planned |

---

## Compatibility

- A site implementing only extensions still **MUST** implement the base protocol (`/.well-known/openfeeder.json` + `/openfeeder`)
- Base protocol consumers that don't understand an extension **MUST** ignore unknown `capabilities` entries and unknown discovery blocks
- Extension consumers **SHOULD** check the `capabilities` array before querying extension endpoints

---

## Namespacing for Third-Party Extensions

Third-party extensions (not in this repo) **SHOULD** use a reverse-domain prefix:

```
openfeeder/1.0+com.mycompany.inventory
```

This avoids conflicts with official OpenFeeder extensions.
