---
phase: 20-operator-handoff-compatibility-layer
plan: 02
subsystem: accommodation, events, finance
tags:
  [
    convex,
    events,
    event-sources,
    accommodation,
    finance,
    reconciliation,
    source-agnostic,
  ]

requires:
  - phase: 20-operator-handoff-compatibility-layer/01
    provides: "Submission queue data flowing through domain and API layers"
  - phase: 18-dual-source-event-signup-platform
    provides: "Canonical event and eventSources table schema"

provides:
  - Accommodation workspace with submission queue UI and side-panel detail view
  - Source-agnostic events queries and mutations (createEvent, updateEvent)
  - Event source management queries for provider integration
  - Finance domain consuming source-agnostic event fields (eventId, eventSlug, eventTitle)
  - Backward-compatible ticketTailor integration preserved

affects:
  - phase: 21-ui-for-event-creation-and-ui-for-event-pages
  - accommodation operator dashboard UI
  - finance reconciliation and reporting flows
  - ticketTailor event integration

tech-stack:
added: []
patterns:
  - "Read-time join of canonical event tables inside Convex query"
  - "Source-agnostic field naming (eventId, eventSlug, eventTitle) replacing provider-specific names"
  - "Separate eventSources table for integration linkage"
  - "Submission queue with unresolved-first prioritization and side-panel detail view"

key-files:
created:
modified:
  - convex/events.ts - Modified getEvents/getEventsForLedger for source-agnostic queries, added createEvent/updateEvent mutations, added event source queries
  - convex/orders.ts - Updated getOrdersWithFilters/getOrdersForReconciliation with new field names
  - convex/accommodation.ts - Added submissionQueueRows to workspace payload
  - lib/domain/accommodation/assignments.ts - Added SubmissionQueueRow type and workspace fields
  - lib/domain/finance/order-ledger.ts - Updated to use eventId, eventSlug, eventTitle
  - lib/domain/finance/attendees.ts - Updated to consume source-agnostic events
  - lib/domain/finance/reconciliation.ts - Updated event field references
  - lib/domain/finance/reporting.ts - Updated event field references
  - lib/types/order.ts - Updated orderLedgerRowValidator with new event fields
  - lib/convex/hooks/events.ts - Added useCreateEvent and useUpdateEvent hooks
  - app/(admin)/accommodation/[eventSlug]/page.tsx - Added submission queue UI with side-panel

tests-updated: []

key-decisions:
  - "Submission queue displays unresolved items first with visual priority indicators (CRITICAL/HIGH badges)"
  - "Side-panel detail view for inspecting submission metadata (booker info, dietary restrictions, preferences)"
  - "Source-agnostic event queries return canonical events table data with eventId, slug, title, startsAt, currency"
  - "Finance domain now consumes eventId, eventSlug, eventTitle instead of providerEventId, eventName"
  - "Event sources tracked in separate eventSources table with provider/providerEventId linkage"
  - "createEvent mutation sets primarySourceKind='internal' automatically"
  - "Backward compatibility maintained via getTicketTailorEventByProviderId and upsertTicketTailorEvent"
  - "Mixed-source lists use unified default sort/filter behavior with source badges in secondary position"

requirements-completed:
  - Source-agnostic event model for finance and accommodation domains
  - Event creation API for internal events
  - Submission queue operator UX with prioritization
  - Backward-compatible ticketTailor integration

duration: 35min
completed: 2026-03-30
---

# Phase 20 Plan 2: Event Adapter and Handoff UX Summary

**Accommodation workspace now displays submission queue with unresolved-first prioritization and side-panel detail view. Events domain refactored to source-agnostic queries with canonical event model, event source management, and backward-compatible ticketTailor integration. Finance domain updated to consume new event fields.**

## Performance

- **Duration:** 35 min
- **Completed:** 2026-03-30
- **Files modified:** 11

## Accomplishments

### Accommodation Workspace UI

- Added submission queue UI displaying internal signup submissions
- Unresolved-first prioritization with unresolved items at top of queue
- Side-panel detail view for submission inspection
- Visual indicators: orange for unresolved, green for resolved
- Priority badges (CRITICAL/HIGH) and family group indicators
- Booking reference and submitter info display

### Convex Events Source-Agnostic Refactor

- Modified `getEvents()` to query canonical `events` table instead of `ticketTailorEvents`
- Modified `getEventsForLedger()` to return `{ eventId, slug, title, startsAt, currency }` instead of `{ providerEventId, name }`
- Added `createEvent` mutation for creating internal events
- Added `updateEvent` mutation for editing events
- Added `getEventSourcesForEvent()` query for retrieving event sources
- Added `getEventSourceByProvider()` query for provider lookup
- Preserved backward compatibility with `getTicketTailorEventByProviderId()` and `upsertTicketTailorEvent()`

### Event Creation Hooks

- Added `useCreateEvent` hook to `lib/convex/hooks/events.ts`
- Added `useUpdateEvent` hook to `lib/convex/hooks/events.ts`

### Finance Domain Updates

- Updated `lib/types/order.ts` `orderLedgerRowValidator` to use source-agnostic fields: `eventId`, `eventSlug`, `eventTitle`
- Updated `convex/orders.ts` `getOrdersWithFilters()` and `getOrdersForReconciliation()` with new field names
- Updated `lib/domain/finance/order-ledger.ts` type definitions
- Updated `lib/domain/finance/attendees.ts` to consume new event shape
- Updated `lib/domain/finance/reconciliation.ts` with new event fields
- Updated `lib/domain/finance/reporting.ts` with new event fields

## Files Modified

- `convex/events.ts` - Source-agnostic queries, create/update mutations, event source queries
- `convex/orders.ts` - Updated order queries with new event field names
- `convex/accommodation.ts` - Extended workspace payload with submission queue data
- `lib/domain/accommodation/assignments.ts` - Added SubmissionQueueRow type and workspace fields
- `lib/domain/finance/order-ledger.ts` - Updated to use eventId, eventSlug, eventTitle
- `lib/domain/finance/attendees.ts` - Updated event field consumption
- `lib/domain/finance/reconciliation.ts` - Updated event field references
- `lib/domain/finance/reporting.ts` - Updated event field references
- `lib/types/order.ts` - Updated orderLedgerRowValidator
- `lib/convex/hooks/events.ts` - Added useCreateEvent and useUpdateEvent hooks
- `app/(admin)/accommodation/[eventSlug]/page.tsx` - Added submission queue UI

## Decisions Made

### Accommodation UX

- Submission queue rows displayed in separate panel from room allocation grid
- Unresolved items (no assignment, skipped, not assignable) shown first with visual priority
- Side-panel opens on row click showing full submission metadata
- Color coding: orange for unresolved, green for resolved
- Priority badges help operators triage critical submissions

### Event Model

- Source-agnostic queries return canonical events table
- Event sources tracked separately via eventSources table
- Internal events created with primarySourceKind='internal'
- TicketTailor events linked via eventSources with provider='ticketTailor'
- Backward compatibility preserved for existing ticketTailor integration

### Finance Integration

- Finance domain now uses eventId, eventSlug, eventTitle consistently
- Removed provider-specific field names from domain types
- Reconciliation and reporting flows updated to new shape

## Next Phase Readiness

- Phase 21 (UI for Event Creation) can now build on source-agnostic event queries and mutations
- Accommodation workspace has submission queue for operator handoff
- Finance domain ready for reconciliation with internal and integration events
- Event creation API available for admin UI

---

_Phase: 20-operator-handoff-compatibility-layer_
_Plan: 02_
_Completed: 2026-03-30_
