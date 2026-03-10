# OpenFeeder Quick Reference

At-a-glance guide for implementing OpenFeeder adapters.

---

## API Endpoints Cheat Sheet

### Required Endpoints

```
GET /health
    ↓ No parameters
    ↓ Response: { status: "healthy", version: "1.0.2" }

GET /feeds?offset=0&limit=20&search=query
    ↓ Returns: { feeds: [], pagination: {} }
    
GET /feeds/{feedId}/items?offset=0&limit=20&search=query&category=tag&after=2026-03-01T00:00:00Z&before=2026-03-11T00:00:00Z
    ↓ Returns: { items: [], pagination: {} }
```

### Optional Endpoints

```
GET /feeds/{feedId}
    ↓ Returns: { id, title, description, type, url, itemCount, updated, ... }

GET /feeds/{feedId}/items/{itemId}
    ↓ Returns: { id, title, description, content, author, published, ... }

GET /search?q=query&offset=0&limit=20&feeds=feed1,feed2
    ↓ Returns: { results: [{ feedId, feedTitle, item }], pagination: {} }

GET /categories
    ↓ Returns: { categories: [{ id, name, itemCount }] }
```

---

## Response Envelope

### Success (HTTP 200)

```json
{
  "success": true,
  "apiVersion": "1.0.2",
  "timestamp": "2026-03-10T14:32:00Z",
  "data": { /* endpoint-specific data */ }
}
```

### Error (HTTP 4xx/5xx)

```json
{
  "success": false,
  "error": "Human-readable error",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "details": { /* optional */ }
}
```

---

## Object Schemas

### Feed

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `id` | string | ✓ | "blog-001" |
| `title` | string | ✓ | "My Blog" |
| `description` | string | | "All about..." |
| `type` | string | | "blog" |
| `url` | string | | "https://..." |
| `itemCount` | integer | | 42 |
| `updated` | ISO 8601 | | "2026-03-10T12:00:00Z" |

### Item

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `id` | string | ✓ | "item-001" |
| `title` | string | ✓ | "Post Title" |
| `description` | string | | "Short summary" |
| `content` | string | | "<p>Full HTML</p>" |
| `author` | string | | "Jane Doe" |
| `published` | ISO 8601 | ✓ | "2026-03-10T10:00:00Z" |
| `updated` | ISO 8601 | | "2026-03-10T10:30:00Z" |
| `url` | string | | "https://..." |
| `categories` | string[] | | ["tag1", "tag2"] |
| `media` | Media[] | | [{ type, url, title }] |

### Pagination

| Field | Type | Description |
|-------|------|-------------|
| `offset` | integer | Items skipped |
| `limit` | integer | Items returned |
| `total` | integer | Total available |
| `hasMore` | boolean | More items exist? |

---

## Query Parameters

| Parameter | Type | Max | Default | Notes |
|-----------|------|-----|---------|-------|
| `offset` | int | N/A | 0 | Skip this many items |
| `limit` | int | 100 | 20 | Return this many items |
| `search` | string | N/A | N/A | Search in title/description/content |
| `category` | string | N/A | N/A | Filter by exact category |
| `author` | string | N/A | N/A | Filter by author name |
| `after` | ISO 8601 | N/A | N/A | Items after this date |
| `before` | ISO 8601 | N/A | N/A | Items before this date |
| `status` | string | N/A | N/A | "published", "draft", etc. |

---

## HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameter (missing, wrong type, etc.) |
| 401 | Unauthorized | Invalid/missing API key |
| 403 | Forbidden | CORS blocked, permission denied |
| 404 | Not Found | Feed/item doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected server error |
| 502 | Bad Gateway | Upstream service unavailable |
| 503 | Service Unavailable | Server down for maintenance |

---

## Code Skeleton: Node.js/Express

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.2'
  });
});

// Feeds
app.get('/feeds', (req, res) => {
  const offset = parseInt(req.query.offset || 0);
  const limit = Math.min(100, parseInt(req.query.limit || 20));
  
  // TODO: Fetch feeds from data source
  const feeds = [];
  
  res.json({
    success: true,
    data: {
      feeds,
      pagination: {
        offset,
        limit,
        total: feeds.length,
        hasMore: offset + limit < feeds.length
      }
    }
  });
});

// Items
app.get('/feeds/:feedId/items', (req, res) => {
  const { feedId } = req.params;
  const offset = parseInt(req.query.offset || 0);
  const limit = Math.min(100, parseInt(req.query.limit || 20));
  
  // TODO: Fetch items from data source
  const items = [];
  
  res.json({
    success: true,
    data: {
      feedId,
      items,
      pagination: {
        offset,
        limit,
        total: items.length,
        hasMore: offset + limit < items.length
      }
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    error: 'Server error',
    code: 'SERVER_ERROR'
  });
});

app.listen(3000);
```

---

## Code Skeleton: Python/FastAPI

```python
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

app = FastAPI(version="1.0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "1.0.2"
    }

@app.get("/feeds")
async def get_feeds(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None
):
    # TODO: Fetch feeds from data source
    feeds = []
    
    return {
        "success": True,
        "data": {
            "feeds": feeds,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": len(feeds),
                "hasMore": offset + limit < len(feeds)
            }
        }
    }

