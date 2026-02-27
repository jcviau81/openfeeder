/**
 * openfeeder_discover — check if a site supports OpenFeeder
 */

import { httpGet, parseJson, getOrigin } from "../utils/http.js";

export interface DiscoverResult {
  supported: boolean;
  openfeeder_url: string | null;
  capabilities: string[];
  discovery_method: string;
}

export async function discover(url: string, apiKey?: string): Promise<DiscoverResult> {
  const resolvedKey = apiKey || process.env.OPENFEEDER_API_KEY;
  const origin = getOrigin(url);

  // Method 1: .well-known/openfeeder.json
  try {
    const resp = await httpGet(`${origin}/.well-known/openfeeder.json`, undefined, resolvedKey);
    if (resp.ok) {
      const data = parseJson(resp.text) as Record<string, unknown> | null;
      if (data && data.version) {
        const feed = data.feed as { endpoint?: string } | undefined;
        const endpoint = feed?.endpoint || "/openfeeder";
        const feedUrl = endpoint.startsWith("http")
          ? endpoint
          : `${origin}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

        return {
          supported: true,
          openfeeder_url: feedUrl,
          capabilities: Array.isArray(data.capabilities) ? data.capabilities as string[] : [],
          discovery_method: "well-known",
        };
      }
    }
  } catch {
    // Continue to next method
  }

  // Method 2: HTTP headers on the URL itself
  try {
    const resp = await httpGet(url, undefined, resolvedKey);

    // Check Link header
    const linkHeader = resp.headers.get("link");
    if (linkHeader && /rel="alternate".*title="OpenFeeder"/i.test(linkHeader)) {
      const match = linkHeader.match(/<([^>]+)>/);
      if (match) {
        const feedUrl = match[1].startsWith("http")
          ? match[1]
          : `${origin}${match[1]}`;
        return {
          supported: true,
          openfeeder_url: feedUrl,
          capabilities: [],
          discovery_method: "link-header",
        };
      }
    }

    // Check X-OpenFeeder header
    const xHeader = resp.headers.get("x-openfeeder");
    if (xHeader) {
      return {
        supported: true,
        openfeeder_url: `${origin}/openfeeder`,
        capabilities: [],
        discovery_method: "x-openfeeder-header",
      };
    }

    // Method 3: HTML body meta/link tags
    const html = resp.text;

    // <meta name="openfeeder" content="...">
    const metaMatch = html.match(/<meta\s+name=["']openfeeder["'][^>]*content=["']([^"']+)["']/i);
    if (metaMatch) {
      const feedUrl = metaMatch[1].startsWith("http")
        ? metaMatch[1]
        : `${origin}${metaMatch[1]}`;
      return {
        supported: true,
        openfeeder_url: feedUrl,
        capabilities: [],
        discovery_method: "html-meta",
      };
    }

    // <link rel="alternate" type="application/json" title="OpenFeeder" href="...">
    const linkMatch = html.match(
      /<link[^>]*rel=["']alternate["'][^>]*title=["']OpenFeeder["'][^>]*href=["']([^"']+)["']/i
    );
    if (linkMatch) {
      const feedUrl = linkMatch[1].startsWith("http")
        ? linkMatch[1]
        : `${origin}${linkMatch[1]}`;
      return {
        supported: true,
        openfeeder_url: feedUrl,
        capabilities: [],
        discovery_method: "html-link",
      };
    }
  } catch {
    // Continue to next method
  }

  // Method 4: llms.txt
  try {
    const resp = await httpGet(`${origin}/llms.txt`, undefined, resolvedKey);
    if (resp.ok && /openfeeder\.json/i.test(resp.text)) {
      return {
        supported: true,
        openfeeder_url: `${origin}/openfeeder`,
        capabilities: [],
        discovery_method: "llms-txt",
      };
    }
  } catch {
    // Not found
  }

  return {
    supported: false,
    openfeeder_url: null,
    capabilities: [],
    discovery_method: "none",
  };
}
