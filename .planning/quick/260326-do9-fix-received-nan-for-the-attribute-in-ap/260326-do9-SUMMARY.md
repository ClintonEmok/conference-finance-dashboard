---
phase: quick-260326-do9-fix-received-nan-for-the-attribute-in-ap
plan: "01"
subsystem: ui
tags: [accommodation, inventory, react, nextjs, regression]
requires:
  - phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
    provides: Clerk-protected dashboard inventory routes and the current accommodation inventory payload bridge.
provides:
  - Inventory page room metrics are sanitized to finite integers before rendering
  - Grouped hotel room-block totals now derive Available beds from safe room metrics instead of malformed payload values
  - Regression coverage for undefined, null, and NaN available-bed payload cases
affects: [accommodation-inventory, dashboard, room-metrics]
tech-stack:
  added: []
  patterns:
    - "Inventory-page rendering should normalize malformed numeric payload fields locally instead of letting NaN propagate into React output."
    - "Grouped accommodation room totals should be derived from sanitized per-room metrics, not raw payload fields."
key-files:
  created:
    - lib/dashboard/accommodation/inventory-metrics.ts
    - tests/accommodation/inventory-metrics.test.ts
  modified:
    - app/dashboard/accommodation/inventory/page.tsx
key-decisions:
  - "Kept the fix at the dashboard rendering boundary instead of widening scope into a backend contract change for this quick repair."
  - "When availableBeds is missing or non-finite, derive it from sanitized capacity minus occupied beds so hotel block totals stay meaningful and finite."
patterns-established:
  - "Accommodation inventory pages should sanitize fetched room metrics immediately after load before computing UI totals."
duration: 3 min
completed: 2026-03-26
---

# Quick Task 260326-do9 Summary

**Accommodation inventory now normalizes malformed room metrics on load so Available beds and grouped hotel totals stay numeric and never pass `NaN` into the React tree.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-26T08:53:42Z
- **Completed:** 2026-03-26T08:57:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a focused inventory-metrics helper that coerces room capacity, occupied beds, and available beds to finite integers.
- Added regression coverage for undefined, null, and `NaN` available-bed values in grouped room-block totals.
- Updated the accommodation inventory page to normalize fetched room metrics before computing grouped hotel totals and capacity counters.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract finite room-metric sanitization for inventory rendering** - `ae6a669` (fix)
2. **Task 2: Wire the inventory page to sanitized totals and preserve the existing UI** - `c909cbd` (fix)

**Plan metadata:** recorded in the final docs commit for this quick task.

## Files Created/Modified

- `lib/dashboard/accommodation/inventory-metrics.ts` - Pure helpers for finite room metric coercion and grouped room-block aggregation.
- `tests/accommodation/inventory-metrics.test.ts` - Regression coverage for malformed available-bed payload values.
- `app/dashboard/accommodation/inventory/page.tsx` - Normalizes fetched rooms before rendering totals and grouped hotel blocks.

## Decisions Made

- Kept the quick fix local to the inventory page render path instead of changing the API payload contract.
- Derived fallback `availableBeds` from sanitized `capacity - occupiedBeds` when the payload value is missing or non-finite.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/dashboard/accommodation/inventory` now has a regression-covered rendering guard against malformed room metric payloads.
- No new blockers were introduced; optional manual browser verification can be done later while a local signed-in dashboard session is running.

---

_Phase: quick-260326-do9-fix-received-nan-for-the-attribute-in-ap_
_Completed: 2026-03-26_
