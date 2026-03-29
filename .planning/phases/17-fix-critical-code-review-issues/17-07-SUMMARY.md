---
phase: 17-fix-critical-code-review-issues
plan: "07"
subsystem: accommodation
tags:
  [convex, occupancy, room-assignment, data-consistency, single-source-of-truth]

requires:
  - phase: 17-06
    provides: formatMoney centralization and dialog accessibility

provides:
  - Room occupancy single-sourced from ticketTailorAttendees.assignedRoomId
  - Consolidated room assignment mutations (attendees delegates to accommodation)
  - Eliminated occupiedBeds counter drift risk

affects:
  - 18-schema-canonical-contracts
  - 21-finance-integration

tech-stack:
  added: []
  patterns:
    - "Derived occupancy: compute room occupancy from attendee assignments at query time instead of maintaining denormalized counters"
    - "Mutation delegation: thin API surfaces delegate to authoritative implementations for consistent business rule enforcement"

key-files:
  created: []
  modified:
    - convex/accommodation.ts
    - convex/attendees.ts

key-decisions:
  - "Remove occupiedBeds counter writes entirely — occupancy derived from ticketTailorAttendees.assignedRoomId at query time"
  - "attendees.assignRoom delegates to accommodation.assignAttendeeToRoom for single authoritative implementation"
  - "attendees.unassignRoom delegates to accommodation.unassignAttendeeFromRoom"

patterns-established:
  - "Occupancy derivation: all room occupancy reads use attendee assignment index query, not stored counter"
  - "Assignment consolidation: attendees.ts mutations are thin wrappers over accommodation.ts authoritative implementation"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-29
---

# Phase 17 Plan 07: Room occupancy single-sourced from attendee assignments with consolidated mutation surface

**Eliminated occupiedBeds counter drift by deriving room occupancy from attendee assignment queries and consolidating duplicate room assignment mutations into one authoritative accommodation implementation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T00:13:26Z
- **Completed:** 2026-03-29T00:21:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Removed all direct `occupiedBeds` counter maintenance from 4 room assignment/unassignment mutations in accommodation.ts
- Updated `getRoomsWithDetails` and `listAccommodationInventory` to derive occupancy from `ticketTailorAttendees.assignedRoomId` index queries
- Removed `occupiedBeds: 0` from `createRoom`/`createRooms` (field is optional in schema)
- Consolidated `attendees.assignRoom` and `attendees.unassignRoom` to delegate to accommodation mutations, enforcing capacity checks and event-hotel validation consistently

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove direct occupiedBeds maintenance** - `00afe6e` (fix)
2. **Task 2: Derive occupancy from attendee assignments** - `5f3fa9b` (fix)
3. **Task 3: Consolidate attendees mutations with accommodation** - `067c005` (fix)

**Plan metadata:** (to be committed)

_Note: No TDD tasks in this plan_

## Files Created/Modified

- `convex/accommodation.ts` - Removed occupiedBeds writes from assign/unassign mutations; derived occupancy in read queries from attendee assignments
- `convex/attendees.ts` - assignRoom/unassignRoom now delegate to accommodation mutations for consistent business rule enforcement

## Decisions Made

- Removed occupiedBeds counter writes entirely — occupancy is single-sourced from attendee assignments at query time, eliminating drift risk
- Made attendees.ts mutations thin wrappers over accommodation.ts — single authoritative implementation surface for room assignment

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Room occupancy cannot drift from assignment truth (single source of truth established)
- One consistent assignment implementation surface (accommodation.ts is authoritative)
- Ready for 17-08

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-29_
