"""Tests for OpenFeeder FastAPI Interactive LLM Gateway."""

from __future__ import annotations

import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openfeeder_fastapi import openfeeder_router
from openfeeder_fastapi.gateway import (
    GatewayHandler,
    detect_context,
    is_llm_bot,
)
from openfeeder_fastapi.gateway_session import GatewaySessionStore


# ---------------------------------------------------------------------------
# Fake content callbacks
# ---------------------------------------------------------------------------

async def fake_get_items(page: int, limit: int) -> dict:
    return {"items": [], "total": 0}


async def fake_get_item(url: str) -> dict | None:
    return None


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def gateway_client() -> TestClient:
    app = FastAPI()
    router = openfeeder_router(
        site_name="Test Site",
        site_url="https://test.example.com",
        get_items=fake_get_items,
        get_item=fake_get_item,
        llm_gateway=True,
        has_ecommerce=False,
    )
    app.include_router(router)

    # Add gateway middleware
    handler = router._gateway_handler  # type: ignore[attr-defined]

    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import Response

    class GatewayMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if handler and handler.should_intercept(request):
                return handler.handle_request(request)
            return await call_next(request)

    app.add_middleware(GatewayMiddleware)
    return TestClient(app)


@pytest.fixture()
def ecommerce_client() -> TestClient:
    app = FastAPI()
    router = openfeeder_router(
        site_name="Shop",
        site_url="https://shop.example.com",
        get_items=fake_get_items,
        get_item=fake_get_item,
        llm_gateway=True,
        has_ecommerce=True,
    )
    app.include_router(router)

    handler = router._gateway_handler  # type: ignore[attr-defined]

    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request

    class GatewayMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if handler and handler.should_intercept(request):
                return handler.handle_request(request)
            return await call_next(request)

    app.add_middleware(GatewayMiddleware)
    return TestClient(app)


GPT_UA = "Mozilla/5.0 GPTBot/1.0"
NORMAL_UA = "Mozilla/5.0 Chrome/120"


# ---------------------------------------------------------------------------
# Unit tests: is_llm_bot
# ---------------------------------------------------------------------------

class TestIsLlmBot:
    def test_gptbot(self):
        assert is_llm_bot("Mozilla/5.0 GPTBot/1.0") is True

    def test_claudebot(self):
        assert is_llm_bot("ClaudeBot/1.0") is True

    def test_normal_browser(self):
        assert is_llm_bot("Mozilla/5.0 Chrome/120") is False

    def test_empty(self):
        assert is_llm_bot("") is False


# ---------------------------------------------------------------------------
# Unit tests: detect_context
# ---------------------------------------------------------------------------

class TestDetectContext:
    def test_home(self):
        ctx = detect_context("/")
        assert ctx["type"] == "home"

    def test_product(self):
        ctx = detect_context("/product/blue-jacket")
        assert ctx["type"] == "product"
        assert ctx["topic"] == "Blue Jacket"

    def test_article(self):
        ctx = detect_context("/blog/my-first-post")
        assert ctx["type"] == "article"
        assert ctx["topic"] == "My First Post"

    def test_category(self):
        ctx = detect_context("/category/jackets")
        assert ctx["type"] == "category"

    def test_search(self):
        ctx = detect_context("/search")
        assert ctx["type"] == "search"

    def test_single_slug(self):
        ctx = detect_context("/about")
        assert ctx["type"] == "page"
        assert ctx["topic"] == "About"


# ---------------------------------------------------------------------------
# Unit tests: GatewaySessionStore
# ---------------------------------------------------------------------------

class TestSessionStore:
    def test_create_and_get(self):
        store = GatewaySessionStore(ttl_seconds=60)
        sid = store.create({"url": "/test"})
        assert sid.startswith("gw_")
        data = store.get(sid)
        assert data["url"] == "/test"

    def test_delete(self):
        store = GatewaySessionStore(ttl_seconds=60)
        sid = store.create({"url": "/test"})
        store.delete(sid)
        assert store.get(sid) is None

    def test_expired(self):
        store = GatewaySessionStore(ttl_seconds=0)
        sid = store.create({"url": "/test"})
        time.sleep(0.01)
        assert store.get(sid) is None

    def test_not_found(self):
        store = GatewaySessionStore(ttl_seconds=60)
        assert store.get("gw_doesnotexist") is None


# ---------------------------------------------------------------------------
# Integration: Mode 1 — Cold Start (no intent headers)
# ---------------------------------------------------------------------------

