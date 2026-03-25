# Phase 10: Payment Reconciliation - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Add unified payment reconciliation for Tikkie open payments, bank transfers, and cash entries with automatic matching by payer name to buyer name and manual assignment for unresolved payments. This phase delivers:

- New Payment table to unify Tikkie + Bank + Cash payment sources
- Open Tikkie polling/webhook for incoming event-wide payments
- Auto-matching by payer name → buyer name
- Manual assignment UI for unassigned/ambiguous payments
- Reconciliation dashboard showing: unassigned, partial, fully paid, overpaid states

Scope: Payment reconciliation only. Does not include accounting export, invoicing, or multi-currency support.

</domain>

<decisions>
## Implementation Decisions

### Payment Attribution Model

- **D-01:** All attendees in an order marked "paid" when order total is satisfied
- **D-02:** Partial payments treated as "in progress" — attendees show portion of payment
- **D-03:** Overpayment applies to order and is flagged/noted for review
- **D-04:** Attendees show paid/outstanding based on order-level payment status, but show their portion of partial payment (for reallocation on attendee cancellation)
- **D-05:** Keep both buyerName (from order) and payerName (from payment) — no override needed since payer may differ (donations, paying for others)

### Open Tikkie Matching

- **D-06:** Auto-assign when payerName exactly matches buyerName on an order
- **D-07:** Show ambiguous matches (multiple orders with same buyer name) in manual queue for admin to resolve
- **D-08:** Manual assignment UI shows list of unassigned payments with candidate orders
- **D-09:** Poll for new payments via both webhooks and scheduled job (every X minutes)

### Reconciliation States

- **D-10:** States: Unassigned, Partial, Fully Paid, Overpaid
- **D-11:** Show summary dashboard with counts per state
- **D-12:** Add mechanism for overpayment reassignment (e.g., reassign to another order or mark as donation)
- **D-13:** Order states by importance/action needed (unassigned first)

### Manual Entry Flow

- **D-14:** Separate forms for bank transfer and cash
- **D-15:** Fields: amount, date, payer name, notes
- **D-16:** Select order first, then enter payment details
- **D-17:** Editable with audit log

### the agent's Discretion

- Polling interval (X minutes) — default reasonable value
- Exact UI layout for reconciliation dashboard
- Audit log implementation details

</decisions>

<canonical_refs>

## Canonical References

### Existing Payment Infrastructure

- `lib/domain/finance/tikkie-links.ts` — Existing Tikkie payment link management (will extend)
- `prisma/schema.prisma` — Order and attendee models for payment linking
- `app/api/dashboard/tikkie-links/route.ts` — API patterns for payment endpoints

### Design System

- `components/ui/` — Reusable shadcn components (Card, Table, Dialog, etc.)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- TikkiePaymentLink model in Prisma — extend with Payment table
- tikkie-links.ts domain functions — adapt for Open Tikkie payment retrieval
- Existing API route patterns in app/api/dashboard/

### Established Patterns

- Server-first data access via lib/domain functions
- Protected API routes with auth checks
- shadcn/ui for dashboard components

### Integration Points

- New Payment table links to TicketTailorOrder
- Open Tikkie uses existing Tikkie client functions
- Reconciliation dashboard integrates with existing finance views

</code_context>

<specifics>
## Specific Ideas

- Overpayment can be a donation — need mechanism to reassign to another order or mark as donation
- People can donate or pay for other orders — payerName != buyerName is expected
- Partial payment tracking at attendee level for reallocation when attendees cancel

</specifics>

<deferred>
## Deferred Ideas

- Accounting export — separate phase
- Multi-currency support — not in scope
- Refund processing — separate phase

</deferred>

---

_Phase: 10-payment-reconciliation-tikkie-bank-cash_
_Context gathered: 2026-03-25_
