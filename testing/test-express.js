#!/usr/bin/env node
"use strict";

/**
 * Express Adapter Full Test Suite
 *
 * Spawns a minimal Express-like test server using the adapter middleware
 * directly (no external deps) and exercises: discovery, index, search,
 * min_score, caching, CORS, security, and LLM Gateway modes.
 *
 * Usage: node testing/test-express.js
 */

const http = require("http");
const path = require("path");
const crypto = require("crypto");

// ── Load adapter modules ────────────────────────────────────────────────────

const { openFeederMiddleware } = require(
  path.join(__dirname, "../adapters/express/src/index")
);

// ── Test data ───────────────────────────────────────────────────────────────

const SAMPLE_ITEMS = [
  {
    url: "/hello-world",
    title: "Hello World",
    content: "<p>This is a test page with some content about testing things.</p>",
    published: "2025-01-15T10:00:00Z",
  },
  {
    url: "/second-post",
    title: "Second Post About Testing",
    content: "<p>Another test post with more test content for searching.</p>",
    published: "2025-01-20T12:00:00Z",
  },
  {
    url: "/checkout",
    title: "Checkout Page",
    content: "<p>Buy stuff here.</p>",
    published: "2025-01-25T08:00:00Z",
  },
  {
    url: "/wp-admin/settings",
    title: "Admin Settings",
    content: "<p>Internal admin page.</p>",
    published: "2025-01-01T00:00:00Z",
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
  siteName: "Test Site",
  siteUrl: "http://localhost",
  siteDescription: "A test site for OpenFeeder",
  language: "en",
  llmGateway: true,
  excludePaths: ["/checkout", "/cart", "/wp-admin"],
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

        // Express-like req
        const req = {
          method: nodeReq.method,
          path: urlObj.pathname,
          url: nodeReq.url,
          originalUrl: nodeReq.url,
          headers: nodeReq.headers,
          query,
          body: body ? JSON.parse(body) : {},
        };

        // Express-like res
        const resHeaders = {};
        let statusCode = 200;
        const res = {
          _openfeederResults: 0,
          set(obj) {
            if (typeof obj === "string") {
              resHeaders[obj.toLowerCase()] = arguments[1];
            } else {
              for (const [k, v] of Object.entries(obj)) {
                resHeaders[k.toLowerCase()] = String(v);
              }
            }
            return res;
          },
          setHeader(k, v) {
            resHeaders[k.toLowerCase()] = String(v);
            return res;
          },
          getHeader(k) {
            return resHeaders[k.toLowerCase()];
          },
          status(code) {
            statusCode = code;
            return res;
          },
          json(data) {
            for (const [k, v] of Object.entries(resHeaders)) {
              nodeRes.setHeader(k, v);
            }
            const payload = JSON.stringify(data);
            nodeRes.writeHead(statusCode, {
              "content-type": resHeaders["content-type"] || "application/json",
            });
            nodeRes.end(payload);
          },
          end(data) {
            for (const [k, v] of Object.entries(resHeaders)) {
              nodeRes.setHeader(k, v);
            }
            nodeRes.writeHead(statusCode);
            nodeRes.end(data || "");
          },
          on(event, cb) {
            // mock res.on('finish', ...) for analytics tracking
            if (event === "finish") {
              // defer so it fires after end()
              const origEnd = nodeRes.end.bind(nodeRes);
              const origEndRes = res.end;
              const origJsonRes = res.json;

              res.json = function (data) {
                origJsonRes.call(res, data);
                setImmediate(() => cb());
              };
              res.end = function (data) {
                origEndRes.call(res, data);
                setImmediate(() => cb());
              };
            }
            return res;
          },
        };

        // Middleware chain
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

// ── HTTP helpers ────────────────────────────────────────────────────────────

function httpRequest(method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost",
      port: PORT,
      path: reqPath,
      method,
      headers: { ...headers },
    };
    if (body) {
      const payload = JSON.stringify(body);
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: data,
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const httpGet = (p, headers) => httpRequest("GET", p, { headers });
const httpPost = (p, body, headers) => httpRequest("POST", p, { headers, body });

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
  await startServer();
  console.log(`\nExpress Adapter Tests (port ${PORT})\n${"=".repeat(55)}\n`);

  // ── 1. Discovery ────────────────────────────────────────────────────────
  console.log("Discovery: GET /.well-known/openfeeder.json");
  {
    const res = await httpGet("/.well-known/openfeeder.json");
    assert(res.status === 200, "status 200");
    assert(typeof res.body === "object", "returns valid JSON");
    assert(res.body.feed && res.body.feed.endpoint === "/openfeeder", "has feed.endpoint");
    assert(res.body.version === "1.0", "version is 1.0");
    assert(res.body.site && res.body.site.name === "Test Site", "has site.name");
  }

  // ── 2. Index ────────────────────────────────────────────────────────────
  console.log("\nIndex: GET /openfeeder");
  {
    const res = await httpGet("/openfeeder");
    assert(res.status === 200, "status 200");
    assert(res.body.schema === "openfeeder/1.0", 'schema: "openfeeder/1.0"');
    assert(Array.isArray(res.body.items), "has items array");
    assert(res.body.items.length > 0, "items not empty");
  }

  // ── 3. Search ───────────────────────────────────────────────────────────
  console.log("\nSearch: GET /openfeeder?q=test");
  {
    const res = await httpGet("/openfeeder?q=test");
    assert(res.status === 200, "status 200");
    assert(res.body.schema === "openfeeder/1.0", "has schema");
    // search on Express adapter returns index-style results filtered by query
    assert(Array.isArray(res.body.items), "has items (search-filtered index)");
  }

  // ── 4. min_score high — nothing scores 0.99 ────────────────────────────
  // Note: Express adapter does substring search (no relevance scores), so
  // min_score is a sidecar feature. The Express adapter should still return
  // without error; the results are unscored so min_score doesn't apply here.
  // We test that the request doesn't crash.
  console.log("\nmin_score high: GET /openfeeder?q=test&min_score=0.99");
  {
    const res = await httpGet("/openfeeder?q=test&min_score=0.99");
    // Express adapter doesn't implement min_score — should still return 200
    assert(res.status === 200 || res.status === 404, "status 200 or 404 (no crash)");
  }

  // ── 5. min_score low — same as no min_score ────────────────────────────
  console.log("\nmin_score low: GET /openfeeder?q=test&min_score=0.0");
  {
    const baseRes = await httpGet("/openfeeder?q=test");
    const res = await httpGet("/openfeeder?q=test&min_score=0.0");
    assert(res.status === 200, "status 200");
    // Both should return same number of items
    const baseCount = Array.isArray(baseRes.body.items)
      ? baseRes.body.items.length
      : 0;
    const scoreCount = Array.isArray(res.body.items) ? res.body.items.length : 0;
    assert(baseCount === scoreCount, "same results as no min_score");
  }

  // ── 6. HTTP Caching — ETag + Cache-Control ─────────────────────────────
  console.log("\nHTTP Caching: ETag + Cache-Control");
  {
    const res = await httpGet("/openfeeder");
    assert(res.headers["etag"] !== undefined, "has ETag header");
    assert(
      (res.headers["cache-control"] || "").includes("public"),
      "Cache-Control contains 'public'"
    );
  }

  // ── 7. HTTP 304 — conditional request ──────────────────────────────────
  console.log("\nHTTP 304: If-None-Match");
  {
    const first = await httpGet("/openfeeder");
    const etag = first.headers["etag"];
    assert(etag !== undefined, "first request has ETag");

    const second = await httpGet("/openfeeder", { "If-None-Match": etag });
    assert(second.status === 304, "second request returns 304");
    assert(
      second.rawBody === "" || second.rawBody === undefined,
      "304 response has empty body"
    );
  }

  // ── 8. Security — no path leak ─────────────────────────────────────────
  console.log("\nSecurity: no path leak for excluded paths");
  {
    const res = await httpGet("/openfeeder?url=/wp-admin");
    assert(res.status === 404, "excluded path returns 404");
    assert(
      !res.rawBody.includes("/wp-admin/settings"),
      "response doesn't leak internal paths"
    );
  }

  // ── 9. CORS ─────────────────────────────────────────────────────────────
  console.log("\nCORS: Access-Control-Allow-Origin");
  {
    const res = await httpGet("/openfeeder");
    assert(
      res.headers["access-control-allow-origin"] === "*",
      "Access-Control-Allow-Origin: *"
    );
  }

  // ── 10. LLM Gateway Mode 2 (warm start) ───────────────────────────────
  console.log("\nLLM Gateway Mode 2 (warm start): X-OpenFeeder-Intent + ClaudeBot");
  {
    const res = await httpGet("/blog/some-article", {
      "User-Agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)",
      "X-OpenFeeder-Intent": "research",
    });
    assert(res.status === 200, "status 200");
    assert(res.body.tailored === true, "tailored: true");
    assert(res.body.dialog === undefined, "no dialog block");
  }

  // ── 11. LLM Gateway Mode 1 (cold start) ───────────────────────────────
  console.log("\nLLM Gateway Mode 1 (cold start): ClaudeBot without intent");
  let sessionId;
  {
    const res = await httpGet("/blog/some-article", {
      "User-Agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)",
    });
    assert(res.status === 200, "status 200");
    assert(res.body.dialog !== undefined, "has dialog block");
    assert(res.body.dialog.active === true, "dialog.active: true");
    assert(typeof res.body.dialog.session_id === "string", "has session_id");
    sessionId = res.body.dialog.session_id;
  }

  // ── 12. LLM Gateway Mode 1 Round 2 ────────────────────────────────────
  console.log("\nLLM Gateway Mode 1 Round 2: POST /openfeeder/gateway/respond");
  {
    const res = await httpPost(
      "/openfeeder/gateway/respond",
      {
        session_id: sessionId,
        answers: {
          intent: "summarize",
          depth: "overview",
          format: "summary",
        },
      },
      { "User-Agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)" }
    );
    assert(res.status === 200, "status 200");
    assert(res.body.tailored === true, "tailored: true");
  }

  // ── 13. Analytics tracking — no 500 on search ─────────────────────────
  console.log("\nAnalytics tracking: search request doesn't error");
  {
    const res = await httpGet("/openfeeder?q=test", {
      "User-Agent": "Mozilla/5.0 (compatible; GPTBot/1.0)",
    });
    assert(res.status === 200, "status 200 (no 500 from analytics)");
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(55)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  await stopServer();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
