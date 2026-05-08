---
phase: 12-use-clerk-as-only-auth-remove-stale-better-auth
plan: 01
subsystem: auth
tags: [clerk, convex, nextjs, app-router, server-auth]
requires:
  - phase: 11-use-convex
    provides: Convex-backed app shell and lib/convex bridge layer.
  - phase: quick-260326-163-add-clerk-to-next-js-app-router
    provides: ClerkProvider root wiring and proxy-based Clerk entry setup.
provides:
  - Shared Clerk-native server auth helpers for API routes and pages.
  - Clerk-authenticated Convex client requests via ConvexProviderWithClerk.
  - Convex Clerk JWT issuer config aligned to audience `convex`.
affects: [12-02, 12-03, 12-04, auth, convex]
tech-stack:
  added: []
  patterns:
    - Shared server-side auth helpers in `lib/auth/server.ts` own the protected page/API contract.
    - Clerk `useAuth` is passed into `ConvexProviderWithClerk` so Convex receives authenticated session tokens.
key-files:
  created:
    - lib/auth/server.ts
    - .planning/phases/12-use-clerk-as-only-auth-remove-stale-better-auth/12-USER-SETUP.md
    - .planning/phases/12-use-clerk-as-only-auth-remove-stale-better-auth/12-01-SUMMARY.md
  modified:
    - lib/convex/client.tsx
    - convex/auth.config.ts
key-decisions:
  - Preserve the existing `UNAUTHORIZED` JSON payload in one Clerk-native helper so route migrations can stay contract-compatible.
  - Keep `ClerkProvider` outside `ConvexClientProvider` and switch only the inner Convex bridge to `ConvexProviderWithClerk`.
patterns-established:
  - "Protected server code should import `requireApiUser` or `requirePageUser` from `lib/auth/server.ts` instead of calling Better Auth directly."
  - "Convex client auth uses Clerk's `useAuth` hook and the `convex` JWT audience."
requirements-completed: []
duration: 1 min
completed: 2026-03-26
---

# Phase 12 Plan 01: Create Clerk server auth helpers and wire Convex to authenticated Clerk sessions Summary

**Clerk now owns the shared server auth contract and forwards signed-in session tokens to Convex through `ConvexProviderWithClerk`.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-26T00:31:49Z
- **Completed:** 2026-03-26T00:33:20Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `lib/auth/server.ts` with reusable Clerk-native helpers for API 401 responses and page redirects.
- Switched the client Convex bridge from anonymous requests to `ConvexProviderWithClerk` using Clerk `useAuth`.
- Kept Convex auth config aligned to Clerk issuer-domain env wiring and the `convex` audience.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared Clerk server auth helpers** - `869bf2a` (feat)
2. **Task 2: Wire Convex to Clerk-authenticated requests** - `93514f1` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `lib/auth/server.ts` - shared Clerk server helpers for protected API routes and server-rendered pages.
- `lib/convex/client.tsx` - Clerk-aware Convex provider bridge using `ConvexProviderWithClerk`.
- `convex/auth.config.ts` - normalized Clerk JWT issuer config for Convex.
- `.planning/phases/12-use-clerk-as-only-auth-remove-stale-better-auth/12-USER-SETUP.md` - required Clerk and Convex dashboard configuration checklist.
- `.planning/phases/12-use-clerk-as-only-auth-remove-stale-better-auth/12-01-SUMMARY.md` - execution summary for this plan.

## Decisions Made

- Preserved the legacy `UNAUTHORIZED` response payload exactly so API route migrations can switch auth providers without changing clients.
- Centralized page and route auth entrypoints in `lib/auth/server.ts` rather than spreading direct Clerk calls through each consumer.
- Kept the existing root provider order with `ClerkProvider` outside the Convex/query/theme stack while making Convex itself Clerk-aware.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See [12-USER-SETUP.md](./12-USER-SETUP.md) for:

- Environment variables to add
- Clerk JWT template / audience setup
- Convex deployment issuer-domain configuration

## Next Phase Readiness

- Ready for `12-02-PLAN.md` to migrate dashboard route protection and login/logout UX onto the shared Clerk helpers.
- Convex now has the required client/provider bridge in place; remaining auth work can assume Clerk identity is the single source of truth.

---

_Phase: 12-use-clerk-as-only-auth-remove-stale-better-auth_
_Completed: 2026-03-26_
