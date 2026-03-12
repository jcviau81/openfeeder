# Analytics System Integration Guide

This guide explains how to integrate the new analytics system into your OpenFeeder deployment.

## What's New

The new analytics system replaces the simple Umami-only tracking with a flexible, multi-provider system:

**Old System:**
- Single hardcoded Umami client
- Limited event types
- No support for other analytics platforms

**New System:**
- Adapter pattern supporting multiple providers
- Comprehensive event tracking (API requests, searches, sync, bots, rate limits, errors)
- Configuration via environment variables or JSON file
- Fire-and-forget async tracking
- Easy to add new providers

## Quick Start

### 1. Set Environment Variables

```bash
# Enable the analytics providers you want
ANALYTICS_PROVIDERS=umami,webhook

# Configure Umami (if using)
ANALYTICS_UMAMI_URL=https://analytics.snaf.foo
ANALYTICS_UMAMI_SITE_ID=12d3650a-5855-404d-92e9-fb406f8bbeb3
ANALYTICS_UMAMI_API_KEY=your-optional-api-key

# Configure Webhook (if using)
ANALYTICS_WEBHOOK_URL=https://your-backend.com/analytics
ANALYTICS_WEBHOOK_API_KEY=your-webhook-secret
```

### 2. Update Your Code

In `main.py`, replace this:

```python
# OLD
from umami_client import init_umami_client, get_umami_client, shutdown_umami_client

umami_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... other code ...
    if UMAMI_ENABLED and UMAMI_URL and UMAMI_SITE_ID:
        umami_client = init_umami_client(UMAMI_URL, UMAMI_SITE_ID, UMAMI_API_KEY)
    # ... other code ...
    await shutdown_umami_client()
```

With this:

```python
# NEW
from analytics_service import AnalyticsService

analytics_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global analytics_service
    
    # ... other code ...
    
    # Initialize analytics from environment
    analytics_service = AnalyticsService.from_env()
    
    yield
    
    # ... other code ...
    
    # Shutdown analytics
    if analytics_service:
        await analytics_service.shutdown()
```

### 3. Update Middleware to Use New System

Replace Umami client calls with the new service:

```python
# OLD CODE
umami = get_umami_client()
if umami:
    await umami.track_api_request(
        hostname=SITE_NAME,
        endpoint=endpoint,
        method=method,
        status_code=response.status_code,
        duration_ms=duration_ms,
        user_agent=user_agent,
        bot_name=bot_name,
        bot_family=bot_family,
    )

# NEW CODE
from analytics_provider import APIRequestEvent

await analytics_service.track_api_request(APIRequestEvent(
    hostname=SITE_NAME,
    endpoint=endpoint,
    method=method,
    status_code=response.status_code,
    duration_ms=duration_ms,
    user_agent=user_agent,
    bot_name=bot_name,
    bot_family=bot_family,
))
```

Similar changes for other event types (search, sync, bot_activity, rate_limit, error).

## Migration from Old System

### Old Analytics Classes

The old `analytics.py` (legacy Umami/GA4 class) and `umami_client.py` can coexist with the new system during migration.

### Deprecation Plan

1. **Phase 1 (Current)**: New system available alongside old
2. **Phase 2**: Mark old system as deprecated in docs
3. **Phase 3**: Remove old files in next major version

### Backwards Compatibility

The new system is NOT backwards compatible with the old `UmamiClient` API. Migration is required.

## Configuration Examples

### Umami Only (Original Setup)

```bash
ANALYTICS_PROVIDERS=umami
ANALYTICS_UMAMI_URL=https://analytics.snaf.foo
ANALYTICS_UMAMI_SITE_ID=12d3650a-5855-404d-92e9-fb406f8bbeb3
```

### Multiple Providers

```bash
ANALYTICS_PROVIDERS=umami,webhook,plausible
ANALYTICS_UMAMI_URL=https://analytics.snaf.foo
ANALYTICS_UMAMI_SITE_ID=12d3650a-5855-404d-92e9-fb406f8bbeb3
ANALYTICS_WEBHOOK_URL=https://your-backend.com/analytics
ANALYTICS_PLAUSIBLE_SITE_ID=example.com
```

### From JSON Config File

