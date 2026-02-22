/**
 * OpenFeeder Vite Plugin
 *
 * Usage:
 *   import { viteOpenFeeder } from "./adapters/vite/src/index.js";
 *
 *   export default defineConfig({
 *     plugins: [viteOpenFeeder({ siteName: "...", siteUrl: "...", content: [...] })]
 *   });
 */

import type { Plugin } from "vite";
import { createMiddleware } from "./middleware";
import { generateStaticFiles } from "./build";
import type { OpenFeederContentItem, OpenFeederPluginConfig } from "./types";

export type { OpenFeederContentItem, OpenFeederPluginConfig };
export { chunkContent, summarise } from "./chunker";

/**
 * Vite plugin that adds OpenFeeder endpoints.
 *
 * In dev mode: mounts middleware on the dev server.
 * In build mode: generates static files in the output directory.
 */
export function viteOpenFeeder(config: OpenFeederPluginConfig): Plugin {
  let resolvedContent: OpenFeederContentItem[] = [];

  return {
    name: "openfeeder",

    // ── Dev server middleware ────────────────────────────────────────────
    configureServer(server) {
      // Resolve content once at startup
      Promise.resolve(
        typeof config.content === "function"
          ? config.content()
          : config.content
      ).then((items) => {
        resolvedContent = items;
        console.log(
          `[openfeeder] Dev server ready — ${items.length} item(s) loaded`
        );
      });

      server.middlewares.use(
        createMiddleware(config, () => resolvedContent)
      );
    },

    // ── Build: generate static files ─────────────────────────────────────
    async writeBundle(options) {
      const outDir = options.dir ?? "dist";

      const items =
        typeof config.content === "function"
          ? await config.content()
          : config.content;

      await generateStaticFiles(config, items, outDir);
    },
  };
}
