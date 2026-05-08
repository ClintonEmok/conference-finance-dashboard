# Architecture Research

**Domain:** Brownfield canonical orders/payments/payables foundation for a finance-first conference ops app
**Researched:** 2026-04-01
**Confidence:** HIGH

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         App Surfaces (existing)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Public signup     Dashboard finance     Dashboard attendees/accommodation  │
│  Next.js routes    Next.js API/routes    Next.js API/routes                 │
└──────────────┬──────────────────────┬───────────────────────────┬───────────┘
               │                      │                           │
               ▼                      ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Canonical Convex domain boundary                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  order write service   payable projector   payment service   read models     │
│  order mutation API    cost/payable rules  assignment/apply  finance/order   │
│                                                              attendee/room   │
└──────────────┬──────────────────────┬───────────────────────────┬───────────┘
               │                      │                           │
               ▼                      ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Canonical internal tables                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  orders  orderAttendees  orderLineItems  attendeePayables                    │
│  payments  paymentAllocations  orderTicketSelections  orderAssignments       │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 Deferred provider boundary (not runtime truth)               │
├──────────────────────────────────────────────────────────────────────────────┤
│  raw ingest tables/events   provider mapping tables   provider sync workers  │
│  Ticket Tailor payloads     canonical↔provider links  internalMutation only  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                            | Responsibility                                                                                          | Typical Implementation                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Canonical order aggregate            | Own internal order header, booker, attendee, assignment, ticket-selection facts                         | Existing `orders`, `orderAttendees`, `orderTicketSelections`, `orderAssignments` with additive normalization |
| Canonical financial obligation layer | Own deterministic amount facts instead of deriving from provider tables at read time                    | **New** `orderLineItems` + `attendeePayables` projector/write helpers                                        |
| Canonical payment layer              | Own payment receipts and explicit application of money to obligations/orders                            | Existing `payments` plus **new** `paymentAllocations` (or `paymentApplications`)                             |
| Finance read models                  | Expose order ledger, balances, attendee follow-up, reconciliation from canonical tables only            | **Modified** `convex/orders.ts`, finance domain modules, protected API routes                                |
| Accommodation/attendee read models   | Read attendee identity and assignment truth from canonical attendees/assignments, not TT extension docs | **Modified** `convex/attendees.ts`, `convex/accommodation.ts`                                                |
| Provider ingest boundary             | Store provider payloads and mapping metadata without leaking them into runtime reads                    | Existing `sync/*` kept, but moved toward raw-ingest + mapping role later                                     |

## Recommended Project Structure

```text
convex/
├── orders.ts                     # public/internal order query surface (keep, slim)
├── payments.ts                   # public/internal payment query surface (keep, slim)
├── attendees.ts                  # canonical attendee reads after cutover
├── accommodation.ts              # canonical assignment/occupancy reads after cutover
├── schema.ts                     # additive table/index evolution
├── orderDomain/
│   ├── writes.ts                 # canonical order creation/update helpers
│   ├── pricing.ts                # order total + line-item derivation rules
│   ├── payables.ts               # attendee payable derivation/projector
│   └── invariants.ts             # runtime assertions / comparison helpers
├── paymentDomain/
│   ├── receipts.ts               # create/update canonical payments
│   ├── allocations.ts            # apply/unapply payment amounts
│   └── matching.ts               # auto-match inputs, no UI-specific logic
└── sync/
    ├── orders.ts                 # keep dual-write temporarily
    ├── attendees.ts              # keep dual-write temporarily
    └── provider/                 # later: raw ingest + mapping-focused modules

lib/domain/finance/
├── order-ledger.ts               # read canonical finance contracts
├── reconciliation.ts             # canonical reasons only
├── matched-payments.ts           # replaced by payment allocation aggregation
└── attendee-*.ts                 # consume attendeePayables, not even-split heuristics
```

### Structure Rationale

