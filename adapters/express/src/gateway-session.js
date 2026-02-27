"use strict";

const crypto = require("crypto");

/**
 * In-memory session store for LLM Gateway dialogue sessions.
 * Sessions auto-expire after TTL (default 5 minutes).
 */
class GatewaySessionStore {
  constructor(ttlMs = 300_000) {
    this._ttl = ttlMs;
    this._store = new Map();
    this._cleanupInterval = setInterval(() => this._sweep(), 60_000);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Create a new session with the given data.
   * @param {object} data - Context data to store
   * @returns {string} 16-char hex session ID prefixed with "gw_"
   */
  create(data) {
    const id = "gw_" + crypto.randomBytes(8).toString("hex");
    this._store.set(id, { data, created: Date.now() });
    return id;
  }

  /**
   * Retrieve session data by ID. Returns null if expired or not found.
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    const entry = this._store.get(id);
    if (!entry) return null;
    if (Date.now() - entry.created > this._ttl) {
      this._store.delete(id);
      return null;
    }
    return entry.data;
  }

  /**
   * Delete a session (cleanup after use).
   * @param {string} id
   */
  delete(id) {
    this._store.delete(id);
  }

  /**
   * Remove all expired sessions from the store.
   */
  _sweep() {
    const now = Date.now();
    for (const [id, entry] of this._store) {
      if (now - entry.created > this._ttl) {
        this._store.delete(id);
      }
    }
  }
}

module.exports = { GatewaySessionStore };
