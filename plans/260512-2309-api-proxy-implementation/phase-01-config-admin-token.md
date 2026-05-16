---
spec_id: phase-01-config-admin-token
version: "1.1"
status: pending
acceptance_criteria:
  - "Admin-generated token can be used as Claude Code ANTHROPIC_AUTH_TOKEN"
  - "Admin can choose default model and optional allowed models for each token"
  - "Proxy accepts Authorization Bearer token and existing x-proxy-key where needed"
  - "Server upstream env vars are Digi-specific to avoid Claude Code naming confusion"
architecture_decisions:
  - "Admin key store remains the source of client proxy tokens and model policy"
  - "Claude Code receives only proxy token, never real Digi/Anthropic credential"
spec_changes: []
arch_changes: []
context_changes: []
docs_impact: minor
docs_synced_at: ""
---

# Phase 01 — Config and Admin Token Contract

## Overview
Align config so `/admin` generated keys become Claude Code `ANTHROPIC_AUTH_TOKEN`, while `/admin` also chooses token model policy and server-side Digi credentials stay private.

## Requirements
- Parse `Authorization: Bearer <token>` from Claude Code.
- Extend key records with `default_model`, `allowed_models`, and `force_model`.
- Add `/admin` create-key input for model selection; default to latest preferred Claude model when omitted.
- Keep bootstrap/admin auth via `PROXY_API_KEY` or equivalent.
- Rename upstream env intent to Digi-specific names, e.g. `DIGI_BASE_URL`, `DIGI_AUTH_TOKEN`.
- Avoid using server env names that collide mentally with Claude Code `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`.

## Related Code Files
### Update
- `src/server.js`
- `src/keys-store.js`
- `src/admin-routes.js`
- `Dockerfile`
- `docker-compose.yml`

## Implementation Steps
1. Add helper to extract bearer token and fallback `x-proxy-key`.
2. Extend key schema to include model policy and preserve existing keys with safe defaults.
3. Validate bearer token against `keys.json` and return token metadata.
4. Keep admin routes protected by bootstrap key only.
5. Update required env validation to Digi upstream variables.
6. Ensure Docker image includes `keys.json` handling or mounted persistence.

## Success Criteria
- `/admin` generated key works in `Authorization: Bearer ...`.
- `/admin` generated key carries selected model policy.
- Invalid/revoked key returns 401.
- Real Digi/Anthropic token never required on client machine.

## Security Considerations
- Redact all auth headers in logs.
- Do not print upstream tokens at startup.
