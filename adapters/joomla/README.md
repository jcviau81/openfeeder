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

## Webhook Trigger (Incremental Index Updates)

When you run the [OpenFeeder sidecar](../../sidecar/README.md), you can push content changes to it in real time instead of waiting for the next scheduled crawl.

### How it works

The sidecar exposes `POST /openfeeder/update`. You call it from a Joomla system plugin whenever content changes.

### Joomla System Plugin — `onContentAfterSave`

Create a minimal system plugin (`plg_system_openfeeder_webhook`) with this logic:

```php
<?php
// plugins/system/openfeeder_webhook/openfeeder_webhook.php

use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\CMS\Uri\Uri;

class PlgSystemOpenfeeder_Webhook extends CMSPlugin
{
    /**
     * Fires after any content item is saved (article published/updated).
     */
    public function onContentAfterSave(string $context, object $article, bool $isNew): bool
    {
        if ($context !== 'com_content.article') {
            return true;
        }
        if (empty($article->state) || $article->state !== 1) {
            return true; // not published
        }

        $webhookUrl = $this->params->get('webhook_url', '');
        $webhookKey = $this->params->get('webhook_key', '');
        if (empty($webhookUrl)) {
            return true;
        }

        // Build relative URL (e.g. /my-category/my-article)
        $slug = '/' . ($article->catid ? '' : '') . $article->alias;
        // For a full SEF URL you may want to use Route::_() here

        $this->_callWebhook($webhookUrl, $webhookKey, 'upsert', [$slug]);
        return true;
    }

    /**
     * Fires after a content item is deleted.
     */
    public function onContentAfterDelete(string $context, object $article): bool
    {
        if ($context !== 'com_content.article') {
            return true;
        }

        $webhookUrl = $this->params->get('webhook_url', '');
        $webhookKey = $this->params->get('webhook_key', '');
        if (empty($webhookUrl)) {
            return true;
        }

        $slug = '/' . $article->alias;
        $this->_callWebhook($webhookUrl, $webhookKey, 'delete', [$slug]);
        return true;
    }

    private function _callWebhook(string $baseUrl, string $key, string $action, array $urls): void
    {
        $endpoint = rtrim($baseUrl, '/') . '/openfeeder/update';
        $headers  = ['Content-Type: application/json'];
        if (!empty($key)) {
            $headers[] = 'Authorization: Bearer ' . $key;
        }

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode(['action' => $action, 'urls' => $urls]),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_NOSIGNAL       => 1,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }
}
```

**Plugin manifest** (`openfeeder_webhook.xml`):

```xml
<?xml version="1.0" encoding="utf-8"?>
<extension type="plugin" group="system" method="upgrade">
    <name>plg_system_openfeeder_webhook</name>
    <version>1.0.0</version>
    <description>Notifies the OpenFeeder sidecar on content changes.</description>
    <files>
        <filename plugin="openfeeder_webhook">openfeeder_webhook.php</filename>
    </files>
    <config>
        <fields name="params">
            <fieldset name="basic">
                <field name="webhook_url" type="url" label="Sidecar Webhook URL"
                    description="Base URL of your OpenFeeder sidecar (e.g. http://localhost:8080)" default="" />
                <field name="webhook_key" type="text" label="Sidecar Webhook Key"
                    description="Value of OPENFEEDER_WEBHOOK_SECRET on the sidecar. Leave blank if not set." default="" />
            </fieldset>
        </fields>
    </config>
</extension>
```

Install via **System > Install > Extensions**, configure the webhook URL and key in the plugin parameters, and enable the plugin.

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
