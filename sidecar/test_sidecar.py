#!/usr/bin/env python3
"""
OpenFeeder Sidecar — Unit + Integration Tests

Unit tests exercise local functions (no sidecar needed).
Integration tests hit a running sidecar (skipped if not reachable).

Usage:
    python3 sidecar/test_sidecar.py
    SIDECAR_URL=http://localhost:8080 python3 sidecar/test_sidecar.py
"""

from __future__ import annotations

import os
import sys

# Ensure sidecar modules are importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ── Test runner ──────────────────────────────────────────────────────────────

passed = 0
failed = 0
skipped = 0


def check(condition: bool, label: str) -> None:
    global passed, failed
    if condition:
        print(f"  PASS  {label}")
        passed += 1
    else:
        print(f"  FAIL  {label}")
        failed += 1


def skip(label: str) -> None:
    global skipped
    print(f"  SKIP  {label}")
    skipped += 1


# ═══════════════════════════════════════════════════════════════════════════
# Unit Tests (no sidecar needed)
# ═══════════════════════════════════════════════════════════════════════════

def test_detect_bot() -> None:
    """Test detect_bot() from analytics.py."""
    print("\nUnit: detect_bot()")

    from analytics import detect_bot

    name, family = detect_bot("GPTBot/1.0")
    check(name == "GPTBot", 'GPTBot/1.0 → name="GPTBot"')
    check(family == "openai", 'GPTBot/1.0 → family="openai"')

    name, family = detect_bot("ClaudeBot")
    check(name == "ClaudeBot", 'ClaudeBot → name="ClaudeBot"')
    check(family == "anthropic", 'ClaudeBot → family="anthropic"')

    name, family = detect_bot("Mozilla/5.0 (human)")
    check(name == "human-or-unknown", 'human UA → name="human-or-unknown"')
    check(family == "unknown", 'human UA → family="unknown"')

    name, family = detect_bot("")
    check(name == "unknown", 'empty → name="unknown"')
    check(family == "unknown", 'empty → family="unknown"')

    name, family = detect_bot("PerplexityBot/1.0")
    check(name == "PerplexityBot", 'PerplexityBot/1.0 → name="PerplexityBot"')
    check(family == "perplexity", 'PerplexityBot/1.0 → family="perplexity"')


def test_parse_iso_duration() -> None:
    """Test parse_iso_duration() from chunker.py."""
    print("\nUnit: parse_iso_duration()")

    from chunker import parse_iso_duration

    check(parse_iso_duration("PT25M") == "25 min", 'PT25M → "25 min"')
    check(parse_iso_duration("PT1H30M") == "1h 30 min", 'PT1H30M → "1h 30 min"')
    check(parse_iso_duration("P1DT2H") == "1d 2h", 'P1DT2H → "1d 2h"')

    # Edge case: PT0S — no parts match the "if days/hours/minutes/seconds" guards,
    # so it returns the raw duration string.
    result = parse_iso_duration("PT0S")
    check(result == "" or result == "0s" or result == "PT0S", f'PT0S → "{result}" (edge case)')

    # None / empty → no crash
    check(parse_iso_duration(None) == "", "None → empty string")
    check(parse_iso_duration("") == "", 'empty → empty string')


def test_sync_token() -> None:
    """Test sync_token encode/decode round-trip."""
    print("\nUnit: sync_token encode/decode")

    from sync_utils import encode_sync_token, decode_sync_token, parse_since

    # Encode a known timestamp
    iso = "2026-02-20T00:00:00+00:00"
    token = encode_sync_token(iso)
    check(isinstance(token, str) and len(token) > 0, "encode returns non-empty string")

    # Decode it back
    ts = decode_sync_token(token)
    check(ts is not None, "decode returns a timestamp")

    import base64, json
    payload = json.loads(base64.b64decode(token))
    check(payload.get("t") == iso, 'token payload has correct "t" field')

    # parse_since with RFC 3339
    ts_rfc = parse_since("2026-02-20T00:00:00Z")
    check(ts_rfc is not None and ts_rfc > 0, "parse_since handles RFC 3339")

    # parse_since with sync_token
    ts_token = parse_since(token)
    check(ts_token is not None and ts_token > 0, "parse_since handles sync_token")

    # parse_since with garbage
    ts_bad = parse_since("not-a-date-or-token")
    check(ts_bad is None, "parse_since returns None for garbage input")


