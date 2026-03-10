# Code Examples: Building OpenFeeder Adapters

Complete, working examples in Node.js/Express and Python/FastAPI.

---

## Table of Contents

1. [Node.js/Express Examples](#nodejs-express)
2. [Python/FastAPI Examples](#pythonfastapi)
3. [Common Patterns](#common-patterns)
4. [Anti-Patterns](#anti-patterns)

---

## Node.js/Express

### Minimal Express Adapter

**setup.js:**
```javascript
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests'
});
app.use(limiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

module.exports = app;
```

**feeds.js:**
```javascript
const express = require('express');
const router = express.Router();

// Simulated database
const feeds = [
  {
    id: 'blog-main',
    title: 'Main Blog',
    description: 'Our company blog',
    type: 'blog',
    url: 'https://example.com/blog',
    itemCount: 42,
    updated: '2026-03-10T12:00:00Z'
  },
  {
    id: 'products',
    title: 'Product Feed',
    description: 'Current products',
    type: 'product',
    url: 'https://example.com/products',
    itemCount: 156,
    updated: '2026-03-10T10:30:00Z'
  }
];

// List feeds with pagination and search
router.get('/', (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset || 0));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20)));
    const search = (req.query.search || '').toLowerCase();

    // Apply search filter
    let filtered = feeds;
    if (search) {
      filtered = feeds.filter(feed =>
        feed.title.toLowerCase().includes(search) ||
        feed.description.toLowerCase().includes(search)
      );
    }

    // Pagination
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      success: true,
      apiVersion: '1.0.2',
      data: {
        feeds: paginated,
        pagination: {
          offset,
          limit,
          total,
          hasMore: offset + limit < total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feeds',
      code: 'SERVER_ERROR'
    });
  }
});

// Get specific feed
router.get('/:feedId', (req, res) => {
  const { feedId } = req.params;

  const feed = feeds.find(f => f.id === feedId);
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

module.exports = router;
```

**items.js:**
```javascript
const express = require('express');
const router = express.Router({ mergeParams: true });

// Simulated database
const items = {
  'blog-main': [
    {
      id: 'article-1',
      title: 'Getting Started with OpenFeeder',
      description: 'A beginner guide',
      content: '<p>Lorem ipsum...</p>',
      author: 'Jane Doe',
      published: '2026-03-10T09:00:00Z',
      updated: '2026-03-10T09:30:00Z',
      url: 'https://example.com/blog/openfeeder-intro',
      categories: ['tutorial', 'openfeeder'],
      media: []
    },
    {
      id: 'article-2',
      title: 'Advanced Adapter Patterns',
      description: 'For experienced developers',
      content: '<p>In this post...</p>',
      author: 'John Smith',
      published: '2026-03-09T14:00:00Z',
      updated: '2026-03-09T14:00:00Z',
      url: 'https://example.com/blog/patterns',
      categories: ['advanced', 'patterns'],
      media: []
    }
  ],
  'products': [
    {
      id: 'prod-001',
      title: 'OpenFeeder Pro',
      description: 'Professional edition',
      content: 'Full-featured content aggregation...',
      author: 'Product Team',
      published: '2026-03-01T10:00:00Z',
      updated: '2026-03-10T08:00:00Z',
      url: 'https://example.com/products/pro',
      categories: ['software', 'enterprise'],
      media: [{
        type: 'image',
        url: 'https://example.com/images/pro.jpg',
        title: 'Product Image'
      }]
    }
  ]
};

// Get items from feed with filtering
router.get('/', (req, res) => {
  try {
    const { feedId } = req.params;
    const offset = Math.max(0, parseInt(req.query.offset || 0));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 20)));

    // Fetch from database or API
    let feedItems = items[feedId] || [];
    
    if (!feedItems.length && !items.hasOwnProperty(feedId)) {
      return res.status(404).json({
        success: false,
        error: 'Feed not found',
        code: 'FEED_NOT_FOUND'
      });
    }

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

    if (req.query.author) {
      feedItems = feedItems.filter(item =>
        item.author.toLowerCase() === req.query.author.toLowerCase()
      );
    }

    // Date range filtering
    if (req.query.after) {
      const afterDate = new Date(req.query.after);
      if (isNaN(afterDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid after date',
          code: 'INVALID_PARAMETER'
        });
      }
      feedItems = feedItems.filter(item =>
        new Date(item.published) >= afterDate
      );
    }

    if (req.query.before) {
      const beforeDate = new Date(req.query.before);
      if (isNaN(beforeDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid before date',
          code: 'INVALID_PARAMETER'
        });
      }
      feedItems = feedItems.filter(item =>
        new Date(item.published) <= beforeDate
      );
    }

    // Sort by published date (newest first)
    feedItems.sort((a, b) => 
      new Date(b.published) - new Date(a.published)
    );

    // Pagination
    const total = feedItems.length;
    const paginated = feedItems.slice(offset, offset + limit);

    res.json({
      success: true,
      apiVersion: '1.0.2',
      data: {
        feedId,
        items: paginated,
        pagination: {
          offset,
          limit,
          total,
          hasMore: offset + limit < total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch items',
      code: 'SERVER_ERROR'
    });
  }
});

// Get single item
router.get('/:itemId', (req, res) => {
  const { feedId, itemId } = req.params;
  
  const feedItems = items[feedId] || [];
  const item = feedItems.find(i => i.id === itemId);

  if (!item) {
    return res.status(404).json({
      success: false,
      error: 'Item not found',
      code: 'ITEM_NOT_FOUND'
    });
  }

  res.json({
    success: true,
    data: item
  });
});

module.exports = router;
```

**index.js (Main server):**
```javascript
const app = require('./setup');
const feedRoutes = require('./feeds');
const itemRoutes = require('./items');

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.2'
  });
});

// Routes
app.use('/feeds', feedRoutes);
app.use('/feeds/:feedId/items', itemRoutes);

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
  console.error(err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'SERVER_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ Feeds: http://localhost:${PORT}/feeds`);
});
```

---

## Python/FastAPI

### Minimal FastAPI Adapter

**config.py:**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "OpenFeeder Adapter"
    app_version: str = "1.0.2"
    debug: bool = False
    port: int = 3000
    
    class Config:
        env_file = ".env"

settings = Settings()
```

**models.py:**
```python
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class Media(BaseModel):
    type: str
    url: str
    title: Optional[str] = None
    description: Optional[str] = None

class Item(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    published: str
    updated: Optional[str] = None
    url: Optional[str] = None
    categories: Optional[List[str]] = []
    media: Optional[List[Media]] = []

class Feed(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    type: str
    url: Optional[str] = None
    itemCount: int
    updated: str
    categories: Optional[List[str]] = []
    author: Optional[str] = None
    language: Optional[str] = None

class PaginationInfo(BaseModel):
    offset: int
    limit: int
    total: int
    hasMore: bool

class SuccessResponse(BaseModel):
    success: bool = True
    apiVersion: str = "1.0.2"
    data: dict

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    code: str
    statusCode: int = 400
```

**database.py:**
```python
# Simulated database (replace with real DB)
FEEDS = [
    {
        "id": "blog-main",
        "title": "Main Blog",
        "description": "Our company blog",
        "type": "blog",
        "url": "https://example.com/blog",
        "itemCount": 42,
        "updated": "2026-03-10T12:00:00Z"
    },
    {
        "id": "products",
        "title": "Product Feed",
        "description": "Current products",
        "type": "product",
        "url": "https://example.com/products",
        "itemCount": 156,
        "updated": "2026-03-10T10:30:00Z"
    }
]

ITEMS = {
    "blog-main": [
        {
            "id": "article-1",
            "title": "Getting Started with OpenFeeder",
            "description": "A beginner guide",
            "content": "<p>Lorem ipsum...</p>",
            "author": "Jane Doe",
            "published": "2026-03-10T09:00:00Z",
            "updated": "2026-03-10T09:30:00Z",
            "url": "https://example.com/blog/openfeeder-intro",
            "categories": ["tutorial", "openfeeder"],
            "media": []
        },
        {
            "id": "article-2",
            "title": "Advanced Adapter Patterns",
            "description": "For experienced developers",
            "content": "<p>In this post...</p>",
            "author": "John Smith",
            "published": "2026-03-09T14:00:00Z",
            "updated": "2026-03-09T14:00:00Z",
            "url": "https://example.com/blog/patterns",
            "categories": ["advanced", "patterns"],
            "media": []
        }
    ],
    "products": [
        {
            "id": "prod-001",
            "title": "OpenFeeder Pro",
            "description": "Professional edition",
            "content": "Full-featured content aggregation...",
            "author": "Product Team",
            "published": "2026-03-01T10:00:00Z",
            "updated": "2026-03-10T08:00:00Z",
            "url": "https://example.com/products/pro",
            "categories": ["software", "enterprise"],
            "media": [{
                "type": "image",
                "url": "https://example.com/images/pro.jpg",
                "title": "Product Image"
            }]
        }
    ]
}
```

**feeds.py:**
```python
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List
from .models import Feed, SuccessResponse
from .database import FEEDS

router = APIRouter(prefix="/feeds", tags=["feeds"])

@router.get("")
async def get_feeds(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None
):
    """List all feeds with optional search."""
    
    # Apply search filter
    filtered = FEEDS
    if search:
        search_lower = search.lower()
        filtered = [
            f for f in FEEDS
            if search_lower in f["title"].lower() or
               search_lower in f["description"].lower()
        ]
    
    # Pagination
    total = len(filtered)
    paginated = filtered[offset:offset + limit]
    
    return {
        "success": True,
        "apiVersion": "1.0.2",
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

@router.get("/{feed_id}")
async def get_feed(feed_id: str):
    """Get specific feed metadata."""
    
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

**items.py:**
```python
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from datetime import datetime
from .models import Item
from .database import ITEMS, FEEDS

router = APIRouter(prefix="/feeds/{feed_id}/items", tags=["items"])

@router.get("")
async def get_items(
    feed_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    author: Optional[str] = None,
    after: Optional[str] = None,
    before: Optional[str] = None
):
    """Get items from a feed with filtering and pagination."""
    
    # Check if feed exists
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
    
    # Get items
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
            if category in item.get("categories", [])
        ]
    
    if author:
        feed_items = [
            item for item in feed_items
            if item.get("author", "").lower() == author.lower()
        ]
    
    # Date filtering
    if after:
        try:
            after_date = datetime.fromisoformat(after.replace('Z', '+00:00'))
            feed_items = [
                item for item in feed_items
                if datetime.fromisoformat(item["published"].replace('Z', '+00:00')) >= after_date
            ]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "Invalid after date",
                    "code": "INVALID_PARAMETER"
                }
            )
    
    if before:
        try:
            before_date = datetime.fromisoformat(before.replace('Z', '+00:00'))
            feed_items = [
                item for item in feed_items
                if datetime.fromisoformat(item["published"].replace('Z', '+00:00')) <= before_date
            ]
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "Invalid before date",
                    "code": "INVALID_PARAMETER"
                }
            )
    
    # Sort by published date (newest first)
    feed_items.sort(
        key=lambda x: datetime.fromisoformat(x["published"].replace('Z', '+00:00')),
        reverse=True
    )
    
    # Pagination
    total = len(feed_items)
    paginated = feed_items[offset:offset + limit]
    
    return {
        "success": True,
        "apiVersion": "1.0.2",
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

@router.get("/{item_id}")
async def get_item(feed_id: str, item_id: str):
    """Get single item details."""
    
    feed_items = ITEMS.get(feed_id, [])
    item = next((i for i in feed_items if i["id"] == item_id), None)
    
    if not item:
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": "Item not found",
                "code": "ITEM_NOT_FOUND"
            }
        )
    
    return {
        "success": True,
        "data": item
    }
