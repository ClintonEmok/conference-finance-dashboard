# Roadmap: Conference Finance Dashboard

## Overview

This roadmap now prioritizes getting the operator-facing screens, navigation, attendee data, and accommodation workflow correct before investing further in payment-link automation and production hardening. The current MVP path focuses on trusted Ticket Tailor data, clear finance views, actual attendee visibility, and room allocation flow. Tikkie automation and operational hardening remain valuable, but are explicitly deferred until the core UX and workflow are settled.

All MVP-path phases are now complete. Future work should route through the deferred post-MVP tracks rather than reopening the finished command-center flow.

## Phases

- [x] **Phase 1: Foundation & Secure Access** - Establish protected admin access and integration configuration baseline.
- [x] **Phase 2: Ticket Data Reliability** - Make Ticket Tailor data ingestion dependable and correct.
- [x] **Phase 3: Finance Visibility & Outstanding Balances** - Deliver dashboard reporting, ledger visibility, and balance follow-up surfaces.
- [x] **Phase 4: Attendee Data & Accommodation Foundations** - Sync issued ticket attendees and define hotel/room inventory foundations.
- [x] **Phase 5: Room Allocation & Operator Flow Polish** - Finalize attendee detail, room assignment, and cross-screen workflow clarity.

## Phase Details

### Phase 1: Foundation & Secure Access

**Goal**: Finance admins can securely enter the dashboard and configure external integrations safely.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, SEC-01
**Success Criteria** (what must be TRUE):

1. Finance admin can sign in and reach protected dashboard routes.
2. Non-admin access attempts are blocked from dashboard pages and integration actions.
3. Ticket Tailor and Tikkie credentials can be configured via environment settings and validated at runtime.
   **Plans**: 2 plans

Plans:

- [x] 01-01-PLAN.md — Implement magic-link auth, protected dashboard routes, and 401 API guardrails
- [x] 01-02-PLAN.md — Add environment-based integration validation and `/dashboard/integrations` runtime status panel

### Phase 2: Ticket Data Reliability

**Goal**: Ticket Tailor event and order data is synced accurately enough to trust as reporting input.
**Depends on**: Phase 1
**Requirements**: TT-01, TT-02, TT-03
**Success Criteria** (what must be TRUE):

1. Admin can run sync and see Ticket Tailor events/orders imported successfully.
2. Admin can trigger manual re-sync for selected event/date range to correct stale data.
3. Synced records show consistent normalized statuses (paid/refunded/cancelled/pending) used by downstream views.
   **Plans**: 2 plans

Plans:

- [x] 02-01-PLAN.md — Add durable Ticket Tailor storage, idempotent sync pipeline, and protected sync endpoint
- [x] 02-02-PLAN.md — Add scoped manual re-sync API/UI flow with operator verification checkpoint

### Phase 3: Finance Visibility & Outstanding Balances

**Goal**: Finance admins can understand revenue performance and identify unpaid or mismatched balances requiring follow-up.
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):

1. Admin can view revenue totals and trends by event/date range from synced data.
2. Admin can inspect order-level details and export filtered records to CSV.
3. Admin can see an outstanding balances list of unpaid/partial/mismatched order states.
   **Plans**: 2 plans

Plans:

- [x] 03-01-PLAN.md — Build protected revenue metrics API/domain aggregation and dashboard filter/trend surface
- [x] 03-02-PLAN.md — Build protected order drilldown + CSV export + outstanding balance APIs and dashboard pages

### Phase 4: Attendee Data & Accommodation Foundations

**Goal**: Finance admins can see the real attendees behind each order and set up the hotel/room inventory needed for accommodation operations.
**Depends on**: Phase 3
**Requirements**: TT-04, DASH-04, ACC-01
**Success Criteria** (what must be TRUE):

1. Ticket Tailor sync stores issued ticket / attendee-level records per order, not only buyer-level data.
2. Admin can open an attendee detail view with payment summary, installment progress, outstanding balance, and assigned room placeholder/state.
3. Admin can define hotels, room types, and room capacity in the dashboard.
   **Plans**: 2 plans

Plans:

- [x] 04-01-PLAN.md — Persist attendee-level Ticket Tailor sync and add attendee ledger dashboard surface
- [x] 04-02-PLAN.md — Add attendee detail plus accommodation inventory management flows

### Phase 5: Room Allocation & Operator Flow Polish

