---
phase: 17-fix-critical-code-review-issues
plan: "01"
subsystem: auth
tags: [convex, clerk, auth-guard, security]

requires:
  - phase: 12-01-clerk-auth-migration
    provides: Clerk auth provider, ConvexProviderWithClerk client bridge
provides:
  - Shared Convex auth guard helper (`requireIdentity`)
  - Auth-hardened public write mutations across 7 Convex modules (54 mutations)
  - Rejection of unauthenticated Convex write callers
affects:
  - Phase 17 (remaining plans build on this auth foundation)
  - Phase 18-21 (all future Convex mutations must use requireIdentity)

tech-stack:
  added: []
  patterns:
    - "Convex auth guard: shared `requireIdentity(ctx)` helper called at top of every public mutation"
    - "Server-side dashboard gating: `requirePageUser` in layout protects all client components from unauthenticated Convex query load errors"

key-files:
  created:
    - convex/auth.ts - Shared auth guard helper (requireIdentity)
  modified:
    - convex/attendees.ts - Auth on 6 public mutations
    - convex/orders.ts - Auth on 4 public mutations
    - convex/payments.ts - Auth on 6 public mutations
    - convex/tikkie.ts - Auth on 9 public mutations
    - convex/accommodation.ts - Auth on 18 public mutations
    - convex/events.ts - Auth on 2 public mutations
    - convex/sync.ts - Auth on 12 public mutations

key-decisions:
  - "Used shared helper pattern instead of inline ctx.auth.getUserIdentity() calls for DRY consistency and future guard policy changes"
  - "requireIdentity returns UserIdentity for downstream use (e.g., logging, audit) without requiring a second auth call"
  - "No client-side <Authenticated> guard needed: dashboard layout uses server-side requirePageUser, preventing unauthenticated access to Convex hook consumers"

patterns-established:
  - "Convex mutation auth pattern: import requireIdentity from ./auth, call as first statement in handler"

requirements-completed: []

duration: 113min
completed: 2026-03-28
---

# Phase 17 Plan 01: Convex Auth Guard Hardening Summary

**Shared `requireIdentity` auth guard applied to all 54 public Convex write mutations across 7 modules, preventing unauthenticated write access to finance, sync, attendee, order, payment, tikkie, and accommodation data.**

## Performance

- **Duration:** 113 min
- **Started:** 2026-03-28T18:08:52Z
- **Completed:** 2026-03-28T20:02:25Z
- **Tasks:** 2 (create helper + apply to 7 modules)
- **Files modified:** 8

## Accomplishments

- Created reusable `convex/auth.ts` with `requireIdentity()` helper that calls `ctx.auth.getUserIdentity()` and throws `Unauthorized` when absent
- Applied auth guard to 54 public mutations across 7 Convex modules (attendees, orders, payments, tikkie, accommodation, events, sync)
- Verified TypeScript compiles cleanly with `npx tsc --noEmit`
- Confirmed all client components are protected by server-side `requirePageUser` in dashboard layout (no `<Authenticated>` wrapper needed)

## Task Commits

1. **Create shared Convex auth guard** - `d3414bf` (feat)
2. **Auth guards: attendees.ts** - `e58ff38` (fix)
3. **Auth guards: orders.ts** - `8af3638` (fix)
4. **Auth guards: payments.ts** - `c8cbade` (fix)
5. **Auth guards: tikkie.ts** - `3de9364` (fix)
6. **Auth guards: accommodation.ts** - `65f6d83` (fix)
7. **Auth guards: events.ts** - `71d3c36` (fix)
8. **Auth guards: sync.ts** - `b40ebfa` (fix)

**Plan metadata:** _(pending)_

## Files Created/Modified

- `convex/auth.ts` - Shared auth guard helper with `requireIdentity(ctx)` function
- `convex/attendees.ts` - 6 mutations guarded (createAttendee, upsertAttendee, updateAttendee, assignRoom, unassignRoom, checkInAttendee)
- `convex/orders.ts` - 4 mutations guarded (createOrder, upsertOrder, updateOrderStatus, removeOrderLocally)
- `convex/payments.ts` - 6 mutations guarded (createPayment, upsertTikkiePayment, cleanupLegacyTikkiePayments, assignPaymentToOrder, unassignPayment, autoMatchPayments)
- `convex/tikkie.ts` - 9 mutations guarded (createPaymentLink, updatePaymentLinkStatus, create/update/deletePaymentTemplate, createEventPaymentLink, upsertTikkiePayment, matchTikkiePayment, autoMatchTikkiePayments)
- `convex/accommodation.ts` - 18 mutations guarded (CRUD for hotels/rooms/roomTypes, assign/unassign, link/unlink event-hotels)
- `convex/events.ts` - 2 mutations guarded (createEvent, upsertEvent)
- `convex/sync.ts` - 12 mutations guarded (sync runs, webhook events, Ticket Tailor upserts, family groups)

## Decisions Made

- Used shared helper pattern instead of inline `ctx.auth.getUserIdentity()` calls for DRY consistency and future guard policy changes
- `requireIdentity` returns `UserIdentity` for downstream use (audit logging, ownership checks) without a second auth call
- No client-side `<Authenticated>` wrapper needed: dashboard layout uses server-side `requirePageUser` which prevents unauthenticated users from reaching any Convex hook consumers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - typecheck passed on first attempt, all guards applied cleanly.

## Next Phase Readiness

- Auth foundation complete for all Convex write mutations
- Remaining Phase 17 plans (17-02 through 17-09) can build on this auth pattern
- Future Convex mutations should `import { requireIdentity } from "./auth"` and call it as the first handler statement

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-28_
