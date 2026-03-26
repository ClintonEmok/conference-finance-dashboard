---
phase: 12-use-clerk-as-only-auth-remove-stale-better-auth
plan: "03"
subsystem: auth
tags: [clerk, nextjs, api, auth, vitest, convex]

requires:
  - phase: 12-use-clerk-as-only-auth-remove-stale-better-auth
    provides: Clerk server auth helpers, dashboard Clerk guards, and Clerk-backed Convex auth wiring
provides:
  - Clerk-backed protection across operator-facing API routes
  - Clerk-based regression coverage for protected sync and Tikkie routes
  - Convex-aware Tikkie test fixtures that preserve protected route contract checks
affects: [12-04 cleanup, auth migration verification, protected api routes]

tech-stack:
  added: []
  patterns:
    [
      shared requireApiUser guard for route handlers,
      Clerk helper mocks in route tests,
      Convex fetch stubs for backend route regression tests,
    ]

key-files:
  created: []
  modified:
    - app/api/protected/ping/route.ts
    - app/api/dashboard/orders/route.ts
    - app/api/dashboard/accommodation/assignments/route.ts
    - tests/ticket-tailor/sync-route.test.ts
    - tests/tikkie/subscription-route.test.ts
    - tests/tikkie/tikkie-links.test.ts
    - lib/domain/finance/tikkie-links.ts

key-decisions:
  - "Use requireApiUser across protected operator routes so Clerk preserves the existing 401 JSON contract centrally."
  - "Mock lib/auth/server in protected route tests instead of Better Auth session objects to keep auth-source changes localized."

patterns-established:
  - "Protected API routes return early when requireApiUser yields a NextResponse."
  - "Auth-sensitive route tests should mock Clerk helpers, not provider-specific session payloads."

requirements-completed: []
duration: 8 min
completed: 2026-03-26
---

# Phase 12 Plan 03: Protected API Clerk Migration Summary

**Clerk-backed operator API guards with preserved 401 contracts and updated protected-route regression tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-26T00:36:43Z
- **Completed:** 2026-03-26T00:45:09Z
- **Tasks:** 2
- **Files modified:** 37

## Accomplishments

- Replaced Better Auth session reads with `requireApiUser()` across finance, payment, dashboard, sync, and accommodation route handlers.
- Preserved the established `{ error: { code: "UNAUTHORIZED", message: "Authentication required" } }` contract for signed-out operator APIs.
- Updated the named Clerk-sensitive regression tests to mock the shared Clerk helper and pass against the current Convex-backed Tikkie domain flow.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace finance, payment, dashboard, and sync route guards with Clerk** - `3e93c55` (feat)
2. **Task 2: Replace accommodation route guards and update auth-sensitive tests** - `5cbdb05` (fix)

## Files Created/Modified

- `app/api/protected/ping/route.ts` - Reference protected route now uses `requireApiUser()`.
- `app/api/dashboard/orders/route.ts` - Dashboard ledger routes now rely on the shared Clerk guard.
- `app/api/dashboard/accommodation/assignments/route.ts` - Accommodation assignment routes now share the Clerk API auth helper.
- `app/api/admin/tikkie/subscription/route.ts` - Admin subscription setup now authenticates with Clerk.
- `tests/ticket-tailor/sync-route.test.ts` - Sync route coverage now mocks `lib/auth/server`.
- `tests/tikkie/subscription-route.test.ts` - Tikkie admin route coverage now uses Clerk helper responses.
- `tests/tikkie/tikkie-links.test.ts` - Protected route and Tikkie regression fixtures now stub Convex-backed data access.
- `lib/domain/finance/tikkie-links.ts` - Preserves notification-key and freshness fields used by existing Tikkie route coverage.

## Decisions Made

- Reused `requireApiUser()` everywhere instead of inlining Clerk `auth()` checks route-by-route, keeping the unauthorized contract centralized.
- Shifted auth-sensitive tests to mock the shared Clerk helper so future auth-provider changes stay isolated from route business assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restore Tikkie freshness and notification-key propagation in Convex-backed link mapping**

- **Found during:** Task 2 (Replace accommodation route guards and update auth-sensitive tests)
- **Issue:** Existing Tikkie regression coverage depended on `providerLastCheckedAt` freshness data and duplicate notification keys, but the Convex-backed link mapper/mutation payload no longer preserved those values.
- **Fix:** Extended `lib/domain/finance/tikkie-links.ts` to carry `providerLastCheckedAt`, `createdAt`, `updatedAt`, and `providerNotificationKey` through the Convex-backed code path.
- **Files modified:** `lib/domain/finance/tikkie-links.ts`
- **Verification:** `npm run typecheck`; `npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/tikkie-links.test.ts`
- **Committed in:** `5cbdb05`

**2. [Rule 3 - Blocking] Rebuild stale Tikkie route fixtures around Convex fetch stubs**

- **Found during:** Task 2 (Replace accommodation route guards and update auth-sensitive tests)
- **Issue:** The named Tikkie regression file still assumed Prisma-backed data access, so the required auth-sensitive test run failed once the route suite exercised the current Convex-backed domain module.
- **Fix:** Reworked the test fixtures to mock `requireApiUser`, seed `NEXT_PUBLIC_CONVEX_URL`, and stub Convex HTTP fetch responses while preserving the explicit unauthorized assertions.
- **Files modified:** `tests/tikkie/tikkie-links.test.ts`, `tests/tikkie/subscription-route.test.ts`
- **Verification:** `npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/tikkie-links.test.ts`
- **Committed in:** `5cbdb05`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary to preserve the existing protected-route contracts under the current Convex-backed implementation. No product scope changed.

## Issues Encountered

- A bulk auth-guard replacement left `app/api/dashboard/accommodation/event-hotels/route.ts` returning an undefined `session` symbol; fixed before final typecheck.
- The Tikkie regression file was still wired for pre-Convex persistence and needed fixture modernization before the required Clerk-auth test run could pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Protected operator-facing API routes now authenticate through Clerk and no longer call `auth.api.getSession`.
- Phase 12-04 can focus on removing stale Better Auth runtime files/packages and performing final human auth verification.
- Repo-wide lint still has unrelated pre-existing failures outside this plan's touched files.

---

_Phase: 12-use-clerk-as-only-auth-remove-stale-better-auth_
_Completed: 2026-03-26_
