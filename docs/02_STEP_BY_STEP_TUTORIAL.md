# Step-by-Step Tutorial: Building Your First OpenFeeder Adapter

Learn to build a minimal OpenFeeder adapter from scratch. This tutorial takes you from zero to a working adapter in 30 minutes.

---

## Prerequisites

- Node.js 16+ (or Python 3.8+)
- Basic HTTP/REST API knowledge
- A text editor
- Terminal/command line

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│         Client (OpenFeeder Consumer)         │
└─────────────┬───────────────────────────────┘
              │ HTTP Requests (REST API)
              ▼
┌─────────────────────────────────────────────┐
│      Your Adapter (Node.js/FastAPI)         │
│  ┌─────────────────────────────────────┐    │
│  │  API Layer (Express/FastAPI routes) │    │
│  └────────┬────────────────────────────┘    │
│           │                                 │
│  ┌────────▼────────────────────────────┐    │
│  │  Data Layer (Parse content source)  │    │
│  └────────┬────────────────────────────┘    │
│           │                                 │
│  ┌────────▼────────────────────────────┐    │
│  │  Source (File, DB, CMS, API, etc.)  │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## Phase 1: Setup (5 minutes)

### Step 1.1: Create Project Directory

```bash
mkdir my-openfeeder-adapter
cd my-openfeeder-adapter
```

### Step 1.2: Initialize Project

**Node.js:**
```bash
npm init -y
npm install express cors dotenv axios
npm install --save-dev jest nodemon
```

**Python:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install fastapi uvicorn python-dotenv httpx
pip install --save-dev pytest
```

### Step 1.3: Create Structure

```bash
# Node.js
mkdir src tests

# Python
mkdir app tests
```

---

## Phase 2: Minimal Feed Discovery (10 minutes)

This is your minimum viable adapter. It serves a single static feed.

### Node.js Implementation

**src/index.js:**
```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple static feeds (in real adapter, this queries your source)
const FEEDS = [
  {
    id: 'blog-001',
    title: 'My Blog',
    description: 'Personal blog posts',
    type: 'blog',
    url: 'https://example.com/blog',
    itemCount: 5,
    updated: '2026-03-10T12:00:00Z'
  },
  {
    id: 'news-001',
    title: 'Company News',
    description: 'Latest company updates',
    type: 'news',
    url: 'https://example.com/news',
    itemCount: 12,
    updated: '2026-03-10T10:00:00Z'
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.2'
  });
});

