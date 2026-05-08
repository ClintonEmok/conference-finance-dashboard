# Phase 18 Research — Signup Domain Foundation

**Date:** 2026-03-29  
**Phase:** 18  
**Status:** Complete

## Objective

Determine what must be in place to plan and execute a safe Phase 18 foundation for public signup domain contracts and atomic submission writes.

## Inputs Reviewed

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-CONTEXT.md`
- `.planning/research/v2.0-attendee-signup-self-assignment.md`
- `.planning/research/PITFALLS.md`
- `convex/_generated/ai/guidelines.md`
- `convex/schema.ts`
- `convex/events.ts`
- `convex/accommodation.ts`
- `lib/rate-limit.ts`
- `proxy.ts`

## Findings

1. **Additive model is required.** Existing provider-centric tables (`ticketTailor*`) must remain stable; canonical signup entities should be additive (`D-01`, `DOM-01`).
2. **One canonical read contract is feasible now.** Public catalog can be introduced as source-aware output while preserving source-specific internals.
3. **Atomic envelope write belongs in one mutation boundary.** Submission must persist booker + attendees + ticket selections + assignment intent + notes in one transaction (`DOM-02`, `D-03`, `D-16`).
4. **Guards must be transactional.** Capacity and duplicate protections must run in the same write path (`DOM-03`).
5. **Public abuse controls should be route + mutation aware.** Existing `lib/rate-limit.ts` is reusable; honeypot and idempotency contract should be explicit.

## Planning Constraints

- Follow Convex bounded query rules (`take`/pagination; avoid unbounded `.collect()` in new public reads).
- Keep public signup unauthenticated without weakening dashboard protection boundary (`proxy.ts` unchanged).
- Preserve existing `requireIdentity` pattern for operator/public write mutations that remain authenticated.
- Prefer internal mutation for signup persistence behind a public API route gate to centralize abuse handling.

## Recommended Plan Shape

1. **Plan 18-01:** Canonical read contracts + schema additions for source-aware event/ticket/accommodation readiness.
2. **Plan 18-02:** Atomic submission envelope persistence boundary.
3. **Plan 18-03:** Transactional capacity/duplicate guards + idempotent retry + route abuse controls.

## Validation Architecture

Phase should verify at three layers:

- **Contract layer:** return validators + type exports enforce stable read/write shape.
- **Mutation layer:** idempotent and atomic behavior verified with focused tests.
- **Route layer:** rate-limit/honeypot/idempotency behavior verified with API tests.

Minimum checks per plan:

- `npm run typecheck`
- `npm run test -- --runInBand` (or targeted vitest file for touched contracts)

## Risks to Watch

- Overscoping into Phase 19 UI work.
- Hidden coupling to legacy `ticketTailor*` shapes in new public contract.
- Duplicate strategy blocking legitimate repeat bookings (must preserve D-12/D-18 behavior).

## Verdict

**Ready for planning and execution.** No blockers found.
