# Node.js/Express HTTP Proxy Implementation Research

**Date:** 2026-05-12  
**Context:** Multi-user API proxy service  
**Focus:** Production-ready patterns for request forwarding, auth, rate limiting, observability

---

## 1. HTTP Proxy Implementation

### Recommended: `http-proxy-middleware` v4.0.0

**Why:**
- Built on `http-proxy` (battle-tested, 10M+ weekly downloads)
- Native Express integration
- Streaming support (handles large payloads efficiently)
- WebSocket support
- Active maintenance (latest v4.0.0, 2024)

**Core Pattern:**

```javascript
const { createProxyMiddleware } = require('http-proxy-middleware');

const proxyMiddleware = createProxyMiddleware({
  target: 'https://api.target.com',
  changeOrigin: true, // CRITICAL: updates Host header to target
  pathRewrite: { '^/api/v1': '' }, // strip prefix if needed
  
  // Request interceptor
  onProxyReq: (proxyReq, req, res) => {
    // Add/modify headers
    proxyReq.setHeader('X-Forwarded-User', req.user.id);
    
    // Handle body for POST/PUT/PATCH
    if (req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  
  // Response interceptor
  onProxyRes: (proxyRes, req, res) => {
    // Log response status
    req.log.info({ status: proxyRes.statusCode, path: req.path });
  },
  
  // Error handler
  onError: (err, req, res) => {
    req.log.error({ err, path: req.path }, 'Proxy error');
    res.status(502).json({ error: 'Bad Gateway' });
  },
  
  // Timeout configuration
  proxyTimeout: 30000, // 30s
  timeout: 30000,
});

app.use('/api/v1', proxyMiddleware);
```

**Gotchas:**
- **Body parsing conflict:** If using `express.json()`, body is consumed. Must reconstruct in `onProxyReq` or use `bodyParser: false` option
- **changeOrigin:** Always set `true` for external APIs (avoids Host header mismatch)
- **Streaming:** Works by default, don't buffer large responses
- **WebSocket:** Requires `ws: true` option

**Alternative: Manual with `axios`**

Only if need fine-grained control or response transformation:

```javascript
app.post('/api/v1/*', async (req, res) => {
  try {
    const response = await axios({
      method: req.method,
      url: `https://api.target.com${req.path}`,
      headers: {
        ...req.headers,
        host: 'api.target.com', // override
      },
      data: req.body,
      timeout: 30000,
      validateStatus: () => true, // don't throw on 4xx/5xx
    });
    
    res.status(response.status)
       .set(response.headers)
       .send(response.data);
  } catch (err) {
    req.log.error({ err }, 'Proxy failed');
    res.status(502).json({ error: 'Bad Gateway' });
  }
});
```

**Trade-off:** Loses streaming, buffers entire response in memory. Use only for small payloads or when transformation needed.

---

## 2. Request Forwarding Best Practices

### Headers

**Forward selectively:**
```javascript
const FORWARD_HEADERS = [
  'content-type',
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
  'authorization', // if passing through
];

const forwardHeaders = {};
FORWARD_HEADERS.forEach(h => {
  if (req.headers[h]) forwardHeaders[h] = req.headers[h];
});

// Add proxy-specific headers
forwardHeaders['x-forwarded-for'] = req.ip;
forwardHeaders['x-forwarded-proto'] = req.protocol;
forwardHeaders['x-forwarded-host'] = req.hostname;
```

**Never forward:**
- `host` (set to target)
- `connection`, `keep-alive` (hop-by-hop)
- `cookie` (unless explicitly needed)
- Internal headers (`x-internal-*`)

### Body Handling

**Streaming (preferred):**
```javascript
// http-proxy-middleware handles automatically
// No body parsing middleware before proxy
```

**Buffered (when transformation needed):**
```javascript
app.use(express.json({ limit: '10mb' })); // set reasonable limit

