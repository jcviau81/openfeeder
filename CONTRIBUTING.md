# Contributing to OpenFeeder

Thank you for your interest in contributing to OpenFeeder! This project is open source (MIT) and welcomes contributions of all kinds.

## Ways to Contribute

### 1. Build a New Adapter

The highest-impact contribution is a new platform adapter. OpenFeeder currently supports Express, Next.js, FastAPI, Astro, Vite, WordPress, Drupal, Joomla, and WooCommerce — but there are many more platforms that could benefit.

**High-priority adapter targets:**
- Django
- Ruby on Rails
- Laravel (PHP)
- Spring Boot (Java)
- Hugo / Eleventy / other static site generators
- Shopify
- Ghost
- Strapi / Directus / other headless CMS platforms

**How to build an adapter:**

1. Read the [OpenFeeder Spec](spec/SPEC.md) — this is the source of truth for what endpoints and response formats your adapter must implement
2. Review the [Implementation Guide](docs/01_IMPLEMENTATION_GUIDE.md) and [Step-by-Step Tutorial](docs/02_STEP_BY_STEP_TUTORIAL.md)
3. Study an existing adapter close to your target platform:
   - Server frameworks: see `adapters/express/` or `adapters/fastapi/`
   - CMS platforms: see `adapters/wordpress/` or `adapters/drupal/`
   - Static site generators: see `adapters/astro/`
4. Read the [Adapter Design Principles](ADAPTER_DESIGN.md) — especially the rules on privacy and personal data
5. Create your adapter in `adapters/<platform-name>/`
6. Add integration tests in `testing/<platform-name>-test/`
7. Validate your adapter using the [OpenFeeder Validator](validator/)

**Every adapter must:**
- Expose `/.well-known/openfeeder.json` (discovery endpoint)
- Expose `/openfeeder` (content endpoint)
- Support pagination (`page`, `per_page`)
- Support `?url=` for single-item lookup
- Support `?q=` for search
- Support `?since=` for differential sync
- Return spec-compliant JSON (`schema: "openfeeder/1.0"`)
- Implement `Cache-Control` and `ETag` headers
- Never expose draft, private, or password-protected content
- Never expose email addresses or personal user data in discovery endpoints

### 2. Improve the Spec

The OpenFeeder specification is at version 1.0. Proposals for spec improvements are welcome, especially:

- New content type support (beyond articles, recipes, products, events)
- Improved pagination strategies
- Better structured data mapping from Schema.org types
- Extensions for specific verticals (see `spec/ECOMMERCE.md` for the pattern)

**How to propose a spec change:**
1. Open a GitHub issue with the `spec-proposal` label
2. Describe the problem your change solves
3. Include example request/response payloads
4. Note any backwards-compatibility considerations

Spec changes require consensus — open an issue for discussion before submitting a PR.

### 3. Improve Documentation

Good docs lower the adoption barrier. Areas that need attention:

- Platform-specific quickstart guides
- Troubleshooting guides for common adapter issues
- Video or GIF tutorials
- Translations
- Improved code examples in `docs/04_CODE_EXAMPLES.md`

### 4. Improve Testing

The test suite lives in `testing/`. Each adapter has its own integration test directory. Contributions welcome:

- Expand test coverage for existing adapters
- Add edge-case tests (empty content, Unicode, large payloads, malformed queries)
- Improve the test runner (`testing/runner/`)
- Add CI integration for more platforms

Run the full test suite:
```bash
cd testing
./run-all-tests.sh
```

### 5. Improve the Validator

The [OpenFeeder Validator](validator/) checks any endpoint for spec compliance. It can always be more thorough:

- Add checks for new spec features
- Improve error messages and suggestions
- Add output formats (JSON, JUnit XML for CI)

### 6. Improve the CLI and MCP Server

The [CLI](cli/) and [MCP server](mcp/) are the consumer-side tools. Improvements welcome:

- New CLI commands or output formats
- MCP server capability extensions
- Better error handling and user feedback

### 7. Report Bugs

Found a problem? Open a GitHub issue with:

- Which adapter/tool is affected
- Steps to reproduce
- Expected vs. actual behavior
- Your platform version (e.g., WordPress 6.x, Node 20, Python 3.12)

## Development Setup

### Prerequisites

- Node.js 18+ (for Express, Next.js, Astro, Vite adapters, CLI, MCP server)
- Python 3.10+ (for FastAPI adapter, validator, sidecar)
- Docker and Docker Compose (for CMS adapter testing — WordPress, Drupal, Joomla)
- PHP 8.0+ (for WordPress, Drupal, Joomla adapter development)

### Quick Start

```bash
# Clone the repo
git clone https://github.com/jcviau81/openfeeder.git
cd openfeeder

# Run the Express adapter tests (fastest to verify setup)
cd testing
node test-express.js

# Run the full test suite
./run-all-tests.sh

# Validate an endpoint
cd ../validator
pip install -r requirements.txt
python validator.py https://sketchynews.snaf.foo
```

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Make your changes
4. Run relevant tests
5. Run the validator against any new/changed adapter endpoints
6. Commit with a clear message describing what and why
7. Push and open a PR

### PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if behavior changes
- Follow the existing code style of the adapter/tool you're modifying
- Reference related issues in the PR description

## Code of Conduct

Be respectful, be constructive, be kind. We're building something useful for the web — let's do it together.

## Questions?

- Open a GitHub Discussion for general questions
- Open a GitHub Issue for bugs or feature requests
- Tag your issue with the appropriate label: `adapter`, `spec-proposal`, `docs`, `testing`, `cli`, `mcp`, `validator`, `sidecar`

## License

By contributing to OpenFeeder, you agree that your contributions will be licensed under the [MIT License](LICENSE).
