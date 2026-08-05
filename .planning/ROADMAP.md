# Roadmap: Conference Finance Dashboard

## Overview

v4.0 improved the protected event-scoped dashboard: information architecture, an actionable event Overview, consolidated Finance and Accommodation workspaces, and hardened shared states, responsiveness, and accessibility.

v5.0 turns accommodation into a reusable, configurable catalog: buyers select priced options at signup (admin assigns final rooms), admins configure rates and availability and explicitly confirm, a booking-reference permalink supports pre-confirmation configuration changes with server-side re-pricing, accommodation charges flow into the canonical amount-due, and allocation prioritizes paid attendees.

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27
- ✅ **v2.0 Attendee Signup + Accommodation Self-Assignment** — groundwork delivered in phases 18-25
- ✅ **v3.0 Canonical Orders Foundation** — canonical runtime and finance groundwork delivered in phases 26-33
- ✅ **v4.0 Event Dashboard UX Overhaul** — phases 34-37 complete; Phase 38 regression verification carried into the v5.0 verification phase
- 🚧 **v5.0 Accommodation Upgrades & Options** — initialized 2026-08-05, phases 39-45

## Milestone: v4.0 Event Dashboard UX Overhaul (Phases 34-38)

**Objective:** Turn the event-scoped dashboard into a stats-led operational home with concise navigation and coherent Finance and Accommodation workspaces.

### Scope

- Event Overview information architecture and bounded operational stats
- One concise event sidebar and clear event context
- Finance workspace for Orders, Payments, Donations, and Reconciliation
- Accommodation workspace for Hotels and Allocation
- Shared query states, responsive behavior, accessibility, settings/share placement, and regression verification

### Out Of Scope

- New public signup UX
- Ticket Tailor/provider schema redesign
- New finance formulas or canonical data model changes
- Cross-event analytics or multi-tenant support

## Phases

- [x] **Phase 34: Event Dashboard Information Architecture** - Establish the final event home, sidebar structure, route ownership, and Settings placement.
- [x] **Phase 35: Actionable Event Overview** - Build the stats-led event home and action-oriented operational summary from bounded existing contracts.
- [x] **Phase 36: Finance And Accommodation Workspaces** - Consolidate related routes into tabbed workspaces while preserving behavior and deep links.
- [x] **Phase 37: Shared Dashboard Quality** - Standardize query states, responsive layouts, keyboard behavior, and accessibility across migrated surfaces.
- [ ] **Phase 38: UX Regression And Human Verification** - Verify route integrity, data consistency, mobile/desktop behavior, and visual coherence.

---

### Phase 34: Event Dashboard Information Architecture

**Goal:** Admins see one clear event-scoped navigation model and a deliberate Overview entry point at every event depth.

**Depends on:** v3.0 event shell

**Requirements:** UX-01, UX-02, UX-03, QUAL-04

**Success Criteria:**

1. The event home route renders as the Overview entry point rather than a link directory.
2. The event sidebar contains the agreed concise sections with stable active-state behavior.
3. Event identity, switcher, status, and primary event actions remain clear without duplicate chrome.
4. Settings owns event-level share/configuration actions while primary navigation stays operational.
5. Existing event deep links remain reachable or have explicit safe redirects.

**Plans:** 3 plans

Plans:

- [x] 34-01-PLAN.md — Establish the canonical event Overview and concise event shell
- [x] 34-02-PLAN.md — Move sharing to Settings and preserve deep-link compatibility
- [x] 34-03-PLAN.md — Guide disabled accommodation allocation to event Settings

---

### Phase 35: Actionable Event Overview

**Goal:** The Overview gives finance and operations admins a fast, trustworthy read on the selected event and its next actions.

**Depends on:** Phase 34

**Requirements:** OPS-01, OPS-02

**Success Criteria:**

1. Overview shows bounded event-scoped metrics for attendance, orders/tickets, money status, and accommodation.
2. Metric values reuse existing canonical contracts and agree with their corresponding detail surfaces.
3. The page highlights actionable exceptions with direct links to the relevant workflow.
4. The Overview remains useful for empty or early-stage events without fabricated values.

**Plans:** 3 plans

Plans:

