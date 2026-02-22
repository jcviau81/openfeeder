"""
OpenFeeder Sidecar — Content Chunker

Takes raw HTML and produces clean, typed text chunks suitable for
embedding and LLM consumption. Strips ads, nav, boilerplate.

Metadata extraction priority:
  1. JSON-LD (<script type="application/ld+json">)
  2. OpenGraph / Twitter meta tags
  3. HTML fallback (title, meta description, h1)
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from bs4 import BeautifulSoup, Tag


@dataclass
class Chunk:
    """A single content chunk extracted from a page."""
    text: str
    chunk_type: str  # paragraph | heading | list | code | quote | ingredients | instructions


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
    metadata: dict = field(default_factory=dict)


# Tags to remove entirely (boilerplate / noise)
_STRIP_TAGS = {"nav", "header", "footer", "aside", "script", "style", "ins", "iframe", "noscript"}

# Class substrings that indicate noise elements
_NOISE_CLASSES = re.compile(
    r"(ad\b|ads\b|advert|banner|cookie|sidebar|menu|social|share|comment|popup|modal|newsletter|promo)",
    re.IGNORECASE,
)

# Maximum characters per chunk before splitting
_MAX_CHUNK_LEN = 1500

# Regex to find JSON-LD script tags (handles both single and double quotes on type attribute)
_JSONLD_RE = re.compile(
    r"""<script[^>]*type\s*=\s*['"]application/ld\+json['"][^>]*>(.*?)</script>""",
    re.DOTALL | re.IGNORECASE,
)

# ISO 8601 duration pattern (P[nD]T[nH][nM][nS])
_ISO_DURATION_RE = re.compile(
    r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$",
    re.IGNORECASE,
)


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


# ---------------------------------------------------------------------------
# ISO 8601 Duration Parser
# ---------------------------------------------------------------------------

def parse_iso_duration(duration: str) -> str:
    """Parse an ISO 8601 duration string into a human-readable form.

    Examples:
        PT25M       → "25 min"
        PT1H30M     → "1h 30 min"
        P1DT2H      → "1d 2h"
        PT1H        → "1h"
        PT45S        → "45s"
    """
    if not duration:
        return ""
    m = _ISO_DURATION_RE.match(duration.strip())
    if not m:
        return duration  # return raw if unparseable
    days, hours, minutes, seconds = (int(v) if v else 0 for v in m.groups())
    parts: list[str] = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes} min")
    if seconds:
        parts.append(f"{seconds}s")
    return " ".join(parts) if parts else duration


# ---------------------------------------------------------------------------
# Author Extraction Helper
# ---------------------------------------------------------------------------

def _extract_author(author_val) -> str | None:
    """Normalize author from JSON-LD (can be string, dict, or list)."""
    if not author_val:
        return None
    if isinstance(author_val, str):
        return author_val
    if isinstance(author_val, dict):
        return author_val.get("name") or author_val.get("@id")
    if isinstance(author_val, list):
        names = [_extract_author(a) for a in author_val]
        return ", ".join(n for n in names if n) or None
    return None


# ---------------------------------------------------------------------------
# JSON-LD Extraction Helpers (per @type)
# ---------------------------------------------------------------------------

def _flatten_instructions(instructions) -> list[str]:
    """Flatten HowToSection/HowToStep structures to a list of plain strings."""
    if not instructions:
        return []
    if isinstance(instructions, str):
        return [instructions]

    result: list[str] = []
    items = instructions if isinstance(instructions, list) else [instructions]
    for item in items:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            item_type = item.get("@type", "")
            if item_type == "HowToSection":
                section_name = item.get("name", "")
                if section_name:
                    result.append(f"## {section_name}")
                result.extend(_flatten_instructions(item.get("itemListElement", [])))
            elif item_type == "HowToStep":
                text = item.get("text", "")
                if text:
                    result.append(text)
            else:
                text = item.get("text", "")
                if text:
                    result.append(text)
    return result


def _extract_keywords(val) -> list[str]:
    """Normalize keywords from JSON-LD (string or list)."""
    if not val:
        return []
    if isinstance(val, list):
        return [str(k).strip() for k in val if str(k).strip()]
    if isinstance(val, str):
        return [k.strip() for k in val.split(",") if k.strip()]
    return []


