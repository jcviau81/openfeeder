# OpenFeeder Joomla Plugin

A Joomla 4/5 system plugin that exposes [OpenFeeder protocol](../../spec/SPEC.md) endpoints, providing LLM-optimized content from your Joomla site.

## Requirements

- Joomla 4.0 or later (compatible with Joomla 5)
- PHP 8.0+

## Installation

### Option A: Extension Manager (recommended)

1. Zip the `openfeeder` folder contents into `plg_system_openfeeder.zip`
2. Log in to your Joomla admin panel
3. Go to **System > Install > Extensions**
4. Upload the zip file

### Option B: Manual install

1. Copy the plugin files to `plugins/system/openfeeder/`
2. In the Joomla admin, go to **System > Manage > Extensions > Discover**
3. Click **Discover** then install the OpenFeeder plugin

## Enable

1. Go to **System > Manage > Plugins**
2. Search for "OpenFeeder"
3. Enable the plugin

## Configuration

In the Plugin Manager, click on OpenFeeder to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Enable OpenFeeder | Yes | Toggle the plugin on/off |
| Max Chunks per Response | 50 | Maximum content chunks returned per request (1-50) |
| Site Description Override | (empty) | Custom description for the discovery document |

## Endpoints

Once enabled, the plugin exposes two routes:

### Discovery

```
GET /.well-known/openfeeder.json
```

Returns site metadata and feed endpoint information per the OpenFeeder spec.

### Content API

```
GET /api/openfeeder
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Article path/alias to fetch |
| `q` | string | Search query for title/introtext matching |
| `page` | int | Page number for index (default: 1) |
| `limit` | int | Max chunks to return (default: 10) |

**Index mode** (no params): Returns a paginated list of published articles.

**Single article** (`url=`): Returns chunked, cleaned content for one article.

**Search** (`q=`): Returns articles matching the query, ranked by relevance.

## Caching

The plugin uses Joomla's built-in cache system (`openfeeder` group). Cache is automatically invalidated when articles are saved.

## License

GNU General Public License v2 or later.
