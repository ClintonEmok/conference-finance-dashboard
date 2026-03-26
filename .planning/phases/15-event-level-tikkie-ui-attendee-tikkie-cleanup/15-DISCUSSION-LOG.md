# Phase 15: Event-level Tikkie UI + attendee Tikkie cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 15-event-level-tikkie-ui-attendee-tikkie-cleanup
**Areas discussed:** Event Tikkie UI placement, Event Tikkie content, Attendee Tikkie cleanup, Reconciliation page changes

---

## Event Tikkie UI Placement

| Option                       | Description                                                                                     | Selected |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| Financial page (Recommended) | Finance workspace already shows revenue, balances, reconciliation. Event Tikkie fits naturally. | ✓        |
| New dedicated page           | Dedicated route with full payment tracking, match stats, manual assignment. More room.          |          |
| Reconciliation page          | Reconciliation already has per-order Tikkie. Extend existing patterns.                          |          |

**User's choice:** Financial page (Recommended)

**Follow-up Q&A:**

- **Integration style:** Collapsible section on existing financial page
- **Event selector:** Add event picker to the financial page
- **Link creation:** Financial page only (not attendee detail)

---

## Event Tikkie Content

| Option                               | Description                                                         | Selected |
| ------------------------------------ | ------------------------------------------------------------------- | -------- |
| Name + amount + status (Recommended) | Payer name, amount, date, and matched/unmatched status per payment. | ✓        |
| Full detail + matched order          | Also show which order it's matched to (buyer name, order total).    |          |
| Minimal                              | Just payer name and amount.                                         |          |

**User's choice:** Name + amount + status

**Additional decisions:**

- Manual assignment: Yes, button on unmatched payments to pick an order
- Match stats: Summary header (total payments, matched count, unmatched count, total amount)
- Auto-match: Manual button + automatic on payment sync

---

## Attendee Tikkie Cleanup

| Option               | Description                                                             | Selected |
| -------------------- | ----------------------------------------------------------------------- | -------- |
| Remove (Recommended) | Remove per-attendee Tikkie link creation dialog. Link is per-event now. | ✓        |

**User's choice:** Remove

**Additional decisions:**

- Link summary: Remove from attendee detail
- Payment history: Show payments from the event-level link that matched this attendee's order
- Template override: Move to event-level template settings (remove per-attendee override)

---

## Reconciliation Page Changes

| Option               | Description                                                                  | Selected |
| -------------------- | ---------------------------------------------------------------------------- | -------- |
| Remove (Recommended) | Remove per-order Tikkie creation from reconciliation. Use event-level links. | ✓        |

**User's choice:** Remove

**Additional decisions:**

- Order link summary: Remove per-order link status display
- Event stats: No event-level Tikkie stats on reconciliation page

---

## agent's Discretion

- Exact layout of the collapsible Tikkie section on the financial page
- How the event picker integrates with existing financial page data
- Loading/error states for the Tikkie section
- Whether old per-order Tikkie data in the DB gets migrated or just hidden

---

_Phase: 15-event-level-tikkie-ui-attendee-tikkie-cleanup_
_Context gathered: 2026-03-26_
