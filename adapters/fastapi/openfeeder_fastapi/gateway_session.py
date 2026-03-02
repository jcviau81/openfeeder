"""
OpenFeeder FastAPI Adapter — Gateway Session Store

In-memory session store for LLM Gateway dialogue sessions.
Sessions auto-expire after TTL (default 5 minutes).
"""

from __future__ import annotations

import secrets
import time
import threading
from typing import Any


class GatewaySessionStore:
    """Thread-safe in-memory session store with TTL expiry."""

    def __init__(self, ttl_seconds: int = 300) -> None:
        self._ttl = ttl_seconds
        self._store: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        # Background sweep every 60s
        self._timer = threading.Timer(60.0, self._sweep)
        self._timer.daemon = True
        self._timer.start()

    def create(self, data: dict[str, Any]) -> str:
        """Create a new session. Returns 'gw_' prefixed hex ID."""
        session_id = "gw_" + secrets.token_hex(8)
        with self._lock:
            self._store[session_id] = {"data": data, "created": time.time()}
        return session_id

    def get(self, session_id: str) -> dict[str, Any] | None:
        """Retrieve session data by ID. Returns None if expired or not found."""
        with self._lock:
            entry = self._store.get(session_id)
            if entry is None:
                return None
            if time.time() - entry["created"] > self._ttl:
                del self._store[session_id]
                return None
            return entry["data"]

    def delete(self, session_id: str) -> None:
        """Delete a session after use."""
        with self._lock:
            self._store.pop(session_id, None)

    def _sweep(self) -> None:
        """Remove expired sessions."""
        now = time.time()
        with self._lock:
            expired = [
                sid for sid, entry in self._store.items()
                if now - entry["created"] > self._ttl
            ]
            for sid in expired:
                del self._store[sid]
        # Reschedule
        self._timer = threading.Timer(60.0, self._sweep)
        self._timer.daemon = True
        self._timer.start()
