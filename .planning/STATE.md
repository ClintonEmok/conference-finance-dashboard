---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
stopped_at: Completed plan 11-02 (schema conversion)
last_updated: "2026-03-25T15:20:00.000Z"
progress:
  total_phases: 13
  completed_phases: 10
  total_plans: 24
  completed_plans: 25
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-18)

**Core value:** One trusted dashboard for church conference finance operations.
**Current focus:** Phase 11 — use-convex (migrating from Prisma/SQLite to Convex)

## Current Position

Phase: 11 (use-convex)
Plan: 2 of 5 complete
Status: In progress - Schema converted, ready for query conversion (11-03)

## Performance Metrics

**Velocity:**

- Total plans completed: 12
- Average duration: 59 min
- Total execution time: 10.5 hours

**By Phase:**

| Phase                                        | Plans | Total              | Avg/Plan          |
| -------------------------------------------- | ----- | ------------------ | ----------------- |
| 1. Foundation & Secure Access                | 2     | 62 min             | 31 min            |
| 2. Ticket Data Reliability                   | 2     | 148 min documented | 74 min documented |
| 3. Finance Visibility & Outstanding Balances | 2     | 453 min            | 227 min           |
| 4. Attendee Data & Accommodation Foundations | 2     | 22 min             | 11 min            |
| 5. Room Allocation & Operator Flow Polish    | 2     | 383 min            | 192 min           |
| 6. Tikkie Integration                        | 3     | 51 min             | 17 min            |
| 8. Attendee Follow-up & Reconciliation UX    | 1     | 5 min              | 5 min             |
| 10. Payment Reconciliation                   | 3     | 45 min             | 15 min            |

**Recent Trend:**

- Last 5 completed plans: 10-01, 10-02, 10-03
- Phase 10 complete: Payment reconciliation (Tikkie, bank, cash) fully implemented

## Accumulated Context

### Decisions

Recent decisions affecting current work:

- [01-01] Use Better Auth + Prisma adapter with SQLite local datasource and migration-friendly env-driven DB configuration.
- [01-01] Enforce protected access with middleware redirect UX and server-authoritative `auth.api.getSession` checks.
- [01-02] Keep integration config validation non-fatal and return typed status for Ticket Tailor/Tikkie.
- [01-02] Surface integration readiness as `configured | misconfigured | unreachable` with non-sensitive diagnostics.
- [02-01] Persist Ticket Tailor sync observability in `TicketTailorSyncRun` with counts + diagnostics JSON.
- [02-01] Normalize provider statuses centrally and default unknown states safely to `pending`.
- [02-01] Use `/orders` fallback filtered by event when provider nested event-order endpoint is unavailable.
- [03-01] Keep revenue calculations in minor units and derive paid/refunded/net from canonical normalized statuses.
- [03-01] Return applied filters + generated timestamp in revenue API for operator-visible scope verification.
- [03-01] Use explicit filter-apply dashboard interactions to avoid noisy query churn while preserving responsive refresh.
- [03-02] Use conservative outstanding-balance heuristics until attendee-level and accommodation data are modeled.
- [03-02] Keep orders CSV deterministic with stable headers/escaping and explicit scoped filename metadata.
- [03-02] Keep orders/balance APIs scope-explicit and validation-consistent for operator trust.
- [MVP Reset] Defer Tikkie automation and operational hardening until the core command-center, ledger, attendee, and room workflow is validated.
- [MVP Reset] Rename user-facing "reconciliation" concepts toward clearer "outstanding balances" / collection follow-up language.
- [MVP Reset] Prioritize issued-ticket attendee sync so the app reflects actual attendees, not only order buyers.
- [04-01] Model attendee records as first-class Prisma rows keyed by provider attendee or issued-ticket identifiers.
- [04-01] Fall back from embedded attendee arrays to canonical order payloads when Ticket Tailor order payloads omit attendee rows.
- [04-01] Project attendee outstanding balances conservatively from order status and per-order attendee count until richer allocation exists.
- [04-02] Add nullable `assignedRoomId` on attendees now so future room assignment actions can attach to stable attendee identities.
- [04-02] Represent accommodation inventory explicitly as hotel -> room type -> room before introducing assignment mutations.
- [04-02] Keep attendee detail outstanding balances canonical-status aware so paid/refunded attendees do not show false debt.
- [05-01] Keep room assignment logic in a dedicated accommodation assignments module instead of overloading inventory helpers.
- [05-01] Project room state as explicit assigned/unassigned metadata in attendee payloads so accommodation changes stay visible across the dashboard.
- [05-01] Force room-state APIs dynamic so assignment changes are reflected immediately after mutations.
- [05-02] Carry operator context across balances, attendee follow-up, and room allocation with URL query state instead of hidden client-side workflow state.
- [05-02] Keep dashboard navigation ordered around overview, finance follow-up, attendees, and rooms so the MVP feels like one command center.
- [05-02] Preserve reversible handoffs between attendee detail and accommodation so operators can move forward without dead-end navigation.
- [06-01] Return one latest-link-first Tikkie contract with `latestLink`, history, and freshness metadata so clients do not rebuild provider ordering or recency rules.
- [06-01] Only open Tikkie links receive stale/fresh trust signals; terminal paid and expired links stay free of noisy recency warnings.
- [06-01] Short-circuit duplicate webhook notifications by checking persisted providerNotificationKey before refreshing provider state.
- [06-02] Used prefilled defaults from row data with edit-before-submit to keep the modal lightweight and operational.
- [06-02] Applied latest-link-first presentation with expandable history to avoid inline full dumps while keeping prior links accessible.
- [06-02] Showed stale badge only for open links (created status) since paid and expired links do not need freshness warnings.
- [06-03] Integrated template matching into attendee detail generation defaults for automatic pre-fill.
- [06-03] Added PATCH endpoint for attendee amount override management with soft-delete for templates.
- [07-02] Subscription setup is disabled by default to prevent accidental production activation; requires TIKKIE_SUBSCRIPTION_SETUP_ENABLED=true and valid TIKKIE_WEBHOOK_CALLBACK_URL.
- [07-02] Route validates both setup flag and callback URL before attempting provider API call, providing clear error messages for each guard path.
- [08-01] Reconciliation CTA now passes source=reconciliation for origin tracking; attendees page banner recognizes source=reconciliation alongside source=outstanding-balances.
- [08-01] Attendees page shows green "Paid" checkmark for outstandingAmountMinor === 0 using text-emerald-600 dark:text-emerald-400.
- [08-01] Single-attendee orders on reconciliation cards show inline "1 attendee: Name · TicketType" without expand/collapse for operational density.
- [08-01] Attendee breakdown fetches per-card via client-side useEffect to avoid over-fetching on large reconciliation lists.
- [10-02] Order-first payment entry flow prevents orphaned payments - admin selects order first, then enters payment details.
- [10-02] User attribution via matchedBy field on Payment records for audit trail of who created/assigned payments.
- [10-02] Tab-based UI for bank transfer vs cash entry with distinct fields (IBAN/reference for bank, notes for cash).
- [10-03] Payment reconciliation added as section in existing reconciliation dashboard page.
- [10-03] Used native HTML select for filters since shadcn Select component not available.
- [10-04] Use case-insensitive exact match for payerName → buyerName matching.
- [10-04] Mark as ambiguous when multiple orders match (requires manual review).
- [10-05] Calculate payment status at order level, not payment level.
- [10-05] Use order totalAmountMinor vs sum of linked payments.
- [10-05] Keep legacy payment-level counts for backward compatibility.
- [11-01] Chose better-convex for type-safe HTTP access to Convex functions via CRPC pattern.
- [11-01] Ported Prisma schema to Convex defineSchema with v.id() string references (no enforced referential integrity).
- [11-01] Used v.any() for rawPayload/providerPayload fields to preserve flexible provider data without strict typing.
- [11-02] Foreign keys are implicit using v.string() — relationships enforced at application level (no referential integrity).
- [11-02] Timestamps stored as numbers (milliseconds since epoch) instead of Date objects.
- [11-02] JSON fields use v.any() for flexibility with rawPayload, customAnswers, providerPayload.
- [11-02] Enum types use v.union(v.literal()) pattern instead of string literals.
- [11-02] cRPC builder exports typed context helpers (QueryCtx, MutationCtx, ActionCtx) for procedure authoring.