**Goal**: Finance admins can move cleanly between dashboard, ledger, attendee detail, and room assignment while resolving capacity and payment follow-up issues.
**Depends on**: Phase 4
**Requirements**: ACC-02, ACC-03, FLOW-01
**Success Criteria** (what must be TRUE):

1. Admin can assign and unassign attendees to rooms with clear capacity feedback.
2. Admin can filter for room type, availability, full rooms, empty rooms, and unassigned attendees.
3. Navigation between dashboard, ledger, attendee detail, and room allocation feels coherent and MVP-ready.
   **Plans**: 2 plans

Plans:

- [x] 05-01-PLAN.md — Build room allocation manager with protected assign/unassign flows and live attendee room state
- [x] 05-02-PLAN.md — Polish navigation, outstanding-balance naming, and cross-screen handoffs across overview, attendee, and room workflows

## Deferred After MVP

- **Deferred A: Tikkie Collection Workflow** - Park payment-link generation and status automation until the core screen flow is settled.
- **Deferred B: Operational Hardening** - Park health surfaces, audit logging, and on-call diagnostics until post-MVP stabilization.

Deferred work already started in `.planning/deferred-phases/04-tikkie-collection-workflow/` remains useful reference material, but it is no longer on the critical MVP path.

## Progress

| Phase                                               | Plans Complete | Status   | Completed  |
| --------------------------------------------------- | -------------- | -------- | ---------- |
| 1. Foundation & Secure Access                       | 2/2            | Complete | 2026-03-18 |
| 2. Ticket Data Reliability                          | 2/2            | Complete | 2026-03-19 |
| 3. Finance Visibility & Outstanding Balances        | 2/2            | Complete | 2026-03-19 |
| 4. Attendee Data & Accommodation Foundations        | 2/2            | Complete | 2026-03-19 |
| 5. Room Allocation & Operator Flow Polish           | 2/2            | Complete | 2026-03-19 |
| 6. Tikkie Integration                               | 3/3            | Complete | 2026-03-21 |
| 7. Complete Tikkie Integration                      | 2/2            | Complete | 2026-03-21 |
| 8. Attendee Follow-up & Reconciliation UX           | 0/1            | Planned  | -          |
| 9. Smart Allocation & Attendee Signals              | 0/2            | Planned  | -          |
| 10. Payment Reconciliation                          | 0/1            | Complete | 2026-03-25 |
| 11. Use Supabase                                    | 0/1            | Complete | 2026-03-25 |
| 12. use clerk as only auth remove stale better auth | 4/4            | Complete | 2026-03-26 |

### Phase 6: Tikkie Integration

**Goal:** Finance admins can generate, share, and trust Tikkie payment links from outstanding balances and attendee detail without leaving the existing operator workflow.
**Depends on:** Phase 5
**Requirements**: TK-01, TK-02, TK-03, TK-04
**Success Criteria** (what must be TRUE):

1. Admin can open a lightweight confirmation modal from outstanding balances or attendee detail, adjust amount/expiry/reference details, and create a Tikkie link.
2. Latest Tikkie link status is shown first with last-checked recency and a subtle stale indicator in the existing finance follow-up surfaces.
3. Admin can copy/open the latest link, inspect prior history, and recover status freshness through webhook or manual refresh/job fallback.
   **Plans:** 3 plans
   **Status:** 3/3 plans complete

Plans:

- [x] 06-01-PLAN.md — Harden Tikkie backend contracts, status trust, and attendee-detail link projection
- [x] 06-02-PLAN.md — Add latest-first Tikkie modal and follow-up actions to outstanding balances and attendee detail
- [x] 06-03-PLAN.md — Add reusable ticket-type Tikkie payment templates

### Phase 7: Complete Tikkie Integration (Payment Retrieval + Subscription Setup)

**Goal:** Finance admins can refresh provider-trusted payment status directly from `GET /paymentrequests/{paymentRequestToken}` and the system is ready for subscription-driven updates via `/paymentrequestssubscription` (not enabled in production yet).
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 2/2 plans complete
**Status:** 2/2 plans complete

Plans:

- [x] 07-01-PLAN.md — Make Tikkie refresh provider-authoritative via GET payment request
- [x] 07-02-PLAN.md — Add guarded subscription setup path for payment request notifications

### Phase 8: Attendee Follow-up & Reconciliation UX

