---
phase: 25-concerns-fixing
plan: 03
subsystem: backend
tags: [refactor, http-client, deduplication, ticket-tailor, convex]

# Dependency graph
requires:
  - phase: 17-04
    provides: Auto-sync decoupled from app HTTP routes, calling external APIs directly
provides:
  - Single source of truth for Ticket Tailor HTTP client
  - ~187 lines of duplicate code removed from autoSync.ts
  - Shared client exports: ticketTailorFetch, ticketTailorFetchPaginated, extractItems, extractAttendeeItems
affects: [future-ticket-tailor-integration, api-client-maintenance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Shared HTTP client exports for cross-module reuse
    - Paginated collection result pattern with { items, pagesFetched }
    - Item extraction functions exported for consumer flexibility

key-files:
  created: []
  modified:
    - convex/autoSync.ts
    - lib/integrations/ticket-tailor/client.ts

key-decisions:
  - "Export ticketTailorFetchPaginated (renamed from internal fetchPaginatedCollection) for external use"
  - "Export extractItems and extractAttendeeItems for consumers needing raw payload processing"
  - "Keep order fallback logic in shared client's fetchTicketTailorOrdersByEventPaginated rather than duplicating in autoSync"

patterns-established:
  - "Shared client exports: internal functions renamed to public when needed by consumers"
  - "Paginated results return structured { items, pagesFetched } rather than flat arrays"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-31
---

# Phase 25 Plan 03: Consolidate Duplicate Ticket Tailor HTTP Client Summary

**Eliminated ~187 lines of duplicate HTTP client code by refactoring autoSync.ts to use the shared Ticket Tailor client from lib/integrations/ticket-tailor/client.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T12:30:00Z
- **Completed:** 2026-03-31T12:38:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Mapped autoSync HTTP client usage patterns to shared client exports
- Removed duplicate ttFetch, ttFetchPaginated, extractItems, extractAttendeeItems functions (~180 lines)
- Exported ticketTailorFetchPaginated and extraction functions from shared client
- Updated all call sites to use shared client API with correct argument shapes
- Simplified order fetching by leveraging shared client's built-in 404 fallback handling
- TypeScript compiles cleanly with zero errors in modified files
- File reduced from 866 to 677 lines (189 lines removed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Map shared client API to autoSync usage patterns** - Mental mapping, no code changes
2. **Task 2: Refactor autoSync.ts to use shared HTTP client** - `f43830b` (feat)

## Files Created/Modified

- `convex/autoSync.ts` - Removed duplicate HTTP client code, updated to use shared client imports
- `lib/integrations/ticket-tailor/client.ts` - Exported ticketTailorFetchPaginated, extractItems, extractAttendeeItems

## Decisions Made

- Exported `ticketTailorFetchPaginated` (renamed from internal `fetchPaginatedCollection`) to allow autoSync to use the paginated fetching logic
- Exported `extractItems` and `extractAttendeeItems` for consumers that need to process raw payloads before/after pagination
- Simplified autoSync's order fetching by removing the try/catch fallback - the shared client's `fetchTicketTailorOrdersByEventPaginated` already handles the 404 fallback internally
- Used destructuring `{ items: eventPayloads }` pattern to adapt from `{ items, pagesFetched }` return shape to the flat array pattern autoSync expected

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shared HTTP client is now the single source of truth for Ticket Tailor API calls
- Future API changes or bug fixes only need to be applied in one place
- Ready for next concerns-fixing plan

---

_Phase: 25-concerns-fixing_
_Completed: 2026-03-31_
