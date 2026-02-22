# OpenFeeder FastAPI Adapter

FastAPI router for the [OpenFeeder](https://github.com/jcviau81/openfeeder) protocol — an open standard for LLM-optimized content delivery.

## Installation

```bash
pip install openfeeder-fastapi
```

FastAPI and Pydantic are peer dependencies — make sure they're already in your project.

## Usage

```python
from fastapi import FastAPI
from openfeeder_fastapi import openfeeder_router

app = FastAPI()

app.include_router(openfeeder_router(
    site_name="My Blog",
    site_url="https://myblog.com",
    language="en",                          # optional, default "en"
    site_description="A blog about things", # optional

    # Return a page of items for the index feed
    get_items=my_get_items,  # async def get_items(page, limit) -> dict
    get_item=my_get_item,    # async def get_item(url) -> dict | None
))
```

### Callback signatures

```python
async def my_get_items(page: int, limit: int) -> dict:
    """Return a page of items."""
    items = await db.get_posts(page=page, limit=limit)
    total = await db.count_posts()
    return {
        "items": [
            {
                "url": post.slug,        # e.g. "/my-first-post"
                "title": post.title,
                "content": post.body,    # HTML or plain text
                "published": post.date,  # ISO 8601 string
            }
            for post in items
        ],
        "total": total,
    }


async def my_get_item(url: str) -> dict | None:
    """Return a single item by URL pathname, or None if not found."""
    post = await db.get_post_by_slug(url)
    if not post:
        return None
    return {
        "url": post.slug,
        "title": post.title,
        "content": post.body,
        "published": post.date,
    }
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /.well-known/openfeeder.json` | Discovery document |
| `GET /openfeeder` | Paginated content index |
| `GET /openfeeder?url=/post-slug` | Single page with chunks |
| `GET /openfeeder?q=search+term` | Search across titles and content |
| `GET /openfeeder?page=2&limit=5` | Paginated index with custom page size |

## Config Options

| Option | Type | Required | Description |
|---|---|---|---|
| `site_name` | `str` | ✅ | Display name of the site |
| `site_url` | `str` | ✅ | Canonical URL (e.g. `https://myblog.com`) |
| `language` | `str` | — | BCP-47 language tag (default: `"en"`) |
| `site_description` | `str` | — | Brief description of the site |
| `get_items` | `callable` | ✅ | `async (page, limit) -> { "items": [...], "total": int }` |
| `get_item` | `callable` | ✅ | `async (url) -> item dict \| None` |

### Item shape

Each item returned by `get_items` or `get_item` must have:

| Field | Type | Description |
|---|---|---|
| `url` | `str` | URL pathname (e.g. `/my-post`) |
| `title` | `str` | Page title |
| `content` | `str` | HTML or plain text body |
| `published` | `str` | ISO 8601 date string |

## Response Headers

All responses include:

```
Content-Type: application/json
X-OpenFeeder: 1.0
Access-Control-Allow-Origin: *
```

## Notes

- Zero extra dependencies — only uses Python standard library plus FastAPI/Pydantic as peer dependencies.
- Pure async throughout.
- Absolute URLs in `?url=` are automatically normalised to their pathname.
- Content is split into ~500-word chunks aligned on paragraph boundaries.
- Proper HTTP error responses (404, 500) with schema-compliant JSON.