**Goal:** Improve reconciliation and attendees UX with five targeted fixes: simplify reconciliation page layout, fix attendee follow-up flow to navigate directly to attendee detail, add attendee breakdown per order, fix attendees route amount display, and add background auto-sync.
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05
**Depends on:** Phase 7
**Plans:** 2 plans

Plans:

- [ ] 08-01-PLAN.md — Fix attendee follow-up navigation, attendee amount display, and order attendee breakdown
- [ ] 08-02-PLAN.md — Add TanStack Query background refetch and sync status indicator

### Phase 9: Smart Allocation & Attendee Signals

**Goal:** Finance admins can use attendee-derived accommodation signals to filter, prioritize, and auto-allocate rooms with family and gender-aware guardrails.
**Requirements**: TT-05, ACC-04, ACC-05, ACC-06
**Depends on:** Phase 6
**Plans:** 2 plans

Plans:

### Phase 10: Payment Reconciliation (Tikkie Open, Bank Transfers, Cash)

**Goal:** Add unified payment reconciliation for Tikkie open payments, bank transfers, and cash entries with automatic matching by payer name to buyer name and manual assignment for unresolved payments.
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 5/5 plans complete
**Status:** 3/5 planned (gap closure: 10-04, 10-05)

Plans:

- [x] 10-01-PLAN.md — Payment model + Tikkie Open sync + auto-match logic
- [x] 10-02-PLAN.md — Manual bank/cash entry + assignment API + UI
- [x] 10-03-PLAN.md — Reconciliation dashboard with summary and payment list
- [ ] 10-04-PLAN.md — Gap closure: Tikkie payment storage + auto-matching logic
- [ ] 10-05-PLAN.md — Gap closure: Order-level payment status (partial/paid/overpaid)

### Phase 11: Use Better Convex

**Goal:** Migrate backend from SQLite/Prisma to Better Convex (Better Auth + Convex ORM) - keeping Better Auth and swapping only the DB layer.
**Depends on:** Phase 10
**Plans:** 5/5 plans complete

Plans:

- [ ] 11-01-PLAN.md — Setup: install packages, configure folder structure, initialize dev server
- [ ] 11-02-PLAN.md — Schema: convert Prisma schema to Better Convex schema
- [ ] 11-03-PLAN.md — Functions: create Convex functions for data operations
- [ ] 11-04-PLAN.md — Domain: update domain layer to use Convex
- [ ] 11-05-PLAN.md — API + Verify: update API routes, verify end-to-end, deploy

## Backlog

### Phase 999.1: Complete UI/UX Redesign (BACKLOG)

**Goal:** Complete redesign of all pages from the ground up.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 12: use clerk as only auth remove stale better auth

**Goal:** Dashboard pages and protected app routes use Clerk as the only auth system, Better Auth runtime artifacts are removed, and Convex receives Clerk identity tokens.
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 4/4 plans complete

Plans:

- [x] 12-01-PLAN.md — Create Clerk server auth helpers and wire Convex to authenticated Clerk sessions
- [x] 12-02-PLAN.md — Protect dashboard routes with Clerk and replace the old login/logout flow
- [x] 12-03-PLAN.md — Migrate protected API route guards and auth-sensitive tests from Better Auth to Clerk
- [x] 12-04-PLAN.md — Remove stale Better Auth runtime files/packages and run final Clerk auth verification

### Phase 13: rebuild convex mutation and api layer from clean contracts

**Goal:** Convex reads and writes run through one canonical typed contract layer, so dashboard routes and integrations no longer depend on nested generated imports, raw string-path dispatch, or oversized public Convex modules.
**Requirements**: TBD
**Depends on:** Phase 12
**Plans:** 5/5 plans executed

Plans:

- [x] 13-01-PLAN.md — Canonicalize the Convex app tree and build the typed Clerk-aware server bridge foundation
- [x] 13-02-PLAN.md — Rebuild orders, reporting, and reconciliation read contracts on bounded typed Convex APIs
- [x] 13-03-PLAN.md — Rebuild attendee and accommodation contracts on focused public/internal Convex surfaces
- [x] 13-04-PLAN.md — Rebuild payments and Tikkie mutation/API contracts on typed Convex refs
- [x] 13-05-PLAN.md — Clean up sync/webhook contracts, remove legacy dispatch wrappers, and run full regression
