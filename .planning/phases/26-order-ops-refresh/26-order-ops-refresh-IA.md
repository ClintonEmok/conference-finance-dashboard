# Order Ops Refresh IA

## Purpose

Define the route hierarchy and navigation rules for the order-ops refresh phase so operators always know where to start, what is primary, and what is a drilldown.

## Primary Routes

- `/dashboard` is the global overview landing page.
- `/dashboard/manage-orders` is the primary order-management workspace.
- `/dashboard/events/[slug]/overview` is the primary event-scoped overview.

## Secondary Routes

- `/dashboard/financial` is a deeper finance/ops drilldown, not the main landing page.
- `/dashboard/orders` and `/dashboard/orders/[orderId]` are compatibility aliases during cutover.
- `/dashboard/events/[slug]` remains the event hub and should link to the scoped overview.

## Navigation Rules

- Do not force operators through a generic event picker before they can manage orders.
- Use `manage-orders` as the default action CTA from dashboard and event surfaces.
- Keep breadcrumbs stable: `Dashboard > Manage orders > Order detail` and `Dashboard > Events > [Event] > Overview`.
- Make scope explicit in headings, empty states, and helper text.

## Grouping Rules

- Default overview grouping is by order.
- Offer family grouping where it reduces noise.
- Offer attendee grouping where individual follow-up is the goal.
- Show the active grouping state in the page header or filter bar.

## Copy Rules

- Use `contact person` instead of `buyer` on management surfaces.
- Use amount-prefixed payment status labels like `Paid: €120` and `Due: €40`.
- Keep nav labels short and action-oriented.

## IA Checks

- One primary route per intent.
- One event scope per event page.
- One visible default grouping per overview.
- No duplicate terminology for the same role.
