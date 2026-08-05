# Project: Conference Finance Dashboard

## What This Is

Conference Finance Dashboard is the church's internal system for conference orders, payments, reconciliation, attendee tracking, room assignment, and signup operations. It supports integration-backed and internal signup flows; the current product priority is making the event-scoped admin experience clear and efficient without weakening canonical finance behavior.

## Core Value

Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## Current Milestone: v5.0 Accommodation Upgrades & Options

**Goal:** Turn accommodation into a reusable, configurable catalog where buyers select options and upgrades, admins configure rates and availability, payment tracking becomes a booking-reference permalink, and allocation prioritizes paid attendees.

**Target features:**

- Reusable accommodation catalog (categories, room types with descriptions, options, age bands) plus event-scoped configuration (rates, upgrade, cot, resources).
- Admin "Upgrades & Options" tab for configuring rates, options, age bands, availability, and room-type descriptions.
- Public signup: buyers select category/occupancy, superior upgrade, cot, and optional age band — options only, admin does final assignment.
- Track payment becomes a booking-reference permalink (`/track-payment/[bookingRef]`) that allows configuration changes before admin confirmation and re-prices the order.
- Accommodation option charges flow into order amount-due and finance totals.
- Allocation prioritizes paid attendees: paid names highlighted, unpaid grayed out.
- Ticket-driven room eligibility aligns ticket → room-type entitlement (SEED-002).

## Requirements

### Validated

- ✓ Protected dashboard flows exist for finance, reconciliation, orders, payments, attendees, accommodation, settings, and event donations.
- ✓ Event-scoped routing and a single-sidebar shell exist.
- ✓ Canonical order totals, attendee payables, payment allocations, and shareable reporting contracts exist from prior milestones.
- ✓ Public multi-step signup flow with ticket selection, attendee details, and room assignment exists.
- ✓ Public payment tracking by booking reference exists.
- ✓ Event accommodation workspace with Hotels and Allocation tabs exists.

### Active

- [ ] Reusable accommodation catalog and event configuration model.
- [ ] Admin Upgrades & Options configuration surface.
- [ ] Buyers select accommodation options (category/occupancy, upgrade, cot, optional age band) during signup without booking rooms.
- [ ] Track payment is a booking-reference permalink supporting configuration changes and re-pricing.
- [ ] Accommodation option charges flow into order amount-due and finance totals.
- [ ] Allocation highlights paid attendees and defers unpaid ones.
- [ ] Ticket-driven room eligibility keeps signup and allocation rules aligned.

### Out Of Scope

- Full Ticket Tailor table/provider redesign.
- Multi-tenant church/org support.
- Cross-event analytics product.
- QR-code event check-in (SEED-001 remains dormant).

## Context

- Existing stack: Next.js 16, React 19, Convex, Clerk, shadcn/ui, and Tailwind.
- Event-scoped routes already exist under `app/dashboard/events/[slug]`.
- `lib/convex/hooks/` is the established typed Convex access boundary.
- The previous milestone established canonical finance semantics; this milestone must reuse them rather than recalculate money in the UI.

## Constraints

- Preserve established runtime architecture and Clerk authorization boundaries.
- Avoid destructive migrations and unnecessary schema changes.
- Preserve existing deep links or provide safe redirects when routes are consolidated.
- Keep dashboard reads bounded and event-scoped.

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| Use the event Overview as the default event home | Admins need an operational starting point rather than a link directory | Done (v4.0) |
| Keep one concise event sidebar | Duplicate or overly broad navigation obscures event context | Done (v4.0) |
| Group Finance and Accommodation into workspaces | Related workflows should share context without adding sidebar noise | Done (v4.0) |
| Reuse Convex hooks and canonical contracts | Prevents UI-specific finance formulas and duplicate reads | Done (v4.0) |
| Keep share/configuration actions in Settings | Keeps primary navigation focused on daily operations | Done (v4.0) |
| Separate reusable accommodation catalog from event configuration | Lets admin define categories/descriptions/options once and reuse across events | Pending |
| Buyers choose options; admins assign rooms | Accommodation is preference-led; final placement stays operator-controlled | Pending |
| Track payment becomes a booking-reference permalink with config changes | Gives buyers a durable link and lets them adjust options before admin confirmation | Pending |
| Accommodation option charges feed canonical amount-due | Keeps finance totals and reconciliation correct when options are selected/changed | Pending |
| Allocation prioritizes paid attendees | Prevents assigning unpaid attendees before they complete payment | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**

1. Requirements invalidated? Move to Out Of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. Check whether the project description remains accurate.

**After each milestone:**

1. Review all sections.
2. Recheck the Core Value.
3. Audit Out Of Scope reasons.
4. Update Context with the current state.

---

_Last updated: 2026-08-05 — v5.0 milestone initialized_