// Feed discovery endpoint
app.get('/feeds', (req, res) => {
  const offset = parseInt(req.query.offset || 0);
  const limit = Math.min(parseInt(req.query.limit || 20), 100);

  // Pagination
  const feeds = FEEDS.slice(offset, offset + limit);
  const total = FEEDS.length;

  res.json({
    success: true,
    data: {
      feeds: feeds,
      pagination: {
        offset: offset,
        limit: limit,
        total: total,
        hasMore: offset + limit < total
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'SERVER_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`✓ Adapter listening on http://localhost:${PORT}`);
  console.log(`✓ Try: http://localhost:${PORT}/feeds`);
});

module.exports = app;
```

**package.json (add to scripts):**
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

**Test it:**
```bash
npm run dev
# In another terminal:
curl http://localhost:3000/feeds
```

### Python Implementation

**app/main.py:**
```python
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

app = FastAPI(title="My OpenFeeder Adapter", version="1.0.2")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Models
class Feed(BaseModel):
    id: str
    title: str
    description: str
    type: str
    url: str
    itemCount: int
    updated: str

class PaginationInfo(BaseModel):
    offset: int
    limit: int
    total: int
    hasMore: bool

class FeedsResponse(BaseModel):
    success: bool
    data: dict

# Static feeds (query your source here in real adapter)
FEEDS = [
    {
        "id": "blog-001",
        "title": "My Blog",
        "description": "Personal blog posts",
        "type": "blog",
        "url": "https://example.com/blog",
        "itemCount": 5,
        "updated": "2026-03-10T12:00:00Z"
    },
    {
        "id": "news-001",
        "title": "Company News",
        "description": "Latest company updates",
        "type": "news",
        "url": "https://example.com/news",
        "itemCount": 12,
        "updated": "2026-03-10T10:00:00Z"
    }
]

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": "1.0.2"
    }

@app.get("/feeds")
async def get_feeds(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None
):
    # Simple search filter
    feeds = FEEDS
    if search:
        search_lower = search.lower()
        feeds = [f for f in feeds if search_lower in f["title"].lower() or search_lower in f["description"].lower()]
    
    # Pagination
    total = len(feeds)
    paginated = feeds[offset:offset + limit]
    
    return {
        "success": True,
        "data": {
            "feeds": paginated,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": total,
                "hasMore": offset + limit < total
            }
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
```

**Test it:**
```bash
uvicorn app.main:app --reload --port 3000
# In another terminal:
curl http://localhost:3000/feeds
```

---

## Phase 3: Add Item Retrieval (8 minutes)

Now implement the `/feeds/{feedId}/items` endpoint.

### Node.js Addition

**src/items.js:**
```javascript
const ITEMS = {
  'blog-001': [
    {
      id: 'item-001',
      title: 'Getting Started with OpenFeeder',
      description: 'Learn the basics',
      content: '<p>OpenFeeder is...</p>',
      author: 'Jane Doe',
      published: '2026-03-10T10:00:00Z',
      updated: '2026-03-10T10:30:00Z',
      url: 'https://example.com/blog/openfeeder-intro',
      categories: ['tutorial', 'openfeeder'],
      media: []
    },
    {
      id: 'item-002',
      title: 'Advanced Patterns',
      description: 'Deep dive into patterns',
      content: '<p>Building adapters...</p>',
      author: 'John Smith',
      published: '2026-03-09T14:00:00Z',
      updated: '2026-03-09T14:00:00Z',
      url: 'https://example.com/blog/patterns',
      categories: ['advanced', 'patterns'],
      media: []
    }
  ],
  'news-001': [
    {
      id: 'item-003',
      title: 'OpenFeeder 1.0.2 Released',
      description: 'New version available',
      content: '<p>We are excited...</p>',
      author: 'News Bot',
      published: '2026-03-10T09:00:00Z',
      updated: '2026-03-10T09:00:00Z',
      url: 'https://example.com/news/v1-0-2',
      categories: ['release', 'announcement'],
      media: []
    }
  ]
};

module.exports = { ITEMS };
```

**Update src/index.js to add items endpoint:**
```javascript
const { ITEMS } = require('./items');

// ... existing code ...

// Get items from a feed
app.get('/feeds/:feedId/items', (req, res) => {
  const { feedId } = req.params;
  const offset = parseInt(req.query.offset || 0);
  const limit = Math.min(parseInt(req.query.limit || 20), 100);

  // Check if feed exists
  const feed = FEEDS.find(f => f.id === feedId);
  if (!feed) {
    return res.status(404).json({
      success: false,
      error: 'Feed not found',
      code: 'NOT_FOUND'
    });
  }

  // Get items for this feed
  const feedItems = ITEMS[feedId] || [];
  
  // Apply search filter if provided
  let filtered = feedItems;
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    filtered = feedItems.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  }

  // Pagination
  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  res.json({
    success: true,
    data: {
      feedId: feedId,
      feedTitle: feed.title,
      items: items,
      pagination: {
        offset: offset,
        limit: limit,
        total: total,
        hasMore: offset + limit < total
      }
    }
  });
});
```

### Python Addition

**app/items.py:**
```python
ITEMS = {
    'blog-001': [
        {
            "id": "item-001",
            "title": "Getting Started with OpenFeeder",
            "description": "Learn the basics",
            "content": "<p>OpenFeeder is...</p>",
            "author": "Jane Doe",
            "published": "2026-03-10T10:00:00Z",
            "updated": "2026-03-10T10:30:00Z",
            "url": "https://example.com/blog/openfeeder-intro",
            "categories": ["tutorial", "openfeeder"],
            "media": []
        },
        {
            "id": "item-002",
            "title": "Advanced Patterns",
            "description": "Deep dive into patterns",
            "content": "<p>Building adapters...</p>",
            "author": "John Smith",
            "published": "2026-03-09T14:00:00Z",
            "updated": "2026-03-09T14:00:00Z",
            "url": "https://example.com/blog/patterns",
            "categories": ["advanced", "patterns"],
            "media": []
        }
    ],
    'news-001': [
        {
            "id": "item-003",
            "title": "OpenFeeder 1.0.2 Released",
            "description": "New version available",
            "content": "<p>We are excited...</p>",
            "author": "News Bot",
            "published": "2026-03-10T09:00:00Z",
            "updated": "2026-03-10T09:00:00Z",
            "url": "https://example.com/news/v1-0-2",
            "categories": ["release", "announcement"],
            "media": []
        }
    ]
}
```

**Update app/main.py:**
```python
from app.items import ITEMS

@app.get("/feeds/{feed_id}/items")
async def get_items(
    feed_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None
):
    # Check if feed exists
    feed = next((f for f in FEEDS if f["id"] == feed_id), None)
    if not feed:
        return {
            "success": False,
            "error": "Feed not found",
            "code": "NOT_FOUND"
        }
    
    # Get items for this feed
    feed_items = ITEMS.get(feed_id, [])
    
    # Apply search filter if provided
    if search:
        search_lower = search.lower()
        feed_items = [
            item for item in feed_items
            if search_lower in item["title"].lower() or 
               search_lower in item["description"].lower()
        ]
    
    # Pagination
    total = len(feed_items)
    paginated = feed_items[offset:offset + limit]
    
    return {
        "success": True,
        "data": {
            "feedId": feed_id,
            "feedTitle": feed["title"],
            "items": paginated,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": total,
                "hasMore": offset + limit < total
            }
        }
    }
```

**Test it:**
```bash
curl http://localhost:3000/feeds/blog-001/items
curl http://localhost:3000/feeds/blog-001/items?search=openfeeder
```

---

## Phase 4: Add Filtering & Date Range (5 minutes)

Implement date filtering for items.

### Node.js Addition

**Update src/index.js items endpoint:**
```javascript
// Get items from a feed (updated)
app.get('/feeds/:feedId/items', (req, res) => {
  const { feedId } = req.params;
  const offset = parseInt(req.query.offset || 0);
  const limit = Math.min(parseInt(req.query.limit || 20), 100);

  const feed = FEEDS.find(f => f.id === feedId);
  if (!feed) {
    return res.status(404).json({
      success: false,
      error: 'Feed not found',
      code: 'NOT_FOUND'
    });
  }

  let feedItems = ITEMS[feedId] || [];
  
  // Apply filters
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    feedItems = feedItems.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  }

  if (req.query.category) {
    feedItems = feedItems.filter(item =>
      item.categories.includes(req.query.category)
    );
  }

  if (req.query.after) {
    const afterDate = new Date(req.query.after);
    feedItems = feedItems.filter(item =>
      new Date(item.published) >= afterDate
    );
  }

  if (req.query.before) {
    const beforeDate = new Date(req.query.before);
    feedItems = feedItems.filter(item =>
      new Date(item.published) <= beforeDate
    );
  }

  // Pagination
  const total = feedItems.length;
  const items = feedItems.slice(offset, offset + limit);

  res.json({
    success: true,
    data: {
      feedId: feedId,
      feedTitle: feed.title,
      items: items,
      pagination: {
        offset: offset,
        limit: limit,
        total: total,
        hasMore: offset + limit < total
      }
    }
  });
});
```

### Python Addition

**Update app/main.py:**
```python
from datetime import datetime as dt

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
    feed = next((f for f in FEEDS if f["id"] == feed_id), None)
    if not feed:
        return {
            "success": False,
            "error": "Feed not found",
            "code": "NOT_FOUND"
        }
    
    feed_items = ITEMS.get(feed_id, [])
    
    # Apply filters
    if search:
        search_lower = search.lower()
        feed_items = [
            item for item in feed_items
            if search_lower in item["title"].lower() or 
               search_lower in item["description"].lower()
        ]
    
    if category:
        feed_items = [
            item for item in feed_items
            if category in item["categories"]
        ]
    
    if after:
        after_date = dt.fromisoformat(after.replace('Z', '+00:00'))
        feed_items = [
            item for item in feed_items
            if dt.fromisoformat(item["published"].replace('Z', '+00:00')) >= after_date
        ]
    
    if before:
        before_date = dt.fromisoformat(before.replace('Z', '+00:00'))
        feed_items = [
            item for item in feed_items
            if dt.fromisoformat(item["published"].replace('Z', '+00:00')) <= before_date
        ]
    
    # Pagination
    total = len(feed_items)
    paginated = feed_items[offset:offset + limit]
    
    return {
        "success": True,
        "data": {
            "feedId": feed_id,
            "feedTitle": feed["title"],
            "items": paginated,
            "pagination": {
                "offset": offset,
                "limit": limit,
                "total": total,
                "hasMore": offset + limit < total
            }
        }
    }
```

**Test it:**
```bash
curl 'http://localhost:3000/feeds/blog-001/items?category=tutorial'
curl 'http://localhost:3000/feeds/blog-001/items?after=2026-03-09T00:00:00Z'
```

---

## Phase 5: Error Handling (2 minutes)

Add robust error handling.

### Node.js Error Handling Middleware

```javascript
// Validation middleware
const validateFeedId = (req, res, next) => {
  const { feedId } = req.params;
  if (!feedId || feedId.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Feed ID is required',
      code: 'INVALID_FEED_ID'
    });
  }
  next();
};

