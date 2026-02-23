# OpenFeeder Express Adapter

Express.js middleware for the [OpenFeeder](https://github.com/jcviau81/openfeeder) protocol — an open standard for LLM-optimized content delivery.

## Installation

```bash
npm install openfeeder-express
```

Express is a peer dependency — make sure it's already in your project.

## Usage

```js
const express = require('express');
const { openFeederMiddleware } = require('openfeeder-express');

const app = express();

app.use(openFeederMiddleware({
  siteName: 'My Blog',
  siteUrl: 'https://myblog.com',
  language: 'en',                         // optional, default "en"
  siteDescription: 'A blog about things', // optional

  // Return a page of items for the index feed
  getItems: async (page, limit) => {
    const items = await db.getPosts({ page, limit });
    const total = await db.countPosts();
    return { items, total };
  },

  // Return a single item by URL pathname, or null if not found
  getItem: async (url) => {
    const post = await db.getPostBySlug(url);
    if (!post) return null;
    return {
      url: post.slug,          // e.g. "/my-first-post"
      title: post.title,
      content: post.body,      // HTML or plain text
      published: post.date,    // ISO 8601 string
    };
  },
}));

app.listen(3000);
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /.well-known/openfeeder.json` | Discovery document |
| `GET /openfeeder` | Paginated content index |
| `GET /openfeeder?url=/post-slug` | Single page with chunks |
| `GET /openfeeder?q=search+term` | Search across titles and content |
| `GET /openfeeder?page=2&limit=5` | Paginated index with custom page size |
| `GET /openfeeder?since=<RFC3339>` | Differential sync — content added/updated since date |
| `GET /openfeeder?until=<RFC3339>` | Content published on or before date |
| `GET /openfeeder?since=<RFC3339>&until=<RFC3339>` | Closed date range |

## Config Options

| Option | Type | Required | Description |
|---|---|---|---|
| `siteName` | `string` | ✅ | Display name of the site |
| `siteUrl` | `string` | ✅ | Canonical URL (e.g. `https://myblog.com`) |
| `language` | `string` | — | BCP-47 language tag (default: `"en"`) |
| `siteDescription` | `string` | — | Brief description of the site |
| `getItems` | `function` | ✅ | `async (page, limit) => { items, total }` |
| `getItem` | `function` | ✅ | `async (url) => item \| null` |

### Item shape

Each item returned by `getItems` or `getItem` must have:

| Field | Type | Description |
|---|---|---|
| `url` | `string` | URL pathname (e.g. `/my-post`) |
| `title` | `string` | Page title |
| `content` | `string` | HTML or plain text body |
| `published` | `string` | ISO 8601 date string |

## Response Headers

All responses include:

```
Content-Type: application/json
X-OpenFeeder: 1.0
Access-Control-Allow-Origin: *
```

## Notes

- Zero extra dependencies — only uses Node.js built-ins (`crypto`) and Express as a peer dependency.
- Supports both `require()` and `import` (CommonJS module with ESM-compatible exports field).
- Absolute URLs in `?url=` are automatically normalised to their pathname.
- Content is split into ~500-word chunks aligned on paragraph boundaries.
