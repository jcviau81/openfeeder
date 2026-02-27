"""Comprehensive tests for the OpenFeeder FastAPI adapter."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openfeeder_fastapi import openfeeder_router
from openfeeder_fastapi.chunker import chunk_content, clean_html, summarise, _detect_type
from openfeeder_fastapi.router import make_etag, sanitize_url_param, get_last_modified


# ===================================================================
# Discovery endpoint — GET /.well-known/openfeeder.json
# ===================================================================

class TestDiscovery:

    def test_returns_200(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert resp.status_code == 200

    def test_content_type_is_json(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert "application/json" in resp.headers["content-type"]

    def test_schema_fields(self, client: TestClient):
        data = client.get("/.well-known/openfeeder.json").json()
        assert data["version"] == "1.0.1"
        assert data["site"]["name"] == "Test Site"
        assert data["site"]["url"] == "https://test.example.com"
        assert data["site"]["language"] == "en"
        assert data["site"]["description"] == "A test site for unit tests"

    def test_feed_section(self, client: TestClient):
        data = client.get("/.well-known/openfeeder.json").json()
        assert data["feed"]["endpoint"] == "/openfeeder"
        assert data["feed"]["type"] == "paginated"

    def test_capabilities_include_search(self, client: TestClient):
        data = client.get("/.well-known/openfeeder.json").json()
        assert "search" in data["capabilities"]

    def test_contact_is_null(self, client: TestClient):
        data = client.get("/.well-known/openfeeder.json").json()
        assert data["contact"] is None

    def test_etag_header_present(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert "etag" in resp.headers
        assert resp.headers["etag"].startswith('"')

    def test_cache_control_header(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert "max-age=300" in resp.headers["cache-control"]

    def test_last_modified_header(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert "last-modified" in resp.headers
        assert "GMT" in resp.headers["last-modified"]

    def test_x_openfeeder_header(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert resp.headers["x-openfeeder"] == "1.0"

    def test_cors_header(self, client: TestClient):
        resp = client.get("/.well-known/openfeeder.json")
        assert resp.headers["access-control-allow-origin"] == "*"

    def test_304_not_modified_with_matching_etag(self, client: TestClient):
        resp1 = client.get("/.well-known/openfeeder.json")
        etag = resp1.headers["etag"]

        resp2 = client.get(
            "/.well-known/openfeeder.json",
            headers={"If-None-Match": etag},
        )
        assert resp2.status_code == 304


# ===================================================================
# Index mode — GET /openfeeder
# ===================================================================

class TestIndex:

    def test_returns_200(self, client: TestClient):
        resp = client.get("/openfeeder")
        assert resp.status_code == 200

    def test_schema_field(self, client: TestClient):
        data = client.get("/openfeeder").json()
        assert data["schema"] == "openfeeder/1.0"

    def test_type_is_index(self, client: TestClient):
        data = client.get("/openfeeder").json()
        assert data["type"] == "index"

    def test_items_is_list(self, client: TestClient):
        data = client.get("/openfeeder").json()
        assert isinstance(data["items"], list)

    def test_pagination_fields(self, client: TestClient):
        data = client.get("/openfeeder").json()
        assert "page" in data
        assert "total_pages" in data
        assert isinstance(data["page"], int)
        assert isinstance(data["total_pages"], int)

    def test_default_page_is_1(self, client: TestClient):
        data = client.get("/openfeeder").json()
        assert data["page"] == 1

    def test_items_have_required_fields(self, client: TestClient):
        data = client.get("/openfeeder").json()
        for item in data["items"]:
            assert "url" in item
            assert "title" in item
            assert "summary" in item
            assert "published" in item

    def test_item_values(self, client: TestClient):
        data = client.get("/openfeeder").json()
        first = data["items"][0]
        assert first["url"] == "/hello-world"
        assert first["title"] == "Hello World"
        assert first["published"] == "2025-01-15T12:00:00Z"

    def test_x_openfeeder_cache_header(self, client: TestClient):
        resp = client.get("/openfeeder")
        assert resp.headers["x-openfeeder-cache"] == "MISS"

    def test_x_openfeeder_header(self, client: TestClient):
        resp = client.get("/openfeeder")
        assert resp.headers["x-openfeeder"] == "1.0"

    def test_cors_header(self, client: TestClient):
        resp = client.get("/openfeeder")
        assert resp.headers["access-control-allow-origin"] == "*"

    def test_etag_and_304(self, client: TestClient):
        resp1 = client.get("/openfeeder")
        etag = resp1.headers["etag"]

        resp2 = client.get("/openfeeder", headers={"If-None-Match": etag})
        assert resp2.status_code == 304

    def test_published_null_for_missing_date(self, client: TestClient):
        """Items without a published date should return null, not empty string."""
        data = client.get("/openfeeder").json()
        no_date_item = next(i for i in data["items"] if i["title"] == "No Date Post")
        assert no_date_item["published"] is None


# ===================================================================
# Pagination — GET /openfeeder?page=&limit=
# ===================================================================

class TestPagination:

    def test_limit_param(self, client: TestClient):
        data = client.get("/openfeeder?limit=2").json()
        assert len(data["items"]) == 2

    def test_limit_1(self, client: TestClient):
        data = client.get("/openfeeder?limit=1").json()
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "Hello World"

    def test_page_2(self, client: TestClient):
        data = client.get("/openfeeder?limit=1&page=2").json()
        assert data["page"] == 2
        assert data["items"][0]["title"] == "Second Post"

    def test_max_limit_capped_at_100(self, client: TestClient):
        """Requesting limit=9999 should be capped to MAX_LIMIT (100)."""
        resp = client.get("/openfeeder?limit=9999")
        assert resp.status_code == 200
        # We only have 3 fake items, so we can't check len == 100,
        # but the server should not error and should cap internally.
        data = resp.json()
        assert data["total_pages"] == 1  # 3 items / 100 per page = 1

    def test_invalid_page_defaults_to_1(self, client: TestClient):
        data = client.get("/openfeeder?page=abc").json()
        assert data["page"] == 1

    def test_invalid_limit_defaults_to_10(self, client: TestClient):
        data = client.get("/openfeeder?limit=abc").json()
        assert len(data["items"]) == 3  # all 3 items fit in default limit of 10

    def test_negative_page_defaults_to_1(self, client: TestClient):
        data = client.get("/openfeeder?page=-5").json()
        assert data["page"] == 1

    def test_zero_limit_defaults(self, client: TestClient):
        data = client.get("/openfeeder?limit=0").json()
        # int("0") is falsy, so `0 or DEFAULT_LIMIT` → 10
        assert len(data["items"]) == 3  # all 3 items fit in default limit of 10

    def test_total_pages_calculation(self, client: TestClient):
        data = client.get("/openfeeder?limit=2").json()
        # 3 total items / 2 per page = 2 pages (ceiling division)
        assert data["total_pages"] == 2


# ===================================================================
# Search — GET /openfeeder?q=
# ===================================================================

class TestSearch:

    def test_search_filters_by_title(self, client: TestClient):
        data = client.get("/openfeeder?q=Hello").json()
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "Hello World"

    def test_search_case_insensitive(self, client: TestClient):
        data = client.get("/openfeeder?q=hello").json()
        assert len(data["items"]) == 1

    def test_search_filters_by_content(self, client: TestClient):
        data = client.get("/openfeeder?q=testing").json()
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "Second Post"

    def test_search_no_match_returns_empty(self, client: TestClient):
        data = client.get("/openfeeder?q=nonexistent_xyz").json()
        assert len(data["items"]) == 0

    def test_search_query_truncated_to_200_chars(self, client: TestClient):
        """Very long query should not crash — it gets truncated to 200 chars."""
        long_q = "a" * 500
        resp = client.get(f"/openfeeder?q={long_q}")
        assert resp.status_code == 200


# ===================================================================
# Single page mode — GET /openfeeder?url=
# ===================================================================

class TestSinglePage:

    def test_returns_200(self, client: TestClient):
        resp = client.get("/openfeeder?url=/hello-world")
        assert resp.status_code == 200

    def test_schema_field(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert data["schema"] == "openfeeder/1.0"

    def test_title(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert data["title"] == "Hello World"

    def test_url_field(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert data["url"] == "/hello-world"

    def test_published_field(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert data["published"] == "2025-01-15T12:00:00Z"

    def test_language_field(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert data["language"] == "en"

    def test_summary_present(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert isinstance(data["summary"], str)
        assert len(data["summary"]) > 0

    def test_chunks_array(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        assert isinstance(data["chunks"], list)
        assert len(data["chunks"]) > 0

    def test_chunk_fields(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        for chunk in data["chunks"]:
            assert "id" in chunk
            assert "text" in chunk
            assert "type" in chunk
            assert "relevance" in chunk

    def test_meta_fields(self, client: TestClient):
        data = client.get("/openfeeder?url=/hello-world").json()
        meta = data["meta"]
        assert "total_chunks" in meta
        assert "returned_chunks" in meta
        assert "cached" in meta
        assert meta["cached"] is False
        assert meta["total_chunks"] == len(data["chunks"])
        assert meta["returned_chunks"] == len(data["chunks"])

    def test_x_openfeeder_cache_header(self, client: TestClient):
        resp = client.get("/openfeeder?url=/hello-world")
        assert resp.headers["x-openfeeder-cache"] == "MISS"

    def test_published_null_when_missing(self, client: TestClient):
        data = client.get("/openfeeder?url=/no-date").json()
        assert data["published"] is None

    def test_etag_and_304(self, client: TestClient):
        resp1 = client.get("/openfeeder?url=/hello-world")
        etag = resp1.headers["etag"]
        resp2 = client.get(
            "/openfeeder?url=/hello-world",
            headers={"If-None-Match": etag},
        )
        assert resp2.status_code == 304

    def test_absolute_url_stripped_to_path(self, client: TestClient):
        """Absolute URLs should be sanitized to just the path."""
        resp = client.get("/openfeeder?url=https://evil.com/hello-world")
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Hello World"


# ===================================================================
# Error cases
# ===================================================================

class TestErrors:

    def test_not_found_url(self, client: TestClient):
        resp = client.get("/openfeeder?url=/does-not-exist")
        assert resp.status_code == 404
        data = resp.json()
        assert data["schema"] == "openfeeder/1.0"
        assert data["error"]["code"] == "NOT_FOUND"

    def test_path_traversal_rejected(self, client: TestClient):
        resp = client.get("/openfeeder?url=/../../etc/passwd")
        assert resp.status_code == 400
        data = resp.json()
        assert data["error"]["code"] == "INVALID_URL"

    def test_get_items_error_returns_500(self, failing_client: TestClient):
        resp = failing_client.get("/openfeeder")
        assert resp.status_code == 500
        data = resp.json()
        assert data["error"]["code"] == "INTERNAL_ERROR"

    def test_get_item_error_returns_500(self, failing_client: TestClient):
        resp = failing_client.get("/openfeeder?url=/any-path")
        assert resp.status_code == 500
        data = resp.json()
        assert data["error"]["code"] == "INTERNAL_ERROR"

    def test_error_responses_have_openfeeder_headers(self, client: TestClient):
        resp = client.get("/openfeeder?url=/does-not-exist")
        assert resp.headers["x-openfeeder"] == "1.0"
        assert resp.headers["access-control-allow-origin"] == "*"


# ===================================================================
# Router factory validation
# ===================================================================

class TestRouterFactory:

    def test_requires_site_name(self):
        with pytest.raises(ValueError, match="site_name"):
            openfeeder_router(
                site_name="",
                site_url="https://test.com",
                get_items=lambda p, l: {},
                get_item=lambda u: None,
            )

    def test_requires_site_url(self):
        with pytest.raises(ValueError, match="site_url"):
            openfeeder_router(
                site_name="Test",
                site_url="",
                get_items=lambda p, l: {},
                get_item=lambda u: None,
            )

    def test_requires_callable_get_items(self):
        with pytest.raises(ValueError, match="callable"):
            openfeeder_router(
                site_name="Test",
                site_url="https://test.com",
                get_items="not a function",  # type: ignore
                get_item=lambda u: None,
            )

    def test_requires_callable_get_item(self):
        with pytest.raises(ValueError, match="callable"):
            openfeeder_router(
                site_name="Test",
                site_url="https://test.com",
                get_items=lambda p, l: {},
                get_item="not a function",  # type: ignore
            )


# ===================================================================
# Utility functions
# ===================================================================

class TestSanitizeUrlParam:

    def test_simple_path(self):
        assert sanitize_url_param("/hello") == "/hello"

    def test_empty_string(self):
        assert sanitize_url_param("") is None

    def test_path_traversal_rejected(self):
        assert sanitize_url_param("/../../etc/passwd") is None

    def test_absolute_url_stripped_to_path(self):
        assert sanitize_url_param("https://evil.com/my-page") == "/my-page"

    def test_trailing_slash_stripped(self):
        assert sanitize_url_param("/hello/") == "/hello"

    def test_root_path(self):
        assert sanitize_url_param("/") == "/"


class TestMakeEtag:

    def test_returns_quoted_string(self):
        etag = make_etag({"key": "value"})
        assert etag.startswith('"')
        assert etag.endswith('"')

    def test_deterministic(self):
        assert make_etag({"a": 1}) == make_etag({"a": 1})

    def test_different_data_different_etag(self):
        assert make_etag({"a": 1}) != make_etag({"a": 2})


class TestGetLastModified:

    def test_returns_rfc7231_date(self):
        items = [{"published": "2025-01-15T12:00:00Z"}]
        result = get_last_modified(items)
        assert "GMT" in result
        assert "Jan" in result
        assert "2025" in result

    def test_picks_latest(self):
        items = [
            {"published": "2025-01-01T00:00:00Z"},
            {"published": "2025-06-15T00:00:00Z"},
        ]
        result = get_last_modified(items)
        assert "Jun" in result

    def test_no_dates_returns_now(self):
        result = get_last_modified([{"title": "no date"}])
        assert "GMT" in result


# ===================================================================
# Chunker
# ===================================================================

class TestCleanHtml:

    def test_strips_tags(self):
        assert "bold" in clean_html("<b>bold</b>")
        assert "<b>" not in clean_html("<b>bold</b>")

    def test_decodes_entities(self):
        assert clean_html("&amp; &lt; &gt;") == "& < >"

    def test_normalizes_whitespace(self):
        result = clean_html("hello   world")
        assert result == "hello world"

    def test_preserves_paragraph_breaks(self):
        result = clean_html("para1\n\npara2")
        assert "\n\n" in result

    def test_collapses_excessive_newlines(self):
        result = clean_html("a\n\n\n\n\nb")
        assert "\n\n\n" not in result


class TestChunkContent:

    def test_empty_content(self):
        assert chunk_content("", "/test") == []

    def test_single_paragraph(self):
        chunks = chunk_content("<p>Hello world.</p>", "/test")
        assert len(chunks) == 1
        assert chunks[0]["text"] == "Hello world."

    def test_chunk_has_required_fields(self):
        chunks = chunk_content("<p>Hello</p>", "/test")
        chunk = chunks[0]
        assert "id" in chunk
        assert "text" in chunk
        assert "type" in chunk
        assert "relevance" in chunk

    def test_deterministic_ids(self):
        c1 = chunk_content("<p>Hello</p>", "/test")
        c2 = chunk_content("<p>Hello</p>", "/test")
        assert c1[0]["id"] == c2[0]["id"]

    def test_different_urls_different_ids(self):
        c1 = chunk_content("<p>Hello</p>", "/url-a")
        c2 = chunk_content("<p>Hello</p>", "/url-b")
        assert c1[0]["id"] != c2[0]["id"]


class TestSummarise:

    def test_short_content_returned_as_is(self):
        assert summarise("Short text.") == "Short text."

    def test_long_content_truncated(self):
        words = " ".join(f"word{i}" for i in range(100))
        result = summarise(f"<p>{words}</p>")
        assert result.endswith("...")
        # Should be ~40 words
        assert len(result.split()) <= 42  # 40 words + "..."

    def test_html_stripped_in_summary(self):
        result = summarise("<b>Bold</b> and <i>italic</i>")
        assert "<b>" not in result


class TestDetectType:

    def test_heading(self):
        assert _detect_type("Short Title") == "heading"

    def test_paragraph(self):
        long_text = "This is a longer piece of text that contains multiple words and forms a real paragraph with sufficient length."
        assert _detect_type(long_text) == "paragraph"

    def test_list(self):
        text = "- item one\n- item two\n- item three"
        assert _detect_type(text) == "list"

    def test_numbered_list(self):
        text = "1. first\n2. second\n3. third"
        assert _detect_type(text) == "list"
