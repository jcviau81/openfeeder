"""
OpenFeeder FastAPI Adapter — Pydantic models for responses.
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

class SiteInfo(BaseModel):
    name: str
    url: str
    language: str = "en"
    description: str = ""


class FeedInfo(BaseModel):
    endpoint: str = "/openfeeder"
    type: str = "paginated"


class DiscoveryResponse(BaseModel):
    version: str = "1.0.1"
    site: SiteInfo
    feed: FeedInfo
    capabilities: list[str] = ["search"]
    contact: Optional[Any] = None


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

class IndexItem(BaseModel):
    url: str
    title: str
    published: str
    summary: str


class IndexResponse(BaseModel):
    schema_: str = "openfeeder/1.0"
    type: str = "index"
    page: int
    total_pages: int
    items: list[IndexItem]

    class Config:
        populate_by_name = True

    def model_dump(self, **kwargs) -> dict:
        d = super().model_dump(**kwargs)
        d["schema"] = d.pop("schema_")
        return d


# ---------------------------------------------------------------------------
# Single page
# ---------------------------------------------------------------------------

class Chunk(BaseModel):
    id: str
    text: str
    type: str
    relevance: Optional[Any] = None


class PageMeta(BaseModel):
    total_chunks: int
    returned_chunks: int
    cached: bool = False
    cache_age_seconds: Optional[int] = None


class SinglePageResponse(BaseModel):
    schema_: str = "openfeeder/1.0"
    url: str
    title: str
    published: str
    language: str = "en"
    summary: str
    chunks: list[Chunk]
    meta: PageMeta

    class Config:
        populate_by_name = True

    def model_dump(self, **kwargs) -> dict:
        d = super().model_dump(**kwargs)
        d["schema"] = d.pop("schema_")
        return d


# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------

class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    schema_: str = "openfeeder/1.0"
    error: ErrorDetail

    def model_dump(self, **kwargs) -> dict:
        d = super().model_dump(**kwargs)
        d["schema"] = d.pop("schema_")
        return d