```

**main.py:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .feeds import router as feeds_router
from .items import router as items_router

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "version": settings.app_version
    }

# Include routers
app.include_router(feeds_router)
app.include_router(items_router)

# 404 handler
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "error": "Endpoint not found",
            "code": "NOT_FOUND"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=settings.port,
        log_level="info"
    )
```

---

## Common Patterns

### Authentication: API Key Middleware

**Node.js:**
```javascript
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validKeys = (process.env.VALID_API_KEYS || '').split(',');
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'INVALID_API_KEY'
    });
  }
  
  next();
};

app.use(authMiddleware);
```

**Python:**
```python
from fastapi import Header, HTTPException

async def verify_api_key(x_api_key: str = Header(None)):
    valid_keys = os.getenv('VALID_API_KEYS', '').split(',')
    
    if not x_api_key or x_api_key not in valid_keys:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )
    
    return x_api_key

# Use in route:
@app.get("/protected")
async def protected_route(api_key: str = Depends(verify_api_key)):
    ...
```

### Connecting to a Real Database

**Node.js with MongoDB:**
```javascript
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  id: String,
  feedId: String,
  title: String,
  published: Date,
  categories: [String],
  // ... other fields
});

const Item = mongoose.model('Item', itemSchema);

router.get('/:feedId/items', async (req, res) => {
  const { feedId } = req.params;
  
  try {
    const items = await Item
      .find({ feedId })
      .sort({ published: -1 })
      .limit(20)
      .exec();
    
    res.json({
      success: true,
      data: { items }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Database error'
    });
  }
});
```