def _map_recipe(ld: dict) -> dict:
    """Map a Recipe JSON-LD object to our metadata format."""
    extra: dict = {}

    if ld.get("recipeIngredient"):
        extra["ingredients"] = ld["recipeIngredient"]
    instructions = _flatten_instructions(ld.get("recipeInstructions"))
    if instructions:
        extra["instructions"] = instructions

    for time_field in ("prepTime", "cookTime", "totalTime"):
        if ld.get(time_field):
            extra[time_field] = parse_iso_duration(ld[time_field])

    agg = ld.get("aggregateRating")
    if isinstance(agg, dict):
        if agg.get("ratingValue"):
            extra["rating"] = agg["ratingValue"]
        if agg.get("ratingCount"):
            extra["rating_count"] = agg["ratingCount"]
        if agg.get("reviewCount"):
            extra["rating_count"] = extra.get("rating_count") or agg["reviewCount"]

    if ld.get("recipeCategory"):
        extra["category"] = ld["recipeCategory"]
    if ld.get("recipeYield"):
        extra["yield"] = ld["recipeYield"]
    if ld.get("recipeSubCategories"):
        extra["sub_categories"] = ld["recipeSubCategories"]

    return {
        "title": ld.get("name"),
        "description": ld.get("description"),
        "author": _extract_author(ld.get("author")),
        "published": ld.get("datePublished"),
        "modified": ld.get("dateModified"),
        "keywords": _extract_keywords(ld.get("keywords")),
        "image": ld.get("image", [None])[0] if isinstance(ld.get("image"), list) else ld.get("image"),
        "type": "recipe",
        "schema_type": ld.get("@type"),
        "extra": extra,
    }


def _map_article(ld: dict) -> dict:
    """Map an Article/NewsArticle JSON-LD object to our metadata format."""
    return {
        "title": ld.get("headline") or ld.get("name"),
        "description": ld.get("description"),
        "author": _extract_author(ld.get("author")),
        "published": ld.get("datePublished"),
        "modified": ld.get("dateModified"),
        "keywords": _extract_keywords(ld.get("keywords")),
        "image": ld.get("image", [None])[0] if isinstance(ld.get("image"), list) else ld.get("image"),
        "type": "article",
        "schema_type": ld.get("@type"),
        "extra": {"articleSection": ld.get("articleSection")} if ld.get("articleSection") else {},
    }


def _map_product(ld: dict) -> dict:
    """Map a Product JSON-LD object to our metadata format."""
    extra: dict = {}
    brand = ld.get("brand")
    if isinstance(brand, dict):
        extra["brand"] = brand.get("name")
    elif isinstance(brand, str):
        extra["brand"] = brand

    offers = ld.get("offers")
    if isinstance(offers, dict):
        if offers.get("price"):
            extra["price"] = offers["price"]
        if offers.get("priceCurrency"):
            extra["currency"] = offers["priceCurrency"]
        if offers.get("availability"):
            extra["availability"] = offers["availability"]
    elif isinstance(offers, list) and offers:
        first = offers[0]
        if isinstance(first, dict):
            if first.get("price"):
                extra["price"] = first["price"]
            if first.get("priceCurrency"):
                extra["currency"] = first["priceCurrency"]
            if first.get("availability"):
                extra["availability"] = first["availability"]

    agg = ld.get("aggregateRating")
    if isinstance(agg, dict):
        if agg.get("ratingValue"):
            extra["rating"] = agg["ratingValue"]
        if agg.get("ratingCount"):
            extra["rating_count"] = agg["ratingCount"]

    return {
        "title": ld.get("name"),
        "description": ld.get("description"),
        "author": None,
        "published": None,
        "modified": None,
        "keywords": _extract_keywords(ld.get("keywords")),
        "image": ld.get("image", [None])[0] if isinstance(ld.get("image"), list) else ld.get("image"),
        "type": "product",
        "schema_type": ld.get("@type"),
        "extra": extra,
    }


def _map_event(ld: dict) -> dict:
    """Map an Event JSON-LD object to our metadata format."""
    extra: dict = {}
    location = ld.get("location")
    if isinstance(location, dict):
        extra["location"] = location.get("name")
    elif isinstance(location, str):
        extra["location"] = location
    if ld.get("startDate"):
        extra["startDate"] = ld["startDate"]
    if ld.get("endDate"):
        extra["endDate"] = ld["endDate"]

    return {
        "title": ld.get("name"),
        "description": ld.get("description"),
        "author": None,
        "published": None,
        "modified": None,
        "keywords": _extract_keywords(ld.get("keywords")),
        "image": ld.get("image", [None])[0] if isinstance(ld.get("image"), list) else ld.get("image"),
        "type": "event",
        "schema_type": ld.get("@type"),
        "extra": extra,
    }


def _map_default(ld: dict) -> dict:
    """Map a generic JSON-LD object (WebPage, etc.) to our metadata format."""
    return {
        "title": ld.get("name") or ld.get("headline"),
        "description": ld.get("description"),
        "author": _extract_author(ld.get("author")),
        "published": ld.get("datePublished"),
        "modified": ld.get("dateModified"),
        "keywords": _extract_keywords(ld.get("keywords")),
        "image": ld.get("image", [None])[0] if isinstance(ld.get("image"), list) else ld.get("image"),
        "type": "page",
        "schema_type": ld.get("@type"),
        "extra": {},
    }


