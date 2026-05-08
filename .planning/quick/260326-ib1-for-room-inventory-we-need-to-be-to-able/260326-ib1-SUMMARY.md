---
phase: quick-260326-ib1-for-room-inventory-we-need-to-be-to-able
plan: "01"
subsystem: ui
tags: [nextjs, convex, accommodation, inventory, delete-guards]

# Dependency graph
requires:
  - phase: quick-260326-do9-fix-received-nan-for-the-attribute-in-ap
    provides: stable accommodation inventory rendering and grouped room metrics used by inventory cards
provides:
  - guarded destructive delete rules for accommodation rooms and hotels
  - protected room/hotel DELETE API endpoints with operator-friendly BAD_REQUEST messages
  - inventory and room-detail delete UI actions with confirmation, in-flight disablement, and clear blocked-state feedback
affects:
  [accommodation-operations, assignment-safety, dashboard-inventory-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - domain-level delete guards reject destructive room/hotel actions when dependent assignments still exist
    - dashboard delete actions surface server validation reasons directly instead of silent failures

key-files:
  created:
    - app/api/dashboard/accommodation/hotels/[hotelId]/route.ts
  modified:
    - convex/accommodation.ts
    - app/api/dashboard/accommodation/rooms/[roomId]/route.ts
    - app/dashboard/accommodation/inventory/page.tsx
    - app/dashboard/accommodation/rooms/[roomId]/page.tsx

key-decisions:
  - "Room deletion must never unassign attendees implicitly; it is blocked until assignments are cleared by operators."
  - "Hotel deletion must require zero room inventory and zero event-scope links before destructive removal is allowed."

patterns-established:
  - "Guard-first destructive operations: reject with explicit `Cannot delete ...` domain errors, then map to operator-facing BAD_REQUEST API responses."
  - "Delete UI parity: both inventory-card and room-detail surfaces use confirmation + disabled in-flight state + inline error messaging."

# Metrics
duration: 3m 10s
completed: 2026-03-26
---

# Phase quick 260326-ib1 Plan 01: Room/hotel inventory delete safeguards summary

**Accommodation inventory now supports safe operator deletes: rooms and hotels can be removed only when dependency constraints are satisfied, with clear blocked reasons exposed in both API and dashboard UI flows.**

## Performance

- **Duration:** 3m 10s
- **Started:** 2026-03-26T12:15:51Z
- **Completed:** 2026-03-26T12:19:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added backend delete guards that prevent room deletion when attendees are assigned and prevent hotel deletion when rooms/event scopes remain.
- Added protected DELETE endpoints for both room and hotel resources with actionable BAD_REQUEST mappings for `Cannot delete...`, validation, and not-found cases.
- Added inventory-card and room-detail delete actions with confirmation, in-flight disable state, error display, and room-delete redirect back to inventory.

## Task Commits

1. **Task 1: Enforce backend delete guards and expose protected DELETE endpoints** - `54ded55` (feat)
2. **Task 2: Add inventory UI delete actions for rooms and hotels with clear feedback** - `534b7d2` (feat)

_Plan metadata commit added below after summary/state update._

## Files Created/Modified

- `convex/accommodation.ts` - Replaced cascade-like destructive behavior with explicit guard failures for room/hotel delete operations.
- `app/api/dashboard/accommodation/rooms/[roomId]/route.ts` - Added protected DELETE handler for room removal with domain-error mapping.
- `app/api/dashboard/accommodation/hotels/[hotelId]/route.ts` - Added protected DELETE handler for hotel removal with domain-error mapping.
- `app/dashboard/accommodation/inventory/page.tsx` - Added hotel delete action on inventory cards with confirm, disabled state, and inline blocked error feedback.
- `app/dashboard/accommodation/rooms/[roomId]/page.tsx` - Added room delete quick action with confirm prompt and success redirect to inventory.

## Decisions Made

- Kept assignment integrity strict by blocking room deletion when attendees exist, instead of auto-unassigning during delete.
- Kept hotel deletion non-cascading by requiring operators to clear dependent rooms and event scope links first.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Accommodation inventory destructive actions are now safe and explicit for operators.
- Manual browser verification can confirm the four delete-flow UX checks end-to-end.

---

_Phase: quick-260326-ib1-for-room-inventory-we-need-to-be-to-able_
_Completed: 2026-03-26_
