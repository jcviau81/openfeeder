/**
 * OpenFeeder Next.js Adapter — Gateway Session Store
 *
 * In-memory session store for LLM Gateway dialogue sessions.
 * Sessions auto-expire after TTL (default 5 minutes).
 */

import { randomBytes } from "crypto";

interface SessionEntry {
  data: Record<string, unknown>;
  created: number;
}

export class GatewaySessionStore {
  private _ttl: number;
  private _store = new Map<string, SessionEntry>();
  private _interval: ReturnType<typeof setInterval>;

  constructor(ttlMs = 300_000) {
    this._ttl = ttlMs;
    this._interval = setInterval(() => this._sweep(), 60_000);
    if (this._interval.unref) this._interval.unref();
  }

  create(data: Record<string, unknown>): string {
    const id = "gw_" + randomBytes(8).toString("hex");
    this._store.set(id, { data, created: Date.now() });
    return id;
  }

  get(id: string): Record<string, unknown> | null {
    const entry = this._store.get(id);
    if (!entry) return null;
    if (Date.now() - entry.created > this._ttl) {
      this._store.delete(id);
      return null;
    }
    return entry.data;
  }

  delete(id: string): void {
    this._store.delete(id);
  }

  private _sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this._store) {
      if (now - entry.created > this._ttl) {
        this._store.delete(id);
      }
    }
  }
}