- **`convex/orderDomain/` and `convex/paymentDomain/`:** pull business rules out of large endpoint files so migration logic and canonical formulas live in one place.
- **Keep `orders.ts` / `payments.ts` as API facades:** protects existing generated refs and route integrations while the internals change.
- **`sync/` remains separate:** provider-specific logic stays operational, but stops being allowed to define runtime truth.

## Architectural Patterns

### Pattern 1: Canonical facts first, provider facts second

**What:** The runtime model should answer finance questions from canonical internal tables without reading `ticketTailor*` rows.
**When to use:** Immediately for this milestone.
**Trade-offs:** Requires additive tables and backfills now, but prevents another rewrite later.

**Example:**

```typescript
// Runtime read path
order -> orderLineItems -> attendeePayables -> paymentAllocations

// Provider lookup path (deferred boundary)
ticketTailorRawEvent -> providerOrderMapping -> order
```

### Pattern 2: Explicit money application, not inferred payment attachment

**What:** Keep `payments` as receipt facts and add a child table that explains how each payment amount is applied.
**When to use:** Before replacing reconciliation and attendee outstanding logic.
**Trade-offs:** More rows and write logic, but much cleaner auditability than `payments.orderId` alone.

**Example:**

```typescript
// receipt fact
payments: {
  amountMinor,
  source,
  paidAt,
}

// application fact
paymentAllocations: {
  paymentId,
  orderId,
  attendeePayableId,
  allocatedAmountMinor,
  allocatedAt,
}
```

### Pattern 3: Widen → migrate → cut over → narrow

**What:** Add new fields/tables first, backfill and dual-run reads, then switch consumers, then remove legacy assumptions.
**When to use:** Any Convex schema/data change touching live rows.
**Trade-offs:** Temporary duplication, but safest for production-shaped data.

**Example:**

```typescript
// Phase A: add new tables/indexes
// Phase B: backfill canonical payables and allocations
// Phase C: switch order/reconciliation queries to canonical-only reads
// Phase D: stop legacy joins and narrow contracts
```

## Data Flow

### Request Flow

```text
Signup / operator action
    ↓
Next.js route or client mutation
    ↓
Convex public mutation/query facade
    ↓
Canonical domain helper
    ↓
Canonical tables (+ optional sync/mapping side write)
    ↓
Finance/attendee/accommodation read model
    ↓
Protected UI / public confirmation
```

### State Management

```text
Convex canonical query
    ↓ subscribe
React hooks / route handlers
    ↓
UI components
    ↓ action
Convex mutations
    ↓
Canonical tables updated
```

### Key Data Flows

1. **Internal signup/order write:** `submitSignupEnvelope` continues writing `orders`/`orderAttendees`/`orderTicketSelections`/`orderAssignments`, then additionally creates canonical financial rows (`orderLineItems`, `attendeePayables`).
2. **Manual payment / imported payment:** payment receipt is stored in `payments`; allocation logic writes `paymentAllocations`; balances are read from allocations, not inferred from `payments.orderId`.
3. **Finance reads:** order ledger, attendee follow-up, reconciliation, and payment summary read canonical order + payable + allocation tables only.
4. **Provider sync (temporary brownfield mode):** sync keeps dual-writing canonical order/attendee facts and provider extension rows, but provider rows are no longer consulted by canonical finance reads.

## Build Order and Migration Boundaries

### Recommended Build Order

1. **Stabilize canonical identifiers and payment semantics**
   - Normalize all new payment writes to canonical `orders` IDs only.
   - Stop introducing new provider-id-vs-Convex-id ambiguity.
   - Keep read-time fallback for old rows.

2. **Add canonical financial child tables (additive only)**
   - Add `orderLineItems` for order-level charge facts.
   - Add `attendeePayables` for attendee-specific obligations.
   - Add `paymentAllocations` for explicit money application.
   - Keep `orders.totalAmountMinor` as compatibility/cache field during transition.

