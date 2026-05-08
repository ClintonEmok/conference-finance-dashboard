---
phase: 19-public-multi-step-signup-experience
plan: 01
subsystem: ui
tags: [nextjs, react, signup, public-route, localstorage]

# Dependency graph
requires:
  - phase: 18-dual-source-event-signup-platform
    provides: Canonical public signup catalog and submission contracts
provides:
  - Public /events/[slug] entry page with signup-critical content contract and CTA
  - Public /signup/[slug] route with unknown-slug guard and flow shell mount
  - Typed signup draft model with deterministic attendee seed derivation
  - Linear 4-step shell state with local draft persistence by event id
  - Ticket quantity step with availability status and bounded controls
affects: [19-02, 19-03, phase-19-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Public event and signup routes stay outside dashboard auth boundary
    - Signup draft persistence key format locked to signup-draft:{eventId}
    - Ticket edits always trigger downstream attendee/assignment invalidation

key-files:
  created:
    - app/events/[slug]/page.tsx
    - app/signup/[slug]/page.tsx
    - components/signup/state.ts
    - components/signup/steps/TicketStep.tsx
  modified:
    - components/signup/SignupFlowShell.tsx

key-decisions:
  - "Preserved D-17..D-22 event entry contract including explicit restore-choice controls when restore context is present."
  - "Kept flow order locked to tickets -> rooms -> attendees -> review with forward-jump prevention."

patterns-established:
  - "Flow shell owns slug->event resolution via usePublicSignupCatalog and persists draft only when event id/source match."
  - "Ticket selection UI keeps non-selectable tickets visible with reason copy instead of hiding unavailable options."

# Metrics
duration: 7m
completed: 2026-03-29
---

# Phase 19 Plan 01: Public entry + 4-step shell foundation Summary

**Public per-event signup entry and ticket-driven step shell now run on canonical catalog data with event-scoped draft restore and guarded progression.**

## Performance

- **Duration:** 7m
- **Started:** 2026-03-29T23:48:12Z
- **Completed:** 2026-03-29T23:54:56Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added public `/events/[slug]` page showing signup status, ticket overview, accommodation warning context, and Start signup CTA.
- Added public `/signup/[slug]` route with clear unknown-slug handling and mounted flow shell.
- Implemented typed signup draft helpers plus linear stepper shell with localStorage restore and ticket quantity controls driving attendee seed derivation.

## Task Commits

1. **Task 1: Build public event entry page and route into signup flow** - `f3fe692` (feat)
2. **Task 2: Implement typed signup state machine with draft persistence and linear gating** - `f155151` (feat)
3. **Task 3: Add ticket-selection step with quantity controls and attendee-seed derivation** - `5db6eea` (feat)

## Files Created/Modified

- `app/events/[slug]/page.tsx` - Public per-event entry page honoring Phase 19 content contract.
- `app/signup/[slug]/page.tsx` - Public signup route with not-found fallback and shell mount.
- `components/signup/state.ts` - Draft model + attendee derivation + downstream invalidation helpers.
- `components/signup/steps/TicketStep.tsx` - Step-one ticket cards with status copy and +/- quantity bounds.
- `components/signup/SignupFlowShell.tsx` - 4-step orchestration, linear navigation guards, local draft restore/persist.

## Decisions Made

- Preserved locked D-17 through D-22 public event-page contract in the new entry route.
- Kept duplicate/retry entry UX explicit by presenting continue-vs-edit controls without a `reused` marker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added initial SignupFlowShell during Task 1**

- **Found during:** Task 1 (public route creation)
- **Issue:** `/signup/[slug]` route could not compile while shell component did not yet exist.
- **Fix:** Created initial `SignupFlowShell` scaffold in Task 1, then expanded it in Task 2/3.
- **Files modified:** `components/signup/SignupFlowShell.tsx`
- **Verification:** `npm run typecheck`
- **Committed in:** `f3fe692` / `f155151`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; unblock was required for compiling planned route wiring.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Room assignment logic and UI can now plug into the existing `rooms` step boundary.
- Attendee details/review steps can consume stable draft/step contracts already in place.

---

_Phase: 19-public-multi-step-signup-experience_
_Completed: 2026-03-29_