@app.get("/feeds/{feed_id}/items")
async def get_items(
    feed_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    after: Optional[str] = None,
    before: Optional[str] = None
):
    # TODO: Fetch items from data source
    items = []
    
    return {
        "success": True,
        "data": {
            "feedId": feed_id,
            "items": items,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": len(items),
                "hasMore": offset + limit < len(items)
            }
        }
    }
```

---

## Common Patterns

### Pagination Loop (JavaScript)

```javascript
async function fetchAllItems(feedId) {
  const allItems = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const response = await fetch(
      `/feeds/${feedId}/items?offset=${offset}&limit=20`
    );
    const json = await response.json();
    
    allItems.push(...json.data.items);
    hasMore = json.data.pagination.hasMore;
    offset += 20;
  }

  return allItems;
}
```

### Date Filtering (JavaScript)

```javascript
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const response = await fetch(
  `/feeds/blog/items?after=${sevenDaysAgo.toISOString()}`
);
```

### API Key Middleware (Node.js)

```javascript
const authMiddleware = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.VALID_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY'
    });
  }
  next();
};

app.use(authMiddleware);
```

### Rate Limiting (Node.js)

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100                   // 100 requests per window
});

app.use(limiter);
```

### Caching (JavaScript)

```javascript
const cache = new Map();

app.get('/feeds/:feedId/items', (req, res) => {
  const key = `${req.params.feedId}:${JSON.stringify(req.query)}`;
  
  if (cache.has(key)) {
    return res.json(cache.get(key));
  }
  
  // Fetch and cache for 5 minutes
  const data = fetchItems();
  cache.set(key, data);
  setTimeout(() => cache.delete(key), 5 * 60 * 1000);
  
  res.json(data);
});
```

---

## Testing Checklist

```
[ ] Health endpoint responds
[ ] /feeds returns feeds array
[ ] Pagination works (offset, limit, hasMore)
[ ] Search filters results correctly
[ ] /feeds/{id}/items returns items array
[ ] Category filter works
[ ] Date range filtering works
[ ] Missing feed returns 404
[ ] Response schema matches spec
[ ] Dates are ISO 8601 format
[ ] Error responses have success: false
[ ] CORS headers present
[ ] Rate limiting active
[ ] Performance acceptable (<500ms)
```

---

## Deployment Checklist

```
[ ] Environment variables configured
[ ] Secrets not in code
[ ] Error handling implemented
[ ] Logging configured
[ ] Rate limiting enabled
[ ] CORS configured appropriately
[ ] Database indexes created
[ ] Health check endpoint working
[ ] Tests passing
[ ] Code coverage > 80%
[ ] Security headers present
[ ] Monitoring/alerting set up
[ ] Backups configured
[ ] Rollback plan documented
```

---

## Environment Variables Template

```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/db
DATABASE_POOL_SIZE=20

# API
API_KEY=your-key-here
API_RATE_LIMIT=100
API_TIMEOUT=30000

# Caching
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600

# Monitoring
SENTRY_DSN=https://...
DATADOG_API_KEY=...
```

---

## Important Standards

### Date Format (Always ISO 8601 with Timezone)

✓ `2026-03-10T14:32:00Z`  
✓ `2026-03-10T14:32:00+00:00`  
✗ `2026-03-10` (no time)  
✗ `03/10/2026` (wrong format)  
✗ `1678473120` (Unix timestamp, no timezone info)  

### Feed/Item IDs (Stable, Descriptive)

✓ `blog-main`, `product-sku-123`, `news-source-001`  
✗ `1`, `random-uuid`, `MY-FEED!!!`, `_internal`  

### Response Always Includes `success` Field

✓ `{ "success": true, "data": {...} }`  
✓ `{ "success": false, "error": "...", "code": "..." }`  
✗ `{ "data": {...} }` (missing success)  
✗ `{ "feeds": [...] }` (not wrapped)  

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| CORS errors in browser | Add `app.use(cors())` |
| Rate limit too strict | Adjust windowMs or max in config |
| Slow responses | Add database indexes, implement caching |
| Invalid JSON errors | Use `express.json()` middleware |
| Validation failing | Check dates are ISO 8601, required fields present |
| 404 on /feeds | Ensure route registered correctly |
| Memory leak | Clear caches periodically, use pagination |

---

## Resources

- [Full Implementation Guide](./01_IMPLEMENTATION_GUIDE.md)
- [Step-by-Step Tutorial](./02_STEP_BY_STEP_TUTORIAL.md)
- [Schema Reference](./03_SCHEMA_REFERENCE.md)
- [Code Examples](./04_CODE_EXAMPLES.md)
- [Testing Guide](./05_TESTING_GUIDE.md)
- [Deployment Checklist](./06_DEPLOYMENT_CHECKLIST.md)

---

## Quick Test

```bash
# Start adapter
npm start

# In another terminal
curl http://localhost:3000/health
curl http://localhost:3000/feeds
curl http://localhost:3000/feeds/blog-001/items?limit=5
```

---

**OpenFeeder v1.0.2** | Quick Reference | Print-friendly version available

