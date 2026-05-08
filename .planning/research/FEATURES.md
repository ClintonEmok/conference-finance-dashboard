# Feature Research

**Domain:** Brownfield canonical orders + attendee payable foundation for an internal conference finance system
**Researched:** 2026-04-01
**Confidence:** HIGH

## Feature Landscape

### Brownfield Foundation Answer

Robust internal order/finance foundations in brownfield systems usually converge on one rule: **provider data is an ingest/mapping context, not the runtime finance model**. Runtime queries read canonical internal tables; provider-specific tables remain for raw payloads, external IDs, sync diagnostics, and exception handling.

For this milestone, the winning shape is not “add more reporting.” It is: **make order totals, attendee payable, payment allocation, and reconciliation reasons derivable from one deterministic internal model**. In practice that means replacing provider-leaking reads with canonical order facts, canonical attendee cost facts, and explicit payment-to-order or payment-to-attendee allocation records.

### Table Stakes (Users Expect These)

Features finance/admin users will assume are correct. Missing these means the system is not trustworthy.

| Feature                                             | Why Expected                                                                                                                                  | Complexity | Notes                                                                                                                                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical order as sole runtime source              | Finance screens must show one answer for order total, status, buyer, attendees, and balance                                                   | HIGH       | Depends on existing `orders`, `orderAttendees`, `orderTicketSelections`, and current dashboard/query contracts. Brownfield requirement: remove active runtime dependence on `ticketTailor*` reads, not just add parallel tables. |
| Deterministic order total formula + stored snapshot | Operators expect order totals to be explainable and stable across ledger, drilldown, reconciliation, and exports                              | HIGH       | Must preserve current `orders.totalAmountMinor` usage while making its derivation auditable from canonical inputs or trusted ingest snapshots. Avoid query-time recomputation drift.                                             |
| Canonical attendee payable model                    | Attendee follow-up needs a real amount owed per attendee, not an approximate even split                                                       | HIGH       | Depends on `orderTicketSelections`, ticket pricing, attendee membership, and any attendee-level overrides already living in TT extension fields. Existing even-split outstanding logic is a known gap.                           |
| Explicit payment allocation model                   | Partial, split, and overpayments must be traceable to orders and, where needed, attendees                                                     | HIGH       | Depends on current `payments` flows, manual assignment, auto-match outcomes, and legacy `payment.orderId` semantics. Table-stakes shape is a separate allocation fact, not just “sum matched payments by order.”                 |
| Reconciliation reason codes from canonical facts    | Finance users expect exception queues to say why an order is wrong, not just that it looks wrong                                              | MEDIUM     | Should build on existing reconciliation reasons (`pending-payment`, `missing-amount`, etc.) and extend them using canonical totals/allocation facts.                                                                             |
| Provider ingest/mapping boundary                    | Brownfield systems need provider data for sync and auditing, but should not let provider schemas leak into finance logic                      | MEDIUM     | Depends on current core+extension pattern already documented in Phase 24. TT stays valuable for raw payload, provider IDs, visibility/archive state, and sync troubleshooting.                                                   |
| Backward-compatible correctness during cutover      | Existing finance dashboard, payments, attendee detail, room assignment, and sync flows must keep working while truth is moved underneath them | HIGH       | Requires migration-safe read contracts, additive rollouts, and likely temporary shadow comparison between old and new derivations.                                                                                               |

### Differentiators (High-Value for This Milestone)

These are not strictly required to establish trust, but they make the foundation much more valuable and reduce future rework.