class TestMode1ColdStart:
    def test_llm_bot_gets_gateway_response(self, gateway_client):
        resp = gateway_client.get("/blog/some-article", headers={"User-Agent": GPT_UA})
        assert resp.status_code == 200
        data = resp.json()
        assert data["openfeeder"] == "1.0"
        assert data["gateway"] == "interactive"
        assert "dialog" in data
        assert data["dialog"]["active"] is True
        assert data["dialog"]["session_id"].startswith("gw_")
        assert len(data["questions"]) > 0
        assert "endpoints" in data

    def test_normal_browser_passes_through(self, gateway_client):
        resp = gateway_client.get("/blog/some-article", headers={"User-Agent": NORMAL_UA})
        # Should not get gateway response (passes through to normal handler)
        data = resp.json()
        assert "gateway" not in data

    def test_static_assets_skip(self, gateway_client):
        resp = gateway_client.get("/style.css", headers={"User-Agent": GPT_UA})
        assert resp.status_code != 200 or "gateway" not in resp.json()

    def test_openfeeder_paths_skip(self, gateway_client):
        resp = gateway_client.get("/openfeeder", headers={"User-Agent": GPT_UA})
        data = resp.json()
        assert "gateway" not in data

    def test_home_page_questions(self, gateway_client):
        resp = gateway_client.get("/", headers={"User-Agent": GPT_UA})
        data = resp.json()
        assert data["context"]["detected_type"] == "home"
        intents = [q["intent"] for q in data["questions"]]
        assert "index_browse" in intents

    def test_product_page_questions(self, ecommerce_client):
        resp = ecommerce_client.get("/product/widget", headers={"User-Agent": GPT_UA})
        data = resp.json()
        assert data["context"]["detected_type"] == "product"
        intents = [q["intent"] for q in data["questions"]]
        assert "single_product" in intents

    def test_gateway_headers(self, gateway_client):
        resp = gateway_client.get("/", headers={"User-Agent": GPT_UA})
        assert resp.headers["x-openfeeder"] == "1.0"
        assert resp.headers["x-openfeeder-gateway"] == "interactive"
        assert resp.headers["access-control-allow-origin"] == "*"


# ---------------------------------------------------------------------------
# Integration: Mode 2 — Warm Start (X-OpenFeeder-* headers)
# ---------------------------------------------------------------------------

class TestMode2WarmStart:
    def test_direct_intent_headers(self, gateway_client):
        resp = gateway_client.get("/blog/climate", headers={
            "User-Agent": GPT_UA,
            "X-OpenFeeder-Intent": "answer-question",
            "X-OpenFeeder-Query": "What causes climate change?",
            "X-OpenFeeder-Depth": "deep",
            "X-OpenFeeder-Format": "key-facts",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["tailored"] is True
        assert data["intent"] == "answer-question"
        assert data["depth"] == "deep"
        assert data["format"] == "key-facts"
        assert len(data["recommended_endpoints"]) > 0

    def test_direct_query_params(self, gateway_client):
        resp = gateway_client.get(
            "/blog/climate?_of_intent=summarize&_of_query=climate&_of_depth=overview",
            headers={"User-Agent": GPT_UA},
        )
        data = resp.json()
        assert data["tailored"] is True
        assert data["intent"] == "summarize"
        assert data["depth"] == "overview"

    def test_no_query_gives_page_endpoint(self, gateway_client):
        resp = gateway_client.get("/blog/test", headers={
            "User-Agent": GPT_UA,
            "X-OpenFeeder-Intent": "broad-research",
        })
        data = resp.json()
        assert data["tailored"] is True
        # Should have browse endpoint when no query
        relevances = [e["relevance"] for e in data["recommended_endpoints"]]
        assert "low" in relevances


# ---------------------------------------------------------------------------
# Integration: Mode 1 Round 2 — Dialogue respond
# ---------------------------------------------------------------------------

class TestMode1Round2:
    def test_full_dialogue_flow(self, gateway_client):
        # Round 1: get session
        resp1 = gateway_client.get("/blog/article", headers={"User-Agent": GPT_UA})
        session_id = resp1.json()["dialog"]["session_id"]

        # Round 2: respond with answers
        resp2 = gateway_client.post("/openfeeder/gateway/respond", json={
            "session_id": session_id,
            "answers": {
                "intent": "fact-check",
                "depth": "deep",
                "format": "key-facts",
                "query": "Is this article accurate?",
            },
        })
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["tailored"] is True
        assert data["intent"] == "fact-check"
        assert data["depth"] == "deep"

    def test_invalid_session(self, gateway_client):
        resp = gateway_client.post("/openfeeder/gateway/respond", json={
            "session_id": "",
            "answers": {},
        })
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "INVALID_SESSION"

    def test_expired_session(self, gateway_client):
        resp = gateway_client.post("/openfeeder/gateway/respond", json={
            "session_id": "gw_doesnotexist1234",
            "answers": {},
        })
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "SESSION_EXPIRED"

    def test_session_deleted_after_use(self, gateway_client):
        # Get session
        resp1 = gateway_client.get("/", headers={"User-Agent": GPT_UA})
        session_id = resp1.json()["dialog"]["session_id"]

        # Use it
        gateway_client.post("/openfeeder/gateway/respond", json={
            "session_id": session_id,
            "answers": {"intent": "summarize"},
        })

        # Try again — should be expired
        resp3 = gateway_client.post("/openfeeder/gateway/respond", json={
            "session_id": session_id,
            "answers": {},
        })
        assert resp3.status_code == 400
        assert resp3.json()["error"]["code"] == "SESSION_EXPIRED"


# ---------------------------------------------------------------------------
# Integration: E-commerce questions
# ---------------------------------------------------------------------------

class TestEcommerce:
    def test_home_shows_product_question(self, ecommerce_client):
        resp = ecommerce_client.get("/", headers={"User-Agent": GPT_UA})
        data = resp.json()
        intents = [q["intent"] for q in data["questions"]]
        assert "products_browse" in intents
        assert "products" in data["context"]["site_capabilities"]

    def test_non_ecommerce_no_product_question(self, gateway_client):
        resp = gateway_client.get("/", headers={"User-Agent": GPT_UA})
        data = resp.json()
        intents = [q["intent"] for q in data["questions"]]
        assert "products_browse" not in intents