**Python with SQLAlchemy:**
```python
from sqlalchemy import Column, String, DateTime, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class Item(Base):
    __tablename__ = "items"
    
    id = Column(String, primary_key=True)
    feed_id = Column(String)
    title = Column(String)
    published = Column(DateTime)
    categories = Column(String)  # JSON array as string

engine = create_engine('sqlite:///./test.db')
SessionLocal = sessionmaker(bind=engine)

@router.get("/{feed_id}/items")
async def get_items(feed_id: str):
    db = SessionLocal()
    items = db.query(Item).filter(Item.feed_id == feed_id).all()
    db.close()
    
    return {
        "success": True,
        "data": {"items": items}
    }
```

### Caching with Redis

**Node.js:**
```javascript
const redis = require('redis');
const client = redis.createClient();

router.get('/:feedId/items', async (req, res) => {
  const cacheKey = `items:${req.params.feedId}:${JSON.stringify(req.query)}`;
  
  // Check cache
  const cached = await client.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  // Fetch data
  const data = await fetchItems(req.params.feedId, req.query);
  
  // Store in cache for 5 minutes
  await client.setex(cacheKey, 300, JSON.stringify(data));
  
  res.json(data);
});
```

### Error Recovery & Retry Logic

```javascript
// Retry helper for failed requests
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Usage
const items = await withRetry(() => fetchItemsFromUpstream());
```

