# OpenFeeder for WooCommerce

Expose your WooCommerce products to AI shopping assistants via the [OpenFeeder protocol](../../spec/SPEC.md). Products become discoverable by ChatGPT, Perplexity, Google AI, and any LLM-powered search — no scraping, no delay.

**The pitch:** *"Your products answer shoppers' questions in ChatGPT and Perplexity — no scraping, no delay."*

---

## Requirements

- WordPress 5.8+
- PHP 7.4+
- WooCommerce 6.0+
- Pretty permalinks enabled (any structure other than "Plain")

---

## Installation

### Option A: Upload ZIP (recommended)

Build the ZIP from the repo root:

```bash
cd ~/openfeeder
zip -r /tmp/openfeeder-woocommerce-v1.0.0.zip adapters/woocommerce/
```

Then in WordPress admin: **Plugins > Add New > Upload Plugin**, upload the ZIP, and click **Activate**.

### Option B: Copy to plugins directory

```bash
cp -r adapters/woocommerce /path/to/wp-content/plugins/openfeeder-woocommerce
```

Activate from **Plugins** in the WordPress admin.

### After activation

1. Visit **Settings > Permalinks** and click **Save Changes** — this flushes rewrite rules.
2. Configure the endpoint via **WooCommerce > OpenFeeder** in the admin menu.

---

## Settings

Navigate to **WooCommerce > OpenFeeder** in the WordPress admin.

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Products Endpoint** | Toggle `/openfeeder/products` on or off. | Enabled |
| **Products Per Page** | Default products returned per page (1–100). Clients can override with `limit=`. | 10 |

---

## Endpoints

### Products API

```
GET /openfeeder/products
```

Returns a paginated list of products with full OpenFeeder schema.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Products per page (default: per settings, max: 100) |
| `sku` | string | Filter by exact SKU |
| `category` | string | Filter by category slug |
| `q` | string | Full-text search query |
| `min_price` | number | Minimum price filter |
| `max_price` | number | Maximum price filter |
| `in_stock` | boolean | Filter to in-stock products only |
| `on_sale` | boolean | Filter to on-sale products only |

**Single product lookup:**

```
GET /openfeeder/products?sku=BJ-001
GET /openfeeder/products?url=/product/blue-jacket
```

### Extended Discovery Document

```
GET /.well-known/openfeeder-ecommerce.json
```

Returns the full OpenFeeder discovery document extended with ecommerce capabilities:

```json
{
  "version": "1.0",
  "site": { "name": "...", "url": "...", "language": "en", "description": "" },
  "feed": { "endpoint": "/openfeeder", "type": "paginated" },
  "capabilities": ["products"],
  "ecommerce": {
    "products_endpoint": "/openfeeder/products",
    "currencies": ["USD"],
    "supports_variants": true,
    "supports_availability": true
  },
  "contact": "..."
}
```

**If the base OpenFeeder plugin is also installed**, this plugin automatically hooks into `/.well-known/openfeeder.json` and adds the `ecommerce` block there as well.

---

## Response Schema

### Product List

```json
{
  "schema": "openfeeder/1.0+ecommerce",
  "type": "products",
  "page": 1,
  "total_pages": 5,
  "total_items": 47,
  "currency": "USD",
  "items": [ ... ]
}
```

### Product Object

```json
{
  "url": "/product/blue-jacket",
  "title": "Blue Jacket",
  "sku": "BJ-001",
  "price": "89.99",
  "regular_price": "119.99",
  "sale_price": "89.99",
  "on_sale": true,
  "availability": "in_stock",
  "stock_quantity": 12,
  "categories": ["Jackets", "Men"],
  "tags": ["waterproof", "outdoor"],
  "summary": "Lightweight waterproof jacket for outdoor adventures...",
  "chunks": [
    {
      "id": "p42_0",
      "text": "Product description paragraph...",
      "type": "paragraph",
      "relevance": null
    }
  ],
  "variants": [
    {
      "sku": "BJ-001-S",
      "attributes": { "size": "S", "color": "Blue" },
      "price": "89.99",
      "availability": "in_stock"
    }
  ],
  "images": ["/wp-content/uploads/blue-jacket.jpg"]
}
```

**Availability values:** `in_stock` | `out_of_stock` | `on_backorder`

---

## Integration with Base OpenFeeder Plugin

This plugin works **standalone** — the base OpenFeeder WordPress plugin is not required. However, if both are installed:

- The base plugin serves `/.well-known/openfeeder.json` and `/openfeeder` (article content)
- This plugin extends the discovery document automatically via the `openfeeder_discovery_data` filter
- AI agents discover both content and product endpoints from a single discovery document

---

## Headers

Every response includes:

```
Content-Type: application/json; charset=utf-8
X-OpenFeeder: 1.0
X-OpenFeeder-Extension: ecommerce/1.0
Access-Control-Allow-Origin: *
```

---

## Privacy

This plugin only exposes **published products** visible in the catalog. Draft, private, and hidden products are never included. Disable the endpoint at any time from **WooCommerce > OpenFeeder**.

---

## License

MIT — see the root project license for details.
