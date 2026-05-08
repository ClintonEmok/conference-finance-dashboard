# Phase 19 Research — Public Multi-Step Signup Experience

**Date:** 2026-03-30  
**Phase:** 19  
**Status:** Complete

## Objective

Determine what must be in place to plan and execute Phase 19 public signup UX on top of the canonical Phase 18 contracts.

## Inputs Reviewed

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/MILESTONE-CONTEXT.md`
- `.planning/phases/19-public-multi-step-signup-experience/19-CONTEXT.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-01-SUMMARY.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-02-SUMMARY.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-03-SUMMARY.md`
- `convex/_generated/ai/guidelines.md`
- `lib/convex/hooks/signup.ts`
- `lib/types/signup.ts`
- `app/api/signup/submit/route.ts`
- `proxy.ts`
- `app/dashboard/accommodation/inventory/page.tsx` (multi-step UI reference)

## Discovery Level

**Level 0 — Skip external discovery.**

Reasoning:

1. Work is an extension of existing internal patterns (Next.js + shadcn + Convex hooks already present).
2. No new external integrations or SDKs are required for this phase.
3. Existing submit/canonical contracts are already implemented in Phase 18.

## Findings

1. **Public contract surface already exists.**
   - Catalog reads are available via `usePublicSignupCatalog()`.
   - Submission path exists at `POST /api/signup/submit` with abuse controls and conflict code mapping.

2. **Auth boundary already supports public flow.**
   - `proxy.ts` protects `/dashboard(.*)` only; public `/events/*` and `/signup/*` routes can remain unauthenticated.

3. **Critical Phase 19 complexity is client-state orchestration.**
   - Linear step progression, dependent invalidation, and local draft restore are the highest-risk areas.
   - Restore payload handling (continue prior vs edit/update) needs explicit UX branch logic.

4. **Room assignment step should constrain targets from contract truth.**
   - UI must only expose assignable slots and persist warning/acknowledgement behavior for unfilled beds.

5. **Attendee details + submit review are contract-heavy and should be typed end-to-end.**
   - Keep payload construction aligned with `SignupSubmissionEnvelope` shape to avoid submit-route validation failures.

## Planning Constraints

- Keep routes public; do not alter Clerk middleware protection scope.
- Reuse canonical contract types from `lib/types/signup.ts`; avoid duplicate local type drift.
- Keep step sequence locked: tickets -> rooms (conditional) -> attendee details/notes -> review/submit.
- Enforce required attendee fields on step transition and final submit (`RMD-01..03`).
- Keep random-fill risk visible in assignment and review states (`USF-05`).

## Recommended Plan Shape

1. **Plan 19-01:** Public entry surfaces + 4-step shell + ticket step + local draft/state machine.
2. **Plan 19-02:** Accommodation assignment interactions (drag/drop, slot validity, unfilled-bed warning + acknowledgement).
3. **Plan 19-03:** Attendee details validation + review/submit + restore-choice + success confirmation.

## Validation Architecture

Phase should verify at three layers:

- **State contract layer:** reducer/state helpers enforce step gating and dependent invalidation behavior.
- **UI behavior layer:** step components render machine-readable availability/warning/validation states.
- **Submission boundary layer:** review step posts typed payload to `/api/signup/submit` and handles known error contracts.

Minimum checks per plan:

- `npm run typecheck`
- `npm run test -- signup`
- `npm run test -- signup-flow` (if new targeted UI/state tests are added)

## Risks to Watch

- Scope bleed into Phase 20 operator read models.
- Stale downstream data when upstream ticket/assignment edits occur.
- Silent replay UX (must present explicit continue/edit choice when restore payload appears).

## Verdict

**Ready for planning and execution.** No blockers found.
