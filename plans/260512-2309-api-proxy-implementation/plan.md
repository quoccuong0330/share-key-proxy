---
spec_id: api-proxy-implementation
version: "1.1"
status: pending
---

# Claude Code Domain Proxy Plan

## Overview
Update the existing Node.js proxy so Claude Code can run through the user domain: Claude Code sends Anthropic-compatible requests to `ANTHROPIC_BASE_URL=https://<domain>` with `ANTHROPIC_AUTH_TOKEN` generated from `/admin`; the proxy validates that token, forwards to Digi, and Digi calls Claude/Anthropic.

## Phases

| Phase | Blocked By | Assignee | Status |
|-------|------------|----------|--------|
| phase-01-config-admin-token | - | - | pending |
| phase-02-anthropic-compatible-routing | phase-01-config-admin-token | - | - | pending |
| phase-03-streaming-and-error-contract | phase-02-anthropic-compatible-routing | - | pending |
| phase-04-deploy-domain-runbook | phase-03-streaming-and-error-contract | - | pending |
| phase-05-validation-and-settings | phase-04-deploy-domain-runbook | - | pending |

## Scope
- In: `/admin` token generation, per-token model selection, proxy token auth from `Authorization: Bearer <admin-token>`, Anthropic-compatible `/v1/*` routes, Digi upstream forwarding, streaming passthrough, Claude Code settings guidance, deploy/domain/TLS runbook.
- Out: PostgreSQL/JWT user auth, Redis rate limits, billing, UI redesign, multi-provider dashboard.

## Architecture Decisions
- `/admin` remains the token issuer; generated token becomes `ANTHROPIC_AUTH_TOKEN` in `~/.claude/settings.json`.
- `/admin` also stores allowed/default model for each token; proxy can force or validate model before forwarding.
- `ANTHROPIC_BASE_URL` in Claude Code points at the user-owned HTTPS domain.
- Proxy never stores or exposes the real Anthropic key; Digi/server side owns upstream Claude credential.
- Proxy accepts Anthropic-compatible requests and forwards to Digi with server-side credentials.
- Preserve streaming behavior; do not buffer SSE responses.

## API Contract Draft

