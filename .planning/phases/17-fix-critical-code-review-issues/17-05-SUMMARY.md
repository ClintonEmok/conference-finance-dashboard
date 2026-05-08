---
phase: 17-fix-critical-code-review-issues
plan: "05"
subsystem: ui
tags:
  [error-handling, loading-states, nextjs-app-router, skeleton, error-boundary]

requires:
  - phase: 17-04
    provides: Dashboard UI patterns and visual language to match

provides:
  - Global error boundary (app/global-error.tsx) for root-level crash recovery
  - Dashboard error boundary (app/dashboard/error.tsx) with shared fallback component
  - Shared DashboardErrorState component for consistent error UI
  - 13 route-level loading.tsx skeleton files across all dashboard segments

affects:
  - All dashboard route segments (error recovery and loading UX)

tech-stack:
  added: []
  patterns:
    - "Client error boundaries using Next.js error.tsx convention"
    - "Skeleton loading states matching page layout structure"
    - "Shared error state component in components/dashboard/"

key-files:
  created:
    - app/global-error.tsx
    - app/dashboard/error.tsx
    - components/dashboard/dashboard-error-state.tsx
    - app/dashboard/loading.tsx
    - app/dashboard/accommodation/loading.tsx
    - app/dashboard/orders/loading.tsx
    - app/dashboard/attendees/loading.tsx
    - app/dashboard/reconciliation/loading.tsx
    - app/dashboard/financial/loading.tsx
    - app/dashboard/payments/loading.tsx
    - app/dashboard/integrations/loading.tsx
    - app/dashboard/ticket-tailor/sync/loading.tsx
    - app/dashboard/settings/ticket-types/loading.tsx
    - app/dashboard/orders/[orderId]/loading.tsx
    - app/dashboard/attendees/[attendeeId]/loading.tsx
    - app/dashboard/accommodation/rooms/[roomId]/loading.tsx
  modified: []

key-decisions:
  - "global-error.tsx includes html/body wrappers as required by Next.js App Router convention"
  - "DashboardErrorState is a shared component to keep error UI consistent across dashboard routes"
  - "Each loading.tsx skeleton matches the specific page layout it previews (tables, metric cards, detail views)"
  - "Loading skeletons reuse existing glass-morphism card styling (border-white/60, bg-white/40, backdrop-blur-md)"

patterns-established:
  - "Pattern: Shared error state component in components/dashboard/ for reuse across error.tsx files"
  - "Pattern: Loading skeletons mirror page structure so transitions feel continuous"

requirements-completed: []

duration: 4min
completed: 2026-03-28
---

# Phase 17 Plan 05: Route-level error and loading fallbacks summary

**Global + dashboard error boundaries with shared fallback component and 13 route-level skeleton loading states across all dashboard segments**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T20:09:30Z
- **Completed:** 2026-03-28T20:14:04Z
- **Tasks:** 2
- **Files created:** 16

## Accomplishments

- Created `global-error.tsx` with html/body wrappers for root-level crash recovery
- Created shared `DashboardErrorState` component with retry action, error detail display, and matching dashboard visual language
- Added `dashboard/error.tsx` using the shared fallback for route-level error recovery
- Added 13 `loading.tsx` skeleton files covering all dashboard route segments: overview, accommodation, orders, attendees, reconciliation, financial, payments, integrations, ticket-tailor sync, settings/ticket-types, and three dynamic detail routes

## Task Commits

1. **Task 1: Error boundaries and shared fallback** - `3e90cd6` (fix)
   - `app/global-error.tsx` — root-level error boundary with html/body
   - `app/dashboard/error.tsx` — dashboard-scoped error boundary
   - `components/dashboard/dashboard-error-state.tsx` — shared error UI

2. **Task 2: Route-level loading skeletons** - `5c5b314` (fix)
   - 13 `loading.tsx` files across all dashboard segments

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `app/global-error.tsx` — Root-level error boundary with html/body wrappers
- `app/dashboard/error.tsx` — Dashboard error boundary using shared fallback
- `components/dashboard/dashboard-error-state.tsx` — Shared error state component (retry action, error detail, gradient accent button)
- `app/dashboard/loading.tsx` — Overview skeleton with metric cards, trend table, attendees table
- `app/dashboard/accommodation/loading.tsx` — Accommodation skeleton with hotel cards
- `app/dashboard/orders/loading.tsx` — Orders table skeleton
- `app/dashboard/attendees/loading.tsx` — Attendees table skeleton
- `app/dashboard/reconciliation/loading.tsx` — Reconciliation summary + table skeleton
- `app/dashboard/financial/loading.tsx` — Financial metrics + table skeleton
- `app/dashboard/payments/loading.tsx` — Payments table skeleton
- `app/dashboard/integrations/loading.tsx` — Integration cards skeleton
- `app/dashboard/ticket-tailor/sync/loading.tsx` — Sync run list skeleton
- `app/dashboard/settings/ticket-types/loading.tsx` — Ticket type cards skeleton
- `app/dashboard/orders/[orderId]/loading.tsx` — Order detail page skeleton
- `app/dashboard/attendees/[attendeeId]/loading.tsx` — Attendee detail page skeleton
- `app/dashboard/accommodation/rooms/[roomId]/loading.tsx` — Room detail page skeleton

## Decisions Made

- Used shared `DashboardErrorState` component rather than inlining error UI in each `error.tsx` — reduces duplication and ensures consistent error UX across dashboard routes
- Each loading skeleton mirrors the specific page's layout (table columns, card count, sidebar structure) so transitions feel continuous rather than generic
- Skeleton styling matches existing dashboard glass-morphism pattern (glass cards, purple gradient accents, Skeleton components from shadcn/ui)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all files compiled cleanly with TypeScript on first pass.

## Next Phase Readiness

- Dashboard crash paths no longer white-screen: `global-error.tsx` handles root crashes, `dashboard/error.tsx` handles route-level errors
- All dashboard routes show immediate skeleton feedback during data loading
- Ready for 17-06

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-28_
