/**
 * OpenFeeder Express Adapter — Content handler
 *
 * Handles GET /openfeeder with optional query params:
 *   ?page=1&limit=10        → paginated index
 *   ?url=/some-post         → single page with chunks
 *   ?q=search+term          → search (filtered index)
 */

'use strict';

const crypto = require('crypto');
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
 * Compute a quoted MD5 ETag from an arbitrary data object.
 * @param {unknown} data
 * @returns {string}
 */
function makeEtag(data) {
  return '"' + crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 16) + '"';
}

/**
 * Return the RFC 7231 date string of the most recently published item.
 * Falls back to the current time when no dates are found.
 * @param {Array<{published?: string}>} items
 * @returns {string}
 */
function getLastModified(items) {
  const dates = items
    .map((i) => new Date(i.published || 0))
    .filter((d) => !isNaN(d.getTime()));
  return dates.length ? new Date(Math.max(...dates)).toUTCString() : new Date().toUTCString();
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
 * Check whether a path should be excluded based on the excludePaths config.
 * @param {string} path
 * @param {string[]} excludePaths
 * @returns {boolean}
 */
function isExcludedPath(path, excludePaths) {
  if (!excludePaths || !excludePaths.length) return false;
  return excludePaths.some((prefix) => path.startsWith(prefix));
}

/**
 * Encode an ISO timestamp into a sync_token.
 * @param {string} asOfIso
 * @returns {string}
 */
function encodeSyncToken(asOfIso) {
  return Buffer.from(JSON.stringify({ t: asOfIso })).toString('base64');
}

/**
 * Decode a sync_token to a Date, or return null on failure.
 * @param {string} token
 * @returns {Date|null}
 */
function decodeSyncToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (payload && payload.t) {
      const d = new Date(payload.t);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Parse a ?since= value — accepts RFC 3339 datetime or sync_token.
 * @param {string} raw
 * @returns {Date|null}
 */
function parseSince(raw) {
  if (!raw) return null;
  // Try RFC 3339 first
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // Try sync_token
  return decodeSyncToken(raw);
}

/**
 * Parse a ?until= value — accepts RFC 3339 datetime only (no sync_token).
 * @param {string} raw
 * @returns {Date|null}
 */
function parseUntil(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  return null;
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
    const sinceRaw = req.query.since || '';
    const untilRaw = req.query.until || '';

    // ── Differential sync mode (?since= and/or ?until= without ?q=) ────────
    if ((sinceRaw || untilRaw) && !query) {
      let sinceDate = null;
      let untilDate = null;

      if (sinceRaw) {
        sinceDate = parseSince(sinceRaw);
        if (!sinceDate) {
          return sendError(res, 'INVALID_PARAM', 'Invalid ?since= value. Provide an RFC3339 datetime or a valid sync_token.', 400);
        }
      }

      if (untilRaw) {
        untilDate = parseUntil(untilRaw);
        if (!untilDate) {
          return sendError(res, 'INVALID_PARAM', 'Invalid ?until= value. Provide an RFC3339 datetime.', 400);
        }
      }

      if (sinceDate && untilDate && untilDate.getTime() < sinceDate.getTime()) {
        return sendError(res, 'INVALID_PARAM', '?until= must be after ?since=.', 400);
      }

      const sinceMs = sinceDate ? sinceDate.getTime() : null;
      const untilMs = untilDate ? untilDate.getTime() : null;

      // Get all items and filter by published date (mtime proxy)
      let rawItems, total;
      try {
        ({ items: rawItems, total } = await config.getItems(1, 10000));
      } catch (err) {
        return sendError(res, 'INTERNAL_ERROR', 'Failed to fetch items.', 500);
      }

      // Filter excluded paths
      const pathFiltered = config.excludePaths
        ? rawItems.filter((item) => !isExcludedPath(item.url, config.excludePaths))
        : rawItems;

      // Items within the requested date range → updated
      // (can't distinguish added vs updated for static files)
      const updated = pathFiltered
        .filter((item) => {
          const pubDate = new Date(item.published || 0);
          if (isNaN(pubDate.getTime())) return false;
          const t = pubDate.getTime();
          if (sinceMs !== null && t < sinceMs) return false;
          if (untilMs !== null && t > untilMs) return false;
          return true;
        })
        .map((item) => ({
          url: item.url,
          title: item.title,
          published: item.published,
          summary: summarise(item.content || ''),
        }));

      const asOf = new Date().toISOString();
      const syncToken = encodeSyncToken(asOf);

      const syncMeta = {
        as_of: asOf,
        sync_token: syncToken,
        deleted_tracking: false,
        counts: {
          added: 0,
          updated: updated.length,
          deleted: 0,
        },
      };
      if (sinceDate) syncMeta.since = sinceDate.toISOString();
      if (untilDate) syncMeta.until = untilDate.toISOString();

      const body = {
        openfeeder_version: '1.0',
        sync: syncMeta,
        added: [],
        updated,
        deleted: [],
      };

      res.locals.openfeederResults = updated.length;
      return res.set({
        ...HEADERS,
        ...getRateLimitHeaders(),
      }).status(200).json(body);
    }

    // ── Single page mode ──────────────────────────────────────────────────
    if (urlParam) {
      const normalizedUrl = sanitizeUrlParam(String(urlParam));

      if (!normalizedUrl) {
        return sendError(res, 'INVALID_URL', 'The ?url= parameter must be a valid relative path.', 400);
      }

      // Check excluded paths.
      if (isExcludedPath(normalizedUrl, config.excludePaths)) {
        return sendError(res, 'NOT_FOUND', 'No item found at the given URL.', 404);
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

      const etag = makeEtag(body);
      const lastMod = getLastModified([item]);

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.locals.openfeederResults = chunks.length;
      return res.set({
        ...HEADERS,
        ...getRateLimitHeaders(),
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'ETag': etag,
        'Last-Modified': lastMod,
        'Vary': 'Accept-Encoding',
      }).status(200).json(body);
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

    // Filter excluded paths from results.
    const pathFiltered = config.excludePaths
      ? rawItems.filter((item) => !isExcludedPath(item.url, config.excludePaths))
      : rawItems;

    // Optional search filter (simple substring match on title + content)
    const filteredItems = query
      ? pathFiltered.filter(
          (item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            (item.content || '').toLowerCase().includes(query.toLowerCase())
        )
      : pathFiltered;

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

    const etag = makeEtag(body);
    const lastMod = getLastModified(filteredItems);

    res.locals.openfeederResults = items.length;

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    return res.set({
      ...HEADERS,
      ...getRateLimitHeaders(),
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      'ETag': etag,
      'Last-Modified': lastMod,
      'Vary': 'Accept-Encoding',
    }).status(200).json(body);

  } catch (err) {
    console.error('[openfeeder] Unexpected error:', err);
    return sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
}

module.exports = { handleContent, encodeSyncToken, decodeSyncToken, parseSince, parseUntil };
