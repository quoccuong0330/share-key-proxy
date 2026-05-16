---
spec_id: phase-03-streaming-and-error-contract
version: "1.1"
status: pending
blockedBy:
  - phase-02-anthropic-compatible-routing
acceptance_criteria:
  - "Streaming /v1/messages passes SSE chunks without buffering"
  - "Timeouts support long Claude Code sessions"
  - "Upstream/network errors map to Anthropic-compatible JSON"
architecture_decisions:
  - "Streaming route must bypass JSON response buffering"
spec_changes: []
arch_changes: []
context_changes: []
docs_impact: minor
docs_synced_at: ""
---

# Phase 03 — Streaming and Error Contract

## Overview
Protect the behavior Claude Code depends on: long-lived streaming responses and stable error shapes.

## Requirements
- Detect `stream: true` requests.
- Set/forward `text/event-stream` headers.
- Pipe upstream chunks immediately.
- Use long request timeout, at least 300 seconds.
- Map failures to Anthropic-style error JSON.

## Related Code Files
### Update
- `src/anthropic-adapter.js`
- `src/server.js`

## Implementation Steps
1. Add non-stream forwarding path.
2. Add stream forwarding path with `responseType: stream` or native stream piping.
3. Disable buffering/compression on stream response.
4. Add central Anthropic error helper.
5. Ensure client disconnect aborts upstream request.

## Success Criteria
- Streaming emits chunks progressively.
- Client disconnect does not leave hanging upstream request.
- Network failures return 502 with compatible error body.
