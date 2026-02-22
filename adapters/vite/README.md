# OpenFeeder — Vite Plugin

OpenFeeder is an open standard for LLM-optimised content delivery. This plugin integrates with **Vite 4+** to expose your site's content via two JSON endpoints.

In **dev mode** the endpoints are served live by the Vite dev server.  
At **build time** static JSON files are written to your output directory.

## Endpoints

| URL | Description |
|-----|-------------|
| `GET /.well-known/openfeeder.json` | Discovery document |
| `GET /openfeeder` | Paginated content index |
| `GET /openfeeder?url=/some-page` | Single page with chunked content |
| `GET /openfeeder?page=2&limit=10` | Page 2 of the index |
| `GET /openfeeder?q=search+term` | Search (dev mode only) |

## Installation

Copy the `src/` directory into your project (e.g. `plugins/openfeeder/`).

No extra npm dependencies are required beyond Vite itself.

## Usage

### 1. Define your content

```ts
// openfeeder.config.ts
import type { OpenFeederPluginConfig } from "./plugins/openfeeder";

const config: OpenFeederPluginConfig = {
  siteName: "My Site",
  siteUrl: "https://mysite.com",
  siteDescription: "My awesome site",
  language: "en",

  // Static array:
  content: [
    {
      url: "/about",
      title: "About",
      published: "2024-01-01T00:00:00Z",
      content: "<p>About page content here.</p>",
    },
  ],

  // OR async function (fetched at dev startup / build time):
  // content: async () => {
  //   const posts = await fetchFromCMS();
  //   return posts.map((p) => ({ url: p.slug, title: p.title, ... }));
  // },
};

export default config;
```

### 2. Add the plugin to vite.config.ts

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { viteOpenFeeder } from "./plugins/openfeeder";
import config from "./openfeeder.config";

export default defineConfig({
  plugins: [viteOpenFeeder(config)],
});
```

That's it.  Run `vite dev` and visit `http://localhost:5173/openfeeder` to see the feed.

## Config Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `siteName` | `string` | ✅ | Display name for the site |
| `siteUrl` | `string` | ✅ | Canonical base URL |
| `siteDescription` | `string` | — | Short description |
| `language` | `string` | — | BCP-47 language tag (default: `"en"`) |
| `content` | `Item[] \| () => Promise<Item[]>` | ✅ | Content items |

### Item shape

```ts
{
  url: string;       // relative URL, e.g. "/my-page"
  title: string;
  published: string; // ISO 8601
  content: string;   // HTML or plain text
}
```

## Build Output

After `vite build`, the plugin writes to your `dist/` directory:

```
dist/
  .well-known/
    openfeeder.json          ← discovery document
  openfeeder                 ← page 1 index (JSON, no extension)
  openfeeder-items/
    about.json               ← per-item chunked content
    getting-started.json
    ...
```

## Response Headers

Every response includes:

```
Content-Type: application/json
X-OpenFeeder: 1.0
Access-Control-Allow-Origin: *
```

## How Chunking Works

HTML tags are stripped from `content`, the text is split on paragraph boundaries, and grouped into ~500-word chunks. Each chunk has:

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
.venv/bin/python validator.py http://localhost:5174
```
