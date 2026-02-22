"""
OpenFeeder Sidecar — Content Chunker

Takes raw HTML and produces clean, typed text chunks suitable for
embedding and LLM consumption. Strips ads, nav, boilerplate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from bs4 import BeautifulSoup, Tag


@dataclass
class Chunk:
    """A single content chunk extracted from a page."""
    text: str
    chunk_type: str  # paragraph | heading | list | code | quote


@dataclass
class ParsedPage:
    """Cleaned, chunked representation of one web page."""
    url: str
    title: str
    author: str | None
    published: str | None
    updated: str | None
    language: str
    summary: str
    chunks: list[Chunk]


# Tags to remove entirely (boilerplate / noise)
_STRIP_TAGS = {"nav", "header", "footer", "aside", "script", "style", "ins", "iframe", "noscript"}

# Class substrings that indicate noise elements
_NOISE_CLASSES = re.compile(
    r"(ad\b|ads\b|advert|banner|cookie|sidebar|menu|social|share|comment|popup|modal|newsletter|promo)",
    re.IGNORECASE,
)

# Maximum characters per chunk before splitting
_MAX_CHUNK_LEN = 1500


def _is_noise_element(tag: Tag) -> bool:
    """Return True if the element looks like non-content noise."""
    classes = " ".join(tag.get("class", []))
    el_id = tag.get("id", "")
    role = tag.get("role", "")
    return bool(
        _NOISE_CLASSES.search(classes)
        or _NOISE_CLASSES.search(el_id)
        or role in ("navigation", "banner", "complementary")
    )


def _clean_text(text: str) -> str:
    """Collapse whitespace and strip leading/trailing space."""
    return re.sub(r"\s+", " ", text).strip()


def _split_long_text(text: str, chunk_type: str, max_len: int = _MAX_CHUNK_LEN) -> list[Chunk]:
    """Split text that exceeds max_len into multiple chunks at sentence boundaries."""
    if len(text) <= max_len:
        return [Chunk(text=text, chunk_type=chunk_type)]

    chunks: list[Chunk] = []
    sentences = re.split(r"(?<=[.!?])\s+", text)
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > max_len:
            chunks.append(Chunk(text=current.strip(), chunk_type=chunk_type))
            current = ""
        current += (" " if current else "") + sentence
    if current.strip():
        chunks.append(Chunk(text=current.strip(), chunk_type=chunk_type))
    return chunks


def _extract_meta(soup: BeautifulSoup) -> dict:
    """Extract metadata (author, published, language) from the document."""
    meta: dict = {"author": None, "published": None, "language": "en"}

    # Language
    html_tag = soup.find("html")
    if html_tag and html_tag.get("lang"):
        meta["language"] = html_tag["lang"].split("-")[0] + (
            "-" + html_tag["lang"].split("-")[1] if "-" in html_tag["lang"] else ""
        )

    # Author
    author_tag = soup.find("meta", attrs={"name": "author"})
    if author_tag and author_tag.get("content"):
        meta["author"] = author_tag["content"]

    # Published date
    for attr in ("article:published_time", "datePublished", "date"):
        tag = soup.find("meta", attrs={"property": attr}) or soup.find("meta", attrs={"name": attr})
        if tag and tag.get("content"):
            meta["published"] = tag["content"]
            break
    # Try <time> element
    if not meta["published"]:
        time_tag = soup.find("time", attrs={"datetime": True})
        if time_tag:
            meta["published"] = time_tag["datetime"]

    return meta


def chunk_html(url: str, html: str) -> ParsedPage:
    """
    Parse HTML and extract clean, typed content chunks.

    Strips all noise elements (ads, nav, boilerplate) and returns
    structured chunks suitable for embedding and LLM consumption.
    """
    soup = BeautifulSoup(html, "lxml")

    # Extract metadata before stripping
    meta = _extract_meta(soup)

    # Title
    title = ""
    title_tag = soup.find("title")
    if title_tag:
        title = _clean_text(title_tag.get_text())
    # Prefer h1 if available
    h1 = soup.find("h1")
    if h1:
        title = _clean_text(h1.get_text())

    # Remove noise elements
    for tag_name in _STRIP_TAGS:
        for el in soup.find_all(tag_name):
            el.decompose()
    for el in soup.find_all(_is_noise_element):
        el.decompose()

    # Find the main content area (prefer <main> or <article>)
    content_root = soup.find("main") or soup.find("article") or soup.find("body")
    if not content_root:
        content_root = soup

    # Extract chunks from content
    chunks: list[Chunk] = []
    seen_texts: set[str] = set()

    for el in content_root.descendants:
        if not isinstance(el, Tag):
            continue

        text = _clean_text(el.get_text())
        if not text or len(text) < 20 or text in seen_texts:
            continue

        # Determine chunk type
        tag = el.name
        chunk_type = "paragraph"
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            chunk_type = "heading"
        elif tag in ("ul", "ol"):
            chunk_type = "list"
        elif tag in ("pre", "code"):
            chunk_type = "code"
            # For code, preserve original whitespace
            text = el.get_text().strip()
            if not text:
                continue
        elif tag == "blockquote":
            chunk_type = "quote"
        elif tag == "p":
            chunk_type = "paragraph"
        elif tag in ("li",):
            # Individual list items get folded into parent <ul>/<ol>
            continue
        elif tag in ("div", "section", "article", "main"):
            # Container tags — skip to avoid duplicating child content
            continue
        else:
            continue

        seen_texts.add(text)
        chunks.extend(_split_long_text(text, chunk_type))

    # Build summary from first few paragraph chunks
    summary_parts: list[str] = []
    for c in chunks:
        if c.chunk_type == "paragraph":
            summary_parts.append(c.text)
            if len(" ".join(summary_parts)) > 300:
                break
    summary = " ".join(summary_parts)[:500] if summary_parts else title

    return ParsedPage(
        url=url,
        title=title,
        author=meta["author"],
        published=meta["published"],
        updated=datetime.now(timezone.utc).isoformat(),
        language=meta["language"],
        summary=summary,
        chunks=chunks,
    )
