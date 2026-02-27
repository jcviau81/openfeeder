"""Comprehensive tests for the OpenFeeder Validator."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from checks import (
    CheckResult,
    Status,
    ValidationContext,
    check_discovery,
    check_headers,
    check_index,
    check_noise,
    check_single_page,
    run_all_checks,
)
from report import format_json, _result_to_dict


# ===================================================================
# Helpers
# ===================================================================

def _make_response(
    status_code: int = 200,
    json_data: dict | None = None,
    text: str = "",
    headers: dict | None = None,
    content_type: str = "application/json",
) -> httpx.Response:
    """Build a mock httpx.Response."""
    hdrs = {"content-type": content_type}
    if headers:
        hdrs.update(headers)

    body = b""
    if json_data is not None:
        body = json.dumps(json_data).encode()
    elif text:
        body = text.encode()

    return httpx.Response(
        status_code=status_code,
        headers=hdrs,
        content=body,
        request=httpx.Request("GET", "https://example.com"),
    )


def _mock_client_get(responses: dict[str, httpx.Response]):
    """Return a mock client whose .get() returns responses keyed by URL substring."""
    client = MagicMock(spec=httpx.Client)

    def side_effect(url, **kwargs):
        for pattern, resp in responses.items():
            if pattern in url:
                return resp
        raise httpx.ConnectError("No mock for URL")

    client.get.side_effect = side_effect
    return client


# ---------------------------------------------------------------------------
# Valid discovery JSON
# ---------------------------------------------------------------------------

VALID_DISCOVERY = {
    "version": "1.0",
    "site": {
        "name": "Test Site",
        "url": "https://example.com",
        "language": "en",
    },
    "feed": {
        "endpoint": "/openfeeder",
        "type": "paginated",
    },
    "capabilities": ["search"],
}

VALID_INDEX = {
    "schema": "openfeeder/1.0",
    "type": "index",
    "page": 1,
    "total_pages": 1,
    "items": [
        {"url": "/hello", "title": "Hello World", "published": "2025-01-01", "summary": "Hello..."},
        {"url": "/second", "title": "Second Post", "published": "2025-01-02", "summary": "Second..."},
    ],
}

VALID_SINGLE_PAGE = {
    "schema": "openfeeder/1.0",
    "url": "/hello",
    "title": "Hello World",
    "published": "2025-01-01",
    "language": "en",
    "summary": "Hello...",
    "chunks": [
        {"id": "abc_0", "text": "This is the hello world content paragraph.", "type": "paragraph", "relevance": None},
    ],
    "meta": {
        "total_chunks": 1,
        "returned_chunks": 1,
        "cached": False,
        "cache_age_seconds": None,
    },
}


# ===================================================================
# check_discovery
# ===================================================================

class TestCheckDiscovery:

    def test_happy_path(self):
        client = _mock_client_get({
            "openfeeder.json": _make_response(json_data=VALID_DISCOVERY),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)

        statuses = {r.name: r.status for r in results}
        assert statuses["Discovery endpoint"] == Status.PASS
        assert statuses["Discovery Content-Type"] == Status.PASS
        assert statuses["Discovery field: version"] == Status.PASS
        assert statuses["Discovery field: site.name"] == Status.PASS
        assert statuses["Discovery field: site.url"] == Status.PASS
        assert statuses["Discovery field: feed.endpoint"] == Status.PASS

    def test_stores_feed_endpoint(self):
        client = _mock_client_get({
            "openfeeder.json": _make_response(json_data=VALID_DISCOVERY),
        })
        ctx = ValidationContext(base_url="https://example.com")
        check_discovery(client, ctx)
        assert ctx.feed_endpoint == "https://example.com/openfeeder"

    def test_absolute_feed_endpoint(self):
        discovery = {**VALID_DISCOVERY, "feed": {"endpoint": "https://cdn.example.com/feed"}}
        client = _mock_client_get({
            "openfeeder.json": _make_response(json_data=discovery),
        })
        ctx = ValidationContext(base_url="https://example.com")
        check_discovery(client, ctx)
        assert ctx.feed_endpoint == "https://cdn.example.com/feed"

    def test_non_200_status(self):
        client = _mock_client_get({
            "openfeeder.json": _make_response(status_code=404),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        assert any(r.status == Status.FAIL and "404" in r.message for r in results)

    def test_wrong_content_type(self):
        client = _mock_client_get({
            "openfeeder.json": _make_response(
                json_data=VALID_DISCOVERY, content_type="text/html"
            ),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        statuses = {r.name: r.status for r in results}
        assert statuses["Discovery Content-Type"] == Status.FAIL

    def test_invalid_json(self):
        client = _mock_client_get({
            "openfeeder.json": _make_response(
                text="not json{{{", content_type="application/json"
            ),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        assert any(r.name == "Discovery JSON parse" and r.status == Status.FAIL for r in results)

    def test_missing_required_fields(self):
        incomplete = {"version": "1.0"}  # missing site and feed
        client = _mock_client_get({
            "openfeeder.json": _make_response(json_data=incomplete),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        failed_fields = [r.name for r in results if r.status == Status.FAIL]
        assert "Discovery field: site.name" in failed_fields
        assert "Discovery field: site.url" in failed_fields
        assert "Discovery field: feed.endpoint" in failed_fields

    def test_version_warning_for_non_1_0(self):
        discovery = {**VALID_DISCOVERY, "version": "2.0"}
        discovery["site"] = {**VALID_DISCOVERY["site"]}
        client = _mock_client_get({
            "openfeeder.json": _make_response(json_data=discovery),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        assert any(r.name == "Discovery version" and r.status == Status.WARN for r in results)

    def test_no_version_warning_for_1_0(self):
        client = _mock_client_get({
            "openfeeder.json": _make_response(json_data=VALID_DISCOVERY),
        })
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        assert not any(r.name == "Discovery version" for r in results)

    def test_connect_error(self):
        client = MagicMock(spec=httpx.Client)
        client.get.side_effect = httpx.ConnectError("refused")
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        assert results[0].status == Status.FAIL
        assert "Could not connect" in results[0].message

    def test_timeout_error(self):
        client = MagicMock(spec=httpx.Client)
        client.get.side_effect = httpx.ReadTimeout("timed out")
        ctx = ValidationContext(base_url="https://example.com")
        results = check_discovery(client, ctx)
        assert results[0].status == Status.FAIL
        assert "timed out" in results[0].message


# ===================================================================
# check_index
# ===================================================================

class TestCheckIndex:

    def _ctx_with_endpoint(self, endpoint: str = "https://example.com/openfeeder"):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = endpoint
        return ctx

    def test_happy_path(self):
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=VALID_INDEX),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)

        statuses = {r.name: r.status for r in results}
        assert statuses["Index endpoint"] == Status.PASS
        assert statuses["Index schema"] == Status.PASS
        assert statuses["Index type"] == Status.PASS
        assert statuses["Index items"] == Status.PASS
        assert statuses["Index item fields"] == Status.PASS

    def test_stores_first_item_url(self):
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=VALID_INDEX),
        })
        ctx = self._ctx_with_endpoint()
        check_index(client, ctx)
        assert ctx.first_item_url == "https://example.com/hello"

    def test_skip_when_no_endpoint(self):
        client = MagicMock()
        ctx = ValidationContext(base_url="https://example.com")
        results = check_index(client, ctx)
        assert results[0].status == Status.SKIP

    def test_wrong_schema(self):
        bad_index = {**VALID_INDEX, "schema": "wrong/2.0"}
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_index),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        statuses = {r.name: r.status for r in results}
        assert statuses["Index schema"] == Status.FAIL

    def test_wrong_type(self):
        bad_index = {**VALID_INDEX, "type": "feed"}
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_index),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        statuses = {r.name: r.status for r in results}
        assert statuses["Index type"] == Status.FAIL

    def test_missing_items_array(self):
        bad_index = {**VALID_INDEX}
        del bad_index["items"]
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_index),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        assert any(r.name == "Index items" and r.status == Status.FAIL for r in results)

    def test_items_missing_url(self):
        bad_index = {**VALID_INDEX, "items": [{"title": "No URL"}]}
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_index),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        assert any(r.name == "Index item fields" and r.status == Status.FAIL for r in results)

    def test_timeout(self):
        client = MagicMock(spec=httpx.Client)
        client.get.side_effect = httpx.ReadTimeout("timeout")
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        assert results[0].status == Status.FAIL

    def test_non_200(self):
        client = _mock_client_get({
            "openfeeder": _make_response(status_code=500),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        assert any(r.status == Status.FAIL and "500" in r.message for r in results)

    def test_response_time_pass(self):
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=VALID_INDEX),
        })
        ctx = self._ctx_with_endpoint()
        results = check_index(client, ctx)
        time_result = next(r for r in results if "response time" in r.name)
        assert time_result.status == Status.PASS

    def test_absolute_item_url_stored_as_is(self):
        index_with_abs_url = {
            **VALID_INDEX,
            "items": [{"url": "https://cdn.example.com/post", "title": "CDN Post"}],
        }
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=index_with_abs_url),
        })
        ctx = self._ctx_with_endpoint()
        check_index(client, ctx)
        assert ctx.first_item_url == "https://cdn.example.com/post"


# ===================================================================
# check_single_page
# ===================================================================

class TestCheckSinglePage:

    def _ctx_ready(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = "https://example.com/openfeeder"
        ctx.first_item_url = "https://example.com/hello"
        return ctx

    def test_happy_path(self):
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=VALID_SINGLE_PAGE),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)

        statuses = {r.name: r.status for r in results}
        assert statuses["Single page fetch"] == Status.PASS
        assert statuses["Single page schema"] == Status.PASS
        assert statuses["Single page title"] == Status.PASS
        assert statuses["Single page chunks"] == Status.PASS
        assert statuses["Chunk fields"] == Status.PASS
        assert statuses["Empty chunks"] == Status.PASS
        assert statuses["meta.total_chunks"] == Status.PASS

    def test_skip_when_no_item_url(self):
        client = MagicMock()
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = "https://example.com/openfeeder"
        results = check_single_page(client, ctx)
        assert results[0].status == Status.SKIP

    def test_skip_when_no_endpoint(self):
        client = MagicMock()
        ctx = ValidationContext(base_url="https://example.com")
        ctx.first_item_url = "https://example.com/hello"
        results = check_single_page(client, ctx)
        assert results[0].status == Status.SKIP

    def test_missing_schema(self):
        bad_page = {**VALID_SINGLE_PAGE}
        del bad_page["schema"]
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_page),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.name == "Single page schema" and r.status == Status.FAIL for r in results)

    def test_missing_title(self):
        bad_page = {**VALID_SINGLE_PAGE, "title": ""}
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_page),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.name == "Single page title" and r.status == Status.FAIL for r in results)

    def test_missing_chunks(self):
        bad_page = {**VALID_SINGLE_PAGE}
        del bad_page["chunks"]
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_page),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.name == "Single page chunks" and r.status == Status.FAIL for r in results)

    def test_empty_chunk_text(self):
        page_with_empty = {
            **VALID_SINGLE_PAGE,
            "chunks": [{"id": "x", "text": "   ", "type": "paragraph"}],
        }
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=page_with_empty),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.name == "Empty chunks" and r.status == Status.FAIL for r in results)

    def test_chunk_missing_id(self):
        page_bad_chunk = {
            **VALID_SINGLE_PAGE,
            "chunks": [{"text": "hello", "type": "paragraph"}],
        }
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=page_bad_chunk),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.name == "Chunk fields" and r.status == Status.FAIL for r in results)

    def test_missing_meta_total_chunks(self):
        bad_page = {**VALID_SINGLE_PAGE, "meta": {"returned_chunks": 1}}
        client = _mock_client_get({
            "openfeeder": _make_response(json_data=bad_page),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.name == "meta.total_chunks" and r.status == Status.FAIL for r in results)

    def test_timeout(self):
        client = MagicMock(spec=httpx.Client)
        client.get.side_effect = httpx.ReadTimeout("timeout")
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert results[0].status == Status.FAIL

    def test_non_200(self):
        client = _mock_client_get({
            "openfeeder": _make_response(status_code=404),
        })
        ctx = self._ctx_ready()
        results = check_single_page(client, ctx)
        assert any(r.status == Status.FAIL and "404" in r.message for r in results)


# ===================================================================
# check_headers
# ===================================================================

class TestCheckHeaders:

    def test_all_headers_present(self):
        client = _mock_client_get({
            "openfeeder": _make_response(
                json_data={},
                headers={
                    "x-openfeeder": "1.0",
                    "access-control-allow-origin": "*",
                },
            ),
        })
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = "https://example.com/openfeeder"
        results = check_headers(client, ctx)

        statuses = {r.name: r.status for r in results}
        assert statuses["X-OpenFeeder header"] == Status.PASS
        assert statuses["CORS header"] == Status.PASS

    def test_missing_x_openfeeder(self):
        client = _mock_client_get({
            "openfeeder": _make_response(
                json_data={},
                headers={"access-control-allow-origin": "*"},
            ),
        })
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = "https://example.com/openfeeder"
        results = check_headers(client, ctx)
        statuses = {r.name: r.status for r in results}
        assert statuses["X-OpenFeeder header"] == Status.WARN

    def test_missing_cors(self):
        client = _mock_client_get({
            "openfeeder": _make_response(
                json_data={},
                headers={"x-openfeeder": "1.0"},
            ),
        })
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = "https://example.com/openfeeder"
        results = check_headers(client, ctx)
        cors = next(r for r in results if "CORS" in r.name)
        assert cors.status == Status.WARN

    def test_non_wildcard_cors(self):
        client = _mock_client_get({
            "openfeeder": _make_response(
                json_data={},
                headers={
                    "x-openfeeder": "1.0",
                    "access-control-allow-origin": "https://specific.com",
                },
            ),
        })
        ctx = ValidationContext(base_url="https://example.com")
        ctx.feed_endpoint = "https://example.com/openfeeder"
        results = check_headers(client, ctx)
        cors = next(r for r in results if "CORS" in r.name)
        assert cors.status == Status.WARN

    def test_no_endpoint_returns_empty(self):
        client = MagicMock()
        ctx = ValidationContext(base_url="https://example.com")
        results = check_headers(client, ctx)
        assert results == []


# ===================================================================
# check_noise
# ===================================================================

class TestCheckNoise:

    def test_pass_when_chunks_found_in_html(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.first_item_url = "https://example.com/hello"
        ctx.single_page_data = {
            "chunks": [
                {"text": "This is a long enough chunk text that should be in the HTML page content.", "type": "paragraph"},
            ],
        }
        client = _mock_client_get({
            "hello": _make_response(
                text="<html><body>This is a long enough chunk text that should be in the HTML page content.</body></html>",
                content_type="text/html",
            ),
        })
        results = check_noise(client, ctx)
        assert any(r.name == "Noise check" and r.status == Status.PASS for r in results)

    def test_warn_when_chunks_not_found(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.first_item_url = "https://example.com/hello"
        ctx.single_page_data = {
            "chunks": [
                {"text": "Completely different text that was generated or transformed.", "type": "paragraph"},
            ],
        }
        client = _mock_client_get({
            "hello": _make_response(
                text="<html><body>Original page content that has nothing in common.</body></html>",
                content_type="text/html",
            ),
        })
        results = check_noise(client, ctx)
        assert any(r.name == "Noise check" and r.status == Status.WARN for r in results)

    def test_skip_when_no_item_url(self):
        ctx = ValidationContext(base_url="https://example.com")
        client = MagicMock()
        results = check_noise(client, ctx)
        assert results[0].status == Status.SKIP

    def test_skip_when_no_chunks(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.first_item_url = "https://example.com/hello"
        ctx.single_page_data = {"chunks": []}
        client = MagicMock()
        results = check_noise(client, ctx)
        assert results[0].status == Status.SKIP


# ===================================================================
# run_all_checks (integration)
# ===================================================================

class TestRunAllChecks:

    def test_happy_path_all_pass(self):
        """Full pipeline with valid responses should have no failures."""
        html_content = "This is the hello world content paragraph. It is long enough for noise check."

        def mock_get(url, **kwargs):
            if "openfeeder.json" in url:
                return _make_response(json_data=VALID_DISCOVERY)
            elif "url=" in url:
                return _make_response(json_data=VALID_SINGLE_PAGE)
            elif "openfeeder" in url:
                return _make_response(
                    json_data=VALID_INDEX,
                    headers={
                        "x-openfeeder": "1.0",
                        "access-control-allow-origin": "*",
                    },
                )
            elif "/hello" in url:
                return _make_response(text=html_content, content_type="text/html")
            return _make_response(status_code=404)

        with patch("checks.httpx.Client") as MockClient:
            instance = MockClient.return_value.__enter__.return_value
            instance.get.side_effect = mock_get
            ctx = run_all_checks("https://example.com")

        failures = [r for r in ctx.results if r.status == Status.FAIL]
        assert len(failures) == 0, f"Unexpected failures: {[(f.name, f.message) for f in failures]}"

    def test_unreachable_site(self):
        with patch("checks.httpx.Client") as MockClient:
            instance = MockClient.return_value.__enter__.return_value
            instance.get.side_effect = httpx.ConnectError("refused")
            ctx = run_all_checks("https://unreachable.example.com")

        assert any(r.status == Status.FAIL for r in ctx.results)

    def test_endpoint_override(self):
        def mock_get(url, **kwargs):
            if "openfeeder.json" in url:
                return _make_response(json_data=VALID_DISCOVERY)
            elif "custom-feed" in url and "url=" in url:
                return _make_response(json_data=VALID_SINGLE_PAGE)
            elif "custom-feed" in url:
                return _make_response(
                    json_data=VALID_INDEX,
                    headers={"x-openfeeder": "1.0", "access-control-allow-origin": "*"},
                )
            elif "/hello" in url:
                return _make_response(
                    text="This is the hello world content paragraph.",
                    content_type="text/html",
                )
            return _make_response(status_code=404)

        with patch("checks.httpx.Client") as MockClient:
            instance = MockClient.return_value.__enter__.return_value
            instance.get.side_effect = mock_get
            ctx = run_all_checks(
                "https://example.com",
                endpoint_override="https://example.com/custom-feed",
            )

        assert ctx.feed_endpoint == "https://example.com/custom-feed"
        # Should have passed the index check since the override endpoint returns valid data
        index_results = [r for r in ctx.results if "Index endpoint" in r.name]
        assert any(r.status == Status.PASS for r in index_results)


# ===================================================================
# Report formatting
# ===================================================================

class TestReport:

    def test_format_json_pass(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.discovery = {"version": "1.0"}
        ctx.results = [
            CheckResult("Test check", Status.PASS, "OK"),
        ]
        output = json.loads(format_json(ctx))
        assert output["result"] == "PASS"
        assert output["summary"]["passed"] == 1
        assert output["summary"]["failed"] == 0

    def test_format_json_fail(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.discovery = {"version": "1.0"}
        ctx.results = [
            CheckResult("Good check", Status.PASS, "OK"),
            CheckResult("Bad check", Status.FAIL, "Broken"),
        ]
        output = json.loads(format_json(ctx))
        assert output["result"] == "FAIL"
        assert output["summary"]["passed"] == 1
        assert output["summary"]["failed"] == 1

    def test_format_json_includes_all_checks(self):
        ctx = ValidationContext(base_url="https://example.com")
        ctx.discovery = {}
        ctx.results = [
            CheckResult("A", Status.PASS, "ok"),
            CheckResult("B", Status.WARN, "meh"),
            CheckResult("C", Status.SKIP, "skipped"),
        ]
        output = json.loads(format_json(ctx))
        assert len(output["checks"]) == 3
        assert output["summary"]["warnings"] == 1
        assert output["summary"]["skipped"] == 1

    def test_result_to_dict(self):
        r = CheckResult("Test", Status.PASS, "OK", "some detail")
        d = _result_to_dict(r)
        assert d["name"] == "Test"
        assert d["status"] == "pass"
        assert d["message"] == "OK"
        assert d["details"] == "some detail"

    def test_result_to_dict_none_details(self):
        r = CheckResult("Test", Status.FAIL, "bad")
        d = _result_to_dict(r)
        assert d["details"] is None


# ===================================================================
# Data classes
# ===================================================================

class TestDataClasses:

    def test_status_values(self):
        assert Status.PASS.value == "pass"
        assert Status.FAIL.value == "fail"
        assert Status.WARN.value == "warn"
        assert Status.SKIP.value == "skip"

    def test_check_result_defaults(self):
        r = CheckResult("name", Status.PASS, "msg")
        assert r.details == ""

    def test_validation_context_defaults(self):
        ctx = ValidationContext(base_url="https://x.com")
        assert ctx.discovery == {}
        assert ctx.feed_endpoint == ""
        assert ctx.index_data == {}
        assert ctx.first_item_url == ""
        assert ctx.single_page_data == {}
        assert ctx.results == []
