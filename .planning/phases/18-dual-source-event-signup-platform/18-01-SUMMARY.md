---
phase: 18-dual-source-event-signup-platform
plan: 01
subsystem: database
tags: [convex, schema, signup, contracts, hooks]

# Dependency graph
requires:
  - phase: 17-fix-critical-code-review-issues
    provides: Bounded Convex read patterns and shared validator conventions
provides:
  - Additive canonical signup tables (`events`, `eventSources`, `ticketTypes`, `accommodationSlots`) with required indexes
  - Public bounded Convex catalog query (`signupCatalog.getPublicSignupCatalog`) with args/returns validators
  - Typed signup domain adapter and hook for source-aware public catalog consumption
affects: [18-02, 19-public-signup-pages, 20-admin-event-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Index-first bounded public reads (`withIndex + take`) for signup catalog contracts
    - Canonical reason-code unions shared via `lib/types/signup.ts`

key-files:
  created: []
  modified:
    - convex/schema.ts
    - lib/types/signup.ts
    - convex/signupCatalog.ts
    - lib/domain/signup/catalog.ts
    - convex/_generated/api.d.ts
    - convex/_generated/dataModel.d.ts

key-decisions:
  - "Canonical signup entities use additive non-prefixed table names (`events`, `eventSources`, `ticketTypes`, `accommodationSlots`) while preserving legacy `ticketTailor*` tables."
  - "Public signup catalog remains source-aware through canonical `events` + `eventSources` projection, not provider-specific response shapes."
  - "Ticket and accommodation machine-reason codes are normalized to stable lower_snake_case union values at the query boundary."

patterns-established:
  - "Public catalog queries must define both `args` and `returns` validators and avoid unbounded `.collect()`."
  - "Signup UI callers consume catalog data through `normalizePublicSignupCatalog` for null-safe rendering."

# Metrics
duration: 6m
completed: 2026-03-29
---

# Phase 18 Plan 01: Canonical Signup Schema + Public Catalog Summary

**Canonical source-aware signup catalog contract shipped via additive Convex schema entities, bounded indexed reads, and typed UI normalization hooks.**

## Performance

- **Duration:** 6m
- **Started:** 2026-03-29T22:23:35Z
- **Completed:** 2026-03-29T22:30:01Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added canonical signup schema foundations with required indexes for event, source-mapping, ticket availability, and accommodation slot reads.
- Implemented `signupCatalog.getPublicSignupCatalog` with strict `args`/`returns` validators, published+open filtering, deterministic ordering, and bounded `withIndex + take` access.
- Connected a typed domain adapter path for public signup catalog consumption (`lib/domain/signup/catalog.ts`) and refreshed generated Convex API/data-model bindings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add canonical signup domain schema (additive only)** - `ce73457` (feat)
2. **Task 2: Implement bounded public signup catalog contract** - `ffa05ce` (feat)

## Files Created/Modified

- `convex/schema.ts` - Added canonical Phase 18 signup tables and indexes.
- `lib/types/signup.ts` - Added stable ticket/accommodation reason-code unions + validators.
- `convex/signupCatalog.ts` - Added bounded public catalog query with source-aware projection.
- `lib/domain/signup/catalog.ts` - Added UI-safe normalization adapter for catalog payloads.
- `convex/_generated/api.d.ts` - Refreshed generated function references for signup catalog.
- `convex/_generated/dataModel.d.ts` - Refreshed generated schema/table bindings.

## Decisions Made

- Adopted canonical non-prefixed signup table names as the primary public-contract domain model for Phase 18 reads.
- Kept ticket unavailability and accommodation ineligibility as explicit machine-readable reason contracts (`snake_case`) in shared types.
- Enforced public catalog boundedness at every table access layer (`events`, `eventSources`, `ticketTypes`, `accommodationSlots`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Normalized free-form ticket unavailable reasons to contract-safe unions**

- **Found during:** Task 2 (Implement bounded public signup catalog contract)
- **Issue:** `ticketTypes.unavailableReason` is stored as optional string and could leak non-contract values, violating the `returns` validator union.
- **Fix:** Added `normalizeTicketUnavailableReason` guard in `convex/signupCatalog.ts` to coerce only supported literals and fall back to deterministic derived reasons.
- **Files modified:** `convex/signupCatalog.ts`
- **Verification:** `npm run typecheck`
- **Committed in:** `ffa05ce`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix was necessary to keep the public contract machine-readable and validator-safe; no scope creep.

## Authentication Gates

None.

## Issues Encountered

- Convex generated type bindings initially lagged new schema/query changes; resolved by running `npx convex codegen` before final verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 18-01 outputs are ready for submission-envelope persistence work in 18-02.
- Canonical read contracts now exist for Phase 19 public signup UI consumption.

---

_Phase: 18-dual-source-event-signup-platform_
_Completed: 2026-03-29_