// In onProxyReq:
if (req.body) {
  const bodyData = JSON.stringify(req.body);
  proxyReq.setHeader('Content-Type', 'application/json');
  proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
  proxyReq.write(bodyData);
}
```

### Error Handling

**Classify errors:**
```javascript
onError: (err, req, res) => {
  const errorMap = {
    ECONNREFUSED: { status: 503, message: 'Service Unavailable' },
    ETIMEDOUT: { status: 504, message: 'Gateway Timeout' },
    ENOTFOUND: { status: 502, message: 'Bad Gateway' },
  };
  
  const mapped = errorMap[err.code] || { status: 502, message: 'Bad Gateway' };
  
  req.log.error({ 
    err: err.message, 
    code: err.code, 
    target: req.proxyTarget 
  });
  
  res.status(mapped.status).json({ 
    error: mapped.message,
    requestId: req.id, // for tracing
  });
}
```

---

## 3. JWT Authentication Middleware

### Pattern: Verify then attach user

```javascript
const jwt = require('jsonwebtoken');

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], // explicit algorithm
      issuer: 'your-service', // validate issuer
      maxAge: '1h', // token expiry
    });
    
    req.user = decoded; // attach to request
    req.userId = decoded.sub; // standard claim
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.log.error({ err }, 'JWT verification failed');
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Usage
app.use('/api/v1', authenticateJWT, proxyMiddleware);
```

**Security considerations:**
- Use strong secret (32+ bytes, random)
- Store secret in env var, never hardcode
- Set explicit algorithm (prevents `none` attack)
- Validate issuer/audience claims
- Short expiry (1h), use refresh tokens for longer sessions
- Consider asymmetric keys (RS256) for multi-service

**Performance:**
- JWT verification is CPU-bound (~0.1-0.5ms per request)
- For high throughput, consider caching decoded tokens (with TTL < token expiry)

---

## 4. Rate Limiting

### Recommended: `express-rate-limit` v8.5.1 + Redis store

**Why:**
- Simple API, flexible configuration
- Multiple store backends (memory, Redis, Memcached)
- Per-user, per-IP, or custom key functions
- Standardized headers (`RateLimit-*`)

**In-memory (development/single instance):**

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false, // X-RateLimit-* headers (disable)
  
  keyGenerator: (req) => req.userId || req.ip, // per-user or IP
  
  handler: (req, res) => {
    req.log.warn({ userId: req.userId, ip: req.ip }, 'Rate limit exceeded');
    res.status(429).json({ 
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime,
    });
  },
  
  skip: (req) => req.user?.role === 'admin', // bypass for admins
});

app.use('/api/v1', limiter);
```

**Redis-backed (production/multi-instance):**

```javascript
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  enableOfflineQueue: false, // fail fast if Redis down
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: new RedisStore({
    client: redis,
    prefix: 'rl:', // key prefix
  }),
  keyGenerator: (req) => `user:${req.userId}`,
});
```

**Token bucket (smoother rate limiting):**

```javascript
// Custom implementation for burst handling
class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity; // max tokens
    this.tokens = capacity;
    this.refillRate = refillRate; // tokens per second
    this.lastRefill = Date.now();
  }
  
  tryConsume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
  
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsed * this.refillRate
    );
    this.lastRefill = now;
  }
}

// Store per-user buckets in Redis (serialized)
```

**Trade-offs:**
- **In-memory:** Fast, no external deps, but doesn't scale across instances
- **Redis:** Scales horizontally, adds latency (~1-2ms), requires Redis availability
- **Token bucket:** Smoother, allows bursts, more complex to implement

