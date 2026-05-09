# Code Quality Review: Convex Payments Layer

**Analysis Date:** 2026-05-09

---

## CRITICAL ISSUES

### 1. `internalAssignPaymentToOrder` Missing `eventId` Propagation

**File:** `convex/payments.ts`
**Lines:** 618-623 (internal mutation) vs 354-360 (public mutation)

**Problem:** The internal mutation does NOT propagate `eventId` from the order to the payment, while the public `assignPaymentToOrder` does.

```typescript
// Public mutation (lines 354-360) - CORRECT
const order = await ctx.db.get("orders", canonicalOrderId)
await ctx.db.patch("payments", args.paymentId, {
  orderId: canonicalOrderId,
  eventId: order?.eventId,  // ✅ Sets eventId
  ...
})

// Internal mutation (lines 618-623) - BUG: Missing eventId
await ctx.db.patch("payments", args.paymentId, {
  orderId: canonicalOrderId,
  // ❌ eventId is NOT set!
  ...
})
```

**Impact:** If `internalAssignPaymentToOrder` is used (e.g., by cron jobs), payments will be assigned to orders but their `eventId` will remain stale/undefined. This breaks event-based payment queries.

**Fix:** Add `eventId: (await ctx.db.get("orders", canonicalOrderId))?.eventId` to the patch in `internalAssignPaymentToOrder`.

---

### 2. `unassignPayment` Does Not Clear `eventId`

**File:** `convex/payments.ts`
**Lines:** 371-376

**Problem:** When a payment is unassigned, `eventId` is NOT cleared. If a payment was assigned to Order A (which had `eventId: X`), then unassigned, and later assigned to Order B (which has `eventId: Y`), the payment would incorrectly retain `eventId: X`.

```typescript
// Current (lines 371-376)
await ctx.db.patch("payments", args.paymentId, {
  orderId: undefined,
  // ❌ eventId: undefined is MISSING
  status: "unassigned",
  matchedAt: undefined,
  matchedBy: undefined,
})
```

**Impact:** Event-linked payments could "fall through cracks" — appearing under the wrong event after reassignment.

**Fix:** Add `eventId: undefined` to the patch call.

---

## MODERATE ISSUES

### 3. `internalUpsertTikkiePayment` Missing `eventId` in Insert

**File:** `convex/payments.ts`
**Lines:** 573-582

**Problem:** When `internalUpsertTikkiePayment` creates a new payment, it does not set `eventId`. The public `upsertTikkiePayment` also doesn't set `eventId` (which is expected for Tikkie since they're created before being linked), but this is more problematic for the internal version if it's used in automation.

```typescript
// Lines 573-582 - Missing eventId in insert
const id = await ctx.db.insert("payments", {
  source: "tikkie",
  sourceId: args.sourceId,
  // eventId not set
  status: "unassigned",
  ...
})
```

**Impact:** New Tikkie payments created via internal automation won't be queryable by `eventId` index until they're manually assigned.

**Note:** This may be intentional for the Tikkie flow where payments are created first and linked later. However, if there's any automation that creates Tikkie payments without subsequent assignment, they will have no `eventId`.

---

### 4. Duplicate Order Lookup in App-Layer Wrappers

**File:** `lib/domain/finance/payments.ts`
**Lines:** 194-197, 236-239

**Problem:** `createBankTransferPayment` and `createCashPayment` call `resolveCanonicalOrderId` to get the order ID, then immediately query the order again to get `eventId`:

```typescript
// Lines 194-197
const canonicalOrderId = await resolveCanonicalOrderId(input.orderId)
const order = await convexQuery(api.orders.getOrderById, {  // Redundant query
  orderId: String(canonicalOrderId),
})
// Then uses order?.eventId when calling createPayment
```

**Impact:** Extra round-trip to Convex for every payment creation. The Convex layer already handles `eventId` inference (lines 268-272 in `convex/payments.ts`).

**Fix:** Remove the redundant order lookup. The Convex `createPayment` already derives `eventId` from the order when not provided.

---

### 5. No Internal Mutation for `markPaymentAsDonation`

**File:** `convex/payments.ts`

**Problem:** `markPaymentAsDonation` is public (requires auth) but there's no `internalMarkPaymentAsDonation`. If automated processes need to convert payments to donations, they must use the authenticated mutation.

