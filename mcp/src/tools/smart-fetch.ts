/**
 * smart_fetch — automatically detect OpenFeeder, use it if available, fallback to HTML
 */

import { discover } from "./discover.js";
import { list } from "./list.js";
import { search } from "./search.js";
import { resolveEndpoint } from "../utils/resolve.js";
import { httpGet } from "../utils/http.js";

export interface SmartFetchInput {
  url: string;
  query?: string;
  api_key?: string;
}

export interface SmartFetchResult {
  method: string;
  openfeeder_supported: boolean;
  url: string;
  content: unknown;
}

export async function smartFetch(input: SmartFetchInput): Promise<SmartFetchResult> {
  const apiKey = input.api_key || process.env.OPENFEEDER_API_KEY;
  const discoveryResult = await discover(input.url, apiKey);

  if (discoveryResult.supported) {
    // Detect if this is a specific page (not root)
    const parsedUrl = new URL(input.url);
    const isSpecificPage = parsedUrl.pathname !== "/" && parsedUrl.pathname !== "";

    // Has query → search (optionally filtered to specific page)
    if (input.query) {
      const results = await search({
        url: input.url,
        query: input.query,
        api_key: apiKey,
      });
      return {
        method: "openfeeder_search",
        openfeeder_supported: true,
        url: input.url,
        content: results,
      };
    }

    // Specific page, no query → fetch page chunks via ?url=
    if (isSpecificPage) {
      const endpoint = await resolveEndpoint(input.url, apiKey);
      if (endpoint) {
        const pageEndpoint = `${endpoint}?url=${encodeURIComponent(input.url)}&limit=50`;
        const resp = await httpGet(pageEndpoint, 15_000, apiKey);
        if (resp.status === 200) {
          return {
            method: "openfeeder_page",
            openfeeder_supported: true,
            url: input.url,
            content: JSON.parse(resp.text),
          };
        }
      }
    }

    // Root URL, no query → use list
    const results = await list({ url: input.url, api_key: apiKey });
    return {
      method: "openfeeder_list",
      openfeeder_supported: true,
      url: input.url,
      content: results,
    };
  }

  // Fallback: fetch raw HTML
  try {
    const resp = await httpGet(input.url, 15_000, apiKey);
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
