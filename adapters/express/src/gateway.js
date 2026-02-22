"use strict";

const { GatewaySessionStore } = require("./gateway-session");

// Known LLM crawler user-agent patterns
const LLM_AGENTS = [
  "GPTBot", "ChatGPT-User", "ClaudeBot", "anthropic-ai",
  "PerplexityBot", "Google-Extended", "cohere-ai", "CCBot",
  "FacebookBot", "Amazonbot", "YouBot", "Bytespider",
];

const STATIC_EXTS = /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|map|json)$/i;
const OPENFEEDER_PATHS = /^\/(openfeeder|\.well-known\/openfeeder)/;

/**
 * Detect if a User-Agent belongs to an LLM crawler.
 */
function isLlmBot(ua) {
  if (!ua) return false;
  return LLM_AGENTS.some((p) => ua.includes(p));
}

/**
 * Parse the URL path to guess content type and topic.
 *
 * Returns { type, topic, segments }
 */
function detectContext(path) {
  const clean = path.replace(/\/$/, "") || "/";
  const segments = clean.split("/").filter(Boolean);

  // Home
  if (segments.length === 0) {
    return { type: "home", topic: null, segments };
  }

  // Common product indicators
  if (/^(product|products|shop|store|item|catalogue|catalog)$/i.test(segments[0])) {
    const topic = segments[1]
      ? segments[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    return { type: "product", topic, segments };
  }

  // Common category indicators
  if (/^(category|cat|collection|collections|tag|brand|department)$/i.test(segments[0])) {
    const topic = segments[1]
      ? segments[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : segments[0];
    return { type: "category", topic, segments };
  }

  // Search
  if (/^search$/i.test(segments[0])) {
    return { type: "search", topic: null, segments };
  }

  // Blog / article indicators
  if (/^(blog|post|posts|article|articles|news|press)$/i.test(segments[0])) {
    const topic = segments[1]
      ? segments[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : null;
    return { type: "article", topic, segments };
  }

  // Single-level slug → likely an article or product
  if (segments.length === 1) {
    return { type: "page", topic: segments[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), segments };
  }

  return { type: "page", topic: segments[segments.length - 1].replace(/[-_]/g, " "), segments };
}

/**
 * Generate context-aware questions for an LLM based on the page type.
 */
function buildQuestions(ctx, path, baseUrl, hasEcommerce) {
  const questions = [];
  const encodedPath = encodeURIComponent(path);

  switch (ctx.type) {
    case "product":
      questions.push({
        question: ctx.topic
          ? `Do you want the full details of "${ctx.topic}"?`
          : "Do you want the full details of this product?",
        intent: "single_product",
        action: `GET ${baseUrl}/openfeeder/products?url=${encodedPath}`,
        returns: "Full description, price, variants, availability, stock status",
      });
      if (ctx.segments[1]) {
        const cat = ctx.segments[1].replace(/[-_]/g, "+");
        questions.push({
          question: "Are you comparing this with similar products?",
          intent: "category_browse",
          action: `GET ${baseUrl}/openfeeder/products?category=${cat}`,
          returns: `All products in the same category with pricing and availability`,
        });
      }
      questions.push({
        question: "Are you looking for products in a specific price range?",
        intent: "price_filter",
        action: `GET ${baseUrl}/openfeeder/products?in_stock=true`,
        returns: "All in-stock products (add &min_price=X&max_price=Y to filter by budget)",
      });
      questions.push({
        question: "Are you searching for a product by feature or keyword?",
        intent: "keyword_search",
        action: `GET ${baseUrl}/openfeeder/products?q=your+keywords`,
        returns: "Products matching your search terms",
      });
      break;

    case "category":
      questions.push({
        question: ctx.topic
          ? `Do you want all products in the "${ctx.topic}" category?`
          : "Do you want to browse products in this category?",
        intent: "category_browse",
        action: hasEcommerce
          ? `GET ${baseUrl}/openfeeder/products?category=${ctx.segments[1] || ""}`
          : `GET ${baseUrl}/openfeeder?q=${(ctx.topic || "").replace(/ /g, "+")}`,
        returns: "Paginated product list with pricing and availability",
      });
      questions.push({
        question: "Are you looking for in-stock items only?",
        intent: "availability_filter",
        action: hasEcommerce
          ? `GET ${baseUrl}/openfeeder/products?category=${ctx.segments[1] || ""}&in_stock=true`
          : `GET ${baseUrl}/openfeeder?q=${(ctx.topic || "").replace(/ /g, "+")}`,
        returns: "Only available products in this category",
      });
      questions.push({
        question: "Are you looking for items on sale?",
        intent: "sale_filter",
        action: hasEcommerce
          ? `GET ${baseUrl}/openfeeder/products?on_sale=true`
          : `GET ${baseUrl}/openfeeder?q=sale`,
        returns: "Discounted products currently on sale",
      });
      break;

    case "article":
    case "page":
      questions.push({
        question: ctx.topic
          ? `Do you want the full content of "${ctx.topic}"?`
          : "Do you want the full content of this page?",
        intent: "single_page",
        action: `GET ${baseUrl}/openfeeder?url=${encodedPath}`,
        returns: "Full article text split into semantic chunks, ready for LLM processing",
      });
      if (ctx.topic) {
        questions.push({
          question: `Are you looking for more content related to "${ctx.topic}"?`,
          intent: "topic_search",
          action: `GET ${baseUrl}/openfeeder?q=${ctx.topic.replace(/ /g, "+")}`,
          returns: "All content related to this topic, ranked by relevance",
        });
      }
      questions.push({
        question: "Do you want to browse all available content?",
        intent: "index_browse",
        action: `GET ${baseUrl}/openfeeder`,
        returns: "Paginated index of all articles with summaries",
      });
      break;

    case "home":
      questions.push({
        question: "Do you want to browse all available content?",
        intent: "index_browse",
        action: `GET ${baseUrl}/openfeeder`,
        returns: "Paginated index of all content with summaries",
      });
      questions.push({
        question: "Are you searching for something specific?",
        intent: "search",
        action: `GET ${baseUrl}/openfeeder?q=your+search+query`,
        returns: "Content matching your search query",
      });
      if (hasEcommerce) {
        questions.push({
          question: "Are you looking for products?",
          intent: "products_browse",
          action: `GET ${baseUrl}/openfeeder/products`,
          returns: "Full product catalog with pricing and availability",
        });
      }
      break;

    default:
      questions.push({
        question: "Do you want the content of this page?",
        intent: "single_page",
        action: `GET ${baseUrl}/openfeeder?url=${encodedPath}`,
        returns: "Page content in structured chunks",
      });
      questions.push({
        question: "Are you looking for something specific on this site?",
        intent: "search",
        action: `GET ${baseUrl}/openfeeder?q=your+search+query`,
        returns: "Relevant content matching your query",
      });
  }

  return questions;
}

/**
 * Extract intent data from X-OpenFeeder-* headers or _of_* query params.
 * Returns null if no intent indicators are present.
 */
function extractIntentData(req) {
  const intent = req.headers["x-openfeeder-intent"] || req.query._of_intent;
  if (!intent) return null;

  return {
    intent,
    depth: req.headers["x-openfeeder-depth"] || req.query._of_depth || "standard",
    format: req.headers["x-openfeeder-format"] || req.query._of_format || "full-text",
    query: req.headers["x-openfeeder-query"] || req.query._of_query || "",
    language: req.headers["x-openfeeder-language"] || req.query._of_language || "en",
  };
}

/**
 * Build a tailored response for Mode 2 (direct) or Mode 1 Round 2 (dialogue respond).
 */
function buildTailoredResponse(intentData, context, baseUrl) {
  const { intent, depth, format, query } = intentData;
  const endpoints = [];

  // Build recommended endpoints based on intent + context
  if (query) {
    endpoints.push({
      url: `${baseUrl}/openfeeder?q=${encodeURIComponent(query)}&format=${format}`,
      relevance: "high",
      description: "Content filtered to match your specific question",
    });
  }

  if (context.detected_type === "product" || context.detected_type === "category") {
    endpoints.push({
      url: `${baseUrl}/openfeeder/products?url=${encodeURIComponent(context.page_requested)}`,
      relevance: query ? "medium" : "high",
      description: "Product details for the requested page",
    });
  } else {
    endpoints.push({
      url: `${baseUrl}/openfeeder?url=${encodeURIComponent(context.page_requested)}`,
      relevance: query ? "medium" : "high",
      description: "Full content of the requested page",
    });
  }

  if (!query) {
    endpoints.push({
      url: `${baseUrl}/openfeeder`,
      relevance: "low",
      description: "Browse all available content",
    });
  }

  const queryHints = [];
  if (query) {
    queryHints.push(`GET /openfeeder?q=${encodeURIComponent(query)}`);
    queryHints.push(`GET /openfeeder?q=${encodeURIComponent(query)}&format=${format}&depth=${depth}`);
  } else {
    queryHints.push(`GET /openfeeder?url=${encodeURIComponent(context.page_requested)}`);
  }

  return {
    openfeeder: "1.0",
    tailored: true,
    intent,
    depth,
    format,
    recommended_endpoints: endpoints,
    query_hints: queryHints,
    current_page: {
      openfeeder_url: `${baseUrl}/openfeeder?url=${encodeURIComponent(context.page_requested)}`,
      title: context.detected_topic || null,
      summary: context.detected_type ? `${context.detected_type} page` : null,
    },
    endpoints: {
      content: `${baseUrl}/openfeeder`,
      discovery: `${baseUrl}/.well-known/openfeeder.json`,
    },
  };
}

/**
 * Standard gateway response headers.
 */
function setGatewayHeaders(res) {
  res.set({
    "Content-Type": "application/json; charset=utf-8",
    "X-OpenFeeder": "1.0",
    "X-OpenFeeder-Gateway": "interactive",
    "Access-Control-Allow-Origin": "*",
  });
}

/**
 * GatewayHandler encapsulates the 3-mode gateway logic with session support.
 */
class GatewayHandler {
  constructor(config) {
    this.config = config;
    this.hasEcommerce = Boolean(config.hasEcommerce);
    this.baseUrl = config.siteUrl.replace(/\/$/, "");
    this.sessions = new GatewaySessionStore();
  }

  /**
   * Main gateway middleware — handles Mode 1 Round 1 (cold start) and Mode 2 (direct).
   */
  handleRequest(req, res, next) {
    const ua = req.headers["user-agent"] || "";
    const path = req.path || "/";

    if (req.method !== "GET") return next();
    if (STATIC_EXTS.test(path)) return next();
    if (OPENFEEDER_PATHS.test(path)) return next();
    if (!isLlmBot(ua)) return next();

    const ctx = detectContext(path);
    const context = {
      page_requested: path,
      detected_type: ctx.type,
      detected_topic: ctx.topic,
      site_capabilities: this.hasEcommerce
        ? ["content", "search", "products"]
        : ["content", "search"],
    };

    // Mode 2 — Direct (Warm Start): intent headers or _of_* query params present
    const intentData = extractIntentData(req);
    if (intentData) {
      setGatewayHeaders(res);
      return res.json(buildTailoredResponse(intentData, context, this.baseUrl));
    }

    // Mode 1 Round 1 — Cold Start: no intent → return dialogue + session
    const questions = buildQuestions(ctx, path, this.baseUrl, this.hasEcommerce);
    const sessionId = this.sessions.create({
      url: path,
      detected_type: ctx.type,
      detected_topic: ctx.topic,
      created_at: Date.now(),
    });

    setGatewayHeaders(res);
    res.json({
      openfeeder: "1.0",
      gateway: "interactive",
      message:
        "This site supports OpenFeeder — a structured content protocol for AI systems. " +
        "Instead of scraping HTML, use the actions below to get exactly what you need.",
      dialog: {
        active: true,
        session_id: sessionId,
        expires_in: 300,
        message: "To give you the most relevant content, a few quick questions:",
        questions: [
          {
            id: "intent",
            question: "What is your primary goal?",
            type: "choice",
            options: ["answer-question", "broad-research", "fact-check", "summarize", "find-sources"],
          },
          {
            id: "depth",
            question: "How much detail do you need?",
            type: "choice",
            options: ["overview", "standard", "deep"],
          },
          {
            id: "format",
            question: "Preferred output format?",
            type: "choice",
            options: ["full-text", "key-facts", "summary", "qa"],
          },
          {
            id: "query",
            question: "What specifically are you looking for? (optional — leave blank to browse)",
            type: "text",
          },
        ],
        reply_to: "POST /openfeeder/gateway/respond",
      },
      context,
      questions,
      endpoints: {
        content: `${this.baseUrl}/openfeeder`,
        discovery: `${this.baseUrl}/.well-known/openfeeder.json`,
      },
      next_steps: [
        "Answer the dialog questions via POST /openfeeder/gateway/respond for a tailored response.",
        "Or choose an action from the questions above and make that GET request.",
        `Or search directly: GET ${this.baseUrl}/openfeeder?q=describe+what+you+need`,
        `Start from the discovery doc: GET ${this.baseUrl}/.well-known/openfeeder.json`,
      ],
    });
  }

  /**
   * Mode 1 Round 2 — Handle POST /openfeeder/gateway/respond
   */
  handleDialogueRespond(req, res) {
    const body = req.body || {};
    const { session_id, answers } = body;

    if (!session_id || typeof session_id !== "string") {
      setGatewayHeaders(res);
      return res.status(400).json({
        openfeeder: "1.0",
        error: { code: "INVALID_SESSION", message: "Missing or invalid session_id." },
      });
    }

    const sessionData = this.sessions.get(session_id);
    if (!sessionData) {
      setGatewayHeaders(res);
      return res.status(400).json({
        openfeeder: "1.0",
        error: { code: "SESSION_EXPIRED", message: "Session not found or expired." },
      });
    }

    const intentData = {
      intent: (answers && answers.intent) || "answer-question",
      depth: (answers && answers.depth) || "standard",
      format: (answers && answers.format) || "full-text",
      query: (answers && answers.query) || "",
      language: (answers && answers.language) || "en",
    };

    const context = {
      page_requested: sessionData.url,
      detected_type: sessionData.detected_type,
      detected_topic: sessionData.detected_topic,
      site_capabilities: this.hasEcommerce
        ? ["content", "search", "products"]
        : ["content", "search"],
    };

    this.sessions.delete(session_id);

    setGatewayHeaders(res);
    res.json(buildTailoredResponse(intentData, context, this.baseUrl));
  }
}

/**
 * Create the interactive LLM Gateway middleware (backwards-compatible factory).
 */
function createGatewayMiddleware(config) {
  const handler = new GatewayHandler(config);
  const middleware = function openfeederGateway(req, res, next) {
    return handler.handleRequest(req, res, next);
  };
  middleware._handler = handler;
  return middleware;
}

module.exports = { createGatewayMiddleware, GatewayHandler, isLlmBot, detectContext, LLM_AGENTS };
