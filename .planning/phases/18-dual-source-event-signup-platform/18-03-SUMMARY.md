---
phase: 18-dual-source-event-signup-platform
plan: 03
subsystem: api
tags: [convex, idempotency, rate-limit, honeypot, signup]

# Dependency graph
requires:
  - phase: 18-dual-source-event-signup-platform
    provides: Atomic canonical signup submission persistence boundary from 18-02
provides:
  - Transactional signup guard sequence for capacity, ticket selectability, and slot assignability
  - Idempotent replay behavior returning stable submission reference + restore payload
  - Abuse-gated public submit route (rate limit + honeypot + idempotency-key forwarding)
affects:
  [19-public-signup-pages, 20-admin-event-management, 21-finance-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fingerprint/key-based idempotent replay within bounded retry window
    - Route-level guard parsing from mutation error-code prefixes

key-files:
  created: []
  modified:
    - convex/signupSubmission.ts
    - lib/types/signup.ts
    - lib/domain/signup/submission.ts
    - app/api/signup/submit/route.ts
    - app/api/signup/submit/route.test.ts
    - convex/_generated/api.d.ts

key-decisions:
  - "Idempotent replay is keyed by event + payload fingerprint (with idempotency-key assist), returning prior reference and restore payload instead of duplicate inserts."
  - "Submission guard failures remain machine-readable via explicit codes: CAPACITY_EXCEEDED, TICKET_UNAVAILABLE, ASSIGNMENT_UNAVAILABLE, SUBMISSION_CONFLICT."
  - "Public submit route applies abuse gates before write execution and never returns a user-facing `reused` marker."

patterns-established:
  - "Use index-backed lookup sequences (`by_eventId_and_fingerprint`, `by_eventId_and_idempotencyKey`, `by_slotId`) for duplicate/capacity checks."
  - "Forward restore payload end-to-end (mutation -> domain -> route) for prefill-ready retry UX."

# Metrics
duration: 6m
completed: 2026-03-29
---

# Phase 18 Plan 03: Transactional Guards + Abuse Controls Summary

**Signup submission now enforces transactional capacity/availability guards, idempotent replay with restore context, and public-route abuse protections.**

## Performance

- **Duration:** 6m
- **Started:** 2026-03-29T22:39:51Z
- **Completed:** 2026-03-29T22:46:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Upgraded `submitSignupEnvelope` with in-transaction guard checks (ticket selectability, slot assignability, ticket/slot capacity) and deterministic replay behavior using event-scoped idempotency fingerprint/key indexes.
- Added shared signup submission error-code exports and route guard parsing so capacity/availability conflicts return structured contracts.
- Added public route abuse controls (`enforceRateLimit`, honeypot rejection, idempotency-key forwarding/fallback) plus regression tests for throttling, honeypot, and replay behavior with restore payload.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add transactional capacity + duplicate/idempotency guards** - `1b2eb2a` (feat)
2. **Task 2: Enforce public abuse controls in submit route** - `986cc52` (feat)

## Files Created/Modified

- `convex/signupSubmission.ts` - Added transactional guard sequence, replay-path restore payload, and idempotency/capacity enforcement.
- `lib/types/signup.ts` - Added canonical signup submission error-code type exports and restore payload contract.
- `lib/domain/signup/submission.ts` - Added restore payload pass-through from Convex mutation result.
- `app/api/signup/submit/route.ts` - Added rate limiting, honeypot checks, idempotency key propagation, and guard-error mapping.
- `app/api/signup/submit/route.test.ts` - Added/updated tests for success, INVALID_SUBMISSION, RATE_LIMITED, HONEYPOT_TRIGGERED, and idempotent replay response parity.
- `convex/_generated/api.d.ts` - Refreshed generated function bindings for updated mutation return contract.

## Decisions Made

- Kept idempotent replay deterministic by event-scoped fingerprint-first lookup with key fallback and bounded retry window semantics.
- Preserved user-facing API simplicity by returning stable references + restore payload without an explicit `reused` marker.
- Mapped mutation guard prefixes into route error contracts so public callers receive actionable conflict codes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Domain bridge was dropping restore payload from replay responses**

- **Found during:** Task 2 (Enforce public abuse controls in submit route)
- **Issue:** `lib/domain/signup/submission.ts` only returned `{ submissionId, bookingRef, submittedAt }`, which discarded replay restore payload produced by `submitSignupEnvelope`.
- **Fix:** Added restore payload pass-through/normalization in domain response mapping.
- **Files modified:** `lib/domain/signup/submission.ts`
- **Verification:** `npm run typecheck`, `npm run test -- signup`
- **Committed in:** `986cc52`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for end-to-end replay contract correctness; no scope creep.

## Authentication Gates

None.

## Issues Encountered

- None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 18 objectives are complete: canonical read contracts, atomic write boundary, and safety/abuse controls are now in place.
- Ready to begin Phase 19 public signup UI workflow implementation on stable backend contracts.

---

_Phase: 18-dual-source-event-signup-platform_
_Completed: 2026-03-29_
