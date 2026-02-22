# OpenFeeder Adapters

Native CMS plugins that implement the OpenFeeder protocol with direct database access — faster and more accurate than the universal sidecar.

## Available Adapters

| Adapter | Platform | Status | Notes |
|---------|----------|--------|-------|
| [wordpress/](wordpress/) | WordPress 5.8+ | ✅ Ready | Pure PHP, zero deps, wp-admin settings |
| [drupal/](drupal/) | Drupal 10/11 | ✅ Ready | PSR-4, Drupal cache + tag invalidation |
| [joomla/](joomla/) | Joomla 4/5 | ✅ Ready | System plugin, Joomla DI, onAfterRoute |
| express/ | Node.js/Express | 🔜 Planned | npm middleware package |
| fastapi/ | Python/FastAPI | 🔜 Planned | Python middleware |
| astro/ | Astro | 🔜 Planned | Astro integration |
| ghost/ | Ghost CMS | 🔜 Planned | Uses Ghost Content API |

## Native vs Sidecar

**Native plugin advantages:**
- Direct DB access → no crawling delay
- Real-time: content available immediately on publish
- Automatic cache invalidation on save/update/delete
- Smaller footprint (no vector DB needed for basic use)

**Sidecar advantages:**
- Works with ANY platform without code changes
- Semantic search via vector embeddings
- Zero install on the CMS itself

## Building an Adapter

An adapter must:

1. Serve `GET /.well-known/openfeeder.json` — the discovery document
2. Serve the content endpoint (index + single page + optional search)
3. Strip noise (ads, nav, boilerplate) from content
4. Chunk content into meaningful fragments (~500 chars each)
5. Use native cache with invalidation on content changes
6. Follow [spec/SPEC.md](../spec/SPEC.md) response format exactly

See any existing adapter for reference implementation.
