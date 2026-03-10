"""
Unit tests for the rate limiter module.
"""

import asyncio
import time
import pytest

from rate_limiter import RateLimitConfig, RateLimiter, RateLimitInfo


class TestRateLimitInfo:
    """Tests for the RateLimitInfo class."""

    def test_add_request(self):
        """Test recording a request."""
        info = RateLimitInfo()
        assert len(info.requests) == 0
        
        info.add_request()
        assert len(info.requests) == 1
        
        info.add_request()
        assert len(info.requests) == 2

    def test_cleanup_removes_old_requests(self):
        """Test that cleanup removes requests outside the window."""
        info = RateLimitInfo()
        
        # Add a request
        info.requests = [time.time() - 120]  # 2 minutes ago
        
        # Cleanup with 60-second window
        info.cleanup(window_seconds=60)
        
        # Old request should be removed
        assert len(info.requests) == 0

    def test_cleanup_keeps_recent_requests(self):
        """Test that cleanup keeps requests within the window."""
        info = RateLimitInfo()
        now = time.time()
        
        # Add requests at various times
        info.requests = [
            now - 30,  # 30 seconds ago
            now - 10,  # 10 seconds ago
            now,       # now
        ]
        
        info.cleanup(window_seconds=60)
        
        # All should be kept
        assert len(info.requests) == 3

    def test_get_count(self):
        """Test counting requests in a window."""
        info = RateLimitInfo()
        now = time.time()
        
        info.requests = [
            now - 120,  # Outside window
            now - 30,   # Inside window
            now - 10,   # Inside window
            now,        # Inside window
        ]
        
        count = info.get_count(window_seconds=60)
        assert count == 3

    def test_is_stale(self):
        """Test staleness detection."""
        info = RateLimitInfo()
        
        # Fresh bucket
        assert not info.is_stale(stale_threshold=300)
        
        # Manually set old cleanup time
        info.last_cleanup = time.time() - 400
        assert info.is_stale(stale_threshold=300)


class TestRateLimiterConfig:
    """Tests for RateLimitConfig."""

    def test_from_env_default(self, monkeypatch):
        """Test loading config with defaults."""
        # Clear any existing env vars
        monkeypatch.delenv("RATE_LIMIT_ENABLED", raising=False)
        monkeypatch.delenv("RATE_LIMIT_DEFAULT_RPM", raising=False)
        
        config = RateLimitConfig.from_env()
        
        assert config.enabled is True
        assert config.default_rpm == 100
        assert config.search_rpm == 30
        assert config.webhook_rpm == 10

    def test_from_env_custom(self, monkeypatch):
        """Test loading config with custom values."""
        monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "200")
        monkeypatch.setenv("RATE_LIMIT_ADMIN_KEY", "test-key-123")
        
        config = RateLimitConfig.from_env()
        
        assert config.enabled is False
        assert config.default_rpm == 200
        assert config.admin_key == "test-key-123"


