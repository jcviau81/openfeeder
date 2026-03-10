# OpenFeeder Implementation Guide v1.0

A comprehensive guide to implementing custom OpenFeeder adapters.

**Version:** 1.0.2  
**Last Updated:** March 2026

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Implementation Structure](#implementation-structure)
3. [Required Endpoints](#required-endpoints)
4. [Optional Endpoints](#optional-endpoints)
5. [Authentication Patterns](#authentication-patterns)
6. [Getting Started](#getting-started)
7. [Schema Documentation](#schema-documentation)
8. [Code Examples](#code-examples)
9. [Testing](#testing)
10. [Deployment](#deployment)

---

## Core Concepts

### Feeds

A **feed** is a collection of items (content) from a source. In OpenFeeder, feeds are discovered, queried, and filtered through standard endpoints.

**Key properties:**
- **ID**: Unique identifier for the feed
- **Title**: Human-readable name
- **Description**: Purpose or content summary
- **URL**: Web address of the feed content
- **Type**: Content category (e.g., blog, product, news)
- **Updated**: ISO 8601 timestamp of last update
- **ItemCount**: Total number of items in feed

### Items

An **item** is a single piece of content within a feed (e.g., a blog post, product, news article).

**Key properties:**
- **ID**: Unique within the feed
- **Title**: Content headline
- **Description/Content**: Summary or full text
- **Author**: Creator of the item
- **Published**: Creation date (ISO 8601)
- **Updated**: Last modification date
- **URL**: Link to item
- **Categories**: Topics or tags
- **Media**: Attachments, images, media objects

### Pagination

Results are paginated to handle large datasets efficiently.

**Parameters:**
- `offset`: Number of items to skip (default: 0)
- `limit`: Number of items to return (max 100, default 20)

### Filtering

Filters allow clients to narrow results by specific criteria.

**Common filters:**
- `search`: Full-text search
- `category`: Filter by category/tag
- `author`: Filter by author
- `after`: Items published after date (ISO 8601)
- `before`: Items published before date
- `status`: Item status (published, draft, etc.)

---

## Implementation Structure

### Directory Layout

```
my-adapter/
├── src/
│   ├── index.js (or main entry point)
│   ├── feeds.js
│   ├── items.js
│   ├── filters.js
│   ├── auth.js
│   └── utils.js
├── tests/
│   ├── feeds.test.js
│   ├── items.test.js
│   └── fixtures/
├── .env.example
├── package.json (or pyproject.toml)
├── README.md
└── openfeeder.config.js
```

### Core Responsibilities

Each adapter must:

1. **Discover feeds** - Identify all available content sources
2. **Retrieve items** - Fetch content from feeds with pagination
3. **Support filtering** - Allow clients to search/filter results
4. **Handle errors gracefully** - Return proper HTTP status codes and error messages
5. **Authenticate** (optional) - Support API key, OAuth, or basic auth if needed

---

## Required Endpoints

### 1. Feed Discovery

**GET `/feeds`**

Discover all available feeds.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Items to skip |
| `limit` | integer | 20 | Items per page (max 100) |
| `search` | string | - | Filter by title/description |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "feeds": [
      {
        "id": "feed-001",
        "title": "Blog Posts",
        "description": "Latest articles",
        "type": "blog",
        "url": "https://example.com/blog",
        "itemCount": 150,
        "updated": "2026-03-10T12:30:00Z"
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 20,
      "total": 5,
      "hasMore": false
    }
  }
}
```

### 2. Item Retrieval

**GET `/feeds/{feedId}/items`**

Retrieve items from a specific feed.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `feedId` | string | Feed identifier |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `offset` | integer | 0 | Items to skip |
| `limit` | integer | 20 | Items per page |
| `search` | string | - | Full-text search |
| `category` | string | - | Filter by category |
| `after` | string (ISO8601) | - | Items after date |
| `before` | string (ISO8601) | - | Items before date |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "feedId": "feed-001",
    "feedTitle": "Blog Posts",
    "items": [
      {
        "id": "item-001",
        "title": "Getting Started with OpenFeeder",
        "description": "Learn how to implement...",
        "content": "Full HTML/Markdown content here",
        "author": "Jane Doe",
        "published": "2026-03-10T10:00:00Z",
        "updated": "2026-03-10T10:30:00Z",
        "url": "https://example.com/blog/openfeeder-intro",
        "categories": ["tutorial", "openfeeder"],
        "media": [
          {
            "type": "image",
            "url": "https://example.com/images/cover.jpg",
            "title": "Cover Image"
          }
        ]
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 20,
      "total": 150,
      "hasMore": true
    }
  }
}
```

### 3. Feed Details

**GET `/feeds/{feedId}`**

Retrieve metadata for a specific feed.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "feed-001",
    "title": "Blog Posts",
    "description": "Latest articles from our blog",
    "type": "blog",
    "url": "https://example.com/blog",
    "itemCount": 150,
    "updated": "2026-03-10T12:30:00Z",
    "categories": ["blog", "news"],
    "author": "Example Corp",
    "language": "en"
  }
}
```

---

## Optional Endpoints

### 1. Item Details

**GET `/feeds/{feedId}/items/{itemId}`**

Retrieve detailed information about a single item.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "item-001",
    "feedId": "feed-001",
    "title": "Getting Started",
    "description": "...",
    "content": "...",
    "author": "Jane Doe",
    "published": "2026-03-10T10:00:00Z",
    "updated": "2026-03-10T10:30:00Z",
    "url": "https://example.com/blog/openfeeder-intro",
    "categories": ["tutorial"],
    "media": [],
    "comments": 5,
    "views": 1200
  }
}
```

### 2. Search Across All Feeds

**GET `/search`**

Full-text search across all feeds.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |
| `offset` | integer | Pagination offset |
| `limit` | integer | Results per page |
| `feeds` | string[] | Feed IDs to search (comma-separated) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "query": "openfeeder",
    "results": [
      {
        "feedId": "feed-001",
        "feedTitle": "Blog Posts",
        "item": {
          "id": "item-001",
          "title": "Getting Started with OpenFeeder",
          "snippet": "Learn how to implement...",
          "url": "https://example.com/blog/openfeeder-intro"
        }
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 20,
      "total": 42,
      "hasMore": true
    }
  }
}
```

### 3. Categories

**GET `/categories`**

List all available categories across feeds.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "tutorial",
        "name": "Tutorial",
        "itemCount": 24
      },
      {
        "id": "news",
        "name": "News",
        "itemCount": 78
      }
    ]
  }
}
```

### 4. Health Check

**GET `/health`**

Server availability check (no authentication required).

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-10T12:30:00Z",
  "version": "1.0.2"
}
```

---

## Authentication Patterns

### No Authentication (Public)

For public APIs, no authentication is required.

### API Key (Recommended for Simple Cases)

**Header:** `X-API-Key: your-api-key`

```bash
curl -H "X-API-Key: sk-1234567890" https://api.example.com/feeds
```

**Implementation:**
```javascript
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !isValidApiKey(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'INVALID_API_KEY'
    });
  }
  next();
}
```

### Bearer Token (OAuth 2.0)

**Header:** `Authorization: Bearer <token>`

```bash
curl -H "Authorization: Bearer eyJhbGc..." https://api.example.com/feeds
```

### Basic Auth

**Header:** `Authorization: Basic base64(username:password)`

```bash
curl -u username:password https://api.example.com/feeds
```

### No Auth + Rate Limiting

Even public APIs should implement rate limiting:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});

app.use('/feeds', limiter);
```

---

## Getting Started

See [02_STEP_BY_STEP_TUTORIAL.md](./02_STEP_BY_STEP_TUTORIAL.md) for a complete walkthrough of building your first adapter.

---

## Schema Documentation

See [03_SCHEMA_REFERENCE.md](./03_SCHEMA_REFERENCE.md) for complete object structure documentation.

---

## Code Examples

See [04_CODE_EXAMPLES.md](./04_CODE_EXAMPLES.md) for working examples in Node.js/Express and Python/FastAPI.

---

## Testing

See [05_TESTING_GUIDE.md](./05_TESTING_GUIDE.md) for testing strategies and CI/CD integration.

---

## Deployment

See [06_DEPLOYMENT_CHECKLIST.md](./06_DEPLOYMENT_CHECKLIST.md) for production readiness guidelines.

---

## Common Patterns

### Error Handling

All endpoints must return proper HTTP status codes:

```json
{
  "success": false,
  "error": "Item not found",
  "code": "NOT_FOUND",
  "statusCode": 404
}
```

### CORS Headers

Always include CORS headers for browser-based clients:

```javascript
app.use(cors({
  origin: '*',
  methods: ['GET'],
  allowedHeaders: ['Content-Type', 'X-API-Key']
}));
```

### Versioning

Include API version in responses:

```json
{
  "success": true,
  "apiVersion": "1.0.2",
  "data": { ... }
}
```

---

## Resources

- [OpenFeeder Specification](../spec/)
- [OpenFeeder Validator](../validator/)
- [Existing Adapters](../adapters/)
- [Testing Suite](../testing/)

---

**Next Step:** Read [02_STEP_BY_STEP_TUTORIAL.md](./02_STEP_BY_STEP_TUTORIAL.md) to build your first adapter.
