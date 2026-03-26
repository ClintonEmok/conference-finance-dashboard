---
phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
plan: "01"
subsystem: infra
tags: [convex, clerk, api, server-bridge, codegen]
requires:
  - phase: 12-use-clerk-as-only-auth-remove-stale-better-auth
    provides: Clerk-authenticated Convex client wiring and shared auth helpers.
provides:
  - Canonical top-level Convex module tree under `convex/`
  - Generated API imports aligned to `convex/_generated/*`
  - Typed Clerk-aware server bridge with generated function refs
affects: [13-02, 13-03, 13-04, 13-05, convex, api]
tech-stack:
  added: []
  patterns:
    - "Server-side Convex access now flows through generated refs plus Clerk JWT auth in `lib/convex/server.ts`."
    - "Top-level `convex/` is the sole canonical function tree for codegen and imports."
key-files:
  created:
    - convex/orders.ts
    - convex/attendees.ts
    - convex/events.ts
    - convex/accommodation.ts
    - convex/payments.ts
    - convex/tikkie.ts
    - convex/sync.ts
  modified:
    - convex.json
    - lib/convex/api.ts
    - lib/convex/server.ts
    - lib/convex/hooks/attendees.ts
    - lib/convex/hooks/payments.ts
    - lib/convex/hooks/sync.ts
    - lib/convex/hooks/tikkie.ts
key-decisions:
  - "Switched server-side Convex calls to generated function refs via `fetchQuery`/`fetchMutation` while keeping a temporary legacy ref map for old callers."
  - "Regenerated bindings from the top-level `convex/` directory and removed the duplicate `convex/functions/schema.ts` source."
patterns-established:
  - "Import generated refs from `@/lib/convex/api` instead of nested generated paths."
  - 'Use Clerk `getToken({ template: "convex" })` in the shared server bridge for authenticated server-side Convex calls.'
requirements-completed: []
duration: 32 min
completed: 2026-03-26
---

# Phase 13 Plan 01: Canonicalize the Convex app tree and build the typed Clerk-aware server bridge foundation Summary

**Top-level Convex modules, generated refs, and a Clerk-aware typed server bridge now form the canonical backend foundation for the phase.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-03-26T07:30:00Z
- **Completed:** 2026-03-26T08:02:17Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Moved the domain Convex modules from `convex/functions/*.ts` into the canonical top-level `convex/*.ts` tree and pointed codegen at that root.
- Re-exported generated refs from `@/convex/_generated/api` without the old `any` cast.
- Replaced raw HTTP path dispatch in `lib/convex/server.ts` with a typed Clerk-authenticated bridge built on generated function references.

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonicalize the Convex app tree and generated import paths** - `f254d36` (feat)
2. **Task 2: Build a typed Clerk-aware server bridge and remove `any` API access** - `88c909d` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `convex.json` - points Convex codegen at the canonical top-level `convex` directory.
- `convex/orders.ts`, `convex/attendees.ts`, `convex/events.ts`, `convex/accommodation.ts`, `convex/payments.ts`, `convex/tikkie.ts`, `convex/sync.ts` - canonical Convex modules moved to top-level routing.
- `lib/convex/api.ts` - re-exports generated refs from `@/convex/_generated/api` without `any` erasure.
- `lib/convex/server.ts` - shared Clerk-aware typed query/mutation bridge plus temporary legacy ref map.
- `lib/convex/hooks/*.ts` - adjusted hook signatures to match stricter generated id types after canonical codegen.

## Decisions Made

- Used Convex's Next.js fetch helpers with generated refs instead of manual `/api/query` and `/api/mutation` path dispatch.
- Kept a temporary legacy string-to-ref compatibility map in the shared bridge so downstream migrations can land incrementally before final cleanup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated client hook signatures for regenerated Convex id types**

- **Found during:** Task 1 (canonical app tree migration)
- **Issue:** top-level codegen tightened several hook argument types from plain strings to branded Convex ids, breaking typecheck.
- **Fix:** updated attendee, payments, sync, and Tikkie hooks to use generated id types or the string-id helper where appropriate.
- **Files modified:** `lib/convex/hooks/attendees.ts`, `lib/convex/hooks/payments.ts`, `lib/convex/hooks/sync.ts`, `lib/convex/hooks/tikkie.ts`
- **Verification:** `npm run typecheck`
- **Committed in:** `f254d36`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the regenerated top-level bindings compiling cleanly. No scope creep.

## Issues Encountered

- No product or auth regressions surfaced; the main issue was type fallout from the stricter regenerated id signatures, which was fixed inside the plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Orders/reporting, attendees/accommodation, and payments/Tikkie slices can now migrate from raw string dispatch to generated refs on top of the shared server bridge.
- Final legacy string support still remains intentionally in `lib/convex/server.ts` until downstream callers are migrated.

---

_Phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts_
_Completed: 2026-03-26_
