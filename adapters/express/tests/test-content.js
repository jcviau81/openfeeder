/**
 * Tests for the content handler functions.
 *
 * Run with: node adapters/express/tests/test-content.js
 * No external dependencies required — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const {
  handleContent,
  encodeSyncToken,
  decodeSyncToken,
  parseSince,
  parseUntil,
} = require(path.join(__dirname, '../src/handlers/content'));

// ---------------------------------------------------------------------------
// Simple test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\nUnit: ${title}`);
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockRequest(query, config) {
  return new Promise((resolve) => {
    const req = {
      query,
      headers: {},
      path: '/openfeeder',
    };

    const res = {
      _status: 200,
      _headers: {},
      locals: {},
      set(headers) { Object.assign(this._headers, headers); return this; },
      setHeader(name, val) { this._headers[name] = val; return this; },
      status(code) { this._status = code; return this; },
      json(body) { resolve({ status: this._status, headers: this._headers, body }); return this; },
      end() { resolve({ status: this._status, headers: this._headers, body: null, ended: true }); return this; },
    };

    handleContent(req, res, config).catch((err) => {
      resolve({ status: 500, body: { error: String(err) } });
    });
  });
}

function makeConfig(items = []) {
  return {
    siteName: 'Test Site',
    siteUrl: 'https://example.com',
    language: 'en',
    getItems: async (page, limit) => ({ items, total: items.length }),
    getItem: async (url) => items.find((i) => i.url === url) || null,
  };
}

const SAMPLE_ITEMS = [
  { url: '/post-1', title: 'Alpha Post', content: 'Hello world content', published: '2026-01-15T00:00:00Z' },
  { url: '/post-2', title: 'Beta Post', content: 'Second article text', published: '2026-02-20T00:00:00Z' },
  { url: '/post-3', title: 'Gamma Post', content: 'Third article here', published: '2026-03-01T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async () => {

  // ── parseSince ──────────────────────────────────────────────────────────
  section('parseSince()');

  check(parseSince('') === null, 'empty string → null');
  check(parseSince(null) === null, 'null → null');
  check(parseSince(undefined) === null, 'undefined → null');

  const ps1 = parseSince('2026-01-01T00:00:00Z');
  check(ps1 instanceof Date && !isNaN(ps1.getTime()), 'valid RFC3339 → Date');
  check(ps1.toISOString() === '2026-01-01T00:00:00.000Z', 'correct date value');

  const token = encodeSyncToken('2026-06-15T12:00:00Z');
  const ps2 = parseSince(token);
  check(ps2 instanceof Date, 'sync token → Date');
  check(ps2.toISOString() === '2026-06-15T12:00:00.000Z', 'sync token decoded correctly');

  check(parseSince('not-a-date') === null, 'garbage string → null');
  check(parseSince('abc123base64garbage') === null, 'invalid base64 → null');

  // ── parseUntil ──────────────────────────────────────────────────────────
  section('parseUntil()');

  check(parseUntil('') === null, 'empty string → null');
  check(parseUntil(null) === null, 'null → null');
  check(parseUntil(undefined) === null, 'undefined → null');
  check(parseUntil('garbage') === null, 'garbage → null');

  const pu1 = parseUntil('2026-02-15T00:00:00Z');
  check(pu1 instanceof Date && !isNaN(pu1.getTime()), 'valid RFC3339 → Date');
  check(pu1.toISOString() === '2026-02-15T00:00:00.000Z', 'correct date value');

  // parseUntil must NOT accept sync tokens
  const syncTok = encodeSyncToken('2026-01-01T00:00:00Z');
  check(parseUntil(syncTok) === null, 'sync_token rejected by parseUntil');

  // ── encodeSyncToken / decodeSyncToken ───────────────────────────────────
  section('encodeSyncToken() / decodeSyncToken()');

  const iso = '2026-03-10T08:30:00.000Z';
  const encoded = encodeSyncToken(iso);
  check(typeof encoded === 'string', 'encodeSyncToken returns a string');
  check(encoded.length > 0, 'encoded token is non-empty');

  const decoded = decodeSyncToken(encoded);
  check(decoded instanceof Date, 'decodeSyncToken returns a Date');
  check(decoded.toISOString() === iso, 'round-trip preserves timestamp');

  // Invalid tokens
  check(decodeSyncToken('') === null, 'empty string → null');
  check(decodeSyncToken('not-base64!!!') === null, 'garbage → null');
  check(decodeSyncToken(Buffer.from('{}').toString('base64')) === null, 'missing t field → null');
  check(decodeSyncToken(Buffer.from('{"t":"invalid"}').toString('base64')) === null, 'invalid date in t → null');

  // ── handleContent — index mode ──────────────────────────────────────────
  section('handleContent — index mode (default)');

  const config = makeConfig(SAMPLE_ITEMS);

  const r1 = await mockRequest({}, config);
  check(r1.status === 200, 'returns 200');
  check(r1.body.schema === 'openfeeder/1.0', 'schema is openfeeder/1.0');
  check(r1.body.type === 'index', 'type is index');
  check(r1.body.page === 1, 'default page is 1');
  check(r1.body.total_pages >= 1, 'total_pages >= 1');
  check(Array.isArray(r1.body.items), 'items is an array');
  check(r1.body.items.length === 3, 'all 3 items returned');

  // Each item should have url, title, published, summary
  const item0 = r1.body.items[0];
  check(typeof item0.url === 'string', 'item has url');
  check(typeof item0.title === 'string', 'item has title');
  check(typeof item0.published === 'string', 'item has published');
  check(typeof item0.summary === 'string', 'item has summary');

  section('handleContent — index headers');

  check(r1.headers['Content-Type'] === 'application/json', 'Content-Type header');
  check(r1.headers['X-OpenFeeder'] === '1.0', 'X-OpenFeeder header');
  check(r1.headers['Access-Control-Allow-Origin'] === '*', 'CORS header');
  check(typeof r1.headers['ETag'] === 'string', 'ETag header present');
  check(r1.headers['X-OpenFeeder-Cache'] === 'MISS', 'X-OpenFeeder-Cache is MISS');

  section('handleContent — index ETag 304');

  const etag = r1.headers['ETag'];
  const r1b = await new Promise((resolve) => {
    const req = { query: {}, headers: { 'if-none-match': etag }, path: '/openfeeder' };
    const res = {
      _status: 200, _headers: {}, locals: {},
      set(h) { Object.assign(this._headers, h); return this; },
      setHeader(n, v) { this._headers[n] = v; return this; },
      status(c) { this._status = c; return this; },
      json(b) { resolve({ status: this._status, body: b }); return this; },
      end() { resolve({ status: this._status, body: null, ended: true }); return this; },
    };
    handleContent(req, res, config);
  });
  check(r1b.status === 304, 'returns 304 when ETag matches');

  // ── handleContent — pagination ──────────────────────────────────────────
  section('handleContent — pagination');

  const r2 = await mockRequest({ page: '1', limit: '2' }, config);
  check(r2.status === 200, 'page=1&limit=2 returns 200');
  check(r2.body.page === 1, 'page is 1');
  // total_pages = ceil(3/2) = 2
  check(r2.body.total_pages === 2, 'total_pages is 2 for 3 items with limit 2');

  // Limit capped at 100
  const rLimit = await mockRequest({ limit: '999' }, config);
  check(rLimit.status === 200, 'limit > MAX returns 200');

  // Invalid page defaults to 1
  const rBadPage = await mockRequest({ page: 'abc' }, config);
  check(rBadPage.body.page === 1, 'invalid page defaults to 1');

  // ── handleContent — search (?q=) ────────────────────────────────────────
  section('handleContent — search (?q=)');

  const r3 = await mockRequest({ q: 'Alpha' }, config);
  check(r3.status === 200, '?q=Alpha returns 200');
  check(r3.body.items.length === 1, 'finds 1 matching item');
  check(r3.body.items[0].title === 'Alpha Post', 'correct item found');

  // Case-insensitive
  const r3b = await mockRequest({ q: 'alpha' }, config);
  check(r3b.body.items.length === 1, 'search is case-insensitive');

  // Search in content, not just title
  const r3c = await mockRequest({ q: 'world' }, config);
  check(r3c.body.items.length === 1, 'searches content too');
  check(r3c.body.items[0].url === '/post-1', 'found item by content match');

  // No results
  const r3d = await mockRequest({ q: 'nonexistent' }, config);
  check(r3d.body.items.length === 0, 'no results for unmatched query');

  // ── handleContent — single page (?url=) ─────────────────────────────────
  section('handleContent — single page (?url=)');

  const r4 = await mockRequest({ url: '/post-1' }, config);
  check(r4.status === 200, '?url=/post-1 returns 200');
  check(r4.body.schema === 'openfeeder/1.0', 'schema present');
  check(r4.body.url === '/post-1', 'url in response');
  check(r4.body.title === 'Alpha Post', 'title in response');
  check(r4.body.published === '2026-01-15T00:00:00Z', 'published in response');
  check(typeof r4.body.summary === 'string', 'summary in response');
  check(Array.isArray(r4.body.chunks), 'chunks is an array');
  check(r4.body.meta.total_chunks === r4.body.chunks.length, 'meta.total_chunks matches');

  // Item not found
  const r4b = await mockRequest({ url: '/nonexistent' }, config);
  check(r4b.status === 404, '?url= not found returns 404');
  check(r4b.body.error.code === 'NOT_FOUND', 'error code NOT_FOUND');

  // Path traversal: URL constructor normalizes /../../ away, resulting in valid
  // pathname /etc/passwd which simply isn't found → 404
  const r4c = await mockRequest({ url: '/../../etc/passwd' }, config);
  check(r4c.status === 404, 'path traversal normalized by URL constructor → 404');
  check(r4c.body.error.code === 'NOT_FOUND', 'traversal path not found');

  // ── handleContent — excludePaths ────────────────────────────────────────
  section('handleContent — excludePaths');

  const excludeConfig = {
    ...makeConfig(SAMPLE_ITEMS),
    excludePaths: ['/post-1'],
  };

  const r5 = await mockRequest({}, excludeConfig);
  check(r5.body.items.length === 2, 'excludePaths filters index results');
  check(!r5.body.items.some((i) => i.url === '/post-1'), 'excluded item not in results');

  const r5b = await mockRequest({ url: '/post-1' }, excludeConfig);
  check(r5b.status === 404, 'excluded path returns 404 in single-page mode');

  // ── handleContent — sync mode (?since=) ─────────────────────────────────
  section('handleContent — sync mode (?since=)');

  const r6 = await mockRequest({ since: '2026-02-01T00:00:00Z' }, config);
  check(r6.status === 200, '?since= returns 200');
  check(r6.body.openfeeder_version === '1.0', 'has openfeeder_version');
  check('sync' in r6.body, 'has sync envelope');
  check(Array.isArray(r6.body.updated), 'has updated array');
  check(r6.body.updated.length === 2, '2 items after Feb 1');
  check(Array.isArray(r6.body.added), 'has added array');
  check(Array.isArray(r6.body.deleted), 'has deleted array');
  check(typeof r6.body.sync.sync_token === 'string', 'has sync_token');
  check(typeof r6.body.sync.as_of === 'string', 'has as_of');

  // Invalid since
  const r6b = await mockRequest({ since: 'invalid' }, config);
  check(r6b.status === 400, 'invalid ?since= returns 400');
  check(r6b.body.error.code === 'INVALID_PARAM', 'error code INVALID_PARAM');

  // ── handleContent — sync mode (?until=) ─────────────────────────────────
  section('handleContent — sync mode (?until=)');

  const r7 = await mockRequest({ until: '2026-02-01T00:00:00Z' }, config);
  check(r7.status === 200, '?until= returns 200');
  check(r7.body.updated.length === 1, '1 item before Feb 1');
  check(r7.body.updated[0].url === '/post-1', 'correct item');
  check('until' in r7.body.sync, 'sync has until field');
  check(!('since' in r7.body.sync), 'sync has no since field');

  // Invalid until
  const r7b = await mockRequest({ until: 'garbage' }, config);
  check(r7b.status === 400, 'invalid ?until= returns 400');

  // ── handleContent — until < since → 400 ─────────────────────────────────
  section('handleContent — until < since → 400');

  const r8 = await mockRequest(
    { since: '2026-03-01T00:00:00Z', until: '2026-01-01T00:00:00Z' },
    config
  );
  check(r8.status === 400, 'until < since returns 400');
  check(r8.body.error.code === 'INVALID_PARAM', 'error code INVALID_PARAM');

  // ── handleContent — ?q= overrides sync mode ─────────────────────────────
  section('handleContent — ?q= overrides sync mode');

  const r9 = await mockRequest({ q: 'Hello', since: '2025-01-01T00:00:00Z' }, config);
  check(!('sync' in r9.body), '?q= takes priority — no sync envelope');
  check(r9.body.type === 'index', 'returns index mode');

  // ── handleContent — getItems failure ─────────────────────────────────────
  section('handleContent — internal errors');

  const errorConfig = {
    ...makeConfig(),
    getItems: async () => { throw new Error('DB down'); },
    getItem: async () => { throw new Error('DB down'); },
  };

  const r10 = await mockRequest({}, errorConfig);
  check(r10.status === 500, 'getItems failure returns 500');
  check(r10.body.error.code === 'INTERNAL_ERROR', 'error code INTERNAL_ERROR');

  const r10b = await mockRequest({ url: '/test' }, errorConfig);
  check(r10b.status === 500, 'getItem failure returns 500');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(55));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) process.exit(1);
})();
