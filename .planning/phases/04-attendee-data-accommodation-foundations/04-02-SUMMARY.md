---
phase: 04-attendee-data-accommodation-foundations
plan: 02
subsystem: ui
tags: [attendees, accommodation, prisma, dashboard, nextjs, tikkie]

# Dependency graph
requires:
  - phase: 04-attendee-data-accommodation-foundations
    provides: Durable attendee identities, attendee ledger API, and attendee navigation handoff
  - phase: 03-finance-visibility-reconciliation
    provides: Tikkie link history and dashboard interaction patterns reused in attendee detail
provides:
  - Attendee detail API and screen with payment summary, installment progress, and room-status projection
  - Accommodation inventory foundation for hotels, room types, and rooms with protected create/list APIs
  - Dashboard accommodation page and navigation ready for future assignment workflows
affects: [phase-05-room-allocation, phase-05-flow-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Represent accommodation inventory explicitly as hotel -> room type -> room before assignment logic is introduced
    - Keep attendee detail finance projection aligned with canonical order status and Tikkie history instead of inferring from raw payloads alone

key-files:
  created:
    - prisma/migrations/20260319111221_accommodation_inventory_foundation/migration.sql
    - lib/domain/accommodation/inventory.ts
    - lib/domain/finance/attendee-detail.ts
    - app/api/dashboard/accommodation/hotels/route.ts
    - app/api/dashboard/accommodation/room-types/route.ts
    - app/api/dashboard/accommodation/rooms/route.ts
    - app/api/dashboard/attendees/[attendeeId]/route.ts
    - app/dashboard/accommodation/page.tsx
  modified:
    - prisma/schema.prisma
    - app/dashboard/attendees/[attendeeId]/page.tsx
    - app/dashboard/layout.tsx

key-decisions:
  - "Add nullable `assignedRoomId` on attendees now so Phase 5 can attach room assignments without remapping attendee identity again."
  - "Model accommodation inventory with separate hotel, room type, and room tables so operators can define reusable structure before assignments start."
  - "Keep attendee detail outstanding balance status-aware so paid and refunded attendees do not appear to owe money just because they have no Tikkie link history."

patterns-established:
  - "Protected inventory CRUD pattern: dedicated route per resource with shared BAD_REQUEST/UNAUTHORIZED contracts and domain-layer validation."
  - "Attendee detail pattern: server detail aggregate joins attendee, order, event, Tikkie history, and future room assignment placeholder in one payload."

# Metrics
duration: 7min
completed: 2026-03-19
---

# Phase 4 Plan 02: Attendee Detail and Accommodation Inventory Summary

**Operators can now open attendee detail with finance context and define hotel, room type, and room inventory in the dashboard ahead of room assignment workflows.**

## Performance

- **Duration:** 6m 49s
- **Started:** 2026-03-19T11:13:04Z
- **Completed:** 2026-03-19T11:19:53Z
- **Tasks:** 4 (3 build tasks + 1 human verification checkpoint)
- **Files modified:** 11

## Accomplishments
- Added accommodation inventory models plus protected create/list APIs for hotels, room types, and rooms.
- Replaced the attendee placeholder route with a real detail API and page showing payment summary, installment progress, payment history, outstanding balance, and room-status state.
- Added `/dashboard/accommodation` with inline create flows, persisted inventory reloads, and dashboard navigation access.
- Completed human verification approval for attendee detail behavior, accommodation persistence, navigation, and unauthorized API protection.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add accommodation inventory foundation models and protected CRUD APIs** - `708c349` (feat)
2. **Task 2: Build attendee detail query, protected API, and detail screen** - `7c7dc99` (feat)
3. **Task 3: Add accommodation inventory dashboard page and wire navigation** - `0daee3d` (feat)

Additional stabilization commits (auto-fixed during execution):
- `e207741` (fix): keep paid attendee balances at zero

## Files Created/Modified
- `prisma/schema.prisma` - adds accommodation inventory models and nullable attendee room assignment reference.
- `prisma/migrations/20260319111221_accommodation_inventory_foundation/migration.sql` - creates hotels, room types, rooms, and attendee room-link column.
- `lib/domain/accommodation/inventory.ts` - centralizes inventory validation, parent checks, and list/create helpers.
- `app/api/dashboard/accommodation/hotels/route.ts` - protected hotel list/create API.
- `app/api/dashboard/accommodation/room-types/route.ts` - protected room type list/create API.
- `app/api/dashboard/accommodation/rooms/route.ts` - protected room list/create API.
- `lib/domain/finance/attendee-detail.ts` - attendee detail aggregate including finance projection, payment history, and room status.
- `app/api/dashboard/attendees/[attendeeId]/route.ts` - protected attendee detail JSON contract with 400/401/404 handling.
- `app/dashboard/attendees/[attendeeId]/page.tsx` - attendee detail screen with summary cards, order context, room status, and payment history.
- `app/dashboard/accommodation/page.tsx` - accommodation inventory management UI with persisted reloads and inline errors.
- `app/dashboard/layout.tsx` - adds accommodation navigation beside attendees and existing dashboard destinations.

## Decisions Made
- Added the attendee-to-room foreign key now, but kept assignment behavior out of scope so Phase 5 can focus on action flows instead of schema invention.
- Kept accommodation inventory split into hotel, room type, and room entities so rooms can reuse type metadata while still tracking room-specific capacity.
- Used canonical order status to zero out outstanding balances for paid/refunded attendees even when Tikkie history is absent.

## Verification Results

1. **Attendee detail API**
   - Authenticated `GET /api/dashboard/attendees/cmmxd4bfk000iyg8cna65bvl3` returned attendee identity, order context, finance summary, empty payment history, and `roomStatus: "unassigned"`.
2. **Accommodation persistence**
   - Created hotel `Grace House`, room type `Triple Ensuite`, and room `GH-301`; subsequent authenticated list calls returned all three persisted records.
3. **Protected API contract**
   - Unauthenticated `GET /api/dashboard/accommodation/hotels` returned `401` with `{ error: { code: "UNAUTHORIZED", message: "Authentication required" } }`.
4. **Dashboard routes**
   - Authenticated `/dashboard/attendees/[attendeeId]` and `/dashboard/accommodation` returned `200` on the local production server.
5. **Human verification**
   - User approved the attendee detail and accommodation flows at the checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented paid attendees from showing false outstanding balances**
- **Found during:** Post-build runtime verification after Task 3
- **Issue:** A paid attendee with no Tikkie history showed the full order amount as outstanding on the detail screen.
- **Fix:** Made attendee detail outstanding balance respect canonical order status so paid/refunded attendees resolve to zero outstanding by default.
- **Files modified:** `lib/domain/finance/attendee-detail.ts`
- **Verification:** Authenticated attendee detail API returned `outstandingAmountMinor: 0` for a paid attendee after rebuild.
- **Committed in:** `e207741`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was required for correct finance presentation; no scope creep or architectural change.

## Authentication Gates

None.

## Issues Encountered
- Existing baseline lint warning in `app/layout.tsx` (`Geist` unused import) remains non-blocking and outside this plan scope.
- Next.js workspace-root and middleware deprecation warnings remained non-blocking during build/start verification.

## User Setup Required

None - no additional external service configuration required.

## Next Phase Readiness
- Phase 4 goals are satisfied: attendee identities, attendee detail, and accommodation inventory are now in place.
- Phase 5 can focus directly on room assignment actions, occupancy indicators, and cross-screen flow polish.

---
*Phase: 04-attendee-data-accommodation-foundations*
*Completed: 2026-03-19*
