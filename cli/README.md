# OpenFeeder CLI

Command-line tool for managing OpenFeeder sidecar installations.

## Install

```bash
npm install -g openfeeder-cli
```

Or run locally from the repo:

```bash
cd cli && npm install && npm link
```

## Commands

### `openfeeder setup`

Interactive wizard that generates a `docker-compose.yml` and `.env` file for your site.

```bash
openfeeder setup
# Prompts for: SITE_URL, port, crawl interval, max pages, webhook secret
# Generates docker-compose.yml, .env, and prints a Caddy config snippet
```

### `openfeeder status`

Quick health check — is the sidecar running and serving content?

```bash
openfeeder status
# ✅ Sidecar (localhost:8080)    UP — healthy
# ✅ Discovery endpoint          200 OK
# ✅ Content endpoint            200 OK — 347 pages indexed
```

### `openfeeder doctor`

Full diagnostic report with version info, Docker status, and warnings.

```bash
openfeeder doctor
```

### `openfeeder config`

View and update configuration stored in `.env`.

```bash
openfeeder config get          # Print all config values
openfeeder config show         # Same as get
openfeeder config set KEY VAL  # Update a value in .env
```

Examples:

```bash
openfeeder config set SITE_URL https://example.com
openfeeder config set MAX_PAGES 1000
openfeeder config set OPENFEEDER_WEBHOOK_SECRET my-secret-token
```

### `openfeeder crawl`

Trigger a manual re-crawl of the site.

```bash
openfeeder crawl
# ✔ Re-crawl triggered successfully
```

### `openfeeder reset`

Wipe all indexed content (ChromaDB) and start fresh.

```bash
openfeeder reset
# ? This will delete all indexed content. Are you sure? (y/N)
```

### `openfeeder logs`

Show sidecar container logs.

```bash
openfeeder logs           # Last 50 lines
openfeeder logs --follow  # Stream continuously
openfeeder logs -f        # Same as --follow
```

### `openfeeder validate <url>`

Validate a live URL for OpenFeeder protocol compliance.

```bash
openfeeder validate https://example.com
# ✅ Discovery endpoint          PASS
# ✅   version: 1.0              PASS
# ✅   site.url present          PASS
# ✅ Content endpoint (index)    PASS
# ✅   schema: openfeeder/1.0    PASS
# ...
```

### `openfeeder version`

Show CLI version and check for updates.

```bash
openfeeder version
# openfeeder-cli v1.0.0
# Up to date.
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SITE_URL` | Base URL of the site to crawl | (required) |
| `SIDECAR_URL` | Override sidecar URL | `http://localhost:PORT` |
| `PORT` | Sidecar port | `8080` |
| `CRAWL_INTERVAL` | Seconds between re-crawls | `3600` |
| `MAX_PAGES` | Maximum pages to crawl | `500` |
| `OPENFEEDER_WEBHOOK_SECRET` | Bearer token for webhook auth | (none) |

Configuration can be set via environment variables, a `.env` file in the working directory, or `openfeeder config set`.

## Requirements

- Node.js 18+
- Docker (for setup, reset, logs, and crawl fallback)
- The sidecar can also run standalone — point `SIDECAR_URL` to it
