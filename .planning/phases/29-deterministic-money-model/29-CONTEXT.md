# Phase 29: Deterministic Money Model - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Canonical internal facts produce one deterministic answer for order totals, attendee payables, and payment allocations. This phase delivers two new event-scoped pages and stabilizes the canonical money model:

1. Move `/dashboard/manage-orders` to `/dashboard/events/[slug]/orders` — event-scoped orders with attendees clearly visible under each order
2. New `/dashboard/events/[slug]/reconciliation` — unmatched payments and outstanding orders side-by-side, with manual matching capability

FIN-01, FIN-02, FIN-03 from REQUIREMENTS.md are in scope.

</domain>

<decisions>
## Implementation Decisions

### D-01: Orders page layout
- Move `manage-orders` to `/dashboard/events/[slug]/orders` (event-scoped by slug)
- Attendees must be clearly visible under each order (expandable or always-visible rows)
- Same filter/search/date-range capabilities as current `/dashboard/manage-orders`
- Remove the event selector dropdown since the route IS the event context

### D-02: Reconciliation page layout
- Side-by-side panels: unmatched payments on the left, outstanding orders on the right
- Operator can manually match a payment to an order on this page
- Scoped to `/dashboard/events/[slug]/reconciliation`

### D-03: Reconciliation actions
- Operators can manually match a payment to an order directly on the reconciliation page
- Manual matching creates an allocation record

### Agent's Discretion
- Exact component patterns for the side-by-side reconciliation layout
- How to display unmatched payments (list vs cards vs table)
- Pagination vs infinite scroll for large datasets
- Expand/collapse behavior for attendees under orders
- Specific matching UX (drag, button click, etc.)

</decisions>

<canonical_refs>
## Canonical References

### Finance Requirements
- `.planning/REQUIREMENTS.md` — FIN-01, FIN-02, FIN-03 define canonical order totals, attendee payable amounts, and payment allocation records

### Existing Patterns
- `app/dashboard/manage-orders/page.tsx` — current orders page (will be moved/scoped)
- `app/dashboard/manage-orders/[orderId]/page.tsx` — order detail with attendee display
- `app/dashboard/events/[slug]/layout.tsx` — event-scoped shell (single sidebar from Phase 28)
- `components/dashboard/event-switcher.tsx` — read-only event switcher (Phase 28)
- `lib/domain/finance/reconciliation.ts` — existing reconciliation logic

### Phase 28 Context (dashboard shell)
- `.planning/phases/28-single-sidebar-shell/28-CONTEXT.md` — Phase 28 decisions
- `app/dashboard/events/[slug]/layout.tsx` — event-scoped shell with single sidebar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ManageOrdersClient` pattern from `app/dashboard/manage-orders/page.tsx` — filter/search/export table
- Order detail expandable attendees pattern from `app/dashboard/manage-orders/[orderId]/page.tsx`
- `formatMoney` utility — already used across finance surfaces
- `Badge`, `Button`, `Skeleton` shadcn/ui components — consistent with Phase 28 shell

### Established Patterns
- Event-scoped route: `app/dashboard/events/[slug]/` — single sidebar shell
- Slug-derived context: `useParams().slug` in client components, `params.slug` in server components
- API route: `/api/dashboard/orders` — already supports `eventId` query param

### Integration Points
- `/dashboard/events/[slug]/orders` — new route, uses existing orders API with slug-derived eventId
- `/dashboard/events/[slug]/reconciliation` — new route, may need new API endpoint
- Nav: add "Orders" and "Reconciliation" to the sidebar section nav (Overview, Contact people, Orders, Reconciliation, etc.)

</code_context>

<specifics>
## Specific Ideas

- Attendees under each order should be clearly readable — not tiny, not hidden behind a click
- Reconciliation page should make it obvious how much is outstanding vs how much is unallocated

</specifics>

<deferred>
## Deferred Ideas

### Manual Payment Matching (broader)
- The broader FIN-03 work of explicit payment allocations across orders and attendees is deferred to Phase 30 (Safe Migration and Parity) — Phase 29 establishes the page and basic matching, Phase 30 handles the full allocation model

</deferred>
