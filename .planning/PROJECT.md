# Project: Conference Finance Dashboard

## Core Value

Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## Current State

- **Shipped milestone:** v1.0 MVP (2026-03-27)
- **What is operational:** Protected finance dashboard, Ticket Tailor sync, revenue/orders/reconciliation views, attendee detail, room assignment, Tikkie link and payment tracking, Convex backend, Clerk auth.
- **Known accepted gap:** ACC-05 is still partial at operator UI level (family-group filter control/reset semantics and neutral priority-only behavior need a follow-up polish pass).

## Next Milestone Goals (v2.0)

- Deliver public event discovery and signup (`/events`, detail, signup)
- Support dual event source modes (`integration` and `internal`)
- Keep dashboard and finance reads source-agnostic
- Preserve existing Ticket Tailor and Tikkie production behavior while expanding capability

## Constraints

- Stack: Next.js 16 + React 19 + Convex + Clerk + shadcn/ui
- Ticket Tailor remains source of truth for integration-backed event/order data
- Prioritize correctness and operator clarity over feature breadth

## Key Decisions

- Keep Clerk as the only auth runtime for dashboard/API boundaries.
- Keep typed Convex contract boundaries as the canonical backend access path.
- Keep provider-order-aware payment reconciliation behavior and legacy fallback compatibility.
- Treat event source as an explicit domain boundary for v2 (`integration` vs `internal`).

---

_Last updated: 2026-03-27 after v1.0 milestone_