**Impact:** Limitations in automation workflows that need to convert payments to donations without user context.

---

### 6. `loadMatchedPaymentTotalsByOrderId` Uses Full Table Scan

**File:** `convex/finance.ts`
**Line:** 93

**Problem:**
```typescript
const payments = (await ctx.db.query("payments").take(2000))  // Full table scan
```

This function takes up to 2000 payments without using indexes, then filters in-memory.

**Impact:** Performance degrades as the payments table grows. Should use indexed queries like `orderId` or `status` indexes.

**Current filtering logic (lines 110-118):**
```typescript
for (const payment of payments) {
  if (
    !payment ||
    (payment.status !== "auto_matched" && payment.status !== "manual_assignment") ||
    !Number.isFinite(payment.amountMinor) ||
    payment.amountMinor <= 0
  ) {
    continue
  }
  ...
}
```

**Fix:** Use indexed queries per order instead of a global scan:
```typescript
for (const order of orders) {
  const payments = await ctx.db
    .query("payments")
    .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
    .take(100)
  // filter and sum...
}
```

---

## MINOR ISSUES / OBSERVATIONS

### 7. Type Redefinition in App Layer

**File:** `lib/domain/finance/payments.ts`
**Lines:** 16-23

```typescript
// Redefines types already in lib/types/payment.ts
export type PaymentSource = "tikkie" | "bank_transfer" | "cash"
export type PaymentMatchStatus = ...
```

**Recommendation:** Import from `lib/types/payment.ts` instead of redefining.

---

### 8. Incomplete Status Enum in `loadMatchedPaymentTotalsByOrderId`

**File:** `convex/finance.ts`
**Lines:** 31-33

```typescript
type MatchedPaymentRecord = {
  status?: "auto_matched" | "manual_assignment" | "ambiguous" | "unassigned" | null
  // ❌ Missing "donation" - though donations shouldn't reach this function
}
```

**Note:** The `donation` status is intentionally excluded because donations have `orderId: undefined` per the `markPaymentAsDonation` handler. However, the type should probably include it for completeness.

---

## VALIDATION: `donation` Status Handling

The new `donation` status is:
- ✅ Defined in schema (`convex/schema.ts` line 591)
- ✅ Defined in validators (`lib/types/payment.ts` line 23)
- ✅ Handled in `markPaymentAsDonation` with early return for idempotency (`convex/payments.ts` lines 395-397)
- ✅ Excluded from `totalPaid` calculation in `getPaymentSummary` (lines 516-518) — correct behavior
- ✅ `eventId` is properly set when marking as donation (line 410)
- ⚠️ `eventId` not cleared when unassigning (line 372) — see Issue #2

---

## VALIDATION: `eventId` Propagation

| Mutation | Sets `eventId`? | Clears `eventId`? |
|----------|----------------|-------------------|
| `createPayment` | ✅ Derived from order (line 275) | N/A |
| `upsertTikkiePayment` | ❌ Not set (may be intentional) | N/A |
| `assignPaymentToOrder` | ✅ From order (line 356) | N/A |
| `internalAssignPaymentToOrder` | ❌ **MISSING** | N/A |
| `unassignPayment` | N/A | ❌ **MISSING** |
| `markPaymentAsDonation` | ✅ From args/order/payment (line 410) | Clears `orderId` instead |
| `autoMatchPayments` | ✅ From order (line 483) | N/A |

---

## SUMMARY

| Severity | Issue | File | Lines |
|----------|-------|------|-------|
| **CRITICAL** | Internal mutation missing `eventId` | `convex/payments.ts` | 618-623 |
| **CRITICAL** | `unassignPayment` doesn't clear `eventId` | `convex/payments.ts` | 371-376 |
| **MODERATE** | `internalUpsertTikkiePayment` missing `eventId` on insert | `convex/payments.ts` | 573-582 |
| **MODERATE** | Redundant order lookup in app wrappers | `lib/domain/finance/payments.ts` | 194-197, 236-239 |
| **MODERATE** | No `internalMarkPaymentAsDonation` | `convex/payments.ts` | N/A |
| **MODERATE** | Full table scan in `loadMatchedPaymentTotalsByOrderId` | `convex/finance.ts` | 93 |
| **MINOR** | Type redefinition | `lib/domain/finance/payments.ts` | 16-23 |

---

*Review completed: 2026-05-09*
