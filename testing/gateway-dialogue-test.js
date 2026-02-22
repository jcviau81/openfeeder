#!/usr/bin/env node
"use strict";

/**
 * Gateway Dialogue Test — verifies the 3 interaction modes
 *
 * Uses Node's built-in http module to spawn a minimal Express-like test server
 * that exercises the gateway middleware directly.
 *
 * No external dependencies required.
 */

const http = require("http");
const path = require("path");

// Load the gateway module directly
const {
  GatewayHandler,
  isLlmBot,
  detectContext,
} = require(path.join(__dirname, "../adapters/express/src/gateway"));

const BOT_UA = "Mozilla/5.0 (compatible; GPTBot/1.0)";
const HUMAN_UA = "Mozilla/5.0 (X11; Linux x86_64) Chrome/120";
const BASE_URL = "http://localhost";

let PORT;
let server;
let handler;

// ── Minimal Express-like req/res adapters ────────────────────────────────────

function createMockRes(nodeRes) {
  const headers = {};
  const res = {
    _status: 200,
    set(obj) {
      Object.assign(headers, obj);
      return res;
    },
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      for (const [k, v] of Object.entries(headers)) {
        nodeRes.setHeader(k, v);
      }
      nodeRes.writeHead(res._status, { "Content-Type": "application/json" });
      nodeRes.end(JSON.stringify(data));
    },
  };
  return res;
}

function parseQuery(url) {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params = {};
  const qs = url.slice(idx + 1);
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    params[decodeURIComponent(k)] = decodeURIComponent(v || "");
  }
  return params;
}

