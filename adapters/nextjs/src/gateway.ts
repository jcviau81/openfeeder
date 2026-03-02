/**
 * OpenFeeder Next.js Adapter — Interactive LLM Gateway
 *
 * Detects AI crawler user-agents and returns structured, context-aware JSON
 * with targeted questions and pre-built query actions. Supports 3 modes:
 *   Mode 1 (Cold Start)  — dialogue with session
 *   Mode 2 (Warm Start)  — direct response via X-OpenFeeder-* headers
 *   Mode 3 (Bypass)      — legacy bots use endpoints directly
 */

import { NextRequest, NextResponse } from "next/server";
import { GatewaySessionStore } from "./gateway-session.js";

// Known LLM crawler user-agent patterns
export const LLM_AGENTS = [
  "GPTBot", "ChatGPT-User", "ClaudeBot", "anthropic-ai",
  "PerplexityBot", "Google-Extended", "cohere-ai", "CCBot",
  "FacebookBot", "Amazonbot", "YouBot", "Bytespider",
];

const STATIC_EXTS = /\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|map|json)$/i;
const OPENFEEDER_PATHS = /^\/(openfeeder|\.well-known\/openfeeder)/;

const GATEWAY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "X-OpenFeeder": "1.0",
  "X-OpenFeeder-Gateway": "interactive",
  "Access-Control-Allow-Origin": "*",
};

export function isLlmBot(ua: string): boolean {
  if (!ua) return false;
  return LLM_AGENTS.some((p) => ua.includes(p));
}

function titleCase(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface PageContext {
  type: string;
  topic: string | null;
  segments: string[];
}

export function detectContext(path: string): PageContext {
  const clean = path.replace(/\/$/, "") || "/";
  const segments = clean.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { type: "home", topic: null, segments };
  }

  const first = segments[0].toLowerCase();

  if (/^(product|products|shop|store|item|catalogue|catalog)$/.test(first)) {
    const topic = segments[1] ? titleCase(segments[1]) : null;
    return { type: "product", topic, segments };
  }
  if (/^(category|cat|collection|collections|tag|brand|department)$/.test(first)) {
    const topic = segments[1] ? titleCase(segments[1]) : segments[0];
    return { type: "category", topic, segments };
  }
  if (/^search$/.test(first)) {
    return { type: "search", topic: null, segments };
  }
  if (/^(blog|post|posts|article|articles|news|press)$/.test(first)) {
    const topic = segments[1] ? titleCase(segments[1]) : null;
    return { type: "article", topic, segments };
  }
  if (segments.length === 1) {
    return { type: "page", topic: titleCase(segments[0]), segments };
  }
  return { type: "page", topic: segments[segments.length - 1].replace(/[-_]/g, " "), segments };
}

interface Question {
  question: string;
  intent: string;
  action: string;
  returns: string;
}

