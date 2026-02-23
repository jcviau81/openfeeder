#!/usr/bin/env node
"use strict";

/**
 * Differential Sync — sync_token round-trip test
 *
 * Tests the sync_token encode/decode logic from the Express adapter
 * and exercises the full round-trip: GET ?since= → extract sync_token →
 * GET ?since=<sync_token> → verify as_of matches.
 *
 * Usage: node testing/test-diff-sync.js
 */

const http = require("http");
const path = require("path");

// ── Load adapter modules ────────────────────────────────────────────────────

const { openFeederMiddleware } = require(
  path.join(__dirname, "../adapters/express/src/index")
);
const { encodeSyncToken, decodeSyncToken, parseSince } = require(
  path.join(__dirname, "../adapters/express/src/handlers/content")
);

// ── Test data ───────────────────────────────────────────────────────────────

const SAMPLE_ITEMS = [
  {
    url: "/hello-world",
    title: "Hello World",
    content: "<p>This is a test page.</p>",
    published: "2025-01-15T10:00:00Z",
  },
  {
    url: "/recent-post",
    title: "Recent Post",
    content: "<p>A very recent post.</p>",
    published: "2026-02-20T12:00:00Z",
  },
];

function getItems(page, limit) {
  const start = (page - 1) * limit;
  return Promise.resolve({
    items: SAMPLE_ITEMS.slice(start, start + limit),
    total: SAMPLE_ITEMS.length,
  });
}

function getItem(url) {
  const item = SAMPLE_ITEMS.find((i) => i.url === url);
  return Promise.resolve(item || null);
}

// ── Server setup ────────────────────────────────────────────────────────────

let PORT;
let server;

const middleware = openFeederMiddleware({
  siteName: "Diff Sync Test Site",
  siteUrl: "http://localhost",
  language: "en",
  getItems,
  getItem,
});

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((nodeReq, nodeRes) => {
      let body = "";
      nodeReq.on("data", (chunk) => (body += chunk));
      nodeReq.on("end", () => {
        const urlObj = new URL(nodeReq.url, "http://localhost");
        const query = {};
        for (const [k, v] of urlObj.searchParams) query[k] = v;

        const req = {
          method: nodeReq.method,
          path: urlObj.pathname,
          url: nodeReq.url,
          originalUrl: nodeReq.url,
          headers: nodeReq.headers,
          query,
          body: body ? JSON.parse(body) : {},
        };

        const resHeaders = {};
        let statusCode = 200;
        const res = {
          _openfeederResults: 0,
          set(obj) {
            if (typeof obj === "string") {
              resHeaders[obj.toLowerCase()] = arguments[1];
            } else {
              for (const [k, v] of Object.entries(obj))
                resHeaders[k.toLowerCase()] = String(v);
            }
            return res;
          },
          setHeader(k, v) { resHeaders[k.toLowerCase()] = String(v); return res; },
          getHeader(k) { return resHeaders[k.toLowerCase()]; },
          status(code) { statusCode = code; return res; },
          json(data) {
            for (const [k, v] of Object.entries(resHeaders))
              nodeRes.setHeader(k, v);
            const payload = JSON.stringify(data);
            nodeRes.writeHead(statusCode, {
              "content-type": resHeaders["content-type"] || "application/json",
            });
            nodeRes.end(payload);
          },
          end(data) {
            for (const [k, v] of Object.entries(resHeaders))
              nodeRes.setHeader(k, v);
            nodeRes.writeHead(statusCode);
            nodeRes.end(data || "");
          },
          on(event, cb) {
            if (event === "finish") {
              const origEnd = res.end;
              const origJson = res.json;
              res.json = function (data) { origJson.call(res, data); setImmediate(() => cb()); };
              res.end = function (data) { origEnd.call(res, data); setImmediate(() => cb()); };
            }
            return res;
          },
        };

        middleware(req, res, () => {
          nodeRes.writeHead(404, { "Content-Type": "application/json" });
          nodeRes.end(JSON.stringify({ error: "not found" }));
        });
      });
    });

    server.listen(0, () => {
      PORT = server.address().port;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => server.close(resolve));
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

function httpGet(reqPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "localhost", port: PORT, path: reqPath }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    }).on("error", reject);
  });
}

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    failed++;
  }
}

