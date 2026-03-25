---
phase: 12-migrate-auth-to-convex
plan: "01"
subsystem: auth
tags: [better-auth, better-convex, convex, nextjs]

# Dependency graph
requires:
  - phase: 11-use-convex
    provides: Convex domain schema and generated function infrastructure
provides:
  - Convex-native Better Auth definition in `convex/functions/auth.ts`
  - Adapter-compatible singular auth tables (`user`, `session`, `account`, `verification`)
  - Prisma-free app auth entrypoint exported from `lib/auth.ts`
affects: [12-02-cutover-prisma-removal, auth-regression-tests, login-session-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Generated Better Convex auth runtime (`convex/functions/generated/auth.ts`) is source of truth for app auth runtime
    - `lib/auth.ts` remains the stable compatibility import for `auth.api.getSession({ headers })`

key-files:
  created:
    - convex/functions/auth.ts
    - convex/functions/generated/auth.runtime.ts
  modified:
    - convex/schema.ts
    - convex/functions/schema.ts
    - convex/functions/generated/auth.ts
    - convex/functions/_generated/api.d.ts
    - convex/functions/_generated/dataModel.d.ts
    - lib/auth.ts

key-decisions:
  - "Moved Better Auth configuration to `convex/functions/auth.ts` and consumed generated runtime in app code via `lib/auth.ts`."
  - "Renamed auth models from plural to singular in both schema files to align with better-convex adapter expectations."

patterns-established:
  - "Auth Runtime Pattern: configure Better Auth once in Convex auth definition and re-export generated runtime for Next.js routes/components."
  - "Schema Compatibility Pattern: keep both `convex/schema.ts` and `convex/functions/schema.ts` auth table definitions in lockstep for codegen stability."

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 12 Plan 01: Convex Auth Foundation Summary

**Convex-backed Better Auth runtime is now active with adapter-compatible auth tables, while `/api/auth/[...all]` and `lib/auth.ts` remain contract-stable for existing session consumers.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T22:16:23Z
- **Completed:** 2026-03-25T22:20:55Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Activated Better Convex auth runtime by adding `convex/functions/auth.ts` and regenerating auth bindings.
- Migrated auth schema models in both Convex schema files to singular adapter-compatible tables with required session/email lookup fields.
- Removed Prisma adapter usage from `lib/auth.ts` and kept app-wide auth consumption via the same exported `auth` symbol.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make Convex auth schema and generated runtime adapter-compatible** - `fd87ba0` (feat)
2. **Task 2: Rewire the app auth entrypoint to Convex while preserving the route contract** - `ec87dc1` (feat)

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `convex/functions/auth.ts` - Better Auth definition using `defineAuth` for Convex runtime.
- `convex/schema.ts` - Singular auth table models and required auth fields/indexes.
- `convex/functions/schema.ts` - Mirrored auth schema compatibility for generated server runtime.
- `convex/functions/generated/auth.ts` - Auth runtime switched from disabled (`missing_auth_file`) to enabled runtime export.
- `convex/functions/generated/auth.runtime.ts` - Generated procedure runtime registry for auth procedures.
- `convex/functions/_generated/api.d.ts` - Updated generated API references after auth/schema changes.
- `convex/functions/_generated/dataModel.d.ts` - Updated generated data model types for singular auth tables.
- `lib/auth.ts` - Prisma-free compatibility export of Convex-generated `auth` runtime.

## Decisions Made

- Consolidated Better Auth runtime configuration in Convex (`convex/functions/auth.ts`) and consumed generated `auth` in app code to keep route/session contract stable.
- Preserved existing environment fallback warnings in `lib/auth.ts` so local developer behavior is unchanged while backend storage moved to Convex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved codegen type cycle blocking auth runtime generation**

- **Found during:** Task 1 (Make Convex auth schema and generated runtime adapter-compatible)
- **Issue:** `npx better-convex codegen` failed with `default_export_unavailable` typing in generated auth runtime when `convex/functions/auth.ts` imported `defineAuth` from `./generated/auth`.
- **Fix:** Switched `convex/functions/auth.ts` to import `defineAuth` from `better-convex/auth`, then re-ran codegen successfully.
- **Files modified:** `convex/functions/auth.ts`, `convex/functions/generated/auth.ts`
- **Verification:** `npx better-convex codegen` and `npm run typecheck` both passed.
- **Committed in:** `fd87ba0`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Blocking fix was required to complete planned codegen activation; no scope creep.

## Issues Encountered

- Better Convex codegen initially failed due generated-auth import cycle typing; resolved by using package-level `defineAuth` import as expected by generator.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 12-02 can proceed with regression coverage and Prisma removal cutover.
- Remaining concern: local `.env` and `prisma/dev.db` are still dirty in working tree (not part of this plan commit set).

---

_Phase: 12-migrate-auth-to-convex_
_Completed: 2026-03-25_
