# Financial Data Flow Analysis

**Analysis Date:** 2026-04-01

## 1. Order Cost Calculation

### How `orders.totalAmountMinor` is set

There are **two ingestion paths**, and they handle cost differently:

#### Path A: Ticket Tailor sync (integration)

- **Source:** `convex/sync/orders.ts` → `internalUpsertTicketTailorOrder` (line 209)
- **How amount is derived:** Extracted from the raw Ticket Tailor payload:
  ```ts
  // convex/sync/orders.ts:254-257
  const totalAmountMinor =
    toMinorAmount(raw.total) ??
    toMinorAmount(raw.amount) ??
    toMinorAmount(raw.total_amount)
  ```
- **Stored in:** `orders.totalAmountMinor` (line 291, 303)
- **Key point:** The amount comes **directly from Ticket Tailor's order total** — it is NOT computed from ticket types × quantities locally. Ticket Tailor sends the already-calculated total.

#### Path B: Internal signup submission

- **Source:** `convex/signupSubmission.ts` → `submitSignupOrder` (line 233)
- **How amount is derived:** Computed from `orderTicketSelections`:
  ```ts
  // convex/signupSubmission.ts:733-736
  const totalAmountMinor = ticketSelections.reduce(
    (sum, ts) => sum + ts.pricePerTicketMinor * ts.quantity,
    0
  )
  ```
- **Stored in:** `orders.totalAmountMinor`
- **Key point:** For internal orders, the total IS computed from ticket selections × prices.

### Tables/fields involved

| Table                   | Field                                    | Purpose                                                      |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `orders`                | `totalAmountMinor`                       | **Primary source of truth** for order total                  |
| `orderTicketSelections` | `ticketTypeId`, `quantity`, `attendeeId` | Links attendees to ticket types (quantity is always 1)       |
| `ticketTypes`           | `priceMinor`, `label`                    | Price per ticket type                                        |
| `ticketTailorOrders`    | `rawPayload`                             | Contains original Ticket Tailor amount in `rawPayload.total` |

### Verdict

**`orders.totalAmountMinor` is the authoritative field.** It is NOT recalculated from ticket types × quantities at read time. For Ticket Tailor orders, the amount comes from the provider. For internal orders, it's computed at write time from selections.

---

## 2. Outstanding Amount Per Attendee

### Queries that calculate per-attendee outstanding

**YES — two domain-level functions compute per-attendee outstanding amounts:**

#### `getAttendeeLedger` (`lib/domain/finance/attendees.ts`)

- **Lines 142-157:** `deriveAttendeeOutstandingAmount` splits order-level outstanding across attendees:
  ```ts
  function deriveAttendeeOutstandingAmount(
    orderOutstandingAmountMinor: number,
    attendeeCount: number,
    attendeePosition: number
  ) {
    if (orderOutstandingAmountMinor <= 0) return 0
    const baseAmount = Math.floor(orderOutstandingAmountMinor / attendeeCount)
    const remainder = orderOutstandingAmountMinor % attendeeCount
    return baseAmount + (attendeePosition < remainder ? 1 : 0)
  }
  ```
- **Lines 130-139:** `deriveOrderOutstandingAmount` determines order-level outstanding:
  ```ts
  function deriveOrderOutstandingAmount(
    status,
    totalAmountMinor,
    matchedAmountMinor
  ) {
    if (status !== "pending" && status !== "cancelled") return 0
    return Math.max(0, totalAmountMinor - matchedAmountMinor)
  }
  ```
- **Important:** Only `pending` and `cancelled` orders have outstanding amounts. `paid`/`refunded` orders return 0.

#### `getAttendeeDetail` (`lib/domain/finance/attendee-detail.ts`)

- **Lines 153-166:** `deriveOutstandingAmount` for a single attendee's order:
  ```ts
  function deriveOutstandingAmount({
    normalizedStatus,
    totalAmountMinor,
    paidAmountMinor,
  }) {
    if (normalizedStatus === "paid" || normalizedStatus === "refunded") return 0
    return Math.max(0, totalAmountMinor - paidAmountMinor)
  }
  ```
- **Lines 243-259:** Computes `paidAmountMinor` from matched payments, then derives outstanding/overpaid.

### How payments are matched to orders for outstanding calculation

- `lib/domain/finance/matched-payments.ts` → `buildMatchedTotalsByProviderOrderId`
- Sums all payments with status `manual_assignment` or `auto_matched` (line 4)
- Groups by `providerOrderId` (not Convex `_id`)
- For legacy payments where `orderId` is a Convex ID, it fetches the order to resolve `providerOrderId`

### What's MISSING

