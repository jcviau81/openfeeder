"""
Umami Analytics Client for OpenFeeder Sidecar

Provides structured event tracking for:
- API requests (endpoint, method, status, duration)
- Rate limit violations
- Errors and exceptions
- Bot identification (Claude, GPT, Perplexity, etc.)
- Search queries and result counts
- Performance metrics

Configuration via environment variables:
    UMAMI_URL          — Umami server URL (e.g., https://analytics.snaf.foo)
    UMAMI_SITE_ID      — Website ID in Umami
    UMAMI_API_KEY      — API key for authentication (optional)
    UMAMI_ENABLED      — Enable/disable tracking (default: true)
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional
import hashlib
import json

import httpx

logger = logging.getLogger("openfeeder.umami")


class UmamiClient:
    """
    Fire-and-forget Umami analytics client.
    
    Never blocks the main request — all sends are async and fire-and-forget.
    Failed sends are logged but don't propagate errors.
    """

    def __init__(self, server_url: str, site_id: str, api_key: str = ""):
        """
        Initialize the Umami client.
        
        Args:
            server_url: Base URL of Umami instance (e.g., https://analytics.snaf.foo)
            site_id: Website ID in Umami
            api_key: Optional API key for authentication
        """
        self.server_url = server_url.rstrip("/") if server_url else ""
        self.site_id = site_id
        self.api_key = api_key
        self.enabled = bool(self.server_url and self.site_id)
        self._client: Optional[httpx.AsyncClient] = None
        
        if self.enabled:
            logger.info("Umami analytics enabled: %s", self.server_url)
        else:
            logger.info("Umami analytics disabled (missing URL or site_id)")

    async def _ensure_client(self) -> Optional[httpx.AsyncClient]:
        """Lazy-initialize the async HTTP client."""
        if not self.enabled:
            return None
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()

    def _build_headers(self) -> dict:
        """Build request headers with auth if configured."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def track_api_request(
        self,
        hostname: str,
        endpoint: str,
        method: str,
        status_code: int,
        duration_ms: int,
        user_agent: str = "",
        bot_name: str = "",
        bot_family: str = "",
    ) -> None:
        """
        Track an API request.
        
        Args:
            hostname: Site hostname
            endpoint: API endpoint path (e.g., /openfeeder, /.well-known/openfeeder.json)
            method: HTTP method (GET, POST, etc.)
            status_code: HTTP response status code
            duration_ms: Response time in milliseconds
            user_agent: Full User-Agent string
            bot_name: Identified bot name (e.g., ClaudeBot)
            bot_family: Bot family (e.g., anthropic, openai)
        """
        if not self.enabled:
            return

        data = {
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "user_agent_short": user_agent[:100] if user_agent else "unknown",
        }
        if bot_name:
            data["bot_name"] = bot_name
        if bot_family:
            data["bot_family"] = bot_family

        await self._send_event(
            name="api.request",
            hostname=hostname,
            data=data,
        )

    async def track_rate_limit_hit(
        self,
        hostname: str,
        client_ip: str,
        endpoint: str,
        limit: int,
        remaining: int,
        reset_timestamp: int,
    ) -> None:
        """
        Track a rate limit violation.
        
        Args:
            hostname: Site hostname
            client_ip: Client IP address
            endpoint: API endpoint that was rate limited
            limit: Rate limit per window
            remaining: Remaining requests
            reset_timestamp: Unix timestamp when limit resets
        """
        if not self.enabled:
            return

        data = {
            "client_ip_hash": hashlib.sha256(client_ip.encode()).hexdigest()[:16],
            "endpoint": endpoint,
            "limit": limit,
            "remaining": remaining,
            "reset_timestamp": reset_timestamp,
        }
        await self._send_event(
            name="api.ratelimit",
            hostname=hostname,
            data=data,
        )

    async def track_error(
        self,
        hostname: str,
        error_type: str,
        status_code: int,
        message: str,
        endpoint: str = "",
        traceback: str = "",
    ) -> None:
        """
        Track an API error.
        
        Args:
            hostname: Site hostname
            error_type: Error class name (e.g., ValueError, IndexError)
            status_code: HTTP status code returned
            message: Error message
            endpoint: Endpoint where error occurred
            traceback: Optional traceback for debugging
        """
        if not self.enabled:
            return

        data = {
            "error_type": error_type,
            "status_code": status_code,
            "message": message[:200],  # Truncate long messages
        }
        if endpoint:
            data["endpoint"] = endpoint
        if traceback:
            data["traceback"] = traceback[:500]

        await self._send_event(
            name="api.error",
            hostname=hostname,
            data=data,
        )

    async def track_search(
        self,
        hostname: str,
        query: str,
        results_count: int,
        duration_ms: int,
        min_score: float = 0.0,
        url_filter: Optional[str] = None,
    ) -> None:
        """
        Track a search query.
        
        Args:
            hostname: Site hostname
            query: Search query string
            results_count: Number of results returned
            duration_ms: Search duration in milliseconds
            min_score: Score filter applied
            url_filter: Optional URL filter applied
        """
        if not self.enabled:
            return

        data = {
            "query_hash": hashlib.sha256(query.encode()).hexdigest()[:16],
            "query_length": len(query),
            "results_count": results_count,
            "duration_ms": duration_ms,
        }
        if min_score > 0.0:
            data["min_score_filter"] = min_score
        if url_filter:
            data["has_url_filter"] = True

        await self._send_event(
            name="api.search",
            hostname=hostname,
            data=data,
        )

    async def track_bot_activity(
        self,
        hostname: str,
        bot_name: str,
        bot_family: str,
        endpoint: str,
        status_code: int,
        duration_ms: int,
    ) -> None:
        """
        Track activity from identified LLM bots.
        
        Args:
            hostname: Site hostname
            bot_name: Bot identifier (e.g., ClaudeBot)
            bot_family: Bot family (e.g., anthropic)
            endpoint: API endpoint accessed
            status_code: Response status
            duration_ms: Response time in milliseconds
        """
        if not self.enabled:
            return

        data = {
            "bot_name": bot_name,
            "bot_family": bot_family,
            "endpoint": endpoint,
            "status_code": status_code,
            "duration_ms": duration_ms,
        }
        await self._send_event(
            name="api.bot",
            hostname=hostname,
            data=data,
        )

    async def track_sync(
        self,
        hostname: str,
        added_count: int,
        updated_count: int,
        deleted_count: int,
        duration_ms: int,
    ) -> None:
        """
        Track differential sync requests.
        
        Args:
            hostname: Site hostname
            added_count: Number of items added
            updated_count: Number of items updated
            deleted_count: Number of items deleted
            duration_ms: Sync duration in milliseconds
        """
        if not self.enabled:
            return

        data = {
            "added": added_count,
            "updated": updated_count,
            "deleted": deleted_count,
            "duration_ms": duration_ms,
            "total": added_count + updated_count + deleted_count,
        }
        await self._send_event(
            name="api.sync",
            hostname=hostname,
            data=data,
        )

    async def _send_event(
        self,
        name: str,
        hostname: str,
        data: dict,
    ) -> None:
        """
        Send an event to Umami (fire-and-forget).
        
        Args:
            name: Event name (e.g., api.request)
            hostname: Website hostname
            data: Custom data fields
        """
        asyncio.create_task(self._do_send_event(name, hostname, data))

    async def _do_send_event(
        self,
        name: str,
        hostname: str,
        data: dict,
    ) -> None:
        """Internal method to actually send the event."""
        try:
            client = await self._ensure_client()
            if not client:
                return

            payload = {
                "type": "event",
                "payload": {
                    "website": self.site_id,
                    "hostname": hostname,
                    "url": "/openfeeder",
                    "name": name,
                    "data": data,
                    "timestamp": int(time.time() * 1000),  # Milliseconds
                },
            }

            response = await client.post(
                f"{self.server_url}/api/send",
                json=payload,
                headers=self._build_headers(),
            )

            if response.status_code >= 400:
                logger.warning(
                    "Umami send failed (event=%s): HTTP %d",
                    name,
                    response.status_code,
                )

        except Exception as e:
            logger.debug("Umami send error (event=%s): %s", name, e)
            # Silently fail — don't propagate to main request


# Singleton instance (initialized at startup)
_umami_client: Optional[UmamiClient] = None


def get_umami_client() -> Optional[UmamiClient]:
    """Get the global Umami client instance."""
    return _umami_client


def init_umami_client(server_url: str, site_id: str, api_key: str = "") -> UmamiClient:
    """Initialize the global Umami client."""
    global _umami_client
    _umami_client = UmamiClient(server_url, site_id, api_key)
    return _umami_client


async def shutdown_umami_client() -> None:
    """Shutdown the Umami client."""
    global _umami_client
    if _umami_client:
        await _umami_client.close()
        _umami_client = None
