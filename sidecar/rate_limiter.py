"""
Rate Limiting and Quota Management for OpenFeeder Sidecar.

Implements per-IP and per-endpoint rate limiting with sliding window counters.
Uses in-memory storage with automatic cleanup of stale entries.

Environment Variables:
    RATE_LIMIT_ENABLED         — Enable/disable rate limiting (default: true)
    RATE_LIMIT_DEFAULT_RPM     — Default requests per minute for all IPs (default: 100)
    RATE_LIMIT_SEARCH_RPM      — Search endpoint requests per minute (default: 30)
    RATE_LIMIT_DISCOVER_RPM    — Discovery endpoint requests per minute (default: 100)
    RATE_LIMIT_SYNC_RPM        — Sync endpoint requests per minute (default: 60)
    RATE_LIMIT_WEBHOOK_RPM     — Webhook endpoint requests per minute (default: 10)
    RATE_LIMIT_CLEANUP_INTERVAL— Seconds between cleanup of stale entries (default: 300)
    RATE_LIMIT_ADMIN_KEY       — Admin API key for /admin/quota endpoint (optional)
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """Rate limiting configuration."""
    enabled: bool = True
    default_rpm: int = 100
    search_rpm: int = 30
    discover_rpm: int = 100
    sync_rpm: int = 60
    webhook_rpm: int = 10
    cleanup_interval: int = 300  # seconds
    admin_key: Optional[str] = None

    @staticmethod
    def from_env() -> "RateLimitConfig":
        """Load configuration from environment variables."""
        return RateLimitConfig(
            enabled=os.environ.get("RATE_LIMIT_ENABLED", "true").lower() == "true",
            default_rpm=int(os.environ.get("RATE_LIMIT_DEFAULT_RPM", "100")),
            search_rpm=int(os.environ.get("RATE_LIMIT_SEARCH_RPM", "30")),
            discover_rpm=int(os.environ.get("RATE_LIMIT_DISCOVER_RPM", "100")),
            sync_rpm=int(os.environ.get("RATE_LIMIT_SYNC_RPM", "60")),
            webhook_rpm=int(os.environ.get("RATE_LIMIT_WEBHOOK_RPM", "10")),
            cleanup_interval=int(os.environ.get("RATE_LIMIT_CLEANUP_INTERVAL", "300")),
            admin_key=os.environ.get("RATE_LIMIT_ADMIN_KEY"),
        )


@dataclass
class RateLimitInfo:
    """Information about a rate limit bucket."""
    requests: list[float] = field(default_factory=list)
    last_cleanup: float = field(default_factory=time.time)

    def add_request(self) -> None:
        """Record a new request."""
        self.requests.append(time.time())

    def cleanup(self, window_seconds: int = 60) -> None:
        """Remove requests outside the current window."""
        now = time.time()
        self.requests = [ts for ts in self.requests if now - ts < window_seconds]
        self.last_cleanup = now

    def get_count(self, window_seconds: int = 60) -> int:
        """Get request count in the current window."""
        now = time.time()
        return sum(1 for ts in self.requests if now - ts < window_seconds)

    def is_stale(self, stale_threshold: int = 300) -> bool:
        """Check if this bucket is unused."""
        return (time.time() - self.last_cleanup) > stale_threshold


class RateLimiter:
    """
    Sliding window rate limiter for OpenFeeder.
    
    Tracks requests per IP address and per endpoint.
    Uses in-memory storage with automatic cleanup of stale entries.
    """

    def __init__(self, config: RateLimitConfig):
        """Initialize the rate limiter."""
        self.config = config
        self.buckets: dict[str, RateLimitInfo] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

        if self.config.enabled:
            logger.info(
                "Rate limiter enabled: default=%d req/min, search=%d req/min, "
                "sync=%d req/min, webhook=%d req/min",
                self.config.default_rpm,
                self.config.search_rpm,
                self.config.sync_rpm,
                self.config.webhook_rpm,
            )

    async def start(self) -> None:
        """Start the cleanup task."""
        if self.config.enabled and not self._cleanup_task:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("Rate limiter cleanup task started")

    async def stop(self) -> None:
        """Stop the cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            logger.info("Rate limiter cleanup task stopped")

    async def _cleanup_loop(self) -> None:
        """Periodically cleanup stale buckets."""
        try:
            while True:
                await asyncio.sleep(self.config.cleanup_interval)
                await self._cleanup_stale_buckets()
        except asyncio.CancelledError:
            pass

    async def _cleanup_stale_buckets(self) -> None:
        """Remove buckets that haven't been used recently."""
        async with self._lock:
            before = len(self.buckets)
            self.buckets = {
                key: bucket
                for key, bucket in self.buckets.items()
                if not bucket.is_stale(self.config.cleanup_interval)
            }
            after = len(self.buckets)
            if before != after:
                logger.debug("Rate limiter cleanup: removed %d stale buckets", before - after)

    def _get_endpoint_limit(self, endpoint: str) -> int:
        """Get the rate limit (req/min) for an endpoint."""
        # Check for search query (semantic search)
        if "?q=" in endpoint:
            return self.config.search_rpm
        
        # Strip query parameters for further endpoint detection
        base_endpoint = endpoint.split("?")[0]
        
        # Check for specific endpoint patterns
        if ".well-known" in base_endpoint:
            return self.config.discover_rpm
        elif "webhook" in base_endpoint or "update" in base_endpoint:
            return self.config.webhook_rpm
        elif "sync" in base_endpoint:
            return self.config.sync_rpm
        else:
            return self.config.default_rpm

    async def check_rate_limit(
        self, ip: str, endpoint: str
    ) -> tuple[bool, dict[str, str]]:
        """
        Check if a request from an IP on an endpoint is allowed.

        Returns:
            (allowed: bool, headers: dict)
                - headers includes X-RateLimit-* values
        """
        if not self.config.enabled:
            return True, {}

        limit_rpm = self._get_endpoint_limit(endpoint)
        limit_per_second = limit_rpm / 60.0

        async with self._lock:
            bucket_key = f"{ip}:{endpoint}"
            if bucket_key not in self.buckets:
                self.buckets[bucket_key] = RateLimitInfo()

            bucket = self.buckets[bucket_key]
            bucket.cleanup(window_seconds=60)
            current_count = bucket.get_count(window_seconds=60)

            headers = {
                "X-RateLimit-Limit": str(limit_rpm),
                "X-RateLimit-Window": "60",
                "X-RateLimit-Remaining": str(max(0, limit_rpm - current_count)),
            }

            if current_count >= limit_rpm:
                # Calculate reset time (when the oldest request falls out of the window)
                if bucket.requests:
                    oldest = bucket.requests[0]
                    reset_time = int(oldest + 60)
                else:
                    reset_time = int(time.time()) + 60

                headers["X-RateLimit-Reset"] = str(reset_time)
                logger.warning(
                    "Rate limit exceeded: ip=%s endpoint=%s count=%d limit=%d",
                    ip,
                    endpoint,
                    current_count,
                    limit_rpm,
                )
                return False, headers

            # Request allowed, record it
            bucket.add_request()
            headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)

            return True, headers

    async def get_quota(self, ip: Optional[str] = None) -> dict:
        """
        Get current quota status.

        Returns a dict with usage stats for the specified IP or all IPs.
        """
        async with self._lock:
            if ip:
                # Single IP stats
                stats = {}
                for endpoint in ["discover", "search", "sync", "webhook"]:
                    bucket_key = f"{ip}:{endpoint}"
                    if bucket_key in self.buckets:
                        bucket = self.buckets[bucket_key]
                        count = bucket.get_count(window_seconds=60)
                        limit = self._get_endpoint_limit(endpoint)
                        stats[endpoint] = {
                            "count": count,
                            "limit": limit,
                            "remaining": max(0, limit - count),
                            "percent_used": round(100 * count / limit, 1),
                        }
                    else:
                        limit = self._get_endpoint_limit(endpoint)
                        stats[endpoint] = {
                            "count": 0,
                            "limit": limit,
                            "remaining": limit,
                            "percent_used": 0.0,
                        }
                return {
                    "ip": ip,
                    "endpoints": stats,
                }
            else:
                # All IPs summary
                ip_stats = {}
                for bucket_key, bucket in self.buckets.items():
                    ip_part, endpoint_part = bucket_key.rsplit(":", 1)
                    if ip_part not in ip_stats:
                        ip_stats[ip_part] = {}
                    
                    count = bucket.get_count(window_seconds=60)
                    limit = self._get_endpoint_limit(endpoint_part)
                    ip_stats[ip_part][endpoint_part] = {
                        "count": count,
                        "limit": limit,
                        "remaining": max(0, limit - count),
                        "percent_used": round(100 * count / limit, 1),
                    }
                
                return {
                    "total_ips": len(ip_stats),
                    "total_buckets": len(self.buckets),
                    "ips": ip_stats,
                }

    async def reset_quota(self, ip: Optional[str] = None) -> dict:
        """
        Reset rate limit counters for an IP (or all if ip is None).
        Requires admin key.
        """
        async with self._lock:
            if ip:
                # Reset single IP
                removed = 0
                for bucket_key in list(self.buckets.keys()):
                    if bucket_key.startswith(f"{ip}:"):
                        del self.buckets[bucket_key]
                        removed += 1
                return {"status": "ok", "ip": ip, "buckets_reset": removed}
            else:
                # Reset all
                removed = len(self.buckets)
                self.buckets.clear()
                return {"status": "ok", "all_reset": True, "buckets_reset": removed}


# Global instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get or create the global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        config = RateLimitConfig.from_env()
        _rate_limiter = RateLimiter(config)
    return _rate_limiter


async def init_rate_limiter() -> None:
    """Initialize the rate limiter (call during app startup)."""
    limiter = get_rate_limiter()
    await limiter.start()


async def shutdown_rate_limiter() -> None:
    """Shutdown the rate limiter (call during app shutdown)."""
    limiter = get_rate_limiter()
    await limiter.stop()