- **No per-attendee ticket-type-specific outstanding.** The attendee ledger splits the order total evenly across attendees (with remainder distribution). It does NOT consider that attendee A might have a $50 ticket and attendee B a $100 ticket.
- **No query that computes outstanding from `orderTicketSelections` × `ticketTypes.priceMinor`.** The system always uses `orders.totalAmountMinor` as the basis.
- **`getOrderWithAttendees` (`convex/orders.ts:830-898`)** hardcodes `ticketTypeLabel: "-"` and `normalizedStatus: "pending"` for all attendees — it does NOT look up actual ticket types or payment status per attendee.

---

## 3. Payment Reconciliation

### Tables involved

| Table                    | Role                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `orders`                 | Core order with `totalAmountMinor`, `status`                      |
| `ticketTailorOrders`     | Extension with `normalizedStatus`, `rawPayload`, visibility flags |
| `payments`               | Unified payment table (source: `tikkie`/`bank_transfer`/`cash`)   |
| `tikkiePayments`         | Tikkie-specific payment records (separate from `payments`)        |
| `tikkiePaymentLinks`     | Payment request links with amounts and status                     |
| `tikkiePaymentTemplates` | Templates mapping ticket types to amounts                         |

### Reconciliation flow

**Step 1: Orders are fetched**

- `convex/orders.ts` → `getOrdersForReconciliation` (line 680)
- Returns order ledger rows with `totalAmountMinor`, `normalizedStatus`, `providerOrderId`

**Step 2: Matched payment totals are computed**

- `lib/domain/finance/matched-payments.ts` → `buildMatchedTotalsByProviderOrderId`
- Fetches all `payments`, filters to `manual_assignment` + `auto_matched` statuses
- Sums `amountMinor` per `providerOrderId`

**Step 3: Reconciliation reasons are derived**

- `lib/domain/finance/reconciliation.ts` → `deriveReconciliation` (line 90)
- **Reasons flagged:**
  - `"pending-payment"`: Order status is `pending` → `outstandingMinor = totalAmountMinor - matchedAmountMinor`
  - `"cancelled-with-amount"`: Order is `cancelled` but `totalAmountMinor > 0`
  - `"missing-amount"`: `totalAmountMinor` is null
  - `"refund-without-refunded-at"`: Order is `refunded` but no `refundedAt` timestamp

**Step 4: Orders with reasons are surfaced**

- Only orders with ≥1 reconciliation reason appear in the reconciliation view
- Orders that are `paid` with full matching payments are NOT flagged

### How "paid vs unpaid" is determined

**At the order level** (`convex/orders.ts` → `getOrderPaymentStatus`, line 900):

```ts
const orderTotal = order.totalAmountMinor ?? 0
const paidAmount = paymentsByOrder[order._id] ?? 0

if (paidAmount === 0) statusCounts.unassigned++
else if (paidAmount >= orderTotal) {
  if (paidAmount > orderTotal) statusCounts.overpaid++
  else statusCounts.paid++
} else statusCounts.partial++
```

**At the per-order summary level** (`convex/payments.ts` → `getPaymentSummary`, line 387):

```ts
const totalPaid = orderPayments
  .filter(
    (p) => p.status === "auto_matched" || p.status === "manual_assignment"
  )
  .reduce((sum, p) => sum + p.amountMinor, 0)
return { totalPaid, orderTotal, remaining: orderTotal - totalPaid }
```

### Auto-matching logic

**`convex/payments.ts` → `autoMatchPayments` (line 294):**

1. Fetches all unassigned payments
2. Builds lookup: normalized booker name → order
3. Matches on **exact payer name + exact amount** against `order.totalAmountMinor`
4. Fallback: matches against attendee names + exact amount

**`convex/tikkie.ts` → `autoMatchTikkiePayments` (line 540):**

1. Same logic but for `tikkiePayments` table
2. Matches on booker name (unique match) or attendee name + exact amount

### What's MISSING

- **No reconciliation for `tikkiePayments` table.** The reconciliation flow only uses the `payments` table. `tikkiePayments` has its own `matchStatus` (`unmatched`/`auto_matched`/`manual`) but is not included in the reconciliation report.
- **No partial payment tracking at the order level.** The system sums all matched payments but doesn't track which specific payments contribute to which portion of the order.
- **No webhook-driven auto-reconciliation.** Tikkie webhooks update link status but don't automatically create `payments` records or match them.

---

## 4. Revenue Reporting

### Aggregate financial queries

#### `getRevenueOverview` (`lib/domain/finance/reporting.ts`)

- **Endpoint:** `GET /api/dashboard/revenue`
- **Data source:** `api.orders.getOrdersForReconciliation` (same as reconciliation)
- **Metrics computed:**
  - `grossMinor`: Sum of ALL order `totalAmountMinor` values
  - `paidMinor`: Sum of orders with `normalizedStatus === "paid"`
  - `refundedMinor`: Sum of orders with `normalizedStatus === "refunded"`
  - `netMinor`: `paidMinor - refundedMinor`
