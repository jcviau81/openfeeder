# OpenFeeder & GDPR Compliance

**Important:** This document clarifies the scope of OpenFeeder and data responsibilities. OpenFeeder is a *technical protocol*, not a privacy/compliance service.

---

## 🎯 OpenFeeder's Scope

OpenFeeder is a **content exposure standard** for websites to make their data accessible to LLMs. It defines:

- ✅ **What it controls**: The *protocol* for exposing content (endpoint, format, caching, rate limiting)
- ❌ **What it doesn't control**: The *data itself* (privacy, sensitive information, consent)

### What OpenFeeder Does

- Provides a structured endpoint for serving content to AI systems
- Includes rate limiting, caching, and access control mechanisms
- Recommends best practices for secure implementations

### What OpenFeeder Doesn't Do

- Does not handle user consent or privacy settings
- Does not store, process, or manage personal data
- Does not enforce GDPR compliance automatically
- Does not control what data you choose to expose

---

## 👤 Data Responsibility: Site Owner

**You (the site owner) are responsible for GDPR compliance.**

When implementing OpenFeeder, you must:

### 1. **Determine What Data to Expose**

Before creating an OpenFeeder endpoint, ask:
- ✅ Can I legally expose this content to AI systems?
- ✅ Does the content contain personal data? If yes, do I have a legal basis to process it?
- ✅ Have users consented to sharing their data with AI systems?
- ❌ Should I exclude certain content types (user-generated data, sensitive information)?

### 2. **Honor User Consent**

If you collect consent for data sharing:
- Implement a user preference or opt-out mechanism
- Exclude content from OpenFeeder if users haven't consented
- Document your consent flow

Example:
```python
# Only expose content if user consented to LLM access
if user.consented_to_llm_training:
    return openfeeder_response(content)
else:
    return {"error": "User has not consented to LLM access"}
```

### 3. **Exclude Sensitive Data**

Don't expose:
- User email addresses, phone numbers, or postal addresses
- Payment information or financial records
- Medical or health information
- User IDs that could identify individuals
- Any data you wouldn't want in a search engine index

### 4. **Implement Access Controls**

If your OpenFeeder endpoint should be restricted:
- Implement API key authentication
- Use IP allowlisting
- Limit request rates per user/IP
- Monitor access logs for suspicious activity

Example (Nginx):
```nginx
location /openfeeder {
    # Require API key header
    if ($http_x_api_key != $valid_api_key) {
        return 403;
    }
    # Rate limit per API key
    limit_req zone=openfeeder_per_key;
    proxy_pass http://your_app;
}
```

### 5. **Provide Transparency**

- Document what data your OpenFeeder endpoint exposes
- Include a link to your privacy policy in the discovery document
- Specify your contact info for data subject requests in `/.well-known/openfeeder.json`

Example discovery document:
```json
{
  "version": "1.0.2",
  "site": {
    "name": "Your Site",
    "url": "https://yoursite.com",
    "language": "en",
    "description": "Your content"
  },
  "contact": "privacy@yoursite.com",
  "feed": {
    "endpoint": "/openfeeder",
    "type": "paginated"
  },
  "capabilities": ["search"]
}
```

---

## 🔒 Best Practices for GDPR-Compliant OpenFeeder

### A. Content Filtering

```python
def openfeeder_content(page_id: str):
    """Return only content safe for LLM exposure."""
    page = get_page(page_id)
    
    # Exclude user-generated comments and reviews
    if page.type in ["user_comment", "user_review"]:
        return {"error": "User-generated content is excluded"}
    
    # Exclude pages with personal data
    if has_personal_data(page):
        return {"error": "This page contains personal data"}
    
    # Only expose published, non-sensitive content
    return build_openfeeder_response(page)
```

### B. Access Control

```python
# Require authentication for restricted endpoints
@app.get("/openfeeder")
async def openfeeder(api_key: str = Header(None)):
    if not api_key or not verify_api_key(api_key):
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Return filtered content
    return get_openfeeder_data()
```

### C. Audit Logging

```python
# Log all access to OpenFeeder endpoint
@app.get("/openfeeder")
async def openfeeder(request: Request):
    ip = request.client.host
    user_agent = request.headers.get("user-agent")
    timestamp = datetime.utcnow()
    
    # Log the request
    audit_log.write(f"{timestamp} - {ip} - {user_agent}")
    
    return get_openfeeder_data()
```

