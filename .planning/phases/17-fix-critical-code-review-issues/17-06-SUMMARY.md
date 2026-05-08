---
phase: 17-fix-critical-code-review-issues
plan: "06"
subsystem: ui
tags: [formatting, accessibility, radix, dialog, money-formatting]

# Dependency graph
requires:
  - phase: 17-05
    provides: Error/loading fallbacks for dashboard routes
provides:
  - Centralized money formatting via lib/format.ts
  - Accessible Radix Dialog primitives replacing ad-hoc modal shells
affects:
  - All dashboard pages displaying monetary amounts
  - Payment and Tikkie UI components with dialogs

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Shared formatting helper imported from lib/format.ts (single source for EUR minor-unit display)
    - Radix Dialog controlled mode for programmatic open/close state

key-files:
  created:
    - lib/format.ts
  modified:
    - app/dashboard/page.tsx
    - app/dashboard/financial/page.tsx
    - app/dashboard/orders/page.tsx
    - app/dashboard/orders/[orderId]/page.tsx
    - app/dashboard/reconciliation/page.tsx
    - app/dashboard/reconciliation/payments/page.tsx
    - app/dashboard/attendees/[attendeeId]/page.tsx
    - app/dashboard/settings/ticket-types/page.tsx
    - components/dashboard/tikkie-link-dialog.tsx
    - components/dashboard/tikkie-link-summary.tsx
    - components/dashboard/event-tikkie-section.tsx
    - components/payments/payment-list.tsx
    - components/payments/manual-entry-form.tsx
    - components/payments/assign-dialog.tsx

key-decisions:
  - "Centralize formatMoney in lib/format.ts with a frozen Intl.NumberFormat instance for performance"
  - "Use Radix Dialog controlled mode (open/onOpenChange) to preserve existing parent-driven state management"
  - "Add DialogDescription to every converted dialog for proper screen-reader context"
  - "Keep DialogFooter for action buttons to match shared design primitive conventions"

patterns-established:
  - "Pattern: Single formatMoney export from lib/format.ts replaces 14 duplicated helpers"
  - "Pattern: Dialog conversion uses Dialog > DialogContent > DialogHeader > DialogTitle > DialogDescription > DialogFooter"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-03-29
---

# Phase 17 Plan 06: Centralize Money Formatting and Fix Modal Accessibility Summary

**Centralized EUR formatting via shared lib/format.ts and replaced 3 ad-hoc modal shells in payment/Tikkie UI with accessible Radix Dialog primitives**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-29
- **Completed:** 2026-03-29
- **Tasks:** 2
- **Files modified:** 15 (1 created, 14 modified)

## Accomplishments

- Created `lib/format.ts` with a single `formatMoney(minor)` export backed by a frozen `Intl.NumberFormat` instance
- Replaced 14 identical local `formatMoney` helper functions across dashboard pages and components with a shared import
- Converted `components/payments/assign-dialog.tsx` from custom overlay/div modal to Radix Dialog with focus trapping, title/description semantics, and Escape-key close
- Converted `components/dashboard/event-tikkie-section.tsx` create-Tikkie-link modal to Radix Dialog
- Converted `components/dashboard/event-tikkie-section.tsx` assign-payment modal to Radix Dialog
- Added `DialogDescription` to every converted dialog for screen-reader context

## Task Commits

Each task was committed atomically:

1. **Task 1: Centralize formatMoney** - `809c4a0` (fix)
   - Created `lib/format.ts` with single exported `formatMoney(minor) → string`
   - Replaced 14 duplicated local helpers with `import { formatMoney } from "@/lib/format"`
   - Output and Intl options unchanged for all callers

2. **Task 2: Replace custom modal shells with accessible Radix Dialog** - `e3b6c8c` (fix, committed alongside parallel plan 17-03)
   - `assign-dialog.tsx`: custom overlay → `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`
   - `event-tikkie-section.tsx` create-link modal: conditional render → controlled `Dialog` with `open={isCreateModalOpen}`
   - `event-tikkie-section.tsx` assign modal: conditional render → controlled `Dialog` with `open={!!assigningPaymentId}`

**Plan metadata:** (no separate docs commit — SUMMARY created as part of plan execution)

## Files Created/Modified

- `lib/format.ts` — Shared `formatMoney` with frozen `Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" })`
- `components/payments/assign-dialog.tsx` — Radix Dialog conversion + formatMoney import
- `components/dashboard/event-tikkie-section.tsx` — Two Radix Dialog conversions + formatMoney import
- 12 dashboard/component files — formatMoney import only (no behavioral change)

## Decisions Made

- Used a frozen `Intl.NumberFormat` instance in `lib/format.ts` rather than creating a new formatter per call, for micro-optimization on high-frequency rendering paths
- Used Radix Dialog controlled mode (`open`/`onOpenChange`) rather than uncontrolled, because all three dialogs already manage open state via parent-driven `useState`
- Added `DialogDescription` with contextual text to every dialog (e.g., "Search for and select an order to assign this payment to") so screen readers announce purpose alongside the title

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — `npm run typecheck` passes for all modified files. Pre-existing errors in `lib/integrations/tikkie/client.ts` are unrelated.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Money formatting is now centralized — future finance code should import from `lib/format.ts`
- All payment/Tikkie dialogs are accessible (focus trapping, ARIA semantics, keyboard handling)
- Ready for 17-07

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-29_
