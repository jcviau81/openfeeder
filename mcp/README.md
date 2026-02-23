# OpenFeeder MCP Server

MCP (Model Context Protocol) server that gives LLMs direct access to any OpenFeeder-compatible website's structured content — no HTML scraping needed.

## Tools

| Tool | Description |
|------|-------------|
| `smart_fetch` | Auto-detects OpenFeeder, uses it if available, falls back to raw HTML |
| `openfeeder_discover` | Check if a site supports OpenFeeder |
| `openfeeder_list` | Fetch paginated content index |
| `openfeeder_search` | Search content with relevance ranking |
| `openfeeder_sync` | Differential sync (get changes since a timestamp) |

## Setup

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openfeeder": {
      "command": "npx",
      "args": ["openfeeder-mcp"]
    }
  }
}
```

### Claude Code

```json
{
  "openfeeder": {
    "command": "npx",
    "args": ["openfeeder-mcp"]
  }
}
```

### From source

```bash
cd mcp
npm install
npm run build
node dist/index.js
```

## Usage Examples

Once configured, Claude can use these tools naturally:

- **"What articles does example.com have?"** → `smart_fetch({ url: "https://example.com" })`
- **"Search example.com for AI news"** → `smart_fetch({ url: "https://example.com", query: "AI news" })`
- **"Does example.com support OpenFeeder?"** → `openfeeder_discover({ url: "https://example.com" })`
- **"What changed since yesterday?"** → `openfeeder_sync({ url: "https://example.com", since: "2026-02-21T00:00:00Z" })`

## Development

```bash
npm install
npm run build    # Compile TypeScript
npm start        # Run MCP server (stdio)
```

### Testing

```bash
npx ts-node --esm test.ts
```

## How Discovery Works

`openfeeder_discover` checks for OpenFeeder support using four methods in order:

1. `GET <origin>/.well-known/openfeeder.json` — standard discovery endpoint
2. HTTP response headers — `Link: rel="alternate" title="OpenFeeder"` or `X-OpenFeeder`
3. HTML `<meta>` and `<link>` tags in the page body
4. `GET <origin>/llms.txt` — check for OpenFeeder mention

## License

MIT
