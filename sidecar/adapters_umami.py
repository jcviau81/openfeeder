"""
Umami Analytics Adapter

Implements the AnalyticsProvider interface for Umami analytics.
Provides fire-and-forget event tracking to Umami instances.

Configuration:
    provider_type: "umami"
    url: Base URL of Umami instance (e.g., https://analytics.snaf.foo)
    site_id: Website ID in Umami
    api_key: Optional API key for authentication
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import httpx

from analytics_provider import (
    APIRequestEvent,
    AnalyticsProvider,
    BotActivityEvent,
    ErrorEvent,
    RateLimitEvent,
    SearchEvent,
    SyncEvent,
)

logger = logging.getLogger("openfeeder.analytics.umami")


class UmamiAdapter(AnalyticsProvider):
    """
    Umami Analytics Provider.
    
    Sends events to an Umami instance via the /api/send endpoint.
    All sends are async and fire-and-forget — failures are logged but not propagated.
    """

    def __init__(
        self,
        url: str,
        site_id: str,
        api_key: str = "",
    ):
        """
        Initialize Umami adapter.
        
        Args:
            url: Base URL of Umami instance (e.g., https://analytics.snaf.foo)
            site_id: Website ID in Umami
            api_key: Optional API key for authentication
        """
        super().__init__("umami", enabled=bool(url and site_id))
        self.url = url.rstrip("/") if url else ""
        self.site_id = site_id
        self.api_key = api_key
        self._client: Optional[httpx.AsyncClient] = None

        if self.enabled:
            logger.info("Umami adapter initialized: %s", self.url)
        else:
            logger.warning("Umami adapter disabled (missing URL or site_id)")

    async def _ensure_client(self) -> Optional[httpx.AsyncClient]:
        """Lazy-initialize the async HTTP client."""
        if not self.enabled:
            return None
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    def _build_headers(self) -> dict:
        """Build request headers with auth if configured."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def track_api_request(self, event: APIRequestEvent) -> None:
        """Track an API request."""
        if not self.enabled:
            return

        data = {
            "endpoint": event.endpoint,
            "method": event.method,
            "status_code": event.status_code,
            "duration_ms": event.duration_ms,
        }
        if event.user_agent:
            data["user_agent_short"] = event.user_agent[:100]
        if event.bot_name:
            data["bot_name"] = event.bot_name
        if event.bot_family:
            data["bot_family"] = event.bot_family
        
        # Add detailed request metadata
        if event.query_term:
            data["query_term"] = event.query_term
        if event.page_number is not None:
            data["page_number"] = event.page_number
        if event.results_count is not None:
            data["results_count"] = event.results_count
        if event.total_pages is not None:
            data["total_pages"] = event.total_pages
        if event.has_filters is not None:
            data["has_filters"] = event.has_filters
        if event.request_type:
            data["request_type"] = event.request_type

        await self._send_event(
            name="api.request",
            hostname=event.hostname,
            data=data,
        )

    async def track_search(self, event: SearchEvent) -> None:
        """Track a search event."""
        if not self.enabled:
            return

        import hashlib
        data = {
            "query_length": len(event.query),
            "results_count": event.results_count,
            "duration_ms": event.duration_ms,
        }
        # Hash the query for privacy
        if event.query:
            data["query_hash"] = hashlib.sha256(event.query.encode()).hexdigest()[:16]
        if event.min_score is not None:
            data["min_score_filter"] = event.min_score
        if event.url_filter:
            data["has_url_filter"] = True

        await self._send_event(
            name="api.search",
            hostname=event.hostname,
            data=data,
        )

    async def track_sync(self, event: SyncEvent) -> None:
        """Track a differential sync event."""
        if not self.enabled:
            return

        data = {
            "added": event.added_count,
            "updated": event.updated_count,
            "deleted": event.deleted_count,
            "total": event.added_count + event.updated_count + event.deleted_count,
            "duration_ms": event.duration_ms,
        }
        await self._send_event(
            name="api.sync",
            hostname=event.hostname,
            data=data,
        )

    async def track_bot_activity(self, event: BotActivityEvent) -> None:
        """Track activity from an identified bot."""
        if not self.enabled:
            return

        data = {
            "bot_name": event.bot_name,
            "bot_family": event.bot_family,
            "endpoint": event.endpoint,
            "status_code": event.status_code,
            "duration_ms": event.duration_ms,
        }
        await self._send_event(
            name="api.bot",
            hostname=event.hostname,
            data=data,
        )

    async def track_rate_limit(self, event: RateLimitEvent) -> None:
        """Track a rate limit violation."""
        if not self.enabled:
            return

        import hashlib
        data = {
            "client_ip_hash": hashlib.sha256(event.client_ip.encode()).hexdigest()[:16],
            "endpoint": event.endpoint,
            "limit": event.limit,
            "remaining": event.remaining,
            "reset_timestamp": event.reset_timestamp,
        }
        await self._send_event(
            name="api.ratelimit",
            hostname=event.hostname,
            data=data,
        )

    async def track_error(self, event: ErrorEvent) -> None:
        """Track an API error."""
        if not self.enabled:
            return

        data = {
            "error_type": event.error_type,
            "status_code": event.status_code,
            "message": event.message[:200],
        }
        if event.endpoint:
            data["endpoint"] = event.endpoint
        if event.traceback:
            data["traceback"] = event.traceback[:500]

        await self._send_event(
            name="api.error",
            hostname=event.hostname,
            data=data,
        )

    async def _send_event(
        self,
        name: str,
        hostname: str,
        data: dict,
    ) -> None:
        """Send an event to Umami (fire-and-forget)."""
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
                    "timestamp": int(time.time() * 1000),
                },
            }

            response = await client.post(
                f"{self.url}/api/send",
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

    async def shutdown(self) -> None:
        """Cleanup resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
