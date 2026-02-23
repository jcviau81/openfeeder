/**
 * smart_fetch — automatically detect OpenFeeder, use it if available, fallback to HTML
 */

import { discover } from "./discover.js";
import { list } from "./list.js";
import { search } from "./search.js";
import { httpGet } from "../utils/http.js";

export interface SmartFetchInput {
  url: string;
  query?: string;
}

export interface SmartFetchResult {
  method: string;
  openfeeder_supported: boolean;
  url: string;
  content: unknown;
}

export async function smartFetch(input: SmartFetchInput): Promise<SmartFetchResult> {
  const discoveryResult = await discover(input.url);

  if (discoveryResult.supported) {
    // OpenFeeder is available
    if (input.query) {
      // Has query → use search
      const results = await search({
        url: input.url,
        query: input.query,
      });
      return {
        method: "openfeeder_search",
        openfeeder_supported: true,
        url: input.url,
        content: results,
      };
    }

    // No query → use list
    const results = await list({ url: input.url });
    return {
      method: "openfeeder_list",
      openfeeder_supported: true,
      url: input.url,
      content: results,
    };
  }

  // Fallback: fetch raw HTML
  try {
    const resp = await httpGet(input.url, 15_000);
    return {
      method: "html_fallback",
      openfeeder_supported: false,
      url: input.url,
      content: {
        status: resp.status,
        content_type: resp.headers.get("content-type") || "unknown",
        body: resp.text.slice(0, 50_000), // Cap at 50KB to avoid huge payloads
      },
    };
  } catch (err) {
    return {
      method: "html_fallback",
      openfeeder_supported: false,
      url: input.url,
      content: {
        error: `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}
