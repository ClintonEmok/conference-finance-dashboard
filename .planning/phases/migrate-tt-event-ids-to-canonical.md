# GSD Phase: Migrate TicketTailor Event IDs to Canonical

## Phase Goal

Migrate `ticketTailorOrders.eventId` and `ticketTailorAttendees.eventId` from storing TicketTailor provider event IDs to storing canonical `events._id` values, enabling unified event queries across all future integrations.

## Motivation

Currently `ticketTailorOrders.eventId` stores `ticketTailorEvents._id` (provider-specific), which breaks semantic expectations and requires complex joins to resolve canonical events. After this migration, all `eventId` fields will consistently reference `events._id`, enabling:

- Unified queries across provider tables
- Future integration support without code duplication
- Simplified analytics and dashboards
- Consistent with `accommodationSlots`, `submissions`, and other tables

## Prerequisites

- Dev mode database (accepts data loss)
- Previous sync fix deployed that populates canonical `events` table

## Requirements

### REQ-1: Schema Update

Update schema to clarify that `ticketTailorOrders.eventId` and `ticketTailorAttendees.eventId` are canonical event references (change type from `v.string()` to `v.id("events")`).

### REQ-2: Data Migration

Create and run migration to update existing records:

1. For each `ticketTailorOrder`, look up `eventSources` where `externalEventId = providerEventId` and `provider = "ticket_tailor"`
2. Update `eventId` field to point to `eventSources.eventId` (canonical event ID)
3. Repeat for `ticketTailorAttendees`
4. Verify all records migrated successfully

### REQ-3: Sync Logic Update

Update `internalUpsertTicketTailorOrder` and `internalUpsertTicketTailorAttendee` mutations:

- Accept `canonicalEventId` parameter
- Store canonical `events._id` in `eventId` field
- Continue storing `providerEventId` separately for audit trail

### REQ-4: Auto-Sync Update

Update `autoSync.ts` to pass canonical event ID from the new sync function return value to order/attendee mutations.

### REQ-5: Code Audit

Search and update all code referencing `ticketTailorOrders.eventId` or `ticketTailorAttendees.eventId`:

- Update type annotations
- Update query logic
- Update any joins or lookups
- Update tests

### REQ-6: Verification

1. Run auto-sync and verify orders link correctly to canonical events
2. Query orders by canonical event ID and verify results
3. Verify dashboard displays orders grouped by canonical event

## Dependencies

- **Before**: TicketTailor events sync to canonical `events` table (COMPLETED)
- **Parallel**: None
- **After**: Stripe/Eventbrite integrations can leverage unified `eventId` pattern

## Files to Modify

### Schema

- `convex/schema.ts` (lines 248-252, 284-292)

### Sync & Migration

- `convex/sync.ts` (update internalUpsert mutations, add migration)
- `convex/autoSync.ts` (update to pass canonical event ID)

### Queries & Logic

- `convex/orders.ts` (all queries referencing `eventId`)
- `convex/accommodation.ts` (attendee queries)
- `lib/convex/hooks/events.ts` (if any)

### Tests

- Update any tests asserting on `eventId` values

## Risk Assessment

- **Severity**: Medium - affects core order/attendee data linking
- **Mitigation**: Dev mode database, full data regeneration via auto-sync possible

## Success Criteria

- [ ] `ticketTailorOrders.eventId` references `events._id` (verified by query)
- [ ] `ticketTailorAttendees.eventId` references `events._id` (verified by query)
- [ ] Auto-sync creates new orders with canonical event IDs
- [ ] Dashboard queries work without provider-specific joins
- [ ] All tests pass
- [ ] TypeScript compilation succeeds

## Estimated Effort

3-4 hours

- Schema: 15 min
- Migration logic: 45 min
- Sync updates: 30 min
- Code audit & updates: 90 min
- Testing & verification: 45 min

## Notes

- This is the second half of the "canonical events" fix
- First half (syncing TT events to canonical table) is already deployed
- Migration will lose the direct TT→Order linkage at the ID level, but `providerEventId` field preserves audit trail
