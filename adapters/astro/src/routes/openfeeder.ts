/**
 * OpenFeeder Astro Adapter — /openfeeder route
 *
 * Injected by the openfeeder() integration via injectRoute().
 * Reads config from the module-level singleton store.
 */

import type { APIRoute } from "astro";
import { handleContent } from "../handlers/content.js";
import { getConfig } from "../store.js";

export const GET: APIRoute = ({ request }) => {
  return handleContent(request, getConfig());
};
