# Roadmap: Conference Finance Dashboard

## Overview

This roadmap moves from secure foundation setup to reliable data ingestion, then into finance visibility, payment collection workflows, and production hardening. Each phase delivers a complete, testable capability that finance admins can use immediately. Scope is intentionally practical for first delivery while still creating a production-ready path.

## Phases

- [ ] **Phase 1: Foundation & Secure Access** - Establish protected admin access and integration configuration baseline.
- [ ] **Phase 2: Ticket Data Reliability** - Make Ticket Tailor data ingestion dependable and correct.
- [ ] **Phase 3: Finance Visibility & Reconciliation** - Deliver dashboard reporting and mismatch visibility.
- [ ] **Phase 4: Tikkie Collection Workflow** - Enable payment-link creation and payment-state tracking.
- [ ] **Phase 5: Operational Hardening** - Add health visibility and auditability for production confidence.

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
- [ ] 01-01-PLAN.md — Implement magic-link auth, protected dashboard routes, and 401 API guardrails
- [ ] 01-02-PLAN.md — Add environment-based integration validation and `/dashboard/integrations` runtime status panel

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
- [ ] 02-01-PLAN.md — Add durable Ticket Tailor storage, idempotent sync pipeline, and protected sync endpoint
- [ ] 02-02-PLAN.md — Add scoped manual re-sync API/UI flow with operator verification checkpoint

### Phase 3: Finance Visibility & Reconciliation
**Goal**: Finance admins can understand revenue performance and identify mismatches requiring follow-up.
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. Admin can view revenue totals and trends by event/date range from synced data.
  2. Admin can inspect order-level details and export filtered records to CSV.
  3. Admin can see a reconciliation list of outstanding balances and mismatched order/payment states.
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Build protected revenue metrics API/domain aggregation and dashboard filter/trend surface
- [ ] 03-02-PLAN.md — Build protected order drilldown + CSV export + reconciliation APIs and dashboard pages

### Phase 4: Tikkie Collection Workflow
**Goal**: Finance admins can generate and track Tikkie payment links directly from reconciliation needs.
**Depends on**: Phase 3
**Requirements**: TK-01, TK-02, TK-03
**Success Criteria** (what must be TRUE):
  1. Admin can generate a Tikkie payment link for an outstanding balance from dashboard context.
  2. Generated links store metadata and show status transitions (created/paid/expired) in the app.
  3. Admin can copy/share payment links and confirm up-to-date payment status.
**Plans**: TBD

Plans:
- [ ] 04-01: Implement Tikkie link generation flow
- [ ] 04-02: Add payment-status sync (webhook + fallback polling)

### Phase 5: Operational Hardening
**Goal**: The production deployment is observable and finance actions are traceable for day-to-day operations.
**Depends on**: Phase 4
**Requirements**: OPS-01, OPS-02
**Success Criteria** (what must be TRUE):
  1. Admin can view integration health including last successful sync, last failure, and actionable errors.
  2. Manual syncs, payment-link generation, and payment status changes are recorded with actor + timestamp.
  3. On-call admin can diagnose integration failure context without database access.
**Plans**: TBD

Plans:
- [ ] 05-01: Build integration health surfaces and alerts
- [ ] 05-02: Implement audit trail and operator diagnostics

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Secure Access | 0/2 | Not started | - |
| 2. Ticket Data Reliability | 0/2 | Not started | - |
| 3. Finance Visibility & Reconciliation | 0/2 | Not started | - |
| 4. Tikkie Collection Workflow | 0/2 | Not started | - |
| 5. Operational Hardening | 0/2 | Not started | - |