- [x] 35-01-PLAN.md — Define and test the bounded canonical Overview projection and exception model
- [x] 35-02-PLAN.md — Render the actionable stats-led Overview with honest query states
- [x] 35-03-PLAN.md — Close reconciliation and accommodation trustworthiness gaps

---

### Phase 36: Finance And Accommodation Workspaces

**Goal:** Related finance and accommodation operations share context through accessible tabbed workspaces without losing existing behavior.

**Depends on:** Phase 34

**Requirements:** FINUX-01, FINUX-02, ACCUX-01, ACCUX-02

**Success Criteria:**

1. Finance provides accessible navigation for Orders, Payments, Donations, and Reconciliation under one event-scoped workspace.
2. Accommodation provides accessible navigation for Hotels and Allocation under one event-scoped workspace.
3. Existing filters, mutations, canonical money semantics, and event scoping continue to work.
4. Existing useful deep links remain valid or redirect predictably to the corresponding workspace tab.

**Plans:** 4 plans

Plans:

- [x] 36-01-PLAN.md — Establish shared exception-first workspace primitives and URL/tab contracts
- [x] 36-02-PLAN.md — Build the canonical Finance workspace for Orders, Payments, Donations, and Reconciliation
- [x] 36-03-PLAN.md — Build the canonical Accommodation workspace for Hotels and Allocation
- [x] 36-04-PLAN.md — Migrate sidebar ownership and add same-slug legacy route bridges

---

### Phase 37: Shared Dashboard Quality

**Goal:** Event-scoped pages behave consistently across loading, errors, empty data, keyboard navigation, and viewport sizes.

**Depends on:** Phases 35-36

**Requirements:** QUAL-01, QUAL-02, QUAL-03

**Success Criteria:**

1. Shared query-state components or patterns cover loading, error, empty, and populated states across migrated surfaces.
2. Primary workflows are usable on narrow mobile widths and desktop without horizontal overflow or hidden critical actions.
3. Sidebar, tabs, tables, status indicators, and action controls are keyboard-accessible and semantically labeled.
4. Dashboard data reads remain bounded and do not duplicate expensive finance or accommodation queries.

**Plans:** 8 plans

Plans:

- [x] 37-01-PLAN.md — Establish one event-scoped query boundary and shared event context
- [x] 37-02-PLAN.md — Define shared dashboard loading/error/empty/unavailable presentation states
- [x] 37-03-PLAN.md — Harden sidebar, workspace tabs, tables, and responsive shell semantics
- [x] 37-04-PLAN.md — Normalize Overview states, responsiveness, accessibility, and money trust
- [x] 37-05-PLAN.md — Remove duplicate Finance attention/detail reads with active-tab data reuse
- [x] 37-06-PLAN.md — Harden Finance states, canonical money display, tables, and actions
- [x] 37-07-PLAN.md — Gate and reuse Accommodation attention/allocation board reads
- [x] 37-08-PLAN.md — Harden Accommodation states, board responsiveness, and accessible actions

---

### Phase 38: UX Regression And Human Verification

**Goal:** The redesigned event dashboard is verified as a coherent, data-correct experience across routes and devices.

**Depends on:** Phase 37

**Requirements:** OPS-03

**Success Criteria:**

1. Every primary event route has intentional loading, error, empty, and no-access behavior.
2. Overview metrics and action links are verified against source surfaces for representative events.
3. Desktop and mobile route walkthroughs confirm no duplicate shell, broken deep links, or inaccessible controls.
4. Automated tests, type checks, and Convex validation pass for the completed changes.

**Plans:** 1 plan

Plans:

- [ ] 40-01-PLAN.md — Extend canonical finance with live accommodation pricing and confirmation snapshots

---

## Active Milestone: v5.0 Accommodation Upgrades & Options

**Objective:** Turn accommodation into a reusable, configurable catalog where buyers select options and upgrades, admins configure rates and availability, payment tracking becomes a booking-reference permalink, and allocation prioritizes paid attendees — without weakening canonical finance behavior.

### Scope

