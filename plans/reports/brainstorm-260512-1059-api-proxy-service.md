# API Proxy Service Brainstorm Report

**Date:** 2026-05-12  
**Topic:** Multi-user API proxy with JWT authentication and rate limiting  
**Status:** ✅ Approved for implementation planning

---

## Problem Statement

Share a single API key (`https://vip.digishop.work/v1`) with multiple users securely. Each user needs:
- Individual JWT authentication (no shared credentials)
- Rate limiting to prevent abuse
- Clear error messages and usage visibility
- Production-ready observability

---

## Requirements Summary

| Category | Finding |
|----------|---------|
| **WHO** | Multiple users accessing shared proxy; maintained by you (selfhost) |
| **WHAT** | Proxy server forwarding requests to `https://vip.digishop.work/v1` with JWT auth + auto-retry |
| **WHEN** | No specific deadline; production-ready from day 1 |
| **WHERE** | Selfhosted via Docker + Docker Compose |
| **WHY** | Share single API key with multiple users securely |
| **HOW** | JWT authentication, auto-retry on failure, Node.js + Express, PostgreSQL user storage |

---

## Evaluated Approaches

### API Design Options

**Option 1: Simple REST Proxy (CHOSEN)** ✅
- Transparent forwarding of all HTTP methods
- Bearer JWT authentication
- URL path versioning (`/v1/`)
- Wildcard routing for flexibility

Pros: Simple, widely understood, easy to add features  
Cons: Need to handle all HTTP methods, careful header forwarding

**Option 2: OpenAI-Compatible Proxy**
- Match OpenAI API format exactly
- Request/response transformation
- Works with existing OpenAI SDKs

Pros: SDK compatibility  
Cons: More complex, limited to specific endpoints

**Option 3: Minimal Token-Based Proxy**
- API key instead of JWT
- Direct passthrough
- No database needed

Pros: Extremely simple  
Cons: Less secure, no user management, hard to scale

### Database Design Options

**Option 1: PostgreSQL (CHOSEN)** ✅
- Normalized schema (3NF)
- Users table + optional request_logs
- Production-ready, easy to scale

Pros: Battle-tested, referential integrity, flexible queries  
Cons: Requires separate container, slightly more setup

**Option 2: MongoDB**
- Document-based, denormalized
- Embedded logs in user documents

Pros: Flexible schema, JSON-native  
Cons: Overkill for simple user table, data duplication

**Option 3: SQLite**
- File-based, zero setup
- Single-file database

Pros: No container needed, easy backups  
Cons: Not suitable for high concurrency, limited to < 100 concurrent users

---

## Final Recommended Solution

**Architecture:**
- Node.js + Express proxy server
- PostgreSQL for user management
- Redis for distributed rate limiting
- Docker Compose for orchestration

**Key Endpoints:**
```
POST /v1/auth/register          — Create user account
POST /v1/auth/login             — Login, get JWT token
GET  /v1/proxy/*                — Forward GET requests
POST /v1/proxy/*                — Forward POST requests
PUT  /v1/proxy/*                — Forward PUT requests
DELETE /v1/proxy/*              — Forward DELETE requests
GET  /v1/usage                  — Show user's rate limit status
GET  /v1/health                 — Health check
```

**Authentication:**
- JWT with no expiry (user choice for simplicity)
- Stored in environment variable (never in code)
- Bearer token in Authorization header

**Rate Limiting:**
- Per-user: 100 requests/hour
- Global: 1000 requests/hour
- Redis-backed counters for distributed tracking
- Clear error responses with retry-after headers

**Observability:**
- Structured logging (Winston/Pino)
- Prometheus metrics (request count, latency, errors)
- Health check endpoint
- Key redaction in all logs

---

## Risk Matrix

| # | Risk | L | I | Score | Category | Mitigation |
|---|------|---|---|-------|----------|------------|
| 1 | API Key Exposure in Logs | 3 | 3 | 9 | 🔴 Critical | Implement key redaction in all logs. Never log raw API key. Use structured logging with sanitization. Test log output before deploy. |
| 2 | Rate Limiting Bypass / Cost Explosion | 3 | 3 | 9 | 🔴 Critical | Implement per-user rate limiting (Redis-backed). Add global rate limit as fallback. Monitor API usage daily. Set up cost alerts. |
| 3 | JWT Secret Compromise | 2 | 3 | 6 | 🔴 Critical | Use strong random secret (256-bit min). Store in env var only. Document secret rotation procedure. Implement rotation before launch. |
| 4 | Database Connection Pool Exhaustion | 2 | 2 | 4 | 🟠 High | Configure connection pool (max 20). Add health check monitoring. Set up alerts for connection count > 15. Test under load. |
| 5 | No Graceful Shutdown / Data Loss | 2 | 2 | 4 | 🟠 High | Implement SIGTERM handler with 30s timeout. Test Docker stop behavior. Add pre-shutdown health check. |

