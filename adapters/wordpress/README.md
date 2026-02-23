# OpenFeeder WordPress Plugin

Expose your WordPress content to LLMs via the [OpenFeeder protocol](../../spec/SPEC.md). Published posts become available through a clean, structured JSON API — no scraping needed.

## Installation

### Option A: Upload ZIP

1. Download or build a ZIP of the `adapters/wordpress/` directory (rename it to `openfeeder/`).
2. In your WordPress admin, go to **Plugins > Add New > Upload Plugin**.
3. Upload the ZIP and click **Activate**.

### Option B: Copy to plugins directory

```bash
cp -r adapters/wordpress /path/to/wp-content/plugins/openfeeder
```

Then activate the plugin from **Plugins** in the WordPress admin.

### After activation

Visit **Settings > Permalinks** and click **Save Changes** once. This ensures WordPress picks up the new rewrite rules for the OpenFeeder endpoints.

## Settings

Navigate to **Settings > OpenFeeder** in the WordPress admin.

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable OpenFeeder** | Toggle the API on or off. When disabled, both endpoints return 404. | Enabled |
| **Site Description** | Custom description for the discovery document. Leave blank to use your site tagline. | *(tagline)* |
| **Max Chunks per Response** | Upper limit on chunks returned in a single content API response (1–50). | 50 |

## Endpoints

### Discovery

```
GET /.well-known/openfeeder.json
```

Returns a JSON document describing your site and its OpenFeeder capabilities. See `openfeeder.json.example` for a sample response.

### Content API

```
GET /openfeeder
```

**Index mode** (no `url` parameter): Returns a paginated list of all published posts.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `since` | RFC3339 | — | Differential sync — return posts published/updated since this date |
| `until` | RFC3339 | — | Return posts published on or before this date |

Use `?since=` and `?until=` together for a closed date range. `?q=` takes priority over date filters.

**Single post mode** (`url` parameter provided): Returns cleaned, chunked content for the post at that URL.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | — | Relative path of the post (e.g. `/2024/01/my-post/`) |
| `limit` | integer | 10 | Maximum chunks to return (capped by Max Chunks setting) |

## What it exposes

For each published post, the API returns:

- **Title** — post title
- **Author** — display name
- **Published / Updated** — ISO 8601 timestamps
- **Summary** — the excerpt, or an auto-generated one from the first ~40 words
- **Chunks** — the post body split into ~500-word sections, stripped of ads, shortcodes, widgets, navigation blocks, and all HTML

## What it strips

- Shortcodes: `[gallery]`, `[embed]`, `[video]`, `[audio]`, `[ad]`, `[adsense]`, `[sidebar]`, `[widget]`, `[social]`, `[share]`, `[related_posts]`, and all remaining shortcodes
- WordPress blocks: navigation, widget, social-links, search, tag-cloud, categories, archives, calendar, RSS, latest-comments
- All HTML tags (output is plain text)
- Excessive whitespace

## Caching

Responses are cached using WordPress transients (1-hour TTL). Cache is automatically invalidated when a post is published, updated, trashed, or deleted. Cache status is indicated in the response via:

- `meta.cached` — `true` if the response was served from cache
- `meta.cache_age_seconds` — age of the cached data in seconds
- `X-OpenFeeder-Cache` header — `HIT` or `MISS`

## Privacy

This plugin only exposes content that is **already publicly published** on your site. Draft, private, pending, and trashed posts are never included. Disable the plugin at any time from **Settings > OpenFeeder** to stop serving the API.

## Requirements

- WordPress 5.0+
- PHP 7.4+
- Pretty permalinks enabled (any structure other than "Plain")

## License

MIT — see the root project license for details.
