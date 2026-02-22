# openfeeder-astro

Astro integration for [OpenFeeder](https://github.com/jcviau81/openfeeder) — an open standard for LLM-optimized content delivery.

## Features

- Auto-injects two API routes via `injectRoute`:
  - `GET /openfeeder` — paginated content index with full-page chunking
  - `GET /.well-known/openfeeder.json` — discovery document
- TypeScript-first
- Works in Astro SSR mode (`output: 'server'` or `hybrid`)
- Zero extra Astro-specific dependencies

## Installation

```bash
npm install openfeeder-astro
```

## Usage

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import openfeeder from 'openfeeder-astro';

const POSTS = [
  {
    url: '/hello-world',
    title: 'Hello World',
    published: '2024-01-15T10:00:00Z',
    content: '<p>Welcome to my site!</p>',
  },
];

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    openfeeder({
      siteName: 'My Site',
      siteUrl: 'https://mysite.com',
      siteDescription: 'A wonderful site',
      language: 'en',

      async getItems(page, limit) {
        const start = (page - 1) * limit;
        return { items: POSTS.slice(start, start + limit), total: POSTS.length };
      },

      async getItem(url) {
        return POSTS.find((p) => p.url === url) ?? null;
      },
    }),
  ],
});
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `siteName` | `string` | ✅ | Display name for the site |
| `siteUrl` | `string` | ✅ | Canonical base URL |
| `siteDescription` | `string` | — | Short site description |
| `language` | `string` | — | BCP-47 language tag (default: `"en"`) |
| `getItems` | `(page, limit) => Promise<{items, total}>` | ✅ | Returns a page of content items |
| `getItem` | `(url) => Promise<item \| null>` | ✅ | Returns a single item by relative URL |

## Endpoints

### `GET /.well-known/openfeeder.json`

Discovery document following the OpenFeeder 1.0 spec.

### `GET /openfeeder`

Paginated content index.

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number (1-based) |
| `limit` | `10` | Items per page (max 100) |
| `url` | — | Return single page with full chunked content |
| `q` | — | Search query (filters by title + content) |

## Requirements

- Astro 4+
- `output: 'server'` or `output: 'hybrid'` in `astro.config.mjs`
