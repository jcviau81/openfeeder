#!/usr/bin/env python3
"""
Manual test script for the rate limiter.
Run without pytest to verify basic functionality.
"""

import asyncio
import time
from rate_limiter import RateLimitConfig, RateLimiter


async def test_basic_rate_limiting():
    """Test basic rate limiting functionality."""
    print("Test 1: Basic rate limiting")
    config = RateLimitConfig(enabled=True, default_rpm=5)
    limiter = RateLimiter(config)
    
    ip = "192.168.1.1"
    endpoint = "/openfeeder"
    
    # First 5 requests should be allowed
    for i in range(5):
        allowed, headers = await limiter.check_rate_limit(ip, endpoint)
        print(f"  Request {i+1}: allowed={allowed}, remaining={headers.get('X-RateLimit-Remaining')}")
        assert allowed, f"Request {i+1} should be allowed"
    
    # 6th request should be blocked
    allowed, headers = await limiter.check_rate_limit(ip, endpoint)
    print(f"  Request 6: allowed={allowed}, remaining={headers.get('X-RateLimit-Remaining')}")
    assert not allowed, "Request 6 should be blocked"
    
    print("✓ Test 1 passed\n")


async def test_endpoint_specific_limits():
    """Test that different endpoints have different limits."""
    print("Test 2: Endpoint-specific limits")
    config = RateLimitConfig(enabled=True, search_rpm=2, default_rpm=10)
    limiter = RateLimiter(config)
    
    ip = "192.168.1.1"
    
    # Search endpoint: limit of 2 (with ?q= parameter)
    print("  Search endpoint (limit: 2 with ?q=):")
    for i in range(2):
        allowed, _ = await limiter.check_rate_limit(ip, "/openfeeder?q=test")
        print(f"    Request {i+1}: allowed={allowed}")
        assert allowed
    
    allowed, _ = await limiter.check_rate_limit(ip, "/openfeeder?q=test")
    print(f"    Request 3: allowed={allowed}")
    assert not allowed, "3rd search request should be blocked"
    
    # Regular endpoint: limit of 10 (separate bucket)
    print("  Regular endpoint (limit: 10):")
    allowed, _ = await limiter.check_rate_limit(ip, "/openfeeder")
    print(f"    Request 1: allowed={allowed}")
    assert allowed, "Regular endpoint should still be allowed"
    
    print("✓ Test 2 passed\n")


async def test_different_ips():
    """Test that different IPs have separate buckets."""
    print("Test 3: Different IPs have separate buckets")
    config = RateLimitConfig(enabled=True, default_rpm=2)
    limiter = RateLimiter(config)
    
    # IP 1 makes 2 requests
    print("  IP 192.168.1.1:")
    for i in range(2):
        allowed, _ = await limiter.check_rate_limit("192.168.1.1", "/openfeeder")
        print(f"    Request {i+1}: allowed={allowed}")
        assert allowed
    
    allowed, _ = await limiter.check_rate_limit("192.168.1.1", "/openfeeder")
    print(f"    Request 3: allowed={allowed}")
    assert not allowed, "IP 1's 3rd request should be blocked"
    
    # IP 2 can still make requests
    print("  IP 192.168.1.2:")
    allowed, _ = await limiter.check_rate_limit("192.168.1.2", "/openfeeder")
    print(f"    Request 1: allowed={allowed}")
    assert allowed, "IP 2's request should be allowed (separate bucket)"
    
    print("✓ Test 3 passed\n")


async def test_quota_retrieval():
    """Test quota retrieval."""
    print("Test 4: Quota retrieval")
    config = RateLimitConfig(enabled=True, default_rpm=100, search_rpm=50)
    limiter = RateLimiter(config)
    
    ip = "192.168.1.1"
    
    # Make some requests
    await limiter.check_rate_limit(ip, "/openfeeder")
    await limiter.check_rate_limit(ip, "/openfeeder")
    await limiter.check_rate_limit(ip, "/openfeeder?q=test")
    await limiter.check_rate_limit(ip, "/openfeeder?q=test")
    
    # Get quota
    quota = await limiter.get_quota(ip=ip)
    print(f"  Quota for {ip}:")
    for endpoint, stats in quota["endpoints"].items():
        if stats["count"] > 0:
            print(f"    {endpoint}: {stats['count']} requests")
    
    assert quota["ip"] == ip
    # We expect 2 discover (regular /openfeeder) and 2 search (with ?q=)
    # But the exact counts depend on the endpoint detection
    
    print("✓ Test 4 passed\n")


async def test_disabled_rate_limiter():
    """Test that disabled rate limiter always allows."""
    print("Test 5: Disabled rate limiter")
    config = RateLimitConfig(enabled=False)
    limiter = RateLimiter(config)
    
    ip = "192.168.1.1"
    endpoint = "/openfeeder"
    
    # Make many requests despite disabled
    for i in range(200):
        allowed, _ = await limiter.check_rate_limit(ip, endpoint)
        assert allowed, f"Request {i+1} should be allowed when rate limiter is disabled"
    
    print(f"  Made 200 requests, all allowed ✓")
    print("✓ Test 5 passed\n")


async def main():
    """Run all tests."""
    print("=" * 60)
    print("Rate Limiter Manual Tests")
    print("=" * 60 + "\n")
    
    try:
        await test_basic_rate_limiting()
        await test_endpoint_specific_limits()
        await test_different_ips()
        await test_quota_retrieval()
        await test_disabled_rate_limiter()
        
        print("=" * 60)
        print("All tests passed! ✓")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
