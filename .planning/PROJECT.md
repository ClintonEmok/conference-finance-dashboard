# Project: Conference Finance Dashboard

## Core Value

Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## Product Goal

Deliver a practical MVP-to-production path for a conference finance dashboard that integrates Ticket Tailor (orders/tickets) and Tikkie (payment links) using the existing Next.js + shadcn foundation.

## Primary Users

- Finance admin (primary)
- Event operations lead (secondary, read-only in future)

## In Scope (v1)

- Secure admin-only dashboard access
- Ticket Tailor event/order sync and data normalization
- Revenue and reconciliation dashboard views
- Tikkie payment-link generation and payment status tracking
- Basic production readiness for observability and recovery

## Out of Scope (v1)

- Public attendee portal
- Full accounting export suite (beyond CSV)
- Multi-tenant church support
- Automated invoicing workflows

## Constraints

- Stack: Next.js 16 + React 19 + shadcn/ui
- Must use Ticket Tailor as source of truth for ticket/order records
- Must use Tikkie for ad-hoc payment link generation
- Keep first delivery practical: core finance workflow over feature breadth

## Integration Risks (to actively manage)

### Ticket Tailor

- API limits or pagination behavior can cause incomplete syncs
- Status-model differences (paid/refunded/cancelled) can skew totals if not normalized
- Event configuration drift may break assumptions in reporting

### Tikkie

- Link lifecycle differences (created/paid/expired) may require fallback polling
- Webhook reliability/idempotency can produce duplicate state changes
- Amount/description formatting constraints can block link creation

## Architecture Direction

- Use Next.js App Router with server-first data access for finance views
- Use typed service boundaries in `lib/`:
  - `lib/integrations/ticket-tailor/*`
  - `lib/integrations/tikkie/*`
  - `lib/domain/finance/*` for normalized business logic
- Use shadcn/ui components for dashboard consistency and rapid iteration
- Isolate integration adapters from UI so providers can evolve independently
- Treat sync jobs and webhook handlers as first-class backend flows with auditability

## Success Definition

Finance admin can open the dashboard, trust conference revenue figures from Ticket Tailor, generate Tikkie links for outstanding balances, and verify payment/reconciliation status without manual spreadsheet stitching.

## Validated Requirements

- **Phase 7 (2026-03-21):** Tikkie integration complete — provider-authoritative refresh via GET payment retrieval and guarded webhook subscription setup path. Status trust gap closed.
