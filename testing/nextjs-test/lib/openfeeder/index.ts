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

export { handleContent } from "./handlers/content";
export { handleDiscovery } from "./handlers/discovery";
export type {
  OpenFeederConfig,
  OpenFeederItem,
  OpenFeederRawItem,
  OpenFeederChunk,
  OpenFeederIndexResponse,
  OpenFeederPageResponse,
  OpenFeederDiscovery,
} from "./types";
export { chunkContent, summarise } from "./chunker";

import { NextRequest, NextResponse } from "next/server";
import { handleContent } from "./handlers/content";
import { handleDiscovery } from "./handlers/discovery";
import type { OpenFeederConfig } from "./types";

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
