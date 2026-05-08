# Codebase Concerns

**Analysis Date:** 2026-04-21

## Tech Debt

**[N1] Naming Inconsistency: `bookerName` vs `buyerName`**

- **Issue:** Database schema uses `bookerName`/`bookerEmail` (in `convex/schema.ts` lines 143-144, `convex/orders.ts` lines 284-285, 343-344), but API responses and UI components use `buyerName`/`buyerEmail`.
- **Files:**
  - `convex/schema.ts` - defines `bookerName`/`bookerEmail` in orders table
  - `convex/orders.ts` - mutations accept `buyerName`/`buyerEmail` args but store as `bookerName`/`bookerEmail` (lines 269-270, 321-322, 284-285, 343-344)
  - `lib/domain/finance/order-ledger.ts` - uses `buyerName`/`buyerEmail` in `OrderLedgerRow` type (lines 29-30)
  - `lib/domain/finance/attendee-detail.ts` - uses `buyerName`/`buyerEmail` (lines 43-44, 109-110)
  - `app/dashboard/attendees/[attendeeId]/page.tsx` - uses `buyerName`/`buyerEmail` in type (lines 51-52)
  - `app/dashboard/orders/page.tsx` - uses `buyerName` in row display (line 451)
- **Impact:** Confusion about which field name to use. Risk of bugs if someone reads from the wrong field. The mapping layer (buyerName = bookerName) works but obscures intent.
- **Fix approach:** Standardize on one naming convention. Recommended: keep `buyerName`/`buyerEmail` as the canonical API/UI names and migrate the database schema to match.

**[N2] Incomplete Field Synchronization in `updateAttendee` Mutation**

- **Issue:** The `updateAttendee` mutation (`convex/attendees.ts` lines 515-638) updates both core `orderAttendees` table and `ticketTailorAttendees` extension, but certain fields only update one side.
- **Files:**
  - `convex/attendees.ts` - `updateAttendee` mutation (lines 515-638)
  - `app/api/dashboard/attendees/[attendeeId]/route.ts` - PATCH handler (lines 87-204)
- **Edge case:** If `name` or `email` is updated via the mutation, it updates both tables, but the PATCH API endpoint only exposes `genderType` and `tikkieAmountOverrideMinor` for editing (lines 108-111, 131-143). This means backend capabilities exceed frontend exposure.
- **Impact:** Future frontend edits to `name`/`email` would require adding to the PATCH endpoint; currently impossible via REST API.
- **Fix approach:** Either expand PATCH endpoint to allow `name`/`email` editing, or explicitly document that these fields are read-only from the dashboard.

**[N3] Payment-to-Order Status Synchronization Gap**

- **Issue:** Order `normalizedStatus` (paid/pending/refunded/cancelled) is set independently from payment matching. When payments are auto-matched or manually assigned, the order's `normalizedStatus` does not automatically update.
- **Files:**
  - `convex/orders.ts` - `updateOrderStatus` mutation (lines 401-437)
  - `lib/domain/finance/attendee-detail.ts` - payment calculation using `buildMatchedTotalsByProviderOrderId` (lines 282-293)
  - `lib/domain/finance/payments.ts` - payment listing
- **Edge case:** An order with `normalizedStatus: "pending"` could have all payments matched (paid in full). The order status does not auto-transition to "paid". Conversely, an order marked "paid" could have payments un-matched, but status remains "paid".
- **Risk:** Dashboard displays "pending" orders that are actually paid via Tikkie, causing confusion in reconciliation.
- **Fix approach:** Add automatic status transition logic when payment matching state changes, or document that `normalizedStatus` is authoritative only when manually set.

**[N4] `amountDueMinor` Calculation Relies on `orderTicketSelections` Existence**

- **Issue:** `loadOrderAmountDueBreakdowns` (`convex/finance.ts` lines 29-81) calculates `amountDueMinor` from `orderTicketSelections` joined with `ticketTypes`. If these records are missing or orphaned, the calculation falls back to `order.totalAmountMinor`.
- **Files:**
  - `convex/finance.ts` - `loadOrderAmountDueBreakdowns` (lines 29-81)
  - `lib/domain/finance/amounts.ts` - `deriveOrderAmountBreakdown`
  - `convex/orders.ts` - fallback usage (lines 700-703, 1016)
- **Edge case:** Manual orders created without `orderTicketSelections` will show `amountDueMinor` as `totalAmountMinor`. Integration orders that have selections deleted will revert to `totalAmountMinor`.
- **Risk:** Inconsistent `amountDueMinor` between integration and manual orders.
- **Fix approach:** Ensure all order creation paths populate `orderTicketSelections`, or validate data consistency.

## Known Bugs

**[B1] Debug `console.log` Left in Production Code**

- **Symptoms:** `console.log("Payment progress:", paymentProgress, { paid, due })` at line 198 in `app/dashboard/attendees/[attendeeId]/page.tsx`
- **Files:** `app/dashboard/attendees/[attendeeId]/page.tsx` (line 198)
- **Trigger:** Any visit to the attendee detail page
- **Workaround:** Remove before production deployment

**[B2] Attendee `name` Can Be "Unnamed attendee" Fallback**

