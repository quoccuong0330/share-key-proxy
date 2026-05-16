---
spec_id: phase-05-validation-and-settings
version: "1.1"
status: pending
blockedBy:
  - phase-04-deploy-domain-runbook
acceptance_criteria:
  - "Claude Code settings snippet documented"
  - "Smoke tests verify admin token and messages route"
  - "Security checks verify no upstream token exposure"
architecture_decisions:
  - "Do not edit user global settings automatically without explicit approval"
spec_changes: []
arch_changes: []
context_changes: []
docs_impact: minor
docs_synced_at: ""
---

# Phase 05 — Validation and Claude Code Settings

## Overview
Prove the deployed proxy works from Claude Code config without leaking server credentials.

## Requirements
- Document `~/.claude/settings.json` env block.
- Smoke test `/health`.
- Generate key via `/admin`.
- Test `/v1/messages` with bearer token.
- Test streaming.
- Verify invalid token returns 401.

## Claude Code Settings Contract
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-domain.com",
    "ANTHROPIC_AUTH_TOKEN": "token-from-admin"
  }
}
```

## Related Code Files
### Update/Create
- `docs/deployment.md`
- `docs/operations-runbook.md`

## Implementation Steps
1. Add settings snippet and warning not to use real Anthropic key locally.
2. Add curl smoke tests for bearer token flow.
3. Add streaming smoke test.
4. Add invalid/revoked token checks.
5. Add troubleshooting table for 401/404/502/timeout/SSE buffering.

## Success Criteria
- Claude Code can use domain and admin token.
- Digi receives upstream request.
- Real upstream token stays server-side only.
