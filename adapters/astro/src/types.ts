/**
 * OpenFeeder Astro Adapter — TypeScript interfaces
 */

export interface OpenFeederItem {
  url: string;
  title: string;
  published: string; // ISO8601
  summary?: string;
}

export interface OpenFeederRawItem {
  url: string;
  title: string;
  content: string;
  published: string; // ISO8601
}

export interface OpenFeederChunk {
  id: string;
  text: string;
  type: "paragraph" | "heading" | "list" | "code" | "quote";
  relevance: null;
}

export interface OpenFeederIndexResponse {
  schema: "openfeeder/1.0";
  type: "index";
  page: number;
  total_pages: number;
  items: OpenFeederItem[];
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

export interface OpenFeederConfig {
  /** Display name for the site */
  siteName: string;
  /** Canonical base URL (e.g. https://example.com) */
  siteUrl: string;
  /** Optional short description */
  siteDescription?: string;
  /** BCP-47 language tag (default: "en") */
  language?: string;
  /**
   * Return a page of items for the index.
   * @param page  1-based page number
   * @param limit Items per page
   */
  getItems: (
    page: number,
    limit: number
  ) => Promise<{ items: OpenFeederRawItem[]; total: number }>;
  /**
   * Return a single item by its relative URL.
   * Return null if not found.
   */
  getItem: (url: string) => Promise<OpenFeederRawItem | null>;
}
