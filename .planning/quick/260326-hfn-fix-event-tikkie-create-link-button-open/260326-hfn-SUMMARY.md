---
phase: quick-260326-hfn-fix-event-tikkie-create-link-button-open
plan: "01"
subsystem: payments
tags: [tikkie, nextjs, api, react, vitest]

# Dependency graph
requires:
  - phase: 15-event-level-tikkie-ui-attendee-tikkie-cleanup
    provides: Event-level Tikkie dashboard UI and protected tikkie event-link route baseline
provides:
  - Event create-link CTA now opens an amount-entry modal before POST
  - Euro input is converted to cent-based amountMinor and explicitly supports 0 open-amount links
  - Route-level amountMinor parser now rejects invalid/negative/non-integer values with BAD_REQUEST
  - Regression tests for amountMinor=0 acceptance, invalid amount rejection, and unauthorized contract
affects:
  [
    financial-dashboard,
    event-tikkie-flow,
    route-contracts,
    tikkie-regression-tests,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Modal-first confirmation for operator financial create actions
    - Explicit route input parser for optional non-negative integer payload fields

key-files:
  created:
    - .planning/quick/260326-hfn-fix-event-tikkie-create-link-button-open/260326-hfn-SUMMARY.md
    - tests/tikkie/tikkie-event-links-route.test.ts
  modified:
    - components/dashboard/event-tikkie-section.tsx
    - app/api/dashboard/tikkie-event-links/route.ts

key-decisions:
  - "Create-link action must require an explicit operator-entered amount via modal to prevent accidental immediate link creation."
  - "amountMinor contract is optional but, when provided, must be an integer >= 0 so open-amount links (0) remain first-class."

patterns-established:
  - "Operator CTA gating: open modal -> validate locally -> submit typed payload -> refetch + reset modal state"
  - "Route parser boundaries: normalize payload at route edge before invoking domain functions"

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase quick 260326-hfn Plan 01: Fix event Tikkie create-link button open Summary

**Event-level Tikkie link creation now requires a modal amount entry and correctly supports open-amount links by accepting `amountMinor: 0` end-to-end.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T11:37:48Z
- **Completed:** 2026-03-26T11:41:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced direct create-link button behavior with a modal that captures amount in euros before submission.
- Added local euro-to-cents parsing/validation that accepts `0` and blocks invalid/negative input with inline feedback.
- Added route parser validation and regression tests to lock in `amountMinor: 0` acceptance and BAD_REQUEST behavior for invalid values.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace direct create action with amount-entry modal in EventTikkieSection** - `4b364e9` (feat)
2. **Task 2: Add POST amount validation contract and regression test for zero/open amount** - `c731fd3` (fix)

**Plan metadata:** pending

## Files Created/Modified

- `components/dashboard/event-tikkie-section.tsx` - Added create-link modal state, euro input, inline validation, and submit flow with `amountMinor` payload.
- `app/api/dashboard/tikkie-event-links/route.ts` - Added `parseAmountMinor` guard to preserve `0` and reject invalid values.
- `tests/tikkie/tikkie-event-links-route.test.ts` - Added POST route regression tests for open amount, invalid payloads, and unauthorized contract.

## Decisions Made

- Keep the existing event picker and assign-payment behavior unchanged while only changing create-link initiation to modal-first flow.
- Enforce `amountMinor` payload validity at the API route boundary instead of relying on downstream domain assumptions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test suite import failed due to missing Convex URL env in route dependencies**

- **Found during:** Task 2 verification
- **Issue:** Targeted route test crashed before running assertions with `NEXT_PUBLIC_CONVEX_URL is not set` during module import.
- **Fix:** Added hoisted test setup for `NEXT_PUBLIC_CONVEX_URL` and mocked `tikkie-event-payments` module to isolate POST route behavior.
- **Files modified:** `tests/tikkie/tikkie-event-links-route.test.ts`
- **Verification:** `npm test -- tests/tikkie/tikkie-event-links-route.test.ts` passes (3 tests).
- **Committed in:** `c731fd3` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required to run the planned route regression tests; no scope creep.

## Authentication Gates

None.

## Issues Encountered

- Route module imports pulled in Convex server env checks during tests; resolved by explicit test env/mocking boundary setup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Event-level create-link flow now has explicit operator confirmation and open-amount support.
- Route/test contracts are ready for future event payment sync and reconciliation refinements.

---

_Phase: quick-260326-hfn-fix-event-tikkie-create-link-button-open_
_Completed: 2026-03-26_
