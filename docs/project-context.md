# Project Context

## Metadata
- Project type: `maintenance`
- Workflow track: `default`
- Last updated: `2026-05-14T08:35:31+00:00`

## Why This Project Exists
- Problem statement: Let Claude Code route through `https://vip.digishop.work` using `/admin` generated proxy tokens, then forward through Digi to Claude/Anthropic.
- Success metrics: Claude Code works with `ANTHROPIC_BASE_URL=https://vip.digishop.work`, admin token auth succeeds, selected `cx/*` model is enforced, streaming responses do not buffer, no upstream secret leaks.
- Primary users/personas: Primary user is Rai/operator configuring Claude Code and issuing `/admin` tokens.
- Key user journey: Admin generates token + selects model → user sets `~/.claude/settings.json` env → Claude Code calls domain → proxy validates token/model → Digi calls Claude.

## Discovery Decisions (fill before /plan)
- Chosen direction: Keep existing small Express proxy; add Anthropic-compatible bearer auth, per-token model policy, Digi forwarding, SSE-safe deployment notes.
- Alternatives considered: Full rewrite, direct Claude key on client, or incremental proxy. Chosen incremental proxy to avoid exposing real upstream key and keep scope small.
- Trade-offs accepted: File-backed token store and simple admin UI now; skip DB/rate-limit/billing until proxy path is proven.
- Non-goals: No PostgreSQL/JWT user auth, Redis rate limits, billing, large UI redesign, or provider routing dashboard.
- Brainstorm confirmed (yes/no): yes

## Scope Contract
- In scope this sprint: Implement Claude Code → domain → Digi → Claude proxy path, `/admin` token/model selection, settings snippet, deploy smoke tests.
- Out of scope this sprint: DB migration, multi-tenant billing, complex analytics, broad refactor.
- Constraints (time/budget/compliance): Work within current Node.js/Express/Docker stack; no real tokens in repo/docs; preserve simple rollback.
- Dependencies and owners: Assign owner for backend, frontend, QA, and release sign-off before implementation.

## Architecture Snapshot
- System boundaries: Express app exposes `/admin`, `/health`, and Anthropic-compatible `/v1/*`; Digi is upstream integration boundary.
- Core modules/services: `src/server.js` route/auth edge, `src/admin-routes.js` token admin, `src/keys-store.js` token/model store, `src/anthropic-adapter.js` Digi/Anthropic adapter, Docker files for deploy.
- Data model and storage: Infer from repository modules and migrations; validate authoritative schema and ownership.
- External integrations: Claude Code client env, `https://vip.digishop.work` public domain, Digi upstream, node:dev `npm run dev`, node:start `npm run start`, docker-compose `docker-compose up -d`.
- Security and privacy assumptions: `/admin` token is proxy credential only; real Digi/Anthropic credential stays server-side; redact auth headers and never commit secrets.

## Execution Inputs For Workflow
- Plan entry criteria: Existing plan updated for domain/token/model flow; readiness warnings understood.
- Test strategy: Run syntax/startup checks plus route smoke tests for health, admin token, invalid token, `/v1/messages`, model enforcement, and streaming behavior where possible.
- Release strategy: Deliver in small PRs, require passing tests/review, and stage rollout with rollback ready.
- Rollback strategy: Use revert-ready deployment plan and data-safe rollback steps before merge/release.

## Risks and Mitigations
- High risk 1: SSE buffering or timeout breaks Claude Code long responses.
- High risk 2: Accidental leak of Digi/Anthropic upstream token via logs/responses/docs.
- Unknowns requiring research: Exact Digi route/header contract and whether Digi supports `count_tokens`/files endpoints.

<!-- AUTO-BRAINSTORM-START -->
## Brainstorming Questions (Answer Before /plan)

- 1. What is the single most important business outcome this repository must deliver in this sprint?
- 2. Who is the primary user persona, and what pain point must be solved first?
- 3. Which user journey is highest priority for this sprint (from entry to successful outcome)?
- 4. Which command should become the official local startup command for contributors, and what prerequisites are mandatory?
- 5. Which modules own business-critical logic among: plans/260512-2309-api-proxy-implementation, plans/reports, AGENTS.md?
- 6. How should we mitigate this first critical risk: Missing README. Onboarding and architecture comprehension will be slow.?
<!-- AUTO-BRAINSTORM-END -->

## Checklist Before /cook
- [ ] Discovery decisions are explicit and conflict-free
- [ ] Scope and non-goals are agreed
- [ ] Acceptance criteria are testable
- [ ] Critical risks have owners

<!-- AUTO-DISCOVERY-START -->
## Auto Discovery Snapshot

- Generated: `2026-05-14T08:35:35+00:00`
- Source: `document-project deep`
- Root: `/Users/rai/Documents/behappy/proxy-digi`
- Purpose guess (0.66): Likely a backend/API service supporting internal or external clients.
- Architecture guess: Architecture appears mixed or monolithic; deeper scan may be required for precise boundaries.

### Top-level Structure

- `docs`
- `plans`
- `public`
- `src`

### Detected Stacks

- Node.js
- Express
- Containerized

### Dominant Languages

- JavaScript: 4 files

### Serious Findings

- [high] Missing README. Onboarding and architecture comprehension will be slow.
- [medium] No obvious automated test footprint found.
- [low] No CI workflow directory detected (.github/workflows).

### Next Actions

- Update docs/project-context.md using this scan output before /plan
- Run /check-readiness and resolve high-risk findings before /cook
- Create a targeted plan with /plan referencing this scan

### Startup Hints

- `node:dev`: `npm run dev` (confidence: 0.88)
- `node:start`: `npm run start` (confidence: 0.88)
- `docker-compose:up`: `docker-compose up -d` (confidence: 0.84)

### Repository Index

- `plans/260512-2309-api-proxy-implementation`: backend-or-api-surface (files: 24)
- `plans/reports`: unknown (files: 3)
- `AGENTS.md`: unknown (files: 1)
- `CLAUDE.md`: unknown (files: 1)
- `Dockerfile`: deployment-or-infrastructure (files: 1)
- `docker-compose.yml`: deployment-or-infrastructure (files: 1)
- `keys.json`: unknown (files: 1)
- `package-lock.json`: unknown (files: 1)
- `package.json`: unknown (files: 1)
- `docs/project-context.md`: unknown (files: 1)
- `docs/sharded`: unknown (files: 1)
- `plans/project-scan-report.json`: unknown (files: 1)

### Brainstorm Questions

- 1. What is the single most important business outcome this repository must deliver in this sprint?
- 2. Who is the primary user persona, and what pain point must be solved first?
- 3. Which user journey is highest priority for this sprint (from entry to successful outcome)?
- 4. Which command should become the official local startup command for contributors, and what prerequisites are mandatory?
- 5. Which modules own business-critical logic among: plans/260512-2309-api-proxy-implementation, plans/reports, AGENTS.md?
- 6. How should we mitigate this first critical risk: Missing README. Onboarding and architecture comprehension will be slow.?

<!-- AUTO-DISCOVERY-END -->
