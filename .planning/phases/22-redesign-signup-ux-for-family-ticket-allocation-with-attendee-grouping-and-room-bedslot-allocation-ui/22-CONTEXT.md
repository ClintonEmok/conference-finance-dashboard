# Phase 22: Redesign signup UX for family ticket allocation with attendee grouping and room bedslot allocation UI - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the public signup flow to let families/groups determine how their attendees get allocated across bedslots. The new step order is: Tickets → Attendee Details → Rooms → Review. Attendees enter their details (names, gender, contact info) BEFORE room allocation, enabling informed allocation decisions. The room allocation UI shifts from specific room-based assignment to bedslot-based allocation grouped by room type, with real-time preview of actual room assignments.

</domain>

<decisions>
## Implementation Decisions

### Attendee Grouping Strategy

- **D-01:** Grouping happens during room allocation time (not as a separate step) - users drag attendees into proximity-based visual groups
- **D-02:** Proximity-based visual representation - attendees physically arranged close together in UI represent groups
- **D-03:** Soft constraint approach - groups are preferences, not requirements; system allows splitting groups with no blocking validation
- **D-04:** Groups are primarily for organizing allocation decisions and providing operator context, not strict enforcement

### Room Allocation UX Redesign

- **D-05:** Bedslots presented grouped by room type (e.g., "Double rooms: 6 beds available") as expandable sections
- **D-06:** Real-time room preview as users drag attendees - they see which actual room they'd be assigned to
- **D-07:** Gender constraints are admin indicators only - families can have mixed genders (husband/wife, siblings of different genders)
- **D-08:** Swap-if-occupied interaction pattern - dragging to an occupied slot swaps the occupants (like phone home screen)

### Validation & Constraints

- **D-09:** Minimum validation approach - only ensure each attendee has a bed assigned; no complex group/constraint validation
- **D-10:** Soft preference with override for groups - default to keeping groups together but allow explicit override
- **D-11:** No capacity feedback visible to user - system handles capacity behind the scenes
- **D-12:** Allocation summary on review step - grouped by room showing who is in which room

### Step Transition Logic

- **D-13:** All attendee fields must be complete (including new 'location' field) before proceeding to room allocation
- **D-14:** Users can navigate back to attendee details with warning: "Changes to attendee count will reset your room allocations"
- **D-15:** Preserve existing attendee details when ticket quantities change - intelligently add/remove attendees to match new count while preserving entered data
- **D-16:** Review step uses expandable sections for tickets, attendees, and allocations

### the agent's Discretion

- Exact visual design of proximity-based grouping (spacing, borders, etc.)
- Specific copy and wording for warnings and acknowledgment messages
- Animation/transition details for drag-and-drop interactions
- Exact layout and styling of expandable review sections

</decisions>

<specifics>
## Specific Ideas

- New field to add: "location" (city/region) in attendee details step
- Flow order change: current is tickets → rooms → attendees → review; new is tickets → attendees → rooms → review
- Current room assignment shows specific rooms ("Room 101 - Double"); new design should hide room numbers initially, showing only room type groupings
- Real-time preview should help users understand their allocation - they see actual room assignments as they drag, giving them confidence in the system
- Family allocation example: family of 5 (2 parents, 3 children) can decide 2 children share, parents get their own space, one child fills remaining slot

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Signup Implementation

- `components/signup/SignupFlowShell.tsx` — Current flow orchestration and step management
- `components/signup/state.ts` — Signup draft state structure and validation
- `components/signup/assignment.ts` — Room assignment logic and board building
- `components/signup/steps/TicketStep.tsx` — Current ticket selection UI
- `components/signup/steps/RoomAssignmentStep.tsx` — Current room assignment UI (to be redesigned)
- `components/signup/steps/AttendeeDetailsStep.tsx` — Current attendee details form
- `components/signup/steps/ReviewSubmitStep.tsx` — Current review step

### Types and Domain

- `lib/types/signup.ts` — Signup type definitions
- `lib/domain/signup/catalog.ts` — Public signup catalog types

### Backend Contracts

- `convex/signupCatalog.ts` — Public read contracts for signup
- `convex/signupSubmission.ts` — Submission mutation and validation
- `convex/schema.ts` — Database schema including accommodation slots

### State Management Patterns

- Phase 19 decisions for signup flow patterns and validation approaches
- Phase 18 decisions for canonical contracts and submission structure

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **SignupFlowShell.tsx**: Current flow orchestrator with step navigation, validation, and state persistence - can be adapted for new step order
- **assignment.ts**: `buildAssignmentBoard`, `canDropAttendeeIntoSlot`, `summarizeUnfilledBeds` - core assignment logic that may need extension for group handling
- **state.ts**: Draft state structure with `deriveAttendeeDraftsFromTicketSelections`, validation patterns - `invalidateDownstreamForTicketChange` will need updates for new step order
- **RoomAssignmentStep.tsx**: Existing drag-and-drop implementation using native HTML5 drag API - can be adapted for new bedslot grouping UI
- **shadcn/ui components**: Card, Button, Badge, Input, Label - established component library for consistent UI

### Established Patterns

- **Step-based linear flow**: `SIGNUP_STEP_ORDER` array defines step sequence; validation happens at step transitions
- **Draft persistence**: Local storage with `signup-draft:${eventId}` key pattern
- **Attendee key generation**: `${ticketTypeId}-${index}` pattern for unique attendee identifiers
- **Downstream invalidation**: `invalidateDownstreamForTicketChange` and `invalidateDownstreamForRoomChange` functions clear dependent state
- **Validation summary pattern**: `AttendeeValidationSummary` type with per-attendee error tracking

### Integration Points

- **Route**: `/signup/[slug]/page.tsx` - entry point for signup flow
- **Convex hooks**: `usePublicSignupCatalog()` for event/ticket/accommodation data
- **Submission client**: `submitSignupDraft()` function handles API submission
- **Local storage**: Draft state persisted to `localStorage` with event-scoped keys
- **Step navigation**: Grid of step buttons with active/complete states

### Code Changes Required

1. **SignupFlowShell.tsx**: Reorder `SIGNUP_STEP_ORDER` from `[tickets, rooms, attendees, review]` to `[tickets, attendees, rooms, review]`
2. **state.ts**: Add 'location' field to `AttendeeDraft` type; update validation logic
3. **AttendeeDetailsStep.tsx**: Add location input field
4. **RoomAssignmentStep.tsx**: Complete redesign for bedslot grouping by room type
5. **assignment.ts**: Extend board building to support group visualization and real-time room preview
6. **ReviewSubmitStep.tsx**: Restructure for expandable sections with allocation summary

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui_
_Context gathered: 2026-03-31_
