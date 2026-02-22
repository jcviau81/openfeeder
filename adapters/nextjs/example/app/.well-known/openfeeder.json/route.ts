/**
 * Example: /.well-known/openfeeder.json discovery handler
 *
 * Place this file at: app/.well-known/openfeeder.json/route.ts
 *
 * Next.js treats "openfeeder.json" as a directory name here, which is
 * intentional — it produces the URL /.well-known/openfeeder.json
 */

import { createOpenFeederDiscoveryHandler } from "../../../src/index.js";
import type { OpenFeederConfig, OpenFeederRawItem } from "../../../src/types.js";

// Re-use the same config as the content route.
// In a real app, import from a shared config file.

const SAMPLE_POSTS: OpenFeederRawItem[] = [
  {
    url: "/hello-world",
    title: "Hello World",
    published: "2024-01-15T10:00:00Z",
    content: "<p>Welcome to my site!</p>",
  },
];

const config: OpenFeederConfig = {
  siteName: "My Next.js Site",
  siteUrl: "http://localhost:3001",
  siteDescription: "An example site powered by Next.js and OpenFeeder",
  language: "en",
  async getItems(page, limit) {
    const start = (page - 1) * limit;
    return { items: SAMPLE_POSTS.slice(start, start + limit), total: SAMPLE_POSTS.length };
  },
  async getItem(url) {
    return SAMPLE_POSTS.find((p) => p.url === url) ?? null;
  },
};

export const { GET } = createOpenFeederDiscoveryHandler(config);
