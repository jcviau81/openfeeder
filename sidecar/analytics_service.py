"""
Analytics Service

Main service that manages multiple analytics providers and routes events to them.
Handles configuration, provider initialization, and event distribution.

Supports configuring multiple providers simultaneously:
    - Umami
    - Google Analytics
    - Plausible
    - Webhook (custom HTTP endpoint)
    - None (disabled)

Configuration via environment variables:
    ANALYTICS_PROVIDERS         — Comma-separated list (e.g., "umami,webhook")
    ANALYTICS_UMAMI_URL         — Umami server URL
    ANALYTICS_UMAMI_SITE_ID     — Umami website ID
    ANALYTICS_UMAMI_API_KEY     — Umami API key (optional)
    ANALYTICS_GA_SITE_ID        — Google Analytics measurement ID
    ANALYTICS_GA_API_KEY        — Google Analytics API secret
    ANALYTICS_PLAUSIBLE_URL     — Plausible instance URL (default: https://plausible.io)
    ANALYTICS_PLAUSIBLE_SITE_ID — Plausible domain/site ID
    ANALYTICS_PLAUSIBLE_API_KEY — Plausible API key (optional)
    ANALYTICS_WEBHOOK_URL       — Webhook endpoint URL
    ANALYTICS_WEBHOOK_API_KEY   — Webhook API key (optional)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from adapters_google_analytics import GoogleAnalyticsAdapter
from adapters_plausible import PlausibleAdapter
from adapters_umami import UmamiAdapter
from adapters_webhook import WebhookAdapter
from analytics_provider import (
    APIRequestEvent,
    AnalyticsProvider,
    BotActivityEvent,
    ErrorEvent,
    ProviderConfig,
    RateLimitEvent,
    SearchEvent,
    SyncEvent,
)

logger = logging.getLogger("openfeeder.analytics")


class AnalyticsService:
    """
    Main Analytics Service.
    
    Manages multiple analytics providers and routes events to all enabled providers.
    Provides fire-and-forget event tracking — events are sent asynchronously
    and failures are logged but don't propagate to the main request.
    """

    def __init__(self, providers: Optional[List[AnalyticsProvider]] = None):
        """
        Initialize the analytics service.
        
        Args:
            providers: List of configured AnalyticsProvider instances
        """
        self.providers = providers or []
        self.enabled = len([p for p in self.providers if p.enabled]) > 0

        if self.enabled:
            enabled_count = len([p for p in self.providers if p.enabled])
            logger.info("Analytics service initialized with %d enabled provider(s)", enabled_count)
        else:
            logger.info("Analytics service initialized (no providers enabled)")

    @staticmethod
    def from_env() -> AnalyticsService:
        """
        Initialize the service from environment variables.
        
        Reads:
            ANALYTICS_PROVIDERS — Comma-separated list of providers to enable
            ANALYTICS_*_* — Provider-specific configuration
            
        Returns:
            Configured AnalyticsService instance
        """
        providers_str = os.environ.get("ANALYTICS_PROVIDERS", "").strip()
        providers_list = [p.strip() for p in providers_str.split(",") if p.strip()]

        providers: List[AnalyticsProvider] = []

        # Umami
        if "umami" in providers_list:
            umami_url = os.environ.get("ANALYTICS_UMAMI_URL", "")
            umami_site_id = os.environ.get("ANALYTICS_UMAMI_SITE_ID", "")
            umami_api_key = os.environ.get("ANALYTICS_UMAMI_API_KEY", "")

            if umami_url and umami_site_id:
                providers.append(
                    UmamiAdapter(umami_url, umami_site_id, umami_api_key)
                )
                logger.info("Umami analytics provider loaded from environment")
            else:
                logger.warning(
                    "Umami provider requested but missing ANALYTICS_UMAMI_URL "
                    "or ANALYTICS_UMAMI_SITE_ID"
                )

        # Google Analytics
        if "google_analytics" in providers_list:
            ga_site_id = os.environ.get("ANALYTICS_GA_SITE_ID", "")
            ga_api_key = os.environ.get("ANALYTICS_GA_API_KEY", "")

            if ga_site_id and ga_api_key:
                providers.append(GoogleAnalyticsAdapter(ga_site_id, ga_api_key))
                logger.info("Google Analytics provider loaded from environment")
            else:
                logger.warning(
                    "Google Analytics provider requested but missing "
                    "ANALYTICS_GA_SITE_ID or ANALYTICS_GA_API_KEY"
                )

        # Plausible
        if "plausible" in providers_list:
            plausible_url = os.environ.get(
                "ANALYTICS_PLAUSIBLE_URL", "https://plausible.io"
            )
            plausible_site_id = os.environ.get("ANALYTICS_PLAUSIBLE_SITE_ID", "")
            plausible_api_key = os.environ.get("ANALYTICS_PLAUSIBLE_API_KEY", "")

            if plausible_site_id:
                providers.append(
                    PlausibleAdapter(plausible_url, plausible_site_id, plausible_api_key)
                )
                logger.info("Plausible analytics provider loaded from environment")
            else:
                logger.warning(
                    "Plausible provider requested but missing ANALYTICS_PLAUSIBLE_SITE_ID"
                )

        # Webhook
        if "webhook" in providers_list:
            webhook_url = os.environ.get("ANALYTICS_WEBHOOK_URL", "")
            webhook_api_key = os.environ.get("ANALYTICS_WEBHOOK_API_KEY", "")

            if webhook_url:
                providers.append(WebhookAdapter(webhook_url, webhook_api_key))
                logger.info("Webhook analytics provider loaded from environment")
            else:
                logger.warning(
                    "Webhook provider requested but missing ANALYTICS_WEBHOOK_URL"
                )

        return AnalyticsService(providers)

    @staticmethod
    def from_config(config: Dict[str, Any]) -> AnalyticsService:
        """
        Initialize the service from a configuration dictionary.
        
        Example config:
            {
                "providers": [
                    {
                        "type": "umami",
                        "enabled": true,
                        "url": "https://analytics.snaf.foo",
                        "site_id": "12d3650a-5855-404d-92e9-fb406f8bbeb3",
                        "api_key": "optional-key"
                    },
                    {
                        "type": "webhook",
                        "enabled": true,
                        "url": "https://example.com/analytics",
                        "api_key": "webhook-secret"
                    }
                ]
            }
        
        Args:
            config: Configuration dictionary
            
        Returns:
            Configured AnalyticsService instance
        """
        providers: List[AnalyticsProvider] = []

        for provider_config in config.get("providers", []):
            provider_type = provider_config.get("type", "").lower()
            enabled = provider_config.get("enabled", True)

            if not enabled:
                logger.debug("Provider %s is disabled", provider_type)
                continue

            try:
                if provider_type == "umami":
                    provider = UmamiAdapter(
                        url=provider_config.get("url", ""),
                        site_id=provider_config.get("site_id", ""),
                        api_key=provider_config.get("api_key", ""),
                    )
                    providers.append(provider)

                elif provider_type == "google_analytics":
                    provider = GoogleAnalyticsAdapter(
                        site_id=provider_config.get("site_id", ""),
                        api_key=provider_config.get("api_key", ""),
                    )
                    providers.append(provider)

                elif provider_type == "plausible":
                    provider = PlausibleAdapter(
                        url=provider_config.get("url", "https://plausible.io"),
                        site_id=provider_config.get("site_id", ""),
                        api_key=provider_config.get("api_key", ""),
                    )
                    providers.append(provider)

                elif provider_type == "webhook":
                    extra = provider_config.get("extra", {})
                    provider = WebhookAdapter(
                        url=provider_config.get("url", ""),
                        api_key=provider_config.get("api_key", ""),
                        extra=extra,
                    )
                    providers.append(provider)

                else:
                    logger.warning("Unknown provider type: %s", provider_type)

            except Exception as e:
                logger.error("Failed to initialize provider %s: %s", provider_type, e)

        return AnalyticsService(providers)

    async def track_api_request(self, event: APIRequestEvent) -> None:
        """Track an API request to all enabled providers."""
        if not self.enabled:
            return

        for provider in self.providers:
            if provider.enabled:
                try:
                    await provider.track_api_request(event)
                except Exception as e:
                    logger.debug(
                        "Error tracking API request in %s: %s",
                        provider.provider_name,
                        e,
                    )

    async def track_search(self, event: SearchEvent) -> None:
        """Track a search event to all enabled providers."""
        if not self.enabled:
            return

        for provider in self.providers:
            if provider.enabled:
                try:
                    await provider.track_search(event)
                except Exception as e:
                    logger.debug(
                        "Error tracking search in %s: %s",
                        provider.provider_name,
                        e,
                    )

    async def track_sync(self, event: SyncEvent) -> None:
        """Track a differential sync event to all enabled providers."""
        if not self.enabled:
            return

        for provider in self.providers:
            if provider.enabled:
                try:
                    await provider.track_sync(event)
                except Exception as e:
                    logger.debug(
                        "Error tracking sync in %s: %s",
                        provider.provider_name,
                        e,
                    )

    async def track_bot_activity(self, event: BotActivityEvent) -> None:
        """Track bot activity to all enabled providers."""
        if not self.enabled:
            return

        for provider in self.providers:
            if provider.enabled:
                try:
                    await provider.track_bot_activity(event)
                except Exception as e:
                    logger.debug(
                        "Error tracking bot activity in %s: %s",
                        provider.provider_name,
                        e,
                    )

    async def track_rate_limit(self, event: RateLimitEvent) -> None:
        """Track a rate limit violation to all enabled providers."""
        if not self.enabled:
            return

        for provider in self.providers:
            if provider.enabled:
                try:
                    await provider.track_rate_limit(event)
                except Exception as e:
                    logger.debug(
                        "Error tracking rate limit in %s: %s",
                        provider.provider_name,
                        e,
                    )

    async def track_error(self, event: ErrorEvent) -> None:
        """Track an error to all enabled providers."""
        if not self.enabled:
            return

        for provider in self.providers:
            if provider.enabled:
                try:
                    await provider.track_error(event)
                except Exception as e:
                    logger.debug(
                        "Error tracking error in %s: %s",
                        provider.provider_name,
                        e,
                    )

    async def shutdown(self) -> None:
        """Shutdown all providers and cleanup resources."""
        logger.info("Shutting down analytics service")
        for provider in self.providers:
            try:
                await provider.shutdown()
            except Exception as e:
                logger.error("Error shutting down provider %s: %s", provider.provider_name, e)
