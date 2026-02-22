# OpenFeeder Validator CLI

A standalone CLI tool that checks if a website is [OpenFeeder](../spec/SPEC.md)-compliant.

## Installation

```bash
cd validator/
pip install -r requirements.txt
chmod +x openfeeder-validator
```

Or with pipx (isolated environment):

```bash
pipx install -r requirements.txt  # install deps globally
# then run directly:
python validator.py https://example.com
```

## Usage

```bash
# Basic check
./openfeeder-validator https://example.com

# Full output with details
./openfeeder-validator https://example.com --verbose

# JSON output (for CI pipelines)
./openfeeder-validator https://example.com --json

# Override the feed endpoint
./openfeeder-validator https://example.com --endpoint https://example.com/openfeeder
```

## Checks Performed

The validator runs these checks in order:

### 1. Discovery (`GET /.well-known/openfeeder.json`)
- Endpoint responds with HTTP 200
- Content-Type is `application/json`
- Required fields present: `version`, `site.name`, `site.url`, `feed.endpoint`
- Version is "1.0" (warns if different)

### 2. Index Mode (`GET <feed.endpoint>`)
- Responds with HTTP 200
- Has `schema` = `"openfeeder/1.0"`
- Has `type` = `"index"`
- Has `items` array
- Each item has `url` and `title`
- Response time < 5s (warns if > 2s)

### 3. Single Page Mode (`GET <feed.endpoint>?url=<first_item>`)
- Only runs if index returned at least 1 item
- Responds with HTTP 200
- Has `schema`, `title`, `chunks` fields
- Each chunk has `id`, `text`, `type`
- No empty chunks
- Has `meta.total_chunks`

### 4. Headers (optional, warn only)
- `X-OpenFeeder` header present
- CORS `Access-Control-Allow-Origin: *`

### 5. Noise Check (warn only)
- Fetches raw HTML of first item
- Verifies chunk text appears in the actual page (proves content is real)

## Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | All required checks pass |
| `1`  | One or more required checks failed |
| `2`  | Could not reach the site at all |

## CI/CD Integration (GitHub Actions)

```yaml
name: OpenFeeder Compliance
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # weekly Monday 6am

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r validator/requirements.txt

      - name: Run OpenFeeder validator
        run: python validator/validator.py https://yoursite.com --json
```

The `--json` flag outputs machine-readable results suitable for CI parsing. The process exits with code `1` on failure, which will fail the GitHub Actions step automatically.
