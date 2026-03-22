---
phase: 08-attendee-followup-and-reconciliation-ux
plan: 01
subsystem: ui
tags: [nextjs, shadcn, lucide-react, prisma, typescript]

# Dependency graph
requires:
  - phase: 05-room-allocation-and-operator-flow
    provides: Reconciliation card grid UI with Tikkie integration
affects:
  - phase: 08-attendee-followup-and-reconciliation-ux
    # Phase 2 builds on same pages with TanStack Query refetch

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Expand/collapse per-order attendee breakdown with inline single-attendee display
    - Source param tracking for origin-based UI messaging

key-files:
  created:
    - app/api/dashboard/orders/[orderId]/route.ts
    - components/dashboard/order-attendee-breakdown.tsx
  modified:
    - app/dashboard/reconciliation/page.tsx
    - app/dashboard/attendees/page.tsx

key-decisions:
  - "Pass source=reconciliation instead of source=outstanding-balances for reconciliation origin tracking"
  - "Single-attendee orders show inline '1 attendee' without expand/collapse for better UX density"
  - "Attendee breakdown fetched client-side per card to avoid over-fetching on large reconciliation lists"

patterns-established:
  - "Expand/collapse attendee breakdown pattern: count badge → click to expand → individual attendee rows with status badges"
  - "Paid checkmark: conditional rendering with green text-emerald-600 for zero outstanding balances"

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 08 Plan 01: Attendee Follow-up and Reconciliation UX Summary

**Reconciliation CTA now tracks origin with source=reconciliation, attendees show green Paid checkmark for €0 balances, and order cards display expandable attendee breakdowns**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T23:53:15Z
- **Completed:** 2026-03-22T23:57:36Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Reconciliation card CTA now passes `source=reconciliation` instead of `source=outstanding-balances` for origin tracking
- Attendees page shows green "Paid" checkmark with `text-emerald-600 dark:text-emerald-400` for zero outstanding balances
- Reconciliation cards now display attendee count badge with expand/collapse breakdown showing individual names, ticket types, and status
- Single-attendee orders show "1 attendee: Name" inline without expand/collapse

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Attendee Follow-up Flow - Direct Navigation** - `217494b` (feat)
2. **Task 2: Fix Attendees Page Amount Display - Show "Paid"** - `3b74df0` (feat)
3. **Task 3: Add Attendee Breakdown Per Order on Reconciliation Cards** - `41f934e` (feat) + `99db5e9` (fix: icon fix)

**Plan metadata:** `41f934e` (feat: complete 08-01 plan tasks)

## Files Created/Modified

- `app/api/dashboard/orders/[orderId]/route.ts` - GET endpoint returning order + attendees with auth guard
- `components/dashboard/order-attendee-breakdown.tsx` - Expandable attendee breakdown with status badges and inline single-attendee display
- `app/dashboard/reconciliation/page.tsx` - Added `OrderAttendeeBreakdown` integration in both desktop and mobile card grids; updated CTA source param
- `app/dashboard/attendees/page.tsx` - Added `Check` icon import; modified Amounts cell to show green "Paid" for zero outstanding

## Decisions Made

- Pass `source=reconciliation` for reconciliation origin tracking (instead of `outstanding-balances`) to distinguish context for attendees page banner messaging
- Update attendees page banner to also recognize `source=reconciliation` alongside existing `source=outstanding-balances` check
- Single-attendee orders bypass expand/collapse entirely — show inline "1 attendee: Name · TicketType" for operational density
- Attendee breakdown fetches lazily per card via client-side useEffect — avoids fetching all attendee data upfront on large reconciliation lists

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

- Reconciliation and attendees pages are ready for TanStack Query migration in Plan 08-02
- Attendee breakdown API endpoint `/api/dashboard/orders/{orderId}` is available for reuse
- All three success criteria from plan verification section are met

---

_Phase: 08-attendee-followup-and-reconciliation-ux_
_Completed: 2026-03-23_
