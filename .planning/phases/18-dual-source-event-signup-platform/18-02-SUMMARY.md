---
phase: 18-dual-source-event-signup-platform
plan: 02
subsystem: api
tags: [convex, signup, mutation, nextjs-route, vitest]

# Dependency graph
requires:
  - phase: 18-dual-source-event-signup-platform
    provides: Canonical signup read model and source-aware catalog contracts from 18-01
provides:
  - Atomic signup envelope persistence boundary in Convex (`submitSignupEnvelope`)
  - Canonical submission schema tables and indexes for event/submission/idempotency lookups
  - Public submit API route + server bridge returning stable submission references
affects: [18-03, 19-public-signup-pages, 20-admin-event-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single-mutation envelope persistence (submission header + child rows) with pre-write invariant checks
    - Route-level validation contract (`INVALID_SUBMISSION`) over domain normalization boundary

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/signupSubmission.ts
    - lib/types/signup.ts
    - lib/domain/signup/submission.ts
    - app/api/signup/submit/route.ts
    - app/api/signup/submit/route.test.ts
    - convex/_generated/api.d.ts
    - convex/_generated/dataModel.d.ts
    - vitest.config.ts

key-decisions:
  - "Canonical submission records use additive non-prefixed tables (`submissions`, `submissionAttendees`, `submissionTicketSelections`, `submissionAssignments`, `submissionIdempotency`) with typed Convex id relations."
  - "Submission ticket selections are persisted strictly per attendee with `quantity = 1` to avoid aggregate/per-attendee model ambiguity."
  - "Public submit route returns a stable `{ submissionId, bookingRef, submittedAt }` payload from the domain bridge."

patterns-established:
  - "Validate all envelope invariants before any child-row writes; persist header and child rows in one Convex mutation handler."
  - "Keep idempotency table PII-minimized (event keying + fingerprint + submission reference only)."

# Metrics
duration: 6m
completed: 2026-03-29
---

# Phase 18 Plan 02: Atomic Signup Submission Boundary Summary

**Atomic canonical signup submission persistence is now live with a typed Next.js submit route and stable booking-reference response contract.**

## Performance

- **Duration:** 6m
- **Started:** 2026-03-29T22:32:20Z
- **Completed:** 2026-03-29T22:38:43Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added canonical submission tables and required indexes in `convex/schema.ts` for fast event, booking, child-row, and idempotency lookups.
- Implemented `convex/signupSubmission.ts` `submitSignupEnvelope` mutation with strict validators, invariant checks, and single-handler persistence of submission + attendees + ticket selections + assignments.
- Added `lib/domain/signup/submission.ts` and `POST /api/signup/submit` route returning `{ data: { submissionId, bookingRef, submittedAt } }`, plus baseline success/invalid route tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build atomic envelope persistence mutation** - `d1f71c0` (feat)
2. **Task 2: Expose public submit route and server bridge** - `59f770a` (feat)

## Files Created/Modified

- `convex/schema.ts` - Added canonical submission entities and operational indexes.
- `convex/signupSubmission.ts` - Added atomic submission mutation with strict args/returns validators.
- `lib/types/signup.ts` - Added shared signup submission envelope/result types and source/gender unions.
- `lib/domain/signup/submission.ts` - Added server-side normalization/validation bridge to Convex mutation.
- `app/api/signup/submit/route.ts` - Added public POST route with 201 and INVALID_SUBMISSION contracts.
- `app/api/signup/submit/route.test.ts` - Added baseline route tests for success and validation failure.
- `convex/_generated/api.d.ts` - Regenerated function references including `signupSubmission.submitSignupEnvelope`.
- `convex/_generated/dataModel.d.ts` - Regenerated data model bindings for new submission tables.
- `vitest.config.ts` - Updated include globs so route tests in `app/**` are discoverable by `npm run test -- signup`.

## Decisions Made

- Used canonical `eventId`/`submissionId`/`attendeeId`/`ticketTypeId`/`slotId` typed IDs throughout submission write relations.
- Kept idempotency storage PII-minimized and separate from submission contact payload.
- Retained mutation-level invariant checks (event open, attendee key uniqueness, event-scoped ticket/slot ownership) before persistence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Expanded Vitest include patterns so signup route tests execute**

- **Found during:** Task 2 (Expose public submit route and server bridge)
- **Issue:** `npm run test -- signup` failed with “No test files found” because `vitest.config.ts` only included `tests/**/*.test.ts` and ignored `app/api/signup/submit/route.test.ts`.
- **Fix:** Updated `vitest.config.ts` include list to add `app/**/*.test.ts`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm run test -- signup`
- **Committed in:** `59f770a`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required to run planned route regression tests; no scope creep.

## Authentication Gates

None.

## Issues Encountered

- None beyond the test-discovery blocker auto-fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 18-03 guard hardening (transactional capacity, duplicate/idempotent replay behavior, and submit-route abuse controls).
- Public signup write boundary now exists for Phase 19 UI integration.

---

_Phase: 18-dual-source-event-signup-platform_
_Completed: 2026-03-29_
