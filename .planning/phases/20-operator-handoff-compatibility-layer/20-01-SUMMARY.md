---
phase: 20-operator-handoff-compatibility-layer
plan: 01
subsystem: accommodation
tags:
  [convex, accommodation, operator-handoff, submission-merge, room-allocation]

requires:
  - phase: 18-dual-source-event-signup-platform
    provides: "Canonical submissions/submissionAttendees/submissionAssignments tables and submitSignupEnvelope mutation"
  - phase: 19-public-multi-step-signup-experience
    provides: "Public signup flow producing canonical submission data"

provides:
  - Source-aware operator room allocation board merging integration and internal attendees
  - Submission queue rows with unresolved assignment prioritization
  - Typed SubmissionQueueRow contract through domain and API layers

affects:
  - phase: 20-operator-handoff-compatibility-layer (plans 02, 03)
  - accommodation dashboard UI (page.tsx consumer of enriched board)

tech-stack:
  added: []
  patterns:
    - "Read-time join of canonical submission tables inside Convex query for operator board enrichment"
    - "Gender mapping between lowercase (submission) and uppercase (board) enums"
    - "Unresolved-first sort for submission queue prioritization"

key-files:
  created: []
  modified:
    - convex/accommodation.ts - Extended getRoomAllocationBoard with submission queue row reads and construction
    - lib/domain/accommodation/assignments.ts - Added SubmissionQueueRow type and submissionQueueRows to RoomAllocationBoard
    - tests/accommodation/allocation-proposal.test.ts - Updated fixture with submissionQueueRows field

key-decisions:
  - "Submission attendees are returned as separate submissionQueueRows array (not merged into unassignedAttendees) to preserve integration-attendee contract while adding internal-source data"
  - "Unresolved assignment detection covers three states: no_assignment_record, skipped_intent, slot_not_assignable"
  - "Gender mapping converts submission lowercase values (male/female/mixed/unknown) to board uppercase values (MALE/FEMALE/MIXED/UNKNOWN)"

requirements-completed: [OPS-01]

duration: 11min
completed: 2026-03-30
---

# Phase 20 Plan 1: Operator Handoff Compatibility Layer Summary

**Canonical signup submission attendees now flow into the operator room allocation board via read-time Convex joins, with unresolved assignment prioritization and typed domain/API contracts.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-30T11:07:13Z
- **Completed:** 2026-03-30T11:19:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Convex `getRoomAllocationBoard` query now reads `submissions`, `submissionAttendees`, `submissionAssignments`, and `accommodationSlots` to build enriched submission queue rows
- Queue rows include source, submissionId, bookingRef, assignmentIntent, roommatePreference/Avoid, dietaryRestrictions, bookerName, unresolvedReason, and submittedAt metadata
- Unresolved rows (no assignment record, skipped intent, slot not assignable) are sorted before resolved rows
- Domain `RoomAllocationBoard` type extended with `submissionQueueRows: SubmissionQueueRow[]` field
- API route unchanged — new fields pass through transparently via `NextResponse.json(board)`

## Task Commits

1. **Task 1: Merge canonical submission attendees into operator room allocation board** - `c0c4029` (feat)
2. **Task 2: Propagate enriched handoff contract through domain + API adapter** - `30681a4` (feat)

## Files Created/Modified

- `convex/accommodation.ts` - Extended `getRoomAllocationBoard` with submission attendee reads, queue row construction, unresolved prioritization, and gender mapping helpers
- `lib/domain/accommodation/assignments.ts` - Added `SubmissionQueueRow` type and `submissionQueueRows` field to `RoomAllocationBoard`
- `tests/accommodation/allocation-proposal.test.ts` - Updated `buildBoard` fixture to include `submissionQueueRows: []`

## Decisions Made

- Submission queue rows kept as separate array (not merged into unassignedAttendees) to preserve integration-attendee backward compatibility while clearly separating internal-source data
- Three-state unresolved detection: no_assignment_record, skipped_intent, slot_not_assignable
- Gender mapping between submission (lowercase) and board (uppercase) enum conventions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - typecheck and all 12 accommodation tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Read-model layer ready: submission data flows through Convex → domain → API → UI
- Plan 20-02 can consume `submissionQueueRows` from board payload for operator UI handoff presentation
- Mixed-source board payload remains backward-compatible for existing UI consumers

---

_Phase: 20-operator-handoff-compatibility-layer_
_Completed: 2026-03-30_
