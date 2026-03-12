# OpenFeeder Adapter Design Principles

## Core Rule: NO Personal Data Exposure

**OpenFeeder adapters MUST NEVER expose personal, administrative, or private data via the public APIs.**

### What to Expose ✅
- **Public content:** Posts, pages, articles
- **Metadata:** Publication dates, categories, tags, authors (display names only)
- **Descriptions:** Site name, site description, language
- **Public settings:** Feed type, capabilities

### What NEVER to Expose ❌
- **Admin information:** Email addresses, phone numbers, admin usernames
- **User data:** Subscriber lists, user emails, user profiles, preferences
- **System info:** Software versions, database details, file paths, API keys
- **Configuration:** Private settings, authentication details
- **Analytics:** Traffic data, user behavior, IP addresses

### Examples

#### ❌ BAD - Exposes admin email
```json
{
  "site": "My Blog",
  "contact": "admin@example.com"  // WRONG
}
```

#### ✅ GOOD - No personal data
```json
{
  "site": "My Blog",
  "url": "https://example.com",
  "description": "A blog about web development"
}
```

#### ❌ BAD - Exposes user list
```json
{
  "subscribers": ["user1@example.com", "user2@example.com"]  // WRONG
}
```

#### ✅ GOOD - Just shows post authors
```json
{
  "post": {
    "title": "My Article",
    "author": "Jane Doe"  // Display name only, no email
  }
}
```

## Privacy-First Design

1. **Default to NO exposure** — If in doubt, don't expose it
2. **Opt-in configuration** — Sites can choose to expose extra info via settings (but should be explicit)
3. **Regular audits** — Review adapters periodically for data leakage
4. **Documentation** — Clearly document what each adapter exposes
5. **Security reviews** — Have privacy-conscious eyes on pull requests

## For Adapter Contributors

When building a new adapter:
1. Read this document first
2. Only expose public content in the discovery/feed endpoints
3. Test: Run your adapter and verify NO personal data appears in API responses
4. Comment your code: Explain why you expose what you expose
5. Get reviewed by maintainers before merge

## Questions?

If you're unsure whether something should be exposed, **default to NO** and ask in the issue/PR.

---

Last updated: 2026-03-12  
Related: Issue #16 (admin email exposure fix)
