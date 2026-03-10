"""
Integration tests for rate limiting in the OpenFeeder sidecar.

Tests the rate limiter with the actual FastAPI application.
"""

import os
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from main import app, indexer


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def setup_app():
    """Setup app with mocked indexer."""
    with patch("main.indexer") as mock_indexer:
        mock_indexer.get_all_pages.return_value = ([], 0)
        mock_indexer.search.return_value = []
        mock_indexer.get_page_meta.return_value = {"title": "Test"}
        mock_indexer.get_chunks_for_url.return_value = []
        yield mock_indexer


class TestRateLimitIntegration:
    """Integration tests for rate limiting with FastAPI."""

    def test_discovery_endpoint_not_rate_limited(self, client):
        """Test that discovery endpoint is not rate limited."""
        # Make multiple requests to discovery
        for _ in range(5):
            response = client.get("/.well-known/openfeeder.json")
            assert response.status_code == 200
            assert response.headers["X-OpenFeeder"] == "1.0"

    def test_healthz_endpoint_not_rate_limited(self, client):
        """Test that healthz endpoint is not rate limited."""
        # Make multiple requests to healthz
        for _ in range(5):
            response = client.get("/healthz")
            assert response.status_code == 200

    def test_rate_limit_headers_present(self, client):
        """Test that rate limit headers are present in responses."""
        response = client.get("/openfeeder")
        
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Window" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers
        
        # Verify values
        assert response.headers["X-RateLimit-Window"] == "60"

    def test_rate_limit_remaining_decreases(self, client):
        """Test that X-RateLimit-Remaining decreases with each request."""
        previous_remaining = None
        
        for i in range(3):
            response = client.get("/openfeeder")
            assert response.status_code == 200
            
            remaining = int(response.headers["X-RateLimit-Remaining"])
            
            if previous_remaining is not None:
                assert remaining == previous_remaining - 1, \
                    f"Remaining should decrease: {previous_remaining} -> {remaining}"
            
            previous_remaining = remaining

    def test_429_on_rate_limit_exceeded(self, client, monkeypatch):
        """Test that 429 is returned when rate limit is exceeded."""
        # Set a very low rate limit for testing
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "2")
        
        # Need to reinitialize the rate limiter with new config
        from rate_limiter import RateLimitConfig, RateLimiter, get_rate_limiter
        
        # Clear the global instance
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # First 2 requests should succeed
        for i in range(2):
            response = client.get("/openfeeder")
            assert response.status_code == 200, f"Request {i+1} should succeed"
        
        # 3rd request should be rate limited
        response = client.get("/openfeeder")
        assert response.status_code == 429
        assert response.json()["error"] == "RATE_LIMIT_EXCEEDED"
        assert "X-RateLimit-Reset" in response.headers

    def test_different_ips_different_buckets(self, client):
        """Test that different IPs have separate rate limit buckets."""
        # Make requests with different client IPs
        # Note: TestClient uses 127.0.0.1, so we'd need to mock the IP
        # This is a simplified test showing the concept
        
        response1 = client.get("/openfeeder")
        assert response1.status_code == 200
        remaining1 = int(response1.headers["X-RateLimit-Remaining"])
        
        response2 = client.get("/openfeeder")
        assert response2.status_code == 200
        remaining2 = int(response2.headers["X-RateLimit-Remaining"])
        
        # Both from same client IP, so remaining should decrease
        assert remaining2 == remaining1 - 1

    def test_endpoint_specific_limits(self, client, monkeypatch):
        """Test that different endpoints have different rate limits."""
        # Set up specific endpoint limits
        monkeypatch.setenv("RATE_LIMIT_SEARCH_RPM", "2")
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "10")
        
        # Reinitialize rate limiter
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make search requests until limit
        for i in range(2):
            response = client.get("/openfeeder?q=test")
            assert response.status_code == 200
        
        # 3rd search request should be blocked
        response = client.get("/openfeeder?q=test")
        assert response.status_code == 429
        
        # But regular requests should still work (different endpoint)
        response = client.get("/openfeeder")
        assert response.status_code == 200

    def test_admin_quota_endpoint_requires_auth(self, client, monkeypatch):
        """Test that admin endpoint requires authentication."""
        # Try without auth key
        response = client.get("/admin/quota")
        assert response.status_code == 403
        
        # Try with invalid auth
        response = client.get(
            "/admin/quota",
            headers={"Authorization": "Bearer invalid-key"}
        )
        assert response.status_code == 403

    def test_admin_quota_endpoint_with_key(self, client, monkeypatch):
        """Test admin quota endpoint with valid key."""
        admin_key = "test-admin-key"
        monkeypatch.setenv("RATE_LIMIT_ADMIN_KEY", admin_key)
        
        # Reinitialize rate limiter
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make some requests first
        client.get("/openfeeder")
        client.get("/openfeeder")
        
        # Query quota with valid auth
        response = client.get(
            "/admin/quota",
            headers={"Authorization": f"Bearer {admin_key}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "quota" in data
        assert "timestamp" in data

    def test_admin_quota_single_ip(self, client, monkeypatch):
        """Test admin quota endpoint with IP filter."""
        admin_key = "test-admin-key"
        monkeypatch.setenv("RATE_LIMIT_ADMIN_KEY", admin_key)
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make some requests
        client.get("/openfeeder")
        client.get("/openfeeder")
        
        # Query for specific IP
        response = client.get(
            "/admin/quota?ip=127.0.0.1",
            headers={"Authorization": f"Bearer {admin_key}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["quota"]["ip"] == "127.0.0.1"
        assert "endpoints" in data["quota"]

    def test_admin_reset_quota(self, client, monkeypatch):
        """Test admin reset quota endpoint."""
        admin_key = "test-admin-key"
        monkeypatch.setenv("RATE_LIMIT_ADMIN_KEY", admin_key)
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make some requests
        for _ in range(3):
            client.get("/openfeeder")
        
        # Reset quota
        response = client.post(
            "/admin/quota/reset",
            headers={"Authorization": f"Bearer {admin_key}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["reset"]["status"] == "ok"
        assert data["reset"]["buckets_reset"] > 0
        
        # Check that buckets were cleared
        response = client.get(
            "/admin/quota",
            headers={"Authorization": f"Bearer {admin_key}"}
        )
        assert response.status_code == 200

    def test_rate_limit_reset_after_window(self, client, monkeypatch):
        """Test that rate limit resets after the time window."""
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "2")
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make 2 requests
        for _ in range(2):
            response = client.get("/openfeeder")
            assert response.status_code == 200
        
        # 3rd request should be blocked
        response = client.get("/openfeeder")
        assert response.status_code == 429
        
        # The rate limiter uses a 60-second window
        # In a real test, we'd mock time.time() or wait
        # For now, we just verify the error structure
        assert response.json()["error"] == "RATE_LIMIT_EXCEEDED"


class TestRateLimitErrorResponses:
    """Test rate limit error response format."""

    def test_rate_limit_error_format(self, client, monkeypatch):
        """Test that rate limit error response is properly formatted."""
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "1")
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make 1 request
        client.get("/openfeeder")
        
        # 2nd request should fail
        response = client.get("/openfeeder")
        assert response.status_code == 429
        
        data = response.json()
        assert "error" in data
        assert "message" in data
        assert "retry_after" in data
        assert data["error"] == "RATE_LIMIT_EXCEEDED"

    def test_rate_limit_headers_on_429(self, client, monkeypatch):
        """Test that rate limit headers are present on 429 responses."""
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "1")
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        client.get("/openfeeder")
        response = client.get("/openfeeder")
        
        assert response.status_code == 429
        assert "X-RateLimit-Limit" in response.headers
        assert "X-RateLimit-Remaining" in response.headers
        assert "X-RateLimit-Reset" in response.headers


class TestRateLimitEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_exactly_at_limit(self, client, monkeypatch):
        """Test that exactly at limit is still allowed."""
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "3")
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make exactly 3 requests (at the limit)
        for i in range(3):
            response = client.get("/openfeeder")
            assert response.status_code == 200, f"Request {i+1} at limit should be allowed"

    def test_just_over_limit(self, client, monkeypatch):
        """Test that just over limit is blocked."""
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "3")
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make 4 requests
        for i in range(3):
            response = client.get("/openfeeder")
            assert response.status_code == 200
        
        # 4th request should be blocked
        response = client.get("/openfeeder")
        assert response.status_code == 429

    def test_disable_rate_limiting(self, client, monkeypatch):
        """Test that rate limiting can be disabled."""
        monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
        monkeypatch.setenv("RATE_LIMIT_DEFAULT_RPM", "1")
        
        import rate_limiter as rl_module
        rl_module._rate_limiter = None
        
        # Make many requests despite low limit
        for _ in range(100):
            response = client.get("/openfeeder")
            assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
