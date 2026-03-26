---
phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
plan: "03"
subsystem: api
tags: [convex, attendees, accommodation, api-routes]
requires:
  - phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
    provides: Canonical Convex tree and typed Clerk-aware server bridge.
provides:
  - Attendee and accommodation domain modules migrated to generated Convex refs
  - Accommodation/attendee Convex helpers cleaned up to avoid `as any` id access
  - Protected attendee and accommodation routes preserved on existing JSON contracts
affects: [13-05, attendees, accommodation]
tech-stack:
  added: []
  patterns:
    - "Attendee and accommodation domain code now calls `api.attendees.*` and `api.accommodation.*` through `convexQuery`/`convexMutation`."
    - "Convex id lookups use `ctx.db.normalizeId(...)` instead of `as any` casts."
key-files:
  created: []
  modified:
    - convex/attendees.ts
    - convex/accommodation.ts
    - lib/domain/finance/attendees.ts
    - lib/domain/finance/attendee-detail.ts
    - lib/domain/accommodation/inventory.ts
    - lib/domain/accommodation/assignments.ts
    - app/api/dashboard/attendees/[attendeeId]/route.ts
key-decisions:
  - "Preserved attendee detail and accommodation board payloads while removing string dispatch from the app-facing boundary."
  - "Added internal accommodation occupancy recalculation support and normalized string ids safely inside Convex queries/mutations."
patterns-established:
  - "Route-facing attendee/accommodation contracts stay stable while Convex internals can be renamed and tightened."
requirements-completed: []
duration: 34 min
completed: 2026-03-26
---

# Phase 13 Plan 03 Summary

**Attendee and accommodation flows now use typed Convex refs end-to-end without changing the operator-facing route contracts.**

## Accomplishments

- Replaced attendee/accommodation string dispatch in domain modules and the attendee override route with generated refs.
- Removed `as any` id lookups from `convex/attendees.ts` and `convex/accommodation.ts` using `ctx.db.normalizeId(...)`.
- Added an internal accommodation helper export and preserved current room board, assignment, and attendee detail payload semantics.

## Notable deviation

- Cleared one stray attendee string query in `lib/domain/finance/tikkie-templates.ts` because the plan verification grep covered all of `lib/domain/finance`.

## Verification

- `npm run typecheck`
- `rg '"attendees:|"accommodation:' lib/domain/finance lib/domain/accommodation app/api/dashboard/attendees app/api/dashboard/accommodation`
- `rg 'as any' convex/attendees.ts convex/accommodation.ts`

---

_Phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts_
_Completed: 2026-03-26_
