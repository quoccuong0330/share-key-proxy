---
spec_id: phase-02-anthropic-compatible-routing
version: "1.1"
status: pending
blockedBy:
  - phase-01-config-admin-token
acceptance_criteria:
  - "POST /v1/messages accepts Anthropic request shape from Claude Code"
  - "Request model is enforced or validated using token model policy"
  - "POST /v1/messages/count_tokens has compatible forwarding or error behavior"
  - "Unknown /v1 routes return safe Anthropic error shape"
architecture_decisions:
  - "Expose Anthropic-compatible route surface at domain root /v1/*"
  - "Token model policy is applied at proxy layer before Digi forwarding"
spec_changes: []
arch_changes: []
context_changes: []
docs_impact: minor
docs_synced_at: ""
---

# Phase 02 — Anthropic-Compatible Routing

## Overview
Make the user domain look like an Anthropic API base URL to Claude Code.

## Requirements
- `POST /v1/messages` forwards body to Digi.
- Apply token model policy before forwarding: force default model or reject models outside allowlist.
- `POST /v1/messages/count_tokens` forwards if Digi supports it; otherwise returns a documented compatible error.
- `/v1/files*` routes either passthrough or return explicit unsupported Anthropic-shaped error.
- Preserve request headers needed by Claude/Digi: content type, anthropic-version, beta headers where safe.

## Endpoint Inventory + Contracts
### `POST /v1/messages`
Request: Anthropic Messages API JSON from Claude Code; `model` is checked against token policy.
Response: Anthropic message JSON or SSE stream when `stream: true`.

### `POST /v1/messages/count_tokens`
Request: Anthropic token count JSON.
Response: `{ "input_tokens": number }` when supported; otherwise Anthropic error JSON.

### `/v1/files*`
Behavior: passthrough to Digi if supported; else 501 with Anthropic-compatible error.

## Related Code Files
### Update
- `src/server.js`
- `src/anthropic-adapter.js`

## Implementation Steps
1. Replace OpenAI-only mapping assumptions where they break Claude Code compatibility.
2. Add model policy enforcement before Digi call.
3. Add route handlers for count_tokens and files surface.
4. Forward safe Anthropic headers.
5. Normalize unsupported routes to Anthropic-compatible errors.

## Success Criteria
- Claude Code request path resolves under user domain.
- Disallowed model gets 400 before Digi call.
- Forced model overwrites client request model consistently.
- Route behavior is predictable for supported and unsupported endpoints.
