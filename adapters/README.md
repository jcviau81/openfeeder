# OpenFeeder Adapters

Adapters implement the OpenFeeder protocol for specific platforms and frameworks.

## Available Adapters

| Adapter | Language | Status |
|---------|----------|--------|
| [express](./express/) | Node.js | 🔜 Planned |
| [fastapi](./fastapi/) | Python | 🔜 Planned |
| [wordpress](./wordpress/) | PHP | 🔜 Planned |
| [astro](./astro/) | Node.js | 🔜 Planned |

## Building an Adapter

An adapter must:

1. Serve `GET /.well-known/openfeeder.json` — the discovery document
2. Serve the content endpoint defined in the discovery doc
3. Strip noise (ads, nav, boilerplate) from content
4. Chunk content into meaningful, readable fragments
5. Optionally integrate with a vector DB for semantic search

See the [spec](../spec/SPEC.md) for full protocol details.