3. **Backfill/project canonical financial facts**
   - Internal orders: derive from `orderTicketSelections × ticketTypes.priceMinor`.
   - Ticket Tailor orders: seed one or more synthetic canonical line items from current provider-backed totals for now.
   - Backfill attendee payables using deterministic milestone rules.
   - Backfill allocations from existing matched payments.

4. **Create canonical read models beside legacy ones**
   - New order detail, ledger, attendee ledger, reconciliation, room occupancy helpers.
   - Add comparison/invariant utilities to prove parity where expected.

5. **Cut over dashboard/runtime consumers**
   - Finance pages first.
   - Then attendee detail/follow-up.
   - Then accommodation occupancy/assignment views.
   - Leave provider admin/debug screens on extension tables if needed.

6. **Quarantine provider tables behind ingest/mapping boundaries**
   - Replace direct `ticketTailor*` runtime reads with raw ingest + mapping lookups.
   - This is the first milestone _after_ canonical runtime cutover, not part of the foundation milestone.

### Migration Boundaries

| Boundary                                              | In This Milestone                                    | Defer |
| ----------------------------------------------------- | ---------------------------------------------------- | ----- |
| `orders` / `orderAttendees` canonical core            | Yes — evolve and normalize                           | No    |
| `payments` semantics cleanup                          | Yes — stop new ambiguity, keep legacy fallback reads | No    |
| Canonical payables/allocations tables                 | Yes — additive + backfill                            | No    |
| Dashboard finance read paths                          | Yes — migrate to canonical-only                      | No    |
| `attendees.ts` and `accommodation.ts` direct TT reads | Yes, after finance queries stabilize                 | No    |
| Ticket Tailor raw ingest redesign                     | No                                                   | Yes   |
| Full provider mapping model redesign                  | No                                                   | Yes   |
| Provider webhook/sync UX redesign                     | No                                                   | Yes   |

### Dependency Graph

```text
payment semantics cleanup
    ↓
orderLineItems
    ↓
attendeePayables
    ↓
paymentAllocations
    ↓
canonical finance reads
    ↓
attendee/accommodation canonical reads
    ↓
provider boundary quarantine
```

## Validation Strategy

### Runtime Invariants

- `sum(orderLineItems.amountMinor where orderId) == orders.totalAmountMinor` during transition.
- `sum(attendeePayables.amountMinor where orderId) == sum(orderLineItems.amountMinor where orderId)`.
- `sum(paymentAllocations.allocatedAmountMinor where paymentId) <= payments.amountMinor`.
- `order outstanding = payable total - allocated total`, never from TT extension joins.

### Rollout Validation

1. **Backfill dry run first** using migration tooling/batched internal mutations.
2. **Dual-run queries**: old finance read vs new canonical read for same event/date window.
3. **Diff logging** for orders with mismatched totals, balances, attendee counts, or archive visibility.
4. **Cut over consumers only after diff set is explained**.

### Test Strategy

- `convex-test` for mutation/projector invariants and migration helpers.
- Snapshot-style fixtures for:
  - internal signup order
  - Ticket Tailor synced order
  - partial payment
  - overpayment
  - cancelled/refunded order
- Protected API regression tests for dashboard routes that must return the same contracts after cutover.

## Scaling Considerations

| Scale                       | Architecture Adjustments                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Current church-scale usage  | Monolith is fine; use additive tables and indexed joins only                                       |
| Larger order history        | Replace `.take()`-heavy cross-table scans with tighter indexes and paginated canonical read models |
| Much larger provider volume | Split raw ingest processing from canonical projection jobs, but keep one canonical runtime model   |

### Scaling Priorities

1. **First bottleneck:** current scan/join-heavy brownfield queries in `orders.ts`, `attendees.ts`, and `accommodation.ts`.
2. **Second bottleneck:** migration/backfill transaction size; batch with Convex migration tooling/internal mutations.

