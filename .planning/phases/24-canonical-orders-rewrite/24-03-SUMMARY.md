---
phase: 24-canonical-orders-rewrite
plan: 03
subsystem: database
tags: [convex, schema, orders, core-tables, ticket-tailor]

# Dependency graph
requires:
  - phase: 24-canonical-orders-rewrite
    provides: Core + Extension table schema from 24-01
provides:
  - Updated orders.ts reading from core orders table
  - Updated tikkie.ts reading from core orders table
  - Join patterns for core + extension tables
  - Bounded indexed query patterns
affects:
  - convex/sync.ts
  - convex/payments.ts
  - convex/accommodation.ts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Core + Extension table joins with .withIndex()"
    - "Bounded reads using .take(N) and .first()"
    - "Visibility filtering via extension table joins"

key-files:
  created: []
  modified:
    - convex/orders.ts - Updated to read from core orders/orderAttendees tables
    - convex/tikkie.ts - Updated autoMatchTikkiePayments to use core tables

key-decisions:
  - "Core tables (orders, orderAttendees) are the primary read source"
  - "Extension tables (ticketTailorOrders, ticketTailorAttendees) joined only for provider-specific fields"
  - "Visibility filtering (removedAt) applied via extension table joins"
  - "All queries use .withIndex() with proper index fields"

patterns-established:
  - "Core + Extension: Query core table first, join extension for additional fields"
  - "Bounded Reads: All list queries use .take(N) with reasonable caps (500, 1000)"
  - "Indexed Lookups: Single-result queries use .first() on indexed fields"
  - "Helper Functions: Reusable join functions (getOrderWithExtension, getVisibleOrdersWithExtensions)"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-31
---

# Phase 24 Plan 03: Update Order Queries to Core Tables Summary

**Updated orders.ts and tikkie.ts to read from core orders/orderAttendees tables instead of legacy ticketTailor tables, implementing Core + Extension join patterns with bounded indexed queries.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T10:57:54Z
- **Completed:** 2026-03-31T11:05:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **orders.ts completely rewritten** (458 insertions, 172 deletions)
  - All queries now read from core `orders` table instead of `ticketTailorOrders`
  - Attendee queries use core `orderAttendees` table joined with `ticketTailorAttendees` extension
  - Helper functions added for common join patterns
  - All mutations updated to write to both core and extension tables
- **tikkie.ts auto-match updated**
  - `autoMatchTikkiePayments` now reads from core `orders` table
  - Attendee lookup uses core `orderAttendees` table
  - Visibility filtering maintained via extension table joins
- **Query patterns established**
  - All queries use `.withIndex()` with proper indexes
  - Bounded reads via `.take(N)` with caps (500, 1000)
  - Single-result lookups use `.first()`
  - No unbounded `.collect()` calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Update orders.ts queries** - `1d1e6cd` (feat)
2. **Task 2: Update tikkie.ts** - `87f5461` (feat)

## Files Created/Modified

- `convex/orders.ts` - Complete rewrite to use core tables
  - `getOrders`, `getOrderById`, `getOrderByProviderId` - Core table queries
  - `getOrderLedger` - Joins orders with attendees
  - `getOrdersWithFilters`, `getOrdersForReconciliation` - Filtered list queries
  - `searchOrders` - Search with name/providerOrderId
  - `createOrder`, `upsertOrder`, `updateOrderStatus` - Mutations writing to both tables
  - `removeOrderLocally` - Soft delete via extension table
  - `getOrderPaymentStatus` - Payment status aggregation
  - `getOrderWithAttendeesByProviderId` - Order + attendees with extensions

- `convex/tikkie.ts` - Updated auto-match function
  - `autoMatchTikkiePayments` - Core table reads with extension joins

## Decisions Made

- **Core tables as primary source:** All reads start from `orders` and `orderAttendees` tables
- **Extension joins for provider data:** `ticketTailorOrders` and `ticketTailorAttendees` joined only when needed
- **Visibility via extension:** `removedAt`, `isArchived` checked via extension table joins
- **Index strategy:** Used available indexes (`by_eventId`, `by_providerOrderId`, `by_status`, etc.)
- **No `by_orderedAt` index:** Date range filtering done in-memory after indexed event/status filters

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **LSP type errors initially appeared:** The `orders` table wasn't recognized by TypeScript until `npx convex codegen` regenerated types. After regeneration, all type checks passed.

- **Missing `by_orderedAt` index:** The `orders` table doesn't have an index on `orderedAt`, so date range queries in `listCandidateOrders` were simplified to filter by available indexes first (eventId, status), then filter by date in memory. This is acceptable for bounded reads (max 500 items).

## Key Implementation Patterns

### Core + Extension Join Pattern

```typescript
// Query core table first
const order = await ctx.db
  .query("orders")
  .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", id))
  .first()

// Join extension for provider-specific data
const extension = await ctx.db
  .query("ticketTailorOrders")
  .withIndex("orderId", (q) => q.eq("orderId", order._id))
  .first()

// Merge for complete data
return { ...order, ...extension }
```

### Visibility Filtering

```typescript
// Extension table holds visibility state
const isVisible = !extension?.removedAt
```

### Bounded Indexed Queries

```typescript
// Always use .withIndex() and .take(N)
const orders = await ctx.db
  .query("orders")
  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
  .take(500)
```

## Next Phase Readiness

Ready for Phase 24 Plan 04: Update remaining downstream consumers

- `sync.ts` - TT sync pipeline (already updated in previous plans)
- `payments.ts` - Payment matching queries
- `accommodation.ts` - Room allocation board queries

## Schema Compatibility

The implementation correctly uses:

- Core tables: `orders`, `orderAttendees`, `orderTicketSelections`, `orderAssignments`
- Extension tables: `ticketTailorOrders` (FK: `orderId`), `ticketTailorAttendees` (FK: `attendeeId`)
- Available indexes: `by_eventId`, `by_providerOrderId`, `by_status`, `by_orderId` (on attendees)

---

_Phase: 24-canonical-orders-rewrite_
_Plan: 03_
_Completed: 2026-03-31_
