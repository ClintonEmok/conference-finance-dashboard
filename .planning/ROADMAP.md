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

| Phase                                        | Plans Complete | Status   | Completed  |
| -------------------------------------------- | -------------- | -------- | ---------- |
| 1. Foundation & Secure Access                | 2/2            | Complete | 2026-03-18 |
| 2. Ticket Data Reliability                   | 2/2            | Complete | 2026-03-19 |
| 3. Finance Visibility & Outstanding Balances | 2/2            | Complete | 2026-03-19 |
| 4. Attendee Data & Accommodation Foundations | 2/2            | Complete | 2026-03-19 |
| 5. Room Allocation & Operator Flow Polish    | 2/2            | Complete | 2026-03-19 |
| 6. Tikkie Integration                        | 3/3            | Complete | 2026-03-21 |
| 7. Complete Tikkie Integration               | 2/2            | Complete | 2026-03-21 |
| 8. Smart Allocation & Attendee Signals       | 0/2            | Planned  | -          |

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
**Plans:** 2 plans
**Status:** 2/2 plans complete

Plans:

- [x] 07-01-PLAN.md — Make Tikkie refresh provider-authoritative via GET payment request
- [x] 07-02-PLAN.md — Add guarded subscription setup path for payment request notifications

### Phase 8: Smart Allocation & Attendee Signals

**Goal:** Finance admins can use attendee-derived accommodation signals to filter, prioritize, and auto-allocate rooms with family and gender-aware guardrails.
**Requirements**: TT-05, ACC-04, ACC-05, ACC-06
**Depends on:** Phase 6
**Plans:** 2 plans

Plans:

- [ ] 08-01-PLAN.md — Normalize attendee accommodation signals and same-order family grouping foundations
- [ ] 08-02-PLAN.md — Apply attendee signals to allocation filters and smart room proposals
