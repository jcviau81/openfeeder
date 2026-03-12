# OpenFeeder WordPress Plugin — cURL Test Examples

Test commands for the OpenFeeder REST API endpoints.

**Base URL:** Replace `http://localhost:8081` with your WordPress installation URL.

---

## 1. Discovery Endpoint

```bash
# Basic discovery
curl -s "http://localhost:8081/wp-json/openfeeder/v1/discovery" | jq .

# With verbose headers
curl -v "http://localhost:8081/wp-json/openfeeder/v1/discovery"
```

**Expected response:**
```json
{
  "version": "1.0.2",
  "site": {
    "name": "My Blog",
    "url": "http://localhost:8081/",
    "language": "en-US",
    "description": "Just another WordPress site"
  },
  "feed": {
    "endpoint": "/wp-json/openfeeder/v1/content",
    "type": "paginated"
  },
  "capabilities": ["diff-sync"],
  "contact": "admin@example.com"
}
```

---

## 2. Content Index (Paginated)

```bash
# Default (page 1)
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content" | jq .

# Page 2
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?page=2" | jq .
```

**Expected response:**
```json
{
  "schema": "openfeeder/1.0",
  "type": "index",
  "page": 1,
  "total_pages": 3,
  "items": [
    {
      "url": "/2026/03/my-post/",
      "title": "My Post",
      "published": "2026-03-12T10:30:00+00:00",
      "summary": "First 30 words of the post..."
    }
  ]
}
```

---

## 3. Single Post (Chunked Content)

```bash
# Get content for a specific post
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?url=/2026/03/my-post/" | jq .

# With chunk limit
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?url=/2026/03/my-post/&limit=5" | jq .
```

---

## 4. Search

```bash
# Full-text search
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?q=wordpress" | jq .

# Search with special characters
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?q=machine+learning" | jq .
```

---

## 5. Differential Sync

```bash
# Posts modified since a date
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?since=2026-03-01T00:00:00Z" | jq .

# Date range
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?since=2026-03-01T00:00:00Z&until=2026-03-10T23:59:59Z" | jq .

# Using sync_token from previous response
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?since=eyJ0IjoiMjAyNi0wMy0xMlQxNjowMDowMCswMDowMCJ9" | jq .
```

**Expected response (diff sync):**
```json
{
  "openfeeder_version": "1.0",
  "sync": {
    "as_of": "2026-03-12T16:00:00+00:00",
    "sync_token": "eyJ0IjoiMjAyNi0wMy0xMlQxNjowMDowMCswMDowMCJ9",
    "counts": { "added": 2, "updated": 1, "deleted": 0 }
  },
  "added": [...],
  "updated": [...],
  "deleted": [...]
}
```

---

## 6. Authentication (API Key)

```bash
# With Bearer token
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content" \
  -H "Authorization: Bearer your-api-key-here" | jq .

# Test unauthorized (when API key is configured)
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content" | jq .
```

**Expected 401 response (when key required but missing):**
```json
{
  "schema": "openfeeder/1.0",
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Valid API key required. Include Authorization: Bearer <key> header."
  }
}
```

---

## 7. Gateway Dialogue

```bash
# Step 1: Trigger gateway by visiting a page as an LLM bot
curl -s "http://localhost:8081/some-page/" \
  -H "User-Agent: GPTBot/1.0" | jq .

# Step 2: Respond to dialogue
curl -s -X POST "http://localhost:8081/wp-json/openfeeder/v1/gateway/respond" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "gw_abc123def456",
    "answers": {
      "intent": "answer-question",
      "depth": "standard",
      "format": "full-text",
      "query": "what is this site about?"
    }
  }' | jq .
```

---

## 8. Response Headers & Debugging

```bash
# Check cache headers
curl -v "http://localhost:8081/wp-json/openfeeder/v1/content" 2>&1 | grep -i "x-openfeeder\|cache"

# Measure response time
curl -w "Time: %{time_total}s | Status: %{http_code}\n" -s -o /dev/null \
  "http://localhost:8081/wp-json/openfeeder/v1/content"

# Save response to file
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content" -o response.json
```

---

## 9. Error Cases

```bash
# Non-existent post
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?url=/does-not-exist/" | jq .

# Invalid since date
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?since=not-a-date" | jq .

# Invalid URL parameter
curl -s "http://localhost:8081/wp-json/openfeeder/v1/content?url=../../etc/passwd" | jq .

# Plugin disabled
# (disable via Settings > OpenFeeder, then test)
curl -s "http://localhost:8081/wp-json/openfeeder/v1/discovery" | jq .
```

---

## Quick Smoke Test

Run all key endpoints in one go:

```bash
BASE="http://localhost:8081"
echo "=== Discovery ===" && curl -s "$BASE/wp-json/openfeeder/v1/discovery" | jq .schema,.site.name
echo "=== Content Index ===" && curl -s "$BASE/wp-json/openfeeder/v1/content" | jq .schema,.type,.total_pages
echo "=== Search ===" && curl -s "$BASE/wp-json/openfeeder/v1/content?q=test" | jq .schema,.type
echo "=== Done ==="
```
