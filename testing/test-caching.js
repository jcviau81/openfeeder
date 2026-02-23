#!/usr/bin/env node
"use strict";

/**
 * HTTP Caching Tests — OpenFeeder Express Adapter
 *
 * Tests ETag, Cache-Control, Last-Modified, 304 Not Modified, and Vary headers
 * for both the content endpoint and the discovery document.
 *
 * Usage: node testing/test-caching.js
 */

const http = require("http");
const path = require("path");

const { openFeederMiddleware } = require(
  path.join(__dirname, "../adapters/express/src/index")
);

// ── Test data ───────────────────────────────────────────────────────────────

const SAMPLE_ITEMS = [
  {
    url: "/hello-world",
    title: "Hello World",
    content: "<p>Some content about the world of caching.</p>",
    published: "2025-01-15T10:00:00Z",
  },
  {
    url: "/second-post",
    title: "Second Post",
    content: "<p>Another piece of content for testing.</p>",
    published: "2025-01-20T12:00:00Z",
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
  return Promise.resolve(SAMPLE_ITEMS.find((i) => i.url === url) || null);
}

// ── Server ──────────────────────────────────────────────────────────────────

let PORT;
let server;

const middleware = openFeederMiddleware({
  siteName: "Cache Test",
  siteUrl: "http://localhost",
  language: "en",
  getItems,
  getItem,
});

function createServer() {
  return http.createServer((nodeReq, nodeRes) => {
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
          for (const [k, v] of Object.entries(obj)) {
            resHeaders[k.toLowerCase()] = String(v);
          }
          return res;
        },
        setHeader(k, v) { resHeaders[k.toLowerCase()] = String(v); return res; },
        getHeader(k) { return resHeaders[k.toLowerCase()]; },
        status(code) { statusCode = code; return res; },
        json(data) {
          for (const [k, v] of Object.entries(resHeaders)) nodeRes.setHeader(k, v);
          nodeRes.writeHead(statusCode, { "content-type": "application/json" });
          nodeRes.end(JSON.stringify(data));
        },
        end(data) {
          for (const [k, v] of Object.entries(resHeaders)) nodeRes.setHeader(k, v);
          nodeRes.writeHead(statusCode);
          nodeRes.end(data || "");
        },
        on(event, cb) {
          if (event === "finish") {
            const origJson = res.json;
            const origEnd = res.end;
            res.json = function (d) { origJson.call(res, d); setImmediate(cb); };
            res.end = function (d) { origEnd.call(res, d); setImmediate(cb); };
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
}

function startServer() {
  return new Promise((resolve) => {
    server = createServer();
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

function httpGet(reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "localhost", port: PORT, path: reqPath, method: "GET", headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBody: data,
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
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
  await startServer();
  console.log(`\nHTTP Caching Tests (port ${PORT})\n${"=".repeat(55)}\n`);

  // ── 1. /openfeeder has ETag ────────────────────────────────────────────
  console.log("Content endpoint: cache headers");
  let contentEtag;
  {
    const res = await httpGet("/openfeeder");
    assert(res.status === 200, "status 200");

    contentEtag = res.headers["etag"];
    assert(contentEtag !== undefined, "has ETag header");

    const cc = res.headers["cache-control"] || "";
    assert(cc.includes("max-age"), "Cache-Control has max-age");
    assert(cc.includes("public"), "Cache-Control has public");

    assert(res.headers["last-modified"] !== undefined, "has Last-Modified header");
  }

  // ── 2. 304 with matching ETag ──────────────────────────────────────────
  console.log("\nContent endpoint: 304 with matching ETag");
  {
    const res = await httpGet("/openfeeder", { "If-None-Match": contentEtag });
    assert(res.status === 304, "returns 304 Not Modified");
    assert(res.rawBody === "" || res.rawBody.length === 0, "304 body is empty");
  }

  // ── 3. 200 with wrong ETag ─────────────────────────────────────────────
  console.log("\nContent endpoint: 200 with wrong ETag");
  {
    const res = await httpGet("/openfeeder", { "If-None-Match": '"wrong-etag-value"' });
    assert(res.status === 200, "returns 200 with wrong ETag");
    assert(typeof res.body === "object" && res.body.schema, "full body returned");

    const newEtag = res.headers["etag"];
    assert(newEtag !== undefined, "response has new ETag");
  }

  // ── 4. 200 with If-Modified-Since in the past ─────────────────────────
  console.log("\nContent endpoint: If-Modified-Since (past date)");
  {
    // Note: Express adapter doesn't handle If-Modified-Since natively (only ETag),
    // so this should return 200 with full body.
    const pastDate = new Date("2020-01-01T00:00:00Z").toUTCString();
    const res = await httpGet("/openfeeder", { "If-Modified-Since": pastDate });
    assert(res.status === 200, "returns 200 (content changed since ancient date)");
  }

  // ── 5. Discovery endpoint has ETag + Cache-Control ─────────────────────
  console.log("\nDiscovery endpoint: cache headers");
  let discoveryEtag;
  {
    const res = await httpGet("/.well-known/openfeeder.json");
    assert(res.status === 200, "status 200");

    discoveryEtag = res.headers["etag"];
    assert(discoveryEtag !== undefined, "has ETag header");

    const cc = res.headers["cache-control"] || "";
    assert(cc.includes("public"), "Cache-Control has public");
    assert(cc.includes("max-age"), "Cache-Control has max-age");
  }

  // ── 6. Discovery 304 ──────────────────────────────────────────────────
  console.log("\nDiscovery endpoint: 304 with matching ETag");
  {
    const res = await httpGet("/.well-known/openfeeder.json", {
      "If-None-Match": discoveryEtag,
    });
    assert(res.status === 304, "returns 304 Not Modified");
  }

  // ── 7. Vary header ────────────────────────────────────────────────────
  console.log("\nVary header:");
  {
    const res = await httpGet("/openfeeder");
    const vary = res.headers["vary"] || "";
    assert(vary.includes("Accept-Encoding"), "Vary includes Accept-Encoding");
  }

  // ── 8. Single page endpoint caching ───────────────────────────────────
  console.log("\nSingle page endpoint: cache headers");
  {
    const res = await httpGet("/openfeeder?url=/hello-world");
    assert(res.status === 200, "status 200");
    assert(res.headers["etag"] !== undefined, "has ETag");
    assert((res.headers["cache-control"] || "").includes("public"), "has Cache-Control");

    // 304 on same etag
    const etag = res.headers["etag"];
    const res2 = await httpGet("/openfeeder?url=/hello-world", {
      "If-None-Match": etag,
    });
    assert(res2.status === 304, "single page 304 on matching ETag");
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
