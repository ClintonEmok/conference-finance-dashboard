---
phase: 16-v1-milestone-gap-closure
plan: 16-02
subsystem: accommodation
tags: [convex, filters, accommodation, testing]

# Dependency graph
requires:
  - phase: 16-v1-milestone-gap-closure
    provides: Clerk-protected accommodation assignment API route with signal params wired from request parsing
provides:
  - Family/location signal filters now flow from domain filters into Convex board query execution
  - Allocation board now returns data-driven hasFamily flags (explicit family membership first, provider-order fallback)
  - Regression coverage for family/location filter logic and hasFamily mapping behavior
affects: [accommodation-allocation, milestone-audit-closure, phase-16-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Filter normalization at domain boundary before Convex query calls
    - Signal-filter matching consolidated in Convex helper logic for testable behavior

key-files:
  created:
    - tests/accommodation/allocation-filters.test.ts
  modified:
    - lib/domain/accommodation/assignments.ts
    - convex/accommodation.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "Treat attendeeFamilyMembers membership as explicit family truth and fallback to same providerOrderId group size when membership is absent."
  - "Normalize location values (trim/case-insensitive compare) for robust filter matching and echoed filter payloads."

patterns-established:
  - "Accommodation signal filters must be passed through domain->Convex arguments explicitly; omitted fields are treated as regressions."
  - "Board-level family flags should prefer persisted family-group relationships over inferred heuristics."

# Metrics
duration: 8min
completed: 2026-03-27
---

# Phase 16 Plan 02: ACC-04/ACC-05 Filter Wiring Summary

**Accommodation allocation board now enforces real family/location filters and publishes trustworthy hasFamily signals derived from family membership data with order-based fallback.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T11:28:24Z
- **Completed:** 2026-03-27T11:36:03Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Wired `familyGroupId` and `location` through the domain query boundary into `api.accommodation.getRoomAllocationBoard`.
- Extended Convex allocation filtering to apply family-group and location constraints while preserving existing event/hotel/room/gender/priority behavior.
- Replaced placeholder family flags with computed `hasFamily` values and added targeted regression tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Plumb family/location filters through domain and Convex query** - `5faab7c` (feat)
2. **Task 2: Return real family indicators and lock behavior with tests** - `1bd8921` (test)

_Note: Plan metadata commit recorded separately below._

## Files Created/Modified

- `lib/domain/accommodation/assignments.ts` - Normalizes and forwards `familyGroupId`/`location` into Convex board query args.
- `convex/accommodation.ts` - Adds family/location validator args, filter matching logic, and computed `hasFamily` mapping.
- `convex/_generated/api.d.ts` - Regenerated Convex API bindings after query arg contract update.
- `tests/accommodation/allocation-filters.test.ts` - Regression tests for domain plumbing, location/family filtering, and family signal mapping.

## Decisions Made

- Use `attendeeFamilyMembers` as the canonical explicit family indicator, then infer family from same-order attendee counts only when explicit membership is absent.
- Compare location filters case-insensitively after trimming to avoid false negatives from payload formatting variance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated Convex API types after arg contract change**

- **Found during:** Task 1 (Plumb family/location filters through domain and Convex query)
- **Issue:** Typecheck failed because generated `api.accommodation.getRoomAllocationBoard` types did not include new `familyGroupId`/`location` args.
- **Fix:** Ran `npx convex codegen` and committed updated generated bindings.
- **Files modified:** `convex/_generated/api.d.ts`
- **Verification:** `npm run typecheck` passes.
- **Committed in:** `5faab7c` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for compilation correctness after planned Convex API expansion; no scope creep.

## Issues Encountered

- Convex generated API definitions lagged behind source query changes until codegen was rerun.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ACC-04/ACC-05 code-level blockers are resolved for allocation filter truthfulness and family signal integrity.
- Phase 16-03 can proceed with remaining milestone closure checks.

---

_Phase: 16-v1-milestone-gap-closure_
_Completed: 2026-03-27_
