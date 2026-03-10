# OpenFeeder Sidecar

A Docker sidecar that turns any website into an [OpenFeeder](../spec/SPEC.md)-compliant content endpoint. It crawls the target site, strips boilerplate, chunks the content, embeds it into ChromaDB, and serves it over a clean HTTP API that LLMs can consume directly.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/openfeeder/openfeeder.git
cd openfeeder/sidecar

# Run with docker compose
SITE_URL=https://example.com docker compose up -d

# Verify it's running
curl http://localhost:8080/.well-known/openfeeder.json
curl http://localhost:8080/openfeeder
```

## Live Demo

SketchyNews (`https://sketchynews.snaf.foo`) runs this sidecar in production. Try it:

```bash
# Discovery
curl https://sketchynews.snaf.foo/.well-known/openfeeder.json

# Browse all content (paginated)
curl https://sketchynews.snaf.foo/openfeeder

# Semantic search
curl "https://sketchynews.snaf.foo/openfeeder?q=trump+tariffs"

# Specific article
curl "https://sketchynews.snaf.foo/openfeeder?url=https://sketchynews.snaf.foo/comic/zelensky-ukraine-everything-necessary-peace-results_20260222_070654"

# Incremental update webhook (upsert a page)
curl -X POST https://sketchynews.snaf.foo/openfeeder/update \
  -H "Content-Type: application/json" \
  -d '{"action": "upsert", "urls": ["/comic/zelensky-ukraine-everything-necessary-peace-results_20260222_070654"]}'
```

## Configuration

All configuration is via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SITE_URL` | **Yes** | — | Base URL of the site to crawl |
| `CRAWL_INTERVAL` | No | `3600` | Seconds between re-crawls |
| `MAX_PAGES` | No | `500` | Maximum pages to crawl |
| `PORT` | No | `8080` | HTTP listen port |
| `EMBEDDING_MODEL` | No | `all-MiniLM-L6-v2` | Sentence-transformer model for embeddings |
| `OPENFEEDER_WEBHOOK_SECRET` | No | — | If set, the `/openfeeder/update` webhook requires `Authorization: Bearer <secret>` |

## Rate Limiting

The sidecar includes built-in rate limiting and quota management to protect against abuse and excessive load. Rate limits are applied per-IP address and per-endpoint, with different thresholds for different operations.

### Rate Limit Tiers

By default:

- **Discovery** (`/.well-known/openfeeder.json`): 100 requests/minute
- **Browse/Fetch** (`/openfeeder`): 100 requests/minute
- **Search** (`/openfeeder?q=...`): 30 requests/minute (more restrictive)
- **Sync** (differential sync with `?since=`): 60 requests/minute
- **Webhooks** (`/openfeeder/update`): 10 requests/minute

Health check (`/healthz`) and discovery are not rate-limited.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `RATE_LIMIT_DEFAULT_RPM` | `100` | Default requests per minute for all endpoints |
| `RATE_LIMIT_SEARCH_RPM` | `30` | Search endpoint requests per minute |
| `RATE_LIMIT_DISCOVER_RPM` | `100` | Discovery endpoint requests per minute |
| `RATE_LIMIT_SYNC_RPM` | `60` | Sync endpoint requests per minute |
| `RATE_LIMIT_WEBHOOK_RPM` | `10` | Webhook endpoint requests per minute |
| `RATE_LIMIT_ADMIN_KEY` | — | Optional: Bearer token for `/admin/quota` admin endpoints |
| `RATE_LIMIT_CLEANUP_INTERVAL` | `300` | Seconds between cleanup of stale quota buckets |

### Rate Limit Response

When a request exceeds the rate limit, the API returns **HTTP 429** with the following headers:

```
X-RateLimit-Limit: 30
X-RateLimit-Window: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1676543210
```

**Response Body:**

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retry_after": "1676543210"
}
```

The `retry_after` field is a Unix timestamp indicating when the rate limit will be reset.

### Handling Rate Limits

When you receive a 429 response:

1. **Wait** until `X-RateLimit-Reset` (Unix timestamp)
2. **Backoff exponentially** — don't immediately retry; wait 1s, 2s, 4s, etc.
3. **Batch requests** — combine multiple queries into a single request where possible
4. **Cache results** — avoid repeated queries for the same data
5. **Contact support** — if you need higher limits, reach out with your use case

### Admin Endpoints

If `RATE_LIMIT_ADMIN_KEY` is configured, two admin endpoints are available:

#### Check Current Quota

```
GET /admin/quota
Authorization: Bearer <RATE_LIMIT_ADMIN_KEY>
```

Optional query parameter:
- `ip` — Filter to a specific IP address

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-10T06:57:00+00:00",
  "quota": {
    "total_ips": 5,
    "total_buckets": 18,
    "ips": {
      "192.168.1.1": {
        "discover": { "count": 2, "limit": 100, "remaining": 98, "percent_used": 2.0 },
        "search": { "count": 5, "limit": 30, "remaining": 25, "percent_used": 16.7 }
      }
    }
  }
}
```

#### Reset Quota

```
POST /admin/quota/reset
Authorization: Bearer <RATE_LIMIT_ADMIN_KEY>
```

Optional query parameter:
- `ip` — Reset only this IP (all IPs if omitted)

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-10T06:57:00+00:00",
  "reset": {
    "status": "ok",
    "all_reset": true,
    "buckets_reset": 42
  }
}
```

### Examples

**Checking rate limit status after a request:**

