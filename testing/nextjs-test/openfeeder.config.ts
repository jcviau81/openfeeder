import type { OpenFeederConfig, OpenFeederRawItem } from "./lib/openfeeder/types";

const POSTS: OpenFeederRawItem[] = [
  {
    url: "/hello-world",
    title: "Hello World",
    published: "2024-01-15T10:00:00Z",
    content: `
      <p>Welcome to the OpenFeeder Next.js test site!</p>
      <p>This is the first paragraph of the hello world post. OpenFeeder exposes
      your Next.js site's content in a structured, paginated JSON format that
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
      <p>This is a minimal Next.js test app used to validate the OpenFeeder
      Next.js adapter against the official OpenFeeder validator.</p>
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
      <p>Getting started with the OpenFeeder Next.js adapter is straightforward.
      Copy the adapter source files into your project, create a config file,
      and add two route files to your App Router directory.</p>
      <p>No extra npm dependencies are required. The adapter uses only Next.js
      built-ins and Node's built-in crypto module for deterministic chunk IDs.</p>
      <p>The chunker splits HTML content into approximately 500-word chunks aligned
      on paragraph boundaries, making it easy for LLMs to process your content
      in manageable pieces without losing context.</p>
    `,
  },
];

const config: OpenFeederConfig = {
  siteName: "OpenFeeder Next.js Test",
  siteUrl: "http://localhost:3001",
  siteDescription: "Test site for the OpenFeeder Next.js adapter",
  language: "en",

  async getItems(page, limit) {
    const start = (page - 1) * limit;
    return { items: POSTS.slice(start, start + limit), total: POSTS.length };
  },

  async getItem(url) {
    // Handle both absolute URLs (http://localhost:3001/hello-world) and relative (/hello-world)
    let normalized = url.split("?")[0].replace(/\/$/, "");
    // Strip base URL if present
    try {
      const parsed = new URL(normalized);
      normalized = parsed.pathname.replace(/\/$/, "") || "/";
    } catch {
      // Already relative
    }
    return POSTS.find((p) => p.url === normalized) ?? null;
  },
};

export default config;
