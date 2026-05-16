---
spec_id: phase-04-deploy-domain-runbook
version: "1.1"
status: pending
blockedBy:
  - phase-03-streaming-and-error-contract
acceptance_criteria:
  - "Docker/domain/TLS deploy path documented"
  - "Required env vars documented without secrets"
  - "Reverse proxy timeout/buffering settings documented"
architecture_decisions:
  - "Public HTTPS domain fronts the Node proxy"
spec_changes: []
arch_changes: []
context_changes: []
docs_impact: major
docs_synced_at: ""
---

# Phase 04 — Deploy Domain Runbook

## Overview
Deploy behind the user-owned HTTPS domain safely.

## Requirements
- Document domain DNS/TLS setup.
- Document reverse proxy config requirements: no SSE buffering, long timeouts.
- Document env vars: `PROXY_API_KEY`, `DIGI_BASE_URL`, `DIGI_AUTH_TOKEN`, port.
- Add persistence note for `keys.json`.
- Add rollback steps.

## Related Code Files
### Update/Create
- `docker-compose.yml`
- `Dockerfile`
- `docs/deployment.md`
- `docs/operations-runbook.md`

## Implementation Steps
1. Update compose env names and volume for key persistence.
2. Document domain and TLS options.
3. Document Nginx/Caddy/Cloudflare timeout and buffering requirements.
4. Add smoke test commands.
5. Add rollback and token rotation notes.

## Success Criteria
- Operator can deploy and point domain to proxy.
- SSE not buffered by reverse proxy.
- Tokens survive container restart if desired.
