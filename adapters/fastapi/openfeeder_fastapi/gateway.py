"""
OpenFeeder FastAPI Adapter — Interactive LLM Gateway

Detects AI crawler user-agents and returns structured, context-aware JSON
with targeted questions and pre-built query actions. Supports 3 modes:
  Mode 1 (Cold Start)  — dialogue with session
  Mode 2 (Warm Start)  — direct response via X-OpenFeeder-* headers
  Mode 3 (Bypass)      — legacy bots use endpoints directly
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .gateway_session import GatewaySessionStore

# Known LLM crawler user-agent patterns
LLM_AGENTS = [
    "GPTBot", "ChatGPT-User", "ClaudeBot", "anthropic-ai",
    "PerplexityBot", "Google-Extended", "cohere-ai", "CCBot",
    "FacebookBot", "Amazonbot", "YouBot", "Bytespider",
]

STATIC_EXTS_RE = re.compile(
    r"\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|map|json)$", re.I
)
OPENFEEDER_PATHS_RE = re.compile(r"^/(openfeeder|\.well-known/openfeeder)")

GATEWAY_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "X-OpenFeeder": "1.0",
    "X-OpenFeeder-Gateway": "interactive",
    "Access-Control-Allow-Origin": "*",
}


def is_llm_bot(ua: str) -> bool:
    """Check if a User-Agent belongs to an LLM crawler."""
    if not ua:
        return False
    return any(p in ua for p in LLM_AGENTS)


def _title_case(slug: str) -> str:
    """Convert a URL slug to Title Case."""
    return slug.replace("-", " ").replace("_", " ").title()


def detect_context(path: str) -> dict[str, Any]:
    """Parse URL path to detect content type and topic."""
    clean = path.rstrip("/") or "/"
    segments = [s for s in clean.split("/") if s]

    if not segments:
        return {"type": "home", "topic": None, "segments": segments}

    first = segments[0].lower()

    if first in ("product", "products", "shop", "store", "item", "catalogue", "catalog"):
        topic = _title_case(segments[1]) if len(segments) > 1 else None
        return {"type": "product", "topic": topic, "segments": segments}

    if first in ("category", "cat", "collection", "collections", "tag", "brand", "department"):
        topic = _title_case(segments[1]) if len(segments) > 1 else segments[0]
        return {"type": "category", "topic": topic, "segments": segments}

    if first == "search":
        return {"type": "search", "topic": None, "segments": segments}

    if first in ("blog", "post", "posts", "article", "articles", "news", "press"):
        topic = _title_case(segments[1]) if len(segments) > 1 else None
        return {"type": "article", "topic": topic, "segments": segments}

    if len(segments) == 1:
        return {"type": "page", "topic": _title_case(segments[0]), "segments": segments}

    return {"type": "page", "topic": segments[-1].replace("-", " ").replace("_", " "), "segments": segments}


def build_questions(ctx: dict, path: str, base_url: str, has_ecommerce: bool) -> list[dict]:
    """Generate context-aware questions for an LLM based on page type."""
    questions: list[dict] = []
    encoded_path = quote(path, safe="")

    page_type = ctx["type"]
    topic = ctx.get("topic")
    segments = ctx.get("segments", [])

    if page_type == "product":
        questions.append({
            "question": f'Do you want the full details of "{topic}"?' if topic else "Do you want the full details of this product?",
            "intent": "single_product",
            "action": f"GET {base_url}/openfeeder/products?url={encoded_path}",
            "returns": "Full description, price, variants, availability, stock status",
        })
        if len(segments) > 1:
            cat = segments[1].replace("-", "+").replace("_", "+")
            questions.append({
                "question": "Are you comparing this with similar products?",
                "intent": "category_browse",
                "action": f"GET {base_url}/openfeeder/products?category={cat}",
                "returns": "All products in the same category with pricing and availability",
            })
        questions.append({
            "question": "Are you looking for products in a specific price range?",
            "intent": "price_filter",
            "action": f"GET {base_url}/openfeeder/products?in_stock=true",
            "returns": "All in-stock products (add &min_price=X&max_price=Y to filter by budget)",
        })
        questions.append({
            "question": "Are you searching for a product by feature or keyword?",
            "intent": "keyword_search",
            "action": f"GET {base_url}/openfeeder/products?q=your+keywords",
            "returns": "Products matching your search terms",
        })

    elif page_type == "category":
        cat_slug = segments[1] if len(segments) > 1 else ""
        if has_ecommerce:
            questions.append({
                "question": f'Do you want all products in the "{topic}" category?' if topic else "Do you want to browse products in this category?",
                "intent": "category_browse",
                "action": f"GET {base_url}/openfeeder/products?category={cat_slug}",
                "returns": "Paginated product list with pricing and availability",
            })
            questions.append({
                "question": "Are you looking for in-stock items only?",
                "intent": "availability_filter",
                "action": f"GET {base_url}/openfeeder/products?category={cat_slug}&in_stock=true",
                "returns": "Only available products in this category",
            })
            questions.append({
                "question": "Are you looking for items on sale?",
                "intent": "sale_filter",
                "action": f"GET {base_url}/openfeeder/products?on_sale=true",
                "returns": "Discounted products currently on sale",
            })
        else:
            topic_q = (topic or "").replace(" ", "+")
            questions.append({
                "question": f'Do you want all products in the "{topic}" category?' if topic else "Do you want to browse products in this category?",
                "intent": "category_browse",
                "action": f"GET {base_url}/openfeeder?q={topic_q}",
                "returns": "Paginated product list with pricing and availability",
            })
            questions.append({
                "question": "Are you looking for in-stock items only?",
                "intent": "availability_filter",
                "action": f"GET {base_url}/openfeeder?q={topic_q}",
                "returns": "Only available products in this category",
            })
            questions.append({
                "question": "Are you looking for items on sale?",
                "intent": "sale_filter",
                "action": f"GET {base_url}/openfeeder?q=sale",
                "returns": "Discounted products currently on sale",
            })

    elif page_type in ("article", "page"):
        questions.append({
            "question": f'Do you want the full content of "{topic}"?' if topic else "Do you want the full content of this page?",
            "intent": "single_page",
            "action": f"GET {base_url}/openfeeder?url={encoded_path}",
            "returns": "Full article text split into semantic chunks, ready for LLM processing",
        })
        if topic:
            topic_q = topic.replace(" ", "+")
            questions.append({
                "question": f'Are you looking for more content related to "{topic}"?',
                "intent": "topic_search",
                "action": f"GET {base_url}/openfeeder?q={topic_q}",
                "returns": "All content related to this topic, ranked by relevance",
            })
        questions.append({
            "question": "Do you want to browse all available content?",
            "intent": "index_browse",
            "action": f"GET {base_url}/openfeeder",
            "returns": "Paginated index of all articles with summaries",
        })

    elif page_type == "home":
        questions.append({
            "question": "Do you want to browse all available content?",
            "intent": "index_browse",
            "action": f"GET {base_url}/openfeeder",
            "returns": "Paginated index of all content with summaries",
        })
        questions.append({
            "question": "Are you searching for something specific?",
            "intent": "search",
            "action": f"GET {base_url}/openfeeder?q=your+search+query",
            "returns": "Content matching your search query",
        })
        if has_ecommerce:
            questions.append({
                "question": "Are you looking for products?",
                "intent": "products_browse",
                "action": f"GET {base_url}/openfeeder/products",
                "returns": "Full product catalog with pricing and availability",
            })

    else:
        questions.append({
            "question": "Do you want the content of this page?",
            "intent": "single_page",
            "action": f"GET {base_url}/openfeeder?url={encoded_path}",
            "returns": "Page content in structured chunks",
        })
        questions.append({
            "question": "Are you looking for something specific on this site?",
            "intent": "search",
            "action": f"GET {base_url}/openfeeder?q=your+search+query",
            "returns": "Relevant content matching your query",
        })

    return questions


def extract_intent_data(request: Request) -> dict[str, str] | None:
    """Extract intent from X-OpenFeeder-* headers or _of_* query params."""
    intent = (
        request.headers.get("x-openfeeder-intent")
        or request.query_params.get("_of_intent")
    )
    if not intent:
        return None
    return {
        "intent": intent,
        "depth": request.headers.get("x-openfeeder-depth") or request.query_params.get("_of_depth", "standard"),
        "format": request.headers.get("x-openfeeder-format") or request.query_params.get("_of_format", "full-text"),
        "query": request.headers.get("x-openfeeder-query") or request.query_params.get("_of_query", ""),
        "language": request.headers.get("x-openfeeder-language") or request.query_params.get("_of_language", "en"),
    }


def build_tailored_response(intent_data: dict, context: dict, base_url: str) -> dict:
    """Build a tailored response for Mode 2 (direct) or Mode 1 Round 2."""
    intent = intent_data.get("intent", "answer-question")
    depth = intent_data.get("depth", "standard")
    fmt = intent_data.get("format", "full-text")
    query = intent_data.get("query", "")
    page = context.get("page_requested", "/")

    endpoints = []

    if query:
        endpoints.append({
            "url": f"{base_url}/openfeeder?q={quote(query)}&format={fmt}",
            "relevance": "high",
            "description": "Content filtered to match your specific question",
        })

    detected_type = context.get("detected_type", "page")
    if detected_type in ("product", "category"):
        endpoints.append({
            "url": f"{base_url}/openfeeder/products?url={quote(page, safe='')}",
            "relevance": "medium" if query else "high",
            "description": "Product details for the requested page",
        })
    else:
        endpoints.append({
            "url": f"{base_url}/openfeeder?url={quote(page, safe='')}",
            "relevance": "medium" if query else "high",
            "description": "Full content of the requested page",
        })

    if not query:
        endpoints.append({
            "url": f"{base_url}/openfeeder",
            "relevance": "low",
            "description": "Browse all available content",
        })

    query_hints = []
    if query:
        query_hints.append(f"GET /openfeeder?q={quote(query)}")
        query_hints.append(f"GET /openfeeder?q={quote(query)}&format={fmt}&depth={depth}")
    else:
        query_hints.append(f"GET /openfeeder?url={quote(page, safe='')}")

    return {
        "openfeeder": "1.0",
        "tailored": True,
        "intent": intent,
        "depth": depth,
        "format": fmt,
        "recommended_endpoints": endpoints,
        "query_hints": query_hints,
        "current_page": {
            "openfeeder_url": f"{base_url}/openfeeder?url={quote(page, safe='')}",
            "title": context.get("detected_topic"),
            "summary": f"{detected_type} page" if detected_type else None,
        },
        "endpoints": {
            "content": f"{base_url}/openfeeder",
            "discovery": f"{base_url}/.well-known/openfeeder.json",
        },
    }


class GatewayHandler:
    """Encapsulates the 3-mode gateway logic with session support."""

    def __init__(self, *, site_url: str, has_ecommerce: bool = False) -> None:
        self.base_url = site_url.rstrip("/")
        self.has_ecommerce = has_ecommerce
        self.sessions = GatewaySessionStore()

    def should_intercept(self, request: Request) -> bool:
        """Check if this request should be intercepted by the gateway."""
        if request.method != "GET":
            return False
        path = request.url.path or "/"
        if STATIC_EXTS_RE.search(path):
            return False
        if OPENFEEDER_PATHS_RE.match(path):
            return False
        ua = request.headers.get("user-agent", "")
        return is_llm_bot(ua)

    def handle_request(self, request: Request) -> JSONResponse:
        """Handle Mode 1 Round 1 (cold start) and Mode 2 (direct)."""
        path = request.url.path or "/"
        ctx = detect_context(path)

        context = {
            "page_requested": path,
            "detected_type": ctx["type"],
            "detected_topic": ctx["topic"],
            "site_capabilities": ["content", "search", "products"] if self.has_ecommerce else ["content", "search"],
        }

        # Mode 2 — Direct (Warm Start)
        intent_data = extract_intent_data(request)
        if intent_data:
            return JSONResponse(
                content=build_tailored_response(intent_data, context, self.base_url),
                headers=GATEWAY_HEADERS,
            )

        # Mode 1 Round 1 — Cold Start
        questions = build_questions(ctx, path, self.base_url, self.has_ecommerce)
        session_id = self.sessions.create({
            "url": path,
            "detected_type": ctx["type"],
            "detected_topic": ctx["topic"],
            "created_at": int(__import__("time").time()),
        })

        return JSONResponse(
            content={
                "openfeeder": "1.0",
                "gateway": "interactive",
                "message": (
                    "This site supports OpenFeeder — a structured content protocol for AI systems. "
                    "Instead of scraping HTML, use the actions below to get exactly what you need."
                ),
                "dialog": {
                    "active": True,
                    "session_id": session_id,
                    "expires_in": 300,
                    "message": "To give you the most relevant content, a few quick questions:",
                    "questions": [
                        {
                            "id": "intent",
                            "question": "What is your primary goal?",
                            "type": "choice",
                            "options": ["answer-question", "broad-research", "fact-check", "summarize", "find-sources"],
                        },
                        {
                            "id": "depth",
                            "question": "How much detail do you need?",
                            "type": "choice",
                            "options": ["overview", "standard", "deep"],
                        },
                        {
                            "id": "format",
                            "question": "Preferred output format?",
                            "type": "choice",
                            "options": ["full-text", "key-facts", "summary", "qa"],
                        },
                        {
                            "id": "query",
                            "question": "What specifically are you looking for? (optional — leave blank to browse)",
                            "type": "text",
                        },
                    ],
                    "reply_to": "POST /openfeeder/gateway/respond",
                },
                "context": context,
                "questions": questions,
                "endpoints": {
                    "content": f"{self.base_url}/openfeeder",
                    "discovery": f"{self.base_url}/.well-known/openfeeder.json",
                },
                "next_steps": [
                    "Answer the dialog questions via POST /openfeeder/gateway/respond for a tailored response.",
                    "Or choose an action from the questions above and make that GET request.",
                    f"Or search directly: GET {self.base_url}/openfeeder?q=describe+what+you+need",
                    f"Start from the discovery doc: GET {self.base_url}/.well-known/openfeeder.json",
                ],
            },
            headers=GATEWAY_HEADERS,
        )

    def handle_dialogue_respond(self, body: dict) -> JSONResponse:
        """Handle Mode 1 Round 2 — POST /openfeeder/gateway/respond."""
        session_id = body.get("session_id")
        answers = body.get("answers", {})

        if not session_id or not isinstance(session_id, str):
            return JSONResponse(
                status_code=400,
                content={
                    "openfeeder": "1.0",
                    "error": {"code": "INVALID_SESSION", "message": "Missing or invalid session_id."},
                },
                headers=GATEWAY_HEADERS,
            )

        session_data = self.sessions.get(session_id)
        if session_data is None:
            return JSONResponse(
                status_code=400,
                content={
                    "openfeeder": "1.0",
                    "error": {"code": "SESSION_EXPIRED", "message": "Session not found or expired."},
                },
                headers=GATEWAY_HEADERS,
            )

        intent_data = {
            "intent": answers.get("intent", "answer-question"),
            "depth": answers.get("depth", "standard"),
            "format": answers.get("format", "full-text"),
            "query": answers.get("query", ""),
            "language": answers.get("language", "en"),
        }

        context = {
            "page_requested": session_data.get("url", "/"),
            "detected_type": session_data.get("detected_type", "page"),
            "detected_topic": session_data.get("detected_topic"),
        }

        self.sessions.delete(session_id)

        return JSONResponse(
            content=build_tailored_response(intent_data, context, self.base_url),
            headers=GATEWAY_HEADERS,
        )
