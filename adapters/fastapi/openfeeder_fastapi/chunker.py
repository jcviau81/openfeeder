"""
OpenFeeder FastAPI Adapter — Text chunker.

Strips HTML tags and splits content into ~500-word chunks aligned on
paragraph boundaries. Mirrors the behaviour of the Express/Next.js adapters.
"""

from __future__ import annotations

import hashlib
import re

WORDS_PER_CHUNK = 500


def clean_html(html: str) -> str:
    """Strip HTML tags and normalise whitespace."""
    # Remove HTML tags
    text = re.sub(r"<[^>]*>", " ", html)
    # Decode common HTML entities
    text = (
        text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
        .replace("&nbsp;", " ")
    )
    # Normalise whitespace — collapse spaces/tabs but preserve paragraph breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _count_words(text: str) -> int:
    return len([w for w in text.strip().split() if w])


def _detect_type(text: str) -> str:
    lines = text.strip().splitlines()
    total_lines = len(lines)

    # Heading: single short line
    if total_lines == 1 and _count_words(text) < 15:
        return "heading"

    # List: majority of lines start with bullet/number patterns
    list_lines = sum(
        1 for line in lines if re.match(r"^(\d+[.)]\s|[-*+]\s)", line.strip())
    )
    if total_lines > 0 and list_lines / total_lines >= 0.5:
        return "list"

    return "paragraph"


def chunk_content(html: str, url: str) -> list[dict]:
    """
    Clean HTML content and split into OpenFeeder-compliant chunks.

    Args:
        html: Raw HTML or plain text content
        url: Item URL (used for deterministic chunk IDs)

    Returns:
        List of chunk dicts with id, text, type, relevance
    """
    text = clean_html(html)
    if not text:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if not paragraphs:
        return []

    chunk_texts: list[str] = []
    current = ""
    current_words = 0

    for para in paragraphs:
        para_words = _count_words(para)

        if current_words > 0 and current_words + para_words > WORDS_PER_CHUNK:
            chunk_texts.append(current)
            current = para
            current_words = para_words
        else:
            current = para if current == "" else f"{current}\n\n{para}"
            current_words += para_words

    if current:
        chunk_texts.append(current)

    id_prefix = hashlib.md5(url.encode()).hexdigest()

    return [
        {
            "id": f"{id_prefix}_{i}",
            "text": chunk_text,
            "type": _detect_type(chunk_text),
            "relevance": None,
        }
        for i, chunk_text in enumerate(chunk_texts)
    ]


def summarise(html: str, words: int = 40) -> str:
    """Return a short summary (first ~40 words) from HTML content."""
    text = clean_html(html)
    word_list = [w for w in text.split() if w]
    if len(word_list) <= words:
        return text
    return " ".join(word_list[:words]) + "..."
