# OpenFeeder WordPress Plugin - Comprehensive cURL Test Examples

A complete collection of cURL commands for testing the OpenFeeder plugin endpoints. Use these for manual API testing, integration verification, and debugging.

**Base URL Examples:**
- `http://localhost:8000` (local dev)
- `https://example.com` (production)
- Replace with your actual WordPress installation URL

---

## 1. Discovery Endpoint

The discovery endpoint reveals plugin information, API version, and available endpoints.

### 1.1 Basic Discovery

```bash
curl -X GET "http://localhost:8000/.well-known/openfeeder.json"
```

**Purpose:** Discover plugin version, capabilities, and API endpoints

**Expected Response:**
```json
{
  "name": "OpenFeeder",
  "version": "1.0.0",
  "api_version": "1.0",
  "endpoints": {
    "content": "/openfeeder/api/content",
    "categories": "/openfeeder/api/categories",
    "search": "/openfeeder/api/content?search=term"
  },
  "capabilities": [
    "pagination",
    "filtering",
    "search",
    "differential_sync"
  ]
}
```

### 1.2 Discovery with Verbose Output

```bash
curl -v -X GET "http://localhost:8000/.well-known/openfeeder.json"
```

**Purpose:** See full HTTP headers and response metadata

---

## 2. List All Articles

Basic endpoint to fetch all available articles.

### 2.1 Get All Articles (Default Pagination)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Retrieve all articles with default pagination (typically 20 per page)

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "title": "Getting Started with WordPress",
      "content": "Lorem ipsum...",
      "excerpt": "A beginner's guide...",
      "author": "John Doe",
      "date": "2026-03-12T10:30:00Z",
      "modified": "2026-03-12T10:30:00Z",
      "category": "Technology",
      "url": "https://example.com/article-1",
      "featured_image": "https://example.com/image.jpg"
    },
    {
      "id": 41,
      "title": "WordPress Security Best Practices",
      "content": "...",
      "author": "Jane Smith",
      "date": "2026-03-11T15:45:00Z",
      "modified": "2026-03-11T15:45:00Z",
      "category": "Technology"
    }
  ],
  "pagination": {
    "total": 150,
    "count": 20,
    "limit": 20,
    "offset": 0
  }
}
```

### 2.2 Get All Articles (Pretty-printed with jq)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" | jq .
```

**Purpose:** Format JSON response for readability

### 2.3 Get All Articles with Headers

```bash
curl -i -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Include HTTP headers in output to verify response metadata

---

## 3. Pagination

Control how many articles are returned and navigate through results.

### 3.1 First 10 Articles

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=10&offset=0"
```

**Purpose:** Get first 10 articles

**Expected Response:** Same structure as section 2.1, with `"count": 10`

### 3.2 Next 10 Articles (Offset 10)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=10&offset=10"
```

**Purpose:** Skip first 10, get next 10

### 3.3 Next 10 Articles (Offset 20)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=10&offset=20"
```

**Purpose:** Continue pagination to article 20-30

### 3.4 Five Articles Per Page

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=5"
```

**Purpose:** Default pagination with 5 items per request

### 3.5 Large Limit (50 Articles)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=50"
```

**Purpose:** Fetch 50 articles at once (test large batch handling)

### 3.6 Third Page (Offset 40)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=20&offset=40"
```

**Purpose:** Navigate to articles 40-60

### 3.7 Last Page (Calculated Offset)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=20&offset=140"
```

**Purpose:** Assuming 150 total articles, fetch final batch (140-150)

### 3.8 Pagination with Verbose Headers

```bash
curl -v -X GET "http://localhost:8000/openfeeder/api/content?limit=10&offset=0"
```

**Purpose:** Check pagination headers and response metadata

---

## 4. Filter by Date Range

Retrieve articles modified after a specific date.

### 4.1 Articles from Last Week

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-03-05"
```

**Purpose:** Get articles modified on or after March 5, 2026

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "title": "Recent Article",
      "modified": "2026-03-12T10:30:00Z",
      "category": "Technology"
    }
  ],
  "pagination": {
    "total": 5,
    "count": 5,
    "limit": 20,
    "offset": 0
  }
}
```

### 4.2 Articles from Last Month

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-02-10"
```

**Purpose:** Get articles modified since February 10, 2026

### 4.3 Articles from Yesterday

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-03-11"
```

**Purpose:** Get only yesterday's new/modified articles

