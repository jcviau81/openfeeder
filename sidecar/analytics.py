"""
OpenFeeder Analytics — fire-and-forget event tracking.
Supports: Umami | GA4 | none
"""

from __future__ import annotations

import asyncio
import logging

import httpx

logger = logging.getLogger("openfeeder.analytics")

BOT_FAMILIES = {
    "GPTBot": "openai",
    "ChatGPT-User": "openai",
    "ClaudeBot": "anthropic",
    "anthropic-ai": "anthropic",
    "PerplexityBot": "perplexity",
    "Google-Extended": "google",
    "Googlebot": "google",
    "CCBot": "common-crawl",
    "cohere-ai": "cohere",
    "FacebookBot": "meta",
    "Amazonbot": "amazon",
    "YouBot": "you",
    "Bytespider": "bytedance",
}


def detect_bot(user_agent: str) -> tuple[str, str]:
    """Return (bot_name, bot_family) from a User-Agent string."""
    if not user_agent:
        return "unknown", "unknown"
    ua_lower = user_agent.lower()
    for pattern, family in BOT_FAMILIES.items():
        if pattern.lower() in ua_lower:
            return pattern, family
    return "human-or-unknown", "unknown"


class Analytics:
    """Fire-and-forget analytics sender (Umami or GA4)."""

    def __init__(self, provider: str, url: str, site_id: str, api_key: str = ""):
        self.provider = provider  # "umami" | "ga4" | "none"
        self.url = url.rstrip("/") if url else ""
        self.site_id = site_id
        self.api_key = api_key
        self.enabled = provider != "none" and bool(url) and bool(site_id)
        self._client = httpx.AsyncClient(timeout=5.0) if self.enabled else None

    async def track(self, event_data: dict) -> None:
        """Fire-and-forget — never blocks the main request."""
        if not self.enabled:
            return
        asyncio.create_task(self._send(event_data))

    async def _send(self, event_data: dict) -> None:
        try:
            if self.provider == "umami":
                await self._send_umami(event_data)
            elif self.provider == "ga4":
                await self._send_ga4(event_data)
        except Exception as e:
            logger.debug("Analytics send failed (non-critical): %s", e)

    async def _send_umami(self, data: dict) -> None:
        payload = {
            "type": "event",
            "payload": {
                "website": self.site_id,
                "hostname": data.get("hostname", ""),
                "url": data.get("url", "/openfeeder"),
                "name": "openfeeder_request",
                "data": {
                    "bot_name": data.get("bot_name", "unknown"),
                    "bot_family": data.get("bot_family", "unknown"),
                    "endpoint": data.get("endpoint", ""),
                    "query": data.get("query", ""),
                    "intent": data.get("intent", ""),
                    "results": data.get("results", 0),
                    "cached": data.get("cached", False),
                    "response_ms": data.get("response_ms", 0),
                },
            },
        }
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        await self._client.post(f"{self.url}/api/send", json=payload, headers=headers)

    async def _send_ga4(self, data: dict) -> None:
        if not self.api_key:
            return
        payload = {
            "client_id": data.get("bot_name", "bot"),
            "events": [
                {
                    "name": "openfeeder_request",
                    "params": {
                        "bot_name": data.get("bot_name", "unknown"),
                        "bot_family": data.get("bot_family", "unknown"),
                        "endpoint": data.get("endpoint", ""),
                        "search_term": data.get("query", ""),
                        "results": data.get("results", 0),
                    },
                }
            ],
        }
        url = (
            f"https://www.google-analytics.com/mp/collect"
            f"?measurement_id={self.site_id}&api_secret={self.api_key}"
        )
        await self._client.post(url, json=payload)
