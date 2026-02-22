/**
 * OpenFeeder Astro Adapter — Content handler
 *
 * Handles GET /openfeeder with optional query params:
 *   ?page=1&limit=10        → paginated index
 *   ?url=/some-post         → single page with chunks
 *   ?q=search+term          → search (filtered index)
 */

import { chunkContent, summarise } from "../chunker.js";
import type {
  OpenFeederConfig,
  OpenFeederIndexResponse,
  OpenFeederPageResponse,
} from "../types.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const HEADERS = {
  "Content-Type": "application/json",
  "X-OpenFeeder": "1.0",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ schema: "openfeeder/1.0", error: { code, message } }, status);
}

export async function handleContent(
  request: Request,
  config: OpenFeederConfig
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get("url");
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");
  const query = searchParams.get("q") ?? "";

  // ── Single page mode ──────────────────────────────────────────────────────
  if (urlParam) {
    // Normalise: strip query string, trailing slash, and absolute URL prefix
    let normalizedUrl = urlParam.split("?")[0].replace(/\/$/, "");
    try {
      const parsed = new URL(normalizedUrl);
      normalizedUrl = parsed.pathname.replace(/\/$/, "") || "/";
    } catch {
      // already relative
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

    return jsonResponse(body);
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

  return jsonResponse(body);
}
