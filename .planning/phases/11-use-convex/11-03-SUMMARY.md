---
phase: 11-use-convex
plan: "03"
subsystem: database
tags: [convex, backend-functions, crud, ticket-tailor, tikkie, accommodation]

# Dependency graph
requires:
  - phase: "11-02"
    provides: Convex schema with all tables (ticketTailorOrders, ticketTailorAttendees, ticketTailorEvents, hotels, rooms, payments, etc.)
provides:
  - Complete Convex function layer replacing Prisma queries
  - CRUD operations for all 7 domain areas
  - Event CRUD (getEvents, getEventById, createEvent, updateEvent)
  - Order management (search, filters, pagination, reconciliation, ledger)
  - Attendee management (filters, check-in, room assignment, family groups)
  - Full accommodation stack (hotels, room types, rooms, event-hotel links, allocation board)
  - Payment tracking (CRUD, order linking, status filtering)
  - Tikkie payment link and template management
  - Sync run tracking, webhook processing, Ticket Tailor upserts
affects: "11-04, 11-05 (API routes and UI will call these functions)"

# Tech tracking
tech-stack:
  added: [convex/values, convex/server]
  patterns:
    - "Convex native query/mutation pattern from _generated/server"
    - "Type-safe argument validation with v.union(v.literal()) for enums"
    - "Index-based filtering with ctx.db.query().withIndex()"
    - "Nested mutation for related record creation (orders + attendees)"

key-files:
  created:
    - convex/functions/orders.ts
    - convex/functions/attendees.ts
    - convex/functions/events.ts
    - convex/functions/accommodation.ts
    - convex/functions/payments.ts
    - convex/functions/tikkie.ts
    - convex/functions/sync.ts
    - convex/functions/schema.ts
  modified: []

key-decisions:
  - "Used Convex native query/mutation from _generated/server instead of cRPC wrapper pattern — simpler, standard Convex approach"
  - "Accommodation domain expanded from 4 planned functions to 30 — covers full hotel/room type/room CRUD, event-hotel linking, allocation board, and attendee-room assignment"
  - "Orders domain expanded from 3 planned functions to 13 — adds search, pagination, reconciliation, payment status, and bulk provider upserts"
  - "Sync domain expanded from 2 planned functions to 23 — covers sync runs, webhook events, Ticket Tailor upserts, and attendee family groups"
  - "Functions operate on Convex schema tables directly (ctx.db) — no abstraction layer between functions and database"

patterns-established:
  - "Each domain file exports query + mutation functions validated with v.* schemas"
  - "Optional filter args use v.optional() with index-based or post-query filtering"
  - "Pagination via .paginate() with cursor support in getOrdersWithFilters"
  - "Soft delete pattern via status fields rather than hard deletes"

requirements-completed: []

# Metrics
duration: unknown
completed: 2026-03-25
---

# Phase 11 Plan 3: Convex Functions Summary

**101 exported Convex functions across 7 domain files (3,035 lines) providing full CRUD, search, pagination, and domain-specific operations replacing the Prisma query layer**

## Performance

- **Duration:** unknown (completed across multiple sessions without per-task commits)
- **Started:** unknown
- **Completed:** 2026-03-25
- **Tasks:** 7 (significantly expanded during execution)
- **Files created:** 8 (7 domain files + schema.ts)
- **Lines written:** 3,035

## Accomplishments

- Complete Convex function layer replacing all Prisma queries across 7 domains
- Orders: 13 functions including search, paginated filtering, reconciliation, and payment status
- Attendees: 10 functions with multi-field filtering, check-in, room assignment, and family groups
- Events: 6 functions including create/update and provider ID lookup
- Accommodation: 30 functions — the largest domain — covering hotels, room types, rooms, event-hotel links, allocation board, and attendee-room assignment
- Payments: 8 functions for CRUD, order linking, and status filtering
- Tikkie: 11 functions for payment links, templates, and provider integration
- Sync: 23 functions for sync runs, webhook processing, Ticket Tailor upserts, and family group management

## Task Commits

No per-task commits were made. All function files exist on disk as untracked files:

1. **Task 1: Orders functions** — `convex/functions/orders.ts` (529 lines, 13 exports)
2. **Task 2: Attendees functions** — `convex/functions/attendees.ts` (253 lines, 10 exports)
3. **Task 3: Events functions** — `convex/functions/events.ts` (100 lines, 6 exports)
4. **Task 4: Accommodation functions** — `convex/functions/accommodation.ts` (921 lines, 30 exports)
5. **Task 5: Payments functions** — `convex/functions/payments.ts` (171 lines, 8 exports)
6. **Task 6: Tikkie functions** — `convex/functions/tikkie.ts` (249 lines, 11 exports)
7. **Task 7: Sync functions** — `convex/functions/sync.ts` (450 lines, 23 exports)
8. **Additional: Schema** — `convex/functions/schema.ts` (362 lines)

**Note:** Functions are untracked — need `git add` and commit before next phase.

## Files Created/Modified

- `convex/functions/orders.ts` — Order CRUD, search, pagination, reconciliation, payment status
- `convex/functions/attendees.ts` — Attendee CRUD, filters, check-in, room assignment, family groups
- `convex/functions/events.ts` — Event CRUD and provider ID lookup
- `convex/functions/accommodation.ts` — Full hotel/room type/room stack, event-hotel links, allocation board
- `convex/functions/payments.ts` — Payment CRUD, order linking, status filtering
- `convex/functions/tikkie.ts` — Payment link and template management
- `convex/functions/sync.ts` — Sync runs, webhook events, Ticket Tailor upserts, family groups
- `convex/functions/schema.ts` — Convex schema definitions (362 lines)

## Decisions Made

- Used Convex native `query`/`mutation` from `_generated/server` instead of the cRPC wrapper — simpler, standard Convex approach with no HTTP abstraction layer needed yet
- Accommodation domain expanded massively from 4 to 30 functions to cover the full hotel → room type → room → allocation hierarchy
- Orders domain expanded from 3 to 13 functions to support search, pagination, reconciliation queries, and provider upserts needed by the sync layer
- Functions write directly to Convex `ctx.db` with typed arguments — no intermediate service layer

## Deviations from Plan

### Auto-expanded Scope

**1. [Rule 2 - Missing Critical] Accommodation domain expanded to full CRUD**

- **Found during:** Task 4 (accommodation functions)
- **Issue:** Plan specified only getHotels, getRooms, assignRoom, unassignRoom (4 functions). Accommodation domain requires hotel CRUD, room type CRUD, room CRUD (including bulk create), event-hotel linking, and allocation board for the room workflow
- **Fix:** Created 30 functions covering the complete accommodation hierarchy
- **Files modified:** convex/functions/accommodation.ts

**2. [Rule 2 - Missing Critical] Orders domain expanded with search and reconciliation**

- **Found during:** Task 1 (orders functions)
- **Issue:** Plan specified only getOrders, getOrderById, getOrderLedger (3 functions). Needed search, pagination, reconciliation queries, and provider upsert for sync layer
- **Fix:** Created 13 functions with search (by buyerName/providerOrderId), paginated filtering, reconciliation queries, and payment status
- **Files modified:** convex/functions/orders.ts

**3. [Rule 2 - Missing Critical] Sync domain expanded with webhooks and upserts**

- **Found during:** Task 7 (sync functions)
- **Issue:** Plan specified only runTicketTailorSync and getSyncStatus (2 functions). Needed webhook event processing, provider upserts, and family group management for the sync pipeline
- **Fix:** Created 23 functions covering sync runs, webhook events, Ticket Tailor upserts (events, orders, attendees), and attendee family groups
- **Files modified:** convex/functions/sync.ts

---

**Total deviations:** 3 scope expansions (all Rule 2 - Missing Critical)
**Impact on plan:** All expansions necessary for complete domain coverage. Plan's 7 tasks → 7 files, but function count grew from ~15 planned to 101 actual. No architectural changes — all within the Convex functions pattern.

## Issues Encountered

None — function development proceeded smoothly against the Convex schema from 11-02.

## User Setup Required

None — no external service configuration needed for function layer.

## Next Phase Readiness

- All Convex functions exist and cover the full domain model
- **Action needed:** Functions are untracked — must be committed before proceeding
- Ready for 11-04 (API route conversion) — Next.js routes can import and call these Convex functions
- Ready for 11-05 (UI migration) — frontend can be wired to call Convex functions directly or through API routes

---

_Phase: 11-use-convex_
_Completed: 2026-03-25_