## Anti-Patterns

### Anti-Pattern 1: Keep `ticketTailor*` in the runtime read path “just for one more screen”

**What people do:** Migrate finance queries but leave attendee/accommodation visibility or room occupancy dependent on TT extension rows.
**Why it's wrong:** You never get one canonical runtime truth, and cross-screen totals keep drifting.
**Do this instead:** finish the runtime cutover per vertical slice until finance + attendee + room reads all use canonical tables.

### Anti-Pattern 2: Model “payment attached to order” as a single nullable FK forever

**What people do:** Keep solving balances with `payments.orderId` and status flags only.
**Why it's wrong:** It cannot represent partial allocations, splits, reassignments, or auditable attendee follow-up.
**Do this instead:** treat `payments` as receipts and add explicit allocation rows.

### Anti-Pattern 3: Redesign provider ingest and canonical finance in the same phase

**What people do:** Try to introduce raw ingest, mapping, new core tables, and UI cutovers together.
**Why it's wrong:** Too many moving parts; hard to isolate whether defects are core-model or integration-boundary issues.
**Do this instead:** stabilize canonical runtime first, then move providers behind cleaner ingest/mapping boundaries.

## Integration Points

### External Services

| Service       | Integration Pattern                                                                          | Notes                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Ticket Tailor | Keep current sync/webhook ingestion; dual-write canonical core + provider tables temporarily | Runtime finance reads should stop depending on `ticketTailorOrders` / `ticketTailorAttendees` |
| Tikkie        | Keep current payment fetch/webhook ingestion into canonical `payments`                       | Add allocation layer behind it; do not redesign Tikkie UX in this milestone                   |
| Clerk         | No architecture change                                                                       | Auth boundary already correct for dashboard/protected mutations                               |

### Internal Boundaries

| Boundary                                                                         | Communication                                       | Notes                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `signupSubmission` ↔ canonical finance projector                                 | Direct helper call within same mutation transaction | Best place to mint order line items/payables for internal orders   |
| `sync/orders.ts` / `sync/attendees.ts` ↔ canonical core                          | `internalMutation` dual-write                       | Keep until raw-ingest/mapping redesign milestone                   |
| `payments.ts` ↔ allocation helper                                                | Direct helper call within mutation transaction      | New canonical balance truth starts here                            |
| `orders.ts` / finance domain ↔ canonical financial tables                        | Query-only joins on canonical IDs                   | Removes provider-order-id runtime dependency over time             |
| `attendees.ts` / `accommodation.ts` ↔ canonical attendee/assignment/payable data | Query-only joins on canonical IDs                   | Required to remove TT attendee table as occupancy/assignment truth |

## Recommended Brownfield End State for This Milestone

- `orders` and `orderAttendees` remain the aggregate roots.
- `orderTicketSelections` and `orderAssignments` remain operational child tables.
- New canonical finance children (`orderLineItems`, `attendeePayables`, `paymentAllocations`) become the money truth.
- `orders.totalAmountMinor` survives as a derived/cache/back-compat field, not the only source of truth.
- `ticketTailor*` tables remain operationally useful but become non-authoritative extension/raw-ingest inputs.

## Sources

- `.planning/PROJECT.md`
- `.planning/STATE.md`
- `.planning/codebase/FINANCIAL_DATA_FLOW.md`
- `.planning/tickettailor-table-usage.md`
- `convex/schema.ts`
- `convex/orders.ts`
- `convex/payments.ts`
- `convex/attendees.ts`
- `convex/accommodation.ts`
- `convex/signupSubmission.ts`
- Convex docs: https://docs.convex.dev/database/schemas
- Convex docs: https://docs.convex.dev/database/writing-data
- Context7 `/get-convex/migrations` README snippets for batched live migrations

---

_Architecture research for: Canonical Orders Foundation_
_Researched: 2026-04-01_
