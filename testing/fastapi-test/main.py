"""
OpenFeeder FastAPI test app — sample content, runs on port 3003.
"""

from __future__ import annotations

import sys
import os

# Add the adapter package to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../adapters/fastapi"))

from fastapi import FastAPI
from openfeeder_fastapi import openfeeder_router

app = FastAPI(title="OpenFeeder FastAPI Test Site")

# ---------------------------------------------------------------------------
# Sample content
# ---------------------------------------------------------------------------

ITEMS = [
    {
        "url": "/hello-world",
        "title": "Hello, World!",
        "published": "2024-01-15T10:00:00Z",
        "content": """<h1>Hello, World!</h1>

<p>This is the first article on our test site. Welcome to OpenFeeder, the open standard
for LLM-optimized content delivery.</p>

<p>OpenFeeder allows AI assistants and language models to efficiently read and index
your website's content. Instead of scraping messy HTML, they get clean, structured
JSON with pre-chunked text ready for embedding and retrieval.</p>

<h2>Why OpenFeeder?</h2>

<p>Traditional web crawlers have to deal with navigation menus, advertisements,
JavaScript-rendered content, and other noise. OpenFeeder cuts through all of that
by providing a dedicated feed endpoint with exactly the content you want indexed.</p>

<p>The protocol is simple: two endpoints, a discovery document and a content feed.
Any site can implement it in minutes, and any LLM can consume it without special
scraping logic.</p>

<h2>Getting Started</h2>

<p>To get started with OpenFeeder, check out the adapters for your platform:
Express.js, Next.js, FastAPI, WordPress, Drupal, and Joomla are all supported.
The protocol is also simple enough to implement from scratch in any language.</p>

<p>Each adapter follows the same pattern: configure it with your site details and
two callback functions — one to list items and one to fetch a single item by URL.
The adapter handles all the protocol details automatically.</p>""",
    },
    {
        "url": "/getting-started",
        "title": "Getting Started with OpenFeeder",
        "published": "2024-01-20T14:30:00Z",
        "content": """<h1>Getting Started with OpenFeeder</h1>

<p>This guide walks you through setting up OpenFeeder on your site. We'll cover
the basic concepts, then show you how to implement the two required endpoints.</p>

<h2>The Two Endpoints</h2>

<p>OpenFeeder requires exactly two HTTP endpoints:</p>

<ul>
<li><strong>Discovery:</strong> <code>GET /.well-known/openfeeder.json</code> — returns metadata about your site and feed</li>
<li><strong>Content:</strong> <code>GET /openfeeder</code> — returns paginated content or a single page with chunks</li>
</ul>

<h2>The Discovery Document</h2>

<p>The discovery document tells LLMs where to find your content feed and what
capabilities your site supports. It looks like this:</p>

<p>The version field must be "1.0". The site section contains basic information
about your website. The feed section tells LLMs where to find the content endpoint.
The capabilities array lists optional features like search.</p>

<h2>The Content Feed</h2>

<p>The content feed has two modes depending on the query parameters:</p>

<p>Index mode (no URL parameter): Returns a paginated list of all content items
with titles, URLs, published dates, and short summaries. This allows LLMs to
discover what content is available.</p>

<p>Single page mode (with URL parameter): Returns the full content of a specific
page, pre-chunked into manageable pieces. Each chunk has an ID, text, type
(paragraph, heading, list), and optional relevance score.</p>

<h2>Chunking</h2>

<p>One of OpenFeeder's key features is automatic text chunking. Content is stripped
of HTML tags, split into paragraphs, and then grouped into chunks of approximately
500 words. This makes it easy for LLMs to process content without hitting token limits.</p>

<p>The chunker also detects content types — headings, paragraphs, and lists are
identified automatically based on text patterns.</p>""",
    },
    {
        "url": "/api-reference",
        "title": "OpenFeeder API Reference",
        "published": "2024-01-25T09:00:00Z",
        "content": """<h1>OpenFeeder API Reference</h1>

<p>Complete reference for the OpenFeeder protocol, version 1.0.</p>

<h2>Discovery Endpoint</h2>

<p>The discovery endpoint returns a JSON document describing the site and feed.
It must be served at <code>/.well-known/openfeeder.json</code>.</p>

<p>Required fields: version (string, must be "1.0"), site.name, site.url,
feed.endpoint. Optional fields: site.language, site.description,
capabilities (array), contact.</p>

<h2>Content Endpoint</h2>

<p>The content endpoint handles both index and single-page requests.
It accepts the following query parameters:</p>

<ul>
<li><strong>page</strong> (integer, default 1) — page number for index mode</li>
<li><strong>limit</strong> (integer, default 10, max 100) — items per page</li>
<li><strong>url</strong> (string) — URL pathname to fetch in single-page mode</li>
<li><strong>q</strong> (string) — search query to filter results</li>
</ul>

<h2>Response Headers</h2>

<p>All responses from OpenFeeder endpoints must include these headers:</p>

<ul>
<li><strong>Content-Type:</strong> application/json</li>
<li><strong>X-OpenFeeder:</strong> 1.0</li>
<li><strong>Access-Control-Allow-Origin:</strong> *</li>
</ul>

<h2>Error Responses</h2>

<p>Error responses use HTTP status codes (404 for not found, 500 for server errors)
and return a JSON body with schema, error.code, and error.message fields.</p>

<h2>Chunk Types</h2>

<p>Each chunk in a single-page response has a type field indicating the kind of
content: "paragraph" for regular text, "heading" for short title-like text,
"list" for bulleted or numbered lists, "code" for code blocks, and "quote"
for blockquotes.</p>""",
    },
    {
        "url": "/faq",
        "title": "Frequently Asked Questions",
        "published": "2024-02-01T11:00:00Z",
        "content": """<h1>Frequently Asked Questions</h1>

<h2>What is OpenFeeder?</h2>

<p>OpenFeeder is an open standard for LLM-optimized content delivery. It defines
a simple HTTP API that websites can implement to make their content easily
accessible to AI assistants and language models.</p>

<h2>Why do I need OpenFeeder?</h2>

<p>Without a structured feed, AI systems have to scrape your website, dealing with
navigation menus, ads, dynamic content, and other noise. OpenFeeder gives them
clean, pre-processed content exactly as you want it indexed.</p>

<h2>Is OpenFeeder free?</h2>

<p>Yes, OpenFeeder is completely free and open source. The protocol specification
is available on GitHub and all the adapters are MIT licensed.</p>

<h2>Which platforms are supported?</h2>

<p>Official adapters exist for Express.js, Next.js, FastAPI, WordPress, Drupal,
and Joomla. The protocol is simple enough to implement in any language or
framework in under an hour.</p>

<h2>Does OpenFeeder replace sitemaps?</h2>

<p>No, OpenFeeder complements sitemaps rather than replacing them. Sitemaps tell
search engines what pages exist; OpenFeeder tells AI systems what those pages
contain, in a clean, structured format.</p>

<h2>How is search implemented?</h2>

<p>The basic search in the protocol is a simple substring match on title and
content. Adapters can implement more sophisticated search if needed, such as
full-text search with ranking or semantic search using embeddings.</p>""",
    },
    {
        "url": "/changelog",
        "title": "Changelog",
        "published": "2024-02-05T16:00:00Z",
        "content": """<h1>Changelog</h1>

<h2>Version 1.0.0 (2024-02-05)</h2>

<p>Initial release of the OpenFeeder protocol specification.</p>

<ul>
<li>Discovery endpoint at <code>/.well-known/openfeeder.json</code></li>
<li>Content endpoint at <code>/openfeeder</code></li>
<li>Index mode with pagination</li>
<li>Single-page mode with chunking</li>
<li>Search capability via query parameter</li>
<li>Official adapters for Express.js, Next.js, FastAPI, WordPress, Drupal, Joomla</li>
</ul>

<h2>Protocol Design Goals</h2>

<p>The protocol was designed with these goals in mind:</p>

<ul>
<li><strong>Simplicity:</strong> Two endpoints, no authentication required</li>
<li><strong>Compatibility:</strong> Works with any HTTP client</li>
<li><strong>Efficiency:</strong> Pre-chunked content reduces processing overhead</li>
<li><strong>Openness:</strong> No vendor lock-in, open specification</li>
</ul>

<h2>Future Plans</h2>

<p>Planned features for future versions include: structured metadata fields,
embedding hints for semantic search optimization, rate limiting guidance,
conditional GET support for efficient polling, and webhook support for
real-time content updates.</p>

<p>The protocol is intentionally kept minimal to encourage adoption. Features
will be added conservatively to avoid breaking existing implementations.</p>""",
    },
]

# Build a lookup dict for fast access
ITEMS_BY_URL: dict[str, dict] = {item["url"]: item for item in ITEMS}


# ---------------------------------------------------------------------------
# Callback functions
# ---------------------------------------------------------------------------

async def get_items(page: int, limit: int) -> dict:
    """Return a paginated list of items."""
    start = (page - 1) * limit
    end = start + limit
    return {
        "items": ITEMS[start:end],
        "total": len(ITEMS),
    }


async def get_item(url: str) -> dict | None:
    """Return a single item by URL pathname."""
    return ITEMS_BY_URL.get(url)


# ---------------------------------------------------------------------------
# Mount the OpenFeeder router
# ---------------------------------------------------------------------------

app.include_router(
    openfeeder_router(
        site_name="OpenFeeder Test Site",
        site_url="http://localhost:3003",
        language="en",
        site_description="A test site for the OpenFeeder FastAPI adapter",
        get_items=get_items,
        get_item=get_item,
    )
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3003)
