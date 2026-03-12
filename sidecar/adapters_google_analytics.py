"""
Google Analytics (GA4) Adapter

Implements the AnalyticsProvider interface for Google Analytics 4.
Sends events to the Google Analytics Measurement Protocol endpoint.

Configuration:
    provider_type: "google_analytics"
    site_id: Measurement ID (e.g., G-XXXXXXXXXX)
    api_key: API secret from Google Analytics
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

logger = logging.getLogger("openfeeder.analytics.ga4")


class GoogleAnalyticsAdapter(AnalyticsProvider):
    """
    Google Analytics 4 Provider.
    
    Sends events to Google Analytics via the Measurement Protocol.
    All sends are async and fire-and-forget.
    
    Requires:
        - site_id: Measurement ID (e.g., G-XXXXXXXXXX)
        - api_key: API secret from Google Analytics
    """

    GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect"

    def __init__(
        self,
        site_id: str,
        api_key: str,
    ):
        """
        Initialize Google Analytics adapter.
        
        Args:
            site_id: Measurement ID (e.g., G-XXXXXXXXXX)
            api_key: API secret from Google Analytics
        """
        super().__init__("google_analytics", enabled=bool(site_id and api_key))
        self.site_id = site_id
        self.api_key = api_key
        self._client: Optional[httpx.AsyncClient] = None

        if self.enabled:
            logger.info("Google Analytics adapter initialized: %s", site_id)
        else:
            logger.warning("Google Analytics adapter disabled (missing measurement_id or api_key)")

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

        client_id = event.bot_name or event.bot_family or "unknown"
        params = {
            "endpoint": event.endpoint,
            "method": event.method,
            "status_code": str(event.status_code),
            "duration_ms": str(event.duration_ms),
        }
        if event.bot_family and event.bot_family != "unknown":
            params["bot_family"] = event.bot_family

        await self._send_event(
            client_id=client_id,
            event_name="openfeeder_request",
            params=params,
        )

    async def track_search(self, event: SearchEvent) -> None:
        """Track a search event."""
        if not self.enabled:
            return

        params = {
            "search_term": event.query[:100],  # GA4 has limits
            "results": str(event.results_count),
            "duration_ms": str(event.duration_ms),
        }
        if event.min_score is not None:
            params["min_score"] = str(event.min_score)
        if event.url_filter:
            params["has_url_filter"] = "true"

        await self._send_event(
            client_id="search",
            event_name="search",
            params=params,
        )

    async def track_sync(self, event: SyncEvent) -> None:
        """Track a differential sync event."""
        if not self.enabled:
            return

        params = {
            "added": str(event.added_count),
            "updated": str(event.updated_count),
            "deleted": str(event.deleted_count),
            "duration_ms": str(event.duration_ms),
        }
        await self._send_event(
            client_id="sync",
            event_name="sync",
            params=params,
        )

    async def track_bot_activity(self, event: BotActivityEvent) -> None:
        """Track activity from an identified bot."""
        if not self.enabled:
            return

        client_id = event.bot_name or event.bot_family or "unknown"
        params = {
            "bot_family": event.bot_family,
            "endpoint": event.endpoint,
            "status_code": str(event.status_code),
            "duration_ms": str(event.duration_ms),
        }
        await self._send_event(
            client_id=client_id,
            event_name="bot_activity",
            params=params,
        )

    async def track_rate_limit(self, event: RateLimitEvent) -> None:
        """Track a rate limit violation."""
        if not self.enabled:
            return

        params = {
            "endpoint": event.endpoint,
            "limit": str(event.limit),
            "remaining": str(event.remaining),
        }
        await self._send_event(
            client_id="rate_limit",
            event_name="rate_limit_exceeded",
            params=params,
        )

    async def track_error(self, event: ErrorEvent) -> None:
        """Track an API error."""
        if not self.enabled:
            return

        params = {
            "error_type": event.error_type,
            "status_code": str(event.status_code),
            "message": event.message[:100],
        }
        if event.endpoint:
            params["endpoint"] = event.endpoint

        await self._send_event(
            client_id="error",
            event_name="api_error",
            params=params,
        )

    async def _send_event(
        self,
        client_id: str,
        event_name: str,
        params: dict,
    ) -> None:
        """Send an event to Google Analytics (fire-and-forget)."""
        asyncio.create_task(
            self._do_send_event(client_id, event_name, params)
        )

    async def _do_send_event(
        self,
        client_id: str,
        event_name: str,
        params: dict,
    ) -> None:
        """Internal method to actually send the event."""
        try:
            client = await self._ensure_client()
            if not client:
                return

            payload = {
                "client_id": client_id,
                "events": [
                    {
                        "name": event_name,
                        "params": params,
                    }
                ],
            }

            url = (
                f"{self.GA4_ENDPOINT}"
                f"?measurement_id={self.site_id}&api_secret={self.api_key}"
            )

            response = await client.post(url, json=payload)

            if response.status_code >= 400:
                logger.warning(
                    "Google Analytics send failed (event=%s): HTTP %d",
                    event_name,
                    response.status_code,
                )

        except Exception as e:
            logger.debug("Google Analytics send error (event=%s): %s", event_name, e)

    async def shutdown(self) -> None:
        """Cleanup resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
