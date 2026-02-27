/**
 * openfeeder_list — fetch paginated content index from an OpenFeeder endpoint
 */

import { httpGet, parseJson, buildUrl } from "../utils/http.js";
import { resolveEndpoint } from "../utils/resolve.js";

export interface ListInput {
  url: string;
  page?: number;
  api_key?: string;
}

export async function list(input: ListInput): Promise<unknown> {
  const apiKey = input.api_key || process.env.OPENFEEDER_API_KEY;
  const endpoint = await resolveEndpoint(input.url);
  if (!endpoint) {
    return { error: "OpenFeeder not supported on this site", url: input.url };
  }

  // If URL has a specific path, try to filter by it
  const parsed = new URL(input.url);
  const isSpecificPath = parsed.pathname !== "/" && parsed.pathname !== "";

  if (isSpecificPath) {
    // Extract meaningful terms from the path for filtering
    // e.g. /category/hamburger-bs → "hamburger bs"
    const pathTerms = parsed.pathname
      .replace(/^\//, "")
      .split("/")
      .filter(seg => !["category", "tag", "author", "page"].includes(seg))
      .join(" ")
      .replace(/-/g, " ");

    if (pathTerms) {
      // Use search with path terms as query to get filtered results
      const searchUrl = buildUrl(endpoint, { q: pathTerms, limit: input.page ? 10 : 20 });
      const resp = await httpGet(searchUrl, undefined, apiKey);
      if (resp.ok) {
        const data = parseJson(resp.text);
        if (data) return { ...data as object, _filter_note: `Filtered by path: "${pathTerms}"` };
      }
    }

    // Fallback: try fetching the specific page via ?url=
    const pageUrl = buildUrl(endpoint, { url: input.url, limit: 20 });
    const pageResp = await httpGet(pageUrl, undefined, apiKey);
    if (pageResp.ok && pageResp.status !== 404) {
      const data = parseJson(pageResp.text);
      if (data) return data;
    }
  }

  // Default: paginated global index
  const fetchUrl = buildUrl(endpoint, { page: input.page });
  const resp = await httpGet(fetchUrl, undefined, apiKey);

  if (!resp.ok) {
    return { error: `HTTP ${resp.status} from OpenFeeder endpoint`, url: fetchUrl };
  }

  const data = parseJson(resp.text);
  if (!data) {
    return { error: "Invalid JSON response from OpenFeeder endpoint", url: fetchUrl };
  }

  return data;
}