---

## Anti-Patterns

### ❌ Don't: Return Raw Errors

```javascript
// BAD
app.get('/feeds', async (req, res) => {
  const items = await db.query();  // Throws
  res.json(items);  // Will crash
});
```

### ✅ Do: Handle Errors Properly

```javascript
// GOOD
app.get('/feeds', async (req, res) => {
  try {
    const items = await db.query();
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Database error',
      code: 'DB_ERROR'
    });
  }
});
```

### ❌ Don't: Inconsistent Response Format

```javascript
// BAD
app.get('/feeds', (req, res) => {
  res.json(FEEDS);  // Sometimes wrapped, sometimes not
});

app.get('/feeds/:id', (req, res) => {
  res.json({ data: FEEDS[0] });  // Different format
});
```

### ✅ Do: Always Use Standard Envelope

```javascript
// GOOD
app.get('/feeds', (req, res) => {
  res.json({
    success: true,
    data: { feeds: FEEDS }
  });
});

app.get('/feeds/:id', (req, res) => {
  res.json({
    success: true,
    data: FEEDS[0]
  });
});
```

### ❌ Don't: Unbounded Queries

```javascript
// BAD - could return all 1 million items
app.get('/items', (req, res) => {
  const items = db.all();  // No limit!
  res.json(items);
});
```

### ✅ Do: Enforce Pagination Limits

```javascript
// GOOD
app.get('/items', (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit || 20));
  const offset = Math.max(0, parseInt(req.query.offset || 0));
  
  const items = db.query().offset(offset).limit(limit);
  res.json(items);
});
```

### ❌ Don't: Hardcode Configuration

```javascript
// BAD
const API_KEY = 'sk-12345';
const DB_URL = 'mongodb://prod.example.com';
```

### ✅ Do: Use Environment Variables

```javascript
// GOOD
const API_KEY = process.env.API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!API_KEY || !DB_URL) {
  throw new Error('Missing required environment variables');
}
```

---

See also:
- [Implementation Guide](./01_IMPLEMENTATION_GUIDE.md)
- [Step-by-Step Tutorial](./02_STEP_BY_STEP_TUTORIAL.md)
- [Testing Guide](./05_TESTING_GUIDE.md)

