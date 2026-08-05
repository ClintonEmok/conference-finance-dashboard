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

## v5.0 Requirements

### Reusable Accommodation Catalog

- [ ] **CAT-01**: The system provides a reusable catalog of accommodation categories (standard, superior, family) with a label and admin-facing description for allocation.
- [ ] **CAT-02**: The system stores physical room types as leaf inventory items (label, capacity, physical count, admin description) where bed arrangement is part of the label, and each room type references a category.
- [ ] **CAT-03**: The system provides reusable accommodation options (superior upgrade, cot) and age bands (under 3, 3-11, 12-17, 18+) that can be configured per event.
- [ ] **CAT-04**: An admin can view and edit the reusable catalog and room-type descriptions so room allocation decisions are well informed.

### Event-Scoped Configuration

- [ ] **CFG-01**: An event configures its accommodation stay (one night before the event initially, night count configurable) and which catalog items/options are active.
- [ ] **CFG-02**: An event configures per-category × occupancy rates charged per person per night (single, shared, family) using minor-unit prices.
- [ ] **CFG-03**: An event configures the standard-to-superior upgrade price (default €10 per person per night), cot price (default €10 per night), and cot age eligibility (under 3).
- [ ] **CFG-04**: An event configures physical availability per room type and cot count; sellable beds equal room count × capacity.
- [ ] **CFG-05**: An event configures age-band pricing rules that may be left empty and seeded later; breakfast is included in all room prices.

### Admin Upgrades & Options Tab

- [ ] **ADM-01**: The event Accommodation workspace provides an "Upgrades & Options" tab where an admin configures rates, upgrade/cot options, age bands, availability counts, and room-type descriptions.
- [ ] **ADM-02**: The admin tab preserves the existing Hotels and Allocation tabs and never recomputes money in the UI.
- [ ] **ADM-03**: An admin can explicitly confirm accommodation configuration/assignment, which locks buyer configuration changes.

### Public Signup Options

- [ ] **SIG-01**: During signup a buyer selects accommodation options only (category + single/shared/family occupancy, superior upgrade, cot for under-3, optional age band); the buyer never books a specific room.
- [ ] **SIG-02**: Signup shows per-person-per-night pricing and a live price breakdown in the review step, with breakfast included and cot eligibility by age band.
- [ ] **SIG-03**: Age band is captured optionally per attendee and may be left blank.
- [ ] **SIG-04**: The public signup accommodation step replaces the buyer-facing slot drag-drop with option selection; final room placement remains admin-controlled.

### Track Payment Permalink

- [ ] **TRK-01**: A buyer can open a booking via a durable permalink `/track-payment/[bookingRef]` that shows balance, progress, tickets, and accommodation selections.
- [ ] **TRK-02**: Before admin confirmation, a buyer can change accommodation configuration on the permalink; the change re-prices the order and updates the amount due.
- [ ] **TRK-03**: Permalink edits are authorized by a buyer ownership gate (booker email / edit token), idempotent, rate-limited, and server-side priced; client-provided amounts are never trusted.
- [ ] **TRK-04**: After confirmation, permalink edits are rejected and the payment link reflects the confirmed amount.
- [ ] **TRK-05**: When a change reduces the amount due, the excess is treated as a donation.
- [ ] **TRK-06**: The existing booking-reference search page remains as an entry point to the permalink.

### Finance Derivation

- [ ] **FIN-01**: Canonical order amount-due includes accommodation option charges so Paid, Outstanding, and Reconciliation remain correct across all consumers.
- [ ] **FIN-02**: Accommodation pricing is derived live for unconfirmed orders and snapshotted (with a config version boundary) at admin confirmation so confirmed orders never retroactively re-price.
- [ ] **FIN-03**: A pure domain module computes accommodation amounts and is covered by unit tests; UI surfaces never compute accommodation totals.
- [ ] **FIN-04**: Tikkie payment links and amount-due agree after accommodation re-pricing, with stale links regenerated/expired as needed.

### Allocation Paid-Priority

- [ ] **ALL-01**: The admin Allocation view derives a per-attendee paid state from canonical per-attendee due/paid maps, never from order status.
- [ ] **ALL-02**: Paid attendees are highlighted and prioritized; unpaid attendees are grayed so admins do not assign rooms before payment completes.
- [ ] **ALL-03**: Admin assignment confirmation sets the confirmedAt boundary that locks buyer config changes.

### Ticket-Driven Room Eligibility (SEED-002)

- [ ] **TKT-01**: Ticket type remains the source of room entitlement, mapping a ticket to its allowed room category/type during signup and allocation.
- [ ] **TKT-02**: Signup shows the selected ticket rather than asking for ticket type again, and room eligibility derives from the ticket's allowed room types.

## Future Requirements

- Cross-event analytics and portfolio dashboards.
- Full Ticket Tailor schema/provider redesign.
- Advanced commerce features such as coupons and new refund workflows.
- QR-code event check-in (SEED-001).

## Out Of Scope

| Feature | Reason |
| --- | --- |
| New backend finance formulas or provider migration | v5.0 extends the canonical amount-due derivation rather than replacing it. |
| Multi-tenant organization support | The project remains single-org scoped. |
| Cross-event reporting product | Would require a separate information architecture and authorization model. |
| Public attendee-facing UX redesign beyond accommodation options | This milestone focuses on accommodation upgrades/options and the track-payment permalink. |
| Waitlist/exhaustion workflows | Full waitlist is deferred; exhausted inventory keeps current no-availability behavior. |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| UX-01 | 34 | Done |
| UX-02 | 34 | Done |
| UX-03 | 34 | Done |
| OPS-01 | 35 | Done |
| OPS-02 | 35 | Done |
| OPS-03 | 38 | Pending |
| FINUX-01 | 36 | Done |
| FINUX-02 | 36 | Done |
| ACCUX-01 | 36 | Done |
| ACCUX-02 | 36 | Done |
| QUAL-01 | 37 | Done |
| QUAL-02 | 37 | Done |
| QUAL-03 | 37 | Done |
| QUAL-04 | 34 | Done |
| CAT-01 | 39 | Pending |
| CAT-02 | 39 | Pending |
| CAT-03 | 39 | Pending |
| CAT-04 | 41 | Pending |
| CFG-01 | 39 | Pending |
| CFG-02 | 39 | Pending |
| CFG-03 | 39 | Pending |
| CFG-04 | 39 | Pending |
| CFG-05 | 39 | Pending |
| ADM-01 | 41 | Pending |
| ADM-02 | 41 | Pending |
| ADM-03 | 41 | Pending |
| SIG-01 | 42 | Pending |
| SIG-02 | 42 | Pending |
| SIG-03 | 42 | Pending |
| SIG-04 | 42 | Pending |
| TRK-01 | 43 | Pending |
| TRK-02 | 43 | Pending |
| TRK-03 | 43 | Pending |
| TRK-04 | 43 | Pending |
| TRK-05 | 43 | Pending |
| TRK-06 | 43 | Pending |
| FIN-01 | 40 | Pending |
| FIN-02 | 40 | Pending |
| FIN-03 | 40 | Pending |
| FIN-04 | 40 | Pending |
| ALL-01 | 44 | Pending |
| ALL-02 | 44 | Pending |
| ALL-03 | 44 | Pending |
| TKT-01 | 42 | Pending |
| TKT-02 | 42 | Pending |

**Coverage:** v5.0 has 31 requirements, all mapped to a phase (39-44). Note: the earlier "36 requirements" count was a miscount; the traceability table above lists all 31 actual v5.0 requirements.

---

_Requirements defined: 2026-08-05 for milestone v5.0_