def test_tombstone_helpers() -> None:
    """Test tombstone helper functions."""
    print("\nUnit: tombstone helpers")

    import sync_utils
    import tempfile, os

    # Override tombstone path for testing
    tmp = tempfile.mkdtemp()
    test_path = os.path.join(tmp, "tombstones.json")
    sync_utils.TOMBSTONE_PATH = test_path
    sync_utils._tombstones = {}

    # Add a tombstone
    sync_utils.add_tombstone("https://example.com/deleted-page", test_path)
    check(len(sync_utils._tombstones) == 1, "tombstone added")

    # Get tombstones since a past date
    results = sync_utils.get_tombstones_since(0.0)
    check(len(results) == 1, "get_tombstones_since returns 1 result")
    check(results[0]["url"] == "https://example.com/deleted-page", "tombstone URL matches")

    # Get tombstones since a future date → empty
    import time
    results_future = sync_utils.get_tombstones_since(time.time() + 86400)
    check(len(results_future) == 0, "get_tombstones_since returns 0 for future date")

    # Verify file was written
    check(os.path.exists(test_path), "tombstones file created")

    # Load from disk
    sync_utils._tombstones = {}
    sync_utils._load_tombstones(test_path)
    check(len(sync_utils._tombstones) == 1, "tombstones loaded from disk")

    # Cleanup
    os.remove(test_path)
    os.rmdir(tmp)


# ═══════════════════════════════════════════════════════════════════════════
# Integration Tests (skip if sidecar not reachable)
# ═══════════════════════════════════════════════════════════════════════════

