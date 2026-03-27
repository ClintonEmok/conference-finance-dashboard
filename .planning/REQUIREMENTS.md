# Requirements: Conference Finance Dashboard

**Defined:** 2026-03-27
**Core Value:** Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## v2.0 Requirements

### Schema & Contracts

- [ ] **ESCH-01**: Canonical `events` table uses `source: "integration" | "internal"` with optional `integrationProvider` field for provider-specific detail. Includes `slug`, `published`, `startsAt`, `location`, and `currency` as first-class fields.
- [ ] **ESCH-02**: `eventTicketTypes` table is populated for both internal events (admin-managed) and integration events (synced from Ticket Tailor where available) so one public detail UI and one finance model work for both sources.
- [ ] **ESCH-03**: `eventRegistrations` table enforces capacity and duplicate-email guards atomically in a single Convex mutation (denormalized counter + normalized email comparison). Not a DB unique constraint — an app-level invariant via transactional enforcement.

### Public Signup

- [ ] **EPUB-01**: Public user can browse a list of published events at `/events`
- [ ] **EPUB-02**: Public user can view event detail page with description, date, location, and available ticket types (canonical shape, source-agnostic)
- [ ] **EPUB-03**: Public user can submit a registration form with name, email, phone, and selected ticket type
- [ ] **EPUB-04**: System rejects registration when event is full — enforced atomically in the same mutation as insert
- [ ] **EPUB-05**: System rejects duplicate registrations by normalized email per event — enforced atomically in the same mutation as insert

### Admin Event Management

- [ ] **EADM-01**: Admin can create internal events with title, description, date, location, slug, publish status, and currency
- [ ] **EADM-02**: Admin can add/edit/remove ticket types on internal events with name, price, and capacity
- [ ] **EADM-03**: Admin can view and filter events by source. Integration events are read-only; admin can create and manage only internal events.
- [ ] **EADM-04**: Admin can view a unified event list showing both integration-synced and internal events via canonical read model
- [ ] **EADM-05**: Admin can view registrations for internal events with attendee details

### Finance Integration (Read-Time Union approach)

- [ ] **EFIN-01**: Internal registrations create order and payment records in a dedicated `internalOrders` table. Finance domain layer unions `ticketTailorOrders` and `internalOrders` at read time via a shared `OrderDTO` shape. Existing TT tables remain untouched.
- [ ] **EFIN-02**: Revenue/dashboard views resolve events through canonical `events` table rather than `providerEventId`/`ticketTailor*` table assumptions. Order reads use the union layer.
- [ ] **EFIN-03**: Reconciliation views can represent orders/payments from internal registrations alongside Ticket Tailor data through the shared `OrderDTO` union.
- [ ] **EFIN-04**: System auto-creates a Tikkie payment link for paid internal registrations using existing event-level Tikkie templates, applied against internal order/payment records.

## Future Requirements

### Deferred to post-v2.0

- **Household registration** — register multiple attendees under one submission (P2, HIGH complexity)
- **Canonical orders consolidation** — migrate to single `orders` table with source discriminator (natural Phase 18)
- **Public attendee account portal** — post-signup profile editing, ticket management
- **Capacity waitlist** — queue registrations when event is full

## Out of Scope

| Feature                        | Reason                                             |
| ------------------------------ | -------------------------------------------------- |
| Real-time signup counters      | Adds complexity, low value for church-scale events |
| Coupon/discount system         | Not needed for conference context                  |
| QR code tickets                | Overkill for church events, check-in sufficient    |
| Social login for public signup | Email-only keeps it simple                         |
| Multi-tenant church support    | Single church scope for now                        |

## Traceability

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| ESCH-01     | TBD   | Pending |
| ESCH-02     | TBD   | Pending |
| ESCH-03     | TBD   | Pending |
| EPUB-01     | TBD   | Pending |
| EPUB-02     | TBD   | Pending |
| EPUB-03     | TBD   | Pending |
| EPUB-04     | TBD   | Pending |
| EPUB-05     | TBD   | Pending |
| EADM-01     | TBD   | Pending |
| EADM-02     | TBD   | Pending |
| EADM-03     | TBD   | Pending |
| EADM-04     | TBD   | Pending |
| EADM-05     | TBD   | Pending |
| EFIN-01     | TBD   | Pending |
| EFIN-02     | TBD   | Pending |
| EFIN-03     | TBD   | Pending |
| EFIN-04     | TBD   | Pending |

**Coverage:**

- v2.0 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️ (roadmap pending)

---

_Requirements defined: 2026-03-27_
_Last updated: 2026-03-27 after finance architecture decision (Option B: read-time union)_
