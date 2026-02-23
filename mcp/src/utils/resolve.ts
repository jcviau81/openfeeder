/**
 * Resolve the OpenFeeder endpoint URL from any given URL.
 * Uses the discovery result to find the feed endpoint.
 */

import { discover, DiscoverResult } from "../tools/discover.js";

let discoveryCache = new Map<string, { result: DiscoverResult; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function resolveEndpoint(url: string): Promise<string | null> {
  // If the URL already ends with /openfeeder, use it directly
  const parsed = new URL(url);
  if (parsed.pathname.endsWith("/openfeeder")) {
    return url.split("?")[0];
  }

  const origin = parsed.origin;
  const cached = discoveryCache.get(origin);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result.openfeeder_url;
  }

  const result = await discover(url);
  discoveryCache.set(origin, { result, ts: Date.now() });

  return result.openfeeder_url;
}

export function clearCache(): void {
  discoveryCache = new Map();
}
