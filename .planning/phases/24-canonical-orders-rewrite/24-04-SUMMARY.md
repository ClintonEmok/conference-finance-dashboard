---
phase: 24-canonical-orders-rewrite
plan: 04
subsystem: payments
tags: [convex, payments, orders, canonical-orders]

# Dependency graph
requires:
  - phase: 24-01
    provides: Core orders table schema (orders, orderAttendees)
provides:
  - Payment matching reads from core orders table
  - Updated type references to Id<"orders">
  - Auto-match queries use indexed reads on orders table
affects:
  - convex/autoSync.ts (calls internalAssignPaymentToOrder)
  - convex/sync.ts (internal mutations)
  - Reconciliation UI (payment matching)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Core table reads for payment matching"
    - "v.id('orders') for orderId parameters"
    - "Indexed queries with .withIndex()"

key-files:
  created: []
  modified:
    - convex/payments.ts - Updated to read from orders and orderAttendees tables

key-decisions:
  - "Payment matching now reads from core orders table instead of ticketTailorOrders"
  - "orderAttendees fetched by orderId (no direct eventId field)"
  - "orderId parameters use v.id('orders') for type safety"

patterns-established:
  - "Payment matching: Query orders by event, then attendees by orderId"
  - "Type safety: Use v.id('orders') for order references in mutations"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-31
---

# Phase 24 Plan 04: Payment Matching Core Table Migration Summary

**Payment matching updated to read from canonical orders table with indexed queries and proper type safety.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T10:57:33Z
- **Completed:** 2026-03-31T11:05:04Z
- **Tasks:** 1
- **Files modified:** 1 (plus generated types)

## Accomplishments

- Updated `autoMatchPayments` mutation to query core `orders` table instead of `ticketTailorOrders`
- Changed buyer name references to `bookerName` (per D-11 decision)
- Updated attendee fetching to use `orderAttendees` table with `by_orderId` index
- Modified `getPaymentSummary` to normalize and read from `orders` table
- Updated `assignPaymentToOrder` and `internalAssignPaymentToOrder` to use `v.id("orders")` for type safety
- All queries use `.withIndex()` for performance (D-34 compliance)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update payments.ts to read orders from core table** - `6e25479` (feat)

## Files Created/Modified

- `convex/payments.ts` - Core payment matching logic updated to use orders table
- `convex/_generated/api.d.ts` - Regenerated Convex types

## Decisions Made

1. **Attendee fetching strategy:** Since `orderAttendees` has no direct `eventId` field (unlike `ticketTailorAttendees`), attendees are fetched per-order after retrieving the order list. This maintains bounded reads while adapting to the core table structure.

2. **orderId type safety:** Changed from `v.string()` to `v.id("orders")` in mutation args to enforce type safety at the API boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **LSP type errors initially:** The IDE showed stale type errors after schema changes. Resolved by running `npx convex codegen` to regenerate TypeScript bindings from the updated schema.

- **Attendee query structure change:** The original code queried `ticketTailorAttendees` by `eventId`, but `orderAttendees` only has `orderId`. Updated to fetch attendees per-order after getting the order list.

## Next Phase Readiness

- Payment matching is now fully migrated to core orders table
- Ready for downstream consumer updates (accommodation.ts, tikkie.ts if needed)
- All payment-related queries use proper indexing
- Type safety enforced for order references

---

_Phase: 24-canonical-orders-rewrite_
_Completed: 2026-03-31_
