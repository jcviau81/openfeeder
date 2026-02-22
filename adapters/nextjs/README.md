# OpenFeeder — Next.js Adapter

OpenFeeder is an open standard for LLM-optimised content delivery. This adapter integrates with **Next.js 14+ App Router** to expose your site's content via two JSON endpoints.

## Endpoints

| URL | Description |
|-----|-------------|
| `GET /.well-known/openfeeder.json` | Discovery document |
| `GET /openfeeder` | Paginated content index |
| `GET /openfeeder?url=/some-post` | Single page with chunked content |
| `GET /openfeeder?page=2&limit=10` | Page 2 of the index |
| `GET /openfeeder?q=search+term` | Search |

## Installation

Copy the `src/` directory into your project (e.g. `lib/openfeeder/`):

```
your-app/
  lib/
    openfeeder/
      index.ts
      types.ts
      chunker.ts
      handlers/
        discovery.ts
        content.ts
```

No extra npm dependencies are required — the adapter uses only Next.js built-ins and Node's built-in `crypto` module.

## Usage

### 1. Create a config file

```ts
// openfeeder.config.ts
import type { OpenFeederConfig } from "@/lib/openfeeder";

const config: OpenFeederConfig = {
  siteName: "My Site",
  siteUrl: "https://example.com",
  siteDescription: "My awesome site",
  language: "en",

  async getItems(page, limit) {
    // Fetch from your CMS, database, etc.
    const start = (page - 1) * limit;
    const posts = await db.posts.findMany({ skip: start, take: limit });
    const total = await db.posts.count();
    return {
      total,
      items: posts.map((p) => ({
        url: `/${p.slug}`,
        title: p.title,
        published: p.createdAt.toISOString(),
        content: p.body,
      })),
    };
  },

  async getItem(url) {
    const slug = url.replace(/^\//, "");
    const post = await db.posts.findBySlug(slug);
    if (!post) return null;
    return {
      url: `/${post.slug}`,
      title: post.title,
      published: post.createdAt.toISOString(),
      content: post.body,
    };
  },
};

export default config;
```

### 2. Add the content route

```ts
// app/openfeeder/route.ts
import { createOpenFeederHandler } from "@/lib/openfeeder";
import config from "@/openfeeder.config";

export const { GET } = createOpenFeederHandler(config);
```

### 3. Add the discovery route

```ts
// app/.well-known/openfeeder.json/route.ts
// (the directory name "openfeeder.json" produces the URL /.well-known/openfeeder.json)
import { createOpenFeederDiscoveryHandler } from "@/lib/openfeeder";
import config from "@/openfeeder.config";

export const { GET } = createOpenFeederDiscoveryHandler(config);
```

## Config Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `siteName` | `string` | ✅ | Display name for the site |
| `siteUrl` | `string` | ✅ | Canonical base URL |
| `siteDescription` | `string` | — | Short description |
| `language` | `string` | — | BCP-47 language tag (default: `"en"`) |
| `getItems` | `(page, limit) => Promise<{items, total}>` | ✅ | Returns a page of items |
| `getItem` | `(url) => Promise<Item \| null>` | ✅ | Returns a single item by URL |

### Item shape returned by `getItems` / `getItem`

```ts
{
  url: string;       // relative URL, e.g. "/my-post"
  title: string;
  published: string; // ISO 8601
  content: string;   // HTML or plain text
}
```

## Response Headers

Every response includes:

```
Content-Type: application/json
X-OpenFeeder: 1.0
Access-Control-Allow-Origin: *
```

## How Chunking Works

The adapter strips HTML tags from `content`, splits on paragraph boundaries (`\n\n`), and groups paragraphs into ~500-word chunks. Each chunk has:

```ts
{
  id: string;        // deterministic: md5(url) + "_" + index
  text: string;      // cleaned plain text
  type: "paragraph" | "heading" | "list";
  relevance: null;
}
```

## Example

See the `example/` directory for a complete working example.

## Validate

```bash
cd ~/openfeeder/validator
.venv/bin/python validator.py http://localhost:3001
```
