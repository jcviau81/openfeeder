# OpenFeeder E-Commerce Extension v1.0 (Draft)

*Status: Draft — open for community feedback*  
*Copyright (c) 2026 Jean-Christophe Viau. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*

---

## Overview

The OpenFeeder E-Commerce Extension (`openfeeder/1.0+ecommerce`) adds product catalog support to the base OpenFeeder protocol. It enables AI systems to query, filter, and retrieve structured product data from e-commerce sites without scraping.

**Use cases:**
- AI shopping assistants ("Find me a waterproof jacket under $150")
- Product comparison by LLMs
- Real-time availability checks
- Inventory-aware recommendations

---

## Discovery Extension

Sites implementing the e-commerce extension add an `ecommerce` block to the base discovery document:

```json
{
  "version": "1.0",
  "site": { "name": "...", "url": "...", "language": "en", "description": "" },
  "feed": { "endpoint": "/openfeeder", "type": "paginated" },
  "capabilities": ["search", "products"],
  "ecommerce": {
    "products_endpoint": "/openfeeder/products",
    "currencies": ["CAD", "USD"],
    "supports_variants": true,
    "supports_availability": true,
    "supports_facets": true
  },
  "contact": null
}
```

Alternatively, a separate discovery document may be served at:
```
GET /.well-known/openfeeder-ecommerce.json
```

---

## Products Endpoint

```
GET /openfeeder/products
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 10, max: 50) |
| `q` | string | Full-text search query |
| `sku` | string | Filter by exact SKU |
| `category` | string | Filter by category name or slug |
| `min_price` | number | Minimum price (inclusive) |
| `max_price` | number | Maximum price (inclusive) |
| `in_stock` | boolean | Only return in-stock products |
| `on_sale` | boolean | Only return products on sale |
| `url` | string | Fetch single product by URL pathname |

### Index Response

```json
{
  "schema": "openfeeder/1.0+ecommerce",
  "type": "products",
  "page": 1,
  "total_pages": 12,
  "currency": "CAD",
  "items": [
    {
      "url": "/product/blue-jacket",
      "title": "Blue Waterproof Jacket",
      "sku": "BJ-001",
      "price": "89.99",
      "regular_price": "119.99",
      "sale_price": "89.99",
      "on_sale": true,
      "availability": "in_stock",
      "stock_quantity": 12,
      "categories": ["Jackets", "Men", "Outdoor"],
      "tags": ["waterproof", "lightweight", "outdoor"],
      "summary": "Lightweight waterproof shell jacket. Packable. Wind and rain resistant.",
      "chunks": [
        {
          "id": "c1",
          "text": "Lightweight waterproof shell jacket made from recycled materials. Packable into its own pocket. Fully seam-sealed. Wind and rain resistant up to 10,000mm hydrostatic head.",
          "type": "paragraph",
          "relevance": null
        }
      ],
      "variants": [
        {
          "sku": "BJ-001-S-BLU",
          "attributes": { "size": "S", "color": "Blue" },
          "price": "89.99",
          "availability": "in_stock",
          "stock_quantity": 5
        },
        {
          "sku": "BJ-001-M-BLU",
          "attributes": { "size": "M", "color": "Blue" },
          "price": "89.99",
          "availability": "out_of_stock",
          "stock_quantity": 0
        }
      ],
      "images": [
        "/wp-content/uploads/blue-jacket-front.jpg",
        "/wp-content/uploads/blue-jacket-back.jpg"
      ]
    }
  ]
}
```

### Single Product Response

When `?url=` or `?sku=` is provided, returns a single product object (same schema as above, not wrapped in `items` array):

```json
{
  "schema": "openfeeder/1.0+ecommerce",
  "type": "product",
  "url": "/product/blue-jacket",
  "title": "Blue Waterproof Jacket",
  ...
}
```

---

## Availability Values

| Value | Meaning |
|-------|---------|
| `in_stock` | Available to purchase |
| `out_of_stock` | Not available, no backorder |
| `on_backorder` | Not in stock but can be ordered |
| `discontinued` | No longer sold |
| `preorder` | Available for preorder |

---

## Response Headers

```
Content-Type: application/json; charset=utf-8
X-OpenFeeder: 1.0
X-OpenFeeder-Extension: ecommerce/1.0
Access-Control-Allow-Origin: *
```

---

## Error Responses

```json
{ "schema": "openfeeder/1.0+ecommerce", "error": { "code": "NOT_FOUND", "message": "Product not found." } }
{ "schema": "openfeeder/1.0+ecommerce", "error": { "code": "INVALID_PARAM", "message": "min_price must be a number." } }
```

---

## Implementation Notes

- Prices are always strings (to avoid floating-point precision issues)
- Currency follows ISO 4217 (e.g. `"CAD"`, `"USD"`, `"EUR"`)
- `stock_quantity` may be `null` if the store doesn't track quantity
- Chunks contain the product description split into paragraphs (≈300 words/chunk)
- Variants array may be empty `[]` for simple products
- The `images` array contains relative or absolute URLs; prefer absolute

---

## Reference Implementations

- **WooCommerce plugin:** `adapters/woocommerce/` — full implementation including variant support, WC price filters, and dual-plugin discovery extension