| Feature                                   | Value Proposition                                                                                                                    | Complexity | Notes                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explainable amount drilldown              | Lets admins answer “why is this total/payable/balance what it is?” from order total → attendee charges → payment allocations         | MEDIUM     | Strong fit for this app because finance/admin workflows already include order drilldown and attendee detail. Uses the same canonical facts needed for correctness. |
| Shadow-read / parity verification mode    | Speeds brownfield cutover by showing where canonical results diverge from legacy provider-leaking paths before full switch           | MEDIUM     | Depends on keeping legacy query outputs available long enough to compare totals, payable, and status. Valuable for dirty real-world data.                          |
| Source-agnostic finance behavior          | Makes internal signup orders and integration-backed orders behave the same in finance and operations views                           | HIGH       | Builds on current dual-write core+extension architecture. Important because the app already serves both internal and Ticket Tailor-backed flows.                   |
| Allocation provenance and exception notes | Makes manual finance work safer by recording why an allocation or override exists, not just the numeric result                       | MEDIUM     | Especially useful when manual payment assignment, attendee overrides, or cleanup is already part of operator workflow.                                             |
| Internal-first reporting slices           | Enables reports by canonical dimensions like event, order status, attendee payable state, collected vs allocated, and unapplied cash | MEDIUM     | Do after core correctness is stable; these reports are a leverage gain from the foundation, not the foundation itself.                                             |

### Anti-Features (Commonly Requested, Often Problematic)

These feel attractive in brownfield finance work but usually slow the milestone or preserve ambiguity.

| Feature                                                                  | Why Requested                                            | Why Problematic                                                                                               | Alternative                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Keep provider tables as silent runtime fallback                          | Feels safer because “legacy data still works”            | Preserves dual truth; bugs become unreproducible because the answer depends on which path supplied the row    | Make fallback explicit as diagnostics-only or migration tooling, not production runtime truth                      |
| Recompute all totals live from mixed raw tables on every query           | Feels “more accurate” because it always uses latest data | Produces drift, null-masking, and inconsistent results across screens; mixes ingest quirks into finance logic | Store canonical totals/payables from deterministic rules and expose derivation metadata                            |
| Evenly split outstanding across attendees as the long-term payable model | Easy to implement and looks fair enough for some orders  | Breaks as soon as ticket prices differ, add-ons exist, or one attendee has an override                        | Model attendee payable from canonical ticket/charge facts, with explicit override support where policy requires it |
| Heuristic-only payment matching as the finance foundation                | Attractive because name+amount matching already exists   | Great for suggestions, unsafe as final accounting truth without explicit assignment/allocation records        | Keep heuristics for proposal generation; persist explicit allocations once confirmed or auto-matched confidently   |
| Big-bang provider redesign in same milestone                             | Tempting because the provider tables are messy           | Expands scope and delays internal correctness; provider cleanup is a separate bounded context problem         | Stabilize canonical internal model first, then redesign Ticket Tailor ingest/mapping later                         |
| Dashboard-specific denormalized balance fields with no provenance        | Seems fast for reporting                                 | Creates more conflicting “totals” columns and future migration pain                                           | Derive dashboard views from canonical order/payable/allocation facts or materialize them from one source           |

## Feature Dependencies

```text
[Canonical order runtime model]
    ├──requires──> [Provider ingest/mapping boundary]
    ├──requires──> [Backward-compatible cutover contract]
    └──enables──> [Deterministic order total formula]
                          └──requires──> [Canonical ticket/charge facts]
                                              └──enables──> [Canonical attendee payable]
                                                                  └──enables──> [Internal-first reporting slices]

[Explicit payment allocation model]
    ├──requires──> [Canonical order runtime model]
    ├──requires──> [Stable payment identity semantics]
    └──enables──> [Reconciliation reason codes]

[Shadow-read / parity verification mode] ──enhances──> [Backward-compatible cutover contract]

[Silent provider fallback] ──conflicts──> [Canonical order runtime model]
[Heuristic-only matching as truth] ──conflicts──> [Explicit payment allocation model]
```

### Dependency Notes

- **Canonical order runtime model requires provider ingest/mapping boundary:** finance correctness improves only when provider data is demoted to extension/raw context instead of being queried as business truth.
- **Deterministic order total formula requires canonical ticket/charge facts:** without stable charge inputs, every downstream balance/payable number stays arguable.
- **Canonical attendee payable depends on deterministic order facts:** per-attendee payable is not safe to ship while order totals and charge attribution remain mixed or inferred.
- **Explicit payment allocation model requires stable payment identity semantics:** current mixed `payment.orderId` meaning must be normalized before allocations can be trusted historically.
- **Reconciliation reason codes depend on allocations and canonical totals:** otherwise the system can flag “wrong” without proving what is wrong.
- **Shadow-read parity enhances cutover safety:** especially important in this brownfield milestone because existing dashboard/operator behavior must continue uninterrupted.
- **Silent provider fallback conflicts with canonical runtime truth:** it turns migration code into permanent business logic.

