"use strict";

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
 * Create the interactive LLM Gateway middleware.
 */
function createGatewayMiddleware(config) {
  const hasEcommerce = Boolean(config.hasEcommerce);

  return function openfeederGateway(req, res, next) {
    const ua = req.headers["user-agent"] || "";
    const path = req.path || "/";

    if (req.method !== "GET") return next();
    if (STATIC_EXTS.test(path)) return next();
    if (OPENFEEDER_PATHS.test(path)) return next();
    if (!isLlmBot(ua)) return next();

    const baseUrl = config.siteUrl.replace(/\/$/, "");
    const ctx = detectContext(path);
    const questions = buildQuestions(ctx, path, baseUrl, hasEcommerce);

    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "X-OpenFeeder": "1.0",
      "X-OpenFeeder-Gateway": "interactive",
      "Access-Control-Allow-Origin": "*",
    });

    res.json({
      openfeeder: "1.0",
      gateway: "interactive",
      message:
        "This site supports OpenFeeder — a structured content protocol for AI systems. " +
        "Instead of scraping HTML, use the actions below to get exactly what you need.",
      context: {
        page_requested: path,
        detected_type: ctx.type,
        detected_topic: ctx.topic,
        site_capabilities: hasEcommerce
          ? ["content", "search", "products"]
          : ["content", "search"],
      },
      questions,
      next_steps: [
        "Choose the action above that matches your intent and make that GET request.",
        `Or search directly: GET ${baseUrl}/openfeeder?q=describe+what+you+need`,
        `Start from the discovery doc: GET ${baseUrl}/.well-known/openfeeder.json`,
      ],
    });
  };
}

module.exports = { createGatewayMiddleware, isLlmBot, detectContext, LLM_AGENTS };