# Map of @type values to their handler functions
_TYPE_MAP: dict[str, callable] = {
    "Recipe": _map_recipe,
    "Article": _map_article,
    "NewsArticle": _map_article,
    "BlogPosting": _map_article,
    "Product": _map_product,
    "Event": _map_event,
    "WebPage": _map_default,
}


# ---------------------------------------------------------------------------
# JSON-LD Extraction
# ---------------------------------------------------------------------------

def _extract_jsonld(html: str) -> dict | None:
    """Extract and parse the best JSON-LD block from raw HTML.

    Uses regex to match <script type='application/ld+json'> (single or double quotes).
    Returns the parsed dict for the most interesting @type, or None.
    """
    matches = _JSONLD_RE.findall(html)
    if not matches:
        return None

    candidates: list[dict] = []
    for raw in matches:
        try:
            data = json.loads(raw.strip())
        except (json.JSONDecodeError, ValueError):
            continue

        # Handle @graph patterns
        if isinstance(data, dict) and "@graph" in data:
            for item in data["@graph"]:
                if isinstance(item, dict):
                    candidates.append(item)
        elif isinstance(data, list):
            candidates.extend(d for d in data if isinstance(d, dict))
        elif isinstance(data, dict):
            candidates.append(data)

    if not candidates:
        return None

    # Priority: Recipe > Article/NewsArticle > Product > Event > anything else
    priority = ["Recipe", "Article", "NewsArticle", "BlogPosting", "Product", "Event"]
    for ptype in priority:
        for c in candidates:
            raw_type = c.get("@type", "")
            # @type can be a string or list
            types = raw_type if isinstance(raw_type, list) else [raw_type]
            if ptype in types:
                return c

    # Return first candidate if none matched priority
    return candidates[0] if candidates else None


# ---------------------------------------------------------------------------
# OpenGraph / Twitter Card Extraction
# ---------------------------------------------------------------------------

def _extract_opengraph(soup: BeautifulSoup) -> dict:
    """Extract OpenGraph and Twitter Card metadata from the page."""
    meta: dict = {
        "title": None,
        "description": None,
        "author": None,
        "published": None,
        "modified": None,
        "keywords": [],
        "image": None,
        "type": "page",
        "schema_type": None,
        "extra": {},
    }

    def _og(prop: str) -> str | None:
        tag = soup.find("meta", attrs={"property": f"og:{prop}"})
        return tag["content"] if tag and tag.get("content") else None

    def _twitter(name: str) -> str | None:
        tag = soup.find("meta", attrs={"name": f"twitter:{name}"})
        return tag["content"] if tag and tag.get("content") else None

    meta["title"] = _og("title") or _twitter("title")
    meta["description"] = _og("description") or _twitter("description")
    meta["image"] = _og("image") or _twitter("image")

    og_type = _og("type")
    if og_type:
        meta["type"] = og_type

    # article:author
    author_tag = soup.find("meta", attrs={"property": "article:author"})
    if author_tag and author_tag.get("content"):
        meta["author"] = author_tag["content"]

    # article:published_time
    pub_tag = soup.find("meta", attrs={"property": "article:published_time"})
    if pub_tag and pub_tag.get("content"):
        meta["published"] = pub_tag["content"]

    mod_tag = soup.find("meta", attrs={"property": "article:modified_time"})
    if mod_tag and mod_tag.get("content"):
        meta["modified"] = mod_tag["content"]

    # article:tag for keywords
    for tag in soup.find_all("meta", attrs={"property": "article:tag"}):
        if tag.get("content"):
            meta["keywords"].append(tag["content"])

    # Check if we got anything useful
    if not meta["title"] and not meta["description"] and not meta["image"]:
        return {}

    return meta


# ---------------------------------------------------------------------------
# HTML Fallback Extraction
# ---------------------------------------------------------------------------

def _extract_html_meta(soup: BeautifulSoup) -> dict:
    """Extract metadata from basic HTML elements (title, meta description, h1)."""
    meta: dict = {
        "title": None,
        "description": None,
        "author": None,
        "published": None,
        "modified": None,
        "keywords": [],
        "image": None,
        "type": "page",
        "schema_type": None,
        "extra": {},
    }

    # Title
    title_tag = soup.find("title")
    if title_tag:
        meta["title"] = _clean_text(title_tag.get_text())
    h1 = soup.find("h1")
    if h1:
        meta["title"] = _clean_text(h1.get_text())

    # Meta description
    desc_tag = soup.find("meta", attrs={"name": "description"})
    if desc_tag and desc_tag.get("content"):
        meta["description"] = desc_tag["content"]

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
    if not meta["published"]:
        time_tag = soup.find("time", attrs={"datetime": True})
        if time_tag:
            meta["published"] = time_tag["datetime"]

    # Keywords meta tag
    kw_tag = soup.find("meta", attrs={"name": "keywords"})
    if kw_tag and kw_tag.get("content"):
        meta["keywords"] = [k.strip() for k in kw_tag["content"].split(",") if k.strip()]

    return meta


