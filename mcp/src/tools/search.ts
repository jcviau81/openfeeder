/**
 * openfeeder_search — search OpenFeeder endpoint content
 */

import { httpGet, parseJson, buildUrl } from "../utils/http.js";
import { resolveEndpoint } from "../utils/resolve.js";

export interface SearchInput {
  url: string;
  query: string;
  min_score?: number;
}

export async function search(input: SearchInput): Promise<unknown> {
  const endpoint = await resolveEndpoint(input.url);
  if (!endpoint) {
    return { error: "OpenFeeder not supported on this site", url: input.url };
  }

  const fetchUrl = buildUrl(endpoint, {
    q: input.query,
    min_score: input.min_score,
  });
  const resp = await httpGet(fetchUrl);

  if (!resp.ok) {
    return {
      error: `HTTP ${resp.status} from OpenFeeder endpoint`,
      url: fetchUrl,
    };
  }

  const data = parseJson(resp.text);
  if (!data) {
    return { error: "Invalid JSON response from OpenFeeder endpoint", url: fetchUrl };
  }

  return data;
}
