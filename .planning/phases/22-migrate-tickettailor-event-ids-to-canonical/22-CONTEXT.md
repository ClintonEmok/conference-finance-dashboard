# Phase 22: Migrate TicketTailor Event IDs to Canonical - Context

**Gathered:** 2026-03-30
**Status:** Ready for execution

<domain>
## Phase Boundary

Migrate `ticketTailorOrders.eventId` and `ticketTailorAttendees.eventId` from storing TicketTailor provider event IDs to storing canonical `events._id` values. This enables unified event queries across all future integrations (Stripe, Eventbrite, etc.) and aligns the schema with other tables like `accommodationSlots` and `submissions`.

**Scope includes:**

- Schema type changes (string → id<"events">)
- Data migration (clear provider tables, regenerate via auto-sync)
- Sync logic updates (pass canonical event ID from upsert function)
- Query updates (expect canonical IDs in eventId fields)

**Scope excludes:**

- Adding new integrations (Stripe, etc.)
- Modifying webhook ingestion
- Changes to ticketTailorEvents table (remains provider-specific)

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy

- **D-01:** Full reset approach — Clear all `ticketTailorOrders` and `ticketTailorAttendees` data, then regenerate via auto-sync
- **D-02:** Acceptable to lose manual room assignments (attendee room assignments will be recreated from fresh TicketTailor data)
- **D-03:** Rollback via re-running auto-sync — If issues occur, clear data and re-run sync from scratch

### Backward Compatibility

- **D-04:** Hard cutover — Update all queries at once to expect canonical event IDs in `eventId` fields
- **D-05:** No dual-write period — All queries switch to canonical IDs in single deploy

### Schema Changes

- **D-06:** Type change only — Keep field name `eventId`, change type from `v.string()` to `v.id("events")`
- **D-07:** Rationale: Field name `eventId` semantically implies canonical event; consistent with `accommodationSlots`, `submissions`, and other tables

### Migration Execution Order

- **D-08:** Single transaction approach — All changes in one deployment:
  1. Update schema types
  2. Update sync mutations to store canonical IDs
  3. Clear provider tables
  4. Trigger auto-sync to repopulate with canonical IDs
  5. Update queries to use canonical IDs

### the agent's Discretion

- Exact error handling during migration
- Logging/observability approach
- Validation checks during data regeneration

</decisions>

<specifics>
## Specific Ideas

- "The field name `eventId` should actually mean the canonical event ID — that's what everyone expects"
- "We already have `internalUpsertTicketTailorEvent` returning both IDs, just need to use the canonical one"
- "Losing manual assignments is fine — they'll get re-created from the actual TicketTailor state"
- Pattern established: `accommodationSlots.eventId`, `submissions.eventId` both reference canonical `events._id`

</specifics>

<canonical_refs>

## Canonical References

### Schema & Data Model

- `convex/schema.ts` — Table definitions, field types, indexes
- `.planning/phases/18-01-CONTEXT.md` — Canonical events sync foundation decisions

### Sync Implementation

- `convex/sync.ts` — `internalUpsertTicketTailorEvent`, `internalUpsertTicketTailorOrder`, `internalUpsertTicketTailorAttendee`
- `convex/autoSync.ts` — Auto-sync orchestration logic

### Prior Decisions

- **Phase 17-01:** Convex auth patterns with `requireIdentity`
- **Phase 17-04:** Auto-sync via internal mutations (no HTTP callbacks)
- **Phase 18-01:** Canonical events sync foundation
- **v2-01:** Dual source integration vs internal events

### Related Code

- `convex/orders.ts` — Order queries using `eventId`
- `convex/accommodation.ts` — Attendee queries using `eventId`
- `lib/convex/hooks/events.ts` — Event hooks

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `internalUpsertTicketTailorEvent` already returns `{ ticketTailorEventId, canonicalEventId }`
- `generateEventSlug()` helper for canonical event creation
- `eventSources` table with provider→canonical mapping
- Auto-sync infrastructure already in place

### Established Patterns

- Canonical event IDs use `v.id("events")` type in other tables (`accommodationSlots`, `submissions`)
- Provider-specific IDs stored in `providerEventId`, `providerOrderId` fields
- Internal mutations for cron-triggered operations (no `requireIdentity`)
- Schema migrations via `.planning/phases/XX-migration-name.md` pattern

### Integration Points

- Auto-sync calls `internalUpsertTicketTailorEvent` → needs to pass `canonicalEventId` to order/attendee mutations
- Dashboard queries filter orders by `eventId` → need to update to expect canonical IDs
- Accommodation queries join attendees to events via `eventId`

</code_context>

<deferred>
## Deferred Ideas

- Stripe integration — Will leverage canonical event ID pattern established here
- Eventbrite integration — Future phase, same pattern
- Manual event creation UI — Phase 21, creates canonical events directly

</deferred>

---

_Phase: 22-migrate-tickettailor-event-ids-to-canonical_
_Context gathered: 2026-03-30_
