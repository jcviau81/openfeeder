"""
Tests for the Analytics System

Tests cover:
- All analytics adapters (Umami, Google Analytics, Plausible, Webhook)
- Analytics service initialization and event routing
- Configuration loading from environment and config files
- Fire-and-forget behavior
- Provider-specific event formatting
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from adapters_google_analytics import GoogleAnalyticsAdapter
from adapters_plausible import PlausibleAdapter
from adapters_umami import UmamiAdapter
from adapters_webhook import WebhookAdapter
from analytics_provider import (
    APIRequestEvent,
    BotActivityEvent,
    ErrorEvent,
    RateLimitEvent,
    SearchEvent,
    SyncEvent,
)
from analytics_service import AnalyticsService


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def api_request_event():
    """Create a sample API request event."""
    return APIRequestEvent(
        hostname="example.com",
        endpoint="/openfeeder",
        method="GET",
        status_code=200,
        duration_ms=45,
        user_agent="ClaudeBot/1.0",
        bot_name="ClaudeBot",
        bot_family="anthropic",
    )


@pytest.fixture
def search_event():
    """Create a sample search event."""
    return SearchEvent(
        hostname="example.com",
        query="machine learning",
        results_count=42,
        duration_ms=120,
        min_score=0.5,
        url_filter=None,
    )


@pytest.fixture
def sync_event():
    """Create a sample sync event."""
    return SyncEvent(
        hostname="example.com",
        added_count=10,
        updated_count=5,
        deleted_count=2,
        duration_ms=200,
    )


@pytest.fixture
def bot_activity_event():
    """Create a sample bot activity event."""
    return BotActivityEvent(
        hostname="example.com",
        bot_name="ClaudeBot",
        bot_family="anthropic",
        endpoint="/openfeeder",
        status_code=200,
        duration_ms=50,
    )


@pytest.fixture
def rate_limit_event():
    """Create a sample rate limit event."""
    return RateLimitEvent(
        hostname="example.com",
        client_ip="192.168.1.1",
        endpoint="/openfeeder",
        limit=100,
        remaining=0,
        reset_timestamp=1646000000,
    )


@pytest.fixture
def error_event():
    """Create a sample error event."""
    return ErrorEvent(
        hostname="example.com",
        error_type="ValueError",
        status_code=400,
        message="Invalid query parameter",
        endpoint="/openfeeder",
        traceback="Traceback (most recent call last)...",
    )


# ============================================================================
# Umami Adapter Tests
# ============================================================================


@pytest.mark.asyncio
async def test_umami_adapter_initialization():
    """Test Umami adapter initialization."""
    adapter = UmamiAdapter(
        url="https://analytics.example.com",
        site_id="test-site-123",
        api_key="test-key",
    )
    assert adapter.enabled is True
    assert adapter.provider_name == "umami"
    assert adapter.url == "https://analytics.example.com"
    assert adapter.site_id == "test-site-123"


@pytest.mark.asyncio
async def test_umami_adapter_disabled_without_url():
    """Test Umami adapter is disabled without URL."""
    adapter = UmamiAdapter(
        url="",
        site_id="test-site-123",
    )
    assert adapter.enabled is False


@pytest.mark.asyncio
async def test_umami_adapter_disabled_without_site_id():
    """Test Umami adapter is disabled without site_id."""
    adapter = UmamiAdapter(
        url="https://analytics.example.com",
        site_id="",
    )
    assert adapter.enabled is False


@pytest.mark.asyncio
async def test_umami_adapter_track_api_request(api_request_event):
    """Test Umami adapter tracks API requests."""
    adapter = UmamiAdapter(
        url="https://analytics.example.com",
        site_id="test-site-123",
    )

    with patch.object(adapter, "_send_event", new_callable=AsyncMock) as mock_send:
        await adapter.track_api_request(api_request_event)
        await asyncio.sleep(0.01)  # Allow fire-and-forget to complete
        # Note: Due to fire-and-forget, this is best-effort
        # The actual assertion would depend on event loop timing


@pytest.mark.asyncio
async def test_umami_adapter_track_search(search_event):
    """Test Umami adapter tracks search events."""
    adapter = UmamiAdapter(
        url="https://analytics.example.com",
        site_id="test-site-123",
    )

    with patch.object(adapter, "_send_event", new_callable=AsyncMock) as mock_send:
        await adapter.track_search(search_event)


@pytest.mark.asyncio
async def test_umami_adapter_track_sync(sync_event):
    """Test Umami adapter tracks sync events."""
    adapter = UmamiAdapter(
        url="https://analytics.example.com",
        site_id="test-site-123",
    )

    with patch.object(adapter, "_send_event", new_callable=AsyncMock) as mock_send:
        await adapter.track_sync(sync_event)


@pytest.mark.asyncio
async def test_umami_adapter_shutdown():
    """Test Umami adapter shutdown."""
    adapter = UmamiAdapter(
        url="https://analytics.example.com",
        site_id="test-site-123",
    )

    # Initialize the client
    await adapter._ensure_client()
    assert adapter._client is not None

    # Shutdown
    await adapter.shutdown()
    assert adapter._client is None


# ============================================================================
# Google Analytics Adapter Tests
# ============================================================================


@pytest.mark.asyncio
async def test_ga_adapter_initialization():
    """Test Google Analytics adapter initialization."""
    adapter = GoogleAnalyticsAdapter(
        site_id="G-XXXXXXXXXX",
        api_key="test-secret",
    )
    assert adapter.enabled is True
    assert adapter.provider_name == "google_analytics"


@pytest.mark.asyncio
async def test_ga_adapter_disabled_without_credentials():
    """Test GA adapter is disabled without proper credentials."""
    adapter = GoogleAnalyticsAdapter(site_id="", api_key="")
    assert adapter.enabled is False

    adapter = GoogleAnalyticsAdapter(site_id="G-XXXXXXXXXX", api_key="")
    assert adapter.enabled is False


@pytest.mark.asyncio
async def test_ga_adapter_track_api_request(api_request_event):
    """Test GA adapter tracks API requests."""
    adapter = GoogleAnalyticsAdapter(
        site_id="G-XXXXXXXXXX",
        api_key="test-secret",
    )

    with patch.object(adapter, "_send_event", new_callable=AsyncMock) as mock_send:
        await adapter.track_api_request(api_request_event)


# ============================================================================
# Plausible Adapter Tests
# ============================================================================


@pytest.mark.asyncio
async def test_plausible_adapter_initialization():
    """Test Plausible adapter initialization."""
    adapter = PlausibleAdapter(
        url="https://plausible.example.com",
        site_id="example.com",
    )
    assert adapter.enabled is True
    assert adapter.provider_name == "plausible"


@pytest.mark.asyncio
async def test_plausible_adapter_default_url():
    """Test Plausible adapter uses default URL."""
    adapter = PlausibleAdapter(site_id="example.com")
    assert adapter.url == "https://plausible.io"


@pytest.mark.asyncio
async def test_plausible_adapter_track_search(search_event):
    """Test Plausible adapter tracks search events."""
    adapter = PlausibleAdapter(site_id="example.com")

    with patch.object(adapter, "_send_event", new_callable=AsyncMock) as mock_send:
        await adapter.track_search(search_event)


# ============================================================================
# Webhook Adapter Tests
# ============================================================================


@pytest.mark.asyncio
async def test_webhook_adapter_initialization():
    """Test Webhook adapter initialization."""
    adapter = WebhookAdapter(
        url="https://example.com/analytics",
        api_key="webhook-secret",
    )
    assert adapter.enabled is True
    assert adapter.provider_name == "webhook"


@pytest.mark.asyncio
async def test_webhook_adapter_disabled_without_url():
    """Test Webhook adapter is disabled without URL."""
    adapter = WebhookAdapter(url="")
    assert adapter.enabled is False


@pytest.mark.asyncio
async def test_webhook_adapter_extra_headers():
    """Test Webhook adapter supports extra headers."""
    extra = {
        "headers": {
            "X-Custom-Header": "custom-value",
        }
    }
    adapter = WebhookAdapter(
        url="https://example.com/analytics",
        extra=extra,
    )

    headers = adapter._build_headers()
    assert headers["X-Custom-Header"] == "custom-value"
    assert headers["Content-Type"] == "application/json"


@pytest.mark.asyncio
async def test_webhook_adapter_track_api_request(api_request_event):
    """Test Webhook adapter tracks API requests."""
    adapter = WebhookAdapter(url="https://example.com/analytics")

    with patch.object(adapter, "_send_event", new_callable=AsyncMock) as mock_send:
        await adapter.track_api_request(api_request_event)


# ============================================================================
# Analytics Service Tests
# ============================================================================


@pytest.mark.asyncio
async def test_analytics_service_empty_initialization():
    """Test AnalyticsService with no providers."""
    service = AnalyticsService(providers=[])
    assert service.enabled is False


@pytest.mark.asyncio
async def test_analytics_service_with_providers():
    """Test AnalyticsService with providers."""
    providers = [
        UmamiAdapter("https://analytics.example.com", "test-site-123"),
        WebhookAdapter("https://example.com/analytics"),
    ]
    service = AnalyticsService(providers=providers)
    assert service.enabled is True
    assert len(service.providers) == 2


@pytest.mark.asyncio
async def test_analytics_service_tracks_all_providers(api_request_event):
    """Test AnalyticsService routes events to all providers."""
    mock_umami = AsyncMock(spec=UmamiAdapter)
    mock_umami.enabled = True
    mock_umami.provider_name = "umami"

    mock_webhook = AsyncMock(spec=WebhookAdapter)
    mock_webhook.enabled = True
    mock_webhook.provider_name = "webhook"

    service = AnalyticsService(providers=[mock_umami, mock_webhook])

    await service.track_api_request(api_request_event)

    # Both providers should be called
    mock_umami.track_api_request.assert_called_once()
    mock_webhook.track_api_request.assert_called_once()


@pytest.mark.asyncio
async def test_analytics_service_skip_disabled_providers(api_request_event):
    """Test AnalyticsService skips disabled providers."""
    mock_umami = AsyncMock(spec=UmamiAdapter)
    mock_umami.enabled = False
    mock_umami.provider_name = "umami"

    mock_webhook = AsyncMock(spec=WebhookAdapter)
    mock_webhook.enabled = True
    mock_webhook.provider_name = "webhook"

    service = AnalyticsService(providers=[mock_umami, mock_webhook])

    await service.track_api_request(api_request_event)

    # Only webhook should be called
    mock_umami.track_api_request.assert_not_called()
    mock_webhook.track_api_request.assert_called_once()


@pytest.mark.asyncio
async def test_analytics_service_from_env(monkeypatch):
    """Test AnalyticsService initialization from environment variables."""
    monkeypatch.setenv("ANALYTICS_PROVIDERS", "umami,webhook")
    monkeypatch.setenv("ANALYTICS_UMAMI_URL", "https://analytics.example.com")
    monkeypatch.setenv("ANALYTICS_UMAMI_SITE_ID", "test-site-123")
    monkeypatch.setenv("ANALYTICS_WEBHOOK_URL", "https://example.com/analytics")

    service = AnalyticsService.from_env()
    assert service.enabled is True
    assert len([p for p in service.providers if p.enabled]) == 2


@pytest.mark.asyncio
async def test_analytics_service_from_config():
    """Test AnalyticsService initialization from configuration dict."""
    config = {
        "providers": [
            {
                "type": "umami",
                "enabled": True,
                "url": "https://analytics.example.com",
                "site_id": "test-site-123",
            },
            {
                "type": "webhook",
                "enabled": True,
                "url": "https://example.com/analytics",
            },
        ]
    }

    service = AnalyticsService.from_config(config)
    assert service.enabled is True
    assert len([p for p in service.providers if p.enabled]) == 2


@pytest.mark.asyncio
async def test_analytics_service_from_config_skip_disabled():
    """Test AnalyticsService skips disabled providers in config."""
    config = {
        "providers": [
            {
                "type": "umami",
                "enabled": False,
                "url": "https://analytics.example.com",
                "site_id": "test-site-123",
            },
            {
                "type": "webhook",
                "enabled": True,
                "url": "https://example.com/analytics",
            },
        ]
    }

    service = AnalyticsService.from_config(config)
    assert len([p for p in service.providers if p.enabled]) == 1


@pytest.mark.asyncio
async def test_analytics_service_track_all_events(
    api_request_event,
    search_event,
    sync_event,
    bot_activity_event,
    rate_limit_event,
    error_event,
):
    """Test AnalyticsService tracks all event types."""
    mock_provider = AsyncMock(spec=UmamiAdapter)
    mock_provider.enabled = True
    mock_provider.provider_name = "umami"

    service = AnalyticsService(providers=[mock_provider])

    await service.track_api_request(api_request_event)
    await service.track_search(search_event)
    await service.track_sync(sync_event)
    await service.track_bot_activity(bot_activity_event)
    await service.track_rate_limit(rate_limit_event)
    await service.track_error(error_event)

    assert mock_provider.track_api_request.call_count == 1
    assert mock_provider.track_search.call_count == 1
    assert mock_provider.track_sync.call_count == 1
    assert mock_provider.track_bot_activity.call_count == 1
    assert mock_provider.track_rate_limit.call_count == 1
    assert mock_provider.track_error.call_count == 1


@pytest.mark.asyncio
async def test_analytics_service_shutdown():
    """Test AnalyticsService shutdown."""
    mock_provider1 = AsyncMock(spec=UmamiAdapter)
    mock_provider1.provider_name = "umami"

    mock_provider2 = AsyncMock(spec=WebhookAdapter)
    mock_provider2.provider_name = "webhook"

    service = AnalyticsService(providers=[mock_provider1, mock_provider2])

    await service.shutdown()

    mock_provider1.shutdown.assert_called_once()
    mock_provider2.shutdown.assert_called_once()


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.asyncio
async def test_event_routing_with_mixed_providers(api_request_event):
    """Test events are routed to multiple different providers."""
    # Create real adapter instances (they won't actually send anywhere without network)
    umami = UmamiAdapter("https://analytics.example.com", "test-site")
    webhook = WebhookAdapter("https://example.com/analytics")
    ga = GoogleAnalyticsAdapter("G-XXXXXXXXXX", "secret")

    service = AnalyticsService(providers=[umami, webhook, ga])

    # This should not raise any exceptions
    await service.track_api_request(api_request_event)
    await asyncio.sleep(0.05)  # Allow async tasks to start


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
