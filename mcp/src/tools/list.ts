/**
 * openfeeder_list — fetch paginated content index from an OpenFeeder endpoint
 */

import { httpGet, parseJson, buildUrl } from "../utils/http.js";
import { resolveEndpoint } from "../utils/resolve.js";

export interface ListInput {
  url: string;
  page?: number;
}

export async function list(input: ListInput): Promise<unknown> {
  const endpoint = await resolveEndpoint(input.url);
  if (!endpoint) {
    return { error: "OpenFeeder not supported on this site", url: input.url };
  }

  const fetchUrl = buildUrl(endpoint, { page: input.page });
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
