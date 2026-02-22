/**
 * OpenFeeder Vite Adapter — Dev server middleware
 *
 * Handles incoming requests in the Vite dev server:
 *   GET /.well-known/openfeeder.json  → discovery document
 *   GET /openfeeder                   → paginated index / single page
 */

import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import { chunkContent, summarise } from "./chunker";
import type {
  OpenFeederContentItem,
  OpenFeederDiscovery,
  OpenFeederIndexResponse,
  OpenFeederPageResponse,
  OpenFeederPluginConfig,
} from "./types";

const DEFAULT_LIMIT = 10;

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-OpenFeeder": "1.0",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    result[k] = v;
  }
  return result;
}

export function createMiddleware(
  config: OpenFeederPluginConfig,
  getContent: () => OpenFeederContentItem[]
): Connect.NextHandleFunction {
  return function openFeederMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: Connect.NextFunction
  ) {
    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.split("?")[0];

    // ── Discovery ─────────────────────────────────────────────────────────
    if (pathname === "/.well-known/openfeeder.json") {
      const body: OpenFeederDiscovery = {
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
      sendJson(res, body);
      return;
    }

    // ── Content feed ──────────────────────────────────────────────────────
    if (pathname === "/openfeeder") {
      const q = parseQuery(rawUrl);
      const content = getContent();

      // Single page mode
      if (q.url) {
        let normalized = q.url.split("?")[0].replace(/\/$/, "");
        // Handle absolute URLs — extract just the pathname
        try {
          const parsed = new URL(normalized);
          normalized = parsed.pathname.replace(/\/$/, "") || "/";
        } catch { /* already relative */ }
        const item = content.find((c) => c.url === normalized);
        if (!item) {
          sendJson(
            res,
            {
              schema: "openfeeder/1.0",
              error: { code: "NOT_FOUND", message: "Item not found." },
            },
            404
          );
          return;
        }

        const chunks = chunkContent(item.content, item.url);
        const body: OpenFeederPageResponse = {
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
        sendJson(res, body);
        return;
      }

      // Index mode
      const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(q.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
      );
      const search = (q.q ?? "").toLowerCase();

      let filtered = content;
      if (search) {
        filtered = content.filter(
          (c) =>
            c.title.toLowerCase().includes(search) ||
            c.content.toLowerCase().includes(search)
        );
      }

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const pageItems = filtered.slice(start, start + limit);

      const body: OpenFeederIndexResponse = {
        schema: "openfeeder/1.0",
        type: "index",
        page,
        total_pages: totalPages,
        items: pageItems.map((item) => ({
          url: item.url,
          title: item.title,
          published: item.published,
          summary: summarise(item.content),
        })),
      };
      sendJson(res, body);
      return;
    }

    next();
  };
}
