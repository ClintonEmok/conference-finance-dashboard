---
phase: 17-fix-critical-code-review-issues
plan: "09"
subsystem: database
tags: [convex, pagination, performance, types, indexes]

# Dependency graph
requires:
  - phase: 17-08
    provides: Atomic payment matching, Tikkie quota enforcement, CSV archive fields
provides:
  - Bounded reads replacing all .collect() in hot-path Convex functions
  - Cursor-based pagination for growing result sets (attendees, payments)
  - New schema indexes for payments.paidAt and tikkiePaymentLinks.linkType
  - Shared type definitions in lib/types/* for payment, order, attendee, accommodation, tikkie
affects:
  - phase: 18 (Schema + Canonical Contracts — types now centralized)
  - phase: 19 (Public Signup Pages — attendee types extracted)
  - phase: 21 (Finance Integration — payment/order types extracted)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "paginationOptsValidator + .paginate() for growing Convex result sets"
    - ".take(N) for intentionally bounded reads with documented limits"
    - ".first() for single-result indexed lookups instead of .collect()[0]"
    - "Shared Convex validators in lib/types/* for cross-layer type contracts"

key-files:
  created:
    - lib/types/payment.ts
    - lib/types/order.ts
    - lib/types/attendee.ts
    - lib/types/accommodation.ts
    - lib/types/tikkie.ts
    - lib/types/shared.ts
  modified:
    - convex/attendees.ts
    - convex/orders.ts
    - convex/payments.ts
    - convex/tikkie.ts
    - convex/accommodation.ts
    - convex/schema.ts

key-decisions:
  - "Use .take(N) for intentionally bounded reads where pagination is not appropriate (config tables, lookup queries, capacity checks)"
  - "Use paginationOptsValidator + .paginate() for growing user-facing list queries (getAttendees, getPayments)"
  - "Import shared validators from lib/types/* in Convex functions to avoid duplication"
  - "Add paidAt and linkType indexes for date-range and type-filtered queries"

patterns-established:
  - "Convex read pattern: .first() for single-result, .take(N) for bounded, .paginate() for growing"
  - "Shared validator library: lib/types/* exports Convex v.* validators for cross-layer reuse"

requirements-completed: []

# Metrics
duration: 28min
completed: 2026-03-29
---

# Phase 17 Plan 09: Paginate and Bound Convex Reads Summary

**All .collect() hot-path reads replaced with indexed cursor-based pagination, bounded .take(N), or .first() single-result lookups, plus shared type extraction into lib/types/**

## Performance

- **Duration:** 28 min
- **Started:** 2026-03-29T00:38:36Z
- **Completed:** 2026-03-29T01:06:59Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Eliminated all `.collect()` calls across 5 Convex hot-path files (attendees, orders, payments, tikkie, accommodation)
- Added cursor-based pagination via `paginationOptsValidator` to `getAttendees` and `getPayments` queries
- Replaced unbounded table scans with indexed queries (`getPaymentSummary` now uses orderId index, `getUnassignedPayments` now uses status index)
- Added `payments.paidAt` and `tikkiePaymentLinks.linkType` schema indexes
- Extracted shared Convex validators into 6 `lib/types/*` files for cross-layer type reuse

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace .collect() with bounded reads and pagination** - `33fc8ca` (fix)
2. **Task 2: Add missing schema indexes** - `4ca780d` (fix)
3. **Task 3: Extract shared types into lib/types** - `0e16d06` (refactor)

**Plan metadata:** `pending` (docs: complete plan)

## Files Created/Modified

- `convex/attendees.ts` — Pagination support for getAttendees, .first() for upsert lookup, .take(100) for order-based reads
- `convex/orders.ts` — .first() for provider-order lookups, .take(500) for event queries, .take(100) for attendee sub-queries
- `convex/payments.ts` — Indexed status query for getUnassignedPayments, orderId-indexed getPaymentSummary, .first() for upserts
- `convex/tikkie.ts` — .first() for token-based lookups, .take(500) for quota check, .take(500) for payment link listing
- `convex/accommodation.ts` — .take(N) for all inventory/config queries, capacity+1 bounded occupancy checks
- `convex/schema.ts` — Added `payments.paidAt` and `tikkiePaymentLinks.linkType` indexes
- `lib/types/payment.ts` — PaymentSource, PaymentStatus, paymentDocValidator
- `lib/types/order.ts` — CanonicalOrderStatus, orderLedgerRowValidator, orderSearchRowValidator
- `lib/types/attendee.ts` — GenderType, AllocationPriority validators
- `lib/types/accommodation.ts` — RoomAvailability type, TikkieLinkStatus/TikkieMatchStatus
- `lib/types/tikkie.ts` — TikkieLinkStatus, TikkieMatchStatus, TikkieLinkType, TikkieStatusSource
- `lib/types/shared.ts` — PaginatedResult, ApiError, AmountMinor, IsoTimestamp

## Decisions Made

- Use `.take(N)` for intentionally bounded reads where pagination is not appropriate (config tables, lookup queries, capacity checks)
- Use `paginationOptsValidator` + `.paginate()` for growing user-facing list queries
- Import shared validators from `lib/types/*` in Convex functions to avoid duplication
- `getPaymentSummary` refactored from full-table `.collect()` + filter to indexed `orderId` query — significant performance improvement

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all changes type-checked cleanly on first pass.

## Next Phase Readiness

- Ready for 17-09 plan completion and Phase 18 (Schema + Canonical Contracts)
- Shared types in `lib/types/*` provide foundation for Phase 18 schema contracts
- All Convex hot-path reads now use bounded/paginated patterns

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-29_