## MVP Definition

### Launch With (This Milestone)

- [x] Canonical runtime reads for orders, attendees, and finance-critical summaries — essential because this is the milestone’s main trust boundary
- [x] Deterministic order total + attendee payable derivation rules — essential because balances and follow-up amounts must stop drifting by screen
- [x] Explicit payment allocation facts at least at order level, with room to extend to attendee level — essential because partial/over payments otherwise stay ambiguous
- [x] Canonical reconciliation reasons based on internal facts — essential because finance operators need actionable exception queues

### Add After Validation (Next Increment)

- [ ] Explainable drilldown UI for “why this amount” — add once canonical facts exist and operators start validating edge cases
- [ ] Shadow parity reporting dashboard — add if migration uncovers frequent legacy/canonical mismatches
- [ ] Internal-first reporting slices by event/payable/allocation state — add after core numbers are trusted

### Future Consideration (Later Milestone)

- [ ] Provider-table redesign / deeper Ticket Tailor cleanup — defer until internal truth is fully stable
- [ ] Advanced allocation automation or auto-writeoff policies — defer until explicit allocation facts and finance rules are settled
- [ ] Broader commerce features like discounts/coupons/refunds UX expansion — defer because they increase charge-model scope beyond current correctness goals

## Feature Prioritization Matrix

| Feature                                            | User Value | Implementation Cost | Priority |
| -------------------------------------------------- | ---------- | ------------------- | -------- |
| Canonical order runtime model                      | HIGH       | HIGH                | P1       |
| Deterministic order total + attendee payable rules | HIGH       | HIGH                | P1       |
| Explicit payment allocation facts                  | HIGH       | HIGH                | P1       |
| Canonical reconciliation reasons                   | HIGH       | MEDIUM              | P1       |
| Explainable amount drilldown                       | HIGH       | MEDIUM              | P2       |
| Shadow parity verification                         | MEDIUM     | MEDIUM              | P2       |
| Internal-first reporting slices                    | MEDIUM     | MEDIUM              | P2       |
| Provider redesign cleanup                          | LOW        | HIGH                | P3       |

**Priority key:**

- P1: Must have for milestone success
- P2: High leverage once the core model is stable
- P3: Valuable later, but should not block canonical correctness

## Brownfield Pattern Analysis

| Pattern                                            | Typical Outcome                                                           | Our Approach                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Provider-specific tables leak into runtime queries | Fast initially, then finance ambiguity and inconsistent answers by screen | End this pattern; provider tables become extension/ingest only                       |
| Core + extension with canonical runtime reads      | Best balance for brownfield continuity and future integrations            | Recommended baseline for this milestone                                              |
| Full ledger/accounting rewrite first               | Powerful but too large for current milestone scope                        | Avoid for now; add explicit allocation facts without turning the app into a full ERP |

## Sources

- `.planning/PROJECT.md` — milestone goal, constraints, and active correctness risks (HIGH)
- `.planning/codebase/FINANCIAL_DATA_FLOW.md` — current order totals, attendee outstanding, and payment matching behavior/gaps (HIGH)
- `.planning/tickettailor-table-usage.md` — current core+extension pattern and remaining provider leakage points (HIGH)
- `.planning/phases/24-canonical-orders-rewrite/24-CONTEXT.md` — canonical/core-vs-extension design decisions already established in this codebase (HIGH)
- Martin Fowler, “Bounded Context” — why provider/integration models should map into, not replace, the internal domain model: https://martinfowler.com/bliki/BoundedContext.html (MEDIUM)
- Stripe invoice docs — authoritative example of separating line items from invoice totals and tracking amount paid vs remaining: https://docs.stripe.com/api/invoices (MEDIUM)

---

_Feature research for: canonical internal order/payable foundation in a brownfield finance system_
_Researched: 2026-04-01_
