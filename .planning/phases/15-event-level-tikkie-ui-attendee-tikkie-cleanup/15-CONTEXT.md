# Phase 15: Event-level Tikkie UI + attendee Tikkie cleanup - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add UI for event-level Tikkie payment tracking on the financial page (collapsible section with event picker). Remove per-attendee and per-order Tikkie link creation and status display from the attendee detail and reconciliation pages. Show matched payments from the event-level link on attendee detail. Move per-attendee template overrides to event-level settings.

</domain>

<decisions>
## Implementation Decisions

### Event Tikkie UI placement

- **D-01:** Event-level Tikkie lives on the financial page (`/dashboard/financial`) as a collapsible section
- **D-02:** Financial page gains an event picker; Tikkie section shows data for the selected event
- **D-03:** Tikkie link creation (generate link button) lives on the financial page only, not on attendee detail

### Event Tikkie content

- **D-04:** Payment list shows: payer name, amount, date, and matched/unmatched status per payment
- **D-05:** Manual assignment available — button on unmatched payments to pick an order (reuse pattern from reconciliation assign dialog)
- **D-06:** Summary header shows: total payments, matched count, unmatched count, total amount
- **D-07:** Auto-match triggered both manually (button) and automatically on payment sync

### Attendee Tikkie cleanup

- **D-08:** Remove per-attendee Tikkie link creation dialog from attendee detail page
- **D-09:** Remove per-attendee Tikkie link summary/status from attendee detail page
- **D-10:** Attendee detail shows payments from the event-level link that matched this attendee's order (not per-attendee links)
- **D-11:** Move per-attendee amount override to event-level template settings (remove from attendee detail)

### Reconciliation page changes

- **D-12:** Remove per-order Tikkie link creation dialog from reconciliation page
- **D-13:** Remove per-order Tikkie link summary from reconciliation page
- **D-14:** Reconciliation stays order-focused; no event-level Tikkie stats on this page

### agent's Discretion

- Exact layout of the collapsible Tikkie section on the financial page
- How the event picker integrates with existing financial page data
- Loading/error states for the Tikkie section
- Whether old per-order Tikkie data in the DB gets migrated or just hidden

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 14 implementation (backend)

- `.planning/phases/14-event-level-tikkie-payment-tracking/` — Schema, Convex functions, domain logic, API routes for event-level Tikkie
- `convex/schema.ts` — `tikkiePaymentLinks` (widened) + `tikkiePayments` table
- `convex/tikkie.ts` — `getEventPaymentLink`, `createEventPaymentLink`, `getTikkiePaymentsByLink`, `upsertTikkiePayment`, `matchTikkiePayment`, `autoMatchTikkiePayments`
- `lib/domain/finance/tikkie-event-links.ts` — `createEventTikkieLink()`
- `lib/domain/finance/tikkie-event-payments.ts` — `fetchAndStoreTikkiePayments()`, `syncAllEventPaymentLinks()`, `manuallyMatchTikkiePayment()`
- `app/api/dashboard/tikkie-event-links/route.ts` — GET (link+payments+stats), POST (create), PATCH (manual match)
- `lib/convex/hooks/tikkie.ts` — `useEventPaymentLink`, `useTikkiePaymentsByLink`, `useAutoMatchTikkiePayments`, `useMatchTikkiePayment`

### Existing UI patterns

- `components/dashboard/tikkie-link-dialog.tsx` — Per-order Tikkie creation dialog (to be removed from attendee detail + reconciliation)
- `components/dashboard/tikkie-link-summary.tsx` — Per-order link status display (to be removed)
- `components/payments/assign-dialog.tsx` — Manual payment assignment dialog (pattern to reuse for Tikkie payment assignment)
- `components/payments/payment-list.tsx` — Payment list component (pattern reference)

### Key decisions from prior phases

- `.planning/STATE.md` — Key Decisions section (decision IDs 05-02, 06-01, 10-05, 11-04)
- `lib/auth/server.ts` — `requireApiUser()` for protected routes

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `TikkieLinkSummary` component — existing link display pattern, can inform the new event-level link status display
- `AssignDialog` (`components/payments/assign-dialog.tsx`) — manual payment-to-order assignment UI, reusable for Tikkie payment manual matching
- `PaymentList` (`components/payments/payment-list.tsx`) — payment list display, pattern reference for the Tikkie payment list
- `Button`, `Card`, `CardHeader`, `CardContent` — shadcn/ui components used throughout
- `useEventPaymentLink`, `useTikkiePaymentsByLink`, `useAutoMatchTikkiePayments`, `useMatchTikkiePayment` — new hooks ready for the UI

### Established Patterns

- Financial page (`app/dashboard/financial/page.tsx`) — client component with `useEffect` + `fetch()` for data loading, cards for sections
- Attendee detail page (`app/dashboard/attendees/[attendeeId]/page.tsx`) — large client component, heavy Tikkie integration (1149 lines), to be trimmed
- Reconciliation page (`app/dashboard/reconciliation/page.tsx`) — client component, per-order Tikkie links, to be cleaned up
- Dashboard navigation via `DashboardShell` component
- All dashboard pages are client components with local state management

### Integration Points

- `app/dashboard/financial/page.tsx` — where the new event Tikkie section gets added
- `app/dashboard/attendees/[attendeeId]/page.tsx` — what gets removed/changed
- `app/dashboard/reconciliation/page.tsx` — what gets removed
- `app/dashboard/settings/ticket-types/page.tsx` — possible home for event-level template settings (if moved there)

</code_context>

<specifics>
## Specific Ideas

No specific visual references provided. Open to standard dashboard patterns for collapsible sections and payment tracking.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 15-event-level-tikkie-ui-attendee-tikkie-cleanup_
_Context gathered: 2026-03-26_