### Roadmap Evolution

- Phase 6 added: tikkie integration (COMPLETE)
- Phase 7 added: complete Tikkie integration with GET payment retrieval and webhook subscription setup (COMPLETE)
- Phase 8 replaced: Attendee Follow-up & Reconciliation UX (5 targeted UX improvements)
- Phase 9 added: Smart Allocation & Attendee Signals (moved from original Phase 8)
- Phase 10 added: Payment reconciliation with Tikkie open, bank transfers, and cash entries

### Pending Todos

- Phase 8 Plan 2 pending: TanStack Query background sync and sync status indicator
- Phase 9 plans pending: Smart allocation and attendee signals (moved from Phase 8)
- Phase 9 plans pending: Smart allocation and attendee signals (moved from Phase 8)

### Blockers/Concerns

- Phase 6 complete. All Tikkie operator workflows shipped.
- Real provider verification for Tikkie still depends on `TIKKIE_API_KEY`, `TIKKIE_APP_TOKEN`, and the active webhook callback subscription being configured.
- Non-blocking lint warnings in various files should be cleaned during future hygiene work.

### Quick Tasks Completed

| #          | Description                                    | Date       | Commit  | Directory                                                                                                           |
| ---------- | ---------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260321-rxb | add tanstack query                             | 2026-03-21 | 3052489 | [260321-rxb-add-tanstack-query](./quick/260321-rxb-add-tanstack-query/)                                             |
| 260321-s4w | make attendee table rows clickable             | 2026-03-21 | be1f925 | [260321-s4w-make-attendee-table-rows-clickable-and-r](./quick/260321-s4w-make-attendee-table-rows-clickable-and-r/) |
| 260321-s9e | add landing page on root route                 | 2026-03-21 | 9a2d095 | [260321-s9e-add-a-landing-page-on-the-root-route](./quick/260321-s9e-add-a-landing-page-on-the-root-route/)         |
| 260322-0dv | redesign entire application UI using shadcn    | 2026-03-22 | 5d829e2 | [260322-0dv-redesign-the-entire-application-ui-using](./quick/260322-0dv-redesign-the-entire-application-ui-using/) |
| 260322-14a | refactor financial page align colours          | 2026-03-22 | 40d652c | [260322-14a-refactor-financial-page-align-colours-wi](./quick/260322-14a-refactor-financial-page-align-colours-wi/) |
| 260322-xao | redesign reconciliation page mobile-friendly   | 2026-03-22 | 57fbf7e | [260322-xao-design-reconciliation-page-mobile-friend](./quick/260322-xao-design-reconciliation-page-mobile-friend/) |
| 260323-07i | redesign reconciliation desktop into card grid | 2026-03-23 | 7d9b1cf | [260323-07i-redesign-desktop-reconciliation-table-in](./quick/260323-07i-redesign-desktop-reconciliation-table-in/) |

## Session Continuity

Last session: 2026-03-25T15:20:00Z
Stopped at: Completed plan 11-02 (schema conversion)
Resume file: None