class TestRateLimiter:
    """Tests for the RateLimiter class."""

    @pytest.mark.asyncio
    async def test_rate_limiter_init(self):
        """Test initializing the rate limiter."""
        config = RateLimitConfig(enabled=True, default_rpm=100)
        limiter = RateLimiter(config)
        
        assert limiter.config == config
        assert len(limiter.buckets) == 0

    @pytest.mark.asyncio
    async def test_disabled_rate_limiter_always_allows(self):
        """Test that disabled rate limiter always allows requests."""
        config = RateLimitConfig(enabled=False)
        limiter = RateLimiter(config)
        
        for _ in range(200):
            allowed, headers = await limiter.check_rate_limit("192.168.1.1", "/openfeeder")
            assert allowed is True

    @pytest.mark.asyncio
    async def test_rate_limit_blocks_after_threshold(self):
        """Test that rate limiter blocks after exceeding limit."""
        config = RateLimitConfig(enabled=True, default_rpm=5)  # Very low limit
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        endpoint = "/openfeeder"
        
        # First 5 requests should be allowed
        for i in range(5):
            allowed, headers = await limiter.check_rate_limit(ip, endpoint)
            assert allowed is True, f"Request {i+1} should be allowed"
        
        # 6th request should be blocked
        allowed, headers = await limiter.check_rate_limit(ip, endpoint)
        assert allowed is False, "6th request should be blocked"
        assert "X-RateLimit-Reset" in headers

    @pytest.mark.asyncio
    async def test_endpoint_specific_limits(self):
        """Test that different endpoints have different limits."""
        config = RateLimitConfig(
            enabled=True,
            search_rpm=2,
            discover_rpm=10,
        )
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        
        # Search endpoint has limit of 2
        for i in range(2):
            allowed, _ = await limiter.check_rate_limit(ip, "/openfeeder?q=test")
            assert allowed is True
        
        allowed, _ = await limiter.check_rate_limit(ip, "/openfeeder?q=test")
        assert allowed is False  # 3rd request blocked
        
        # Discovery endpoint has limit of 10, should have its own bucket
        for i in range(10):
            allowed, _ = await limiter.check_rate_limit(ip, "/.well-known/openfeeder.json")
            assert allowed is True

    @pytest.mark.asyncio
    async def test_different_ips_separate_buckets(self):
        """Test that different IPs have separate rate limit buckets."""
        config = RateLimitConfig(enabled=True, default_rpm=3)
        limiter = RateLimiter(config)
        
        endpoint = "/openfeeder"
        
        # IP 1 makes 3 requests
        for _ in range(3):
            allowed, _ = await limiter.check_rate_limit("192.168.1.1", endpoint)
            assert allowed is True
        
        # IP 1's 4th request is blocked
        allowed, _ = await limiter.check_rate_limit("192.168.1.1", endpoint)
        assert allowed is False
        
        # IP 2 can still make requests (separate bucket)
        allowed, _ = await limiter.check_rate_limit("192.168.1.2", endpoint)
        assert allowed is True

    @pytest.mark.asyncio
    async def test_rate_limit_headers(self):
        """Test that rate limit headers are included in responses."""
        config = RateLimitConfig(enabled=True, default_rpm=10)
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        endpoint = "/openfeeder"
        
        allowed, headers = await limiter.check_rate_limit(ip, endpoint)
        
        assert "X-RateLimit-Limit" in headers
        assert "X-RateLimit-Window" in headers
        assert "X-RateLimit-Remaining" in headers
        assert "X-RateLimit-Reset" in headers
        
        assert headers["X-RateLimit-Limit"] == "10"
        assert headers["X-RateLimit-Window"] == "60"
        assert headers["X-RateLimit-Remaining"] == "9"

    @pytest.mark.asyncio
    async def test_remaining_count_decreases(self):
        """Test that remaining count decreases with each request."""
        config = RateLimitConfig(enabled=True, default_rpm=10)
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        endpoint = "/openfeeder"
        
        for i in range(1, 4):
            allowed, headers = await limiter.check_rate_limit(ip, endpoint)
            assert allowed is True
            expected_remaining = 10 - i
            assert int(headers["X-RateLimit-Remaining"]) == expected_remaining

    @pytest.mark.asyncio
    async def test_get_quota_single_ip(self):
        """Test getting quota for a specific IP."""
        config = RateLimitConfig(enabled=True, default_rpm=10, search_rpm=5)
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        
        # Make some requests
        await limiter.check_rate_limit(ip, "/openfeeder")
        await limiter.check_rate_limit(ip, "/openfeeder?q=test")
        await limiter.check_rate_limit(ip, "/openfeeder?q=test")
        
        quota = await limiter.get_quota(ip=ip)
        
        assert quota["ip"] == ip
        assert "endpoints" in quota
        assert quota["endpoints"]["discover"]["count"] == 1
        assert quota["endpoints"]["search"]["count"] == 2

    @pytest.mark.asyncio
    async def test_get_quota_all_ips(self):
        """Test getting quota for all IPs."""
        config = RateLimitConfig(enabled=True, default_rpm=10)
        limiter = RateLimiter(config)
        
        # Make requests from different IPs
        await limiter.check_rate_limit("192.168.1.1", "/openfeeder")
        await limiter.check_rate_limit("192.168.1.2", "/openfeeder")
        await limiter.check_rate_limit("192.168.1.2", "/openfeeder")
        
        quota = await limiter.get_quota(ip=None)
        
        assert quota["total_ips"] == 2
        assert "192.168.1.1" in quota["ips"]
        assert "192.168.1.2" in quota["ips"]

    @pytest.mark.asyncio
    async def test_reset_quota_single_ip(self):
        """Test resetting quota for a specific IP."""
        config = RateLimitConfig(enabled=True, default_rpm=10)
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        
        # Make requests
        await limiter.check_rate_limit(ip, "/openfeeder")
        await limiter.check_rate_limit(ip, "/openfeeder")
        
        assert len(limiter.buckets) > 0
        
        # Reset
        result = await limiter.reset_quota(ip=ip)
        
        assert result["status"] == "ok"
        assert result["ip"] == ip
        assert result["buckets_reset"] > 0

    @pytest.mark.asyncio
    async def test_reset_quota_all(self):
        """Test resetting quota for all IPs."""
        config = RateLimitConfig(enabled=True, default_rpm=10)
        limiter = RateLimiter(config)
        
        # Make requests from different IPs
        await limiter.check_rate_limit("192.168.1.1", "/openfeeder")
        await limiter.check_rate_limit("192.168.1.2", "/openfeeder")
        
        assert len(limiter.buckets) > 0
        
        # Reset all
        result = await limiter.reset_quota(ip=None)
        
        assert result["status"] == "ok"
        assert result["all_reset"] is True
        assert len(limiter.buckets) == 0

    @pytest.mark.asyncio
    async def test_cleanup_task(self):
        """Test that cleanup task removes stale buckets."""
        config = RateLimitConfig(
            enabled=True,
            default_rpm=10,
            cleanup_interval=1,  # Fast cleanup for testing
        )
        limiter = RateLimiter(config)
        
        # Start cleanup task
        await limiter.start()
        
        try:
            # Make a request to create a bucket
            await limiter.check_rate_limit("192.168.1.1", "/openfeeder")
            assert len(limiter.buckets) > 0
            
            # Manually mark bucket as old
            for bucket in limiter.buckets.values():
                bucket.last_cleanup = time.time() - 1000
            
            # Wait for cleanup to run
            await asyncio.sleep(1.5)
            
            # Buckets should be cleaned up
            assert len(limiter.buckets) == 0
        finally:
            await limiter.stop()

    @pytest.mark.asyncio
    async def test_start_stop_cleanup_task(self):
        """Test starting and stopping the cleanup task."""
        config = RateLimitConfig(enabled=True, cleanup_interval=300)
        limiter = RateLimiter(config)
        
        assert limiter._cleanup_task is None
        
        await limiter.start()
        assert limiter._cleanup_task is not None
        assert not limiter._cleanup_task.done()
        
        await limiter.stop()
        assert limiter._cleanup_task.cancelled()


