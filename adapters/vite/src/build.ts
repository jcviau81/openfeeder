/**
 * OpenFeeder Vite Adapter — Build-time static file generation
 *
 * Generates:
 *   dist/.well-known/openfeeder.json   — discovery document
 *   dist/openfeeder                    — full content index (all pages, newline-delimited JSON)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { chunkContent, summarise } from "./chunker.js";
import type {
  OpenFeederContentItem,
  OpenFeederDiscovery,
  OpenFeederIndexResponse,
  OpenFeederPageResponse,
  OpenFeederPluginConfig,
} from "./types.js";

const ITEMS_PER_PAGE = 10;

export async function generateStaticFiles(
  config: OpenFeederPluginConfig,
  content: OpenFeederContentItem[],
  outDir: string
): Promise<void> {
  const wellKnownDir = join(outDir, ".well-known");
  mkdirSync(wellKnownDir, { recursive: true });

  // ── Discovery document ─────────────────────────────────────────────────
  const discovery: OpenFeederDiscovery = {
    version: "1.0",
    site: {
      name: config.siteName,
      url: config.siteUrl,
      language: config.language ?? "en",
      description: config.siteDescription ?? "",
    },
    feed: {
      endpoint: "/openfeeder",
      type: "paginated",
    },
    capabilities: ["search"],
    contact: null,
  };

  writeFileSync(
    join(wellKnownDir, "openfeeder.json"),
    JSON.stringify(discovery, null, 2)
  );

  // ── Content index (page 1 snapshot) ───────────────────────────────────
  // For static sites we generate the first page of the index and all single
  // page responses.  A real static deployment would need a server or edge
  // function to handle arbitrary ?page= / ?url= params.

  const totalPages = Math.max(1, Math.ceil(content.length / ITEMS_PER_PAGE));
  const pageItems = content.slice(0, ITEMS_PER_PAGE);

  const indexResponse: OpenFeederIndexResponse = {
    schema: "openfeeder/1.0",
    type: "index",
    page: 1,
    total_pages: totalPages,
    items: pageItems.map((item) => ({
      url: item.url,
      title: item.title,
      published: item.published,
      summary: summarise(item.content),
    })),
  };

  writeFileSync(
    join(outDir, "openfeeder"),
    JSON.stringify(indexResponse, null, 2)
  );

  // ── Per-item files ─────────────────────────────────────────────────────
  // Written to dist/openfeeder/<slug>.json so a static server can serve
  // ?url= lookups if configured via rewrites.
  const itemsDir = join(outDir, "openfeeder-items");
  mkdirSync(itemsDir, { recursive: true });

  for (const item of content) {
    const chunks = chunkContent(item.content, item.url);
    const pageResponse: OpenFeederPageResponse = {
      schema: "openfeeder/1.0",
      url: item.url,
      title: item.title,
      published: item.published,
      language: config.language ?? "en",
      summary: summarise(item.content),
      chunks,
      meta: {
        total_chunks: chunks.length,
        returned_chunks: chunks.length,
        cached: false,
        cache_age_seconds: null,
      },
    };

    const slug = item.url.replace(/^\//, "").replace(/\//g, "-") || "index";
    writeFileSync(
      join(itemsDir, `${slug}.json`),
      JSON.stringify(pageResponse, null, 2)
    );
  }

  console.log(
    `[openfeeder] Generated static files in ${outDir}: ` +
      `discovery + ${content.length} items`
  );
}