### 4.4 Date Range with Pagination

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-02-01&limit=10&offset=0"
```

**Purpose:** Combine date filter with pagination (first 10 articles from Feb onwards)

### 4.5 Very Old Date (All Articles)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2020-01-01"
```

**Purpose:** Fetch all articles (no upper time limit)

### 4.6 Future Date (No Results)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2099-12-31"
```

**Purpose:** Test empty result handling for future dates

### 4.7 ISO 8601 Timestamp Format

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-03-10T15:30:00Z"
```

**Purpose:** Use ISO timestamp with time component

### 4.8 Different Date Format (YYYY-MM-DD)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-03-10"
```

**Purpose:** Simple date format (should be handled same as ISO)

---

## 5. Filter by Category

Retrieve articles from specific content categories.

### 5.1 Technology Category

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=technology"
```

**Purpose:** Get all technology-related articles

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "title": "WordPress Development Tips",
      "category": "technology",
      "category_id": 5
    }
  ],
  "pagination": {
    "total": 23,
    "count": 20
  }
}
```

### 5.2 News Category

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=news"
```

**Purpose:** Fetch news category articles

### 5.3 Business Category

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=business"
```

**Purpose:** Get business-related content

### 5.4 Multiple Categories (if supported)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=technology,business"
```

**Purpose:** Test fetching multiple categories in single request

### 5.5 Case-Insensitive Category

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=TECHNOLOGY"
```

**Purpose:** Verify case-insensitive category matching

### 5.6 Category with Spaces (URL encoded)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=tech%20news"
```

**Purpose:** Test handling of category names with spaces

### 5.7 Category Slug vs ID

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=5"
```

**Purpose:** Use category ID instead of slug (if supported)

### 5.8 Category with Limit

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=technology&limit=5"
```

**Purpose:** Combine category filter with pagination limit

---

## 6. Search

Full-text search across article titles, content, and metadata.

### 6.1 Search for "AI"

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=AI"
```

**Purpose:** Find all articles containing "AI"

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 38,
      "title": "Understanding AI and Machine Learning",
      "excerpt": "AI is transforming industries...",
      "search_score": 0.95
    }
  ],
  "pagination": {
    "total": 7,
    "count": 7
  }
}
```

### 6.2 Search for "remote work"

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=remote+work"
```

**Purpose:** Multi-word search (URL encoded as `+`)

### 6.3 Search with URL-Encoded Spaces

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=remote%20work"
```

**Purpose:** Alternative encoding with `%20` for spaces

### 6.4 Search for Phrase in Quotes

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=%22artificial+intelligence%22"
```

**Purpose:** Exact phrase search (if supported)

### 6.5 Case-Insensitive Search

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=wordpress"
```

**Purpose:** Verify case-insensitive matching

### 6.6 Search with Single Character

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=a"
```

**Purpose:** Test minimum search length handling

### 6.7 Search with Special Characters

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=C%2B%2B"
```

**Purpose:** Search for "C++" (special chars URL encoded)

### 6.8 Empty Search String

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search="
```

**Purpose:** Test empty search behavior (should return all or error)

### 6.9 Search with Pagination

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=wordpress&limit=10&offset=0"
```

**Purpose:** Paginate search results

### 6.10 Search with Very Long Query

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=the+quick+brown+fox+jumps+over+the+lazy+dog"
```

**Purpose:** Test long search string handling

---

## 7. Combined Filters

Mix multiple filters for complex queries.

### 7.1 Tech Articles from Last Week

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=technology&modified_since=2026-03-05"
```

**Purpose:** Filter by both category and date

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "title": "Latest Tech Trends",
      "category": "technology",
      "modified": "2026-03-12T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 3,
    "count": 3
  }
}
```

### 7.2 First 20 Business Articles

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=business&limit=20&offset=0"
```

**Purpose:** Category + pagination

### 7.3 Startup Articles from Last Month (Limited)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=startup&modified_since=2026-02-10&limit=10"
```

**Purpose:** Search + date + limit

### 7.4 "WordPress" in Tech Category, Recent

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=wordpress&category=technology&modified_since=2026-03-01"
```

**Purpose:** Search + category + date

### 7.5 Business Articles about "AI" (Paginated)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=AI&category=business&limit=5&offset=0"
```

**Purpose:** All filters combined (search, category, pagination)

### 7.6 Multiple Categories, Recent, Limited

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=technology,business&modified_since=2026-03-01&limit=15"
```

**Purpose:** Multiple categories + date + limit

