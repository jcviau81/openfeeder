/**
 * Example: /openfeeder route handler
 *
 * Place this file at: app/openfeeder/route.ts
 */

import { createOpenFeederHandler } from "../../src/index.js";
import type { OpenFeederConfig, OpenFeederRawItem } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Sample in-memory content — replace with your CMS/database calls
// ---------------------------------------------------------------------------

const SAMPLE_POSTS: OpenFeederRawItem[] = [
  {
    url: "/hello-world",
    title: "Hello World",
    published: "2024-01-15T10:00:00Z",
    content: `
      <p>Welcome to my site built with Next.js and OpenFeeder!</p>
      <p>This is the first paragraph of the hello world post. It contains enough
      text to demonstrate the chunking behaviour of the OpenFeeder adapter.</p>
      <p>OpenFeeder is an open standard for LLM-optimised content delivery.
      It exposes your site's content in a structured, paginated JSON format
      that large language models can consume efficiently.</p>
    `,
  },
  {
    url: "/about",
    title: "About This Site",
    published: "2024-01-10T08:00:00Z",
    content: `
      <h2>About</h2>
      <p>This is an example Next.js site using the OpenFeeder adapter.</p>
      <p>The adapter exposes two endpoints:</p>
      <ul>
        <li>/.well-known/openfeeder.json — discovery document</li>
        <li>/openfeeder — paginated content feed</li>
      </ul>
      <p>Both endpoints follow the OpenFeeder 1.0 specification.</p>
    `,
  },
  {
    url: "/getting-started",
    title: "Getting Started with OpenFeeder",
    published: "2024-02-01T12:00:00Z",
    content: `
      <p>Getting started with the OpenFeeder Next.js adapter is straightforward.</p>
      <p>Install the adapter, configure your data source functions, and add two
      route files to your Next.js App Router. That's all it takes to make your
      site discoverable by LLM-powered tools.</p>
      <p>The adapter handles content chunking, pagination, CORS headers, and the
      discovery document automatically. You only need to provide functions that
      return your site's content.</p>
    `,
  },
];

// ---------------------------------------------------------------------------
// OpenFeeder config
// ---------------------------------------------------------------------------

const config: OpenFeederConfig = {
  siteName: "My Next.js Site",
  siteUrl: "http://localhost:3001",
  siteDescription: "An example site powered by Next.js and OpenFeeder",
  language: "en",

  async getItems(page, limit) {
    const start = (page - 1) * limit;
    const items = SAMPLE_POSTS.slice(start, start + limit);
    return { items, total: SAMPLE_POSTS.length };
  },

  async getItem(url) {
    // Strip query string / trailing slash for matching
    const normalized = url.split("?")[0].replace(/\/$/, "");
    return SAMPLE_POSTS.find((p) => p.url === normalized) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Export the handler
// ---------------------------------------------------------------------------

export const { GET } = createOpenFeederHandler(config);
