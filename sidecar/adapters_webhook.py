"""
Generic HTTP Webhook Adapter

Implements the AnalyticsProvider interface for generic HTTP webhooks.
Sends all events to a configurable HTTP endpoint.

Configuration:
    provider_type: "webhook"
    url: HTTP endpoint to POST events to
    api_key: Optional Bearer token for authentication
    extra:
        headers: Optional dict of additional headers to send
        timeout: Request timeout in seconds (default: 5)
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

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

logger = logging.getLogger("openfeeder.analytics.webhook")


class WebhookAdapter(AnalyticsProvider):
    """
    Generic HTTP Webhook Provider.
    
    Sends all events to a configurable HTTP endpoint.
    Events are serialized as JSON and POSTed to the webhook URL.
    All sends are async and fire-and-forget.
    
    Example webhook payload:
        {
            "event_type": "api.request",
            "timestamp": "2026-03-10T16:34:00Z",
            "data": {
                "hostname": "example.com",
                "endpoint": "/openfeeder",
                "method": "GET",
                "status_code": 200,
                "duration_ms": 45,
                "bot_family": "anthropic"
            }
        }
    """

    def __init__(
        self,
        url: str,
        api_key: str = "",
        extra: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize Webhook adapter.
        
        Args:
            url: HTTP endpoint to POST events to
            api_key: Optional Bearer token for authentication
            extra: Optional dict with 'headers' and 'timeout' settings
        """
        super().__init__("webhook", enabled=bool(url))
        self.url = url
        self.api_key = api_key
        self.extra = extra or {}
        self._client: Optional[httpx.AsyncClient] = None

        if self.enabled:
            logger.info("Webhook adapter initialized: %s", url)
        else:
            logger.warning("Webhook adapter disabled (missing URL)")

    async def _ensure_client(self) -> Optional[httpx.AsyncClient]:
        """Lazy-initialize the async HTTP client."""
        if not self.enabled:
            return None
        if self._client is None:
            timeout = self.extra.get("timeout", 5)
            self._client = httpx.AsyncClient(timeout=timeout)
        return self._client

    def _build_headers(self) -> dict:
        """Build request headers."""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "OpenFeeder/1.0 Analytics",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # Merge any extra headers
        if "headers" in self.extra:
            headers.update(self.extra["headers"])

        return headers

    async def track_api_request(self, event: APIRequestEvent) -> None:
        """Track an API request."""
        if not self.enabled:
            return

        data = {
            "hostname": event.hostname,
            "endpoint": event.endpoint,
            "method": event.method,
            "status_code": event.status_code,
            "duration_ms": event.duration_ms,
        }
        if event.user_agent:
            data["user_agent"] = event.user_agent[:200]
        if event.bot_name:
            data["bot_name"] = event.bot_name
        if event.bot_family:
            data["bot_family"] = event.bot_family

        await self._send_event(event_type="api.request", data=data)

    async def track_search(self, event: SearchEvent) -> None:
        """Track a search event."""
        if not self.enabled:
            return

        data = {
            "hostname": event.hostname,
            "query": event.query,
            "results_count": event.results_count,
            "duration_ms": event.duration_ms,
        }
        if event.min_score is not None:
            data["min_score"] = event.min_score
        if event.url_filter:
            data["url_filter"] = event.url_filter

        await self._send_event(event_type="api.search", data=data)

    async def track_sync(self, event: SyncEvent) -> None:
        """Track a differential sync event."""
        if not self.enabled:
            return

        data = {
            "hostname": event.hostname,
            "added_count": event.added_count,
            "updated_count": event.updated_count,
            "deleted_count": event.deleted_count,
            "duration_ms": event.duration_ms,
        }
        await self._send_event(event_type="api.sync", data=data)

    async def track_bot_activity(self, event: BotActivityEvent) -> None:
        """Track activity from an identified bot."""
        if not self.enabled:
            return

        data = {
            "hostname": event.hostname,
            "bot_name": event.bot_name,
            "bot_family": event.bot_family,
            "endpoint": event.endpoint,
            "status_code": event.status_code,
            "duration_ms": event.duration_ms,
        }
        await self._send_event(event_type="api.bot", data=data)

    async def track_rate_limit(self, event: RateLimitEvent) -> None:
        """Track a rate limit violation."""
        if not self.enabled:
            return

        data = {
            "hostname": event.hostname,
            "client_ip": event.client_ip,
            "endpoint": event.endpoint,
            "limit": event.limit,
            "remaining": event.remaining,
            "reset_timestamp": event.reset_timestamp,
        }
        await self._send_event(event_type="api.ratelimit", data=data)

    async def track_error(self, event: ErrorEvent) -> None:
        """Track an API error."""
        if not self.enabled:
            return

        data = {
            "hostname": event.hostname,
            "error_type": event.error_type,
            "status_code": event.status_code,
            "message": event.message,
        }
        if event.endpoint:
            data["endpoint"] = event.endpoint
        if event.traceback:
            data["traceback"] = event.traceback

        await self._send_event(event_type="api.error", data=data)

    async def _send_event(
        self,
        event_type: str,
        data: dict,
    ) -> None:
        """Send an event to the webhook (fire-and-forget)."""
        asyncio.create_task(self._do_send_event(event_type, data))

    async def _do_send_event(
        self,
        event_type: str,
        data: dict,
    ) -> None:
        """Internal method to actually send the event."""
        try:
            client = await self._ensure_client()
            if not client:
                return

            payload = {
                "event_type": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": data,
            }

            response = await client.post(
                self.url,
                json=payload,
                headers=self._build_headers(),
            )

            if response.status_code >= 400:
                logger.warning(
                    "Webhook send failed (event=%s): HTTP %d",
                    event_type,
                    response.status_code,
                )

        except Exception as e:
            logger.debug("Webhook send error (event=%s): %s", event_type, e)

    async def shutdown(self) -> None:
        """Cleanup resources."""
        if self._client:
            await self._client.aclose()
            self._client = None