# ---------------------------------------------------------------------------
# Unified Metadata Extraction
# ---------------------------------------------------------------------------

def extract_metadata(html: str, url: str) -> dict:
    """Extract structured metadata from HTML using JSON-LD, OpenGraph, and HTML fallback.

    Priority:
      1. JSON-LD (highest fidelity, typed)
      2. OpenGraph / Twitter Card tags
      3. HTML meta tags / title / h1 (lowest)

    Returns a dict with keys:
      title, description, author, published, modified, keywords (list),
      image, type (normalized), schema_type (raw @type), extra (dict)
    """
    soup = BeautifulSoup(html, "lxml")

    # 1. Try JSON-LD
    ld = _extract_jsonld(html)
    if ld:
        raw_type = ld.get("@type", "")
        types = raw_type if isinstance(raw_type, list) else [raw_type]
        for t in types:
            if t in _TYPE_MAP:
                meta = _TYPE_MAP[t](ld)
                break
        else:
            meta = _map_default(ld)

        # Fill in blanks from OpenGraph
        og = _extract_opengraph(soup)
        if og:
            for key in ("title", "description", "author", "published", "image"):
                if not meta.get(key) and og.get(key):
                    meta[key] = og[key]
        return meta

    # 2. Try OpenGraph
    og = _extract_opengraph(soup)
    if og:
        # Fill in blanks from HTML
        html_meta = _extract_html_meta(soup)
        for key in ("title", "description", "author", "published"):
            if not og.get(key) and html_meta.get(key):
                og[key] = html_meta[key]
        return og

    # 3. HTML fallback
    return _extract_html_meta(soup)


# ---------------------------------------------------------------------------
# Legacy HTML-only metadata extraction (used internally by chunk_html)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Main Chunking Function
# ---------------------------------------------------------------------------

def chunk_html(url: str, html: str) -> ParsedPage:
    """
    Parse HTML and extract clean, typed content chunks.

    Strips all noise elements (ads, nav, boilerplate) and returns
    structured chunks suitable for embedding and LLM consumption.

    Uses JSON-LD / OpenGraph metadata when available for richer extraction.
    For Recipe pages, adds dedicated ingredient and instruction chunks.
    """
    # Extract structured metadata first (before soup modifies HTML)
    rich_meta = extract_metadata(html, url)

    soup = BeautifulSoup(html, "lxml")

    # Extract legacy metadata for language detection
    legacy_meta = _extract_meta(soup)

    # Use rich metadata for title/author/published, fall back to legacy
    title = rich_meta.get("title") or ""
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            title = _clean_text(title_tag.get_text())
        h1 = soup.find("h1")
        if h1:
            title = _clean_text(h1.get_text())

    author = rich_meta.get("author") or legacy_meta["author"]
    published = rich_meta.get("published") or legacy_meta["published"]

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

    # Add dedicated chunks for Recipe metadata from JSON-LD
    extra = rich_meta.get("extra", {})
    if rich_meta.get("type") == "recipe":
        ingredients = extra.get("ingredients")
        if ingredients and isinstance(ingredients, list):
            ingr_text = "Ingredients:\n" + "\n".join(f"- {i}" for i in ingredients)
            chunks.insert(0, Chunk(text=ingr_text, chunk_type="ingredients"))

        instructions = extra.get("instructions")
        if instructions and isinstance(instructions, list):
            instr_text = "Instructions:\n" + "\n".join(
                f"{i+1}. {step}" for i, step in enumerate(instructions)
            )
            # Insert after ingredients if present, else at start
            insert_pos = 1 if ingredients else 0
            chunks.insert(insert_pos, Chunk(text=instr_text, chunk_type="instructions"))

    # Build summary from first few paragraph chunks
    summary_parts: list[str] = []
    for c in chunks:
        if c.chunk_type == "paragraph":
            summary_parts.append(c.text)
            if len(" ".join(summary_parts)) > 300:
                break
    summary = " ".join(summary_parts)[:500] if summary_parts else (rich_meta.get("description") or title)

    return ParsedPage(
        url=url,
        title=title,
        author=author,
        published=published,
        updated=datetime.now(timezone.utc).isoformat(),
        language=legacy_meta["language"],
        summary=summary,
        chunks=chunks,
        metadata=rich_meta,
    )
