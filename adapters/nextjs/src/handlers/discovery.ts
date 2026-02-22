/**
 * OpenFeeder Next.js Adapter — Discovery handler
 *
 * Responds with the /.well-known/openfeeder.json document.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { OpenFeederConfig, OpenFeederDiscovery } from "../types.js";

const HEADERS = {
  "Content-Type": "application/json",
  "X-OpenFeeder": "1.0",
  "Access-Control-Allow-Origin": "*",
};

/** Compute a quoted MD5 ETag from arbitrary data. */
function makeEtag(data: unknown): string {
  return '"' + createHash("md5").update(JSON.stringify(data)).digest("hex").slice(0, 16) + '"';
}

export function handleDiscovery(request: NextRequest, config: OpenFeederConfig): NextResponse {
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

  const etag = makeEtag(body);
  // Discovery is static per deployment; use today (UTC) as Last-Modified
  const lastMod = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toUTCString();

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  return NextResponse.json(body, {
    headers: {
      ...HEADERS,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      "ETag": etag,
      "Last-Modified": lastMod,
      "Vary": "Accept-Encoding",
    },
  });
}