### 7.7 Search with Category and Offset

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=cloud&category=technology&limit=10&offset=10"
```

**Purpose:** All parameters combined (page 2 of results)

### 7.8 Complex Filter with Verbose

```bash
curl -v -X GET "http://localhost:8000/openfeeder/api/content?search=kubernetes&category=technology&modified_since=2026-02-01&limit=20"
```

**Purpose:** See headers alongside complex filtering

---

## 8. Differential Sync

Efficiently sync only changed content using ETags or timestamps.

### 8.1 Initial Sync (Get ETag)

```bash
curl -i -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Fetch first batch and capture ETag header

**Expected Response Headers:**
```
HTTP/1.1 200 OK
ETag: "abc123def456"
Cache-Control: max-age=3600
Content-Type: application/json
```

### 8.2 Conditional Request with ETag

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "If-None-Match: \"abc123def456\""
```

**Purpose:** Return only if content changed (304 Not Modified if unchanged)

**Expected Response (if unchanged):**
```
HTTP/1.1 304 Not Modified
```

### 8.3 Delta Sync by Modified Date

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-03-11T15:30:00Z"
```

**Purpose:** Fetch only articles changed since last sync timestamp

### 8.4 ETag with Pagination

```bash
curl -i -X GET "http://localhost:8000/openfeeder/api/content?limit=10&offset=0"
```

**Purpose:** ETag for first page only

### 8.5 ETag Change Detection

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "If-None-Match: \"old-etag\""
```

**Purpose:** If content changed, receive 200 with new data (not 304)

### 8.6 Last-Modified Header Check

```bash
curl -i -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Check Last-Modified header for cache control

### 8.7 Conditional with Last-Modified

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "If-Modified-Since: Wed, 12 Mar 2026 10:30:00 GMT"
```

**Purpose:** Return content only if modified after given date

### 8.8 Sync After Specific Timestamp

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=2026-03-12T12:00:00Z&limit=100"
```

**Purpose:** Get all changed articles since specific time

---

## 9. Single Article Details

Fetch detailed information for a specific article by ID.

### 9.1 Get Article by ID

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/42"
```

**Purpose:** Retrieve full details of article with ID 42

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "title": "Getting Started with WordPress",
    "content": "Full article HTML content here...",
    "excerpt": "A beginner's guide to WordPress...",
    "author": "John Doe",
    "author_id": 1,
    "date": "2026-03-12T10:30:00Z",
    "modified": "2026-03-12T10:30:00Z",
    "category": "Technology",
    "category_id": 5,
    "tags": ["wordpress", "beginner", "cms"],
    "url": "https://example.com/getting-started-wordpress",
    "featured_image": "https://example.com/images/wordpress.jpg",
    "status": "publish"
  }
}
```

### 9.2 Article with ID 100

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/100"
```

**Purpose:** Test article retrieval (different ID)

### 9.3 Non-Existent Article

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/99999"
```

**Purpose:** Test error handling for missing article

**Expected Error Response:**
```json
{
  "success": false,
  "error": "Article not found",
  "code": 404
}
```

### 9.4 Article with Verbose Headers

```bash
curl -v -X GET "http://localhost:8000/openfeeder/api/content/42"
```

**Purpose:** See response headers for single article

### 9.5 Article with Pretty-Printed JSON

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/42" | jq .
```

**Purpose:** Format single article response for readability

### 9.6 Article Zero (Edge Case)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/0"
```

**Purpose:** Test handling of invalid ID (0)

### 9.7 Negative Article ID

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/-1"
```

**Purpose:** Test handling of negative ID

### 9.8 Article with Slug (if supported)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content/getting-started-wordpress"
```

**Purpose:** Retrieve article by post slug instead of ID

---

## 10. Authentication

Test API authentication methods.

### 10.1 With API Key (Query Parameter)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?api_key=sk_test_abcdef123456"
```

**Purpose:** Pass API key as query parameter

**Expected Response (if key valid):**
```json
{
  "success": true,
  "data": [ ... ],
  "authenticated": true,
  "user": "api_user"
}
```

### 10.2 With Bearer Token (Authorization Header)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Purpose:** Use bearer token authentication (OAuth/JWT style)

### 10.3 Invalid API Key

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?api_key=invalid_key"
```

**Purpose:** Test rejection of invalid key

**Expected Error:**
```json
{
  "success": false,
  "error": "Invalid API key",
  "code": 401
}
```

### 10.4 Missing API Key (If Required)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Test behavior without authentication (if auth is required)

