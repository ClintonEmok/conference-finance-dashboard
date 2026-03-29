---
phase: 18-dual-source-event-signup-platform
plan: 01
subsystem: api
tags: [convex, signup, schema, catalog, typescript]

# Dependency graph
requires:
  - phase: 17-fix-critical-code-review-issues
    provides: hardened Convex auth/runtime baseline and accommodation assignment invariants
provides:
  - Canonical additive signup tables and reason-code contracts
  - Public source-aware signup catalog query with bounded indexed reads
  - Typed client hook and UI-safe domain adapter for catalog consumption
affects: [18-02, 18-03, 19-01, 19-02, 19-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Additive canonical signup tables coexist with legacy ticketTailor tables
    - Public signup reads use index-first bounded `.take()` queries with explicit return validators

key-files:
  created:
    - convex/signupCatalog.ts
    - lib/types/signup.ts
    - lib/convex/hooks/signup.ts
    - lib/domain/signup/catalog.ts
  modified:
    - convex/schema.ts
    - convex/_generated/api.d.ts
    - convex/_generated/dataModel.d.ts

key-decisions:
  - "Keep canonical signup entities additive (`signup*`) without changing legacy provider tables."
  - "Expose unavailable ticket/accommodation states as machine-readable lower_snake_case reason codes in shared contracts."
  - "Use bounded index-first reads (`withIndex` + `take`) for public catalog assembly across events, tickets, and accommodation slots."

patterns-established:
  - "Public signup contract pattern: one source-aware event object with nested tickets and accommodation readiness payload."
  - "Hook + domain adapter pattern: Convex hook consumes generated API query, domain normalizer guarantees UI-safe null/array values."

# Metrics
duration: 18min
completed: 2026-03-29
---

# Phase 18 Plan 01: Canonical Signup Contracts Summary

**Source-aware public signup catalog now ships as one bounded Convex contract covering events, ticket selectability reasons, and accommodation eligibility with assignable slot summaries.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-29T20:28:16Z
- **Completed:** 2026-03-29T20:45:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added canonical `signupEvents`, `signupTicketTypes`, and `signupAccommodationSlots` schema tables with required indexes.
- Implemented `getPublicSignupCatalog` with args/returns validators and bounded indexed reads only.
- Added shared signup reason-code types, a new signup hook, and a UI-safe catalog normalization adapter.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add canonical signup domain schema (additive only)** - `dddeec4` (feat)
2. **Task 2: Implement bounded public signup catalog contract** - `9c366c1` (feat)

**Plan metadata:** Pending in next docs commit

## Files Created/Modified

- `convex/schema.ts` - Added additive canonical signup tables and required lookup indexes.
- `lib/types/signup.ts` - Added stable ticket/accommodation reason-code unions.
- `convex/signupCatalog.ts` - Added `getPublicSignupCatalog` public query with full validators and bounded index-first reads.
- `lib/convex/hooks/signup.ts` - Added `usePublicSignupCatalog()` hook bound to generated Convex API.
- `lib/domain/signup/catalog.ts` - Added catalog normalization adapter for UI-safe null/array handling.
- `convex/_generated/api.d.ts` - Refreshed generated function references to include `signupCatalog.getPublicSignupCatalog`.
- `convex/_generated/dataModel.d.ts` - Refreshed generated table/type bindings for new signup schema.

## Decisions Made

- Kept legacy `ticketTailor*` tables untouched and introduced additive canonical `signup*` tables for DOM-01 compatibility safety.
- Encoded ticket and accommodation state reasons as stable lower_snake_case string unions to support machine-readable UI behavior.
- Included accommodation slot summaries with room/room-type labels and assignable flags in the same public contract to unblock Phase 19 room-step UX.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Refreshed stale Convex generated bindings after schema/query addition**

- **Found during:** Task 2 (bounded public signup catalog contract)
- **Issue:** New `signupCatalog` function and `signup*` tables were not available in generated API/data model types, blocking hook/query type-checking.
- **Fix:** Ran `npx convex codegen` and included refreshed generated bindings.
- **Files modified:** `convex/_generated/api.d.ts`, `convex/_generated/dataModel.d.ts`
- **Verification:** `npm run typecheck` passes and generated API now includes `signupCatalog.getPublicSignupCatalog`.
- **Committed in:** `9c366c1` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary to keep Convex contract types synchronized; no scope creep.

## Issues Encountered

- Initial TypeScript nullability and id typing mismatches in `convex/signupCatalog.ts` were resolved by tightening map guards and generated-table id types.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 18-02 atomic submission mutation work on top of canonical signup event/ticket/accommodation tables.
- Public catalog contract and hook are available for Phase 19 multi-step signup UI integration.

---

_Phase: 18-dual-source-event-signup-platform_
_Completed: 2026-03-29_
