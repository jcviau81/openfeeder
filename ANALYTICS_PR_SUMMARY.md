# Analytics Abstraction Implementation - PR Summary

## Overview

This PR introduces a comprehensive, multi-provider analytics abstraction for OpenFeeder that replaces the single-provider Umami implementation with an extensible adapter pattern supporting Umami, Google Analytics, Plausible, and generic HTTP webhooks.

## Motivation

**Problem:** OpenFeeder previously had hardcoded Umami analytics with limited flexibility.

**Solution:** A generic analytics abstraction that:
1. Supports multiple analytics providers simultaneously
2. Provides a clean adapter pattern for easy extensibility
3. Handles various event types (API requests, searches, sync, bot activity, etc.)
4. Offers flexible configuration (env vars or JSON file)
5. Maintains fire-and-forget behavior with zero request blocking

## Changes

### New Files

#### Core Analytics System (4 files)

1. **`sidecar/analytics_provider.py`** (207 lines)
   - Base `AnalyticsProvider` abstract class
   - Event dataclasses: `APIRequestEvent`, `SearchEvent`, `SyncEvent`, `BotActivityEvent`, `RateLimitEvent`, `ErrorEvent`
   - `ProviderConfig` configuration dataclass
   - Event type enumeration

2. **`sidecar/analytics_service.py`** (435 lines)
   - Main `AnalyticsService` class that routes events to multiple providers
   - Factory methods: `from_env()` and `from_config()`
   - Handles initialization, shutdown, and error handling
   - Fire-and-forget event distribution

#### Provider Adapters (4 files)

3. **`sidecar/adapters_umami.py`** (271 lines)
   - Umami analytics adapter
   - Implements privacy-preserving event tracking
   - Hashes queries and IPs
   - Full support for all event types
   - Configuration: URL, Site ID, API Key

4. **`sidecar/adapters_google_analytics.py`** (247 lines)
   - Google Analytics 4 adapter
   - Uses Measurement Protocol
   - Maps events to GA4 custom events
   - Configuration: Measurement ID, API Secret

5. **`sidecar/adapters_plausible.py`** (217 lines)
   - Plausible analytics adapter
   - Lightweight event format
   - Self-hosted or cloud-hosted support
   - Configuration: Domain/Site ID, optional API Key

6. **`sidecar/adapters_webhook.py`** (267 lines)
   - Generic HTTP webhook provider
   - Custom headers and timeout support
   - Flexible JSON event format
   - Configuration: Webhook URL, optional Bearer token

#### Testing (1 file)

7. **`sidecar/test_analytics.py`** (557 lines)
   - Comprehensive test suite with 35+ test cases
   - Tests for all adapters
   - Service routing and configuration tests
   - Event serialization tests
   - Shutdown and resource cleanup tests

#### Documentation (2 files)

8. **`docs/ANALYTICS.md`** (465 lines)
   - Complete analytics system documentation
   - Configuration examples for all providers
   - Event type reference
   - Privacy & security considerations
   - Troubleshooting guide
   - Custom provider implementation guide

9. **`docs/ANALYTICS_INTEGRATION.md`** (310 lines)
   - Integration guide for main.py
   - Migration path from old system
   - Code examples showing how to use new system
   - Configuration examples
   - Testing and troubleshooting

#### Configuration Example

10. **`sidecar/analytics-example.json`** (29 lines)
    - Example configuration with all providers
    - Shows enable/disable patterns
    - Includes optional parameters

### Modified Files

None required for this PR. The old `analytics.py` and `umami_client.py` continue to work alongside the new system. A future PR will migrate `main.py` to use the new system.

## Architecture

### Provider Pattern

```
AnalyticsProvider (abstract)
├── UmamiAdapter
├── GoogleAnalyticsAdapter
├── PlausibleAdapter
└── WebhookAdapter

AnalyticsService
├── Multiple providers
├── Event routing
└── Configuration management
```

### Event Flow

```
Application
    ↓
AnalyticsService.track_*(event)
    ↓
Async dispatch to all enabled providers
    ↓
Each provider sends event (fire-and-forget)
    ↓
Provider-specific formatting and delivery
```

### Configuration Flow

```
Environment Variables
    ↓ AnalyticsService.from_env()
    ↓
JSON Config File
    ↓ AnalyticsService.from_config()
    ↓
List of AnalyticsProvider instances
    ↓
AnalyticsService instance ready to use
```

## Usage Example

```python
from analytics_service import AnalyticsService
from analytics_provider import APIRequestEvent

# Initialize from environment
analytics = AnalyticsService.from_env()

# Track an event
await analytics.track_api_request(APIRequestEvent(
    hostname="example.com",
    endpoint="/openfeeder",
    method="GET",
    status_code=200,
    duration_ms=45,
    bot_family="anthropic",
))

# Shutdown
await analytics.shutdown()
```

## Configuration Examples

### Environment Variables (Umami)

```bash
ANALYTICS_PROVIDERS=umami
ANALYTICS_UMAMI_URL=https://analytics.snaf.foo
ANALYTICS_UMAMI_SITE_ID=12d3650a-5855-404d-92e9-fb406f8bbeb3
ANALYTICS_UMAMI_API_KEY=optional-key
```

### Multiple Providers

```bash
ANALYTICS_PROVIDERS=umami,webhook,google_analytics
ANALYTICS_UMAMI_URL=https://analytics.snaf.foo
ANALYTICS_UMAMI_SITE_ID=12d3650a-5855-404d-92e9-fb406f8bbeb3
ANALYTICS_WEBHOOK_URL=https://backend.example.com/analytics
ANALYTICS_GA_SITE_ID=G-XXXXXXXXXX
ANALYTICS_GA_API_KEY=secret
```