### D. Rate Limiting

Implement rate limiting to prevent abuse:

```nginx
# In Nginx, limit requests to 100 per minute per IP
limit_req_zone $binary_remote_addr zone=openfeeder:10m rate=100r/m;

location /openfeeder {
    limit_req zone=openfeeder burst=10 nodelay;
    limit_req_status 429;
    proxy_pass http://your_app;
}
```

### E. Data Subject Rights

Implement mechanisms for users to exercise their rights:

- **Right to Access**: Allow users to see what data is exposed in OpenFeeder
- **Right to Erasure**: Remove a user's content from OpenFeeder when requested
- **Right to Rectification**: Allow users to update their data, which is reflected in OpenFeeder
- **Right to Restrict Processing**: Exclude specific content from LLM training signals

Example:
```python
@app.post("/privacy/request/erasure")
async def request_erasure(user_id: str):
    """User requests their content be removed from OpenFeeder."""
    # Remove all user's content from index
    remove_user_content_from_openfeeder(user_id)
    # Confirm deletion
    return {"status": "Your content has been removed"}
```

---

## 📋 GDPR Compliance Checklist

Before launching OpenFeeder, verify:

- [ ] **Legal Basis**: I have a legal basis to expose this content to AI systems (e.g., public content, user consent, legitimate business interest)
- [ ] **Consent**: Users have given informed consent, OR consent is not required for this content type
- [ ] **Data Minimization**: I'm only exposing necessary data, not personal information
- [ ] **Transparency**: My privacy policy explains data sharing with AI systems
- [ ] **Contact Info**: My OpenFeeder discovery document includes contact info for inquiries
- [ ] **Access Control**: I've restricted access if the endpoint should be private
- [ ] **Rate Limiting**: I've implemented rate limiting to prevent abuse
- [ ] **Audit Logging**: I log access to the endpoint
- [ ] **Data Subject Rights**: I can honor erasure, rectification, and access requests
- [ ] **DPA Review**: If needed, I've reviewed with my Data Protection Officer

---

## ⚖️ Legal Considerations

### Not Legal Advice

This document is technical guidance. **Consult a lawyer** for your specific situation.

### GDPR Applies If

- Your site has users in the EU
- You process personal data about EU residents
- You expose content containing personal data to third parties (including AI systems)

### Key GDPR Obligations

1. **Lawful Basis** (Article 6): You must have a legal reason to process data
2. **Transparency** (Article 13-14): You must inform users how their data is used
3. **Data Minimization** (Article 5): Only process necessary data
4. **Data Subject Rights** (Articles 12-22): Users can access, correct, or delete their data
5. **International Transfers**: Be cautious exposing data to AI systems in non-EU jurisdictions

---

## ❓ FAQ

### Q: Does OpenFeeder handle GDPR compliance for me?

**A:** No. OpenFeeder is a technical protocol. You must implement compliance measures on top of it.

### Q: Can I expose user comments/reviews in OpenFeeder?

**A:** Only if:
1. The content is already public (they consented to publishing)
2. You have a legal basis to share with AI systems
3. Personal data is minimized (no email, IP, or identifying info)

### Q: Should my OpenFeeder endpoint require authentication?

**A:** If your content contains personal data or restricted content, yes. Use API keys or OAuth.

### Q: What if a user asks to be removed from OpenFeeder?

**A:** Implement an erasure mechanism and remove their content within 30 days (GDPR standard).

### Q: Is OpenFeeder GDPR-compliant?

**A:** OpenFeeder provides the *tools* (rate limiting, access control, authentication) to be compliant. Whether your *implementation* is compliant depends on your data and choices.

---

## 📞 Questions?

- **For OpenFeeder technical questions**: See [SPEC.md](spec/SPEC.md) or [Implementation Guide](docs/01_IMPLEMENTATION_GUIDE.md)
- **For GDPR guidance**: Consult your Data Protection Officer or a privacy lawyer
- **For security concerns**: See [Security Guide](spec/SECURITY.md)

---

## License

This document is part of OpenFeeder, licensed under the MIT License.

Copyright (c) 2026 Jean-Christophe Viau. See [LICENSE](LICENSE) for details.

---

*Made with 🔥 by Ember & JC*
