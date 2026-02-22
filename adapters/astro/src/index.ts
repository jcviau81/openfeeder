/**
 * OpenFeeder Astro Adapter
 *
 * Registers two API routes automatically:
 *   GET /openfeeder                    → paginated content feed
 *   GET /.well-known/openfeeder.json   → discovery document
 *
 * Usage in astro.config.mjs:
 *
 *   import openfeeder from 'openfeeder-astro';
 *   export default defineConfig({
 *     output: 'server',
 *     integrations: [
 *       openfeeder({
 *         siteName: 'My Site',
 *         siteUrl: 'https://mysite.com',
 *         getItems: async (page, limit) => ({ items: [...], total: 0 }),
 *         getItem:  async (url)         => null,
 *       })
 *     ]
 *   });
 */

import { fileURLToPath } from "url";
import type { AstroIntegration } from "astro";
import type { OpenFeederConfig } from "./types.js";
import { setConfig } from "./store.js";

export type { OpenFeederConfig, OpenFeederItem, OpenFeederRawItem, OpenFeederChunk } from "./types.js";
export { chunkContent, summarise } from "./chunker.js";

/**
 * Create the OpenFeeder Astro integration.
 */
export default function openfeeder(config: OpenFeederConfig): AstroIntegration {
  return {
    name: "openfeeder",
    hooks: {
      "astro:config:setup": ({ injectRoute, logger }) => {
        // Store config in module-level singleton so route handlers can access it
        setConfig(config);

        logger.info("Injecting OpenFeeder routes…");

        injectRoute({
          pattern: "/openfeeder",
          entrypoint: fileURLToPath(
            new URL("./routes/openfeeder.ts", import.meta.url)
          ),
        });

        injectRoute({
          pattern: "/.well-known/openfeeder.json",
          entrypoint: fileURLToPath(
            new URL("./routes/discovery.ts", import.meta.url)
          ),
        });

        logger.info("OpenFeeder routes registered: /openfeeder  /.well-known/openfeeder.json");
      },
    },
  };
}
