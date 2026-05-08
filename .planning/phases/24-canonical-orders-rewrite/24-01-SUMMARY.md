---
phase: 24-canonical-orders-rewrite
plan: 01
type: execute
subsystem: database

requires:
  - phase: 23-add-email-confirmation
    provides: Working signup flow with submissions

provides:
  - Canonical orders table schema with integration/internal source support
  - Slimmed Ticket Tailor extension tables with FKs to core
  - Unified data model for orders and attendees
  - Foundation for TT sync pipeline rewrite

affects:
  - 24-02 (TT sync mutations)
  - 24-03 (orders queries)
  - 24-04 (tikkie integration)
  - 24-05 (payments matching)
  - 24-06 (accommodation reads)

tech-stack:
  added: []
  patterns:
    - "Core + Extension pattern: slim core tables with provider-specific extensions"
    - "Optional fields for cross-source compatibility"
    - "FK relationships between TT and core tables"

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/_generated/api.d.ts
    - convex/_generated/dataModel.d.ts

key-decisions:
  - "D-01: Drop + recreate tables (clean break, no migration needed in dev)"
  - "D-02: submissions → orders (semantic accuracy for both sources)"
  - "D-15: Domain concepts (assignedRoomId, allocationPriority) belong in core"
  - "D-16/17: TT tables slimmed with FKs, provider data moved to core"

requirements-completed: []

duration: 5min
completed: 2026-03-31
---

# Phase 24 Plan 01: Canonical Schema Rewrite Summary

**Unified data model with orders core and slimmed Ticket Tailor extension tables**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T10:51:25Z
- **Completed:** 2026-03-31T10:52:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Renamed 5 core tables: submissions → orders, submissionAttendees → orderAttendees, etc.
- Added integration fields to orders (currency, totalAmountMinor, status, providerOrderId, etc.)
- Moved domain allocation fields to orderAttendees (assignedRoomId, allocationPriority, priorityReason)
- Slimmed ticketTailorOrders with orderId FK to orders
- Slimmed ticketTailorAttendees with attendeeId FK to orderAttendees
- Removed buyerEmail, buyerName, currency, totalAmountMinor from TT tables (now in core)
- Updated all indexes to match new structure
- Regenerated Convex types

## Task Commits

1. **Task 1: Replace submissions* tables with orders* core tables** - `3148586` (feat)
2. **Task 2: Slim ticketTailorOrders and ticketTailorAttendees tables** - `3148586` (feat)
3. **Regenerate Convex types** - `5ae6687` (chore)

**Plan metadata:** [pending final commit]

## Files Created/Modified

- `convex/schema.ts` - Complete schema rewrite with 5 new core tables and 2 slimmed TT tables
- `convex/_generated/api.d.ts` - Regenerated API types
- `convex/_generated/dataModel.d.ts` - Regenerated data model types

## Decisions Made

- Used optional fields for cross-source compatibility (integration orders have different fields than internal)
- Kept gender normalization lowercase in core (male/female/mixed/unknown), uppercase in TT (MALE/FEMALE/MIXED/UNKNOWN)
- Maintained all existing indexes plus added new ones for provider lookups

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - schema compiled cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Schema foundation complete. Ready for:

- 24-02: Update TT sync mutations to write to new tables
- 24-03: Update orders queries to read from orders instead of TT tables
- 24-04 through 24-06: Update downstream consumers

All dependent plans can now proceed with the canonical data model.

---

_Phase: 24-canonical-orders-rewrite_
_Completed: 2026-03-31_
