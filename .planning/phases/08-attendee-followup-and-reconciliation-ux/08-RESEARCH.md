# Phase 8: Attendee Follow-up & Reconciliation UX - Research

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Codebase research

## Phase Goal

Improve reconciliation and attendees UX with five targeted fixes: simplify reconciliation page layout, fix attendee follow-up flow to navigate directly to attendee detail, add attendee breakdown per order, fix attendees route amount display, and add background auto-sync.

## Research Findings

### 1. Reconciliation Page Layout (UX-01)

**Current state:** The reconciliation page at `app/dashboard/reconciliation/page.tsx` already has a card-based layout — quick task 260323-07i converted it to a `lg:grid-cols-2` card grid. Each order card shows:

- Order ID (mono font)
- Event name + order date
- Status badge (destructive for cancelled, outline for refunded, secondary for pending)
- Amount / Outstanding breakdown
- Reconciliation reason labels
- "Open attendee follow-up" button
- Tikkie link section with Generate/Copy/Refresh actions

**Assessment:** Layout simplification is DONE. The card grid is clean and responsive. Only minor polish may be needed (e.g., making the "Flagged rows" metric more prominent in the card header area).

### 2. Attendee Follow-up Flow - Direct Navigation (UX-02)

**Current state:** From reconciliation, "Open attendee follow-up" navigates to `/dashboard/attendees?search={orderId}&eventId={eventId}&source=outstanding-balances&orderId={orderId}`. This lands on the attendees page with the order pre-filtered, NOT directly on attendee detail.

**Click path:**

```
Reconciliation card → /dashboard/attendees (filtered by order) → Click table row → /dashboard/attendees/[attendeeId]
```

The attendees table (`app/dashboard/attendees/page.tsx`) has clickable rows that navigate to `attendee-detail` page via `router.push()` with preserved search params. This is the "two-step" flow mentioned in the roadmap goal.

**Assessment:** The existing flow is intentional per FLOW-01 (preserve context across screens). The roadmap says "navigate directly" but the existing two-step preserves order context. Need to clarify: should clicking "Open attendee follow-up" from reconciliation go directly to `/dashboard/attendees/[attendeeId]` for single-attendee orders? Or is the two-step acceptable for multi-attendee orders?

**Recommendation:** For single-attendee orders, navigate directly. For multi-attendee orders (the common case), show the filtered attendees list. This is a targeted fix, not a full redesign.

### 3. Attendee Breakdown Per Order (UX-03)

**Current state:** The reconciliation API (`lib/domain/finance/reconciliation.ts`) returns order-level data only. No attendee array is included in the reconciliation payload. No `GET /api/orders/[orderId]` endpoint exists yet.

**Reconciliation payload shape:**

```typescript
rows: Array<{
  providerOrderId: string
  providerEventId: string
  eventName: string | null
  normalizedStatus: CanonicalOrderStatus
  totalAmountMinor: number
  currency: string | null
  orderedAt: string | null
  refundedAt: string | null
  outstandingMinor: number
  reasons: ReconciliationReason[]
}>
```

**Assessment:** NEW WORK. Need to either:

- Extend the reconciliation API to include attendee array per order, OR
- Create `GET /api/orders/[orderId]` that returns order + attendees
- Create `OrderAttendeeBreakdown` component
- Show attendee list inline in order cards (expandable for >3 attendees)

### 4. Attendees Route Amount Display (UX-04)

**Current state:** The `app/dashboard/attendees/page.tsx` Amounts column shows:

```tsx
Total {formatMoney(row.totalAmountMinor)}
Outstanding {formatMoney(row.outstandingAmountMinor)}
```

The `outstandingAmountMinor` is derived in `lib/domain/finance/attendees.ts`:

```typescript
function deriveOutstandingAmount(status, totalAmountMinor, attendeeCount) {
  if (status !== "pending" && status !== "cancelled") {
    return 0
  }
  return Math.max(0, Math.round(totalAmountMinor / Math.max(attendeeCount, 1)))
}
```

**Assessment:** Amount display is LOGICALLY CORRECT but the "Outstanding" label may be confusing when it shows a per-attendee split (total/attendeeCount) rather than the full order outstanding. For `paid` attendees, it correctly shows `€0`. The display looks acceptable.

**However:** For `paid` attendees, showing `Outstanding €0.00` is technically correct but visually confusing. Should show "Paid" status instead.

### 5. Background Auto-Sync (UX-05)

**Current state:**

- Manual sync exists at `/dashboard/ticket-tailor/sync` → POST `/api/ticket-tailor/sync`
- Sync function `runTicketTailorSync()` in `lib/integrations/ticket-tailor/sync.ts`
- TanStack Query IS installed (`@tanstack/react-query@^5.94.5`) and wrapped in `app/providers.tsx`, but NOT USED for dashboard data fetching yet
- Dashboard pages use raw `fetch()` + `useEffect` state management
- No scheduler, no background job, no cron-like mechanism

**Assessment:** NEW WORK. Options for background sync:

1. **TanStack Query + Periodic Refetching**: Add `refetchInterval` to query configs — simplest, works for keeping data fresh
2. **API Route + External Cron**: Add `GET /api/sync/status` + `POST /api/sync/trigger` and configure Vercel Cron or external service
3. **Next.js Route Handler + setInterval**: Use a client-side interval to trigger sync on a tab-visible basis

**Recommendation:** Use TanStack Query `refetchInterval` (e.g., 5 minutes) on reconciliation and attendees pages. This requires migrating from raw `useEffect`+`useState` to TanStack Query hooks. This approach is cleanest for an MVP.

## Dependency Map

```
UX-01 (Layout)        — Already done (260323-07i)
UX-02 (Direct nav)    — Modify reconciliation page CTA link target
                        No new files needed
UX-03 (Attendee breakdown) — Extend reconciliation API OR create order detail API
                        — New OrderAttendeeBreakdown component
                        — Integrate into reconciliation cards
UX-04 (Amount display)— Minor update to attendee table amount rendering
                        Conditional "Paid" display for €0 outstanding
UX-05 (Background sync)— Add TanStack Query hooks
                        — Add sync status indicator to dashboard shell
                        — Configure refetchInterval
```

## Tech Stack

- Next.js 16 + React 19
- shadcn/ui (Card, Button, Badge, Table, Skeleton)
- TanStack Query v5 (installed but unused for data fetching)
- Prisma + SQLite
- No existing scheduler or background job infrastructure

## Risks

1. **UX-03 API extension**: Extending the reconciliation API to include attendee arrays adds complexity to an already-heavy page load. Consider a separate `/api/orders/[orderId]` endpoint.
2. **UX-05 TanStack Query migration**: Migrating from `useEffect`+`useState` to TanStack Query changes all data-fetching patterns. Need to ensure backward compatibility with existing error handling UX.
3. **UX-02 direct navigation**: Going directly to attendee detail for single-attendee orders requires knowing attendee count upfront. The reconciliation API doesn't return this.

## Recommendations for Planning

1. **Treat UX-01 as already-done** — the card grid exists from quick task 260323-07i
2. **Scope UX-02 carefully** — the two-step flow may be intentional for multi-attendee orders
3. **UX-03 and UX-05 are the substantial new work** — these warrant separate tasks/plans
4. **UX-04 is a quick fix** — combine with another task