### 10.5 Expired Token

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "Authorization: Bearer expired_token_xyz"
```

**Purpose:** Test handling of expired token

### 10.6 Malformed Authorization Header

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "Authorization: BEARER invalid"
```

**Purpose:** Test error handling for malformed headers

### 10.7 API Key with Rate Limit Headers

```bash
curl -v -X GET "http://localhost:8000/openfeeder/api/content?api_key=YOUR_KEY"
```

**Purpose:** Check rate limit headers in response

### 10.8 Basic Auth (if supported)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -u username:password
```

**Purpose:** HTTP Basic authentication (user:pass encoded in Authorization header)

---

## 11. Response Inspection & Debugging

Commands for detailed response analysis.

### 11.1 Verbose Mode (Headers + Body)

```bash
curl -v -X GET "http://localhost:8000/openfeeder/api/content?limit=5"
```

**Purpose:** See full request/response including headers

**Output includes:**
```
> GET /openfeeder/api/content?limit=5 HTTP/1.1
> Host: localhost:8000
> User-Agent: curl/7.68.0
>
< HTTP/1.1 200 OK
< Content-Type: application/json
< Content-Length: 2048
< ETag: "abc123"
<
{...json response...}
```

### 11.2 Include Headers Only

```bash
curl -i -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Include HTTP headers in output

### 11.3 Headers Only (No Body)

```bash
curl -I -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** HEAD request - headers only, no response body

### 11.4 Pretty-Print JSON with jq

```bash
curl -s -X GET "http://localhost:8000/openfeeder/api/content" | jq .
```

**Purpose:** Format JSON for readability

### 11.5 Extract Specific Field with jq

```bash
curl -s -X GET "http://localhost:8000/openfeeder/api/content" | jq '.data[0].title'
```

**Purpose:** Extract first article's title

### 11.6 Count Results with jq

```bash
curl -s -X GET "http://localhost:8000/openfeeder/api/content" | jq '.data | length'
```

**Purpose:** Get count of returned articles

### 11.7 Filter Articles by Category with jq

```bash
curl -s -X GET "http://localhost:8000/openfeeder/api/content" | jq '.data[] | select(.category=="Technology")'
```

**Purpose:** Extract only articles matching category

### 11.8 Check Response Status Code

```bash
curl -w "\nHTTP Status: %{http_code}\n" -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Display HTTP status code at end

### 11.9 Measure Response Time

```bash
curl -w "Response Time: %{time_total}s\n" -X GET "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Measure API response time in seconds

### 11.10 Silent Mode (No Progress)

```bash
curl -s -X GET "http://localhost:8000/openfeeder/api/content" | jq .
```

**Purpose:** Suppress progress meter, just output response

### 11.11 Save Response to File

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" -o response.json
```

**Purpose:** Save API response to file

### 11.12 Check Cache Headers

```bash
curl -v -X GET "http://localhost:8000/openfeeder/api/content" 2>&1 | grep -i "cache\|etag\|last-modified"
```

**Purpose:** Extract cache-related headers

---

## 12. Error Cases & Edge Cases

Test error handling and boundary conditions.

### 12.1 Limit Exceeds Maximum

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=10000"
```

**Purpose:** Test maximum limit boundary

**Expected Behavior:** Either capped to max (e.g., 100) or error

```json
{
  "success": false,
  "error": "Limit exceeds maximum of 1000",
  "code": 400
}
```

### 12.2 Invalid Limit (Non-Numeric)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=abc"
```

**Purpose:** Test non-numeric limit handling

**Expected Error:**
```json
{
  "success": false,
  "error": "Invalid limit parameter",
  "code": 400
}
```

### 12.3 Negative Limit

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?limit=-10"
```

**Purpose:** Test negative limit handling

### 12.4 Non-Existent Category

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=nonexistent"
```

**Purpose:** Query category that doesn't exist

**Expected Response:** Empty array (no results)
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 0,
    "count": 0
  }
}
```

### 12.5 Negative Offset

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?offset=-1"
```

**Purpose:** Test invalid offset

### 12.6 Offset Beyond Total

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?offset=10000"
```

**Purpose:** Offset larger than total articles

**Expected:** Empty results
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 150,
    "count": 0,
    "offset": 10000
  }
}
```

### 12.7 Invalid Date Format

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?modified_since=invalid-date"
```

**Purpose:** Test malformed date handling

**Expected Error:**
```json
{
  "success": false,
  "error": "Invalid date format. Use YYYY-MM-DD or ISO 8601",
  "code": 400
}
```

### 12.8 Empty Search String

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search="
```

