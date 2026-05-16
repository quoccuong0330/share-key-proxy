## Design System: 260512-2309-api-proxy-implementation

- **Handoff Source:** /Users/rai/Documents/behappy/proxy-digi/plans/260512-2309-api-proxy-implementation/brainstorm/decision-handoff.json
- **Handoff Status:** ready_for_plan

### System
- **Mode:** enterprise-workbench
- **Platform:** cross-platform
- **Density:** dense
- **Motion:** low
- **Tone:** authoritative and calm
- **Principle:** Optimize for scanability, hierarchy, and operator confidence.
- **Principle:** Use dense layouts only when every control earns its place.
- **Principle:** Favor stable patterns over novelty in high-frequency workflows.

### Product Frame
- **Domain:** general
- **Summary:** auto-bootstrap-plan
- **Primary Users:** account owners managing spend, team members updating preferences
- **Primary Jobs:** change plan with confidence, update payment details safely, understand invoices, renewals, and cancellation impact
- **Constraints:** destructive actions need clear preview, money and permission state must stay explicit

### Information Architecture
- **Navigation Model:** account hub with overview, billing detail, and permissions grouped around financial state
- **Entry Points:** account overview, renewal banner, invoice or failed payment notification
- **Zone:** plan summary - shows spend, renewal, and seat status at a glance
- **Zone:** billing detail - handles payment methods, invoices, and tax details
- **Zone:** permissions rail - clarifies who can spend, approve, or cancel

### Sitemap
- **Account Overview:** Summarize plan, spend, seat, and renewal state. Includes: plan card, usage summary, renewal notices
- **Plan & Billing:** Upgrade, downgrade, or preview plan impact. Includes: plan comparison, cost breakdown, change preview
- **Payment Methods:** Add or replace payment instruments safely. Includes: payment list, default badge, verification state
- **Invoices:** Find invoices, receipts, and tax details quickly. Includes: invoice table, download actions, billing address
- **Members & Roles:** Show who can spend, approve, or cancel. Includes: member list, role matrix, invite action

### Screen Inventory
- **Account Overview:** Summarize plan, spend, seat, and renewal state. Blocks: plan card, usage summary, renewal notices
- **Plan & Billing:** Upgrade, downgrade, or preview plan impact. Blocks: plan comparison, cost breakdown, change preview
- **Payment Methods:** Add or replace payment instruments safely. Blocks: payment list, default badge, verification state
- **Invoices:** Find invoices, receipts, and tax details quickly. Blocks: invoice table, download actions, billing address
- **Members & Roles:** Show who can spend, approve, or cancel. Blocks: member list, role matrix, invite action

### Primary User Flows
- **Change plan:** review current usage -> compare target plan -> preview price and seat impact -> confirm change. Feedback: Show immediate billing impact and renewal date.. Recovery: Offer an undo window or clearly explain when the change takes effect.
- **Update payment method:** open payment methods -> add or replace card -> verify details -> set default. Feedback: Confirm success inline and by toast or banner.. Recovery: Preserve the existing default until the new method validates.
- **Cancel or pause:** start cancellation -> review retained access and data policy -> confirm with explicit acknowledgement. Feedback: Use a modal with consequences and post-action confirmation.. Recovery: Offer pause or downgrade alternatives before destructive exit.

### Interaction Contract
- **Buttons:** Primary buttons advance the main task and stay closest to the active object. | Plan and payment buttons must surface money impact before commit. | Secondary buttons preserve context and avoid competing with the main action. | Destructive buttons require high-contrast labeling and consequence text.
- **Modals:** Use modals for destructive confirmation, irreversible billing changes, or short approval steps. | Use sheets or drawers for supplemental detail that should not wipe current context.
- **Notifications:** Inline validation appears before toasts for form or input problems. | Success toasts confirm completion and never carry the only next step. | Persistent banners are reserved for failed payments, renewal risk, compliance, or account degradation.
- **State Model:** empty, loading, error, success, disabled
- **Contract Note:** State model: empty, loading, error, success, disabled

### Concept Options
- **Membership Control:** Account overview plus plan, payment, and permission clarity.. Best when: Billing confidence matters as much as brand tone.. Watchouts: Can feel dry without clear value framing.
- **Creator Ledger:** Warmer billing center tuned for solo creators and small teams.. Best when: The product sells to creators or indie businesses.. Watchouts: Needs restraint to avoid undermining money trust.
- **System Utility:** Native or restrained preference center with explicit status messaging.. Best when: Platform familiarity reduces support burden.. Watchouts: May under-signal premium positioning.

