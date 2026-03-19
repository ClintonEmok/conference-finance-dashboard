---
phase: 04-attendee-data-accommodation-foundations
plan: 01
subsystem: ui
tags: [ticket-tailor, attendees, prisma, dashboard, nextjs, finance]

# Dependency graph
requires:
  - phase: 02-ticket-data-reliability
    provides: Durable Ticket Tailor event/order sync models and protected sync orchestration
  - phase: 03-finance-visibility-reconciliation
    provides: Dashboard filter/apply patterns and conservative outstanding-balance heuristics
provides:
  - Durable attendee-level Ticket Tailor persistence linked to events and orders
  - Sync pipeline attendee upserts with attendee-specific counts and diagnostics
  - Protected attendee ledger API and dashboard list surface with detail-route handoff
affects: [phase-04-plan-02-attendee-detail-accommodation, phase-05-room-allocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Prefer embedded `issued_tickets` attendee payloads and fall back to canonical order fetches when attendee rows are absent
    - Keep attendee ledger delivery aligned with existing protected API + filter-apply dashboard page pattern

key-files:
  created:
    - prisma/migrations/20260319105355_attendee_sync_foundation/migration.sql
    - lib/domain/finance/attendees.ts
    - app/api/dashboard/attendees/route.ts
    - app/dashboard/attendees/page.tsx
    - app/dashboard/attendees/[attendeeId]/page.tsx
  modified:
    - prisma/schema.prisma
    - lib/integrations/ticket-tailor/client.ts
    - lib/integrations/ticket-tailor/sync.ts
    - app/dashboard/layout.tsx
    - tests/ticket-tailor/client.test.ts
    - tests/ticket-tailor/sync-route.test.ts

key-decisions:
  - "Model attendee records as first-class Prisma rows keyed by provider attendee or issued-ticket identifiers instead of re-parsing order payloads later."
  - "Fallback from embedded attendee arrays to canonical order payloads so sync remains resilient across Ticket Tailor response variants."
  - "Project attendee outstanding balances conservatively from order status and per-order attendee count until richer payment allocation exists."

patterns-established:
  - "Attendee sync pattern: order fetch -> attendee extraction/fallback -> attendee upsert -> attendee counts in sync summary."
  - "Attendee navigation pattern: list screen ships first with a live placeholder detail route, then richer detail flows layer on later plans."

# Metrics
duration: 15min
completed: 2026-03-19
---

# Phase 4 Plan 01: Attendee Sync and Ledger Summary

**Ticket Tailor attendee identities now persist durably, sync with attendee-specific diagnostics, and render in a protected attendee ledger with room-status placeholders.**

## Performance

- **Duration:** 14m 50s
- **Started:** 2026-03-19T10:52:25Z
- **Completed:** 2026-03-19T11:07:15Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Added a durable `TicketTailorAttendee` model and migration linked to synced Ticket Tailor events and orders.
- Extended Ticket Tailor sync to extract attendee rows, upsert them idempotently, and report attendee fetch/upsert/skip counts.
- Added a protected attendee ledger API and `/dashboard/attendees` page with filter/search, outstanding balance context, and detail links.
- Verified real sync output, attendee persistence, authenticated attendee API/page access, and unauthenticated `UNAUTHORIZED` attendee API behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add durable attendee-level Ticket Tailor storage** - `02536c6` (feat)
2. **Task 2: Extend Ticket Tailor sync to import issued tickets or attendees** - `09c6f86` (feat)
3. **Task 3: Add attendee ledger query, protected API, and dashboard list page** - `9aa0841` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - adds attendee relations and durable `TicketTailorAttendee` fields/indexes.
- `prisma/migrations/20260319105355_attendee_sync_foundation/migration.sql` - creates attendee storage in SQLite.
- `lib/integrations/ticket-tailor/client.ts` - adds attendee extraction and canonical-order fallback fetch support.
- `lib/integrations/ticket-tailor/sync.ts` - upserts attendee rows and includes attendee counts in sync summaries.
- `tests/ticket-tailor/client.test.ts` - covers embedded attendee extraction and canonical fallback behavior.
- `tests/ticket-tailor/sync-route.test.ts` - updates protected sync route contract expectations for attendee counts.
- `lib/domain/finance/attendees.ts` - provides filtered attendee ledger queries with finance projection fields.
- `app/api/dashboard/attendees/route.ts` - exposes authenticated attendee ledger JSON with validation-consistent errors.
- `app/dashboard/attendees/page.tsx` - renders attendee-centric ledger UI with filters, pagination, and detail links.
- `app/dashboard/attendees/[attendeeId]/page.tsx` - keeps attendee detail navigation live until the richer 04-02 screen lands.
- `app/dashboard/layout.tsx` - adds attendee navigation to the dashboard shell.

## Decisions Made
- Promoted attendee records to their own durable table so downstream attendee detail and room-allocation work can query stable identities directly.
- Kept sync resilient by reading embedded attendee arrays first and falling back to canonical order fetches only when needed.
- Reused the established filter-apply dashboard pattern so attendee operations match existing orders and reconciliation workflows.

## Verification Results

1. **Scoped sync response**
   - Authenticated `POST /api/ticket-tailor/sync` returned attendee-aware counts: `attendeesFetched: 4`, `attendeesUpserted: 4`, `attendeesSkipped: 0`.
2. **Database persistence**
   - `TicketTailorAttendee` contains 4 persisted rows linked to expected Ticket Tailor order/event identifiers.
3. **Authenticated attendee ledger**
   - Authenticated `GET /api/dashboard/attendees` returned 4 attendee rows with finance context and `roomStatus: "unassigned"`.
4. **Protected API contract**
   - Unauthenticated `GET /api/dashboard/attendees` returned `401` with `{ error: { code: "UNAUTHORIZED", message: "Authentication required" } }`.
5. **Dashboard routes**
   - Authenticated `/dashboard/attendees` and `/dashboard/attendees/[attendeeId]` both returned `200` on the local production server.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed attendee ledger relation filtering returning zero rows**
- **Found during:** Task 3 runtime verification
- **Issue:** Persisted attendees existed in SQLite, but the attendee ledger query returned zero rows because relation filters were shaped incorrectly.
- **Fix:** Switched Prisma attendee filters to explicit relation `is` clauses for order date and event-name search.
- **Files modified:** `lib/domain/finance/attendees.ts`
- **Verification:** Authenticated `GET /api/dashboard/attendees` returned 4 attendee rows after rebuild.
- **Committed in:** `9aa0841`

**2. [Rule 2 - Missing Critical] Added a live attendee detail placeholder route**
- **Found during:** Task 3 implementation review
- **Issue:** The attendee list linked operators to `/dashboard/attendees/[attendeeId]`, but without a route that navigation would have landed on a 404 before Plan 04-02.
- **Fix:** Added a lightweight placeholder detail page so navigation works now and Plan 04-02 can replace it with the full detail screen.
- **Files modified:** `app/dashboard/attendees/[attendeeId]/page.tsx`
- **Verification:** Authenticated `GET /dashboard/attendees/cmmxd4bfk000iyg8cna65bvl3` returned `200`.
- **Committed in:** `9aa0841`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes were necessary for correct attendee visibility and non-broken dashboard navigation. No architectural scope change.

## Authentication Gates

None.

## Issues Encountered
- Existing baseline lint warning in `app/layout.tsx` (`Geist` unused import) remains non-blocking and outside this plan scope.
- Next.js workspace-root and middleware deprecation warnings remained non-blocking during build/start verification.

## User Setup Required

None - no additional external service configuration required.

## Next Phase Readiness
- Durable attendee identities, attendee ledger API, and navigation handoff are ready for the richer attendee detail work in 04-02.
- Accommodation inventory work can assume attendee detail routes already exist and only needs to replace the placeholder screen.

---
*Phase: 04-attendee-data-accommodation-foundations*
*Completed: 2026-03-19*
