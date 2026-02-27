"""Fixtures for OpenFeeder FastAPI adapter tests."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openfeeder_fastapi import openfeeder_router


# ---------------------------------------------------------------------------
# Fake content
# ---------------------------------------------------------------------------

FAKE_ITEMS = [
    {
        "url": "/hello-world",
        "title": "Hello World",
        "content": "<p>This is the first post with some content.</p>",
        "published": "2025-01-15T12:00:00Z",
    },
    {
        "url": "/second-post",
        "title": "Second Post",
        "content": "<p>Another post about testing things.</p>",
        "published": "2025-01-16T08:30:00Z",
    },
    {
        "url": "/no-date",
        "title": "No Date Post",
        "content": "<p>This post has no published date.</p>",
        "published": None,
    },
]


async def fake_get_items(page: int, limit: int) -> dict:
    """Return a paginated slice of fake items."""
    start = (page - 1) * limit
    end = start + limit
    return {
        "items": FAKE_ITEMS[start:end],
        "total": len(FAKE_ITEMS),
    }


async def fake_get_item(url: str) -> dict | None:
    """Return a single fake item by URL path."""
    for item in FAKE_ITEMS:
        if item["url"] == url:
            return item
    return None


async def failing_get_items(page: int, limit: int) -> dict:
    raise RuntimeError("database down")


async def failing_get_item(url: str) -> dict | None:
    raise RuntimeError("database down")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def app() -> FastAPI:
    """FastAPI app with the OpenFeeder router mounted."""
    application = FastAPI()
    router = openfeeder_router(
        site_name="Test Site",
        site_url="https://test.example.com",
        get_items=fake_get_items,
        get_item=fake_get_item,
        language="en",
        site_description="A test site for unit tests",
    )
    application.include_router(router)
    return application


@pytest.fixture()
def client(app: FastAPI) -> TestClient:
    """HTTPX-backed test client."""
    return TestClient(app)


@pytest.fixture()
def failing_client() -> TestClient:
    """Client whose content callbacks always raise."""
    application = FastAPI()
    router = openfeeder_router(
        site_name="Broken Site",
        site_url="https://broken.example.com",
        get_items=failing_get_items,
        get_item=failing_get_item,
    )
    application.include_router(router)
    return TestClient(application)
