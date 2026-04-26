# Requirements: Conference Finance Dashboard

**Defined:** 2026-04-01
**Core Value:** Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## v3.0 Requirements

### Runtime Truth

- [ ] **RTM-01**: Finance and operations reads return order, attendee, and balance data from canonical internal tables without requiring runtime `ticketTailor*` queries.
- [ ] **RTM-02**: New and updated order-payment joins use one canonical internal order identifier contract.
- [ ] **RTM-03**: Ticket Tailor data is accessed through explicit ingest and mapping boundaries instead of acting as runtime finance truth.

### Canonical Money Model

- [x] **FIN-01**: Each order has one deterministic canonical total in minor units that stays consistent across ledger, detail, reconciliation, and exports.
- [x] **FIN-02**: Each attendee has a canonical payable amount derived from internal order facts instead of equal-split heuristics.
- [x] **FIN-03**: Payments can be explicitly allocated to orders and, where needed, attendees so partial, split, and overpayments are auditable.
- [ ] **FIN-04**: Reconciliation surfaces show reason codes derived from canonical totals, payables, and payment allocations.

### Migration and Cutover

- [ ] **MIG-01**: Canonical finance data can be widened, backfilled, and dual-written safely against existing production-shaped records.
- [ ] **MIG-02**: Canonical outputs can be compared against legacy outputs with parity checks before final cutover.
- [ ] **MIG-03**: Runtime provider fallbacks and legacy compatibility paths can be removed after canonical parity is validated.

## Future Requirements

### Reporting and Explainability

- **RPT-01**: Operator can drill from order total to attendee payable to payment allocation with explainable amount provenance.
- **RPT-02**: Operator can capture notes or provenance for manual allocations and finance overrides.
- **RPT-03**: Operator can view canonical reporting slices by event, payable state, allocation state, and balance state.

### Provider Boundary Redesign

- **INT-01**: Ticket Tailor raw ingest and mapping tables are redesigned after canonical internal runtime cutover is complete.
- **INT-02**: Provider-specific visibility, refund, and archive semantics are modeled without leaking into core runtime reads.

## Out of Scope

| Feature                                            | Reason                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Full Ticket Tailor table redesign in v3.0          | Internal runtime truth must be stabilized first; provider redesign is a follow-up milestone                   |
| New public signup UX features                      | This milestone is focused on finance correctness and canonical internal data, not new attendee-facing breadth |
| Advanced discount/coupon/refund commerce expansion | Expands the money model before core totals, payables, and allocations are trustworthy                         |
| Multi-tenant church/org support                    | Project remains single-org scoped                                                                             |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| RTM-01      | 32    | Pending |
| RTM-02      | 26    | Pending |
| RTM-03      | 33    | Pending |
| FIN-01      | 27    | Complete |
| FIN-02      | 27    | Complete |
| FIN-03      | 27    | Complete |
| FIN-04      | 32    | Pending |
| MIG-01      | 31    | Pending |
| MIG-02      | 31    | Pending |
| MIG-03      | 33    | Pending |

**Coverage:**

- v3.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

## Future Requirement Traceability

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| RPT-03      | 30    | Pending |

---

_Requirements defined: 2026-04-01_
_Last updated: 2026-04-01 after creating roadmap for milestone v3.0 canonical orders foundation_
