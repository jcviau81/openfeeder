/**
 * OpenFeeder Express Adapter — Content handler
 *
 * Handles GET /openfeeder with optional query params:
 *   ?page=1&limit=10        → paginated index
 *   ?url=/some-post         → single page with chunks
 *   ?q=search+term          → search (filtered index)
 */

'use strict';

const { chunkContent, summarise } = require('../chunker');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const HEADERS = {
  'Content-Type': 'application/json',
  'X-OpenFeeder': '1.0',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Returns rate limit headers with Reset = now + 60 seconds.
 * @returns {object}
 */
function getRateLimitHeaders() {
  return {
    'X-RateLimit-Limit': '60',
    'X-RateLimit-Remaining': '60',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
  };
}

/**
 * Sanitize the ?url= parameter: extract pathname only, reject path traversal.
 * Absolute URLs are stripped to pathname. Returns null on invalid input.
 *
 * @param {string|undefined} raw
 * @returns {string|null}
 */
function sanitizeUrlParam(raw) {
  if (!raw) return null;
  try {
    // If absolute URL, extract pathname only
    const parsed = new URL(raw, 'http://localhost');
    const path = parsed.pathname.replace(/\/$/, '') || '/';
    // Reject path traversal
    if (path.includes('..')) return null;
    return path;
  } catch {
    return null;
  }
}

/**
 * @param {import('express').Response} res
 * @param {string} code
 * @param {string} message
 * @param {number} status
 */
function sendError(res, code, message, status) {
  res.set({ ...HEADERS, ...getRateLimitHeaders() }).status(status).json({
    schema: 'openfeeder/1.0',
    error: { code, message },
  });
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {object} config
 */
async function handleContent(req, res, config) {
  try {
    const urlParam = req.query.url;
    const pageParam = req.query.page;
    const limitParam = req.query.limit;
    // Sanitize ?q=: limit to 200 chars, strip HTML
    const query = (req.query.q || '').slice(0, 200).replace(/<[^>]*>/g, '').trim();

    const allHeaders = { ...HEADERS, ...getRateLimitHeaders() };

    // ── Single page mode ──────────────────────────────────────────────────
    if (urlParam) {
      const normalizedUrl = sanitizeUrlParam(String(urlParam));

      if (!normalizedUrl) {
        return sendError(res, 'INVALID_URL', 'The ?url= parameter must be a valid relative path.', 400);
      }

      let item;
      try {
        item = await config.getItem(normalizedUrl);
      } catch (err) {
        return sendError(res, 'INTERNAL_ERROR', 'Failed to fetch item.', 500);
      }

      if (!item) {
        return sendError(res, 'NOT_FOUND', 'No item found at the given URL.', 404);
      }

      const chunks = chunkContent(item.content, item.url);
      const summary = summarise(item.content);

      const body = {
        schema: 'openfeeder/1.0',
        url: item.url,
        title: item.title,
        published: item.published,
        language: config.language || 'en',
        summary,
        chunks,
        meta: {
          total_chunks: chunks.length,
          returned_chunks: chunks.length,
          cached: false,
          cache_age_seconds: null,
        },
      };

      return res.set(allHeaders).status(200).json(body);
    }

    // ── Index mode ────────────────────────────────────────────────────────
    const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );

    let rawItems, total;
    try {
      ({ items: rawItems, total } = await config.getItems(page, limit));
    } catch (err) {
      return sendError(res, 'INTERNAL_ERROR', 'Failed to fetch items.', 500);
    }

    // Optional search filter (simple substring match on title + content)
    const filteredItems = query
      ? rawItems.filter(
          (item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            (item.content || '').toLowerCase().includes(query.toLowerCase())
        )
      : rawItems;

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const items = filteredItems.map((item) => ({
      url: item.url,
      title: item.title,
      published: item.published,
      summary: summarise(item.content || ''),
    }));

    const body = {
      schema: 'openfeeder/1.0',
      type: 'index',
      page,
      total_pages: totalPages,
      items,
    };

    return res.set(allHeaders).status(200).json(body);

  } catch (err) {
    console.error('[openfeeder] Unexpected error:', err);
    return sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
}

module.exports = { handleContent };