// ── Test server ──────────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve) => {
    handler = new GatewayHandler({
      siteName: "Test Site",
      siteUrl: "", // will be set per-request
      hasEcommerce: false,
      llmGateway: true,
      getItems: async () => ({ items: [], total: 0 }),
      getItem: async () => null,
    });

    server = http.createServer((nodeReq, nodeRes) => {
      let body = "";
      nodeReq.on("data", (chunk) => (body += chunk));
      nodeReq.on("end", () => {
        const urlObj = new URL(nodeReq.url, `http://localhost`);
        const pathname = urlObj.pathname;
        const query = parseQuery(nodeReq.url);

        // Update base URL with actual port
        handler.baseUrl = `${BASE_URL}:${PORT}`;

        const req = {
          method: nodeReq.method,
          path: pathname,
          headers: nodeReq.headers,
          query,
          body: body ? JSON.parse(body) : {},
        };

        const res = createMockRes(nodeRes);

        // Route: POST /openfeeder/gateway/respond
        if (pathname === "/openfeeder/gateway/respond" && nodeReq.method === "POST") {
          return handler.handleDialogueRespond(req, res);
        }

        // Gateway middleware
        handler.handleRequest(req, res, () => {
          // Not intercepted — return 404
          nodeRes.writeHead(404, { "Content-Type": "application/json" });
          nodeRes.end(JSON.stringify({ error: "not intercepted" }));
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

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost",
      port: PORT,
      path,
      method: "GET",
      headers: { "User-Agent": BOT_UA, ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function httpPost(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: "localhost",
      port: PORT,
      path,
      method: "POST",
      headers: {
        "User-Agent": BOT_UA,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Test runner ──────────────────────────────────────────────────────────────

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
  console.log(`\nGateway Dialogue Tests (port ${PORT})\n${"=".repeat(50)}\n`);

  // ── Test 1: Mode 2 — Direct via X-OpenFeeder-Intent header ─────────────
  console.log("Mode 2 — Direct (X-OpenFeeder-Intent header):");
  {
    const res = await httpGet("/blog/climate-change", {
      "X-OpenFeeder-Intent": "answer-question",
      "X-OpenFeeder-Query": "effects of climate change",
      "X-OpenFeeder-Depth": "deep",
      "X-OpenFeeder-Format": "key-facts",
    });
    assert(res.status === 200, "status 200");
    assert(res.body.tailored === true, "tailored: true");
    assert(res.body.intent === "answer-question", "intent matches");
    assert(res.body.depth === "deep", "depth matches");
    assert(res.body.format === "key-facts", "format matches");
    assert(Array.isArray(res.body.recommended_endpoints), "has recommended_endpoints");
    assert(res.body.recommended_endpoints.length >= 1, "at least 1 endpoint");
    assert(res.body.endpoints !== undefined, "has endpoints block (backwards compat)");
    assert(res.body.dialog === undefined, "no dialog block");
    assert(res.body.current_page !== undefined, "has current_page");
    assert(Array.isArray(res.body.query_hints), "has query_hints");
  }

  console.log("\nMode 2 — Direct (_of_intent query param):");
  {
    const res = await httpGet(
      "/product/blue-jacket?_of_intent=broad-research&_of_depth=overview&_of_format=summary"
    );
    assert(res.status === 200, "status 200");
    assert(res.body.tailored === true, "tailored: true");
    assert(res.body.intent === "broad-research", "intent from query param");
    assert(res.body.depth === "overview", "depth from query param");
    assert(res.body.format === "summary", "format from query param");
    assert(res.body.endpoints !== undefined, "has endpoints block (backwards compat)");
    assert(res.body.dialog === undefined, "no dialog block");
  }

  // ── Test 2: Mode 1 Round 1 — Cold start (no headers) ──────────────────
  console.log("\nMode 1 Round 1 — Cold start (no intent headers):");
  let sessionId;
  {
    const res = await httpGet("/blog/climate-change");
    assert(res.status === 200, "status 200");
    assert(res.body.openfeeder === "1.0", "openfeeder version");
    assert(res.body.gateway === "interactive", "gateway: interactive");
    assert(res.body.dialog !== undefined, "has dialog block");
    assert(res.body.dialog.active === true, "dialog.active: true");
    assert(typeof res.body.dialog.session_id === "string", "has session_id");
    assert(res.body.dialog.session_id.startsWith("gw_"), "session_id starts with gw_");
    assert(res.body.dialog.expires_in === 300, "expires_in: 300");
    assert(Array.isArray(res.body.dialog.questions), "dialog has questions array");
    assert(res.body.dialog.questions.length === 4, "4 dialog questions");
    assert(res.body.dialog.reply_to === "POST /openfeeder/gateway/respond", "reply_to correct");
    assert(Array.isArray(res.body.questions), "has legacy questions array");
    assert(res.body.questions.length > 0, "legacy questions non-empty");
    assert(res.body.endpoints !== undefined, "has endpoints block (backwards compat)");
    assert(res.body.context !== undefined, "has context block");
    assert(res.body.context.detected_type === "article", "detected_type: article");
    sessionId = res.body.dialog.session_id;
  }

  // ── Test 3: Mode 1 Round 2 — Respond with session_id + answers ────────
  console.log("\nMode 1 Round 2 — Dialogue respond:");
  {
    const res = await httpPost("/openfeeder/gateway/respond", {
      session_id: sessionId,
      answers: {
        intent: "fact-check",
        depth: "deep",
        format: "qa",
        query: "Is climate change caused by humans?",
      },
    });
    assert(res.status === 200, "status 200");
    assert(res.body.tailored === true, "tailored: true");
    assert(res.body.intent === "fact-check", "intent from answers");
    assert(res.body.depth === "deep", "depth from answers");
    assert(res.body.format === "qa", "format from answers");
    assert(Array.isArray(res.body.recommended_endpoints), "has recommended_endpoints");
    assert(res.body.endpoints !== undefined, "has endpoints block (backwards compat)");
    assert(res.body.current_page !== undefined, "has current_page");
  }

  // ── Test 4: Reuse of same session_id should fail ───────────────────────
  console.log("\nSession reuse — should fail:");
  {
    const res = await httpPost("/openfeeder/gateway/respond", {
      session_id: sessionId,
      answers: { intent: "summarize" },
    });
    assert(res.status === 400, "status 400");
    assert(res.body.error !== undefined, "has error block");
    assert(res.body.error.code === "SESSION_EXPIRED", "SESSION_EXPIRED error code");
  }

  // ── Test 5: Invalid session_id ─────────────────────────────────────────
  console.log("\nInvalid session_id:");
  {
    const res = await httpPost("/openfeeder/gateway/respond", {
      session_id: "gw_doesnotexist1234",
      answers: { intent: "summarize" },
    });
    assert(res.status === 400, "status 400");
    assert(res.body.error !== undefined, "has error block");
  }

  // ── Test 6: Missing session_id ─────────────────────────────────────────
  console.log("\nMissing session_id:");
  {
    const res = await httpPost("/openfeeder/gateway/respond", {
      answers: { intent: "summarize" },
    });
    assert(res.status === 400, "status 400");
    assert(res.body.error.code === "INVALID_SESSION", "INVALID_SESSION error code");
  }

  // ── Test 7: Human user-agent not intercepted ───────────────────────────
  console.log("\nHuman UA — not intercepted:");
  {
    const res = await httpGet("/blog/test", { "User-Agent": HUMAN_UA });
    assert(res.status === 404, "status 404 (not intercepted)");
  }

  // ── Test 8: Home page context detection ────────────────────────────────
  console.log("\nHome page cold start:");
  {
    const res = await httpGet("/");
    assert(res.status === 200, "status 200");
    assert(res.body.context.detected_type === "home", "detected_type: home");
    assert(res.body.dialog !== undefined, "has dialog block");
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  await stopServer();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