- **Symptoms:** In `getOrderWithAttendees` query (`convex/orders.ts` line 1032), if attendee name is null, it defaults to "Unnamed attendee". This same fallback doesn't exist in other queries.
- **Files:** `convex/orders.ts` (line 1032)
- **Edge case:** Creates inconsistency: some places show "Unnamed attendee", others show empty string or null
- **Fix approach:** Standardize null handling for attendee names across all queries

## Security Considerations

**[S1] `as any` Cast in Attendee Update Path**

- **Risk:** In `app/api/dashboard/attendees/[attendeeId]/route.ts` line 166, the mutation call uses `as any` to bypass TypeScript checking: `await convexMutation(api.attendees.updateAttendee as any, mutationArgs)`
- **Files:** `app/api/dashboard/attendees/[attendeeId]/route.ts` (line 166)
- **Current mitigation:** Input validation is performed before calling the mutation (lines 108-164)
- **Recommendations:** Define proper TypeScript types for `mutationArgs` to avoid `as any`

## Performance Bottlenecks

**[P1] N+1 Query Pattern in `getAttendeeDetail`**

- **Problem:** `getAttendeeDetail` (`lib/domain/finance/attendee-detail.ts`) makes many sequential `convexQuery` calls even when data could be parallelized.
- **Files:** `lib/domain/finance/attendee-detail.ts` (lines 196-250)
- **Cause:** Sequential awaits instead of `Promise.all` for independent queries
- **Improvement path:** Restructure to parallelize all `convexQuery` calls that don't depend on each other

**[P2] Unbounded Payment Queries**

- **Problem:** `getOrderPaymentStatus` query (`convex/orders.ts` line 1088) does `payments.take(1000)` without pagination. As payments grow, this will degrade.
- **Files:** `convex/orders.ts` (line 1088)
- **Cause:** Need all payments to calculate totals
- **Improvement path:** Add indexed aggregation or maintain running totals on orders table

## Fragile Areas

**[F1] Order Visibility Filtering Duplication**

- **Files:**
  - `convex/orders.ts` - `isOrderRemoved()` (lines 14-16), `isOrderVisible()` (lines 18-20), `isInternalEvent()` (lines 585-594)
  - `convex/attendees.ts` - `resolveAttendeeRecordByStringId()` pattern
- **Why fragile:** Visibility logic is scattered across multiple files. `isOrderRemoved` checks `removedAt` on extension, but visibility also depends on `isInternalEvent` which checks event `primarySourceKind`. Missing any condition causes ghost orders to appear or real orders to disappear.
- **Safe modification:** Add tests for visibility edge cases before modifying filtering logic.
- **Test coverage:** No explicit unit tests for `isOrderRemoved` or `isInternalEvent`

**[F2] Provider ID Lookup Chain in Payment Matching**

- **Files:**
  - `lib/domain/finance/attendee-detail.ts` - `legacyLookupCache` pattern (lines 338-379)
  - `lib/domain/finance/matched-payments.ts` - `buildMatchedTotalsByProviderOrderId`
- **Why fragile:** When a payment has an `orderId` that doesn't match by direct comparison, the code falls back to `getOrderById` to find `providerOrderId`. This creates a cache but the cache is per-call, not persistent.
- **Safe modification:** Ensure tests cover the fallback path with mock data.

## Scaling Limits

**[L1] Order Query Cap at 500**

- **Current capacity:** Most order queries use `.take(500)` as a safety limit
- **Limit:** Events with >500 orders cannot be fully displayed in ledger/reconciliation
- **Files:** `convex/orders.ts` - lines 99, 103, 201, 542, 743, 815, 911
- **Scaling path:** Add proper pagination with cursor-based navigation instead of offset

**[L2] In-Memory Date Filtering**

- **Current capacity:** Date range filtering on `orderedAt` happens in-memory after fetching up to 500 records
- **Limit:** Cannot filter by date range across all events efficiently
- **Files:** `convex/orders.ts` - lines 541-543, 818-823
- **Scaling path:** Index `orderedAt` field or use pre-aggregated tables

## Test Coverage Gaps

**[T1] No Tests for Attendee PATCH Endpoint**

- **What's not tested:** `PATCH /api/dashboard/attendees/[attendeeId]` endpoint
- **Files:** `app/api/dashboard/attendees/[attendeeId]/route.ts` (lines 87-204)
- **Risk:** Changes to the PATCH logic (input validation, mutation call) could break silently
- **Priority:** Medium

**[T2] No Tests for Payment-to-Order Status Synchronization**

- **What's not tested:** Integration between payment assignment and order `normalizedStatus` updates
- **Edge case gap:** What happens when payments are un-matched from an order?
- **Priority:** High (affects reconciliation accuracy)

**[T3] No Tests for `loadOrderAmountDueBreakdowns` Edge Cases**

- **What's not tested:** Behavior when `orderTicketSelections` is empty, or when `ticketType` is missing
- **Files:** `convex/finance.ts` (lines 29-81)
- **Risk:** Fallback behavior may not be consistent across all call sites
- **Priority:** Medium

**[T4] Minimal Convex Function Tests**

- **Observation:** Tests in `tests/convex/` and `tests/finance/` are heavily mocked and don't exercise actual Convex runtime behavior
- **Risk:** Mock-based tests may not catch runtime differences between convex and local execution
- **Priority:** Low (integration tests would require Convex test runner)

---

*Concerns audit: 2026-04-21*
