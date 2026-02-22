import { getSidecarUrl } from "./config.js";

/**
 * Make an HTTP request and return { ok, status, data, headers } or { ok: false, error }.
 */
async function request(url, options = {}) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      ...options,
    });
    let data = null;
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      data = await resp.json();
    } else {
      data = await resp.text();
    }
    return { ok: resp.ok, status: resp.status, data, headers: resp.headers };
  } catch (e) {
    return { ok: false, status: 0, data: null, headers: null, error: e.message };
  }
}

/**
 * GET the /healthz endpoint.
 */
export async function checkHealth() {
  const base = await getSidecarUrl();
  return request(`${base}/healthz`);
}

/**
 * GET /.well-known/openfeeder.json on the SITE_URL.
 */
export async function checkDiscovery(siteUrl) {
  return request(`${siteUrl.replace(/\/$/, "")}/.well-known/openfeeder.json`);
}

/**
 * GET /openfeeder on the SITE_URL.
 */
export async function checkContent(siteUrl) {
  return request(`${siteUrl.replace(/\/$/, "")}/openfeeder`);
}

/**
 * POST /crawl to trigger a re-crawl.
 */
export async function triggerCrawl() {
  const base = await getSidecarUrl();
  return request(`${base}/crawl`, { method: "POST" });
}

/**
 * Generic GET against sidecar.
 */
export async function sidecarGet(path) {
  const base = await getSidecarUrl();
  return request(`${base}${path}`);
}

/**
 * Generic GET against any URL.
 */
export async function httpGet(url) {
  return request(url);
}
