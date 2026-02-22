import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import openfeeder from "openfeeder-astro";

const POSTS = [
  {
    url: "/hello-world",
    title: "Hello World",
    published: "2024-01-15T10:00:00Z",
    content: `
      <p>Welcome to the OpenFeeder Astro test site!</p>
      <p>This is the first paragraph of the hello world post. OpenFeeder exposes
      your Astro site's content in a structured, paginated JSON format that
      large language models can consume efficiently and reliably.</p>
      <p>The adapter handles content chunking, pagination, CORS headers, and the
      discovery document automatically. You only need to provide functions that
      return your site's content from whatever data source you use.</p>
    `,
  },
  {
    url: "/about",
    title: "About This Test Site",
    published: "2024-01-10T08:00:00Z",
    content: `
      <h2>About</h2>
      <p>This is a minimal Astro test app used to validate the OpenFeeder
      Astro adapter against the official OpenFeeder validator.</p>
      <p>The two endpoints exposed are:</p>
      <ul>
        <li>GET /.well-known/openfeeder.json — discovery document</li>
        <li>GET /openfeeder — paginated content feed with chunking support</li>
      </ul>
    `,
  },
  {
    url: "/getting-started",
    title: "Getting Started with OpenFeeder",
    published: "2024-02-01T12:00:00Z",
    content: `
      <p>Getting started with the OpenFeeder Astro adapter is straightforward.
      Add the integration to your astro.config.mjs and provide getItems and getItem
      functions that return your content.</p>
      <p>No extra npm dependencies are required beyond Astro itself. The adapter uses
      only Node's built-in crypto module for deterministic chunk IDs.</p>
      <p>The chunker splits HTML content into approximately 500-word chunks aligned
      on paragraph boundaries, making it easy for LLMs to process your content
      in manageable pieces without losing context.</p>
    `,
  },
];

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    openfeeder({
      siteName: "OpenFeeder Astro Test",
      siteUrl: "http://localhost:3004",
      siteDescription: "Test site for the OpenFeeder Astro adapter",
      language: "en",

      async getItems(page, limit) {
        const start = (page - 1) * limit;
        return { items: POSTS.slice(start, start + limit), total: POSTS.length };
      },

      async getItem(url) {
        let normalized = url.split("?")[0].replace(/\/$/, "");
        try {
          const parsed = new URL(normalized);
          normalized = parsed.pathname.replace(/\/$/, "") || "/";
        } catch {
          // already relative
        }
        return POSTS.find((p) => p.url === normalized) ?? null;
      },
    }),
  ],
});
