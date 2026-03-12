"""
Plausible Analytics Adapter

Implements the AnalyticsProvider interface for Plausible.
Sends events to a Plausible instance via the /api/event endpoint.

Configuration:
    provider_type: "plausible"
    url: Base URL of Plausible instance (e.g., https://plausible.io)
    site_id: Domain/Site ID in Plausible (e.g., example.com)
    api_key: Optional API key for authentication (if using self-hosted)
"""

from __future__ import annotations

import asyncio
import logging
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

logger = logging.getLogger("openfeeder.analytics.plausible")


class PlausibleAdapter(AnalyticsProvider):
    """
    Plausible Analytics Provider.
    
    Sends events to Plausible via the /api/event endpoint.
    All sends are async and fire-and-forget.
    
    Note: Plausible has a simpler API than Umami. Events are minimal.
    """

    def __init__(
        self,
        url: str = "https://plausible.io",
        site_id: str = "",
        api_key: str = "",
    ):
        """
        Initialize Plausible adapter.
        
        Args:
            url: Base URL of Plausible instance (defaults to plausible.io)
            site_id: Domain/Site ID in Plausible (e.g., example.com)
            api_key: Optional API key for self-hosted instances
        """
        super().__init__("plausible", enabled=bool(site_id))
        self.url = url.rstrip("/") if url else "https://plausible.io"
        self.site_id = site_id
        self.api_key = api_key
        self._client: Optional[httpx.AsyncClient] = None

        if self.enabled:
            logger.info("Plausible adapter initialized: %s", site_id)
        else:
            logger.warning("Plausible adapter disabled (missing site_id)")

    async def _ensure_client(self) -> Optional[httpx.AsyncClient]:
        """Lazy-initialize the async HTTP client."""
        if not self.enabled:
            return None
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    async def track_api_request(self, event: APIRequestEvent) -> None:
        """Track an API request."""
        if not self.enabled:
            return

        name = f"request.{event.method.lower()}"
        props = {
            "endpoint": event.endpoint,
            "status_code": str(event.status_code),
            "duration_ms": str(event.duration_ms),
        }
        if event.bot_family and event.bot_family != "unknown":
            props["bot"] = event.bot_family

        await self._send_event(event_name=name, props=props)

    async def track_search(self, event: SearchEvent) -> None:
        """Track a search event."""
        if not self.enabled:
            return

        props = {
            "results": str(event.results_count),
            "duration_ms": str(event.duration_ms),
        }
        if event.url_filter:
            props["filtered"] = "true"

        await self._send_event(event_name="search", props=props)

    async def track_sync(self, event: SyncEvent) -> None:
        """Track a differential sync event."""
        if not self.enabled:
            return

        total = event.added_count + event.updated_count + event.deleted_count
        props = {
            "items": str(total),
            "duration_ms": str(event.duration_ms),
        }
        await self._send_event(event_name="sync", props=props)

    async def track_bot_activity(self, event: BotActivityEvent) -> None:
        """Track activity from an identified bot."""
        if not self.enabled:
            return

        props = {
            "bot": event.bot_family,
            "endpoint": event.endpoint,
            "status_code": str(event.status_code),
        }
        await self._send_event(event_name="bot_activity", props=props)

    async def track_rate_limit(self, event: RateLimitEvent) -> None:
        """Track a rate limit violation."""
        if not self.enabled:
            return

        props = {
            "endpoint": event.endpoint,
            "limit": str(event.limit),
        }
        await self._send_event(event_name="rate_limit", props=props)

    async def track_error(self, event: ErrorEvent) -> None:
        """Track an API error."""
        if not self.enabled:
            return

        props = {
            "error": event.error_type,
            "status_code": str(event.status_code),
        }
        if event.endpoint:
            props["endpoint"] = event.endpoint

        await self._send_event(event_name="error", props=props)

    async def _send_event(
        self,
        event_name: str,
        props: Optional[dict] = None,
    ) -> None:
        """Send an event to Plausible (fire-and-forget)."""
        asyncio.create_task(self._do_send_event(event_name, props))

    async def _do_send_event(
        self,
        event_name: str,
        props: Optional[dict] = None,
    ) -> None:
        """Internal method to actually send the event."""
        try:
            client = await self._ensure_client()
            if not client:
                return

            payload = {
                "domain": self.site_id,
                "name": event_name,
            }
            if props:
                payload["props"] = props

            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            response = await client.post(
                f"{self.url}/api/event",
                json=payload,
                headers=headers,
            )

            if response.status_code >= 400:
                logger.warning(
                    "Plausible send failed (event=%s): HTTP %d",
                    event_name,
                    response.status_code,
                )

        except Exception as e:
            logger.debug("Plausible send error (event=%s): %s", event_name, e)

    async def shutdown(self) -> None:
        """Cleanup resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
