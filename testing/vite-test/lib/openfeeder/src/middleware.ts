/**
 * OpenFeeder Vite Adapter — Dev server middleware
 *
 * Handles incoming requests in the Vite dev server:
 *   GET /.well-known/openfeeder.json  → discovery document
 *   GET /openfeeder                   → paginated index / single page
 */

import { createHash } from "crypto";
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

/**
 * Sanitize the ?url= parameter: extract pathname only, reject path traversal.
 * Absolute URLs are stripped to pathname. Returns null on invalid input.
 */
function sanitizeUrlParam(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "http://localhost");
    const path = parsed.pathname.replace(/\/$/, "") || "/";
    if (path.includes("..")) return null;
    return path;
  } catch {
    return null;
  }
}

function getRateLimitHeaders(): Record<string, string> {
  const reset = String(Math.floor(Date.now() / 1000) + 60);
  return {
    "X-RateLimit-Limit": "60",
    "X-RateLimit-Remaining": "60",
    "X-RateLimit-Reset": reset,
  };
}

/** Compute a quoted MD5 ETag from a JSON string. */
function makeEtag(body: string): string {
  return '"' + createHash("md5").update(body).digest("hex").slice(0, 16) + '"';
}

/** Return RFC 7231 date of the most recently published item. */
function getLastModified(items: Array<{ published?: string }>): string {
  const dates = items
    .map((i) => new Date(i.published ?? 0))
    .filter((d) => !isNaN(d.getTime()));
  return dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime()))).toUTCString()
    : new Date().toUTCString();
}

/**
 * Send a JSON response, optionally with HTTP caching headers.
 * When req is provided, computes an ETag and returns 304 if the client's
 * If-None-Match matches.
 *
 * @returns true if a 304 was sent (caller should return), false otherwise.
 */
function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  data: unknown,
  status = 200,
  cacheHeaders?: { lastMod: string }
): boolean {
  const body = JSON.stringify(data, null, 2);
  const rlHeaders = getRateLimitHeaders();

  if (cacheHeaders) {
    const etag = makeEtag(body);
    if (req.headers["if-none-match"] === etag) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    res.writeHead(status, {
      "Content-Type": "application/json",
      "X-OpenFeeder": "1.0",
      "Access-Control-Allow-Origin": "*",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      "ETag": etag,
      "Last-Modified": cacheHeaders.lastMod,
      "Vary": "Accept-Encoding",
      ...rlHeaders,
    });
  } else {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "X-OpenFeeder": "1.0",
      "Access-Control-Allow-Origin": "*",
      "Content-Length": Buffer.byteLength(body),
      ...rlHeaders,
    });
  }
  res.end(body);
  return false;
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
      const lastMod = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toUTCString();
      sendJson(req, res, body, 200, { lastMod });
      return;
    }

    // ── Content feed ──────────────────────────────────────────────────────
    if (pathname === "/openfeeder") {
      const q = parseQuery(rawUrl);
      const content = getContent();

      // Single page mode
      if (q.url !== undefined) {
        const normalized = sanitizeUrlParam(q.url);
        if (!normalized) {
          sendJson(req, res, {
            schema: "openfeeder/1.0",
            error: { code: "INVALID_URL", message: "The ?url= parameter must be a valid relative path." },
          }, 400);
          return;
        }
        const item = content.find((c) => c.url === normalized);
        if (!item) {
          sendJson(req, res, {
            schema: "openfeeder/1.0",
            error: { code: "NOT_FOUND", message: "Item not found." },
          }, 404);
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
        sendJson(req, res, body, 200, { lastMod: getLastModified([item]) });
        return;
      }

      // Index mode
      const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(q.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
      );
      // Sanitize ?q=: limit to 200 chars, strip HTML
      const search = (q.q ?? "").slice(0, 200).replace(/<[^>]*>/g, "").trim().toLowerCase();

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
      sendJson(req, res, body, 200, { lastMod: getLastModified(pageItems) });
      return;
    }

    next();
  };
}
