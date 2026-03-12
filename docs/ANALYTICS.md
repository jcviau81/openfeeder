# OpenFeeder Analytics System

OpenFeeder provides a flexible, multi-provider analytics system for tracking API usage, search queries, bot activity, and more. It uses an adapter pattern to support multiple analytics platforms simultaneously.

## Overview

The analytics system:
- **Tracks multiple event types**: API requests, searches, sync operations, bot activity, rate limits, and errors
- **Supports multiple providers**: Umami, Google Analytics, Plausible, and generic HTTP webhooks
- **Fire-and-forget**: Events are sent asynchronously without blocking requests
- **Configurable**: Use environment variables or configuration files
- **Extensible**: Add new providers by implementing the `AnalyticsProvider` interface

## Supported Providers

### Umami
Privacy-friendly, open-source analytics platform.

**Configuration:**
```env
ANALYTICS_PROVIDERS=umami
ANALYTICS_UMAMI_URL=https://analytics.snaf.foo
ANALYTICS_UMAMI_SITE_ID=12d3650a-5855-404d-92e9-fb406f8bbeb3
ANALYTICS_UMAMI_API_KEY=optional-api-key
```

**Features:**
- Custom events with structured data
- Privacy-preserving (no PII tracking)
- Self-hosted or cloud-hosted
- Perfect for tracking LLM bot usage

### Google Analytics 4 (GA4)
Industry-standard analytics with powerful reporting.

**Configuration:**
```env
ANALYTICS_PROVIDERS=google_analytics
ANALYTICS_GA_SITE_ID=G-XXXXXXXXXX
ANALYTICS_GA_API_KEY=your-api-secret
```

**Features:**
- Built-in audience segmentation
- Advanced funnel analysis
- Real-time reporting

### Plausible
Lightweight, GDPR-compliant analytics.

**Configuration:**
```env
ANALYTICS_PROVIDERS=plausible
ANALYTICS_PLAUSIBLE_URL=https://plausible.io  # or self-hosted URL
ANALYTICS_PLAUSIBLE_SITE_ID=example.com
ANALYTICS_PLAUSIBLE_API_KEY=optional-api-key
```

**Features:**
- Simple, clean interface
- No cookies or tracking pixels
- Goal tracking support

### Generic Webhook
Send events to any custom HTTP endpoint.

**Configuration:**
```env
ANALYTICS_PROVIDERS=webhook
ANALYTICS_WEBHOOK_URL=https://your-backend.com/analytics
ANALYTICS_WEBHOOK_API_KEY=optional-bearer-token
```

**Event Format:**
```json
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
```

## Event Types

### API Request (`api.request`)
Tracks HTTP requests to OpenFeeder endpoints.

**Data captured:**
- Hostname and endpoint path
- HTTP method and status code
- Response duration (milliseconds)
- User-Agent and bot identification
- Client IP (hashed for privacy where supported)

**Example:**
```python
APIRequestEvent(
    hostname="example.com",
    endpoint="/openfeeder",
    method="GET",
    status_code=200,
    duration_ms=45,
    bot_name="ClaudeBot",
    bot_family="anthropic",
)
```

### Search (`api.search`)
Tracks semantic search queries.

**Data captured:**
- Query hash (for privacy)
- Number of results returned
- Query duration
- Score filters applied
- URL filters applied

**Example:**
```python
SearchEvent(
    hostname="example.com",
    query="machine learning",
    results_count=42,
    duration_ms=120,
    min_score=0.5,
)
```

### Sync (`api.sync`)
Tracks differential sync operations.

**Data captured:**
- Number of items added, updated, deleted
- Sync operation duration
- Total items in the sync batch

**Example:**
```python
SyncEvent(
    hostname="example.com",
    added_count=10,
    updated_count=5,
    deleted_count=2,
    duration_ms=200,
)
```

### Bot Activity (`api.bot`)
Tracks activity from identified LLM bots.

