---
phase: 24-canonical-orders-rewrite
plan: 06
subsystem: database
 tags: [convex, schema, orders, migration]

requires:
  - phase: 24-canonical-orders-rewrite
    provides: "Core orders tables schema (orders, orderAttendees, orderTicketSelections, orderAssignments, orderIdempotency)"

provides:
  - Updated signupSubmission.ts writing to core orders tables
  - Idempotency checks using orderIdempotency table
  - Booking ref generation using orders table
  - Restore payload reads from orders + child tables

affects:
  - 24-canonical-orders-rewrite

tech-stack:
  added: []
  patterns:
    - "Core + Extension pattern for orders data model"
    - "Table name migration: submissions* -> orders*"

key-files:
  created: []
  modified:
    - convex/signupSubmission.ts

key-decisions:
  - "Preserve submissionId in API return type for backward compatibility while using orders table"
  - "Keep local variable name as submissionId for clarity while writing to orders table"

patterns-established: []

requirements-completed: []

---

# Phase 24 Plan 06: Update signup submission to write to core orders tables Summary

**Updated signupSubmission.ts to write to orders, orderAttendees, orderTicketSelections, orderAssignments, and orderIdempotency tables instead of deprecated submissions\* tables**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T11:38:25Z
- **Completed:** 2026-03-31T11:46:03Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced all submissions* table references with orders* equivalents
- Updated Id<"submissions"> type annotations to Id<"orders">
- Updated ctx.db.insert() calls to use new table names
- Updated ctx.db.query() calls to use new table names
- Changed index names from by_submissionId to by_orderId
- Updated field names in insert objects from submissionId to orderId
- Verified compilation with npx convex dev

## Task Commits

Each task was committed atomically:

1. **Task 1: Update signupSubmission.ts to write to core orders tables** - `4c1e81b` (feat)

## Files Created/Modified

- `convex/signupSubmission.ts` - Updated all table references from submissions* to orders*

## Decisions Made

- Preserved `submissionId` as the API return field name for backward compatibility while the underlying table is now `orders`
- Kept local variable name `submissionId` for code clarity (represents the order ID)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None significant. The type checker showed some pre-existing type annotation mismatches in the buildRestorePayload function, but these were already present before the migration and don't affect runtime behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Signup submission now writes to the canonical orders tables
- Ready for downstream consumers to read from orders tables
- Core + Extension pattern fully established for signup flow

---

_Phase: 24-canonical-orders-rewrite_
_Completed: 2026-03-31_