### Selected Concept
- **Name:** Auto bootstrap prepared decision handoff before /plan.
- **Description:** 
- **Rationale:** Billing confidence matters as much as brand tone.

### Rejected Concepts
- **Creator Ledger:** Alternative direction not selected while `Membership Control` leads.
- **System Utility:** Alternative direction not selected while `Membership Control` leads.

### Trust Signals
- Preview billing impact before plan changes are confirmed.
- Keep renewal, failed payment, and permission state visible near the primary action.
- Use durable confirmation for cancellations and payment method changes.

### Phase Hydration Hints
- **Requirements:** Money impact, renewal timing, and permission ownership must be explicit in every critical path. | Cancellation and downgrade paths must include consequences and alternatives.
- **Architecture:** Reserve space for durable account status and failed payment messaging. | Model billing change previews and role gating before visual refinement.
- **Implementation:** Implement plan preview, payment verification, and cancellation confirmation as separate behaviors. | Make failed payment and renewal banners persist across overview and billing detail surfaces.
- **Success Checks:** Users understand plan impact before confirming changes. | Payment method replacement does not remove the last valid default accidentally. | Cancellation flow explains access loss, retention, and recovery clearly.

### Pattern
- **Name:** Operational Workbench
- **Sections:** Global filters > KPI strip > primary table or board > inspector pane > audit activity
- **CTA Placement:** Toolbar actions and contextual row actions
- **Conversion Focus:** Optimize for task throughput, confidence, and error prevention.

### Style
- **Name:** Operational Clarity
- **Keywords:** dense but stable grids, disciplined spacing, clear grouping, restrained emphasis, status-forward UI
- **Best For:** B2B workbenches, admin products, operational dashboards, analyst surfaces, workflow-heavy products
- **Performance:** Excellent | **Accessibility:** WCAG AA or better with explicit status semantics

### Colors
| Role | Hex |
|------|-----|
| Primary | #0F62FE |
| Secondary | #525252 |
| CTA | #0F62FE |
| Background | #F4F4F4 |
| Text | #161616 |

*Notes: Neutral productivity surfaces, restrained accent usage, status colors reserved for real system state.*

### Typography
- **Heading:** IBM Plex Sans
- **Body:** IBM Plex Sans
- **Mood:** precise, operational, high-trust, enterprise
- **Best For:** B2B dashboards, admin panels, operations consoles, data-heavy workflows

### Final UI Contract
- **Recommended Direction:** Auto bootstrap prepared decision handoff before /plan.
- **Content Hierarchy:** Global filters | KPI strip | primary table or board | inspector pane | audit activity
- **Block Interactions:** Keep plan comparison and billing impact preview connected. | Payment method actions should confirm verification state before changing the default. | Destructive cancellation paths should preview access loss and recovery windows.
- **Button Behaviors:** Primary buttons advance the main task and stay closest to the active object. | Plan and payment buttons must surface money impact before commit. | Secondary buttons preserve context and avoid competing with the main action. | Destructive buttons require high-contrast labeling and consequence text.
- **Modal Behaviors:** Use modals for destructive confirmation, irreversible billing changes, or short approval steps. | Use sheets or drawers for supplemental detail that should not wipe current context.
- **Notification Behaviors:** Inline validation appears before toasts for form or input problems. | Success toasts confirm completion and never carry the only next step. | Persistent banners are reserved for failed payments, renewal risk, compliance, or account degradation.
- **Responsive Strategy:** Collapse inspectors into drawers on tablet. | Keep sticky filters above the fold. | Reduce columns before hiding status information.
- **Motion Guidelines:** Use low motion and reserve transitions for table state, drawers, and confirmations.
- **State Matrix:** empty | loading | error | success | disabled

### Key Effects
Table sort, sticky headers, filter chips, progressive disclosure

### Avoid (Anti-patterns)
- Confusing pricing + No unboxing preview

### Decision Checkpoints
- Confirm the primary user and the riskiest task path.
- Confirm navigation depth before detailing visuals.
- Choose one concept direction to carry into final UI spec: Membership Control, Creator Ledger, System Utility.
- Lock button, modal, and notification behavior before visual polish.
- Validate which money and permission states must remain visible at all times.
- Implementation plan covers scope_in and constraints
- UI plans define sitemap, screen inventory, primary flows, and interaction contract before styling
- Tests and quality gates are defined before /cook
- Plan includes Dependencies and Test Strategy sections

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
