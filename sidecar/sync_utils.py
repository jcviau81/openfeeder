"""
OpenFeeder Sidecar — Differential Sync Utilities

Standalone helpers for sync_token encoding/decoding, tombstone management,
and ?since= parameter parsing. Kept separate from main.py so they can be
imported in unit tests without heavy dependencies (ChromaDB, apscheduler, etc.).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from datetime import datetime, timezone

logger = logging.getLogger("openfeeder.sync")

# ---------------------------------------------------------------------------
# sync_token helpers
# ---------------------------------------------------------------------------


def encode_sync_token(as_of_iso: str) -> str:
    """Encode a timestamp into an opaque sync_token."""
    payload = json.dumps({"t": as_of_iso})
    return base64.b64encode(payload.encode()).decode()


def decode_sync_token(token: str) -> float | None:
    """Decode a sync_token to a Unix timestamp, or return None on failure."""
    try:
        payload = json.loads(base64.b64decode(token))
        dt = datetime.fromisoformat(payload["t"])
        return dt.timestamp()
    except Exception:
        return None


def parse_since(raw: str) -> float | None:
    """Parse a ?since= value — accepts RFC 3339 datetime or sync_token."""
    # Try RFC 3339 first
    try:
        dt = datetime.fromisoformat(raw)
        return dt.timestamp()
    except (ValueError, TypeError):
        pass
    # Try sync_token
    return decode_sync_token(raw)


# ---------------------------------------------------------------------------
# Tombstone store for deleted pages (differential sync)
# ---------------------------------------------------------------------------

TOMBSTONE_PATH = "/app/data/tombstones.json"
_tombstones: dict[str, str] = {}  # {url: deleted_at_iso}


def _load_tombstones(path: str | None = None) -> None:
    """Load tombstones from disk (best-effort)."""
    global _tombstones
    p = path or TOMBSTONE_PATH
    try:
        with open(p, "r") as f:
            _tombstones = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        _tombstones = {}


def _save_tombstones(path: str | None = None) -> None:
    """Persist tombstones to disk (best-effort, FIFO cap at 1000)."""
    global _tombstones
    p = path or TOMBSTONE_PATH
    # FIFO cap: keep newest 1000
    if len(_tombstones) > 1000:
        sorted_items = sorted(_tombstones.items(), key=lambda x: x[1])
        _tombstones = dict(sorted_items[-1000:])
    os.makedirs(os.path.dirname(p), exist_ok=True)
    try:
        with open(p, "w") as f:
            json.dump(_tombstones, f)
    except OSError:
        logger.warning("Could not persist tombstones to %s", p)


def add_tombstone(url: str, path: str | None = None) -> None:
    """Record a deletion tombstone."""
    _tombstones[url] = datetime.now(timezone.utc).isoformat()
    _save_tombstones(path)


def get_tombstones_since(since_ts: float) -> list[dict]:
    """Return tombstones where deleted_at >= since_ts."""
    result = []
    for url, deleted_at_iso in _tombstones.items():
        try:
            dt = datetime.fromisoformat(deleted_at_iso)
            if dt.timestamp() >= since_ts:
                result.append({"url": url, "deleted_at": deleted_at_iso})
        except (ValueError, TypeError):
            pass
    return result
