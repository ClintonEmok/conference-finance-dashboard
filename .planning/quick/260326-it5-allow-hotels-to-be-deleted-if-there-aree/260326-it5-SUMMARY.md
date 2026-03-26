---
phase: quick-260326-it5-allow-hotels-to-be-deleted-if-there-aree
plan: "01"
subsystem: accommodation
tags: [nextjs, convex, accommodation, inventory, delete-guards]

# Dependency graph
requires:
  - phase: quick-260326-ib1-for-room-inventory-we-need-to-be-to-able
    provides: guarded room/hotel delete surfaces and operator-facing delete feedback patterns
provides:
  - hotel delete guard based on real attendee assignments instead of occupied bed counters
  - protected room-type DELETE endpoint with BAD_REQUEST mapping for expected operator errors
  - inventory UI room-type delete controls with confirmation, in-flight disablement, and inline errors
affects: [accommodation-operations, inventory-cleanup, assignment-safety]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - destructive hotel delete checks assignment truth from ticketTailorAttendees.assignedRoomId
    - room-type delete flows use route-level BAD_REQUEST mapping for Invalid/not found/Cannot delete outcomes

key-files:
  created:
    - app/api/dashboard/accommodation/room-types/[roomTypeId]/route.ts
  modified:
    - convex/accommodation.ts
    - app/dashboard/accommodation/inventory/page.tsx

key-decisions:
  - "Hotel deletion should be blocked only by actual attendee assignments, not potentially stale occupiedBeds counters."
  - "Room-type deletion should follow the same protected API + explicit operator error contract used by other accommodation delete endpoints."

patterns-established:
  - "Assignment-truth-first delete guards: use attendee assignment index checks as the source of truth for destructive hotel actions."
  - "Inventory delete parity: room-type delete UX mirrors hotel/room flows with confirm prompts, disabled in-flight actions, and inline API error rendering."

# Metrics
duration: 2m 53s
completed: 2026-03-26
---

# Phase quick 260326-it5 Plan 01: Hotel and room-type delete behavior alignment summary

**Accommodation inventory cleanup now matches operator intent: hotels can be deleted when no attendees are assigned across hotel rooms, while room types can be deleted end-to-end when unused with clear blocked-state messaging when dependencies exist.**

## Performance

- **Duration:** 2m 53s
- **Started:** 2026-03-26T12:36:16Z
- **Completed:** 2026-03-26T12:39:09Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Reworked `deleteHotel` guard logic to rely solely on attendee assignment truth (`assignedRoomId`) rather than `occupiedBeds` counters.
- Added a protected dynamic DELETE route for room types with consistent BAD_REQUEST mapping and `{ ok: true }` success contract.
- Added room-type delete controls to the inventory UI with confirmation, in-flight disabling, inline error feedback, and refreshed hotel delete wording.

## Task Commits

1. **Task 1: Align hotel delete guard with attendee assignment truth** - `076ee9d` (feat)
2. **Task 2: Add protected room-type DELETE endpoint with consistent error mapping** - `ae5d8f9` (feat)
3. **Task 3: Expose room-type delete action in inventory UI** - `8dbce91` (feat)

_Plan metadata commit added below after summary/state update._

## Files Created/Modified

- `convex/accommodation.ts` - Updated hotel deletion guard to block on actual assigned attendees only.
- `app/api/dashboard/accommodation/room-types/[roomTypeId]/route.ts` - Added authenticated room-type DELETE endpoint with expected error mapping.
- `app/dashboard/accommodation/inventory/page.tsx` - Added room-type delete action UI and aligned hotel delete confirmation copy with backend rules.

## Decisions Made

- Use attendee assignment index lookups as the source of truth for hotel delete safety checks.
- Keep delete endpoint error mapping explicit and operator-friendly for all expected validation and dependency conflicts.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Hotel and room-type delete behavior is now aligned across Convex guard logic, API route handling, and inventory UI actions.
- Manual dashboard verification of delete success/blocked cases can be run on `/dashboard/accommodation/inventory`.

---

_Phase: quick-260326-it5-allow-hotels-to-be-deleted-if-there-aree_
_Completed: 2026-03-26_
