---
phase: 06-tikkie-integration
plan: 03
subsystem: payments
tags: [tikkie, templates, nextjs, ui-components, attendee-override, ticket-types]

# Dependency graph
requires:
  - phase: 06-tikkie-integration
    provides: Tikkie operator modal, latest-link summary, and attendee detail integration
provides:
  - Reusable Tikkie payment templates per ticket type with template matching
  - Admin UI for managing templates per event
  - Attendee-level amount override with fallback to template
affects: [07-smart-allocation, operator-follow-up]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Template matching priority: attendee override > ticket type template > default
    - Template CRUD via protected REST API
    - Soft-delete for templates (isActive flag)

key-files:
  created:
    - app/dashboard/settings/ticket-types/page.tsx
  modified:
    - lib/domain/finance/attendee-detail.ts
    - lib/domain/finance/tikkie-templates.ts
    - app/api/dashboard/attendees/[attendeeId]/route.ts
    - app/dashboard/attendees/[attendeeId]/page.tsx

key-decisions:
  - "Integrated template matching into attendee detail generation defaults for auto-fill"
  - "Added PATCH endpoint for attendee amount override management"
  - "Built template management UI with event selector and inline add/edit/delete"

patterns-established:
  - "Template management pattern: event selector, ticket type list, template status, inline form"
  - "Attendee override pattern: display current value, show fallback, inline edit/save/clear"

requirements-completed: [TK-04]

# Metrics
duration: 9 min
completed: 2026-03-21
---

# Phase 6 Plan 3: Add Reusable Ticket-Type Tikkie Payment Templates

**Template-aware Tikkie generation with admin management UI and attendee-level amount override.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-21T09:30:13Z
- **Completed:** 2026-03-21T09:39:xxZ
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Integrated template matching into attendee detail generation defaults for automatic pre-fill
- Created template management UI with event selector and inline add/edit/delete functionality
- Added attendee-level amount override with PATCH endpoint and inline edit UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate template matching into attendee detail defaults** - `2cf97cc` (feat)
2. **Task 2: Create ticket types template management UI** - `0c00c14` (feat)
3. **Task 3: Add attendee override management and template fallback display** - `64b6629` (feat)

**Plan metadata:** `TBD` (pending planning docs commit)

## Files Created/Modified
- `lib/domain/finance/attendee-detail.ts` - Template matching integration, templateFallback info, override endpoint
- `lib/domain/finance/tikkie-templates.ts` - Already existed with full CRUD
- `app/dashboard/settings/ticket-types/page.tsx` - New template management UI
- `app/api/dashboard/attendees/[attendeeId]/route.ts` - Added PATCH for override management
- `app/dashboard/attendees/[attendeeId]/page.tsx` - Added override UI section

## Decisions Made
- Integrated template matching directly into `getAttendeeDetail` for consistent auto-fill behavior
- Added `templateFallback` to show what would be used if override is cleared (helps operators understand)
- Soft-delete templates (isActive=false) instead of hard delete to preserve audit trail

## Verification Results

1. `npm run typecheck` - passed
2. `npm run lint` - passed (warnings only, no errors)

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 6 Tikkie template work is complete. Next: Phase 7 smart allocation and attendee signals.
- Operators can now:
  - Configure templates per ticket type per event from settings
  - Generate Tikkie links with pre-filled amount/description from templates
  - Override amounts for individual attendees when needed

---
*Phase: 06-tikkie-integration*
*Completed: 2026-03-21*
