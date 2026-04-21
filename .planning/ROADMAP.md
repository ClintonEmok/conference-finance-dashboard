# Roadmap: Conference Finance Dashboard

## Overview

v3.0 focuses on making canonical internal order, attendee, payable, and payment data trustworthy enough to drive finance and operations without runtime dependence on `ticketTailor*` tables. The milestone stays brownfield and internal-first: stabilize runtime truth, make the dashboard event-scoped, define deterministic money rules, migrate safely, then remove legacy fallbacks without attempting a full Ticket Tailor redesign.

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27 (archive: `.planning/milestones/v1.0-ROADMAP.md`, requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`, audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`)
- ✅ **v2.0 Attendee Signup + Accommodation Self-Assignment** — groundwork delivered in phases 18-25
- 🚧 **v3.0 Canonical Orders Foundation** — planned 2026-04-01

## Active Milestone: v3.0 Canonical Orders Foundation

**Objective:** Make internal order, attendee, payable, and payment-reconciliation tables the sole runtime source for finance and operational queries, while making the admin dashboard event-scoped before any provider-model redesign.

### Scope

- Canonical internal runtime truth for finance and ops reads
- Event-scoped admin dashboard entry and shell
- Deterministic order totals, attendee payables, and payment allocations
- Brownfield-safe widen/backfill/dual-write/parity/cutover workflow
- Runtime deprecation of `ticketTailor*` query dependencies
- Explicit provider ingest and mapping boundary for Ticket Tailor

### Out of Scope

- Full Ticket Tailor table redesign
- New public signup UX features unrelated to order/finance correctness
- Multi-tenant support

## Phases

- [ ] **Phase 26: Canonical Runtime Contract** - Normalize runtime identity and isolate provider data behind ingest/mapping boundaries.
- [ ] **Phase 27: Event-Scoped Dashboard** - Make the admin entry point event-first with a chooser for existing or new events.
- [ ] **Phase 28: Deterministic Money Model** - Define canonical totals, attendee payables, and payment allocation truth.
- [ ] **Phase 29: Safe Migration and Parity** - Backfill and dual-write canonical finance data with production-safe parity checks.
- [ ] **Phase 30: Canonical Runtime Read Cutover** - Move finance and operational reads onto canonical internal tables with reconciliation reason codes.
- [ ] **Phase 31: Legacy Path Removal** - Remove validated fallbacks and leave Ticket Tailor as ingest/mapping only.

---

### Phase 26: Canonical Runtime Contract

**Goal:** New and updated runtime joins use one internal order identity contract, while provider data is accessed through explicit ingest/mapping boundaries instead of direct runtime truth.

**Depends on:** Phase 25

**Requirements:** RTM-02

**Success Criteria:**

1. New and updated order-payment joins resolve through one canonical internal `orders` identifier contract.
2. Runtime write paths no longer need mixed internal/provider order identifiers to link payments, orders, and attendees.
3. Verifiable runtime contracts exist for where provider data is allowed, so later cutover work can remove direct `ticketTailor*` dependencies safely.

**Plans:** 3/3

---

### Phase 27: Event-Scoped Dashboard

**Goal:** After login, admins land on an event chooser and the rest of the dashboard is scoped to the selected event.

**Depends on:** Phase 26

**Requirements:** TBD

**Success Criteria:**

1. Authenticated admins see a focused event chooser instead of a broad global dashboard landing page.
2. Existing events are easy to open and creating a new event is a first-class action.
3. The selected event is reflected in the URL so dashboard navigation and reloads stay scoped.
4. The global shell is limited to event switching and top-level navigation, not day-to-day event work.

**Plans:** 2/2

Plans:
- [ ] 27-01-PLAN.md — Make /dashboard land on the event chooser
- [ ] 27-02-PLAN.md — Add the event-first shell and switcher

---

### Phase 28: Deterministic Money Model

**Goal:** Canonical internal facts produce one deterministic answer for order totals, attendee payables, and payment allocation state.

**Depends on:** Phase 27

**Requirements:** FIN-01, FIN-02, FIN-03

**Success Criteria:**

1. The same order returns one canonical total in minor units across ledger, detail, reconciliation, and export contexts.
2. Each attendee shows a canonical payable amount derived from internal order facts rather than equal-split heuristics.
3. Partial, split, and overpayments can be recorded as explicit allocations to orders and, when needed, attendees.
4. Payment allocation records are auditable enough to explain how collected money was applied.

**Plans:** TBD

---

### Phase 29: Safe Migration and Parity

**Goal:** Canonical finance data can be introduced safely into existing production-shaped records and proven against legacy outputs before cutover.

**Depends on:** Phase 28

**Requirements:** MIG-01, MIG-02

**Success Criteria:**

1. Canonical finance fields can be widened and backfilled against existing data without destructive resets.
2. Live write paths can dual-write legacy and canonical facts while current dashboard and sync behavior stays operational.
3. Operators or developers can compare canonical outputs against legacy outputs with explicit parity checks before final cutover.

**Plans:** TBD

---

### Phase 30: Canonical Runtime Read Cutover

**Goal:** Finance and operations reads use canonical internal tables as runtime truth, with reconciliation logic derived from canonical totals, payables, and allocations.

**Depends on:** Phase 29

**Requirements:** RTM-01, FIN-04

**Success Criteria:**

1. Finance and operations reads return order, attendee, and balance data from canonical internal tables without requiring runtime `ticketTailor*` queries.
2. Reconciliation surfaces show reason codes derived from canonical totals, attendee payables, and payment allocations.
3. Operators can trace an order's balance from canonical total through payable and allocation facts without relying on provider runtime truth.

**Plans:** TBD

---

### Phase 31: Legacy Path Removal

**Goal:** Remove validated legacy compatibility paths and leave Ticket Tailor as a secondary ingest/mapping boundary rather than runtime finance truth.

**Depends on:** Phase 30

**Requirements:** RTM-03, MIG-03

**Success Criteria:**

1. Runtime provider fallbacks and other legacy compatibility paths can be removed after canonical parity is validated.
2. Ticket Tailor data remains available for ingest, raw diagnostics, and mapping, but no longer acts as runtime finance truth.
3. Canonical runtime behavior remains stable after legacy path removal, without requiring a full Ticket Tailor redesign in this milestone.

**Plans:** TBD

---

## Progress

| Phase                               | Goal                                             | Requirements           | Plans | Status      |
| ----------------------------------- | ------------------------------------------------ | ---------------------- | ----- | ----------- |
| 26 - Canonical Runtime Contract     | Normalize runtime identity and provider boundary | RTM-02                 | 3/3   | Complete    |
| 27 - Event-Scoped Dashboard         | Event-first dashboard entry and scoping          | TBD                    | 2/2   | Planned     |
| 28 - Deterministic Money Model      | Deterministic totals, payables, and allocations  | FIN-01, FIN-02, FIN-03 | TBD   | Not started |
| 29 - Safe Migration and Parity      | Brownfield-safe backfill, dual-write, and parity | MIG-01, MIG-02         | TBD   | Not started |
| 30 - Canonical Runtime Read Cutover | Canonical finance and ops runtime reads          | RTM-01, FIN-04         | TBD   | Not started |
| 31 - Legacy Path Removal            | Remove fallbacks after canonical validation      | RTM-03, MIG-03         | TBD   | Not started |

**Totals:** 6 phases, 10 requirements mapped, phase numbering continues from Phase 25.
