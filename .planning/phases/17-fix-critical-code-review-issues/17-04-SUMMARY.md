---
phase: 17-fix-critical-code-review-issues
plan: "04"
subsystem: infra
tags: [convex, cron, sync, decoupling, internal-actions]

requires:
  - phase: 17-fix-critical-code-review-issues
    provides: "17-03 transport hardening (retry, timeouts, rate limiting)"
provides:
  - Eliminated circular Convex cron -> app HTTP -> Convex sync path
  - Auto-sync now calls internal sync logic directly via ctx.runMutation/runQuery
  - External API calls (Ticket Tailor, Tikkie) made directly from Convex actions
  - Auth-free internal mutation/query wrappers for cron-triggered operations
affects: [18, 19, 20, 21]

tech-stack:
  added: []
  patterns:
    - "Internal mutation wrappers: extract DB logic into auth-free internalMutation/internalQuery for cron use"
    - "Direct external API from Convex actions: fetch Ticket Tailor/Tikkie APIs without HTTP roundtrip through app routes"
    - "Shared DB logic pattern: public mutations keep auth guard; internal mutations share same DB operations"

key-files:
  created: []
  modified:
    - convex/autoSync.ts - Complete rewrite: direct Convex + external API calls instead of HTTP to app routes
    - convex/sync.ts - Added 7 internalMutation + 6 internalQuery wrappers for auth-free cron access
    - convex/payments.ts - Added 3 internalMutation wrappers for Tikkie sync operations
    - convex/_generated/api.d.ts - Regenerated types with new internal function references

key-decisions:
  - "Internal mutations mirror public mutations without requireIdentity: cron actions run as system-level operations without user identity"
  - "Ticket Tailor HTTP client inlined in autoSync.ts: avoids importing lib/convex/server.ts which depends on @clerk/nextjs/server"
  - "Tikkie sync reimplements matching logic inline: autoMatchPayments runs directly in action using ctx.runQuery for reads and ctx.runMutation for writes"
  - "Removed APP_URL and TIKKIE_SYNC_CRON_SECRET from auto-sync: no longer needed since actions don't make HTTP calls back to the app"

patterns-established:
  - "Cron-to-internal-mutation pattern: Convex crons -> internalAction -> ctx.runMutation(internal.*) instead of fetch(app_url/api/*)"
  - "Auth-free internal wrappers: duplicate mutation logic without requireIdentity for system-level operations"

requirements-completed: []

duration: 8min
completed: 2026-03-29
---

# Phase 17 Plan 04: Remove Circular Convex Cron to HTTP Sync Path Summary

**Auto-sync actions now call Convex mutations directly and fetch external APIs inline, eliminating the Convex → app HTTP → Convex roundtrip**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T00:18:26Z
- **Completed:** 2026-03-29T00:26:38Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Eliminated circular dependency: Convex cron → app HTTP route → Convex mutation
- `autoSyncTicketTailor` now calls Ticket Tailor API directly and writes via `ctx.runMutation(internal.sync.*)`
- `autoSyncTikkiePayments` now calls Tikkie API directly and writes via `ctx.runMutation(internal.payments.*)`
- Created 7 internalMutation and 6 internalQuery wrappers in `convex/sync.ts` (auth-free for cron use)
- Created 3 internalMutation wrappers in `convex/payments.ts` for Tikkie payment operations
- Removed `APP_URL` and `TIKKIE_SYNC_CRON_SECRET` env var dependencies from auto-sync
- Cron targets in `convex/crons.ts` remain on `internal.autoSync.*` (unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove circular Convex cron to HTTP sync path** - `e0e0d06` (feat)

## Files Created/Modified

- `convex/autoSync.ts` - Complete rewrite: ~880 lines, direct external API + Convex mutation calls
- `convex/sync.ts` - Added internal mutation/query wrappers (~350 lines added)
- `convex/payments.ts` - Added internal mutation wrappers (~157 lines added)
- `convex/_generated/api.d.ts` - Regenerated with new internal function type references

## Decisions Made

- Internal mutations mirror public mutations without `requireIdentity`: cron actions run as system-level operations without user identity context
- Ticket Tailor HTTP client inlined in `autoSync.ts`: avoids importing `lib/convex/server.ts` which depends on `@clerk/nextjs/server` (unavailable in Convex action runtime)
- Tikkie sync reimplements matching logic inline: `autoMatchPayments` runs directly in action using `ctx.runQuery` for reads and `ctx.runMutation` for writes
- `fetchMutation`/`fetchQuery` from `convex/nextjs` no longer needed: actions use native `ctx.runMutation`/`ctx.runQuery` instead

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- All Convex mutations used `requireIdentity(ctx)` which fails for internal action calls (no user identity) — solved by creating auth-free internal mutation wrappers
- `lib/convex/server.ts` imports `@clerk/nextjs/server` which doesn't work in Convex action runtime — avoided by using `ctx.runMutation`/`ctx.runQuery` instead of importing the sync functions

## Next Phase Readiness

- Circular HTTP dependency eliminated for both Ticket Tailor and Tikkie auto-sync
- Internal mutation/query pattern established for future cron-triggered operations
- Ready for 17-07 or remaining plans in phase 17

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-29_