class TestRateLimiterConcurrency:
    """Tests for concurrent access to rate limiter."""

    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test that concurrent requests are handled correctly."""
        config = RateLimitConfig(enabled=True, default_rpm=100)
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        endpoint = "/openfeeder"
        
        # Make 50 concurrent requests
        tasks = [
            limiter.check_rate_limit(ip, endpoint)
            for _ in range(50)
        ]
        results = await asyncio.gather(*tasks)
        
        # First 100 should be allowed, rest blocked
        allowed_count = sum(1 for allowed, _ in results if allowed)
        assert allowed_count == 50  # All 50 concurrent requests allowed

    @pytest.mark.asyncio
    async def test_concurrent_different_endpoints(self):
        """Test concurrent requests to different endpoints."""
        config = RateLimitConfig(
            enabled=True,
            search_rpm=5,
            discover_rpm=100,
        )
        limiter = RateLimiter(config)
        
        ip = "192.168.1.1"
        
        # Mix of search and discover requests
        tasks = []
        for i in range(10):
            if i % 2 == 0:
                tasks.append(limiter.check_rate_limit(ip, "/openfeeder?q=test"))
            else:
                tasks.append(limiter.check_rate_limit(ip, "/.well-known/openfeeder.json"))
        
        results = await asyncio.gather(*tasks)
        
        # Both should be allowed (limits not exceeded)
        assert all(allowed for allowed, _ in results)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