```python
import json
from analytics_service import AnalyticsService

with open("analytics-example.json") as f:
    config = json.load(f)

analytics_service = AnalyticsService.from_config(config)
```

## New Event Tracking

The new system tracks more events than before. Update your middleware to track:

### 1. API Requests (Already Implemented)

```python
await analytics_service.track_api_request(APIRequestEvent(...))
```

### 2. Search Queries

```python
from analytics_provider import SearchEvent

await analytics_service.track_search(SearchEvent(
    hostname=SITE_NAME,
    query=q,
    results_count=len(results),
    duration_ms=int((time.time() - start_time) * 1000),
    min_score=min_score,
    url_filter=url,
))
```

### 3. Differential Sync

```python
from analytics_provider import SyncEvent

await analytics_service.track_sync(SyncEvent(
    hostname=SITE_NAME,
    added_count=len(added),
    updated_count=len(updated),
    deleted_count=len(deleted),
    duration_ms=int((time.time() - start_time) * 1000),
))
```

### 4. Bot Activity

```python
from analytics_provider import BotActivityEvent

if bot_family != "unknown":
    await analytics_service.track_bot_activity(BotActivityEvent(
        hostname=SITE_NAME,
        bot_name=bot_name,
        bot_family=bot_family,
        endpoint=endpoint,
        status_code=response.status_code,
        duration_ms=duration_ms,
    ))
```

### 5. Rate Limit Violations

```python
from analytics_provider import RateLimitEvent

await analytics_service.track_rate_limit(RateLimitEvent(
    hostname=SITE_NAME,
    client_ip=client_ip,
    endpoint=endpoint,
    limit=limit,
    remaining=remaining,
    reset_timestamp=reset_ts,
))
```

### 6. Errors

```python
from analytics_provider import ErrorEvent

await analytics_service.track_error(ErrorEvent(
    hostname=SITE_NAME,
    error_type="ValueError",
    status_code=400,
    message=str(e),
    endpoint=endpoint,
    traceback=traceback.format_exc(),
))
```

## Testing

Run the tests to ensure everything works:

```bash
pytest test_analytics.py -v
```

## Performance Notes

- All analytics sends are async and fire-and-forget
- No blocking of main requests
- Default 5-second timeout per request
- Connection pooling for efficiency
- Graceful degradation on provider failures

## Troubleshooting

### Events Not Appearing

1. Check `ANALYTICS_PROVIDERS` includes your provider
2. Verify provider credentials (URL, Site ID, API Key)
3. Check logs: `DEBUG openfeeder.analytics`
4. Ensure firewall allows outbound requests

### High Latency

- Unlikely (all tracking is async)
- If issues occur, increase `timeout` in provider config

### Provider Errors

- Check provider-specific logs
- Verify authentication
- Test connectivity manually:

```bash
curl -X POST https://analytics.snaf.foo/api/send \
  -H "Content-Type: application/json" \
  -d '{"type":"event","payload":{"website":"your-site-id",...}}'
```

## Files Changed

### New Files
- `analytics_provider.py` — Base provider interface and event classes
- `adapters_umami.py` — Umami provider implementation
- `adapters_google_analytics.py` — Google Analytics implementation
- `adapters_plausible.py` — Plausible implementation
- `adapters_webhook.py` — Generic webhook provider
- `analytics_service.py` — Main analytics service
- `test_analytics.py` — Comprehensive test suite
- `analytics-example.json` — Example configuration

### Modified Files
- `main.py` — Integrate `AnalyticsService` (see examples above)
- `requirements.txt` — No new dependencies (uses existing httpx)

### Deprecated Files
- `analytics.py` — Old legacy system (can be removed after migration)
- `umami_client.py` — Old Umami-specific client (can be removed after migration)

## Next Steps

1. Read `docs/ANALYTICS.md` for complete documentation
2. Update `main.py` with the new integration code
3. Test with `pytest test_analytics.py`
4. Deploy and verify events are appearing in your analytics provider
5. Remove old `analytics.py` and `umami_client.py` in next release

## Support

For issues or questions:

1. Check `docs/ANALYTICS.md` troubleshooting section
2. Review test cases in `test_analytics.py` for usage examples
3. Check provider-specific documentation
4. Enable debug logging to diagnose issues
