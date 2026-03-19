# Requirements: Conference Finance Dashboard

## v1 Requirements

### Foundation & Access

- **FOUND-01**: Finance admin can sign in and access the dashboard in a protected session.
- **FOUND-02**: Admin can configure integration credentials via environment settings without code changes.
- **SEC-01**: Non-admin users cannot access finance dashboard routes or integration actions.

### Ticket Tailor Integration

- **TT-01**: Admin can sync Ticket Tailor events and related orders into the dashboard data store.
- **TT-02**: Admin can run manual re-sync for a selected event/date range to correct missing or stale data.
- **TT-03**: Synced ticket/order statuses are normalized (paid/refunded/cancelled/pending) for consistent reporting.
- **TT-04**: System syncs issued ticket / attendee records for each Ticket Tailor order so actual attendees are visible, not only the buyer.

### Dashboard & Finance Views

- **DASH-01**: Admin can view revenue totals and trends by event and date range.
- **DASH-02**: Admin can drill into order-level records and export filtered results to CSV.
- **DASH-03**: Admin can view an outstanding balances list showing unpaid, partial, or mismatched order states.
- **DASH-04**: Admin can open an attendee detail view showing payment history, installment progress, outstanding balance, and room assignment status.

### Accommodation Management

- **ACC-01**: Admin can define hotels, room types, and room capacity.
- **ACC-02**: Admin can assign and unassign attendees to rooms.
- **ACC-03**: Admin can identify full rooms, empty rooms, and unassigned attendees through clear UI indicators and filters.

### Workflow Clarity

- **FLOW-01**: Admin can move quickly between dashboard, ledger, attendee detail, and room allocation without confusing labels or dead-end flows.

### Deferred After MVP

- **TK-01**: Admin can generate a Tikkie payment link for an outstanding balance from the dashboard.
- **TK-02**: System stores payment-link metadata and updates status (created/paid/expired) via webhook or polling.
- **TK-03**: Admin can copy/share the generated payment link and see current payment status.
- **OPS-01**: Admin can view integration health (last successful sync, last failure, and actionable error message).
- **OPS-02**: Finance actions (manual sync, link generation, status update) are audit logged with actor and timestamp.

## Constraints (v1)

- Keep workflows optimized for one church operations team (single org scope)
- Use Ticket Tailor as the initial system of record for attendee and order ingestion
- Prioritize correctness and traceability over automation breadth
- No dependency on back-office spreadsheets for core dashboard flow
- Defer payment-link automation and production hardening until the operator flow is stable

## Risks & Mitigations

### Ticket Tailor
- **Risk:** Partial sync due to API/pagination edge cases  
  **Mitigation:** Incremental sync cursor + manual backfill controls (TT-02, OPS-01)
- **Risk:** Status mismatches distort finance totals  
  **Mitigation:** Central normalization rules with explicit mapping tests (TT-03)

### Attendee & Accommodation
- **Risk:** Buyer-level order data hides the actual attendees who need accommodation  
  **Mitigation:** Import issued ticket records and model attendee-centric views (TT-04, DASH-04)
- **Risk:** Room allocation flow becomes confusing before inventory structure is defined  
  **Mitigation:** Create hotels/rooms first, then add assignment workflow and occupancy indicators (ACC-01, ACC-02, ACC-03)

### Deferred Integrations
- **Risk:** Payment-link automation distracts from validating the core operator workflow  
  **Mitigation:** Defer TK-* requirements until post-MVP

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| SEC-01 | Phase 1 | Complete |
| TT-01 | Phase 2 | Complete |
| TT-02 | Phase 2 | Complete |
| TT-03 | Phase 2 | Complete |
| TT-04 | Phase 4 | Pending |
| DASH-01 | Phase 3 | Complete |
| DASH-02 | Phase 3 | Complete |
| DASH-03 | Phase 3 | Complete |
| DASH-04 | Phase 4 | Pending |
| ACC-01 | Phase 4 | Pending |
| ACC-02 | Phase 5 | Pending |
| ACC-03 | Phase 5 | Pending |
| FLOW-01 | Phase 5 | Pending |
| TK-01 | Deferred | Deferred |
| TK-02 | Deferred | Deferred |
| TK-03 | Deferred | Deferred |
| OPS-01 | Deferred | Deferred |
| OPS-02 | Deferred | Deferred |
