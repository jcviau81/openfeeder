/**
 * OpenFeeder Astro Adapter — Discovery handler
 *
 * Responds with the /.well-known/openfeeder.json document.
 */

import type { OpenFeederConfig, OpenFeederDiscovery } from "../types.js";

const HEADERS = {
  "Content-Type": "application/json",
  "X-OpenFeeder": "1.0",
  "Access-Control-Allow-Origin": "*",
};

export function handleDiscovery(config: OpenFeederConfig): Response {
  const body: OpenFeederDiscovery = {
    version: "1.0",
    site: {
      name: config.siteName,
      url: config.siteUrl,
      language: config.language ?? "en",
      description: config.siteDescription ?? "",
    },
    feed: {
      endpoint: "/openfeeder",
      type: "paginated",
    },
    capabilities: ["search"],
    contact: null,
  };

  return new Response(JSON.stringify(body), { headers: HEADERS });
}
