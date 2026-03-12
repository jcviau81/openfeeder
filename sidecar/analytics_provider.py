"""
Analytics Provider Base Class & Configuration

Defines the interface that all analytics providers must implement and
handles configuration management for multiple providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional

# Bot detection patterns
BOT_FAMILIES = {
    "GPTBot": "openai",
    "ChatGPT-User": "openai",
    "ClaudeBot": "anthropic",
    "anthropic-ai": "anthropic",
    "PerplexityBot": "perplexity",
    "Google-Extended": "google",
    "Googlebot": "google",
    "CCBot": "common-crawl",
    "cohere-ai": "cohere",
    "FacebookBot": "meta",
    "Amazonbot": "amazon",
    "YouBot": "you",
    "Bytespider": "bytedance",
}


def detect_bot(user_agent: str) -> tuple[str, str]:
    """Return (bot_name, bot_family) from a User-Agent string."""
    if not user_agent:
        return "unknown", "unknown"
    ua_lower = user_agent.lower()
    for pattern, family in BOT_FAMILIES.items():
        if pattern.lower() in ua_lower:
            return pattern, family
    return "human-or-unknown", "unknown"


class EventType(Enum):
    """Types of events that can be tracked."""
    API_REQUEST = "api.request"
    SEARCH = "api.search"
    SYNC = "api.sync"
    BOT_ACTIVITY = "api.bot"
    RATE_LIMIT = "api.ratelimit"
    ERROR = "api.error"


@dataclass
class APIRequestEvent:
    """
    Represents an API request event.
    
    Fields:
        hostname: Site hostname
        endpoint: API endpoint path
        method: HTTP method (GET, POST, etc.)
        status_code: HTTP response status code
        duration_ms: Response time in milliseconds
        user_agent: Full User-Agent string (optional)
        bot_name: Identified bot name (e.g., ClaudeBot)
        bot_family: Bot family (e.g., anthropic, openai)
        query_term: Search query if this was a search request (optional)
        page_number: Page number for paginated requests (optional)
        results_count: Number of results/items returned (optional)
        total_pages: Total pages available for paginated results (optional)
        has_filters: Whether filters were applied to the request (optional)
        request_type: Type of request - "search", "index", "single", "stats" (optional)
    """
    hostname: str
    endpoint: str
    method: str
    status_code: int
    duration_ms: int
    user_agent: str = ""
    bot_name: str = ""
    bot_family: str = ""
    query_term: Optional[str] = None
    page_number: Optional[int] = None
    results_count: Optional[int] = None
    total_pages: Optional[int] = None
    has_filters: Optional[bool] = None
    request_type: Optional[str] = None


@dataclass
class SearchEvent:
    """
    Represents a search query event.
    
    Fields:
        hostname: Site hostname
        query: Search query string
        results_count: Number of results returned
        duration_ms: Search duration in milliseconds
        min_score: Score filter applied (optional)
        url_filter: Optional URL filter applied
    """
    hostname: str
    query: str
    results_count: int
    duration_ms: int
    min_score: Optional[float] = None
    url_filter: Optional[str] = None


@dataclass
class SyncEvent:
    """
    Represents a differential sync event.
    
    Fields:
        hostname: Site hostname
        added_count: Number of items added
        updated_count: Number of items updated
        deleted_count: Number of items deleted
        duration_ms: Sync duration in milliseconds
    """
    hostname: str
    added_count: int
    updated_count: int
    deleted_count: int
    duration_ms: int


@dataclass
class BotActivityEvent:
    """
    Represents activity from an identified bot.
    
    Fields:
        hostname: Site hostname
        bot_name: Bot identifier (e.g., ClaudeBot)
        bot_family: Bot family (e.g., anthropic)
        endpoint: API endpoint accessed
        status_code: Response status
        duration_ms: Response time in milliseconds
    """
    hostname: str
    bot_name: str
    bot_family: str
    endpoint: str
    status_code: int
    duration_ms: int


@dataclass
class RateLimitEvent:
    """
    Represents a rate limit violation.
    
    Fields:
        hostname: Site hostname
        client_ip: Client IP address
        endpoint: API endpoint that was rate limited
        limit: Rate limit per window
        remaining: Remaining requests
        reset_timestamp: Unix timestamp when limit resets
    """
    hostname: str
    client_ip: str
    endpoint: str
    limit: int
    remaining: int
    reset_timestamp: int


@dataclass
class ErrorEvent:
    """
    Represents an API error.
    
    Fields:
        hostname: Site hostname
        error_type: Error class name (e.g., ValueError)
        status_code: HTTP status code returned
        message: Error message
        endpoint: Endpoint where error occurred (optional)
        traceback: Optional traceback for debugging
    """
    hostname: str
    error_type: str
    status_code: int
    message: str
    endpoint: str = ""
    traceback: str = ""


class AnalyticsProvider(ABC):
    """
    Base class for all analytics providers.
    
    Subclasses must implement all abstract methods.
    """

    def __init__(self, provider_name: str, enabled: bool = True):
        """
        Initialize the provider.
        
        Args:
            provider_name: Name of the provider (e.g., 'umami', 'google_analytics')
            enabled: Whether this provider is enabled
        """
        self.provider_name = provider_name
        self.enabled = enabled

    @abstractmethod
    async def track_api_request(self, event: APIRequestEvent) -> None:
        """Track an API request event."""
        pass

    @abstractmethod
    async def track_search(self, event: SearchEvent) -> None:
        """Track a search event."""
        pass

    @abstractmethod
    async def track_sync(self, event: SyncEvent) -> None:
        """Track a differential sync event."""
        pass

    @abstractmethod
    async def track_bot_activity(self, event: BotActivityEvent) -> None:
        """Track activity from an identified bot."""
        pass

    @abstractmethod
    async def track_rate_limit(self, event: RateLimitEvent) -> None:
        """Track a rate limit violation."""
        pass

    @abstractmethod
    async def track_error(self, event: ErrorEvent) -> None:
        """Track an API error."""
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        """Cleanup resources when shutting down."""
        pass


@dataclass
class ProviderConfig:
    """Configuration for a single analytics provider."""
    
    provider_type: str  # "umami", "google_analytics", "plausible", "webhook"
    enabled: bool = True
    url: Optional[str] = None
    site_id: Optional[str] = None
    api_key: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None  # Provider-specific options
    
    def __post_init__(self):
        if self.extra is None:
            self.extra = {}