function buildQuestions(ctx: PageContext, path: string, baseUrl: string, hasEcommerce: boolean): Question[] {
  const questions: Question[] = [];
  const encodedPath = encodeURIComponent(path);

  switch (ctx.type) {
    case "product":
      questions.push({
        question: ctx.topic ? `Do you want the full details of "${ctx.topic}"?` : "Do you want the full details of this product?",
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
          returns: "All products in the same category with pricing and availability",
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

    case "category": {
      const catSlug = ctx.segments[1] || "";
      if (hasEcommerce) {
        questions.push({
          question: ctx.topic ? `Do you want all products in the "${ctx.topic}" category?` : "Do you want to browse products in this category?",
          intent: "category_browse",
          action: `GET ${baseUrl}/openfeeder/products?category=${catSlug}`,
          returns: "Paginated product list with pricing and availability",
        });
        questions.push({
          question: "Are you looking for in-stock items only?",
          intent: "availability_filter",
          action: `GET ${baseUrl}/openfeeder/products?category=${catSlug}&in_stock=true`,
          returns: "Only available products in this category",
        });
        questions.push({
          question: "Are you looking for items on sale?",
          intent: "sale_filter",
          action: `GET ${baseUrl}/openfeeder/products?on_sale=true`,
          returns: "Discounted products currently on sale",
        });
      } else {
        const topicQ = (ctx.topic || "").replace(/ /g, "+");
        questions.push({
          question: ctx.topic ? `Do you want all products in the "${ctx.topic}" category?` : "Do you want to browse products in this category?",
          intent: "category_browse",
          action: `GET ${baseUrl}/openfeeder?q=${topicQ}`,
          returns: "Paginated product list with pricing and availability",
        });
        questions.push({
          question: "Are you looking for in-stock items only?",
          intent: "availability_filter",
          action: `GET ${baseUrl}/openfeeder?q=${topicQ}`,
          returns: "Only available products in this category",
        });
        questions.push({
          question: "Are you looking for items on sale?",
          intent: "sale_filter",
          action: `GET ${baseUrl}/openfeeder?q=sale`,
          returns: "Discounted products currently on sale",
        });
      }
      break;
    }

    case "article":
    case "page":
      questions.push({
        question: ctx.topic ? `Do you want the full content of "${ctx.topic}"?` : "Do you want the full content of this page?",
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

interface IntentData {
  intent: string;
  depth: string;
  format: string;
  query: string;
  language: string;
}

function extractIntentData(request: NextRequest): IntentData | null {
  const url = new URL(request.url);
  const intent = request.headers.get("x-openfeeder-intent") || url.searchParams.get("_of_intent");
  if (!intent) return null;
  return {
    intent,
    depth: request.headers.get("x-openfeeder-depth") || url.searchParams.get("_of_depth") || "standard",
    format: request.headers.get("x-openfeeder-format") || url.searchParams.get("_of_format") || "full-text",
    query: request.headers.get("x-openfeeder-query") || url.searchParams.get("_of_query") || "",
    language: request.headers.get("x-openfeeder-language") || url.searchParams.get("_of_language") || "en",
  };
}

function buildTailoredResponse(intentData: IntentData, context: Record<string, unknown>, baseUrl: string): Record<string, unknown> {
  const { intent, depth, format: fmt, query } = intentData;
  const page = (context.page_requested as string) || "/";
  const detectedType = (context.detected_type as string) || "page";

  const endpoints: Array<Record<string, string>> = [];

  if (query) {
    endpoints.push({
      url: `${baseUrl}/openfeeder?q=${encodeURIComponent(query)}&format=${fmt}`,
      relevance: "high",
      description: "Content filtered to match your specific question",
    });
  }

  if (detectedType === "product" || detectedType === "category") {
    endpoints.push({
      url: `${baseUrl}/openfeeder/products?url=${encodeURIComponent(page)}`,
      relevance: query ? "medium" : "high",
      description: "Product details for the requested page",
    });
  } else {
    endpoints.push({
      url: `${baseUrl}/openfeeder?url=${encodeURIComponent(page)}`,
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

  const queryHints: string[] = [];
  if (query) {
    queryHints.push(`GET /openfeeder?q=${encodeURIComponent(query)}`);
    queryHints.push(`GET /openfeeder?q=${encodeURIComponent(query)}&format=${fmt}&depth=${depth}`);
  } else {
    queryHints.push(`GET /openfeeder?url=${encodeURIComponent(page)}`);
  }

  return {
    openfeeder: "1.0",
    tailored: true,
    intent,
    depth,
    format: fmt,
    recommended_endpoints: endpoints,
    query_hints: queryHints,
    current_page: {
      openfeeder_url: `${baseUrl}/openfeeder?url=${encodeURIComponent(page)}`,
      title: context.detected_topic || null,
      summary: detectedType ? `${detectedType} page` : null,
    },
    endpoints: {
      content: `${baseUrl}/openfeeder`,
      discovery: `${baseUrl}/.well-known/openfeeder.json`,
    },
  };
}

export interface GatewayConfig {
  siteUrl: string;
  hasEcommerce?: boolean;
}

export class GatewayHandler {
  private baseUrl: string;
  private hasEcommerce: boolean;
  private sessions: GatewaySessionStore;

  constructor(config: GatewayConfig) {
    this.baseUrl = config.siteUrl.replace(/\/$/, "");
    this.hasEcommerce = config.hasEcommerce ?? false;
    this.sessions = new GatewaySessionStore();
  }

  shouldIntercept(request: NextRequest): boolean {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method !== "GET") return false;
    if (STATIC_EXTS.test(path)) return false;
    if (OPENFEEDER_PATHS.test(path)) return false;
    const ua = request.headers.get("user-agent") || "";
    return isLlmBot(ua);
  }

  handleRequest(request: NextRequest): NextResponse {
    const url = new URL(request.url);
    const path = url.pathname;
    const ctx = detectContext(path);

    const context: Record<string, unknown> = {
      page_requested: path,
      detected_type: ctx.type,
      detected_topic: ctx.topic,
      site_capabilities: this.hasEcommerce ? ["content", "search", "products"] : ["content", "search"],
    };

    // Mode 2 — Direct (Warm Start)
    const intentData = extractIntentData(request);
    if (intentData) {
      return NextResponse.json(
        buildTailoredResponse(intentData, context, this.baseUrl),
        { headers: GATEWAY_HEADERS }
      );
    }

    // Mode 1 Round 1 — Cold Start
    const questions = buildQuestions(ctx, path, this.baseUrl, this.hasEcommerce);
    const sessionId = this.sessions.create({
      url: path,
      detected_type: ctx.type,
      detected_topic: ctx.topic,
      created_at: Date.now(),
    });

    return NextResponse.json({
      openfeeder: "1.0",
      gateway: "interactive",
      message: "This site supports OpenFeeder — a structured content protocol for AI systems. Instead of scraping HTML, use the actions below to get exactly what you need.",
      dialog: {
        active: true,
        session_id: sessionId,
        expires_in: 300,
        message: "To give you the most relevant content, a few quick questions:",
        questions: [
          { id: "intent", question: "What is your primary goal?", type: "choice", options: ["answer-question", "broad-research", "fact-check", "summarize", "find-sources"] },
          { id: "depth", question: "How much detail do you need?", type: "choice", options: ["overview", "standard", "deep"] },
          { id: "format", question: "Preferred output format?", type: "choice", options: ["full-text", "key-facts", "summary", "qa"] },
          { id: "query", question: "What specifically are you looking for? (optional — leave blank to browse)", type: "text" },
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
    }, { headers: GATEWAY_HEADERS });
  }

  handleDialogueRespond(body: Record<string, unknown>): NextResponse {
    const sessionId = body.session_id as string | undefined;
    const answers = (body.answers || {}) as Record<string, string>;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({
        openfeeder: "1.0",
        error: { code: "INVALID_SESSION", message: "Missing or invalid session_id." },
      }, { status: 400, headers: GATEWAY_HEADERS });
    }

    const sessionData = this.sessions.get(sessionId);
    if (!sessionData) {
      return NextResponse.json({
        openfeeder: "1.0",
        error: { code: "SESSION_EXPIRED", message: "Session not found or expired." },
      }, { status: 400, headers: GATEWAY_HEADERS });
    }

    const intentData: IntentData = {
      intent: answers.intent || "answer-question",
      depth: answers.depth || "standard",
      format: answers.format || "full-text",
      query: answers.query || "",
      language: answers.language || "en",
    };

    const context: Record<string, unknown> = {
      page_requested: sessionData.url || "/",
      detected_type: sessionData.detected_type || "page",
      detected_topic: sessionData.detected_topic || null,
    };

    this.sessions.delete(sessionId);

    return NextResponse.json(
      buildTailoredResponse(intentData, context, this.baseUrl),
      { headers: GATEWAY_HEADERS }
    );
  }
}