async function runTests() {
  console.log(`\nDifferential Sync Tests\n${"=".repeat(55)}\n`);

  // ── Unit: encodeSyncToken / decodeSyncToken ────────────────────────
  console.log("Unit: encodeSyncToken / decodeSyncToken");
  {
    const iso = "2026-02-20T00:00:00.000Z";
    const token = encodeSyncToken(iso);
    assert(typeof token === "string" && token.length > 0, "encode returns non-empty string");

    const decoded = decodeSyncToken(token);
    assert(decoded instanceof Date, "decode returns a Date");
    assert(decoded.toISOString() === iso, "round-trip preserves timestamp");
  }

  // ── Unit: parseSince ──────────────────────────────────────────────
  console.log("\nUnit: parseSince");
  {
    const d1 = parseSince("2026-02-20T00:00:00Z");
    assert(d1 instanceof Date, "parseSince handles RFC 3339");

    const token = encodeSyncToken("2026-02-20T00:00:00.000Z");
    const d2 = parseSince(token);
    assert(d2 instanceof Date, "parseSince handles sync_token");

    const d3 = parseSince("not-a-date");
    assert(d3 === null, "parseSince returns null for garbage");

    const d4 = parseSince("");
    assert(d4 === null, "parseSince returns null for empty string");
  }

  // ── Integration: Full round-trip via HTTP ──────────────────────────
  await startServer();
  console.log(`\nIntegration tests (port ${PORT})\n`);

  // Step 1: Request with a past date → get sync_token
  console.log("Step 1: GET /openfeeder?since=2020-01-01T00:00:00Z");
  const res1 = await httpGet("/openfeeder?since=2020-01-01T00:00:00Z");
  assert(res1.status === 200, "status 200");
  assert(res1.body.sync !== undefined, "has sync envelope");

  const token = res1.body.sync.sync_token;
  const asOf1 = res1.body.sync.as_of;
  assert(typeof token === "string" && token.length > 0, "has sync_token");
  assert(typeof asOf1 === "string", "has as_of");
  assert(res1.body.updated.length === 2, "2 updated items (all published after 2020)");

  // Step 2: Use the sync_token for the next request
  console.log("\nStep 2: GET /openfeeder?since=<sync_token>");
  const res2 = await httpGet(`/openfeeder?since=${encodeURIComponent(token)}`);
  assert(res2.status === 200, "status 200");
  assert(res2.body.sync !== undefined, "has sync envelope");

  // The since field in res2 should be close to as_of from res1
  const sinceFromToken = new Date(res2.body.sync.since).getTime();
  const asOfOriginal = new Date(asOf1).getTime();
  assert(
    Math.abs(sinceFromToken - asOfOriginal) < 2000,
    "since from token matches original as_of (within 2s)"
  );

  // Since the token was generated ~now, no items should have changed
  assert(res2.body.updated.length === 0, "no updated items (token is ~now)");

  // Step 3: Verify the structure of the second sync_token
  console.log("\nStep 3: Verify second sync_token structure");
  const token2 = res2.body.sync.sync_token;
  const decoded = decodeSyncToken(token2);
  assert(decoded instanceof Date, "second token decodes to Date");
  assert(!isNaN(decoded.getTime()), "second token has valid timestamp");

  // Step 4: Request with a date between the two posts
  console.log("\nStep 4: GET /openfeeder?since=2026-01-01T00:00:00Z");
  const res3 = await httpGet("/openfeeder?since=2026-01-01T00:00:00Z");
  assert(res3.status === 200, "status 200");
  assert(res3.body.updated.length === 1, "1 updated item (only the 2026 post)");
  assert(res3.body.updated[0].url === "/recent-post", "correct post returned");

  await stopServer();

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
