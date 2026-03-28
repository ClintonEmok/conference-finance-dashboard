---
phase: 17
phase_slug: fix-critical-code-review-issues
created: 2026-03-28
status: ready
---

# Validation Strategy — Phase 17

## Goal

Verify that Phase 17 closes the security, data-integrity, performance, and UI resilience regressions called out by the code review before Phase 18 begins.

## Plan Checks

| Check ID | Plan  | What to verify                                                                | Method                         | Pass signal                                                                                          |
| -------- | ----- | ----------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 17-01-A  | 17-01 | Public Convex write modules require authenticated identity                    | grep + read                    | audited write modules contain auth guard calls before writes                                         |
| 17-01-B  | 17-01 | Webhook verification fails closed when secret missing                         | unit tests                     | webhook route/helper tests exit 0 and missing-secret path returns failure                            |
| 17-02-A  | 17-02 | Occupancy is derived from attendee assignments, not room counter writes       | grep + tests                   | assign/unassign paths stop patching `occupiedBeds`; read models still expose correct counts          |
| 17-02-B  | 17-02 | CSV export includes archive metadata                                          | grep + unit test               | CSV rows contain `isArchived`, `archivedAt`, `archiveReason` values in row output                    |
| 17-02-C  | 17-02 | Auto-match and quota checks happen in the same mutation boundary as the write | grep + read                    | Next.js/domain code no longer does query-then-write preflight for these paths                        |
| 17-03-A  | 17-03 | Audited `.collect()` hot paths are removed or bounded                         | grep                           | no unbounded hot-path collects remain in audited functions                                           |
| 17-03-B  | 17-03 | Refactors keep code type-safe                                                 | command                        | `npm run typecheck` exits 0                                                                          |
| 17-04-A  | 17-04 | Dashboard has recoverable App Router error boundaries                         | file existence + visual verify | `app/global-error.tsx` and `app/dashboard/error.tsx` exist; fallback renders instead of white screen |
| 17-04-B  | 17-04 | Main dashboard segments show route loading feedback                           | file existence + human verify  | `loading.tsx` exists for dashboard shell/main sections and appears during navigation                 |
| 17-04-C  | 17-04 | `formatMoney` is centralized                                                  | grep                           | dashboard/components import shared formatter instead of local duplicates                             |

## Minimum commands

```bash
npm run typecheck
npm test -- tests/tikkie/webhook-route.test.ts tests/ticket-tailor/sync-route.test.ts
rg "ctx\.auth\.getUserIdentity\(|assert.*Auth|require.*Identity" convex/attendees.ts convex/orders.ts convex/payments.ts convex/tikkie.ts convex/accommodation.ts convex/events.ts convex/sync.ts
rg "\.collect\(" convex/attendees.ts convex/orders.ts convex/payments.ts convex/tikkie.ts convex/accommodation.ts
rg "formatMoney" app/dashboard components
```

## Human verification

- Trigger a dashboard route failure in local dev and confirm `app/dashboard/error.tsx` shows a recoverable fallback with a reset action.
- Navigate between main dashboard routes and confirm `loading.tsx` feedback appears.