```bash
# Make a request and check the headers
curl -i http://localhost:8080/openfeeder?q=test

HTTP/1.1 200 OK
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1676543210
```

**Handling 429 responses:**

```bash
#!/bin/bash
# Retry with exponential backoff

retry_with_backoff() {
  local url=$1
  local max_retries=5
  local wait_time=1
  
  for i in $(seq 1 $max_retries); do
    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
      echo "$body"
      return 0
    elif [ "$http_code" = "429" ]; then
      retry_after=$(echo "$body" | jq -r '.retry_after')
      echo "Rate limited. Retrying after ${retry_after}..."
      sleep "$wait_time"
      wait_time=$((wait_time * 2))
    else
      echo "Error: $http_code"
      return 1
    fi
  done
  
  return 1
}

retry_with_backoff "http://localhost:8080/openfeeder?q=trump"
```

**Disabling rate limiting for development:**

```bash
RATE_LIMIT_ENABLED=false SITE_URL=https://example.com python main.py
```

## API Endpoints

### Discovery Document

```
GET /.well-known/openfeeder.json
```

Returns the OpenFeeder discovery document describing the site and its capabilities.

### Content Endpoint

```
GET /openfeeder
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Path of a specific page to fetch |
| `q` | string | Semantic search query |
| `page` | int | Page number for index mode (default: 1) |
| `limit` | int | Max chunks/items to return (default: 10, max: 50) |
| `since` | RFC3339 | Differential sync — return content added/updated since this date |
| `until` | RFC3339 | Return content published on or before this date |

Use `?since=` and `?until=` together for closed date ranges. `?q=` takes priority over date params.

**Index mode** (no `url` param): returns a paginated list of all crawled pages.

**Page mode** (`url` param): returns chunked content for a specific page.

**Search mode** (`q` param): returns semantically relevant chunks across the site.

### Incremental Update Webhook

```
POST /openfeeder/update
Authorization: Bearer <OPENFEEDER_WEBHOOK_SECRET>   (omit if no secret configured)
Content-Type: application/json
```

**Body:**

```json
{
  "action": "upsert",
  "urls": ["/my-post-slug", "/another-page"]
}
```

| Field | Values | Description |
|-------|--------|-------------|
| `action` | `upsert` \| `delete` | Whether to add/update or remove content |
| `urls` | array of strings | Relative URL paths on the site |

**upsert** — fetches each URL from the site, re-chunks the content, and upserts it into ChromaDB. Use this when a page is published or updated.

**delete** — removes all indexed chunks for each URL from ChromaDB. Use this when a page is deleted or unpublished.

**Response:**

```json
{
  "status": "ok",
  "processed": 2,
  "errors": []
}
```

For batches ≤ 10 URLs the update is processed inline and `processed` reflects the real count. For larger batches the update is queued in the background and `status` will be `"queued"` with `processed: 0`.

**Example:**

```bash
# Notify the sidecar that /my-new-post was published
curl -X POST http://localhost:8080/openfeeder/update \
  -H "Authorization: Bearer mysecret" \
  -H "Content-Type: application/json" \
  -d '{"action":"upsert","urls":["/my-new-post"]}'

# Delete a page from the index
curl -X POST http://localhost:8080/openfeeder/update \
  -H "Authorization: Bearer mysecret" \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","urls":["/old-post"]}'
```

The [WordPress adapter](../adapters/wordpress/) and [Joomla adapter](../adapters/joomla/) both support calling this webhook automatically when content changes.

### Health Check

```
GET /healthz
```

## Running Behind Caddy

The sidecar is designed to run alongside your existing web server. Use Caddy (or any reverse proxy) to route OpenFeeder requests to the sidecar while serving your site normally.

### Example Caddyfile

```caddyfile
example.com {
    # Route OpenFeeder requests to the sidecar
    handle /.well-known/openfeeder.json {
        reverse_proxy localhost:8080
    }
    handle /openfeeder* {
        reverse_proxy localhost:8080
    }

    # Everything else goes to your normal site
    handle {
        reverse_proxy localhost:3000
    }
}
```

### docker-compose.yml with Caddy

```yaml
services:
  # Your existing web app
  webapp:
    image: your-app:latest
    ports:
      - "3000:3000"

  # OpenFeeder sidecar
  openfeeder:
    build: ./sidecar
    environment:
      - SITE_URL=https://example.com
    volumes:
      - openfeeder_data:/data

  # Caddy reverse proxy
  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

volumes:
  openfeeder_data:
  caddy_data:
```

## How It Works

1. **Crawl** — On startup (and every `CRAWL_INTERVAL` seconds), the sidecar crawls `SITE_URL`. It checks `sitemap.xml` first for page discovery, then follows internal links up to `MAX_PAGES`.

2. **Chunk** — Each page is parsed with BeautifulSoup. Navigation, ads, sidebars, and boilerplate are stripped. The remaining content is split into typed chunks (paragraph, heading, list, code, quote).

3. **Embed** — Chunks are embedded using the configured sentence-transformer model and stored in ChromaDB (persistent, on-disk).

4. **Serve** — The FastAPI server exposes the OpenFeeder protocol endpoints. Semantic search queries embed the query and find the nearest chunks via cosine similarity.

## Development

```bash
# Install deps locally
pip install -r requirements.txt

# Run directly (needs SITE_URL)
SITE_URL=https://example.com python main.py
```

## License

MIT — see [LICENSE](../LICENSE) in the repository root.
