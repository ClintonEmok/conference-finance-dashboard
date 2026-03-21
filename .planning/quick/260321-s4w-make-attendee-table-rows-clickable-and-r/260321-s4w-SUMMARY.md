---
phase: quick
plan: s4w
type: summary
subsystem: dashboard-ui
tags:
  - attendees
  - ui-polish
  - navigation
tech_stack:
  added: []
  patterns:
    - Clickable table rows with cursor-pointer and hover states
    - Programmatic navigation with URLSearchParams preservation
files:
  key_files:
    created: []
    modified:
      - app/dashboard/attendees/page.tsx
decisions: []
metrics:
  duration: < 5 min
  completed: "2026-03-21"
---

# Quick Task s4w Summary: Make Attendee Table Rows Clickable

## One-liner

Made attendee list table rows clickable for direct navigation to attendee detail, removing the explicit "Open detail" button column.

## Completed Tasks

| Task | Name                                      | Commit  | Files                            |
| ---- | ----------------------------------------- | ------- | -------------------------------- |
| 1    | Make rows clickable, remove detail button | be1f925 | app/dashboard/attendees/page.tsx |

## Changes Made

### `app/dashboard/attendees/page.tsx`

**Added:**

- `useRouter` import from `next/navigation`
- `const router = useRouter()` hook call
- Click handler on `<tr>` elements with URLSearchParams preservation
- Row styling: `cursor-pointer transition-colors hover:bg-muted/50`

**Removed:**

- `<th>Detail</th>` column header from table thead
- `<td>` cell with "Open detail" Button from each row

**Behavior:**

- Clicking any cell in a row navigates to `/dashboard/attendees/{attendeeId}`
- Query params preserved: `search`, `eventId`, `source`

## Verification

- Build passes: `npm run build` completed successfully
- No "Detail" column header exists
- No "Open detail" button exists
- Rows have `cursor-pointer` and `hover:bg-muted/50` styling
- Clicking navigates to correct attendee detail URL with params

## Success Criteria Met

- [x] No "Detail" th in the table header
- [x] No "Open detail" button in any row
- [x] Rows have cursor-pointer and hover:bg-muted/50 styling
- [x] Clicking any cell navigates to /dashboard/attendees/{attendeeId} with correct search params

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.
