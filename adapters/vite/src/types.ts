/**
 * OpenFeeder Vite Adapter — TypeScript interfaces
 */

export interface OpenFeederContentItem {
  url: string;
  title: string;
  content: string;
  published: string; // ISO 8601
}

export interface OpenFeederChunk {
  id: string;
  text: string;
  type: "paragraph" | "heading" | "list" | "code" | "quote";
  relevance: null;
}

export interface OpenFeederPluginConfig {
  /** Display name for the site */
  siteName: string;
  /** Canonical base URL (e.g. https://mysite.com) */
  siteUrl: string;
  /** Optional short description */
  siteDescription?: string;
  /** BCP-47 language tag (default: "en") */
  language?: string;
  /**
   * Content to expose.  Can be a static array or an async function that
   * returns an array at build time / plugin startup.
   */
  content:
    | OpenFeederContentItem[]
    | (() => Promise<OpenFeederContentItem[]>);
}

export interface OpenFeederDiscovery {
  version: "1.0";
  site: {
    name: string;
    url: string;
    language: string;
    description: string;
  };
  feed: {
    endpoint: string;
    type: "paginated";
  };
  capabilities: string[];
  contact: null;
}

export interface OpenFeederIndexResponse {
  schema: "openfeeder/1.0";
  type: "index";
  page: number;
  total_pages: number;
  items: Array<{
    url: string;
    title: string;
    published: string;
    summary: string;
  }>;
}

export interface OpenFeederPageResponse {
  schema: "openfeeder/1.0";
  url: string;
  title: string;
  published: string;
  language: string;
  summary: string;
  chunks: OpenFeederChunk[];
  meta: {
    total_chunks: number;
    returned_chunks: number;
    cached: boolean;
    cache_age_seconds: null;
  };
}
