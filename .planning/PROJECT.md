# Project: Conference Finance Dashboard

## What This Is

Conference Finance Dashboard is the church's internal system for conference orders, payments, reconciliation, attendee tracking, room assignment, and signup operations. It supports integration-backed and internal signup flows; the current product priority is making the event-scoped admin experience clear and efficient without weakening canonical finance behavior.

## Core Value

Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## Current Milestone: v6.0 Dynamic Event Accommodation

**Goal:** Redesign accommodation as flexible, event-owned configuration over the established reusable hotel and physical-room workflow, with explicit setup reuse and dynamic ticket-aware signup consumption.

**Target features:**

- Event-owned accommodation setup for inventory rules, ticket entitlements, rates, options/upgrades, and signup consumption.
- Optional event stay windows, including a configurable base stay (commonly the night before) and optional extended nights before and/or after the event.
- Ticket inclusion does not remove stay choice: an attendee may add an enabled extra night before or after the event even when the ticket covers the included base accommodation nights.
- Admin-enabled upgrades and add-ons can apply across the attendee's selected stay nights, with per-person-per-night pricing and ticket-specific inclusion rules.
- Existing reusable hotels, physical rooms, room types, and capacity remain the inventory foundation.
- Explicit copy/template actions reuse accommodation setup between events without live global configuration coupling.
- Flexible dynamic options, pricing units, eligibility rules, and data-driven admin/public cards without hardcoded option codes.
- Ticket-driven room eligibility and accommodation pricing rules carried forward from SEED-002, including tickets that include the configured base accommodation stay.
- Signup, track-payment, confirmation, canonical finance, and allocation contracts aligned to the same event configuration.

## Requirements

### Validated

- ✓ Protected dashboard flows exist for finance, reconciliation, orders, payments, attendees, accommodation, settings, and event donations.
- ✓ Event-scoped routing and a single-sidebar shell exist.
- ✓ Canonical order totals, attendee payables, payment allocations, and shareable reporting contracts exist from prior milestones.
- ✓ Public multi-step signup flow with ticket selection, attendee details, and room assignment exists.
- ✓ Public payment tracking by booking reference exists.
- ✓ Event accommodation workspace with Hotels and Allocation tabs exists.

### Active

- [ ] Event-owned accommodation configuration preserves the established hotel, physical-room, room-type, and capacity workflow.
- [ ] Explicit copy/template reuse creates independent event accommodation setup.
- [ ] Human-manageable dynamic ticket rules, room eligibility, options/upgrades, pricing units, and eligibility rules exist.
- [ ] Signup and track-payment consume the same dynamic event configuration with server-owned quotes and immutable confirmed snapshots.
- [ ] Canonical finance and allocation continue to consume one event-scoped accommodation contract.

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
| Preserve reusable hotels, physical rooms, and room types while making accommodation configuration event-owned | Keeps the established hotel workflow while avoiding live cross-event configuration coupling | Locked for v6.0 |
| Reuse event accommodation through explicit copy/template actions | Reuse is intentional and copied configurations evolve independently | Locked for v6.0 |
| Buyers choose dynamic options; admins assign physical rooms | Accommodation is preference-led and operator-controlled | Carried forward |
| Ticket rules define accommodation entitlement and eligibility; event configuration defines rates/options | Prevents ticket products, room inventory, and event pricing from being conflated | Locked for v6.0 |
| Canonical finance and confirmation snapshots remain authoritative | Dynamic configuration must not create a second money or historical-pricing source | Carried forward |

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

_Last updated: 2026-08-06 — v6.0 milestone initialized; Phase 46 planned_
