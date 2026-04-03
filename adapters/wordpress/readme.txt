=== OpenFeeder ===
Contributors: jcviau
Tags: llm, ai, api, content, structured-data
Requires at least: 5.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Expose your WordPress content to LLMs via the OpenFeeder protocol. Published posts become available through a clean, structured JSON API — no scraping needed.

== Description ==

OpenFeeder gives AI systems structured access to your published content through a standard protocol. Instead of scraping your HTML, LLMs can request clean, chunked text via a REST API.

**What it does:**

* Provides a discovery endpoint so AI systems can find your content API
* Serves published posts as clean, chunked plain text optimized for LLM consumption
* Supports paginated browsing, full-text search, and differential sync
* Strips ads, shortcodes, widgets, navigation blocks, and all HTML noise
* Includes an optional interactive LLM Gateway that redirects AI crawlers to structured endpoints
* Caches responses using WordPress transients for performance
* Respects your privacy: drafts, private posts, and password-protected content are never exposed

**Endpoints:**

* `GET /wp-json/openfeeder/v1/discovery` — Site capabilities and metadata
* `GET /wp-json/openfeeder/v1/content` — Paginated content index or single-post retrieval
* `POST /wp-json/openfeeder/v1/gateway/respond` — Interactive LLM Gateway dialogue

**For site owners:** You control what gets exposed. Exclude paths, post types, or disable the plugin entirely from Settings > OpenFeeder. Optionally protect the content API with an API key.

**For AI developers:** OpenFeeder provides a standard protocol for accessing website content. Check the discovery endpoint to learn a site's capabilities, then use the content API to retrieve clean text.

== Installation ==

1. Upload the `openfeeder` folder to `/wp-content/plugins/`.
2. Activate the plugin through the Plugins menu in WordPress.
3. Go to Settings > OpenFeeder to configure.

No permalink flush required. The plugin uses the WordPress REST API which works automatically.

**Requirements:**

* WordPress 5.0 or higher
* PHP 7.4 or higher
* Pretty permalinks enabled (any structure other than "Plain")

== Frequently Asked Questions ==

= What content does OpenFeeder expose? =

Only publicly published posts and pages. Drafts, private posts, pending posts, trashed posts, and password-protected content are never included.

= Can I restrict access with an API key? =

Yes. Go to Settings > OpenFeeder and set an API key. Requests to the content endpoint will then require an `Authorization: Bearer <key>` header. The discovery endpoint is always public.

= Can I exclude certain pages or post types? =

Yes. The settings page lets you specify excluded path prefixes (e.g., `/checkout`, `/cart`) and additional post types to hide. Internal WordPress types (revisions, nav menus, templates, etc.) are always excluded.

= Does this work with WooCommerce? =

Yes. WooCommerce products are exposed as content items. The LLM Gateway provides context-aware responses for product pages and categories. You can exclude product paths or post types if needed.

= Does this affect my site's SEO or performance? =

No. The plugin only responds to REST API requests — it does not modify your HTML output, add scripts, or change how search engines see your pages. Responses are cached for 1 hour using WordPress transients.

= How does the LLM Gateway work? =

When enabled, the gateway detects known AI crawler user-agents (GPTBot, ClaudeBot, PerplexityBot, etc.) and returns a structured JSON response directing them to use OpenFeeder endpoints instead of scraping HTML. Regular visitors are unaffected.

= What about author privacy? =

You can choose to show author display names or hide them entirely from Settings > OpenFeeder. Email addresses and user IDs are never exposed regardless of this setting.

= My API key authentication is not working on Apache =

Apache with mod_php or mod_fcgid may strip the Authorization header. Add this to your `.htaccess` before the WordPress rewrite rules:

`RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`

== Screenshots ==

1. OpenFeeder settings page in the WordPress admin.
2. Discovery endpoint JSON response.
3. Content API response with chunked text.

== Changelog ==

= 1.0.2 =
* Security: Removed admin email from discovery endpoints
* Added adapter design principles for privacy

= 1.0.1 =
* Migrated to WordPress REST API routes
* Added curl test examples for API

= 1.0.0 =
* Initial release
* Discovery endpoint with site metadata
* Content API with paginated index and single-post retrieval
* Full-text search support
* Differential sync with sync tokens
* Content chunking with paragraph-boundary alignment
* LLM Gateway with interactive dialogue
* Transient-based caching with auto-invalidation
* Settings page with security controls
* Path and post type exclusion
* Optional API key authentication
* Sidecar webhook integration

== Upgrade Notice ==

= 1.0.2 =
Security improvement: admin email is no longer exposed in discovery responses.
