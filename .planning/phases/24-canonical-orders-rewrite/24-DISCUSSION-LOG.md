# Phase 24: canonical orders rewrite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 24-canonical-orders-rewrite
**Areas discussed:** Schema migration approach, TT sync rewrite scope, Downstream consumer update order, Edge-case field placement

---

## Schema Migration Approach

| Option                       | Description                                                                      | Selected |
| ---------------------------- | -------------------------------------------------------------------------------- | -------- |
| Drop + recreate              | Remove old tables, create new ones in one schema change. Cleanest for dev stage. | ✓        |
| Create alongside + migrate   | Add new tables alongside old, copy data, then drop old in second deploy.         |          |
| Dual-write during transition | Write to both old and new tables during transition. Overkill for dev.            |          |

**User's choice:** Drop + recreate
**Notes:** We're in dev with no real data — clean break is simplest. No migration script needed.

## TT Sync Rewrite Scope

| Option                       | Description                                                                          | Selected |
| ---------------------------- | ------------------------------------------------------------------------------------ | -------- |
| Rewrite everything at once   | Update order sync, attendee sync, family linking, and archive in one PR.             |          |
| Orders first, then attendees | Rewrite order sync + extension tables first. Attendees stay on old path temporarily. | ✓        |
| Attendees first, then orders | Rewrite attendee sync first. Orders stay on old path temporarily.                    |          |

**User's choice:** Orders first, then attendees
**Notes:** Two-wave approach reduces risk. Wave 1: orders. Wave 2: attendees + family linking.

## Downstream Consumer Update Order

| Option                          | Description                                                                             | Selected |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| By dependency order             | 1) sync.ts/autoSync.ts, 2) orders.ts, 3) tikkie.ts, 4) payments.ts, 5) accommodation.ts | ✓        |
| By file size / complexity       | Start with smallest files first before tackling big ones.                               |          |
| All at once after schema change | Update all consumers in one batch after schema is applied.                              |          |

**User's choice:** By dependency order
**Notes:** Write path first (sync), then read paths (orders, tikkie, payments), then most complex consumer last (accommodation).

## Edge-Case Field Placement

| Option                | Description                                                                                                     | Selected |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Move to core          | assignedRoomId, allocationPriority, priorityReason → core. tikkieAmountOverrideMinor, customAnswers stay in TT. | ✓        |
| Keep all in TT tables | Keep all fields in ticketTailorAttendees. Only move name, email, gender to core.                                |          |
| Move all to core      | Move everything to core. TT keeps only provider IDs and rawPayload.                                             |          |

**User's choice:** Move to core (domain concepts)
**Notes:** Domain concepts (room assignment, allocation priority) belong in core since they're provider-agnostic. Provider-specific data (customAnswers, tikkieAmountOverrideMinor) stays in TT.

## the agent's Discretion

None — all areas were decided by the user.

## Deferred Ideas

None.
