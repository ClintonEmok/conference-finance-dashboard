---
phase: 24-canonical-orders-rewrite
plan: 02
subsystem: database
tags: [convex, sync, orders, dual-write, ticket-tailor]

# Dependency graph
requires:
  - phase: 24-canonical-orders-rewrite
    provides: Core orders schema from plan 24-01
provides:
  - Rewritten TT sync mutations writing to core + extension tables
  - Archive logic maintaining consistency across both tables
  - Helper queries reading from correct (core) tables
  - Family linking using orderAttendees IDs
affects:
  - phase: 24-canonical-orders-rewrite/plan-03
  - convex/orders.ts
  - convex/accommodation.ts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dual-write pattern for core + extension tables
    - Single-transaction writes using ctx.db directly
    - FK relationships from extension to core tables

key-files:
  created: []
  modified:
    - convex/sync.ts
    - convex/autoSync.ts

key-decisions:
  - Extract buyer info from rawPayload inside mutation instead of passing as args
  - Use 'status' field in orders table, 'normalizedStatus' in ticketTailorOrders
  - Map TT uppercase gender to core lowercase gender
  - Family linking now uses orderAttendees IDs as canonical reference

patterns-established:
  - "Dual-write: All TT sync mutations write to both core (orders/orderAttendees) and extension (ticketTailorOrders/ticketTailorAttendees) tables"
  - "FK pattern: Extension tables have orderId/attendeeId foreign keys to core tables"
  - "Single-transaction: Use ctx.db directly within mutations, not ctx.runQuery/runMutation"
  - "Index usage: Use .first() for single-result lookups, .take(N) for bounded reads"

requirements-completed: []

# Metrics
duration: 35min
completed: 2026-03-31
---

# Phase 24 Plan 02: TT Sync Pipeline Dual-Write Rewrite Summary

**Rewrote TT sync mutations to write to both core (orders/orderAttendees) and extension (ticketTailorOrders/ticketTailorAttendees) tables simultaneously, maintaining data consistency through single transactions.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-31T10:57:36Z
- **Completed:** 2026-03-31T11:33:29Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Rewrote `internalUpsertTicketTailorOrder` to dual-write to orders (core) and ticketTailorOrders (extension) tables
- Rewrote `internalUpsertTicketTailorAttendee` to dual-write to orderAttendees (core) and ticketTailorAttendees (extension) tables
- Updated archive logic to patch both tables for consistency
- Migrated helper queries (`internalGetPaidOrders`, `internalGetAttendeesByOrder`) to read from core tables
- Updated family linking to reference orderAttendees IDs as canonical reference
- Updated autoSync.ts to use new function signatures and return types

## Task Commits

Each task was committed atomically:

1. **Task 1 & 2: Rewrite TT sync mutations** - `750a9af` (feat)
2. **Task 3: Fix field names** - `01b514c` (fix)

## Files Created/Modified

- `convex/sync.ts` - Rewrote internal mutations for dual-write pattern, updated helper queries
- `convex/autoSync.ts` - Updated to use new function signatures and orderAttendees IDs for family linking

## Decisions Made

1. **Extract from rawPayload**: Buyer info (name, email, currency, amounts) extracted from rawPayload inside mutation rather than passed as separate args - reduces API surface and ensures consistency
2. **Field naming**: orders table uses `status`, ticketTailorOrders uses `normalizedStatus` - each table uses the appropriate field name for its context
3. **Gender normalization**: TT uppercase gender types (MALE/FEMALE/MIXED/UNKNOWN) normalized to lowercase for core table
4. **Family linking**: Now uses orderAttendees.\_id as the canonical attendee identifier instead of ticketTailorAttendees.\_id

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed field name mapping between tables**

- **Found during:** Task 1 implementation
- **Issue:** Initially used `normalizedStatus` for orders table, but schema defines `status`
- **Fix:** Changed to use `status` for orders, kept `normalizedStatus` for ticketTailorOrders
- **Files modified:** convex/sync.ts
- **Verification:** Schema alignment check
- **Committed in:** `01b514c`

**2. [Rule 1 - Bug] Removed non-existent field from orders table**

- **Found during:** Task 1 implementation
- **Issue:** Included `isArchived` field in orders table operations, but it only exists on ticketTailorOrders
- **Fix:** Removed `isArchived` and `archiveReason` from orders patch/insert operations
- **Files modified:** convex/sync.ts
- **Verification:** Schema alignment check
- **Committed in:** `01b514c`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for schema alignment. No scope creep.

## Issues Encountered

Pre-existing TypeScript errors in other files (convex/accommodation.ts, etc.) referencing old table names like `submissions`. These are outside the scope of this plan and will be addressed in later phases per the phase dependency order (D-23).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core + Extension dual-write pattern established
- TT sync pipeline ready for end-to-end testing
- Next: Update downstream consumers (orders.ts, payments.ts, accommodation.ts) per D-23 dependency order

---

_Phase: 24-canonical-orders-rewrite_
_Completed: 2026-03-31_
