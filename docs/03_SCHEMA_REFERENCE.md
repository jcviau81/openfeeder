# OpenFeeder Schema Reference

Complete documentation of all OpenFeeder object structures, query parameters, and response formats.

---

## Table of Contents

1. [Feed Object](#feed-object)
2. [Item Object](#item-object)
3. [Media Object](#media-object)
4. [Pagination Object](#pagination-object)
5. [Error Response](#error-response)
6. [Query Parameters](#query-parameters)
7. [HTTP Status Codes](#http-status-codes)

---

## Feed Object

A Feed represents a collection of content items.

### Structure

```json
{
  "id": "string (required, unique)",
  "title": "string (required)",
  "description": "string",
  "type": "string (blog, news, product, etc.)",
  "url": "string (URL of feed/collection)",
  "itemCount": "integer (total items in feed)",
  "updated": "string (ISO 8601 timestamp)",
  "categories": ["string"] (optional),
  "author": "string (optional)",
  "language": "string (ISO 639-1, optional)"
}
```

### Example

```json
{
  "id": "feed-wordpress-blog",
  "title": "Company Blog",
  "description": "Latest articles and announcements from our team",
  "type": "blog",
  "url": "https://example.com/blog",
  "itemCount": 247,
  "updated": "2026-03-10T14:32:00Z",
  "categories": ["technology", "business"],
  "author": "Editorial Team",
  "language": "en"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique identifier. Must be stable across requests. No special characters. |
| `title` | string | ✓ | Human-readable feed name |
| `description` | string | | Summary of feed content/purpose |
| `type` | string | | Content category: `blog`, `news`, `product`, `event`, `media`, etc. |
| `url` | string | | Web address of the feed or its main page |
| `itemCount` | integer | | Total count of items currently in this feed |
| `updated` | string (ISO 8601) | | Timestamp of most recent item or feed update |
| `categories` | array[string] | | List of topic/category tags |
| `author` | string | | Feed owner/creator |
| `language` | string | | ISO 639-1 language code (e.g., `en`, `fr`, `de`) |

---

## Item Object

An Item represents a single piece of content within a Feed.

### Structure

```json
{
  "id": "string (required, unique within feed)",
  "title": "string (required)",
  "description": "string",
  "content": "string (HTML/Markdown, optional)",
  "author": "string",
  "published": "string (ISO 8601 timestamp)",
  "updated": "string (ISO 8601 timestamp)",
  "url": "string (link to item)",
  "categories": ["string"],
  "media": [MediaObject],
  "status": "string (published, draft, archived, optional)",
  "views": "integer (optional)",
  "comments": "integer (optional)"
}
```

### Example

```json
{
  "id": "item-post-42",
  "title": "Building Scalable REST APIs",
  "description": "Learn best practices for designing REST APIs that scale",
  "content": "<p>REST APIs are...</p><p>When designing...</p>",
  "author": "Alice Johnson",
  "published": "2026-03-10T10:15:00Z",
  "updated": "2026-03-10T10:15:00Z",
  "url": "https://example.com/blog/rest-apis",
  "categories": ["api", "backend", "architecture"],
  "media": [
    {
      "type": "image",
      "url": "https://example.com/images/rest-api.jpg",
      "title": "REST API Architecture Diagram"
    }
  ],
  "status": "published",
  "views": 1250,
  "comments": 8
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Unique within the feed. Stable across requests. |
| `title` | string | ✓ | Item headline |
| `description` | string | | Summary/excerpt of content |
| `content` | string | | Full content (HTML, Markdown, or plain text) |
| `author` | string | | Creator/publisher of item |
| `published` | string (ISO 8601) | ✓ | Creation/publication date |
| `updated` | string (ISO 8601) | | Last modification date. Same as `published` if never modified. |
| `url` | string | | Permalink to item |
| `categories` | array[string] | | Tags/topics |
| `media` | array[MediaObject] | | Attached images, videos, documents |
| `status` | string | | One of: `published`, `draft`, `archived`, `scheduled` |
| `views` | integer | | Page/view count (optional) |
| `comments` | integer | | Comment count (optional) |

---

## Media Object

Represents a media attachment (image, video, document).

### Structure

```json
{
  "type": "string (image, video, audio, document)",
  "url": "string (required, URL to media)",
  "title": "string",
  "description": "string",
  "mimeType": "string (optional, e.g., image/jpeg)",
  "size": "integer (optional, bytes)",
  "duration": "integer (optional, seconds for video/audio)",
  "width": "integer (optional, pixels)",
  "height": "integer (optional, pixels)"
}
```

### Example

```json
{
  "type": "image",
  "url": "https://example.com/images/featured.jpg",
  "title": "Featured Image",
  "description": "Article cover image",
  "mimeType": "image/jpeg",
  "size": 245678,
  "width": 1200,
  "height": 630
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Media type: `image`, `video`, `audio`, `document` |
| `url` | string | Direct link to media file |
| `title` | string | Human-readable name |
| `description` | string | Caption or alt text |
| `mimeType` | string | MIME type (e.g., `image/png`, `video/mp4`) |
| `size` | integer | File size in bytes |
| `duration` | integer | Duration in seconds (for video/audio) |
| `width` | integer | Width in pixels (for images/video) |
| `height` | integer | Height in pixels (for images/video) |

---

## Pagination Object

Included in list responses to support cursor-based pagination.

### Structure

```json
{
  "offset": "integer (number of items skipped)",
  "limit": "integer (max items returned in this page)",
  "total": "integer (total items available)",
  "hasMore": "boolean (true if more items exist)"
}
```

### Example

```json
{
  "offset": 40,
  "limit": 20,
  "total": 247,
  "hasMore": true
}
```

### Logic

- **offset**: How many items were skipped. Use this to get the next page.
- **limit**: Maximum items in this response (may be less if near end)
- **total**: Total available items (useful for progress bars)
- **hasMore**: Convenience flag. `true` if `offset + limit < total`

### Pagination Example

```javascript
// Get page 3 with 20 items per page
// offset = (page - 1) * limit
// offset = (3 - 1) * 20 = 40
GET /feeds/feed-001/items?offset=40&limit=20

// Response tells you if more exist
{
  "offset": 40,
  "limit": 20,
  "total": 247,
  "hasMore": true  // Can fetch from offset=60
}

// Last page
GET /feeds/feed-001/items?offset=240&limit=20
// Response:
{
  "offset": 240,
  "limit": 20,
  "total": 247,
  "hasMore": false  // No more items
}
```

---

## Error Response

All error responses follow this standard format.

### Structure

```json
{
  "success": false,
  "error": "string (human-readable message)",
  "code": "string (machine-readable error code)",
  "statusCode": "integer (HTTP status code)",
  "details": "object (optional, extra info)"
}
```

### Examples

**404 Not Found**
```json
{
  "success": false,
  "error": "Feed not found",
  "code": "FEED_NOT_FOUND",
  "statusCode": 404
}
```

**400 Bad Request**
```json
{
  "success": false,
  "error": "Invalid query parameter",
  "code": "INVALID_PARAMETER",
  "statusCode": 400,
  "details": {
    "parameter": "limit",
    "reason": "Must be between 1 and 100"
  }
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": "Internal server error",
  "code": "SERVER_ERROR",
  "statusCode": 500
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "INVALID_API_KEY",
  "statusCode": 401
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_API_KEY` | 401 | Authentication failed |
| `INVALID_PARAMETER` | 400 | Bad query parameter |
| `FEED_NOT_FOUND` | 404 | Feed ID doesn't exist |
| `ITEM_NOT_FOUND` | 404 | Item ID doesn't exist |
| `INVALID_JSON` | 400 | Malformed request body |
| `SERVER_ERROR` | 500 | Unexpected server error |
| `RATE_LIMITED` | 429 | Too many requests |
| `CORS_NOT_ALLOWED` | 403 | CORS policy violation |

---

## Query Parameters

### Common Parameters (All Endpoints)

All list endpoints support these parameters:

```
GET /endpoint?offset=0&limit=20
```

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `offset` | integer | 0 | N/A | Items to skip for pagination |
| `limit` | integer | 20 | 100 | Items per page |

### Feed Endpoints

**GET /feeds**

| Parameter | Type | Description |
|-----------|------|-------------|
| `offset` | integer | Pagination offset |
| `limit` | integer | Items per page |
| `search` | string | Filter by title/description |

**Example:**
```
GET /feeds?offset=20&limit=10&search=blog
```

### Item Endpoints

**GET /feeds/{feedId}/items**

| Parameter | Type | Format | Description |
|-----------|------|--------|-------------|
| `offset` | integer | | Pagination offset |
| `limit` | integer | | Items per page |
| `search` | string | | Full-text search in title/content |
| `category` | string | | Filter by exact category |
| `author` | string | | Filter by author name |
| `after` | string | ISO 8601 | Items published after this date |
| `before` | string | ISO 8601 | Items published before this date |
| `status` | string | | Filter by status (published, draft, etc.) |

**Examples:**
```
# Search for "tutorial"
GET /feeds/feed-001/items?search=tutorial

# Items from last 7 days
GET /feeds/feed-001/items?after=2026-03-03T00:00:00Z

# Specific category
GET /feeds/feed-001/items?category=javascript

# Combined filters
GET /feeds/feed-001/items?category=tutorial&after=2026-03-01T00:00:00Z&limit=50
```

### Search Endpoint

**GET /search**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `offset` | integer | Pagination offset |
| `limit` | integer | Items per page |
| `feeds` | string[] | Comma-separated feed IDs to search |

**Example:**
```
GET /search?q=openfeeder&feeds=feed-001,feed-002&limit=10
```

---

## HTTP Status Codes

### Success Responses

| Code | Name | Description |
|------|------|-------------|
| `200` | OK | Request succeeded, data returned |

### Client Errors

| Code | Name | Description |
|------|------|-------------|
| `400` | Bad Request | Invalid query parameter or malformed request |
| `401` | Unauthorized | API key missing or invalid |
| `403` | Forbidden | Permission denied (e.g., CORS blocked) |
| `404` | Not Found | Feed/item doesn't exist |
| `429` | Too Many Requests | Rate limit exceeded |

### Server Errors

| Code | Name | Description |
|------|------|-------------|
| `500` | Internal Server Error | Unexpected server-side error |
| `502` | Bad Gateway | Upstream service unavailable |
| `503` | Service Unavailable | Server temporarily down for maintenance |
| `504` | Gateway Timeout | Request took too long |

---

## Response Envelope

All responses follow this envelope structure:

### Success Response

```json
{
  "success": true,
  "apiVersion": "1.0.2",
  "timestamp": "2026-03-10T14:32:00Z",
  "data": {
    // endpoint-specific data
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2026-03-10T14:32:00Z"
}
```

---

## Type Definitions

### ISO 8601 Timestamps

All timestamps must follow ISO 8601 format with timezone:

```
2026-03-10T14:32:00Z          # UTC
2026-03-10T14:32:00+00:00     # UTC (alternate)
2026-03-10T09:32:00-05:00     # Eastern Time
```

Use UTC (`Z`) whenever possible.

### Feed ID Format

Feed IDs should be:
- Lowercase alphanumeric
- Use hyphens for readability (not underscores)
- Stable across requests
- Descriptive (e.g., `wordpress-blog-main`, not `f1`)

Good: `wordpress-blog`, `drupal-news-feed`, `shopify-products`  
Avoid: `Feed 1`, `MY-FEED!!!`, `random-uuid-12345`

### Item ID Format

Similar to Feed IDs but unique within the feed:

Good: `post-42`, `article-slug`, `product-sku-123`  
Avoid: `1`, `@@@@`, `very-long-id-that-is-hard-to-parse`

---

## Field Validation

### Required Fields

Every response must include:
- `success` (boolean)
- `data` (object, for success) or `error` (string, for failure)

### Recommended Fields

Include these when possible:
- `id` (for all objects)
- `updated` (for feeds/items)
- `url` (for items)
- `published` (for items)

### Optional Fields

Only include if you have data:
- `media` (only if item has attachments)
- `views`, `comments` (only if tracked)
- `language`, `categories` (only if applicable)

---

## Backward Compatibility

**Version 1.0.2** maintains compatibility with 1.0.0+.

When evolving the schema:
1. Add new optional fields (don't remove)
2. Maintain existing field names and types
3. Add new endpoints (don't change existing ones)
4. Use `apiVersion` field for client detection

---

## See Also

- [Implementation Guide](./01_IMPLEMENTATION_GUIDE.md)
- [Code Examples](./04_CODE_EXAMPLES.md)
- [OpenFeeder Specification](../spec/)

