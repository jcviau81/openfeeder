/**
 * OpenFeeder Astro Adapter — Content handler
 *
 * Handles GET /openfeeder with optional query params:
 *   ?page=1&limit=10        → paginated index
 *   ?url=/some-post         → single page with chunks
 *   ?q=search+term          → search (filtered index)
 */

import { createHash } from "crypto";
import { chunkContent, summarise } from "../chunker.js";
import type {
  OpenFeederConfig,
  OpenFeederIndexResponse,
  OpenFeederPageResponse,
} from "../types.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "X-OpenFeeder": "1.0",
  "Access-Control-Allow-Origin": "*",
};

/** Returns headers including dynamic rate limit fields. */
function getHeaders(): Record<string, string> {
  const reset = String(Math.floor(Date.now() / 1000) + 60);
  return {
    ...BASE_HEADERS,
    "X-RateLimit-Limit": "60",
    "X-RateLimit-Remaining": "60",
    "X-RateLimit-Reset": reset,
  };
}

/** Compute a quoted MD5 ETag from arbitrary data. */
function makeEtag(data: unknown): string {
  return '"' + createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16) + '"';
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
 * Sanitize the ?url= parameter: extract pathname only, reject path traversal.
 * Absolute URLs are stripped to pathname. Returns null on invalid input.
 */
function sanitizeUrlParam(raw: string | null): string | null {
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

function jsonResponse(body: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ schema: "openfeeder/1.0", error: { code, message } }, getHeaders(), status);
}

export async function handleContent(
  request: Request,
  config: OpenFeederConfig
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get("url");
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");
  // Sanitize ?q=: limit to 200 chars, strip HTML
  const query = (searchParams.get("q") ?? "").slice(0, 200).replace(/<[^>]*>/g, "").trim();

  // ── Single page mode ──────────────────────────────────────────────────────
  if (urlParam !== null) {
    const normalizedUrl = sanitizeUrlParam(urlParam);

    if (!normalizedUrl) {
      return errorResponse(
        "INVALID_URL",
        "The ?url= parameter must be a valid relative path.",
        400
      );
    }

    const item = await config.getItem(normalizedUrl);
    if (!item) {
      return errorResponse("NOT_FOUND", "No item found at the given URL.", 404);
    }

    const chunks = chunkContent(item.content, item.url);
    const summary = summarise(item.content);

    const body: OpenFeederPageResponse = {
      schema: "openfeeder/1.0",
      url: item.url,
      title: item.title,
      published: item.published,
      language: config.language ?? "en",
      summary,
      chunks,
      meta: {
        total_chunks: chunks.length,
        returned_chunks: chunks.length,
        cached: false,
        cache_age_seconds: null,
      },
    };

    const etag = makeEtag(body);
    const lastMod = getLastModified([item]);

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304 });
    }

    return jsonResponse(body, {
      ...getHeaders(),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      "ETag": etag,
      "Last-Modified": lastMod,
      "Vary": "Accept-Encoding",
    });
  }

  // ── Index mode ────────────────────────────────────────────────────────────
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );

  const { items: rawItems, total } = await config.getItems(page, limit);

  const filteredItems = query
    ? rawItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.content.toLowerCase().includes(query.toLowerCase())
      )
    : rawItems;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const items = filteredItems.map((item) => ({
    url: item.url,
    title: item.title,
    published: item.published,
    summary: summarise(item.content),
  }));

  const body: OpenFeederIndexResponse = {
    schema: "openfeeder/1.0",
    type: "index",
    page,
    total_pages: totalPages,
    items,
  };

  const etag = makeEtag(body);
  const lastMod = getLastModified(filteredItems);

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304 });
  }

  return jsonResponse(body, {
    ...getHeaders(),
    "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    "ETag": etag,
    "Last-Modified": lastMod,
    "Vary": "Accept-Encoding",
  });
}
