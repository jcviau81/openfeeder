/**
 * openfeeder_sync — differential sync via ?since= parameter
 */

import { httpGet, parseJson, buildUrl } from "../utils/http.js";
import { resolveEndpoint } from "../utils/resolve.js";

export interface SyncInput {
  url: string;
  since: string;
  api_key?: string;
}

export async function sync(input: SyncInput): Promise<unknown> {
  const apiKey = input.api_key || process.env.OPENFEEDER_API_KEY;
  const endpoint = await resolveEndpoint(input.url);
  if (!endpoint) {
    return { error: "OpenFeeder not supported on this site", url: input.url };
  }

  const fetchUrl = buildUrl(endpoint, { since: input.since });
  const resp = await httpGet(fetchUrl, undefined, apiKey);

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
