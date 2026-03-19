---
phase: 04-tikkie-collection-workflow
plan: 01
subsystem: payments
tags: [tikkie, prisma, api, reconciliation, dashboard, webhooks]

# Dependency graph
requires:
  - phase: 03-finance-visibility-reconciliation
    provides: Reconciliation rows and protected dashboard API/UI scaffolding
provides:
  - Persistent Tikkie payment-link and transition storage linked to Ticket Tailor orders
  - Typed Tikkie client adapter and domain command/query flow for link creation/listing
  - Protected dashboard API and reconciliation UI actions for generate and copy link workflows
affects: [phase-04-plan-02-status-sync, phase-05-operational-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Provider adapter in integrations layer with explicit status/error mapping
    - Domain service orchestrating provider call plus deterministic token-based persistence
    - Row-level operational UI actions with per-row loading and error states

key-files:
  created:
    - prisma/migrations/20260319101050_tikkie_payment_link_models/migration.sql
    - lib/domain/finance/tikkie-links.ts
    - lib/integrations/tikkie/client.ts
    - app/api/dashboard/tikkie-links/route.ts
  modified:
    - prisma/schema.prisma
    - app/dashboard/reconciliation/page.tsx
    - .env.example

key-decisions:
  - "Store app status as created/paid/expired while preserving raw provider payload/status for auditability and future reconciliation logic."
  - "Use paymentRequestToken as deterministic upsert key so repeated provider responses do not duplicate links."
  - "Add transition event model in Plan 04-01 to support upcoming idempotent webhook transition auditing in Plan 04-02."

patterns-established:
  - "Dashboard reconciliation rows own their Tikkie action state (generate/copy/load) without breaking filter/apply behavior."
  - "Protected API contracts stay consistent with BAD_REQUEST and UNAUTHORIZED JSON error shape."

# Metrics
duration: 10min
completed: 2026-03-19
---

# Phase 4 Plan 1: Tikkie Link Generation and Persistence Summary

**Finance operators can now generate Tikkie payment links from reconciliation rows, persist them by provider token, and copy/share the latest link from the same dashboard context.**

## Performance

- **Duration:** 10m 00s
- **Started:** 2026-03-19T10:07:02Z
- **Completed:** 2026-03-19T10:17:02Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added durable Prisma models/migration for Tikkie payment links with provider linkage and status transition history.
- Implemented typed Tikkie create/get/payments adapter and domain service for create/list/refresh/sync flows.
- Added protected `/api/dashboard/tikkie-links` GET/POST endpoints and reconciliation UI actions for generate + copy with persisted status visibility.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add persistent Tikkie payment-link data model and domain contracts** - `a3e13e0` (feat)
2. **Task 2: Implement Tikkie client and protected link-generation/list API** - `5b7b94d` (feat)
3. **Task 3: Add reconciliation link-generation and copy/share actions** - `8824f2c` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - adds Tikkie payment link/status enums, link model, and transition event model.
- `prisma/migrations/20260319101050_tikkie_payment_link_models/migration.sql` - creates durable tables/indexes for links and transition audit.
- `lib/domain/finance/tikkie-links.ts` - domain DTOs plus create/list/refresh/sync commands for Tikkie link lifecycle.
- `lib/integrations/tikkie/client.ts` - typed API client with required headers and explicit 400/401/403/5xx mapping.
- `app/api/dashboard/tikkie-links/route.ts` - protected list/create API with strict validation and consistent error contracts.
- `app/dashboard/reconciliation/page.tsx` - row-level generate/copy link actions and latest status badge visibility.
- `.env.example` - adds `TIKKIE_WEBHOOK_SECRET` placeholder for webhook verification in Plan 04-02.

## Decisions Made
- Kept provider headers (`API-Key`, `X-App-Token`) centralized in the Tikkie adapter so domain and route layers remain transport-agnostic.
- Preserved monotonic status mapping baseline (`OPEN -> created`; other terminal provider states -> expired unless payments observed) for conservative finance correctness.
- Returned full persisted link DTO (including status/source/timestamps) from API to avoid duplicate mapping logic in the dashboard UI.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered
- Existing baseline lint warning in `app/layout.tsx` (`Geist` unused import) remains unchanged and non-blocking.

## User Setup Required

None - no additional external service configuration required for this plan.

## Next Phase Readiness
- Link generation baseline is complete and persisted, enabling webhook/poll-driven status convergence work in 04-02.
- Existing transition table gives Plan 04-02 a ready audit surface for idempotent webhook handling.

---
*Phase: 04-tikkie-collection-workflow*
*Completed: 2026-03-19*
