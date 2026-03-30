---
phase: 22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui
plan: 03
subsystem: ui
 tags: [react, typescript, shadcn, expandable-sections, allocation-summary]

# Dependency graph
requires:
  - phase: 22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui
    provides: assignment.ts types and buildAssignmentBoard function
provides:
  - buildAllocationSummary function for room-based allocation summaries
  - AllocationSummary type with rooms, occupants, and unassigned attendee tracking
  - ReviewSection reusable expandable card component
  - Redesigned ReviewSubmitStep with three expandable sections
  - Room allocation summary grouped by room with occupant details
affects:
  - Phase 22 plans that depend on review step UI
  - Future phases needing allocation summary display

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Expandable card sections using shadcn/ui Card with clickable headers
    - Room-based allocation summary grouped by room label
    - useMemo for computed allocation summaries

key-files:
  created:
    - components/signup/ReviewSection.tsx
    - components/ui/alert.tsx
  modified:
    - components/signup/assignment.ts
    - components/signup/steps/ReviewSubmitStep.tsx
    - components/signup/SignupFlowShell.tsx

key-decisions:
  - "Default Tickets and Room Allocations to expanded, Attendee Details to collapsed for optimal UX flow"
  - "Use amber warning styling for unfilled beds and unassigned attendees to draw attention without error severity"
  - "Group allocation summary by room label with full occupant details (name, ticket, gender, location)"

patterns-established:
  - "Expandable section pattern: Card with clickable CardHeader, ChevronUp/ChevronDown indicator, conditional CardContent rendering"
  - "Allocation summary pattern: Room-based grouping with occupant arrays and unfilled bed counts"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-30
---

# Phase 22 Plan 03: Review Step with Expandable Sections Summary

**Redesigned review/submit step with three expandable sections (Tickets, Attendee Details, Room Allocations) and room-based allocation summary showing occupants, unfilled beds, and unassigned attendees.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-30T22:49:09Z
- **Completed:** 2026-03-30T22:55:49Z
- **Tasks:** 4
- **Files modified:** 4 (1 created, 1 new UI component)

## Accomplishments

- Created `buildAllocationSummary` function to group assignments by room with occupant details
- Built reusable `ReviewSection` expandable card component with badge support
- Redesigned `ReviewSubmitStep` with three collapsible sections
- Implemented room allocation summary showing who is in which room with bullet-point occupant lists
- Added unfilled beds warning and unassigned attendee alerts
- Integrated all changes with existing submit functionality and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Add allocation summary builder to assignment.ts** - `936e3da` (feat)
2. **Task 2: Create expandable section components** - `cc4c1d0` (feat)
3. **Task 3: Redesign ReviewSubmitStep with expandable sections** - `56aabac` (feat)
4. **Task 4: Update SignupFlowShell to pass event to ReviewSubmitStep** - `11f90ea` (feat)

**Plan metadata:** Will be committed with SUMMARY.md

## Files Created/Modified

- `components/signup/assignment.ts` - Added AllocationSummary types and buildAllocationSummary function
- `components/signup/ReviewSection.tsx` - New reusable expandable section component (created)
- `components/signup/steps/ReviewSubmitStep.tsx` - Complete redesign with expandable sections and allocation summary
- `components/signup/SignupFlowShell.tsx` - Added event prop to ReviewSubmitStep
- `components/ui/alert.tsx` - Added shadcn Alert component for warning displays (created)

## Decisions Made

- Default Tickets and Room Allocations sections to expanded state since these are the most critical for review
- Default Attendee Details to collapsed to reduce visual overload while keeping it accessible
- Use amber warning styling (not destructive red) for unfilled beds since this is acceptable per user preference
- Show occupant details inline with ticket label, location, and gender in parentheses for quick scanning
- Use bullet-point lists for room occupants to clearly show groupings

## Deviations from Plan

**None - plan executed exactly as written.**

## Issues Encountered

1. **Missing Alert component:** The plan referenced Alert component usage but it wasn't installed. Added via `npx shadcn@latest add alert` to maintain consistency with shadcn/ui patterns.

2. **Pre-existing TypeScript error:** Line 484 in SignupFlowShell has a pre-existing type mismatch where RoomAssignmentStep expects AttendeeDraft[] but receives a mapped subset. This is unrelated to the current plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Review step is now fully functional with expandable sections and allocation summary
- Room allocation display shows occupants grouped by room with clear visual hierarchy
- Warning states for unfilled beds and unassigned attendees provide necessary operator context
- Ready for integration with backend submission flow

---

_Phase: 22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui_
_Completed: 2026-03-30_