- Reusable accommodation catalog (categories, room types with descriptions, options, age bands) and event-scoped configuration (rates, upgrade, cot, availability, age-band rules)
- Admin "Upgrades & Options" workspace tab with explicit confirmation that locks buyer configuration changes
- Public signup: options-only selection (category/occupancy, superior upgrade, cot, optional age band) with live pricing; ticket-driven room eligibility (SEED-002)
- `/track-payment/[bookingRef]` permalink with ownership-gated, server-priced, idempotent configuration edits and re-pricing before admin confirmation
- Accommodation option charges flow into the canonical order amount-due (live for unconfirmed, snapshotted at confirmation)
- Allocation prioritizes paid attendees (paid highlighted, unpaid grayed) with assignment confirmation setting the lock boundary
- Cross-surface verification of money integrity, edit security, and idempotency

### Out Of Scope

- Multi-night/date-range rate engine, tax/discount/coupon engine, freeform admin price overrides
- Buyer-facing room self-assignment, real-time room-level inventory holds, roommate matching marketplace
- Full waitlist workflows (exhausted inventory keeps current no-availability behavior)
- SEED-002 multi-room-type entitlement array (`roomTypeIds` schema change deferred; single `roomTypeId` alignment only)
- Inline payment capture (Tikkie-link model preserved)

## Phases

- [x] **Phase 39: Accommodation Catalog & Event Config Schema** - Additive catalog and event-config data model that every other phase reads from. (completed 2026-08-05)
- [ ] **Phase 40: Canonical Finance Derivation** - Accommodation charges flow into the single canonical amount-due loader.
- [ ] **Phase 41: Admin Upgrades & Options Tab** - Third workspace tab for rates, options, age bands, availability, and descriptions with explicit confirmation.
- [ ] **Phase 42: Public Signup Options** - Options-only selection with live pricing and ticket-driven eligibility.
- [ ] **Phase 43: Track Payment Permalink** - Booking-reference permalink with ownership-gated, server-priced configuration edits.
- [ ] **Phase 44: Allocation Paid-Priority** - Paid highlighted, unpaid grayed, assignment confirmation locks configuration.
- [ ] **Phase 45: Verification & Cross-Surface Audit** - "Looks done but isn't" checklist across money, security, and idempotency.

---

### Phase 39: Accommodation Catalog & Event Config Schema

**Goal:** The system stores a reusable accommodation catalog (categories, room types with descriptions, options, age bands) and event-scoped configuration (stay, rates, upgrade/cot pricing, availability, age-band rules) so buyers can be offered priced options and admins can configure them.

**Depends on:** Phase 38 (v4.0 foundation)

**Requirements:** CAT-01, CAT-02, CAT-03, CFG-01, CFG-02, CFG-03, CFG-04, CFG-05

**Success Criteria:**

1. The catalog holds accommodation categories (standard, superior, family) with a label and an admin-facing description for allocation, and physical room types as leaf inventory items (label, capacity, physical count, admin description) each referencing a category, with bed arrangement part of the label.
2. The catalog holds reusable accommodation options (superior upgrade, cot) and age bands (under 3, 3-11, 12-17, 18+) defined once and referenceable by any event.
3. An event configures its accommodation stay (one night before the event initially, night count configurable), which catalog items/options are active, per-category × occupancy rates per person per night in minor units, upgrade price (default €10) and cot price (default €10) with cot age eligibility (under 3), and physical availability per room type and cot count.
4. Sellable beds equal room count × capacity — one derived availability source with no separate manually-tracked availability counter; age-band pricing rules may be left empty and seeded later; breakfast is included in all room prices.
5. The change is purely additive: existing events, room types, orders, and finance contracts remain valid, and Convex codegen and development deployment pass.

**Plans:** 1/1 plans complete

Plans:

- [x] 39-01-PLAN.md — Add the additive accommodation catalog and event configuration contract

---

### Phase 40: Canonical Finance Derivation

**Goal:** Accommodation option charges are part of the canonical order amount-due so Paid, Outstanding, and Reconciliation stay correct across every consumer.

**Depends on:** Phase 39

**Requirements:** FIN-01, FIN-02, FIN-03, FIN-04

**Success Criteria:**

1. Order amount-due includes accommodation line items (room rate, upgrade, cot) derived from event config, and the identical total appears on public tracking, order ledger, payments, reconciliation, reports, and attendee detail — no consumer recomputes it.
2. Unconfirmed orders price live from current event config; at admin confirmation the amount is snapshotted with a config-version boundary so confirmed orders never retroactively re-price when an admin later edits a rate.
3. A pure domain module computes accommodation amounts and is covered by unit tests; the duplicate inline total in the signup read path is removed and no UI surface computes accommodation totals.
4. Tikkie payment links agree with the canonical amount-due after accommodation re-pricing; stale links are expired/superseded and regenerated so buyers never pay a mismatched amount.

