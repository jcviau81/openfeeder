# Deployment Checklist for OpenFeeder Adapters

Production-ready deployment guidelines and best practices.

---

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code coverage ≥ 80%
- [ ] No console.log() or debug statements in production code
- [ ] Linting passes (ESLint/Flake8)
- [ ] No hardcoded secrets (API keys, passwords, database URLs)
- [ ] Error handling implemented for all endpoints
- [ ] Input validation on all query parameters

### Documentation
- [ ] README.md completed with setup instructions
- [ ] API documentation generated
- [ ] Environment variables documented (.env.example created)
- [ ] Deployment instructions provided
- [ ] Changelog updated with latest changes

### Dependencies
- [ ] All dependencies pinned to specific versions
- [ ] No security vulnerabilities (`npm audit` / `pip check`)
- [ ] Unused dependencies removed
- [ ] Development dependencies separated from production

### Configuration
- [ ] Environment variables for all configuration
- [ ] No hardcoded URLs or API endpoints
- [ ] Database connection strings from env
- [ ] API keys/tokens from env
- [ ] Port configurable

### Security
- [ ] CORS properly configured (whitelist origins if needed)
- [ ] Rate limiting enabled
- [ ] API key validation implemented
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection for user-generated content
- [ ] HTTPS enforced in production
- [ ] Sensitive data not logged

### Performance
- [ ] Database queries optimized (indexes, pagination)
- [ ] Caching implemented (Redis/in-memory)
- [ ] Response times < 500ms for most endpoints
- [ ] Load tested (k6, Apache Bench, etc.)
- [ ] Database connection pooling configured
- [ ] API respects pagination limits

### Monitoring
- [ ] Error logging configured (Sentry, DataDog, etc.)
- [ ] Health check endpoint working
- [ ] Metrics exported (Prometheus format)
- [ ] Alerting rules configured
- [ ] Log rotation configured
- [ ] Uptime monitoring configured

---

## CORS Configuration

### Permissive (Public API)

```javascript
// Node.js
const cors = require('cors');

app.use(cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key']
}));
```

```python
# Python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

### Restricted (Internal/Partners)

```javascript
// Node.js
app.use(cors({
  origin: [
    'https://app.example.com',
    'https://partner1.example.com',
    'https://partner2.example.com'
  ],
  methods: ['GET', 'OPTIONS'],
  credentials: true
}));
```

```python
# Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.example.com",
        "https://partner1.example.com"
    ],
    allow_methods=["GET"],
    credentials=True
)
```

---

## Rate Limiting

### Node.js Implementation

```javascript
const rateLimit = require('express-rate-limit');

// General rate limit: 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

// Strict limit for auth endpoints: 5 requests per minute
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});

app.use(generalLimiter);
app.post('/auth', authLimiter);
```

### Python Implementation

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.get("/feeds")
@limiter.limit("100/15 minutes")
async def get_feeds(request: Request):
    ...
```

### Custom Rate Limit by API Key

```javascript
const keyBasedLimiter = rateLimit({
  keyGenerator: (req, res) => {
    return req.headers['x-api-key'] || req.ip;
  },
  max: (req, res) => {
    const apiKey = req.headers['x-api-key'];
    
    // Premium plan
    if (isPremiumKey(apiKey)) return 1000;
    
    // Standard plan
    if (isValidKey(apiKey)) return 100;
    
    // Public/unauthenticated
    return 10;
  }
});

app.use(keyBasedLimiter);
```

---

## Performance Optimization

### Database Optimization

```javascript
// Index frequently queried fields
db.items.createIndex({ feedId: 1, published: -1 });
db.items.createIndex({ categories: 1 });

// Use connection pooling
const pool = new Pool({
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

### Caching Strategy

```javascript
// Cache feeds for 1 hour (static data)
const feedCache = {
  data: null,
  expiresAt: 0
};

app.get('/feeds', (req, res) => {
  const now = Date.now();
  
  if (feedCache.data && feedCache.expiresAt > now) {
    return res.json(feedCache.data);
  }

  const freshData = fetchFeeds();
  feedCache.data = freshData;
  feedCache.expiresAt = now + (60 * 60 * 1000);
  
  res.json(freshData);
});

// Cache items per feed for 5 minutes
const createItemCache = () => {
  const cache = new Map();

  return {
    get: (feedId, offset, limit) => {
      const key = `${feedId}:${offset}:${limit}`;
      const cached = cache.get(key);
      
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
      
      return null;
    },
    set: (feedId, offset, limit, data) => {
      const key = `${feedId}:${offset}:${limit}`;
      cache.set(key, {
        data,
        expiresAt: Date.now() + (5 * 60 * 1000)
      });
    },
    clear: (feedId) => {
      for (const key of cache.keys()) {
        if (key.startsWith(feedId)) {
          cache.delete(key);
        }
      }
    }
  };
};

const itemCache = createItemCache();
```

### Query Pagination Enforcement

```javascript
// Always enforce maximum page size
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_OFFSET = 100000; // Prevent excessively large offsets

app.get('/items', (req, res) => {
  let limit = parseInt(req.query.limit || DEFAULT_LIMIT);
  let offset = parseInt(req.query.offset || 0);

  // Clamp values
  limit = Math.max(1, Math.min(MAX_LIMIT, limit));
  offset = Math.max(0, Math.min(MAX_OFFSET, offset));

  // Fetch with these bounds
  const items = fetchItems(offset, limit);
  
  res.json({ success: true, data: items });
});
```

---

## Logging & Monitoring

### Structured Logging

**Node.js with Winston:**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log all requests
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString()
  });
  next();
});

// Log errors
app.use((err, req, res, next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  res.status(500).json({ success: false, error: 'Server error' });
});
```