def sidecar_reachable(base_url: str) -> bool:
    """Check if the sidecar is reachable."""
    try:
        import httpx
        r = httpx.get(f"{base_url}/healthz", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def test_integration(base_url: str) -> None:
    """Run integration tests against a live sidecar."""
    import httpx

    print(f"\nIntegration tests against {base_url}")

    # GET /healthz
    print("\nIntegration: GET /healthz")
    r = httpx.get(f"{base_url}/healthz", timeout=10)
    check(r.status_code == 200, "healthz returns 200")

    # GET /.well-known/openfeeder.json
    print("\nIntegration: GET /.well-known/openfeeder.json")
    r = httpx.get(f"{base_url}/.well-known/openfeeder.json", timeout=10)
    check(r.status_code == 200, "discovery returns 200")
    data = r.json()
    check("feed" in data and "endpoint" in data["feed"], "has feed.endpoint")

    # GET /openfeeder (index)
    print("\nIntegration: GET /openfeeder")
    r = httpx.get(f"{base_url}/openfeeder", timeout=10)
    check(r.status_code == 200, "index returns 200")
    data = r.json()
    check("schema" in data, "has schema field")
    check("items" in data, "has items field")

    # GET /openfeeder?q=test (search)
    print("\nIntegration: GET /openfeeder?q=test")
    r = httpx.get(f"{base_url}/openfeeder", params={"q": "test"}, timeout=10)
    if r.status_code == 200:
        data = r.json()
        check("chunks" in data or "items" in data, "search has chunks or items")
    elif r.status_code == 404:
        # No results — valid response
        check(True, "search returns 404 (no results — valid)")
    else:
        check(False, f"search returned unexpected status {r.status_code}")

    # GET /openfeeder?q=test&min_score=0.99 → empty or 404
    print("\nIntegration: GET /openfeeder?q=test&min_score=0.99")
    r = httpx.get(
        f"{base_url}/openfeeder",
        params={"q": "test", "min_score": "0.99"},
        timeout=10,
    )
    if r.status_code == 404:
        check(True, "min_score=0.99 returns 404 (nothing that high)")
    elif r.status_code == 200:
        data = r.json()
        chunks = data.get("chunks", [])
        check(len(chunks) == 0, "min_score=0.99 returns empty chunks")
    else:
        check(r.status_code in (200, 404), f"unexpected status {r.status_code}")

    # GET /openfeeder?q=test&min_score=0.0 → has chunks
    print("\nIntegration: GET /openfeeder?q=test&min_score=0.0")
    r = httpx.get(
        f"{base_url}/openfeeder",
        params={"q": "test", "min_score": "0.0"},
        timeout=10,
    )
    if r.status_code == 200:
        data = r.json()
        check("chunks" in data or "items" in data, "min_score=0.0 has results")
    elif r.status_code == 404:
        check(True, "min_score=0.0 returns 404 (no indexed content yet — valid)")
    else:
        check(False, f"unexpected status {r.status_code}")

    # POST /openfeeder/update
    print("\nIntegration: POST /openfeeder/update")
    r = httpx.post(
        f"{base_url}/openfeeder/update",
        json={"action": "upsert", "urls": ["/nonexistent-test-path"]},
        timeout=30,
    )
    check(r.status_code == 200 or r.status_code == 401, "update returns 200 or 401 (auth)")
    if r.status_code == 200:
        data = r.json()
        check("status" in data, "update response has status field")

    # GET /openfeeder?since= (differential sync)
    print("\nIntegration: GET /openfeeder?since=2020-01-01T00:00:00Z")
    r = httpx.get(
        f"{base_url}/openfeeder",
        params={"since": "2020-01-01T00:00:00Z"},
        timeout=10,
    )
    check(r.status_code == 200, "diff sync returns 200")
    data = r.json()
    check("sync" in data, "has sync envelope")
    check("sync_token" in data.get("sync", {}), "has sync_token")
    check("added" in data, "has added array")
    check("updated" in data, "has updated array")
    check("deleted" in data, "has deleted array")

    # Sync token round-trip
    print("\nIntegration: sync_token round-trip")
    token = data.get("sync", {}).get("sync_token", "")
    if token:
        r2 = httpx.get(
            f"{base_url}/openfeeder",
            params={"since": token},
            timeout=10,
        )
        check(r2.status_code == 200, "token-based request returns 200")
        data2 = r2.json()
        check("sync" in data2, "token-based response has sync envelope")
    else:
        skip("no sync_token to test round-trip")

    # POST /crawl
    print("\nIntegration: POST /crawl")
    r = httpx.post(f"{base_url}/crawl", timeout=10)
    check(r.status_code == 200, "crawl returns 200")
    if r.status_code == 200:
        data = r.json()
        check(
            data.get("status") in ("crawl_started", "already_running"),
            f'crawl status is "{data.get("status")}"',
        )


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    print(f"OpenFeeder Sidecar Tests\n{'=' * 55}")

    # Unit tests — always run
    test_detect_bot()
    test_parse_iso_duration()
    test_sync_token()
    test_tombstone_helpers()

    # Integration tests — skip if sidecar not reachable
    base_url = os.environ.get("SIDECAR_URL", "http://localhost:8080")
    if sidecar_reachable(base_url):
        test_integration(base_url)
    else:
        print(f"\n  SKIP  Integration tests (sidecar not reachable at {base_url})")
        print("         Set SIDECAR_URL env var if running elsewhere.")

    # Summary
    print(f"\n{'=' * 55}")
    total = passed + failed
    parts = [f"{passed} passed", f"{failed} failed", f"{total} total"]
    if skipped:
        parts.append(f"{skipped} skipped")
    print(f"Results: {', '.join(parts)}")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
