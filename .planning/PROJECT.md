# Project: Conference Finance Dashboard

## What This Is

Conference Finance Dashboard is the church's internal system for conference orders, payments, reconciliation, attendee tracking, room assignment, and signup operations. It already supports both integration-backed event flows and internal signup flows; the next step is making the internal order and payable model reliable enough to drive finance and operations without depending on provider-specific runtime tables.

## Core Value

Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## Current Milestone: v3.0 Canonical Orders Foundation

**Goal:** Make internal order, attendee, payable, and payment-reconciliation tables trustworthy enough to become the sole runtime source for finance and operational queries.

**Target features:**

- Remove runtime dependence on `ticketTailor*` query paths for orders, attendees, finance, and accommodation reads
- Define one canonical order-cost and attendee-payable model from internal tables
- Normalize the internal order/payment schema toward 3NF for reliable reporting and reconciliation
- Treat Ticket Tailor as a secondary ingest and mapping boundary to redesign after the internal foundation is solid

## Requirements

### Validated

- ✓ Finance admins can use protected dashboard flows for revenue, reconciliation, order drilldown, payment tracking, attendee detail, and room assignment — v1.0 / phases 13-17
- ✓ Public signup flows can create internal canonical order records with attendees, ticket selections, and room assignments — phases 18-24
- ✓ Ticket Tailor and Tikkie integrations can sync data into Convex and support current operator workflows — v1.0 / phases 14-17, 24

### Active

- [ ] Internal tables become the only runtime source for order, attendee, and finance queries
- [ ] Order totals, balances, and attendee payables are derived from canonical internal data with deterministic formulas
- [ ] Order/payment schema is normalized enough to support reliable reconciliation and future provider integrations without core-table leakage
- [ ] Ticket Tailor runtime query dependencies are deprecated in favor of raw-ingest and mapping boundaries

### Out of Scope

- Full Ticket Tailor table redesign in the same milestone — first stabilize the internal domain and runtime reads
- New public signup UX features unrelated to finance/order correctness — milestone focus is internal data integrity
- Multi-tenant church/org support — project remains single-org scoped

## Context

- Existing codebase state: Next.js 16 + React 19 + Convex + Clerk + shadcn/ui, with finance dashboard, public signup, Ticket Tailor sync, Tikkie payment flows, and accommodation operations already live
- Recent schema/runtime audit found mixed use of canonical `orders*` tables and legacy `ticketTailor*` tables in active query paths, especially around attendee reads, order visibility, accommodation data, and finance reporting
- Current reporting risk areas include inconsistent order amount derivation, mixed `payment.orderId` semantics, null-to-zero masking, and lack of one canonical attendee-payable model
- There is no distinct `bookings` table today; a booking is represented by an `orders` row plus related attendee, ticket-selection, assignment, and payment records

## Constraints

- **Tech stack**: Next.js 16 + React 19 + Convex + Clerk + shadcn/ui — preserve established runtime architecture
- **Operational continuity**: Existing dashboard, signup, Ticket Tailor, and Tikkie behavior must keep working while the internal model is stabilized
- **Data correctness**: Prioritize finance correctness and deterministic payable logic over new feature breadth
- **Migration safety**: Brownfield changes must tolerate a dirty worktree and existing production-shaped data without destructive resets

## Key Decisions

| Decision                                                                                                     | Rationale                                                          | Outcome   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------- |
| Keep Clerk as the only auth runtime for dashboard and API boundaries                                         | Auth model is already stabilized and verified                      | ✓ Good    |
| Keep typed Convex contract boundaries as the canonical backend access path                                   | Protects route/query consistency during schema changes             | ✓ Good    |
| Internal canonical tables must become the runtime source of truth before redesigning Ticket Tailor tables    | Current mixed core/provider reads are causing finance ambiguity    | — Pending |
| Deprecate runtime querying of `ticketTailor*` tables and move provider data behind ingest/mapping boundaries | Separates core business facts from provider-specific payload/state | — Pending |
| Define order totals and attendee payable from one canonical internal model                                   | Finance reporting needs deterministic, auditable formulas          | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-01 after starting milestone v3.0 Canonical Orders Foundation_