**Plans:** TBD

---

### Phase 41: Admin Upgrades & Options Tab

**Goal:** Admins configure rates, options, age bands, availability, and room-type descriptions for an event from the Accommodation workspace, and explicitly confirm configuration to lock buyer changes.

**Depends on:** Phase 39

**Requirements:** ADM-01, ADM-02, ADM-03, CAT-04

**Success Criteria:**

1. The event Accommodation workspace provides an "Upgrades & Options" tab beside Hotels and Allocation where an admin configures per-category × occupancy rates, upgrade/cot prices and eligibility, age bands, availability counts, and room-type descriptions.
2. An admin can view and edit the reusable catalog and room-type descriptions so room allocation decisions are well informed.
3. The Hotels and Allocation tabs keep their existing behavior and money is never recomputed in the UI — every amount shown comes from canonical contracts.
4. An explicit confirm action locks buyer configuration changes, closing the buyer edit window for that order (server-enforced by later phases).
5. Saving rate/option changes communicates pending-order impact (e.g., "N pending orders will re-price") without eagerly rewriting any order data.

**Plans:** 2 plans

Plans:

- [ ] 41-01-PLAN.md — Add version-aware admin impact data and server-backed buyer configuration confirmation
- [ ] 41-02-PLAN.md — Build the responsive Upgrades & Options workspace tab and reusable catalog editor

---

### Phase 42: Public Signup Options

**Goal:** Buyers select accommodation options only (category + occupancy, superior upgrade, cot, optional age band) with live pricing, and room eligibility is driven by the ticket.

**Depends on:** Phases 40-41

**Requirements:** SIG-01, SIG-02, SIG-03, SIG-04, TKT-01, TKT-02

**Success Criteria:**

1. During signup a buyer selects accommodation options only — category with single/shared/family occupancy, superior upgrade, cot for under-3, optional age band — and never books a specific room.
2. The accommodation step and review step show per-person-per-night pricing and a live price breakdown, with breakfast included and cot eligibility gated by age band.
3. Age band is captured optionally per attendee and may be left blank; the buyer-facing slot drag-drop is replaced by option selection.
4. Submitting the order persists per-attendee accommodation selections (preferences), not room placements; final room placement remains admin-controlled.
5. Room eligibility derives from the selected ticket's allowed room category/type; the signup shows the selected ticket rather than asking for ticket type again, and invalid option/ticket combinations are rejected at submission.

**Plans:** 2 plans

Plans:

- [ ] 42-01-PLAN.md — Establish the public catalog, canonical live quote, and server-side options-only submission contract
- [ ] 42-02-PLAN.md — Replace room assignment with quote-backed per-attendee accommodation options in public signup

---

### Phase 43: Track Payment Permalink

**Goal:** A buyer opens their booking at a durable `/track-payment/[bookingRef]` permalink, sees balance, progress, and selections, and can change accommodation configuration before admin confirmation with server-side re-pricing and ownership-gated edits.

**Depends on:** Phases 40, 42

**Requirements:** TRK-01, TRK-02, TRK-03, TRK-04, TRK-05, TRK-06

**Success Criteria:**

1. A buyer opens a booking via the durable `/track-payment/[bookingRef]` permalink and sees balance, payment progress, tickets, and accommodation selections; the existing booking-reference search page remains as an entry point and old `/track-payment` deep links still work.
2. Before admin confirmation, a buyer can change accommodation configuration on the permalink; the order re-prices server-side from event config and the amount due updates immediately.
3. Permalink edits require ownership proof (booker email match or edit token), are rate-limited, idempotent (re-submitting identical changes alters nothing), and reject client-supplied amounts — all pricing is computed server-side from validated option IDs.
4. After admin confirmation, permalink edits are rejected server-side (not merely hidden in the UI) and the payment link reflects the confirmed amount.
5. When a change reduces the amount due, the excess is surfaced as an overpayment with an explicit refund-vs-donation handling path rather than a silent donation, and stale Tikkie links are expired/superseded.

