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
curl http://localhost:8080/api/openfeeder
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

## API Endpoints

### Discovery Document

```
GET /.well-known/openfeeder.json
```

Returns the OpenFeeder discovery document describing the site and its capabilities.

### Content Endpoint

```
GET /api/openfeeder
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Path of a specific page to fetch |
| `q` | string | Semantic search query |
| `page` | int | Page number for index mode (default: 1) |
| `limit` | int | Max chunks/items to return (default: 10, max: 50) |

**Index mode** (no `url` param): returns a paginated list of all crawled pages.

**Page mode** (`url` param): returns chunked content for a specific page.

**Search mode** (`q` param): returns semantically relevant chunks across the site.

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
    handle /api/openfeeder* {
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
