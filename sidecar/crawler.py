"""
OpenFeeder Sidecar — Site Crawler

Crawls a target website starting from SITE_URL. Discovers pages via
sitemap.xml first, then follows internal links up to MAX_PAGES.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse, urldefrag
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("openfeeder.crawler")

# Sitemap XML namespaces
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


@dataclass
class Page:
    """A crawled page with its raw HTML and resolved URL."""
    url: str
    html: str
    status: int


@dataclass
class CrawlResult:
    """Aggregated result of a full crawl run."""
    pages: list[Page] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _is_same_origin(base: str, candidate: str) -> bool:
    """Check if candidate URL belongs to the same origin as base."""
    return urlparse(candidate).netloc == urlparse(base).netloc


def _normalise_url(url: str) -> str:
    """Strip fragments and trailing slashes for deduplication."""
    url, _ = urldefrag(url)
    if url.endswith("/") and url.count("/") > 3:
        url = url.rstrip("/")
    return url


# File extensions we never want to crawl
_SKIP_EXTENSIONS = re.compile(
    r"\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|tar|gz|mp3|mp4|mov|avi|woff2?|ttf|eot|css|js)$",
    re.IGNORECASE,
)


async def _fetch_sitemap(client: httpx.AsyncClient, site_url: str) -> list[str]:
    """Try to fetch and parse sitemap.xml, returning discovered URLs."""
    sitemap_url = urljoin(site_url, "/sitemap.xml")
    urls: list[str] = []
    try:
        resp = await client.get(sitemap_url, follow_redirects=True, timeout=15)
        if resp.status_code != 200:
            return urls
        tree = ElementTree.fromstring(resp.text)
        # Handle sitemap index (contains other sitemaps)
        for sitemap in tree.findall("sm:sitemap/sm:loc", SITEMAP_NS):
            if sitemap.text:
                urls.extend(await _fetch_sitemap(client, sitemap.text.strip()))
        # Handle regular sitemap
        for loc in tree.findall("sm:url/sm:loc", SITEMAP_NS):
            if loc.text:
                urls.append(loc.text.strip())
    except Exception as exc:
        logger.debug("Sitemap fetch failed for %s: %s", sitemap_url, exc)
    return urls


def _extract_links(html: str, base_url: str) -> list[str]:
    """Extract all internal links from an HTML page."""
    soup = BeautifulSoup(html, "lxml")
    links: list[str] = []
    for tag in soup.find_all("a", href=True):
        href = tag["href"]
        absolute = urljoin(base_url, href)
        normalised = _normalise_url(absolute)
        if (
            _is_same_origin(base_url, normalised)
            and not _SKIP_EXTENSIONS.search(normalised)
        ):
            links.append(normalised)
    return links


async def crawl(site_url: str, max_pages: int = 500) -> CrawlResult:
    """
    Crawl *site_url* and return up to *max_pages* pages.

    Strategy:
      1. Try sitemap.xml for an initial seed list.
      2. BFS-crawl following internal links.
    """
    result = CrawlResult()
    visited: set[str] = set()
    queue: list[str] = []

    async with httpx.AsyncClient(
        headers={"User-Agent": "OpenFeeder/1.0 (sidecar crawler)"},
        follow_redirects=True,
        timeout=20,
    ) as client:
        # Seed from sitemap
        sitemap_urls = await _fetch_sitemap(client, site_url)
        for u in sitemap_urls:
            normalised = _normalise_url(u)
            if normalised not in visited:
                queue.append(normalised)
                visited.add(normalised)

        # Always include the root
        root = _normalise_url(site_url)
        if root not in visited:
            queue.insert(0, root)
            visited.add(root)

        idx = 0
        while idx < len(queue) and len(result.pages) < max_pages:
            url = queue[idx]
            idx += 1

            try:
                resp = await client.get(url, timeout=15)
            except Exception as exc:
                result.errors.append(f"GET {url}: {exc}")
                continue

            content_type = resp.headers.get("content-type", "")
            if "text/html" not in content_type:
                continue

            if resp.status_code >= 400:
                result.errors.append(f"GET {url}: HTTP {resp.status_code}")
                continue

            page = Page(url=url, html=resp.text, status=resp.status_code)
            result.pages.append(page)
            logger.info("Crawled %s (%d/%d)", url, len(result.pages), max_pages)

            # Discover new links
            for link in _extract_links(resp.text, url):
                if link not in visited and len(visited) < max_pages * 2:
                    visited.add(link)
                    queue.append(link)

    logger.info(
        "Crawl complete: %d pages, %d errors", len(result.pages), len(result.errors)
    )
    return result
