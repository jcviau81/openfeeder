/**
 * Tests for ?until= date range parameter in the Express adapter.
 *
 * Run with: node adapters/express/tests/test-until.js
 * No external dependencies required — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Import the functions under test
const {
  handleContent,
  encodeSyncToken,
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

/**
 * Build a minimal Express-like req/res pair and run handleContent.
 * Collects the JSON body written via res.json().
 *
 * @param {object} query  - Simulated query params
 * @param {object} config - OpenFeeder config
 * @returns {Promise<{status: number, body: object}>}
 */
function mockRequest(query, config) {
  return new Promise((resolve) => {
    const listeners = {};

    const req = {
      query,
      headers: {},
      path: '/openfeeder',
    };

    const res = {
      _status: 200,
      _headers: {},
      _openfeederResults: 0,
      locals: {},
      set(headers) { Object.assign(this._headers, headers); return this; },
      setHeader(name, val) { this._headers[name] = val; return this; },
      status(code) { this._status = code; return this; },
      json(body) { resolve({ status: this._status, body }); return this; },
      on(event, fn) { listeners[event] = fn; return this; },
      getHeader(name) { return this._headers[name.toLowerCase()]; },
    };

    handleContent(req, res, config).catch((err) => {
      resolve({ status: 500, body: { error: String(err) } });
    });
  });
}

/**
 * Build a minimal config with in-memory items.
 */
function makeConfig(items = []) {
  return {
    siteName: 'Test Site',
    siteUrl: 'https://example.com',
    language: 'en',
    getItems: async (page, limit) => ({ items, total: items.length }),
    getItem: async (url) => items.find((i) => i.url === url) || null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

section('parseUntil()');

check(parseUntil('') === null, 'empty string → null');
check(parseUntil(null) === null, 'null → null');
check(parseUntil('not-a-date') === null, 'garbage → null');

const d1 = parseUntil('2026-02-15T00:00:00Z');
check(d1 instanceof Date && !isNaN(d1.getTime()), 'valid RFC3339 → Date');
check(d1.toISOString() === '2026-02-15T00:00:00.000Z', 'correct date value');

// parseUntil should NOT accept sync tokens (only RFC3339)
const token = encodeSyncToken('2026-01-01T00:00:00Z');
check(parseUntil(token) === null, 'sync_token not accepted by parseUntil');

// parseSince still accepts sync tokens (existing behaviour unchanged)
check(parseSince(token) !== null, 'parseSince still accepts sync_token');

// ---------------------------------------------------------------------------

section('handleContent — ?until= alone');

(async () => {
  const items = [
    { url: '/post-1', title: 'Post 1', content: 'Hello', published: '2026-01-15T00:00:00Z' },
    { url: '/post-2', title: 'Post 2', content: 'World', published: '2026-02-20T00:00:00Z' },
    { url: '/post-3', title: 'Post 3', content: 'Newer', published: '2026-03-01T00:00:00Z' },
  ];
  const config = makeConfig(items);

  // ?until=2026-02-01 → only post-1 (Jan 15)
  const r1 = await mockRequest({ until: '2026-02-01T00:00:00Z' }, config);
  check(r1.status === 200, '?until= returns 200');
  check(r1.body.openfeeder_version === '1.0', 'has openfeeder_version');
  check('sync' in r1.body, 'has sync envelope');
  check('until' in r1.body.sync, 'sync has "until" field');
  check(!('since' in r1.body.sync), 'sync does NOT have "since" field');
  check(Array.isArray(r1.body.updated), 'has updated array');
  check(r1.body.updated.length === 1, 'only 1 item before Feb 1');
  check(r1.body.updated[0].url === '/post-1', 'correct item: post-1');
  check(r1.body.sync.counts.updated === 1, 'counts.updated = 1');

  // ?until=2026-12-31 → all 3 posts
  const r2 = await mockRequest({ until: '2026-12-31T00:00:00Z' }, config);
  check(r2.body.updated.length === 3, '?until=end-of-year includes all 3 items');

  // ?until=2020-01-01 → nothing
  const r3 = await mockRequest({ until: '2020-01-01T00:00:00Z' }, config);
  check(r3.body.updated.length === 0, '?until=past returns empty updated');

  section('handleContent — ?since= + ?until= (closed range)');

  // ?since=2026-02-01&until=2026-02-28 → post-2 (Feb 20) only
  const r4 = await mockRequest(
    { since: '2026-02-01T00:00:00Z', until: '2026-02-28T00:00:00Z' },
    config
  );
  check(r4.status === 200, '?since=&until= returns 200');
  check('since' in r4.body.sync, 'sync has "since"');
  check('until' in r4.body.sync, 'sync has "until"');
  check(r4.body.updated.length === 1, 'one item in Feb range');
  check(r4.body.updated[0].url === '/post-2', 'correct item: post-2');

  // ?since=2026-01-01&until=2026-03-31 → all 3
  const r5 = await mockRequest(
    { since: '2026-01-01T00:00:00Z', until: '2026-03-31T00:00:00Z' },
    config
  );
  check(r5.body.updated.length === 3, 'full range includes all 3');

  section('handleContent — until < since → 400');

  const r6 = await mockRequest(
    { since: '2026-03-01T00:00:00Z', until: '2026-01-01T00:00:00Z' },
    config
  );
  check(r6.status === 400, 'until < since returns 400');
  check(r6.body.error.code === 'INVALID_PARAM', 'error code INVALID_PARAM');

  section('handleContent — invalid ?until= value → 400');

  const r7 = await mockRequest({ until: 'not-a-date' }, config);
  check(r7.status === 400, 'invalid ?until= returns 400');
  check(r7.body.error.code === 'INVALID_PARAM', 'error code INVALID_PARAM');

  section('handleContent — ?q= takes priority over ?until=');

  // ?q= + ?until= → search mode, not sync mode
  const r8 = await mockRequest({ q: 'Hello', until: '2026-12-31T00:00:00Z' }, config);
  // search mode returns index (no sync envelope)
  check(!('sync' in r8.body), '?q= takes priority, no sync envelope');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(55));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) process.exit(1);
})();