**Purpose:** Empty search behavior

### 12.9 Search Too Short (< 3 chars)

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=ab"
```

**Purpose:** Test minimum search length

### 12.10 Search with No Results

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=xyzzyabc"
```

**Purpose:** Search term matching nothing

**Expected:** Empty results
```json
{
  "success": true,
  "data": [],
  "pagination": { "total": 0 }
}
```

### 12.11 Very Long Search Query

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=$(python3 -c 'print(\"a\" * 500)')"
```

**Purpose:** Test extremely long search string

### 12.12 Invalid JSON (POST if POST is supported)

```bash
curl -X POST "http://localhost:8000/openfeeder/api/content" \
  -H "Content-Type: application/json" \
  -d '{"invalid json'
```

**Purpose:** Malformed request body

### 12.13 Wrong HTTP Method

```bash
curl -X DELETE "http://localhost:8000/openfeeder/api/content"
```

**Purpose:** Unsupported HTTP method

**Expected Error:**
```json
{
  "success": false,
  "error": "Method not allowed",
  "code": 405
}
```

### 12.14 Missing Required Parameter

```bash
curl -X POST "http://localhost:8000/openfeeder/api/content" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Purpose:** POST without required fields (if POST creates articles)

### 12.15 Special Characters in Search

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?search=%3Cscript%3E"
```

**Purpose:** Test XSS-like string handling (should be safe)

### 12.16 SQL Injection Attempt

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=tech'%20OR%20'1'='1"
```

**Purpose:** Verify SQL injection protection

### 12.17 Category with Special Characters

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content?category=tech%2Fbusiness"
```

**Purpose:** Category name with forward slash (URL encoded)

### 12.18 Timeout Test (Slow Endpoint)

```bash
curl --max-time 2 -X GET "http://localhost:8000/openfeeder/api/content?search=expensive"
```

**Purpose:** Test timeout handling (2 second max)

### 12.19 No Content Type Header

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" -H "Content-Type:"
```

**Purpose:** Request without Content-Type

### 12.20 Accept Header Mismatch

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "Accept: application/xml"
```

**Purpose:** Request XML when only JSON supported

---

## Testing Tips

### Running Multiple Tests

```bash
# Run all discovery tests
for endpoint in ".well-known/openfeeder.json" "openfeeder/api/content" "openfeeder/api/content/42"; do
  echo "Testing: $endpoint"
  curl -i -X GET "http://localhost:8000/$endpoint"
  echo -e "\n---\n"
done
```

### Testing with Local jq Installation

```bash
# Pretty print with color
curl -s http://localhost:8000/openfeeder/api/content | jq -C .

# Extract pagination info
curl -s http://localhost:8000/openfeeder/api/content | jq '.pagination'

# Count articles by category
curl -s http://localhost:8000/openfeeder/api/content?limit=100 | jq '[.data[] | .category] | group_by(.) | map({category: .[0], count: length})'
```

### Save Results for Comparison

```bash
# Before changes
curl -s http://localhost:8000/openfeeder/api/content > before.json

# After changes
curl -s http://localhost:8000/openfeeder/api/content > after.json

# Compare
diff before.json after.json
```

### Testing Rate Limiting

```bash
# Quick burst test
for i in {1..10}; do
  curl -w "Status: %{http_code} | Time: %{time_total}s\n" \
    -s -o /dev/null \
    http://localhost:8000/openfeeder/api/content
done
```

### Checking with Different User Agents

```bash
curl -X GET "http://localhost:8000/openfeeder/api/content" \
  -H "User-Agent: Mozilla/5.0 (Custom)" \
  -v
```

---

## Summary

This document contains **60+ cURL examples** organized by:
- **Discovery** (2 examples)
- **List All Articles** (3 examples)
- **Pagination** (8 examples)
- **Date Filtering** (8 examples)
- **Category Filtering** (8 examples)
- **Search** (10 examples)
- **Combined Filters** (8 examples)
- **Differential Sync** (8 examples)
- **Single Article** (8 examples)
- **Authentication** (8 examples)
- **Response Inspection** (12 examples)
- **Error Cases** (20 examples)

Use these examples to:
1. Verify OpenFeeder plugin functionality
2. Test API resilience and edge cases
3. Validate response formats
4. Check error handling
5. Monitor performance and caching
6. Ensure security (SQL injection, XSS protection)

**Pro Tip:** Save useful command combinations to a shell script or alias for repeated testing.
