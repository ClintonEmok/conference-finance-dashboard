# Phase 17 Context: Dual-Source Event Signup Platform

## Goal

Extend the conference finance dashboard into an event signup platform with dual-source event support:

- `integration` source for provider-backed events (existing Ticket Tailor path)
- `internal` source for in-app event creation and public signup

## Why Now

- Finance and reconciliation surfaces are already usable for operators.
- The team wants to add a direct signup path without losing compatibility with current integration workflows.
- A source-agnostic event model reduces coupling to one provider and enables gradual expansion.

## Scope Boundaries

In scope for this phase family:

- Internal event schema and registration contracts
- Public event pages (`/events`, `/events/[slug]`) and signup submission
- Admin source mode controls and unified event listing contracts

Out of scope:

- Full attendee account self-service after signup
- Multi-tenant organization model
- Replacing provider source-of-truth for integration-backed events

## Initial Architecture Direction

1. Keep existing `ticketTailor*` tables/functions untouched for stability.
2. Add internal event tables/functions in Convex with explicit validators.
3. Create source-agnostic read DTOs in domain layer for dashboard/event pickers.
4. Keep finance reconciliation compatibility by preserving existing order/payment flows.

## Risks

- Public signup introduces abuse/spam and duplicate-submit risks.
- Capacity enforcement must be transactional to avoid overbooking.
- Mixed event sources can create UI confusion if source labeling is unclear.

## Mitigations

- Add server-side duplicate and capacity checks in mutation boundary.
- Add clear source badges and filters in admin UI.
- Keep read models explicit about source type, ids, and capabilities.
