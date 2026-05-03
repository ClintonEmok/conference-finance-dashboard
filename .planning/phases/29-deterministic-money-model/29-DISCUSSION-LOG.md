# Phase 29: Deterministic Money Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 29-deterministic-money-model
**Areas discussed:** Orders page scope, Reconciliation page layout, Reconciliation actions

---

## Orders Page Scope

**User's choice:** Move `/dashboard/manage-orders` to `/dashboard/events/[slug]/orders`, event-scoped by slug. Attendees must be clearly visible under each order.

**Notes:** Not a full redesign — reuse existing table/filter patterns but remove the event selector since the URL IS the event context.

---

## Reconciliation Page Layout

**User's choice:** Agent decides — go with side-by-side panels (unmatched payments | outstanding orders)

**Notes:** Standard reconciliation pattern. User trusted agent to pick the right layout approach.

---

## Reconciliation Actions

**User's choice:** Operators CAN manually match payments to orders on the reconciliation page.

**Notes:** Manual matching creates an allocation record.

---

## Deferred Ideas

- Manual Payment Matching (broader): The full FIN-03 allocation model is deferred to Phase 30 — Phase 29 establishes the page and basic matching.

