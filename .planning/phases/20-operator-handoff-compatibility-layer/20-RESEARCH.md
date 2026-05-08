# Phase 20 Research — Operator Handoff + Compatibility Layer

**Date:** 2026-03-30  
**Phase:** 20  
**Status:** Complete

## Objective

Determine what must be in place so submitted signup data becomes operator-ready in existing room/allocation workflows without breaking integration-backed finance behavior.

## Inputs Reviewed

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/20-operator-handoff-compatibility-layer/20-CONTEXT.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-01-SUMMARY.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-02-SUMMARY.md`
- `.planning/phases/18-dual-source-event-signup-platform/18-03-SUMMARY.md`
- `.planning/phases/19-public-multi-step-signup-experience/19-03-SUMMARY.md`
- `convex/_generated/ai/guidelines.md`
- `convex/accommodation.ts`
- `convex/attendees.ts`
- `convex/events.ts`
- `convex/orders.ts`
- `lib/domain/accommodation/assignments.ts`
- `lib/domain/finance/attendees.ts`
- `lib/domain/finance/order-ledger.ts`
- `app/api/dashboard/accommodation/assignments/route.ts`
- `app/dashboard/accommodation/page.tsx`

## Discovery Level

**Level 0 — Skip external discovery.**

Reasoning:

1. No new external libraries or services are required.
2. Existing Convex + Next.js patterns already cover query/mutation, domain adapters, and operator UI.
3. Phase risk is internal contract wiring (submission tables -> operator read models), not unknown third-party APIs.

## Findings

1. **Operator accommodation reads are still integration-attendee only.**
   - `getRoomAllocationBoard` currently reads from `ticketTailorAttendees` and `ticketTailorEvents` only.
   - Canonical `submissions` and child tables are not yet consumed by operator rooming read paths.

2. **Canonical submission data already contains rooming-critical fields.**
   - `submissions`: booking reference, source, booker details, submit-level notes.
   - `submissionAttendees`: name, phone, gender, location, dietary restrictions, roommate preference/avoid.
   - `submissionAssignments`: assign/skip intent tied to accommodation slots.

3. **Dashboard finance/event read models still assume provider-style event identity.**
   - Domain ledgers and Convex event helpers currently rely on `ticketTailorEvents` provider IDs.
   - A source-agnostic event adapter is needed so internal and integration events can co-exist in filter/read contracts.

4. **UI handoff cues are not explicit yet.**
   - Accommodation page has queue + assignment operations, but no submission-first handoff detail panel carrying rooming notes and unresolved assignment diagnostics.

5. **Compatibility risk is concentrated in shared read contracts, not writes.**
   - Existing Ticket Tailor/Tikkie flows can stay stable if we add source-aware read adapters instead of changing payment/order write pipelines in this phase.

## Planning Constraints

- Keep integration-backed Ticket Tailor/Tikkie behavior stable; do not alter webhook/sync payment mutation boundaries in this phase.
- Treat source as explicit domain metadata (`integration` vs `internal`) but hide it in primary operator flow unless details are expanded.
- Prioritize unresolved assignment rows ahead of normal queue rows.
- Keep rooming data consumption additive: operator reads should include canonical submissions without requiring a migration that rewrites legacy attendee rows.
- Preserve current route auth and error contracts (`requireApiUser`, `BAD_REQUEST`, `INTERNAL_ERROR`).

## Recommended Plan Shape

1. **Plan 20-01:** Add operator read model contract joining canonical submissions into accommodation board payload (assignment + note fields, unresolved diagnostics).
2. **Plan 20-02:** Update source-agnostic adapters and operator UI handoff presentation (submission-first grouping, side-panel details, metadata-on-demand).
3. **Plan 20-03:** Add regression + end-to-end verification for mixed-source compatibility and operator handoff flow.

## Validation Architecture

Phase should verify at three layers:

- **Read-model layer:** Convex/domain board payload includes submission-derived rooming fields and unresolved assignment statuses.
- **Adapter-compatibility layer:** Dashboard event filters/read APIs handle mixed internal + integration events without breaking existing integration contracts.
- **Operator-flow layer:** Submission created from public signup is visible in accommodation operator workflow with queue-first unresolved visibility.

Minimum checks per plan:

- `npm run typecheck`
- `npm run test -- accommodation`
- `npm run test -- dashboard` (if route-level tests are added under dashboard API)

## Risks to Watch

- Contract drift between `convex/accommodation.ts` payload and `app/dashboard/accommodation/page.tsx` UI expectations.
- Hidden source-coupling in ledger/event filters that silently drop internal events.
- Overloading Phase 20 with payment write-path changes better suited for Phase 21.

## Verdict

**Ready for planning and execution.** No blockers found.