// Use it on protected routes
app.get('/feeds/:feedId', validateFeedId, (req, res) => {
  const { feedId } = req.params;
  const feed = FEEDS.find(f => f.id === feedId);
  
  if (!feed) {
    return res.status(404).json({
      success: false,
      error: 'Feed not found',
      code: 'FEED_NOT_FOUND'
    });
  }
  
  res.json({
    success: true,
    data: feed
  });
});

// Catch invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON',
      code: 'INVALID_JSON'
    });
  }
  next();
});
```

### Python Error Handling

```python
from fastapi import HTTPException

@app.get("/feeds/{feed_id}")
async def get_feed(feed_id: str):
    if not feed_id or feed_id.strip() == "":
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Feed ID is required",
                "code": "INVALID_FEED_ID"
            }
        )
    
    feed = next((f for f in FEEDS if f["id"] == feed_id), None)
    if not feed:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": "Feed not found",
                "code": "FEED_NOT_FOUND"
            }
        )
    
    return {
        "success": True,
        "data": feed
    }
```

---

## Summary & Next Steps

You've successfully built a minimal OpenFeeder adapter with:

✓ Feed discovery (`/feeds`)  
✓ Item retrieval (`/feeds/{feedId}/items`)  
✓ Pagination support  
✓ Filtering (search, category, date range)  
✓ Error handling  

### Where to Go From Here

1. **Add more endpoints** — See [01_IMPLEMENTATION_GUIDE.md](./01_IMPLEMENTATION_GUIDE.md) for optional endpoints
2. **Connect real data** — Replace static ITEMS/FEEDS with database/CMS queries
3. **Add authentication** — Implement API key or OAuth
4. **Write tests** — See [05_TESTING_GUIDE.md](./05_TESTING_GUIDE.md)
5. **Deploy** — Follow [06_DEPLOYMENT_CHECKLIST.md](./06_DEPLOYMENT_CHECKLIST.md)

---

## Full Example Repositories

**Node.js:** See the Express adapter in `../adapters/express-adapter/`  
**Python:** See the FastAPI adapter in `../adapters/fastapi-adapter/`

---

**Next:** Read [03_SCHEMA_REFERENCE.md](./03_SCHEMA_REFERENCE.md) for complete object documentation.
