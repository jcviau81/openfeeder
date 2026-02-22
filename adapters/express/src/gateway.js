"use strict";

// Known LLM crawler user-agent patterns
const LLM_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "cohere-ai",
  "CCBot",
  "FacebookBot",
  "Amazonbot",
  "YouBot",
  "Bytespider",
  "PetalBot",
  "SemrushBot-AI",
];

// Static asset extensions to skip
const STATIC_EXTS = /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|map|json)$/i;

// OpenFeeder own endpoints to skip
const OPENFEEDER_PATHS = /^\/(openfeeder|\.well-known\/openfeeder)/;

/**
 * Detect if a User-Agent belongs to an LLM crawler.
 * @param {string} ua
 * @returns {boolean}
 */
function isLlmBot(ua) {
  if (!ua) return false;
  return LLM_AGENTS.some((pattern) => ua.includes(pattern));
}

/**
 * Create the LLM Gateway middleware.
 *
 * @param {object} config
 * @param {string} config.siteUrl
 * @param {string} [config.llmGatewayMessage]
 * @returns {import('express').RequestHandler}
 */
function createGatewayMiddleware(config) {
  const message =
    config.llmGatewayMessage ||
    "This site supports OpenFeeder — a structured content protocol for AI systems. Use the endpoints below instead of scraping HTML.";

  return function openfeederGateway(req, res, next) {
    const ua = req.headers["user-agent"] || "";
    const path = req.path || "/";

    // Skip non-GET requests, static assets, and OpenFeeder endpoints
    if (req.method !== "GET") return next();
    if (STATIC_EXTS.test(path)) return next();
    if (OPENFEEDER_PATHS.test(path)) return next();

    if (!isLlmBot(ua)) return next();

    // Build the gateway response
    const baseUrl = config.siteUrl.replace(/\/$/, "");
    const pageUrl = path + (req.query && Object.keys(req.query).length ? "?" + new URLSearchParams(req.query).toString() : "");

    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "X-OpenFeeder": "1.0",
      "X-OpenFeeder-Gateway": "active",
      "Access-Control-Allow-Origin": "*",
    });

    res.json({
      openfeeder: "1.0",
      message,
      endpoints: {
        discovery: `${baseUrl}/.well-known/openfeeder.json`,
        content: `${baseUrl}/openfeeder`,
      },
      usage: {
        index: `${baseUrl}/openfeeder`,
        search: `${baseUrl}/openfeeder?q=your+search+query`,
        single_page: `${baseUrl}/openfeeder?url=${encodeURIComponent(path)}`,
        paginate: `${baseUrl}/openfeeder?page=2&limit=10`,
      },
      current_page: {
        url: pageUrl,
        openfeeder_url: `${baseUrl}/openfeeder?url=${encodeURIComponent(path)}`,
      },
      hint: "What are you looking for? Append ?q=your+query to /openfeeder to get relevant content chunks directly.",
    });
  };
}

module.exports = { createGatewayMiddleware, isLlmBot, LLM_AGENTS };
