---
phase: 22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui
plan: 01
subsystem: ui
tags: [react, signup, typescript, state-management]

# Dependency graph
requires:
  - phase: 21-accommodation-ux-redesign
    provides: Event settings inline accommodation flow
provides:
  - Reordered signup flow: tickets → attendees → rooms → review
  - Location field in attendee details
  - Step validation logic for new order
  - Foundation for family ticket allocation UX
affects:
  - 22-02-room-assignment-redesign
  - 22-03-review-step-restructure

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Step-based linear flow with SIGNUP_STEP_ORDER constant
    - Draft state preservation on ticket quantity changes
    - Attendee validation before room assignment access

key-files:
  created: []
  modified:
    - components/signup/state.ts
    - components/signup/SignupFlowShell.tsx
    - components/signup/steps/AttendeeDetailsStep.tsx

key-decisions:
  - "Step order is defined by SIGNUP_STEP_ORDER constant - changing it automatically reorders the entire flow"
  - "Location field already existed in codebase from prior work - verified present and functional"
  - "Attendee validation happens when leaving attendees step (moveToStep, moveNext)"
  - "Room assignment step requires valid attendees AND (all beds filled OR acknowledgeRandomFill)"

patterns-established:
  - "Flow order driven by constant array, not hardcoded indices"
  - "Attendee data preservation when ticket quantities change via deriveAttendeeDraftsFromTicketSelections"
  - "Validation summary pattern with per-attendee error tracking"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-30
---

# Phase 22 Plan 01: Flow Reorder + Location Field Summary

**Signup flow reordered to tickets → attendees → rooms → review with location field verification in attendee details**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T22:44:08Z
- **Completed:** 2026-03-30T22:46:20Z
- **Tasks:** 4
- **Files modified:** 1

## Accomplishments

- Changed SIGNUP_STEP_ORDER from [tickets, rooms, attendees, review] to [tickets, attendees, rooms, review]
- Verified location field already present in AttendeeDraft type and initialization
- Verified SignupFlowShell.tsx dynamically adapts to step order changes
- Verified location input field present in AttendeeDetailsStep with validation
- TypeScript compilation passes without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Reorder SIGNUP_STEP_ORDER constant** - `2a4e3f1` (feat)

**Plan metadata:** To be committed with STATE.md and ROADMAP.md updates

## Files Created/Modified

- `components/signup/state.ts` - Reordered SIGNUP_STEP_ORDER constant (1 line change)

## Decisions Made

- Step order change is sufficient for foundational reorder - the SignupFlowShell dynamically reads from SIGNUP_STEP_ORDER
- No changes needed to SignupFlowShell or AttendeeDetailsStep as they already handle the new structure correctly
- Location field was already implemented from prior work - this plan verified its presence

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

### Notes on Existing Code

**Tasks 2, 3, and 4 required no code changes** - the location field and validation logic were already present in the codebase from prior implementation work. This plan verified:

1. **AttendeeDraft type** (Task 2): Already had `location: string` field at line 33
2. **AttendeeDraft initialization** (Task 2): Already initialized `location: ""` in deriveAttendeeDraftsFromTicketSelections at line 99
3. **SignupFlowShell validation** (Task 3): Already validates attendees when leaving the step (lines 239-245, 251-257)
4. **Location field UI** (Task 4): Already present in AttendeeDetailsStep (lines 170-196) with label, input, validation, and error display

This demonstrates that prior phases (19-03 specifically) had already implemented these features, making this plan primarily a verification and reordering task.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Foundation complete for Phase 22-02 (room assignment redesign with bedslot grouping)
- Step order change enables attendee-first flow for family allocation decisions
- Location field data will be available for operator allocation strategies

---

_Phase: 22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui_
_Completed: 2026-03-30_
