---
phase: 24-canonical-orders-rewrite
plan: 05
subsystem: database

# Dependency graph
requires:
  - phase: 24-canonical-orders-rewrite
    provides: "Core orders table schema, orderAttendees table with assignedRoomId"
provides:
  - "accommodation.ts reading from core orders and orderAttendees tables"
  - "Assignment mutations updating orderAttendees for domain fields"
  - "Room occupancy queries using orderAttendees.assignedRoomId index"
affects:
  - 24-06
  - accommodation-board
  - room-assignment

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Core + Extension table join pattern"
    - "Domain fields in core tables (assignedRoomId, allocationPriority)"
    - "Provider-specific data in extension tables (genderType, customAnswers)"

key-files:
  created: []
  modified:
    - convex/accommodation.ts

key-decisions:
  - "Assignment mutations now patch orderAttendees (core) instead of ticketTailorAttendees (extension) per D-15"
  - "Room occupancy queries use orderAttendees.by_assignedRoomId index"
  - "Internal signup queue uses orderAttendees joined with orderAssignments"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-03-31
---

# Phase 24 Plan 05: Update accommodation module for core tables Summary

**Updated accommodation.ts (1847 lines) to read from core orders/orderAttendees tables with TT extension joins for provider-specific data**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-31T11:38:07Z
- **Completed:** 2026-03-31T11:43:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Updated DocTables type to include orderAttendees alongside ticketTailorAttendees
- Renamed mapSubmissionGender to normalizeGender with explanatory comment about direction (lowercase core → uppercase display)
- Updated getAttendeeByStringId to resolve against orderAttendees (core) instead of ticketTailorAttendees (extension)
- Migrated getRoomAllocationBoard to query orders instead of submissions, orderAttendees instead of submissionAttendees, orderAssignments instead of submissionAssignments
- Updated all four assignment mutations (assignRoomToAttendee, assignAttendeeToRoom, unassignRoomFromAttendee, unassignAttendeeFromRoom) to patch orderAttendees for assignedRoomId
- Updated recalculateRoomOccupancy to count orderAttendees by assignedRoomId
- Updated deleteHotel and deleteRoom to check for assigned attendees in orderAttendees
- Updated getAccommodationSummaryForEvent to query orders table
- Maintained backward compatibility for return field names (submissionsCount)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update accommodation.ts table references and helper functions** - `b10101f` (feat)
2. **Task 2: Update getRoomAllocationBoard and assignment mutations** - `bece5b8` (feat)

**Plan metadata:** `bece5b8` (docs: complete plan)

## Files Created/Modified

- `convex/accommodation.ts` - Updated all table references from submission\* to orders/orderAttendees/orderAssignments, updated assignment mutations to patch orderAttendees

## Decisions Made

- Keep `submissionsCount` field name in getAccommodationSummaryForEvent return value for frontend backward compatibility
- Use orderAttendees.by_assignedRoomId index for all room occupancy queries per D-34 (indexed queries only)
- Assignment mutations validate event-hotel links by looking up the attendee's order to get eventId (rather than using providerEventId from TT extension)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- LSP errors during editing due to IDE TypeScript cache not recognizing new table names immediately. Resolved by regenerating Convex types with `npx convex codegen`. The errors were false positives - the generated types in convex/\_generated/dataModel.d.ts correctly included orderAttendees and orders tables.

## Next Phase Readiness

- accommodation.ts now fully reads from core tables (orders, orderAttendees)
- Assignment mutations update core table (orderAttendees.assignedRoomId)
- Room allocation board can display both integration (TT) and internal signup attendees
- Ready for Phase 24 Plan 06 (final verification and cleanup)

---

_Phase: 24-canonical-orders-rewrite_
_Completed: 2026-03-31_
