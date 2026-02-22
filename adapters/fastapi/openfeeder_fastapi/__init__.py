"""
OpenFeeder FastAPI Adapter

Provides openfeeder_router() — a FastAPI APIRouter factory that serves the
OpenFeeder protocol endpoints for LLM-optimized content delivery.

Usage:
    from openfeeder_fastapi import openfeeder_router

    app.include_router(openfeeder_router(
        site_name="My Site",
        site_url="https://mysite.com",
        get_items=my_get_items,   # async def get_items(page, limit) -> dict
        get_item=my_get_item,     # async def get_item(url) -> dict | None
    ))
"""

from .router import openfeeder_router

__all__ = ["openfeeder_router"]
__version__ = "1.0.0"