---

## Persona Insights

**Security Adversary 🔒**
- API key exposure is critical. Implement redaction + rate limiting.
- JWT secret must be strong (256-bit) and rotated periodically.
- Never log raw credentials.

**DevOps/SRE 🔧**
- Need observability from day 1 (logs, metrics, health checks).
- Connection pooling essential to prevent DB exhaustion.
- Graceful shutdown required for zero-downtime deployments.

**End User Advocate 👤**
- Clear error messages needed (not generic 500 errors).
- Usage visibility important (rate limit status, reset time).
- Registration flow should be documented.

**YAGNI Enforcer ✂️**
- Skip request logs initially, add later if needed.
- Single JWT (no refresh tokens) is simpler for small user base.
- Prometheus metrics can wait until multiple instances.

**Competitor Analyst 🔍**
- Consider OpenAI-compatible endpoints for UX (future enhancement).
- Industry standard: support multiple API keys with rotation.
- Evaluate existing solutions (Cloudflare AI Gateway) before building.

---

## Implementation Considerations

**Tech Stack:**
- Runtime: Node.js 20+
- Framework: Express.js
- Database: PostgreSQL 14+
- Cache: Redis 7+
- Logging: Winston or Pino
- Metrics: Prometheus client
- Deployment: Docker + Docker Compose

**Security Hardening:**
- JWT secret: 256-bit random, stored in `.env`
- API key: stored in `.env`, never in code
- Rate limiting: Redis-backed, per-user + global
- HTTPS: reverse proxy in front (Nginx/Caddy)
- Input validation: sanitize all user inputs
- CORS: restrict to known origins

**Database Schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE request_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
```

**Testing Strategy:**
- Unit tests: auth, rate limiting, key redaction
- Integration tests: mock target API, full request flow
- Load tests: verify rate limiting + connection pooling
- Security tests: JWT tampering, key exposure in logs
- E2E tests: Docker Compose stack, full deployment

**Deployment Checklist:**
- [ ] JWT secret generated (256-bit random)
- [ ] API key stored in `.env` (never in code)
- [ ] Rate limiting Redis configured
- [ ] Prometheus scrape config added
- [ ] Graceful shutdown tested
- [ ] Log redaction verified
- [ ] Health check endpoint working
- [ ] Docker Compose tested locally
- [ ] Secret rotation procedure documented
- [ ] Cost alerts configured

---

## Success Metrics & Validation

**Functional:**
- All HTTP methods forwarded correctly
- JWT authentication working
- Rate limiting enforced per-user and globally
- Auto-retry on transient failures
- Clear error messages returned

**Non-Functional:**
- Response latency < 500ms (p95)
- Uptime > 99.5%
- Zero API key leaks in logs
- Connection pool never exhausted under load
- Graceful shutdown within 30s

**Operational:**
- Prometheus metrics scraped successfully
- Structured logs queryable
- Health check endpoint responding
- Docker Compose stack starts cleanly
- Secret rotation procedure tested

---

## Next Steps & Dependencies

1. **Implementation Planning** (`/plan` skill)
   - Create detailed phase breakdown
   - Assign tasks and dependencies
   - Estimate effort per phase

2. **Phase 1: Setup Environment**
   - Initialize Node.js project
   - Set up Docker + Docker Compose
   - Configure PostgreSQL + Redis

3. **Phase 2: Core Proxy Logic**
   - Implement request forwarding
   - Add auto-retry mechanism
   - Handle all HTTP methods

4. **Phase 3: Authentication**
   - JWT generation and validation
   - User registration/login endpoints
   - Password hashing (bcrypt)

5. **Phase 4: Rate Limiting**
   - Redis-backed rate limit counters
   - Per-user and global limits
   - Clear error responses

6. **Phase 5: Observability**
   - Structured logging with key redaction
   - Prometheus metrics
   - Health check endpoint

7. **Phase 6: Testing & Security**
   - Unit + integration tests
   - Load testing
   - Security audit (key exposure, JWT tampering)

8. **Phase 7: Deployment**
   - Docker image build
   - Docker Compose stack
   - Secret management
   - Monitoring setup

---

## Contradictions Resolved

| Personas | Conflict | Resolution |
|----------|----------|-----------|
| Security ↔ YAGNI | JWT expiry strategy | **Token with no expiry** — simpler for small user base, can add expiry later |
| DevOps ↔ YAGNI | Observability | **Full observability from day 1** — production-ready from start, easier to debug |

---

## Approval

✅ **User Approved:** 2026-05-12  
**Direction:** Simple REST proxy with JWT auth, PostgreSQL, Redis rate limiting, full observability  
**Ready for:** Implementation planning via `/plan` skill