**Python with structlog:**
```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.msg(
        "request_start",
        method=request.method,
        path=request.url.path
    )
    response = await call_next(request)
    logger.msg(
        "request_end",
        status_code=response.status_code
    )
    return response
```

### Metrics Export

**Prometheus format (Node.js):**
```javascript
const prometheus = require('prom-client');

// Create metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Record metrics
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
});

// Export metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
```

---

## Deployment Environments

### Development

```bash
# .env.development
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
DATABASE_URL=mongodb://localhost:27017/dev
API_PORT=3000
CACHE_TTL=60
```

### Staging

```bash
# .env.staging
NODE_ENV=staging
DEBUG=false
LOG_LEVEL=info
DATABASE_URL=mongodb://staging-db.example.com:27017/staging
API_PORT=3000
CACHE_TTL=300
RATE_LIMIT=100
```

### Production

```bash
# .env.production
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
DATABASE_URL=mongodb+srv://user:pass@prod-cluster.mongodb.net/production
API_PORT=3000
CACHE_TTL=3600
RATE_LIMIT=500
SENTRY_DSN=https://...
```

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:16-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run application
EXPOSE 3000
CMD ["node", "src/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=mongodb://mongo:27017/app
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  mongo:
    image: mongo:5-alpine
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

volumes:
  mongo-data:
```

---

## Kubernetes Deployment

### deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openfeeder-adapter
spec:
  replicas: 3
  selector:
    matchLabels:
      app: openfeeder-adapter
  template:
    metadata:
      labels:
        app: openfeeder-adapter
    spec:
      containers:
      - name: api
        image: your-registry/openfeeder-adapter:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: openfeeder-adapter
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
  selector:
    app: openfeeder-adapter
```

---

## Monitoring & Alerting

### Sentry Error Tracking

```javascript
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

### Datadog Integration

```javascript
const { StatsD } = require('node-dogstatsd').v2;
const dogstatsd = new StatsD();

app.get('/feeds', (req, res) => {
  const start = Date.now();
  
  // ... fetch feeds ...
  
  const duration = Date.now() - start;
  dogstatsd.histogram('openfeeder.feeds.duration', duration);
  dogstatsd.increment('openfeeder.feeds.requests');
});
```

---

## Rollback Plan

### Version Management

```bash
# Tag each release
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Docker tags
docker tag adapter:latest adapter:1.0.0
docker push adapter:1.0.0
docker push adapter:latest
```

### Quick Rollback

```bash
# Kubernetes rollback
kubectl rollout undo deployment/openfeeder-adapter

# Docker Compose rollback
docker-compose down
docker tag adapter:1.0.0 adapter:latest
docker-compose up -d

# Check status
curl https://api.example.com/health
```

---

## Post-Deployment Verification

After deployment, verify:

- [ ] Health check endpoint responds
- [ ] Feed discovery working
- [ ] Items retrievable from all feeds
- [ ] Pagination working correctly
- [ ] Search/filtering functional
- [ ] Response times acceptable
- [ ] Error handling working
- [ ] Rate limiting active
- [ ] CORS headers present
- [ ] Monitoring/logging active
- [ ] No spike in error rates
- [ ] Database connectivity stable

---

## Scaling Considerations

### Horizontal Scaling

```javascript
// Use sticky sessions if needed
const cookieParser = require('cookie-parser');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const redisClient = createClient();
const sessionStore = new RedisStore({ client: redisClient });

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));
```

### Load Balancing

```nginx
# nginx.conf
upstream openfeeder {
  least_conn;  # Load balance by least connections
  server 10.0.0.1:3000;
  server 10.0.0.2:3000;
  server 10.0.0.3:3000;
}

server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass http://openfeeder;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_cache_bypass $http_pragma $http_authorization;
  }
}
```

---

## Disaster Recovery

### Database Backups

```bash
# MongoDB backup
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/production" \
  --out=/backups/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/production" \
  /backups/20260310
```

### Configuration Backups

```bash
# Backup .env and config
tar -czf backups/config-$(date +%Y%m%d).tar.gz .env *.config.js

# Store in secure location
aws s3 cp backups/config-*.tar.gz s3://backup-bucket/configs/
```

---

## Maintenance Windows

### Zero-Downtime Deployment

```javascript
// Graceful shutdown
const server = app.listen(3000);

process.on('SIGTERM', () => {
  console.log('SIGTERM received, gracefully shutting down...');
  
  // Stop accepting new requests
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 30s
  setTimeout(() => {
    console.error('Could not close connections in time');
    process.exit(1);
  }, 30000);
});
```

---

## Post-Deployment Checklist

- [ ] Deployment completed successfully
- [ ] Health checks passing
- [ ] All endpoints responding
- [ ] Monitoring data flowing
- [ ] No errors in logs
- [ ] Performance metrics normal
- [ ] Alerts configured and working
- [ ] Rollback tested and working
- [ ] Backups verified
- [ ] Documentation updated

---

See also:
- [Implementation Guide](./01_IMPLEMENTATION_GUIDE.md)
- [Testing Guide](./05_TESTING_GUIDE.md)
- [Code Examples](./04_CODE_EXAMPLES.md)

