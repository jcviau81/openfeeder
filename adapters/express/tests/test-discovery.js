/**
 * Tests for the discovery endpoint handler.
 *
 * Run with: node adapters/express/tests/test-discovery.js
 * No external dependencies required — uses Node.js built-in assert.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { handleDiscovery } = require(path.join(__dirname, '../src/handlers/discovery'));

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

function mockDiscoveryRequest(headers = {}) {
  return new Promise((resolve) => {
    const req = { headers };

    let _status = 200;
    let _headers = {};
    let _ended = false;

    const res = {
      set(h) { Object.assign(_headers, h); return this; },
      status(code) { _status = code; return this; },
      json(body) { resolve({ status: _status, headers: _headers, body }); return this; },
      end() { _ended = true; resolve({ status: _status, headers: _headers, body: null, ended: true }); return this; },
    };

    handleDiscovery(req, res, {
      siteName: 'Test Site',
      siteUrl: 'https://example.com',
      language: 'en',
      siteDescription: 'A test site',
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

(async () => {
  section('handleDiscovery — response body');

  const r1 = await mockDiscoveryRequest();
  check(r1.status === 200, 'returns 200');
  check(r1.body.version === '1.0', 'schema version is 1.0');
  check(r1.body.site.name === 'Test Site', 'site.name matches config');
  check(r1.body.site.url === 'https://example.com', 'site.url matches config');
  check(r1.body.site.language === 'en', 'site.language matches config');
  check(r1.body.site.description === 'A test site', 'site.description matches config');
  check(r1.body.feed.endpoint === '/openfeeder', 'feed.endpoint is /openfeeder');
  check(r1.body.feed.type === 'paginated', 'feed.type is paginated');
  check(Array.isArray(r1.body.capabilities), 'capabilities is an array');
  check(r1.body.capabilities.includes('search'), 'capabilities includes search');
  check(r1.body.contact === null, 'contact is null');

  section('handleDiscovery — response headers');

  check(r1.headers['Content-Type'] === 'application/json', 'Content-Type is application/json');
  check(r1.headers['X-OpenFeeder'] === '1.0', 'X-OpenFeeder header is 1.0');
  check(r1.headers['Access-Control-Allow-Origin'] === '*', 'CORS header set');
  check(r1.headers['Cache-Control'] === 'public, max-age=300, stale-while-revalidate=60', 'Cache-Control header set');
  check(typeof r1.headers['ETag'] === 'string', 'ETag header is set');
  check(r1.headers['ETag'].startsWith('"') && r1.headers['ETag'].endsWith('"'), 'ETag is quoted');
  check(typeof r1.headers['Last-Modified'] === 'string', 'Last-Modified header is set');
  check(r1.headers['Vary'] === 'Accept-Encoding', 'Vary header is set');

  section('handleDiscovery — ETag 304 Not Modified');

  const etag = r1.headers['ETag'];
  const r2 = await mockDiscoveryRequest({ 'if-none-match': etag });
  check(r2.status === 304, 'returns 304 when ETag matches');
  check(r2.body === null, 'no body on 304');
  check(r2.ended === true, 'response ended on 304');

  section('handleDiscovery — ETag mismatch returns 200');

  const r3 = await mockDiscoveryRequest({ 'if-none-match': '"stale-etag"' });
  check(r3.status === 200, 'returns 200 when ETag does not match');
  check(r3.body !== null, 'body present on ETag mismatch');

  section('handleDiscovery — config defaults');

  // Test with missing optional config fields
  const r4 = await new Promise((resolve) => {
    const req = { headers: {} };
    const res = {
      _status: 200,
      _headers: {},
      set(h) { Object.assign(this._headers, h); return this; },
      status(code) { this._status = code; return this; },
      json(body) { resolve({ status: this._status, body }); return this; },
    };
    handleDiscovery(req, res, {
      siteName: 'Minimal',
      siteUrl: 'https://min.test',
    });
  });
  check(r4.body.site.language === 'en', 'language defaults to en');
  check(r4.body.site.description === '', 'description defaults to empty string');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(55));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) process.exit(1);
})();
