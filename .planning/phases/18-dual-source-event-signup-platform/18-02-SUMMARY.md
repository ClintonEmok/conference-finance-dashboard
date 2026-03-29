---
phase: 18-dual-source-event-signup-platform
plan: 02
subsystem: api
tags: [convex, signup, mutation, nextjs-route, vitest]

# Dependency graph
requires:
  - phase: 18-dual-source-event-signup-platform
    provides: canonical signup event/ticket/accommodation read contract from 18-01
provides:
  - Atomic signup envelope write mutation and canonical submission tables
  - Public submit API route and domain normalization bridge
  - Baseline submit-route regression tests for success and invalid payloads
affects: [18-03, 19-01, 19-02, 20-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Public signup submission boundary uses domain normalization before Convex mutation writes
    - Submission persistence uses parent+child table decomposition with idempotency metadata table

key-files:
  created:
    - convex/signupSubmission.ts
    - lib/domain/signup/submission.ts
    - app/api/signup/submit/route.ts
    - app/api/signup/submit/route.test.ts
  modified:
    - convex/schema.ts
    - lib/types/signup.ts
    - convex/_generated/api.d.ts
    - convex/_generated/dataModel.d.ts
    - vitest.config.ts

key-decisions:
  - "Persist signup envelopes in canonical additive submission tables (`signupSubmissions` + child tables) rather than overloading provider-centric entities."
  - "Domain bridge normalizes unknown route payloads into a typed `SignupSubmissionEnvelope` before Convex mutation execution."
  - "Route-level signup tests live with the API route path and vitest include scope was expanded to run app/api tests."

patterns-established:
  - "Submission contract pattern: route parses unknown JSON -> domain validator -> Convex mutation -> stable `{ submissionId, bookingRef, submittedAt }` response."
  - "Idempotency metadata capture pattern: submission stores `idempotencyKey` + `payloadFingerprint` with an expiry window record."

# Metrics
duration: 7min
completed: 2026-03-29
---

# Phase 18 Plan 02: Atomic Signup Submission Summary

**Public signup now has an atomic envelope write boundary that persists booker/attendees/tickets/assignment intent in one Convex mutation and returns a stable submission reference.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-29T20:48:59Z
- **Completed:** 2026-03-29T20:56:09Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added canonical submission schema entities and implemented `submitSignupEnvelope` with strict validators and pre-write invariants.
- Added typed server-domain normalization bridge (`submitSignup`) that maps unknown request payloads to `SignupSubmissionEnvelope`.
- Added `POST /api/signup/submit` endpoint with `201` success contract and `INVALID_SUBMISSION` validation error path, plus route-level tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build atomic envelope persistence mutation** - `14be258` (feat)
2. **Task 2: Expose public submit route and server bridge** - `630c5eb` (feat)

**Plan metadata:** Pending in next docs commit

## Files Created/Modified

- `convex/schema.ts` - Added `signupSubmissions`, `signupSubmissionAttendees`, `signupSubmissionTicketSelections`, `signupSubmissionAssignments`, and `signupSubmissionIdempotency` tables + indexes.
- `convex/signupSubmission.ts` - Added `submitSignupEnvelope` mutation with full args/returns validators and transaction-scoped writes.
- `lib/types/signup.ts` - Added `SignupSubmissionEnvelope`, `SignupSubmissionResult`, and submission-related error code type unions.
- `lib/domain/signup/submission.ts` - Added input normalization, validation errors, payload fingerprint/idempotency derivation, and Convex bridge call.
- `app/api/signup/submit/route.ts` - Added public submit POST handler with 201 success and 400 validation response contracts.
- `app/api/signup/submit/route.test.ts` - Added route tests for successful submit and invalid payload path.
- `vitest.config.ts` - Added `app/api/**/*.test.ts` include so route-local tests execute.

## Decisions Made

- Kept submission persistence additive and canonical to protect existing Ticket Tailor/Tikkie finance workflows.
- Standardized submission route output as `{ data: { submissionId, bookingRef, submittedAt } }` for Phase 19 retry/restore flow integration.
- Centralized submission payload normalization in domain layer instead of route handler to keep route boundary thin and testable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added missing canonical submission tables in schema**

- **Found during:** Task 1 (atomic envelope persistence mutation)
- **Issue:** Plan required writes to `signupSubmissions` and child tables, but schema lacked those entities.
- **Fix:** Added all required canonical submission tables and indexes in `convex/schema.ts`, then regenerated Convex bindings.
- **Files modified:** `convex/schema.ts`, `convex/_generated/api.d.ts`, `convex/_generated/dataModel.d.ts`
- **Verification:** `npm run typecheck` passes with typed references to all new tables.
- **Committed in:** `14be258` (part of Task 1 commit)

**2. [Rule 3 - Blocking] Expanded vitest include for route-local test execution**

- **Found during:** Task 2 (public submit route tests)
- **Issue:** Existing vitest include only matched `tests/**/*.test.ts`, so required `app/api/signup/submit/route.test.ts` would not run under `npm run test -- signup`.
- **Fix:** Updated `vitest.config.ts` include to also run `app/api/**/*.test.ts`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm run test -- signup` executes and passes the new route test file.
- **Committed in:** `630c5eb` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes were required for correctness and verification fidelity; no scope creep.

## Issues Encountered

- Convex type generation initially failed to recognize newly referenced submission tables until schema updates were codified and codegen rerun.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 18-03 transactional guard hardening (capacity/ticket/assignment checks + abuse controls).
- Submission mutation and public route are in place for idempotency and rate-limit enhancements.

---

_Phase: 18-dual-source-event-signup-platform_
_Completed: 2026-03-29_
