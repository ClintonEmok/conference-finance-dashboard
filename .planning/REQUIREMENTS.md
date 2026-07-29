# Requirements: Conference Finance Dashboard

**Defined:** 2026-07-29
**Core Value:** Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## v4.0 Requirements

### Event Information Architecture

- [ ] **UX-01**: An authenticated admin can open an event Overview that is the default event-scoped home.
- [ ] **UX-02**: The event shell presents one concise, consistently ordered navigation structure for Overview, Attendees, Tickets, Finance, Accommodation, and Settings.
- [ ] **UX-03**: Event context, selected event state, active section, and primary event actions remain clear at every event-scoped route.

### Overview And Operations

- [ ] **OPS-01**: The Overview displays bounded event statistics for attendance, ticket/order activity, collected or outstanding money, and accommodation status using existing canonical data contracts.
- [ ] **OPS-02**: The Overview surfaces actionable exceptions or next steps and links directly to the relevant operational surface.
- [ ] **OPS-03**: Overview cards and action lists have intentional loading, error, empty, and no-access states.

### Finance And Accommodation Workspaces

- [ ] **FINUX-01**: Finance provides one coherent event workspace with accessible navigation between Orders, Payments, Donations, and Reconciliation.
- [ ] **FINUX-02**: Existing finance workflows preserve their event scope, canonical money semantics, and useful deep links after consolidation.
- [ ] **ACCUX-01**: Accommodation provides one coherent event workspace with accessible navigation between Hotels and Allocation.
- [ ] **ACCUX-02**: Existing accommodation workflows preserve assignment/filter behavior and useful deep links after consolidation.

### Shared Quality And Responsiveness

- [ ] **QUAL-01**: Shared dashboard query-state patterns consistently represent loading, error, empty, and populated states without page-specific ad hoc variations.
- [ ] **QUAL-02**: Primary event workflows remain usable on mobile and desktop without horizontal overflow or inaccessible hidden actions.
- [ ] **QUAL-03**: Navigation, tabs, tables, status indicators, and action controls meet keyboard and semantic accessibility expectations.
- [ ] **QUAL-04**: Settings contains event-level sharing/configuration actions without adding noisy items to primary operational navigation.

## Future Requirements

- Cross-event analytics and portfolio dashboards.
- New public signup capabilities.
- Full Ticket Tailor schema/provider redesign.
- Advanced commerce features such as coupons and new refund workflows.

## Out Of Scope

| Feature | Reason |
| --- | --- |
| New backend finance formulas or provider migration | v4.0 consumes the canonical contracts established by the prior milestone. |
| Multi-tenant organization support | The project remains single-org scoped. |
| Public attendee-facing UX redesign | This milestone is for the protected event dashboard. |
| Cross-event reporting product | Would require a separate information architecture and authorization model. |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| UX-01 | 34 | Pending |
| UX-02 | 34 | Pending |
| UX-03 | 34 | Pending |
| OPS-01 | 35 | Pending |
| OPS-02 | 35 | Pending |
| OPS-03 | 38 | Pending |
| FINUX-01 | 36 | Pending |
| FINUX-02 | 36 | Pending |
| ACCUX-01 | 36 | Pending |
| ACCUX-02 | 36 | Pending |
| QUAL-01 | 37 | Pending |
| QUAL-02 | 37 | Pending |
| QUAL-03 | 37 | Pending |
| QUAL-04 | 34 | Pending |

**Coverage:** 14 requirements, all mapped to a phase.

---

_Requirements defined: 2026-07-29 for milestone v4.0_
