#!/usr/bin/env node

/**
 * OpenFeeder MCP Server
 *
 * Exposes OpenFeeder protocol tools to MCP-compatible LLM clients:
 *   - smart_fetch: auto-detect OpenFeeder, use it or fallback to HTML
 *   - openfeeder_discover: check if a site supports OpenFeeder
 *   - openfeeder_list: paginated content index
 *   - openfeeder_search: semantic search
 *   - openfeeder_sync: differential sync
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { discover } from "./tools/discover.js";
import { list } from "./tools/list.js";
import { search } from "./tools/search.js";
import { sync } from "./tools/sync.js";
import { smartFetch } from "./tools/smart-fetch.js";

const server = new Server(
  { name: "openfeeder-mcp", version: "1.0.1" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "smart_fetch",
      description:
        "Fetch structured content from any URL. Automatically detects OpenFeeder support and uses it for clean, LLM-optimized content. Falls back to raw HTML if OpenFeeder is not available. This is the recommended default tool for fetching web content.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch content from",
          },
          query: {
            type: "string",
            description:
              "Optional search query. If provided and the site supports OpenFeeder, returns ranked search results instead of the full index.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "openfeeder_discover",
      description:
        "Check if a website supports the OpenFeeder protocol. Tries multiple discovery methods: .well-known/openfeeder.json, HTTP headers, HTML meta tags, and llms.txt.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL of the site to check for OpenFeeder support",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "openfeeder_list",
      description:
        "Fetch the paginated content index from an OpenFeeder-compatible site. Returns structured items with titles, URLs, dates, and summaries.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The site URL or direct OpenFeeder endpoint URL",
          },
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "openfeeder_search",
      description:
        "Search an OpenFeeder-compatible site's content. Returns ranked results with relevance scores.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The site URL or direct OpenFeeder endpoint URL",
          },
          query: {
            type: "string",
            description: "The search query",
          },
          min_score: {
            type: "number",
            description:
              "Minimum relevance score between 0.0 and 1.0 (default: 0.0)",
          },
        },
        required: ["url", "query"],
      },
    },
    {
      name: "openfeeder_sync",
      description:
        "Get content changes since a given timestamp or sync token. Returns added, updated, and deleted items for incremental sync.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The site URL or direct OpenFeeder endpoint URL",
          },
          since: {
            type: "string",
            description:
              "RFC 3339 timestamp (e.g. 2026-02-01T00:00:00Z) or a sync_token from a previous sync response",
          },
        },
        required: ["url", "since"],
      },
    },
  ],
}));

// ── Tool execution ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "smart_fetch": {
        const { url, query } = args as { url: string; query?: string };
        const result = await smartFetch({ url, query });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "openfeeder_discover": {
        const { url } = args as { url: string };
        const result = await discover(url);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "openfeeder_list": {
        const { url, page } = args as { url: string; page?: number };
        const result = await list({ url, page });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "openfeeder_search": {
        const { url, query, min_score } = args as {
          url: string;
          query: string;
          min_score?: number;
        };
        const result = await search({ url, query, min_score });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "openfeeder_sync": {
        const { url, since } = args as { url: string; since: string };
        const result = await sync({ url, since });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (err) {
    if (err instanceof McpError) throw err;

    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenFeeder MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
