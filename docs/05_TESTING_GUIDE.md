# Testing Guide for OpenFeeder Adapters

Complete testing strategies, validation, and CI/CD integration.

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Unit Tests](#unit-tests)
3. [Integration Tests](#integration-tests)
4. [API Validation](#api-validation)
5. [Using the OpenFeeder Validator](#using-the-openfeeder-validator)
6. [CI/CD Integration](#cicd-integration)
7. [Test Fixtures](#test-fixtures)

---

## Testing Strategy

### Testing Pyramid

```
        🎯 E2E Tests (5%)
        Integration Tests (25%)
    Unit Tests (70%)
```

**Unit Tests** (70%): Fast, test isolated components  
**Integration Tests** (25%): Test component interaction  
**E2E Tests** (5%): Full workflow validation (slow)

### Test Coverage Goals

- **Lines**: 80%+
- **Branches**: 70%+
- **Functions**: 85%+

---

## Unit Tests

### Node.js/Jest Examples

**tests/feeds.test.js:**
```javascript
const request = require('supertest');
const app = require('../src/index');

describe('Feed Endpoints', () => {
  describe('GET /feeds', () => {
    test('should return feeds with pagination', async () => {
      const response = await request(app)
        .get('/feeds')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('feeds');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.feeds)).toBe(true);
    });

    test('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/feeds?limit=5')
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(5);
      expect(response.body.data.feeds.length).toBeLessThanOrEqual(5);
    });

    test('should enforce max limit of 100', async () => {
      const response = await request(app)
        .get('/feeds?limit=500')
        .expect(200);

      expect(response.body.data.pagination.limit).toBeLessThanOrEqual(100);
    });

    test('should support search filter', async () => {
      const response = await request(app)
        .get('/feeds?search=blog')
        .expect(200);

      response.body.data.feeds.forEach(feed => {
        const title = feed.title.toLowerCase();
        const desc = feed.description.toLowerCase();
        expect(
          title.includes('blog') || desc.includes('blog')
        ).toBe(true);
      });
    });

    test('should paginate correctly', async () => {
      const response1 = await request(app).get('/feeds?offset=0&limit=2');
      const response2 = await request(app).get('/feeds?offset=2&limit=2');

      expect(response1.body.data.feeds[0].id)
        .not.toBe(response2.body.data.feeds[0].id);
    });
  });

  describe('GET /feeds/:feedId', () => {
    test('should return specific feed', async () => {
      const response = await request(app)
        .get('/feeds/blog-main')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('blog-main');
      expect(response.body.data).toHaveProperty('title');
    });

    test('should return 404 for invalid feed', async () => {
      const response = await request(app)
        .get('/feeds/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('FEED_NOT_FOUND');
    });
  });
});

describe('Item Endpoints', () => {
  describe('GET /feeds/:feedId/items', () => {
    test('should return items with pagination', async () => {
      const response = await request(app)
        .get('/feeds/blog-main/items')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
    });

    test('should filter by search', async () => {
      const response = await request(app)
        .get('/feeds/blog-main/items?search=tutorial')
        .expect(200);

      response.body.data.items.forEach(item => {
        const combined = `${item.title} ${item.description}`.toLowerCase();
        expect(combined).toContain('tutorial');
      });
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/feeds/blog-main/items?category=tutorial')
        .expect(200);

      response.body.data.items.forEach(item => {
        expect(item.categories).toContain('tutorial');
      });
    });

    test('should filter by date range', async () => {
      const after = '2026-03-08T00:00:00Z';
      const before = '2026-03-11T00:00:00Z';

      const response = await request(app)
        .get(`/feeds/blog-main/items?after=${after}&before=${before}`)
        .expect(200);

      response.body.data.items.forEach(item => {
        const published = new Date(item.published);
        expect(published >= new Date(after)).toBe(true);
        expect(published <= new Date(before)).toBe(true);
      });
    });

    test('should return 404 for invalid feed', async () => {
      const response = await request(app)
        .get('/feeds/nonexistent/items')
        .expect(404);

      expect(response.body.code).toBe('FEED_NOT_FOUND');
    });
  });
});

describe('Health Check', () => {
  test('should return healthy status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body).toHaveProperty('version');
  });
});
```

**tests/validation.test.js:**
```javascript
describe('Response Schema Validation', () => {
  test('feed objects should have required fields', async () => {
    const response = await request(app).get('/feeds');
    
    response.body.data.feeds.forEach(feed => {
      expect(feed).toHaveProperty('id');
      expect(feed).toHaveProperty('title');
      expect(typeof feed.id).toBe('string');
      expect(typeof feed.title).toBe('string');
      expect(feed.id).toBeTruthy(); // Not empty
    });
  });

  test('item objects should have required fields', async () => {
    const response = await request(app)
      .get('/feeds/blog-main/items');
    
    response.body.data.items.forEach(item => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('published');
      expect(new Date(item.published)).toBeInstanceOf(Date);
    });
  });

  test('pagination should be present in list responses', async () => {
    const response = await request(app).get('/feeds');
    
    const { pagination } = response.body.data;
    expect(pagination).toHaveProperty('offset');
    expect(pagination).toHaveProperty('limit');
    expect(pagination).toHaveProperty('total');
    expect(pagination).toHaveProperty('hasMore');
  });
});
```

### Python/pytest Examples

**tests/test_feeds.py:**
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

class TestFeeds:
    def test_get_feeds_returns_success(self):
        response = client.get("/feeds")
        assert response.status_code == 200
        assert response.json()["success"] is True
        assert "data" in response.json()

    def test_get_feeds_pagination(self):
        response = client.get("/feeds?offset=0&limit=5")
        data = response.json()["data"]
        
        assert "pagination" in data
        assert data["pagination"]["offset"] == 0
        assert data["pagination"]["limit"] == 5

    def test_get_feeds_limit_enforcement(self):
        response = client.get("/feeds?limit=500")
        limit = response.json()["data"]["pagination"]["limit"]
        assert limit <= 100

    def test_get_feeds_search_filter(self):
        response = client.get("/feeds?search=blog")
        feeds = response.json()["data"]["feeds"]
        
        for feed in feeds:
            combined = f"{feed['title']} {feed['description']}".lower()
            assert "blog" in combined

    def test_get_specific_feed(self):
        response = client.get("/feeds/blog-main")
        assert response.status_code == 200
        assert response.json()["data"]["id"] == "blog-main"

    def test_get_nonexistent_feed_returns_404(self):
        response = client.get("/feeds/nonexistent")
        assert response.status_code == 404
        assert response.json()["success"] is False

class TestItems:
    def test_get_items_returns_list(self):
        response = client.get("/feeds/blog-main/items")
        assert response.status_code == 200
        assert isinstance(response.json()["data"]["items"], list)

    def test_filter_items_by_category(self):
        response = client.get("/feeds/blog-main/items?category=tutorial")
        items = response.json()["data"]["items"]
        
        for item in items:
            assert "tutorial" in item["categories"]

    def test_filter_items_by_date_range(self):
        response = client.get(
            "/feeds/blog-main/items?"
            "after=2026-03-08T00:00:00Z&"
            "before=2026-03-11T00:00:00Z"
        )
        items = response.json()["data"]["items"]
        
        for item in items:
            published = datetime.fromisoformat(
                item["published"].replace('Z', '+00:00')
            )
            assert published >= datetime(2026, 3, 8)
            assert published <= datetime(2026, 3, 11)

class TestValidation:
    def test_feed_schema_required_fields(self):
        response = client.get("/feeds")
        feeds = response.json()["data"]["feeds"]
        
        for feed in feeds:
            assert "id" in feed
            assert "title" in feed
            assert feed["id"]  # Not empty

    def test_item_schema_required_fields(self):
        response = client.get("/feeds/blog-main/items")
        items = response.json()["data"]["items"]
        
        for item in items:
            assert "id" in item
            assert "title" in item
            assert "published" in item
```

---

## Integration Tests

### End-to-End User Flow

**Node.js:**
```javascript
describe('Integration: Complete User Flow', () => {
  test('user can discover feeds and read items', async () => {
    // Step 1: Discover available feeds
    const feedsResponse = await request(app).get('/feeds');
    expect(feedsResponse.body.data.feeds.length).toBeGreaterThan(0);
    
    const feedId = feedsResponse.body.data.feeds[0].id;
    
    // Step 2: Get items from a feed
    const itemsResponse = await request(app)
      .get(`/feeds/${feedId}/items`);
    expect(itemsResponse.status).toBe(200);
    
    // Step 3: Filter items
    const filtered = await request(app)
      .get(`/feeds/${feedId}/items?limit=5&offset=0`);
    
    expect(filtered.body.data.items.length).toBeLessThanOrEqual(5);
  });

  test('user can search across multiple categories', async () => {
    const response = await request(app)
      .get('/feeds/blog-main/items?category=tutorial&search=api')
      .expect(200);

    expect(response.body.data.items.length).toBeGreaterThanOrEqual(0);
  });
});
```

---

## API Validation

### Response Format Validation

```javascript
const validateFeedResponse = (response) => {
  const { success, data, apiVersion } = response.body;

  // Check envelope
  expect(success).toBe(true);
  expect(typeof apiVersion).toBe('string');
  expect(data).toBeDefined();

  // Check data structure
  expect(Array.isArray(data.feeds)).toBe(true);
  expect(data.pagination).toBeDefined();

  // Check each feed
  data.feeds.forEach(feed => {
    expect(feed).toHaveProperty('id');
    expect(feed).toHaveProperty('title');
    expect(feed).toHaveProperty('updated');
    expect(/^\d{4}-\d{2}-\d{2}/.test(feed.updated)).toBe(true); // ISO 8601
  });
};
```

### Header Validation

```javascript
test('responses should have proper CORS headers', async () => {
  const response = await request(app).get('/feeds');
  
  expect(response.headers['access-control-allow-origin']).toBe('*');
  expect(response.headers['access-control-allow-methods']).toContain('GET');
});
```

---

## Using the OpenFeeder Validator

### Install Validator

```bash
npm install @openfeeder/validator
# or
pip install openfeeder-validator
```

### Node.js Validation

```javascript
const { validateAdapter } = require('@openfeeder/validator');

async function runValidation() {
  const results = await validateAdapter('http://localhost:3000', {
    apiKey: process.env.TEST_API_KEY,
    feedIds: ['blog-main', 'products'],
    verbose: true
  });

  console.log('Validation Results:');
  console.log(results);

  if (!results.valid) {
    console.error('Validation failed!');
    process.exit(1);
  }
}

runValidation().catch(console.error);
```

### Python Validation

```python
from openfeeder_validator import validate_adapter

results = validate_adapter(
    'http://localhost:3000',
    api_key=os.getenv('TEST_API_KEY'),
    feed_ids=['blog-main', 'products'],
    verbose=True
)

print(f"Valid: {results['valid']}")
print(f"Errors: {results['errors']}")
print(f"Warnings: {results['warnings']}")
```

### Validation Checklist

The validator checks:

- ✓ Health endpoint responds
- ✓ Feed discovery endpoint works
- ✓ Item endpoints work for each feed
- ✓ Pagination parameters work correctly
- ✓ Response schemas match OpenFeeder spec
- ✓ Date formats are ISO 8601
- ✓ Required fields present
- ✓ Feed/item IDs are unique and stable
- ✓ Error responses follow spec
- ✓ CORS headers present
- ✓ Content-Type headers correct

---

## CI/CD Integration

### GitHub Actions

**.github/workflows/test.yml:**
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      # Add any services your adapter needs
      mongodb:
        image: mongo:5
        options: >-
          --health-cmd mongosh
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '16'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: mongodb://localhost:27017/test
      
      - name: Run coverage
        run: npm run coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
      
      - name: Start server
        run: npm start &
        env:
          PORT: 3000
      
      - name: Validate with OpenFeeder
        run: npx openfeeder-validator http://localhost:3000
```

### GitLab CI

**.gitlab-ci.yml:**
```yaml
stages:
  - test
  - validate

test:
  stage: test
  image: node:16
  services:
    - mongo:5
  script:
    - npm ci
    - npm test
    - npm run coverage
  coverage: '/Lines\s*:\s*(\d+\.\d+)%/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml

validate:
  stage: validate
  image: node:16
  services:
    - mongo:5
  script:
    - npm ci
    - npm start &
    - sleep 5
    - npx openfeeder-validator http://localhost:3000
```

### Deployment Gate

```javascript
// tests/validate-before-deploy.js
const { validateAdapter } = require('@openfeeder/validator');

async function validate() {
  console.log('Running pre-deployment validation...');
  
  const results = await validateAdapter(
    process.env.STAGING_URL || 'http://localhost:3000'
  );

  if (!results.valid) {
    console.error('❌ Validation failed!');
    console.error(JSON.stringify(results.errors, null, 2));
    process.exit(1);
  }

  console.log('✓ Validation passed!');
  console.log(`✓ Checked ${results.feedsChecked} feeds`);
  console.log(`✓ Checked ${results.itemsChecked} items`);
}

validate().catch(err => {
  console.error(err);
  process.exit(1);
});
```

---

## Test Fixtures

### Mock Feed Data

**tests/fixtures/feeds.json:**
```json
{
  "blog-main": {
    "id": "blog-main",
    "title": "Main Blog",
    "description": "Our company blog",
    "type": "blog",
    "url": "https://example.com/blog",
    "itemCount": 42,
    "updated": "2026-03-10T12:00:00Z"
  },
  "products": {
    "id": "products",
    "title": "Product Feed",
    "description": "Current products",
    "type": "product",
    "url": "https://example.com/products",
    "itemCount": 156,
    "updated": "2026-03-10T10:30:00Z"
  }
}
```

**tests/fixtures/items.json:**
```json
{
  "blog-main": [
    {
      "id": "article-1",
      "title": "Getting Started",
      "description": "Intro guide",
      "published": "2026-03-10T09:00:00Z",
      "categories": ["tutorial"]
    }
  ]
}
```

### Loading Fixtures

**Node.js:**
```javascript
const fixtures = require('./fixtures');

beforeEach(() => {
  // Reset to fixture data before each test
  FEEDS = JSON.parse(JSON.stringify(fixtures.feeds));
  ITEMS = JSON.parse(JSON.stringify(fixtures.items));
});
```

**Python:**
```python
import json

@pytest.fixture
def feeds():
    with open('tests/fixtures/feeds.json') as f:
        return json.load(f)

@pytest.fixture
def items():
    with open('tests/fixtures/items.json') as f:
        return json.load(f)
```

---

## Performance Testing

### Load Testing with k6

**tests/load.js:**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up
    { duration: '1m30s', target: 10 },  // Stay at 10
    { duration: '30s', target: 0 }   // Ramp down
  ]
};

export default function () {
  // Test feed discovery
  let res = http.get('http://localhost:3000/feeds');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500
  });

  sleep(1);

  // Test item retrieval
  res = http.get('http://localhost:3000/feeds/blog-main/items');
  check(res, {
    'status is 200': (r) => r.status === 200
  });

  sleep(1);
}
```

Run it:
```bash
k6 run tests/load.js
```

---

## Summary

✓ Write tests for all endpoints  
✓ Test pagination and filtering  
✓ Validate response schemas  
✓ Use OpenFeeder validator  
✓ Integrate with CI/CD  
✓ Aim for 80%+ code coverage  
✓ Load test before deployment  

---

See also:
- [Implementation Guide](./01_IMPLEMENTATION_GUIDE.md)
- [Code Examples](./04_CODE_EXAMPLES.md)
- [Deployment Checklist](./06_DEPLOYMENT_CHECKLIST.md)