**Gotcha:** Rate limiting adds latency. Place after auth (don't rate limit invalid tokens) but before expensive operations.

---

## 5. Error Propagation & Retry Strategies

### Error Propagation

**Preserve upstream status codes:**
```javascript
onProxyRes: (proxyRes, req, res) => {
  // Log but don't modify 4xx/5xx from upstream
  if (proxyRes.statusCode >= 400) {
    req.log.warn({ 
      status: proxyRes.statusCode, 
      path: req.path,
      userId: req.userId,
    }, 'Upstream error');
  }
  // Response passes through unchanged
}
```

**Add context to errors:**
```javascript
onError: (err, req, res) => {
  const errorId = req.id; // unique request ID
  
  req.log.error({ 
    errorId,
    err: err.message,
    code: err.code,
    userId: req.userId,
    path: req.path,
    target: req.proxyTarget,
  }, 'Proxy error');
  
  res.status(502).json({ 
    error: 'Bad Gateway',
    errorId, // client can reference in support
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
```

### Retry Strategy

**Use `axios-retry` for manual proxying:**

```javascript
const axios = require('axios');
const axiosRetry = require('axios-retry');

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay, // 1s, 2s, 4s
  retryCondition: (error) => {
    // Retry on network errors or 5xx (except 501, 505)
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           (error.response?.status >= 500 && 
            error.response?.status !== 501 &&
            error.response?.status !== 505);
  },
  onRetry: (retryCount, error, requestConfig) => {
    logger.warn({ 
      retryCount, 
      url: requestConfig.url,
      error: error.message,
    }, 'Retrying request');
  },
});
```

**For http-proxy-middleware (manual retry):**

```javascript
const retry = require('async-retry');

app.use('/api/v1', async (req, res, next) => {
  try {
    await retry(
      async (bail) => {
        return new Promise((resolve, reject) => {
          proxyMiddleware(req, res, (err) => {
            if (err) {
              if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
                reject(err); // retry
              } else {
                bail(err); // don't retry
              }
            } else {
              resolve();
            }
          });
        });
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
      }
    );
  } catch (err) {
    next(err);
  }
});
```

**Gotchas:**
- Only retry idempotent methods (GET, HEAD, PUT, DELETE)
- Never retry POST unless idempotency key used
- Set max retries (3 is reasonable)
- Use exponential backoff with jitter
- Circuit breaker pattern for persistent failures (see `opossum` library)

---

## 6. Graceful Shutdown

### Pattern: Drain connections before exit

```javascript
const http = require('http');
const stoppable = require('stoppable');

const server = http.createServer(app);
const stoppableServer = stoppable(server, 30000); // 30s grace period

// Handle shutdown signals
const shutdown = (signal) => {
  console.log(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new connections
  stoppableServer.stop((err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    
    // Close external connections
    redis.quit();
    
    console.log('Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force exit if grace period exceeded
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 35000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
```

**Alternative: Manual tracking**

```javascript
let isShuttingDown = false;
const activeConnections = new Set();

server.on('connection', (conn) => {
  activeConnections.add(conn);
  conn.on('close', () => activeConnections.delete(conn));
});

// Middleware to reject new requests during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({ error: 'Service shutting down' });
  }
  next();
});

const shutdown = () => {
  isShuttingDown = true;
  
  server.close(() => {
    console.log('Server closed');
    redis.quit();
    process.exit(0);
  });
  
  // Close idle connections
  activeConnections.forEach(conn => conn.end());
  
  setTimeout(() => {
    activeConnections.forEach(conn => conn.destroy());
    process.exit(1);
  }, 30000);
};
```

**Best practices:**
- Set `Connection: close` header during shutdown
- Return 503 for new requests
- Wait for in-flight requests to complete (30s timeout)
- Close external connections (Redis, DB) after HTTP server
- Handle SIGTERM (Kubernetes/Docker) and SIGINT (Ctrl+C)

---

## 7. Structured Logging: Pino

### Recommended: `pino` v10.3.1

**Why:**
- Fastest Node.js logger (10x faster than Winston)
- JSON output (machine-readable)
- Low overhead (async by default)
- Child loggers for request context
- Redaction support (hide secrets)

**Setup:**

```javascript
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  // Redact sensitive fields
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password'],
    remove: true,
  },
  
  // Pretty print in development
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true },
  } : undefined,
  
  // Base fields
  base: {
    service: 'api-proxy',
    env: process.env.NODE_ENV,
  },
});

module.exports = logger;
```

**Request logging middleware:**

```javascript
const pinoHttp = require('pino-http');

app.use(pinoHttp({
  logger,
  
  // Generate unique request ID
  genReqId: (req) => req.headers['x-request-id'] || require('crypto').randomUUID(),
  
  // Custom serializers
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      userId: req.userId,
      ip: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  
  // Custom log level based on status
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  
  // Don't log health checks
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
}));

// Usage in handlers
app.get('/api/v1/users', (req, res) => {
  req.log.info({ userId: req.userId }, 'Fetching users');
  // ...
});
```

**Child loggers for context:**

```javascript
const childLogger = logger.child({ module: 'auth' });
childLogger.info({ userId: 123 }, 'User authenticated');
// Output: {"level":30,"time":...,"module":"auth","userId":123,"msg":"User authenticated"}
```

**Performance tips:**
- Use log levels appropriately (debug < info < warn < error)
- Avoid logging in hot paths (use sampling)
- Use child loggers instead of adding context to every call
- Pino writes to stdout; use external log shipper (Fluentd, Logstash)

---

## 8. Prometheus Metrics

### Recommended: `prom-client` v15.1.3

**Why:**
- Official Prometheus client
- Supports all metric types (Counter, Gauge, Histogram, Summary)
- Default metrics (CPU, memory, event loop lag)
- Push gateway support

**Setup:**

```javascript
const promClient = require('prom-client');

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ 
  prefix: 'proxy_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

const register = promClient.register;

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'proxy_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // seconds
});

const httpRequestTotal = new promClient.Counter({
  name: 'proxy_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeConnections = new promClient.Gauge({
  name: 'proxy_active_connections',
  help: 'Number of active connections',
});

const proxyErrors = new promClient.Counter({
  name: 'proxy_errors_total',
  help: 'Total number of proxy errors',
  labelNames: ['error_type', 'target'],
});

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
    
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
    
    activeConnections.dec();
  });
  
  next();
});

// Track proxy errors
onError: (err, req, res) => {
  proxyErrors.inc({
    error_type: err.code || 'unknown',
    target: req.proxyTarget,
  });
  // ... error handling
}

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Key metrics for proxies:**
- **Request duration histogram:** Latency percentiles (p50, p95, p99)
- **Request counter:** Throughput, error rate
- **Active connections gauge:** Concurrency
- **Proxy errors counter:** Failure types (timeout, connection refused, etc.)
- **Rate limit hits counter:** Track throttling

**Histogram buckets:**
- Choose based on expected latency (0.01s to 10s for most APIs)
- More buckets = more accuracy but higher cardinality

**Cardinality warning:**
- Avoid high-cardinality labels (user IDs, full URLs)
- Use bounded labels (route patterns, not dynamic paths)
- Limit label values (e.g., group status codes: 2xx, 4xx, 5xx)

**Grafana dashboard queries:**
```promql
# Request rate
rate(proxy_http_requests_total[5m])

# Error rate
rate(proxy_http_requests_total{status_code=~"5.."}[5m])

# p95 latency
histogram_quantile(0.95, rate(proxy_http_request_duration_seconds_bucket[5m]))

# Active connections
proxy_active_connections
```

---

## Security Considerations

1. **Input validation:** Validate all user inputs before proxying (path, headers, body)
2. **Header sanitization:** Strip internal headers (`X-Internal-*`, `X-Forwarded-*` from client)
3. **SSRF prevention:** Whitelist target hosts, never proxy to user-controlled URLs
4. **Secrets management:** Use env vars, never log tokens/keys
5. **TLS:** Enforce HTTPS for external APIs (`rejectUnauthorized: true`)
6. **Timeouts:** Set aggressive timeouts to prevent resource exhaustion
7. **Body size limits:** Limit request body size (`express.json({ limit: '10mb' })`)
8. **Rate limiting:** Per-user limits to prevent abuse
9. **Audit logging:** Log all proxy requests with user context

---

## Performance Implications

| Pattern | Latency Overhead | Memory | Scalability |
|---------|------------------|--------|-------------|
| http-proxy-middleware (streaming) | ~1-2ms | Low (streaming) | Excellent |
| axios (buffered) | ~5-10ms | High (buffers response) | Poor for large payloads |
| JWT verification | ~0.1-0.5ms | Negligible | Excellent |
| Rate limiting (memory) | ~0.1ms | Medium (per-user state) | Single instance only |
| Rate limiting (Redis) | ~1-2ms | Low (external) | Horizontal scaling |
| Pino logging | ~0.05ms | Low (async) | Excellent |
| Prometheus metrics | ~0.1ms | Medium (histograms) | Good (watch cardinality) |

**Bottlenecks:**
- Network I/O to upstream API (dominant factor)
- Redis round-trip for rate limiting (~1-2ms)
- Body parsing for large payloads (use streaming)

**Optimization tips:**
- Use streaming for large payloads
- Cache JWT verification results (with TTL)
- Use connection pooling for Redis
- Minimize middleware chain
- Use cluster mode for multi-core utilization

---

## Recommended Stack

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "http-proxy-middleware": "^4.0.0",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^8.5.1",
    "rate-limit-redis": "^4.2.0",
    "ioredis": "^5.4.1",
    "pino": "^10.3.1",
    "pino-http": "^10.3.0",
    "prom-client": "^15.1.3",
    "stoppable": "^1.1.0"
  },
  "devDependencies": {
    "pino-pretty": "^13.0.0"
  }
}
```

---

## Unresolved Questions

1. **Circuit breaker:** Should we implement circuit breaker pattern for upstream failures? (Consider `opossum` library)
2. **Request deduplication:** Should we deduplicate identical concurrent requests? (Consider `async-cache-dedupe`)
3. **Response caching:** Should we cache upstream responses? (Consider `apicache` or Redis)
4. **Multi-target routing:** How to route to different upstreams based on user/tenant? (Dynamic target in `router` function)
5. **WebSocket support:** Do we need WebSocket proxying? (http-proxy-middleware supports with `ws: true`)
6. **Health checks:** Should proxy health endpoint check upstream availability? (Implement `/health` with upstream ping)
7. **Distributed tracing:** Should we add OpenTelemetry for request tracing across services?
