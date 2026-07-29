# Project: Conference Finance Dashboard

## What This Is

Conference Finance Dashboard is the church's internal system for conference orders, payments, reconciliation, attendee tracking, room assignment, and signup operations. It supports integration-backed and internal signup flows; the current product priority is making the event-scoped admin experience clear and efficient without weakening canonical finance behavior.

## Core Value

Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## Current Milestone: v4.0 Event Dashboard UX Overhaul

**Goal:** Turn the event-scoped dashboard into a stats-led operational home with concise navigation and coherent Finance and Accommodation workspaces.

**Target features:**

- Event Overview with bounded stats and actionable exceptions.
- One concise event navigation structure with clear event context.
- Tabbed Finance and Accommodation workspaces that preserve existing workflows and deep links.
- Shared loading/error/empty states, responsive layouts, accessibility, and settings/share placement.

## Requirements

### Validated

- ✓ Protected dashboard flows exist for finance, reconciliation, orders, payments, attendees, accommodation, settings, and event donations.
- ✓ Event-scoped routing and a single-sidebar shell exist.
- ✓ Canonical order totals, attendee payables, payment allocations, and shareable reporting contracts exist from prior milestones.

### Active

- [ ] Event-scoped dashboard home is a useful operational Overview.
- [ ] Event navigation is concise and consistent.
- [ ] Finance and Accommodation are coherent workspaces rather than fragmented primary routes.
- [ ] Shared dashboard states and responsive/accessibility behavior are consistent.

### Out Of Scope

- New public signup UX features.
- Full Ticket Tailor table/provider redesign.
- Multi-tenant church/org support.
- Cross-event analytics product.

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
| Use the event Overview as the default event home | Admins need an operational starting point rather than a link directory | Pending |
| Keep one concise event sidebar | Duplicate or overly broad navigation obscures event context | Pending |
| Group Finance and Accommodation into workspaces | Related workflows should share context without adding sidebar noise | Pending |
| Reuse Convex hooks and canonical contracts | Prevents UI-specific finance formulas and duplicate reads | Pending |
| Keep share/configuration actions in Settings | Keeps primary navigation focused on daily operations | Pending |

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

_Last updated: 2026-07-29 — v4.0 milestone initialized_