**Plans:** TBD

---

### Phase 44: Allocation Paid-Priority

**Goal:** The admin Allocation view derives per-attendee paid state from canonical finance data, highlights paid attendees, grays unpaid ones, and its assignment-confirmation flow sets the boundary that locks buyer configuration changes.

**Depends on:** Phases 40-41

**Requirements:** ALL-01, ALL-02, ALL-03

**Success Criteria:**

1. The Allocation view derives a per-attendee paid state from canonical per-attendee due/paid maps (never from order status), surfacing paid/partial/unpaid distinctions.
2. Paid attendees are highlighted and ranked first in unassigned/queue ordering; unpaid attendees are grayed so admins do not assign rooms before payment completes.
3. An internal event with recorded payments correctly shows paid attendees as paid (not everyone grayed).
4. Admin assignment confirmation sets the confirmedAt boundary that locks buyer configuration changes; subsequent edit attempts are rejected server-side.

**Plans:** TBD

---

### Phase 45: Verification & Cross-Surface Audit

**Goal:** The "looks done but isn't" checklist is closed: money integrity, edit security, idempotency, immutability after confirmation, deep-link preservation, and full automated validation.

**Depends on:** Phases 39-44

**Requirements:** (none — verifies Phases 39-44)

**Success Criteria:**

1. Invoking the permalink edit mutation twice with identical arguments leaves the order total unchanged (idempotency verified by test).
2. Edit-after-confirm and ref-only-edit requests are rejected server-side; client price tampering and unknown/stale option IDs are rejected with typed errors.
3. The same order shows identical amount-due across reconciliation, revenue, order ledger, payment summary, auto-match, attendee detail, and public tracking; attendee detail outstanding equals that attendee's ticket + accommodation line items.
4. Confirmed orders do not re-price after an admin rate edit; stale Tikkie links are expired post-re-price; downward re-price after payment surfaces the overpayment decision instead of silently donating.
5. Convex codegen and development deploy, typecheck, tests, and production build pass, and human UAT confirms options-only signup, permalink re-pricing, and paid-priority allocation on representative events.

**Plans:** TBD

---

## Progress

| Phase | Goal | Requirements | Plans | Status |
| --- | --- | --- | --- | --- |
| 34 - Event Dashboard Information Architecture | Event home and navigation | UX-01, UX-02, UX-03, QUAL-04 | 3 plans | Complete |
| 35 - Actionable Event Overview | Stats-led operational home | OPS-01, OPS-02 | 2 plans | Complete |
| 36 - Finance And Accommodation Workspaces | Consolidated operational workspaces | FINUX-01, FINUX-02, ACCUX-01, ACCUX-02 | 4 plans | Complete |
| 37 - Shared Dashboard Quality | Shared states and responsive accessibility | QUAL-01, QUAL-02, QUAL-03 | 8 plans | Complete |
| 38 - UX Regression And Human Verification | Cross-route verification | OPS-03 | TBD | Not started |
| 39 - Accommodation Catalog & Event Config Schema | Reusable catalog + event config | CAT-01, CAT-02, CAT-03, CFG-01..05 | TBD | Complete    |
| 40 - Canonical Finance Derivation | Accommodation in canonical amount-due | FIN-01, FIN-02, FIN-03, FIN-04 | 1 plan | Not started |
| 41 - Admin Upgrades & Options Tab | Config surface + explicit confirm | ADM-01, ADM-02, ADM-03, CAT-04 | 2 plans | Not started |
| 42 - Public Signup Options | Options-only signup + ticket eligibility | SIG-01..04, TKT-01, TKT-02 | 2 plans | Planned |
| 43 - Track Payment Permalink | Booking-ref permalink + re-price | TRK-01..06 | TBD | Not started |
| 44 - Allocation Paid-Priority | Paid-priority allocation + lock | ALL-01, ALL-02, ALL-03 | TBD | Not started |
| 45 - Verification & Cross-Surface Audit | Money/security/idempotency audit | — | TBD | Not started |

**Totals:** v4.0: 5 phases, 14 requirements mapped, 23 known plans complete across Phases 34-37 (Phase 38 not started, carried into v5.0 verification). v5.0: 7 phases (39-45), 31 requirements mapped, plans TBD.