### JSON Configuration

```json
{
  "providers": [
    {
      "type": "umami",
      "enabled": true,
      "url": "https://analytics.snaf.foo",
      "site_id": "12d3650a-5855-404d-92e9-fb406f8bbeb3"
    },
    {
      "type": "webhook",
      "enabled": true,
      "url": "https://backend.example.com/analytics",
      "extra": {
        "timeout": 10,
        "headers": {"X-Source": "openfeeder"}
      }
    }
  ]
}
```

## Event Types Supported

1. **API Request** (`api.request`)
   - Endpoint, method, status, duration, bot identification

2. **Search** (`api.search`)
   - Query (hashed), results count, duration, filters applied

3. **Sync** (`api.sync`)
   - Added/updated/deleted counts, duration

4. **Bot Activity** (`api.bot`)
   - Bot name/family, endpoint, status, duration

5. **Rate Limit** (`api.ratelimit`)
   - Client IP (hashed), endpoint, limit details, reset time

6. **Error** (`api.error`)
   - Error type, status code, message, endpoint, optional traceback

## Privacy & Security

- **Privacy-First**: Client IPs and queries are hashed in most providers
- **Fire-and-Forget**: Non-blocking async tracking
- **Timeout Protection**: 5-second default timeout prevents hanging
- **Graceful Degradation**: Provider failures don't affect main requests
- **No External Dependencies**: Uses existing httpx client

## Testing

The implementation includes 35+ test cases covering:

```bash
# Run all analytics tests
pytest sidecar/test_analytics.py -v

# Run specific test class
pytest sidecar/test_analytics.py::TestUmamiAdapter -v

# Run with coverage
pytest sidecar/test_analytics.py --cov=analytics_provider --cov=analytics_service --cov=adapters_*
```

Test Coverage:
- ✅ All adapter implementations
- ✅ Service initialization (env vars, JSON config)
- ✅ Event routing to multiple providers
- ✅ Disabled provider filtering
- ✅ Shutdown/resource cleanup
- ✅ Event serialization for each provider
- ✅ Configuration validation

## Integration Path

For `main.py` migration (separate PR):

```python
# OLD CODE (to be replaced)
from umami_client import init_umami_client, shutdown_umami_client
umami_client = init_umami_client(...)
await umami.track_api_request(...)
await shutdown_umami_client()

# NEW CODE
from analytics_service import AnalyticsService
from analytics_provider import APIRequestEvent

analytics = AnalyticsService.from_env()
await analytics.track_api_request(APIRequestEvent(...))
await analytics.shutdown()
```

## Backwards Compatibility

- ✅ Old `analytics.py` and `umami_client.py` still work
- ❌ API is not compatible (new system uses different classes)
- 📋 Migration guide included in `docs/ANALYTICS_INTEGRATION.md`

## Performance Impact

- **Async**: All analytics sends are non-blocking
- **Fire-and-Forget**: Events sent in background
- **Connection Pooling**: HTTP clients reuse connections
- **Timeout**: Default 5-second timeout prevents hanging

Expected overhead: < 1ms per request (non-blocking)

## Files Changed Summary

```
New:  10 files, ~3,800 lines of code
      • 4 adapter implementations
      • 1 analytics service
      • 1 provider interface
      • 1 comprehensive test suite
      • 2 documentation files
      • 1 configuration example

Modified: 0 files (ready for future main.py migration)

Deleted: 0 files (old system left for backwards compatibility)
```

## Known Limitations

1. **Umami Only**: Old `umami_client.py` is still used elsewhere — migration needed
2. **No Built-in Retry**: Failed sends are logged but not retried (fire-and-forget)
3. **No Event Batching**: Events sent individually (could be optimized later)
4. **No Local Buffering**: No fallback if provider is down (events are lost)

These are intentional trade-offs for simplicity and non-blocking behavior.

## Future Enhancements

1. **Event Batching**: Batch events for efficiency
2. **Local Buffering**: Queue events if provider is down
3. **Retry Logic**: Configurable retry with exponential backoff
4. **Metrics**: Built-in prometheus/StatsD support
5. **Custom Transformers**: Pre-process events before sending
6. **Provider Auto-Discovery**: Auto-detect provider from URL scheme

## Deployment Checklist

- [x] Code complete and tested
- [x] Documentation comprehensive
- [x] Example configuration provided
- [x] Integration guide written
- [x] Test suite passing
- [x] No breaking changes to existing code
- [ ] main.py integration (separate PR)
- [ ] Deploy and verify events in analytics
- [ ] Remove old analytics.py after successful migration

## Reviewers

Please check:

1. **Architecture**: Is the adapter pattern clean and extensible?
2. **Privacy**: Are client data (IPs, queries) handled correctly?
3. **Performance**: Will async fire-and-forget work in production?
4. **Tests**: Are edge cases covered?
5. **Documentation**: Is it clear for users?
6. **Configuration**: Is it flexible enough?

## Questions for Review

1. Should we add event buffering/batching for efficiency?
2. Should we support multiple Umami instances simultaneously?
3. Should old `analytics.py` be removed immediately or deprecated first?
4. Should there be a provider health check endpoint?

## Related Issues

- Implements analytics abstraction feature request
- Prepares for multi-provider analytics support
- Enables webhook integration for custom backends
- Supports open-source metrics collection
