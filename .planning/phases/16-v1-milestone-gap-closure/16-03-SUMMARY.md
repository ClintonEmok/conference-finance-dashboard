---
phase: 16-v1-milestone-gap-closure
plan: 16-03
subsystem: accommodation
tags: [allocation, compatibility, accommodation, testing]

# Dependency graph
requires:
  - phase: 16-v1-milestone-gap-closure
    provides: Family/location signal wiring and trustworthy hasFamily board signals
provides:
  - Compatibility-aware auto-allocation scoring with family cohesion, gender guardrails, and deterministic tie-breaks
  - Priority-first attendee ordering (`CRITICAL`/`HIGH` first) with stable placement behavior
  - Computed `familyGroupsKeptTogether` metric from actual grouped proposal placements
  - Regression tests locking guardrails, ordering, and family cohesion behavior
affects: [accommodation-allocation, milestone-audit-closure, phase-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Proposal generation uses compatibility scoring instead of first-fit room selection
    - Family cohesion metrics are computed from accepted suggestion outcomes, not placeholders

key-files:
  created:
    - tests/accommodation/allocation-proposal.test.ts
  modified:
    - lib/domain/accommodation/assignments.ts

key-decisions:
  - "Treat providerOrderId cohorts as the family/order-group cohesion key for proposal scoring and summary metrics."
  - "Apply strict male/female incompatibility guardrails unless a room or attendee is mixed/unknown."

patterns-established:
  - "Allocation proposal reasons should explain compatibility rationale (family/gender/priority), not generic bed availability text."
  - "Deterministic tie-breaks must include priority, cohort size, and stable lexical ordering to avoid proposal jitter."

# Metrics
duration: 16min
completed: 2026-03-27
---

# Phase 16 Plan 03: ACC-06 Compatibility Allocation Summary

**Auto-allocation now performs deterministic compatibility scoring that prioritizes critical attendees, preserves family/order cohesion when feasible, and reports real family-groups-kept-together outcomes.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-27T11:38:16Z
- **Completed:** 2026-03-27T11:54:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced first-fit room selection with ranked compatibility scoring across family cohesion, gender guardrails, and deterministic room tie-breaks.
- Added priority-aware attendee ordering that keeps critical/high placements ahead of lower-priority attendees while remaining stable.
- Implemented and tested computed `familyGroupsKeptTogether` using actual accepted grouped placements.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement compatibility-aware allocation proposal strategy** - `ae19465` (feat)
2. **Task 2: Add behavioral tests for guardrails and family cohesion metric** - `baaf33e` (test)

_Note: Plan metadata commit recorded separately below._

## Files Created/Modified

- `lib/domain/accommodation/assignments.ts` - Adds compatibility scoring helpers, deterministic sorting, gender guardrails, richer placement reasons, and computed family cohesion summary metric.
- `tests/accommodation/allocation-proposal.test.ts` - Verifies family grouping, gender incompatibility rejection, priority-first ordering, and compatibility rationale in reasons.

## Decisions Made

- Use `providerOrderId` as the operational family/order-group key for proposal-time cohesion because it is available across unassigned attendees and room occupants in current board payloads.
- Treat mixed/unknown attendee/room gender as a compatibility override while blocking clear MALE/FEMALE conflicts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ACC-06 milestone gap is now addressed with executable tests and deterministic compatibility logic.
- Phase 16 is complete; next work can proceed to phase 17 (dual-source event signup platform) planning/execution.

---

_Phase: 16-v1-milestone-gap-closure_
_Completed: 2026-03-27_
