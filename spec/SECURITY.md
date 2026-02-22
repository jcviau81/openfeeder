# OpenFeeder Security Guide

*Copyright (c) 2026 Jean-Christophe Viau. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*

---

## Threat Model

OpenFeeder exposes a read-only content API. The main attack surface is:

| Vector | Severity | Mitigated by |
|--------|----------|-------------|
| SSRF via `?url=` parameter | 🔴 Critical | URL validation (path-only, no host) |
| Sensitive content exposure | 🔴 Critical | Publish-only filter + access control |
| Rate limiting / DDoS | 🟡 Medium | Rate limit headers + server config |
| API abuse / bulk scraping | 🟡 Medium | Optional API key |
| Query injection (`?q=`) | 🟡 Medium | Input sanitization |
| Information disclosure | 🟢 Low | Keep discovery doc minimal |
| LLM Gateway fingerprinting | 🟢 Low | Accept as intended behavior |

---

## 1. SSRF — Server-Side Request Forgery

### Risk
The `?url=` parameter is used to fetch a single page's content. Without validation, an attacker could pass:
```
GET /openfeeder?url=http://169.254.169.254/latest/meta-data/
GET /openfeeder?url=file:///etc/passwd
GET /openfeeder?url=http://internal-db:5432/
```

### Fix
**All implementations MUST validate that `?url=` is a relative path** (starts with `/`, no host, no scheme):

```js
// JavaScript
function sanitizeUrl(raw) {
  if (!raw) return null;
  // Strip to pathname only
  try {
    const parsed = new URL(raw, 'http://localhost');
    const path = parsed.pathname.replace(/\/$/, '') || '/';
    // Reject if the original had a host (wasn't relative)
    if (!raw.startsWith('/')) {
      return parsed.pathname.replace(/\/$/, '') || '/';
    }
    return path;
  } catch {
    return null;
  }
}
```

```php
// PHP
function sanitize_url(string $raw): ?string {
    $raw = trim($raw);
    if (empty($raw)) return null;
    // Parse and extract only the path
    $parsed = parse_url($raw);
    $path = rtrim($parsed['path'] ?? '/', '/') ?: '/';
    // Reject path traversal
    if (str_contains($path, '..')) return null;
    return $path;
}
```

```python
# Python
from urllib.parse import urlparse

def sanitize_url(raw: str) -> str | None:
    if not raw:
        return None
    parsed = urlparse(raw)
    path = parsed.path.rstrip('/') or '/'
    # Reject path traversal
    if '..' in path:
        return None
    return path
```

---

## 2. Sensitive Content Exposure

### Risk
Drafts, private posts, password-protected pages, or member-only content exposed via the API.

### Fix — Per Platform

**WordPress:** Query only `post_status = 'publish'`, `post_password = ''`:
```php
$args = [
  'post_status'  => 'publish',
  'has_password' => false,
  // Never query private posts
];
```

**Joomla:** `WHERE state=1` (published only) ✅ (already implemented)

**Drupal:** Only query published nodes (`status = 1`) ✅ (already implemented)

**Express / FastAPI / generic adapters:** The `getItems` / `getItem` callbacks are developer-provided — document clearly that they must filter to public content only.

### Recommendation
Add a warning in all adapter READMEs:
> ⚠️ Your `getItems` and `getItem` functions must only return **publicly accessible** content. Never expose drafts, private posts, or authenticated-only content.

---

## 3. Rate Limiting

### Risk
The `/openfeeder` endpoint returns paginated content. Without rate limiting, a bot can scrape the entire site in seconds with:
```
for page in range(1, 1000):
    GET /openfeeder?page={page}&limit=50
```

### Fix — Response Headers
All implementations add rate limit headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1709123456
Retry-After: 60  (only on 429)
```

### Fix — Server Configuration

**Nginx:**
```nginx
limit_req_zone $binary_remote_addr zone=openfeeder:10m rate=60r/m;

location ~ ^/(openfeeder|\.well-known/openfeeder) {
    limit_req zone=openfeeder burst=10 nodelay;
    limit_req_status 429;
    # ... proxy to your app
}
```

**Apache:**
```apache
# Requires mod_ratelimit or mod_evasive
# Recommended: use Nginx as reverse proxy for rate limiting
```

**WordPress (via .htaccess + Nginx):**
Apply the Nginx config above, pointing to your WordPress installation.

---

## 4. Optional API Key Authentication

For sites that want to restrict OpenFeeder access to trusted consumers (e.g., specific AI platforms, internal tools):

### Config

```js
// Express
openFeederMiddleware({
  apiKey: 'your-secret-key',  // if set, all requests must include Authorization header
  // ...
})
```

```php
// WordPress — Settings > OpenFeeder > API Key (leave blank = public)
```

### Request
```
GET /openfeeder
Authorization: Bearer your-secret-key
```

### Response on missing/invalid key
```json
HTTP 401
{ "schema": "openfeeder/1.0", "error": { "code": "UNAUTHORIZED", "message": "Valid API key required. Include Authorization: Bearer <key> header." } }
```

### Note
The discovery document (`/.well-known/openfeeder.json`) is **always public** — it only advertises endpoints, not content. Only the content endpoint (`/openfeeder`) is key-protected.

---

## 5. Query Sanitization (`?q=`)

### Risk
Unsanitized `?q=` parameter passed to database queries could enable SQL injection.

### Fix
- All implementations use **parameterized queries** (never string interpolation in SQL)
- Strip HTML and control characters from `?q=` before use
- Limit `?q=` length (max 200 chars)

```js
// JavaScript
const q = (req.query.q || '').slice(0, 200).replace(/<[^>]*>/g, '').trim();
```

```python
q = (request.query_params.get('q') or '')[:200]
```

```php
$q = mb_substr( sanitize_text_field( $_GET['q'] ?? '' ), 0, 200 );
```

---

## 6. Information Disclosure

### Risk
The discovery document reveals site capabilities and endpoint structure.

### Mitigation
- Keep `site.description` generic — don't include internal architecture details
- Don't include admin emails in `contact` field unless intended
- The `capabilities` array is safe — it only lists supported features

---

## 7. Transport Security

- **Always serve over HTTPS** in production
- Set `Strict-Transport-Security` header
- The `Access-Control-Allow-Origin: *` header is intentional (AI systems need cross-origin access)

---

## 8. Checklist for Implementers

Before deploying OpenFeeder on a production site:

- [ ] `?url=` parameter validated to path-only (no SSRF)
- [ ] Only `published` content served (no drafts, no private posts)
- [ ] Rate limiting configured at server level (Nginx/Apache)
- [ ] HTTPS enabled
- [ ] API key set if restricted access desired
- [ ] `?q=` parameter sanitized and length-limited
- [ ] Chunker does not expose server paths or internal metadata in chunk text
- [ ] Tested with the OpenFeeder Validator CLI

---

## Reporting Vulnerabilities

Found a security issue in OpenFeeder? Please report it responsibly:

- **GitHub:** Open a private security advisory at https://github.com/jcviau81/openfeeder/security
- **Email:** Contact the maintainer directly

Do not open public issues for unpatched vulnerabilities.
