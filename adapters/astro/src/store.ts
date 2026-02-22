/**
 * OpenFeeder Astro Adapter — Config store
 *
 * Uses globalThis as the backing store to survive module isolation between
 * Astro's integration setup phase (Node native ESM) and the Vite SSR module
 * graph used by injected route handlers at request time.
 *
 * The integration calls setConfig() at startup; route handlers call getConfig()
 * at request time.
 */

import type { OpenFeederConfig } from "./types.js";

// Use a unique string key on the true global object so both the integration
// setup code and the Vite-loaded route files share the same reference.
const GLOBAL_KEY = "__openfeeder_astro_config__";

export function setConfig(config: OpenFeederConfig): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = config;
}

export function getConfig(): OpenFeederConfig {
  const config = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
    | OpenFeederConfig
    | undefined;
  if (!config) {
    throw new Error(
      "[openfeeder-astro] Config not initialized. " +
        "Did you add the openfeeder() integration to astro.config.mjs?"
    );
  }
  return config;
}
