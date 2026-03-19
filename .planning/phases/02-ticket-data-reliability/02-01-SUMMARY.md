---
phase: 02-ticket-data-reliability
plan: 01
subsystem: api
tags: [ticket-tailor, prisma, sync, idempotency, normalization, nextjs]

# Dependency graph
requires:
  - phase: 01-foundation-secure-access
    provides: Protected routes/api guards and integration config validation baselines
provides:
  - Durable Ticket Tailor event/order/sync-run persistence models
  - Canonical `paid|refunded|cancelled|pending` status normalization module
  - Protected manual sync endpoint with structured operator-safe response contract
affects: [phase-02-plan-02-manual-resync, phase-03-finance-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Sync pipeline pattern: fetch events -> fetch orders -> normalize -> idempotent upsert -> run summary
    - Canonical status mapping centralized in `lib/domain/finance/*` for downstream reporting consistency
    - Run-level observability via `TicketTailorSyncRun` counts + diagnostics JSON

key-files:
  created:
    - lib/domain/finance/ticket-tailor-status.ts
    - lib/integrations/ticket-tailor/sync.ts
    - app/api/ticket-tailor/sync/route.ts
    - prisma/migrations/20260318224156_ticket_tailor_sync_models/migration.sql
  modified:
    - prisma/schema.prisma
    - lib/integrations/ticket-tailor/client.ts

key-decisions:
  - "Persist raw provider payload JSON alongside normalized fields for traceability and debugging."
  - "Treat unknown provider statuses as safe `pending` and include normalization diagnostics instead of failing sync."
  - "Support provider variation by falling back from nested event orders endpoint to global `/orders` filtered by event id."

patterns-established:
  - "Idempotent upsert keys: `providerEventId` and `providerOrderId` as unique provider identifiers."
  - "Protected operational API contract: `{ ok, runId, status, counts, diagnostics }` or structured `{ error: { code, message } }`."

# Metrics
duration: 148min
completed: 2026-03-19
---

# Phase 2 Plan 01: Ticket Tailor Durable Sync Pipeline Summary

**Durable Ticket Tailor ingestion with canonical order-status normalization, rerun-safe upserts, and an authenticated sync trigger that returns operator-safe run summaries.**

## Performance

- **Duration:** 2h 28m
- **Started:** 2026-03-18T22:40:16Z
- **Completed:** 2026-03-19T01:08:43Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added durable Prisma models/enums for Ticket Tailor events, orders, and sync runs with required uniqueness/indexing.
- Implemented centralized status normalization and idempotent sync orchestration with run-level counts/diagnostics.
- Added authenticated `POST /api/ticket-tailor/sync` endpoint with explicit success/failure JSON contracts.
- Completed runtime verification for auth guard, authenticated sync success, rerun idempotency, and canonical status constraints.

## Task Commits

1. **Task 1: Add durable Ticket Tailor sync storage models** - `b4d694c` (feat)
2. **Task 2: Implement centralized normalization + idempotent sync orchestrator** - `1e6e4f4` (feat)
3. **Task 3: Add protected sync trigger endpoint with explicit summary contract** - `5153ec1` (feat)

Additional stabilization commits (auto-fixed during execution):
- `48db73b` (fix): fallback to `/orders` when nested event orders endpoint is unavailable
- `06f4181` (fix): align Ticket Tailor API auth/header contract and base URL defaults
- `01ec756` (fix): map `event_summary` order linkage and unix timestamp payload fields

## Files Created/Modified
- `prisma/schema.prisma` - added sync enums/models (`TicketTailorEvent`, `TicketTailorOrder`, `TicketTailorSyncRun`)
- `prisma/migrations/20260318224156_ticket_tailor_sync_models/migration.sql` - migration for durable sync storage
- `lib/domain/finance/ticket-tailor-status.ts` - canonical provider-to-status normalization
- `lib/integrations/ticket-tailor/client.ts` - deterministic pagination + provider-compat endpoint/auth handling
- `lib/integrations/ticket-tailor/sync.ts` - idempotent orchestration and run summary recording
- `app/api/ticket-tailor/sync/route.ts` - protected manual sync trigger contract

## Decisions Made
- Kept normalization logic centralized in domain layer to avoid UI/API-level status drift.
- Modeled sync run observability as first-class persisted entity (`TicketTailorSyncRun`) to support future health/audit surfaces.
- Added compatibility fallback behavior for Ticket Tailor endpoint variance without changing architecture.

## Verification Results

1. **Unauthenticated guard**
   - `POST /api/ticket-tailor/sync` without session returned `401` with `UNAUTHORIZED` JSON.
2. **Authenticated sync contract**
   - `POST /api/ticket-tailor/sync` with valid session returned `200` and `{ ok, runId, status, counts, diagnostics }`.
3. **Rerun idempotency**
   - Re-ran sync on unchanged upstream data; persisted counts remained stable (`eventCount: 2`, `orderCount: 3`, `uniqueOrderCount: 3`).
4. **Canonical status constraint**
   - Persisted statuses were `paid` and `pending`; no values outside `paid|refunded|cancelled|pending`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Provider-specific nested event orders endpoint unavailable**
- **Found during:** Task 2 runtime verification
- **Issue:** `/events/{id}/orders` returned provider `404 PAGE_NOT_FOUND`.
- **Fix:** Added fallback fetch via `/orders` and filtered by provider event id.
- **Files modified:** `lib/integrations/ticket-tailor/client.ts`
- **Verification:** direct client probe and sync run succeeded with fallback behavior.
- **Committed in:** `48db73b`

**2. [Rule 1 - Bug] Ticket Tailor request contract mismatch**
- **Found during:** Task 2/3 runtime verification
- **Issue:** Bearer auth + non-versioned host produced permission/route errors for this provider account shape.
- **Fix:** switched to Basic auth header (base64 key) and normalized Ticket Tailor base URL handling.
- **Files modified:** `lib/integrations/ticket-tailor/client.ts`
- **Verification:** provider endpoint probes returned expected 200 on `/v1/events` and `/v1/orders`.
- **Committed in:** `06f4181`

**3. [Rule 1 - Bug] Order payload field mapping incomplete for real API shape**
- **Found during:** Task 2 runtime verification
- **Issue:** event linkage and date parsing needed `event_summary.*` + unix timestamp support to persist orders reliably.
- **Fix:** expanded payload mapping for event correlation, buyer details, totals, and unix-date conversion.
- **Files modified:** `lib/integrations/ticket-tailor/client.ts`, `lib/integrations/ticket-tailor/sync.ts`
- **Verification:** direct sync run imported 3 orders with stable reruns and canonical statuses.
- **Committed in:** `01ec756`

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes were required to meet real provider contract behavior and preserve correctness/idempotency.

## Authentication Gates

During execution, authentication/provider access gates were handled:

1. Ticket Tailor API key permissions initially blocked event/order reads (`403 FORBIDDEN`).
2. Execution paused at checkpoints while credentials/permissions were corrected.
3. After correction, runtime verification completed successfully.

## Issues Encountered
- Existing baseline lint warning in `app/layout.tsx` (`Geist` unused import) persists; non-blocking and outside plan scope.
- Next.js workspace-root warning from multiple lockfiles is non-blocking but should be cleaned in future tooling hygiene work.

## User Setup Required

Manual provider credentials are required for real sync execution (`TICKET_TAILOR_API_KEY` with events/orders read scope).

## Next Phase Readiness
- Durable Ticket Tailor storage and protected sync trigger are ready for scoped manual re-sync flow work in 02-02.
- Canonical status contract is now centralized and available for Phase 3 revenue/reconciliation calculations.

---
*Phase: 02-ticket-data-reliability*
*Completed: 2026-03-19*
