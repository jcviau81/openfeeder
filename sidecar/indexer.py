"""
OpenFeeder Sidecar — ChromaDB Indexer

Stores chunked page content as embeddings in ChromaDB for semantic search.
Provides retrieval methods used by the API layer.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

from chunker import Chunk, ParsedPage

logger = logging.getLogger("openfeeder.indexer")

# ChromaDB metadata keys
META_URL = "url"
META_TITLE = "title"
META_AUTHOR = "author"
META_PUBLISHED = "published"
META_UPDATED = "updated"
META_LANGUAGE = "language"
META_SUMMARY = "summary"
META_CHUNK_TYPE = "chunk_type"
META_CHUNK_INDEX = "chunk_index"

COLLECTION_NAME = "openfeeder_chunks"
PAGES_COLLECTION = "openfeeder_pages"


@dataclass
class SearchResult:
    """A single search result with relevance score."""
    chunk_id: str
    text: str
    chunk_type: str
    relevance: float
    url: str
    title: str


class Indexer:
    """Manages the ChromaDB vector store for OpenFeeder content."""

    def __init__(self, persist_dir: str = "/data/chromadb", model_name: str = "all-MiniLM-L6-v2"):
        logger.info("Initialising ChromaDB at %s with model %s", persist_dir, model_name)
        self._client = chromadb.Client(Settings(
            persist_directory=persist_dir,
            is_persistent=True,
            anonymized_telemetry=False,
        ))
        self._model = SentenceTransformer(model_name)
        self._chunks_col = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        self._pages_col = self._client.get_or_create_collection(
            name=PAGES_COLLECTION,
        )

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    def index_page(self, page: ParsedPage) -> int:
        """
        Index a parsed page. Replaces any existing chunks for this URL.
        Returns the number of chunks indexed.
        """
        # Remove old chunks for this URL
        self._delete_page(page.url)

        if not page.chunks:
            return 0

        ids: list[str] = []
        documents: list[str] = []
        embeddings: list[list[float]] = []
        metadatas: list[dict] = []

        texts = [c.text for c in page.chunks]
        vectors = self._model.encode(texts, show_progress_bar=False).tolist()

        for idx, (chunk, vec) in enumerate(zip(page.chunks, vectors)):
            chunk_id = self._make_id(page.url, idx)
            ids.append(chunk_id)
            documents.append(chunk.text)
            embeddings.append(vec)
            metadatas.append({
                META_URL: page.url,
                META_TITLE: page.title,
                META_AUTHOR: page.author or "",
                META_PUBLISHED: page.published or "",
                META_UPDATED: page.updated or "",
                META_LANGUAGE: page.language,
                META_SUMMARY: page.summary[:500],
                META_CHUNK_TYPE: chunk.chunk_type,
                META_CHUNK_INDEX: idx,
            })

        self._chunks_col.upsert(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        # Store page-level metadata
        self._pages_col.upsert(
            ids=[self._page_id(page.url)],
            documents=[page.summary[:500]],
            embeddings=[vectors[0]],  # Use first chunk embedding as page embedding
            metadatas=[{
                META_URL: page.url,
                META_TITLE: page.title,
                META_AUTHOR: page.author or "",
                META_PUBLISHED: page.published or "",
                META_UPDATED: page.updated or "",
                META_LANGUAGE: page.language,
                META_SUMMARY: page.summary[:500],
                "chunk_count": len(page.chunks),
            }],
        )

        logger.info("Indexed %d chunks for %s", len(ids), page.url)
        return len(ids)

    def index_pages(self, pages: list[ParsedPage]) -> int:
        """Index multiple pages. Returns total chunks indexed."""
        total = 0
        for page in pages:
            total += self.index_page(page)
        return total

    def _delete_page(self, url: str) -> None:
        """Remove all chunks associated with a URL."""
        try:
            self._chunks_col.delete(where={META_URL: url})
        except Exception:
            pass  # Collection may be empty

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    def search(self, query: str, limit: int = 10, url_filter: str | None = None) -> list[SearchResult]:
        """
        Semantic search across all indexed chunks.

        Args:
            query: Natural language search query.
            limit: Max results to return.
            url_filter: Optional URL to restrict search to one page.

        Returns:
            List of SearchResult ordered by relevance (highest first).
        """
        query_vec = self._model.encode([query], show_progress_bar=False).tolist()
        where = {META_URL: url_filter} if url_filter else None

        results = self._chunks_col.query(
            query_embeddings=query_vec,
            n_results=min(limit, 50),
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        out: list[SearchResult] = []
        if not results["ids"] or not results["ids"][0]:
            return out

        for i, chunk_id in enumerate(results["ids"][0]):
            distance = results["distances"][0][i]
            # ChromaDB cosine distance is 1 - similarity
            relevance = round(max(0.0, 1.0 - distance), 4)
            meta = results["metadatas"][0][i]
            out.append(SearchResult(
                chunk_id=chunk_id,
                text=results["documents"][0][i],
                chunk_type=meta.get(META_CHUNK_TYPE, "paragraph"),
                relevance=relevance,
                url=meta.get(META_URL, ""),
                title=meta.get(META_TITLE, ""),
            ))

        return out

    def get_chunks_for_url(self, url: str, limit: int = 50) -> list[dict]:
        """
        Retrieve all chunks for a specific URL, ordered by chunk_index.
        Returns raw chunk dicts suitable for API response.
        """
        results = self._chunks_col.get(
            where={META_URL: url},
            include=["documents", "metadatas"],
            limit=limit,
        )

        if not results["ids"]:
            return []

        chunks = []
        for i, chunk_id in enumerate(results["ids"]):
            meta = results["metadatas"][i]
            chunks.append({
                "id": chunk_id,
                "text": results["documents"][i],
                "type": meta.get(META_CHUNK_TYPE, "paragraph"),
                "relevance": None,
            })

        # Sort by chunk_index to preserve page order
        chunks.sort(key=lambda c: c["id"])
        return chunks

    def get_page_meta(self, url: str) -> dict | None:
        """Get metadata for a specific page."""
        results = self._pages_col.get(
            ids=[self._page_id(url)],
            include=["metadatas"],
        )
        if results["ids"] and results["metadatas"]:
            return results["metadatas"][0]
        return None

    def get_all_pages(self, page: int = 1, limit: int = 20) -> tuple[list[dict], int]:
        """
        Get paginated index of all pages.
        Returns (items, total_count).
        """
        # Get all pages
        all_pages = self._pages_col.get(include=["metadatas"])
        if not all_pages["ids"]:
            return [], 0

        total = len(all_pages["ids"])
        items = []
        for meta in all_pages["metadatas"]:
            items.append({
                "url": meta.get(META_URL, ""),
                "title": meta.get(META_TITLE, ""),
                "published": meta.get(META_PUBLISHED, "") or None,
                "summary": meta.get(META_SUMMARY, ""),
            })

        # Sort by published date (newest first), with unpublished at end
        items.sort(key=lambda x: x.get("published") or "0000", reverse=True)

        # Paginate
        start = (page - 1) * limit
        end = start + limit
        return items[start:end], total

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_id(url: str, chunk_index: int) -> str:
        """Generate a deterministic chunk ID."""
        raw = f"{url}::chunk::{chunk_index}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    @staticmethod
    def _page_id(url: str) -> str:
        """Generate a deterministic page ID."""
        return hashlib.sha256(f"page::{url}".encode()).hexdigest()[:16]
