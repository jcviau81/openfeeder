/**
 * OpenFeeder Astro Adapter — /.well-known/openfeeder.json route
 *
 * Injected by the openfeeder() integration via injectRoute().
 * Reads config from the module-level singleton store.
 */

import type { APIRoute } from "astro";
import { handleDiscovery } from "../handlers/discovery.js";
import { getConfig } from "../store.js";

export const GET: APIRoute = ({ request }) => {
  return handleDiscovery(request, getConfig());
};
