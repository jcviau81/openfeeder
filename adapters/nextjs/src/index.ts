/**
 * OpenFeeder Next.js Adapter
 *
 * Creates GET route handlers for Next.js 14+ App Router.
 *
 * Usage in app/openfeeder/route.ts:
 *   export const { GET } = createOpenFeederHandler(config);
 *
 * Usage in app/.well-known/openfeeder.json/route.ts:
 *   export const { GET } = createOpenFeederDiscoveryHandler(config);
 */

export { handleContent } from "./handlers/content.js";
export { handleDiscovery } from "./handlers/discovery.js";
export type {
  OpenFeederConfig,
  OpenFeederItem,
  OpenFeederRawItem,
  OpenFeederChunk,
  OpenFeederIndexResponse,
  OpenFeederPageResponse,
  OpenFeederDiscovery,
} from "./types.js";
export { chunkContent, summarise } from "./chunker.js";

import { NextRequest, NextResponse } from "next/server";
import { handleContent } from "./handlers/content.js";
import { handleDiscovery } from "./handlers/discovery.js";
import type { OpenFeederConfig } from "./types.js";

/**
 * Create a Next.js App Router route handler for /openfeeder.
 *
 * @example
 * // app/openfeeder/route.ts
 * import { createOpenFeederHandler } from "@/lib/openfeeder";
 * import config from "@/openfeeder.config";
 * export const { GET } = createOpenFeederHandler(config);
 */
export function createOpenFeederHandler(config: OpenFeederConfig) {
  return {
    GET(request: NextRequest): Promise<NextResponse> | NextResponse {
      return handleContent(request, config);
    },
  };
}

/**
 * Create a Next.js App Router route handler for /.well-known/openfeeder.json.
 *
 * @example
 * // app/.well-known/openfeeder.json/route.ts
 * import { createOpenFeederDiscoveryHandler } from "@/lib/openfeeder";
 * import config from "@/openfeeder.config";
 * export const { GET } = createOpenFeederDiscoveryHandler(config);
 */
export function createOpenFeederDiscoveryHandler(config: OpenFeederConfig) {
  return {
    GET(_request: NextRequest): NextResponse {
      return handleDiscovery(config);
    },
  };
}
