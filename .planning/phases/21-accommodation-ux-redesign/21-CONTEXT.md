# Phase 21: Accommodation UX Redesign - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Make adding accommodation to an event feel like a coherent single workflow instead of scattered across multiple pages. Global hotels remain reusable across events (existing architecture), but the UX focuses on event-centric inline management. Remove duplicate linking mechanisms and add automatic slot generation.

</domain>

<decisions>
## Implementation Decisions

### User Flow Model

- **D-01:** Event settings page becomes the PRIMARY interface for accommodation setup
- **D-02:** Operators should be able to enable accommodation, link hotels, create hotels, create room types, and provision rooms all without leaving the event settings page
- **D-03:** The mental model is "I'm setting up accommodation for THIS event" not "I'm managing global inventory"

### Hotel Linking Architecture

- **D-04:** Merge the two parallel mutations (`linkHotelToEvent` and `attachHotelToEventByProviderId`) into a single unified mutation
- **D-05:** Deprecate `attachHotelToEventByProviderId` - remove from codebase after migration
- **D-06:** Remove the "Scope Reach Management" modal from inventory page entirely

### Slot Generation

- **D-07:** Automatic slot generation when rooms are provisioned/linked for an event (no manual trigger needed)
- **D-08:** Slots should be created/reconciled in the same transaction as room provisioning

### Guardrails and Status

- **D-09:** Warn operator when attempting to link a hotel that has 0 rooms
- **D-10:** Show room counts and bed capacity per linked hotel in the UI
- **D-11:** Show hotel status indicators: "Ready" (has rooms) vs "Needs rooms"

### Inventory Page

- **D-12:** Keep `/dashboard/accommodation/inventory` page fully functional as-is
- **D-13:** Inventory page is for operators who prefer inventory-centric workflow
- **D-14:** Hotel-to-event linking no longer happens from inventory page

### Inline UI Behavior

- **D-15:** Accommodation section in event settings should expand/collapse in place (no page navigation)
- **D-16:** "Add Hotel" action should show: dropdown of existing hotels + option to create new hotel inline
- **D-17:** Room type creation and room provisioning should be accessible inline from the linked hotel card
- **D-18:** Unlinking a hotel should be possible with confirmation (warns if rooms have assignments)

### Convex Contract Changes

- **D-19:** New or updated mutation: `linkHotelToEvent` (unified version)
- **D-20:** Add auto-slot generation logic to room creation/linking flows
- **D-21:** Deprecate and eventually remove: `attachHotelToEventByProviderId`

### the agent's Discretion

- Exact visual styling and component layout within event settings page
- Specific warning copy and guardrail messaging
- Exact form validation behavior (client-side vs server-side)
- Loading states and optimistic updates implementation

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Architecture

- `.planning/codebase/CONCERNS.md` § "UX Concerns: Accommodation Module" - Full analysis of current UX issues and flow
- `convex/accommodation.ts` - Main accommodation logic, mutations to consolidate
- `convex/schema.ts` - Table definitions for hotels, rooms, room types, slots

### Current UI Implementation

- `app/dashboard/events/[slug]/page.tsx` - Event settings page (target for redesign)
  - Lines 845-886: Accommodation toggle
  - Lines 889-968: Linked Hotels section (uses `linkHotelToEvent`)
- `app/dashboard/accommodation/inventory/page.tsx` - Inventory page (keep functional, remove Scope Reach modal)
  - Lines 675-748: Scope Reach Management modal (TO BE REMOVED)
- `app/dashboard/accommodation/[event-slug]/page.tsx` - Event accommodation workspace (unchanged)

### Convex Hooks

- `lib/convex/hooks/accommodation.ts` - All accommodation hooks
  - `useLinkHotelToEvent()` - Keep
  - `useAttachHotelToEventByProviderId()` - Deprecate/remove

### Data Model Relationships

See CONCERNS.md for diagram:

- `events` (has `accommodationEnabled` flag)
- `accommodationEventHotels` (junction: event ↔ hotel)
- `accommodationHotels` (GLOBAL)
- `accommodationRooms` (GLOBAL, linked to hotels)
- `accommodationRoomTypes` (GLOBAL)
- `accommodationSlots` (PER-EVENT)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/accommodation.ts`:
  - `linkHotelToEvent` (lines ~1434) - Keep and consolidate
  - `attachHotelToEventByProviderId` (lines ~1487) - Deprecate
  - `generateSlotsForRoom` (lines ~1538) - Use for auto-generation
  - `createHotel`, `createRoomType`, `createRooms` - Call from inline UI

- Event settings accommodation section (`app/dashboard/events/[slug]/page.tsx`):
  - Existing toggle and Linked Hotels section - Starting point for redesign

### Established Patterns

- Form dialogs/modals for creation flows (see inventory page 3-step provisioning modal)
- shadcn/ui components throughout dashboard
- Convex mutations with proper validation and error handling
- Optimistic updates pattern in accommodation hooks

### Integration Points

- Event settings page connects to: `api.events.getBySlug`, `api.accommodation.getEventHotels`
- Hotel linking mutations connect to: `api.accommodation.linkHotelToEvent` (unified)
- Room creation connects to: `api.accommodation.createHotel`, `api.accommodation.createRoomType`, `api.accommodation.createRooms`
- Slot generation happens in accommodation mutations

### Key Constraints

- `accommodationHotels`, `accommodationRooms`, `accommodationRoomTypes` are GLOBAL tables
- `accommodationSlots` is PER-EVENT (has `eventId` field)
- Room assignments use `ticketTailorAttendees.assignedRoomId`
- Hotel↔event linking validates that hotel exists and event has accommodation enabled

</code_context>

<specifics>
## Specific Ideas

- The flow should feel like: "I'm setting up THIS event's accommodation" not "I'm linking global resources"
- Inline expansion/collapse pattern similar to existing form sections in event settings
- Dropdown for adding hotels should show: hotel name + room count + city (if available)
- Inline forms for creating hotels/room types should be compact (not full-page modals)
- Warn clearly but don't block: "This hotel has no rooms yet. You'll need to add rooms before attendees can be assigned."
- Keep inventory page as power-user view - don't force everyone through it

</specifics>

<deferred>
## Deferred Ideas

- Visual board/Trello-style drag-and-drop view (would be a separate enhancement phase)
- Per-event hotel/room isolation (data model change - not needed, global reuse is valid)
- Changes to public signup accommodation flow (Phase 19 covers this)
- Changes to room assignment workspace UI (out of scope)

</deferred>

---

_Phase: 21-accommodation-ux-redesign_
_Context gathered: 2026-03-30_
