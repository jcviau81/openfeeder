# OpenFeeder Joomla Adapter

A Joomla 4/5 adapter that exposes [OpenFeeder protocol](../../spec/SPEC.md) endpoints, providing LLM-optimized content from your Joomla site.

## Requirements

- Joomla 4.0 or later (compatible with Joomla 5)
- PHP 8.0+

## Quick Install (Standalone Gateway)

This is the simplest approach — a single PHP file in your Joomla webroot. No Extension Manager needed, no PSR-4 autoloading issues.

### 1. Copy the gateway file

```bash
cp openfeeder.php /var/www/html/openfeeder.php
```

(Replace `/var/www/html` with your Joomla webroot.)

### 2. Add rewrite rules to `.htaccess`

Add these lines to your Joomla `.htaccess` file, **before** the existing Joomla rewrite rules:

```apache
# OpenFeeder LLM endpoints
RewriteRule ^\.well-known/openfeeder\.json$ openfeeder.php [L,QSA]
RewriteRule ^openfeeder$ openfeeder.php [L,QSA]
RewriteRule ^openfeeder\?(.*)$ openfeeder.php?$1 [L,QSA]
```

### 3. Test

```bash
curl https://yoursite.com/.well-known/openfeeder.json
curl https://yoursite.com/openfeeder
curl https://yoursite.com/openfeeder?url=my-article-alias
curl https://yoursite.com/openfeeder?q=search+term
```

## Full Install (Extension Manager)

If you prefer a proper Joomla system plugin with admin configuration, caching, and autoloading:

### Option A: Extension Manager (recommended)

1. Zip the `openfeeder` folder contents into `plg_system_openfeeder.zip`
2. Log in to your Joomla admin panel
3. Go to **System > Install > Extensions**
4. Upload the zip file

### Option B: Manual plugin install

1. Copy the plugin files to `plugins/system/openfeeder/`
2. In the Joomla admin, go to **System > Manage > Extensions > Discover**
3. Click **Discover** then install the OpenFeeder plugin

### Enable the plugin

1. Go to **System > Manage > Plugins**
2. Search for "OpenFeeder"
3. Enable the plugin

### Plugin Configuration

In the Plugin Manager, click on OpenFeeder to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Enable OpenFeeder | Yes | Toggle the plugin on/off |
| Max Chunks per Response | 50 | Maximum content chunks returned per request (1-50) |
| Site Description Override | (empty) | Custom description for the discovery document |

## Endpoints

Both install methods expose the same two routes:

### Discovery

```
GET /.well-known/openfeeder.json
```

Returns site metadata and feed endpoint information per the OpenFeeder spec.

### Content API

```
GET /openfeeder
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Article path/alias to fetch |
| `q` | string | Search query for title/introtext matching |
| `page` | int | Page number for index (default: 1) |
| `limit` | int | Max chunks to return (default: 10, max: 50) |

**Index mode** (no params): Returns a paginated list of published articles.

**Single article** (`url=`): Returns chunked, cleaned content for one article.

**Search** (`q=`): Returns articles matching the query, ranked by relevance.

## License

GNU General Public License v2 or later.

## Quick Install (Recommended)

1. Copy `openfeeder.php` to your Joomla webroot
2. Add these 3 lines to your `.htaccess` BEFORE the Joomla SEF section:

```apache
## OpenFeeder LLM endpoints
RewriteRule ^\.well-known/openfeeder\.json$ openfeeder.php [L,QSA]
RewriteRule ^openfeeder$ openfeeder.php [L,QSA]
```

3. Done! Test: `https://yoursite.com/.well-known/openfeeder.json`

No plugin activation needed. Works on Joomla 4 and 5.
