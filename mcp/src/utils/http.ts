/**
 * HTTP helpers for OpenFeeder MCP server.
 * Uses Node 18+ built-in fetch.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

const USER_AGENT = "openfeeder-mcp/1.0";

export interface HttpResponse {
  status: number;
  headers: Headers;
  text: string;
  ok: boolean;
}

export async function httpGet(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  apiKey?: string
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const resolvedKey = apiKey || process.env.OPENFEEDER_API_KEY;

  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/html, */*",
    };
    if (resolvedKey) {
      headers["Authorization"] = `Bearer ${resolvedKey}`;
    }

    const resp = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    const text = await resp.text();
    return {
      status: resp.status,
      headers: resp.headers,
      text,
      ok: resp.ok,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function getOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.origin;
}

export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