**Data captured:**
- Bot name and family
- Endpoint accessed
- Response status
- Request duration

**Identified bot families:**
- `openai` (GPTBot, ChatGPT-User)
- `anthropic` (ClaudeBot)
- `google` (Googlebot, Google-Extended)
- `perplexity` (PerplexityBot)
- `cohere` (cohere-ai)
- `meta` (FacebookBot)
- `amazon` (Amazonbot)
- `common-crawl` (CCBot)
- `you` (YouBot)
- `bytedance` (Bytespider)

### Rate Limit (`api.ratelimit`)
Tracks rate limit violations.

**Data captured:**
- Client IP (hashed)
- Rate limit threshold
- Remaining requests
- Reset timestamp

### Error (`api.error`)
Tracks API errors.

**Data captured:**
- Error type and message
- HTTP status code
- Endpoint where error occurred
- Stack trace (truncated)

## Configuration

### Environment Variables

Configure providers using comma-separated list:

```bash
# Enable multiple providers
ANALYTICS_PROVIDERS=umami,webhook,google_analytics

# Umami settings
ANALYTICS_UMAMI_URL=https://analytics.example.com
ANALYTICS_UMAMI_SITE_ID=your-site-id
ANALYTICS_UMAMI_API_KEY=your-api-key

# Google Analytics settings
ANALYTICS_GA_SITE_ID=G-XXXXXXXXXX
ANALYTICS_GA_API_KEY=your-api-secret

# Plausible settings
ANALYTICS_PLAUSIBLE_URL=https://plausible.io
ANALYTICS_PLAUSIBLE_SITE_ID=example.com
ANALYTICS_PLAUSIBLE_API_KEY=your-api-key

# Webhook settings
ANALYTICS_WEBHOOK_URL=https://your-backend.com/analytics
ANALYTICS_WEBHOOK_API_KEY=your-webhook-secret
```

### Configuration File

Create `analytics.json`:

```json
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
      "url": "https://your-backend.com/analytics",
      "api_key": "webhook-secret",
      "extra": {
        "headers": {
          "X-Custom-Header": "value"
        },
        "timeout": 10
      }
    },
    {
      "type": "plausible",
      "enabled": true,
      "url": "https://plausible.io",
      "site_id": "example.com"
    },
    {
      "type": "google_analytics",
      "enabled": false,
      "site_id": "G-XXXXXXXXXX",
      "api_key": "api-secret"
    }
  ]
}
```

Load in code:

```python
import json
from analytics_service import AnalyticsService

with open("analytics.json") as f:
    config = json.load(f)

analytics = AnalyticsService.from_config(config)
```

## Usage Examples

### Initialize from Environment

```python
from analytics_service import AnalyticsService

# Load from environment variables
analytics = AnalyticsService.from_env()
```

### Initialize from Configuration

```python
import json
from analytics_service import AnalyticsService

with open("analytics.json") as f:
    config = json.load(f)

analytics = AnalyticsService.from_config(config)
```

### Track Events

```python
from analytics_provider import APIRequestEvent, SearchEvent

# Track an API request
await analytics.track_api_request(APIRequestEvent(
    hostname="example.com",
    endpoint="/openfeeder",
    method="GET",
    status_code=200,
    duration_ms=45,
    bot_family="anthropic",
))

# Track a search
await analytics.track_search(SearchEvent(
    hostname="example.com",
    query="machine learning",
    results_count=42,
    duration_ms=120,
))
```

### Shutdown

```python
await analytics.shutdown()
```

## Integration with FastAPI

In your `main.py`:

```python
from fastapi import FastAPI
from analytics_service import AnalyticsService
from analytics_provider import APIRequestEvent

app = FastAPI()
analytics = None

@app.on_event("startup")
async def startup():
    global analytics
    analytics = AnalyticsService.from_env()

@app.on_event("shutdown")
async def shutdown():
    await analytics.shutdown()

@app.middleware("http")
async def track_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    
    duration_ms = int((time.time() - start_time) * 1000)
    
    await analytics.track_api_request(APIRequestEvent(
        hostname=request.url.hostname,
        endpoint=request.url.path,
        method=request.method,
        status_code=response.status_code,
        duration_ms=duration_ms,
        user_agent=request.headers.get("user-agent", ""),
    ))
    
    return response
```

## Privacy & Data Security

### Privacy Considerations

- **Bot Detection**: User-Agents are parsed to identify LLM bots, but full strings are never sent by default
- **Hashed IPs**: Client IPs are hashed before being sent to analytics (except webhook, which sends them as-is)
- **Query Hashing**: Search queries are hashed for privacy in Umami
- **No Cookies**: OpenFeeder uses server-side tracking only — no client-side cookies

### Data Retention

Each provider has its own data retention policies:

- **Umami**: Configurable (typically 30-90 days)
- **Google Analytics**: 38 months for user-level data
- **Plausible**: Configurable (default 30 days)
- **Webhook**: Depends on your backend

Configure data retention in your provider's dashboard.

## Performance

The analytics system is designed for minimal performance impact:

- **Fire-and-Forget**: All event sends are async and non-blocking
- **Connection Pooling**: HTTP clients reuse connections for efficiency
- **Timeout Protection**: 5-second default timeout prevents hanging requests
- **Graceful Degradation**: Provider failures don't affect main request processing

## Monitoring & Debugging

### Enable Debug Logging

```python
import logging

logging.getLogger("openfeeder.analytics").setLevel(logging.DEBUG)
```

### Check Provider Status

```python
for provider in analytics.providers:
    print(f"{provider.provider_name}: {'enabled' if provider.enabled else 'disabled'}")
```

### Test Provider Connectivity

```python
import asyncio
from analytics_provider import APIRequestEvent

# Send a test event
event = APIRequestEvent(
    hostname="test.example.com",
    endpoint="/test",
    method="GET",
    status_code=200,
    duration_ms=10,
)

await analytics.track_api_request(event)
await asyncio.sleep(1)  # Wait for async send
```

## Troubleshooting

### "Provider disabled (missing URL or site_id)"

Ensure environment variables are set correctly:

```bash
# Check Umami
echo $ANALYTICS_UMAMI_URL
echo $ANALYTICS_UMAMI_SITE_ID

# Check Webhook
echo $ANALYTICS_WEBHOOK_URL
```

### "HTTP 401 Unauthorized"

API keys are incorrect or missing. Verify in your provider's dashboard:
- Umami: Check API key in Settings → API
- Google Analytics: Verify measurement ID and API secret
- Plausible: Check domain verification

### Events not appearing in dashboard

1. Check that events are being tracked (enable debug logging)
2. Verify provider connectivity (check logs for `send failed` warnings)
3. Wait 30+ seconds (some providers have data processing delays)
4. Check provider filters (may be filtering by bot User-Agents)

## Creating Custom Providers

Implement the `AnalyticsProvider` interface:

```python
from analytics_provider import AnalyticsProvider, APIRequestEvent

class CustomProvider(AnalyticsProvider):
    def __init__(self, config_url: str):
        super().__init__("custom", enabled=bool(config_url))
        self.url = config_url
    
    async def track_api_request(self, event: APIRequestEvent) -> None:
        # Send to your custom backend
        pass
    
    async def track_search(self, event) -> None:
        pass
    
    # ... implement other abstract methods ...
    
    async def shutdown(self) -> None:
        pass

# Use with AnalyticsService
from analytics_service import AnalyticsService

custom = CustomProvider("https://your-backend.com/track")
analytics = AnalyticsService(providers=[custom])
```

## References

- [Umami Documentation](https://umami.is/docs)
- [Google Analytics 4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [Plausible Documentation](https://plausible.io/docs)
- [OpenFeeder Specification](../spec/openfeeder-1.0.md)