### Client config
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-domain.com",
    "ANTHROPIC_AUTH_TOKEN": "token-from-admin"
  }
}
```

### Auth and model mapping
- Incoming: `Authorization: Bearer <admin-generated-token>` from Claude Code.
- Also keep `x-proxy-key` support for admin/bootstrap compatibility.
- Validate token against `keys.json`.
- Strip incoming client auth before upstream.
- Resolve token metadata from `keys.json`: `default_model`, optional `allowed_models`, optional `force_model`.
- If `force_model=true`, replace request body `model` with token default model.
- If `force_model=false`, allow request model only when in `allowed_models`; otherwise reject 400.
- Upstream to Digi: `Authorization: Bearer <DIGI_AUTH_TOKEN>` or configured Digi header.

### Required Anthropic-compatible endpoints
- `POST /v1/messages` → forward request body to Digi endpoint, return Anthropic-shaped response.
- `POST /v1/messages` with `stream: true` → passthrough `text/event-stream` chunks; no buffering.
- `POST /v1/messages/count_tokens` → forward or return compatible count response if Digi supports it.
- `GET|POST /v1/files*` → passthrough if Claude Code uses files; otherwise explicit 404/501 Anthropic error shape.
- `GET /health` → local health.
- `/admin/*` → token management.

### Streaming contract
- Keep `Content-Type: text/event-stream`.
- Disable response buffering/compression for stream route.
- Forward chunks immediately.
- Preserve terminal event semantics from Digi/Claude.
- Long timeout: at least 5 minutes.

### Error contract
Return Anthropic-compatible shape:
```json
{
  "type": "error",
  "error": { "type": "api_error", "message": "..." }
}
```
Preserve upstream status when safe; map network failures to 502.

<!-- AUTO-UI-BACKFILL-START -->
## UI Gaps To Backfill

- Generated: `2026-05-14T08:39:45+00:00`
- UI readiness: `partial`
- Enforcement: `warning-only`
- Current direction: Auto bootstrap prepared decision handoff before /plan.
- Product domain: General
- Selected concept: Auto bootstrap prepared decision handoff before /plan.
- Concept rationale: Billing confidence matters as much as brand tone.
- Drift to avoid: Creator Ledger | System Utility

### Backfill Before Final UI Sign-Off

- Plan-ready UI artifact: `plans/260512-2309-api-proxy-implementation/design/design-system/260512-2309-api-proxy-implementation/PLAN-READY-UI.md`
- Add information architecture to the plan before visual styling is treated as locked.
- Domain guardrail: Money impact, renewal timing, and permission ownership must be explicit in every critical path.
- Domain guardrail: Cancellation and downgrade paths must include consequences and alternatives.
- Architecture guardrail: Reserve space for durable account status and failed payment messaging.
- Architecture guardrail: Model billing change previews and role gating before visual refinement.
- Preserve trust signal: Preview billing impact before plan changes are confirmed.
- Preserve trust signal: Keep renewal, failed payment, and permission state visible near the primary action.
- Preserve trust signal: Use durable confirmation for cancellations and payment method changes.

### Decision Gates Still Open

- Confirm the primary user and the riskiest task path.
- Confirm navigation depth before detailing visuals.
- Choose one concept direction to carry into final UI spec: Membership Control, Creator Ledger, System Utility.
- Lock button, modal, and notification behavior before visual polish.
- Validate which money and permission states must remain visible at all times.
- Implementation plan covers scope_in and constraints
- UI plans define sitemap, screen inventory, primary flows, and interaction contract before styling
- Tests and quality gates are defined before /cook
- Plan includes Dependencies and Test Strategy sections

### Readiness Notes

- UI scope detected but decision-handoff missing information architecture; continue with explicit assumptions and backfill it during /plan.
<!-- AUTO-UI-BACKFILL-END -->


## Dependencies
- Existing Node.js/Express app.
- `http-proxy-middleware` or native streaming `fetch`/`http` handling.
- Digi upstream base URL and Digi auth token env vars.
- Public HTTPS domain with reverse proxy/TLS.
- Claude Code reads `~/.claude/settings.json` env.

## Test Strategy
- Unit: token parsing accepts Bearer admin token, rejects missing/invalid token, strips secret headers.
- Integration: non-stream `/v1/messages` forwards to Digi and returns Anthropic shape.
- Integration: stream `/v1/messages` forwards SSE chunks without buffering.
- Contract: `/v1/messages/count_tokens` returns supported response or compatible error.
- Deploy smoke: `curl /health`, generate `/admin` token, configure Claude Code env, run tiny Claude request.
- Security: verify real Anthropic/Digi token never appears in client response/logs.

## Success Criteria
- Token generated in `/admin` works as Claude Code `ANTHROPIC_AUTH_TOKEN`.
- Admin can choose default/allowed model for generated token.
- Proxy enforces model policy before forwarding to Digi.
- Claude Code can call `ANTHROPIC_BASE_URL=https://<domain>` successfully.
- Digi receives proxied requests with server-side auth only.
- Streaming responses work for long Claude Code sessions.
- Invalid/revoked admin tokens get 401.
- Deployment doc explains domain/TLS/env/settings rollback.

## Risks
1. SSE buffering breaks Claude Code → use streaming passthrough, test chunks.
2. Wrong upstream env naming causes proxy loop → rename server upstream vars to Digi-specific names.
3. Token leakage in logs → redact Authorization, x-proxy-key, Digi token.
4. Missing Anthropic endpoints → log unknown `/v1/*`, add count/files support or clear compatible errors.
5. Timeout too short → configure app/proxy timeout >= 300s.