- **Trend:** Daily buckets by `orderedAt` date
- **Status counts:** Count of orders per status (paid/refunded/cancelled/pending)

#### `getOrderPaymentStatus` (`convex/orders.ts:900-1019`)

- **Metrics:**
  - Order counts by payment status (unassigned/partial/paid/overpaid)
  - Total collected amount across all orders
  - Payment counts by source (tikkie/bank_transfer/cash)
  - Legacy payment status counts (unassigned/ambiguous/manual_assignment/auto_matched)

#### `getOrderCount` (`convex/orders.ts:625-678`)

- Simple count of orders with filtering (eventId, date range, status)

#### `getOrdersWithFilters` (`convex/orders.ts:550-623`)

- Paginated order listing with `totalAmountMinor` per row
- Used by the order ledger UI

### What's MISSING

- **No revenue by ticket type.** Cannot answer "how much revenue came from VIP tickets vs standard tickets?"
- **No revenue by event with payment status breakdown.** The revenue overview aggregates across all statuses but doesn't show per-event paid vs outstanding.
- **No cash flow timeline.** No query showing when payments were actually received vs when orders were placed.
- **No profit/loss calculation.** No accommodation costs or expenses are tracked against revenue.
- **No currency conversion.** If events use different currencies, there's no normalization.

---

## 5. Ticket Pricing

### How ticket prices are stored

**`ticketTypes` table** (`convex/schema.ts:91-112`):

```ts
ticketTypes: defineTable({
  eventId: v.id("events"),
  label: v.string(),
  priceMinor: v.number(), // Price in minor currency units (cents)
  maxQuantity: v.optional(v.number()),
  soldCount: v.optional(v.number()),
  isActive: v.boolean(),
  visibility: v.union(v.literal("public"), v.literal("hidden")),
  availabilityState: v.union(v.literal("selectable"), v.literal("unavailable")),
  unavailableReason: v.optional(v.string()),
  updatedAt: v.number(),
})
```

### How prices are linked to attendees

**Link chain:** `orderAttendees` → `orderTicketSelections` → `ticketTypes`

```
orderAttendees._id ──→ orderTicketSelections.attendeeId
                                  ↓
                    orderTicketSelections.ticketTypeId ──→ ticketTypes._id
                                                                  ↓
                                                          ticketTypes.priceMinor
                                                          ticketTypes.label
```

### Price override mechanism

**`ticketTailorAttendees.tikkieAmountOverrideMinor`** (`convex/schema.ts:346`):

- Allows per-attendee price override for Tikkie payment link generation
- Used in `lib/domain/finance/tikkie-templates.ts` → `matchTemplateForAttendee`
- Priority: override > template > default

### Tikkie templates

**`tikkiePaymentTemplates` table** (`convex/schema.ts:392-403`):

```ts
tikkiePaymentTemplates: defineTable({
  eventId: v.string(),
  ticketTypeLabel: v.string(),
  amountMinor: v.number(),
  descriptionTemplate: v.string(),
  expiryDays: v.optional(v.number()),
  isActive: v.optional(v.boolean()),
})
```

- Maps `(eventId, ticketTypeLabel)` → `amountMinor` for Tikkie link generation
- Created/managed via `convex/tikkie.ts` → `createPaymentTemplate`

### What's MISSING

- **`orderTicketSelections` are NOT populated for Ticket Tailor orders.** The sync flow (`convex/sync/orders.ts`) creates orders and `ticketTailorAttendees` but never creates `orderTicketSelections` records. This means:
  - `getAttendeesWithTickets` (`convex/attendees.ts:104`) only works for internal orders
  - Ticket Tailor attendee ticket types come from `ticketTailorAttendees.ticketTypeLabel` (a string copy), not from a live join to `ticketTypes`
  - There is no way to compute "what did this Ticket Tailor attendee's ticket cost?" from the local database
- **`ticketTypes.soldCount` is never updated.** It exists in the schema but no code increments it.
- **No price history.** If a ticket type's price changes, there's no record of what past orders paid.

---

## Summary of Gaps

| Gap                                                           | Impact                                                    | Severity |
| ------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| `orderTicketSelections` not populated for TT orders           | Cannot compute per-attendee ticket cost for synced orders | High     |
| Per-attendee outstanding is evenly split, not per-ticket-type | Financial follow-up may request wrong amounts             | Medium   |
| `tikkiePayments` excluded from reconciliation                 | Double-payment tracking is incomplete                     | Medium   |
| No revenue by ticket type                                     | Cannot analyze which ticket types drive revenue           | Low      |
| `ticketTypes.soldCount` never updated                         | Inventory tracking is inaccurate                          | Low      |
| `getOrderWithAttendees` hardcodes ticket type as `"-"`        | Order detail page shows no ticket type info               | Medium   |
| No partial payment line-item tracking                         | Cannot audit which payments cover which amounts           | Low      |
