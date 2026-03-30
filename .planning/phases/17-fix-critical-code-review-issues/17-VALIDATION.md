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

| Check ID | Plan  | What to verify                                                                                             | Method                         | Pass signal                                                                                                 |
| -------- | ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 17-01-A  | 17-01 | Public Convex write modules require authenticated identity                                                 | grep + read                    | audited write modules contain auth guard calls before writes                                                |
| 17-01-B  | 17-01 | Authenticated Convex query consumers are rendered beneath Convex auth-ready gating                         | read + browser verify          | touched client query call sites are only reachable beneath `<Authenticated>` or equivalent auth-ready guard |
| 17-01-C  | 17-01 | Public functions keep validators and current app-facing contracts                                          | grep + read                    | touched public write exports retain `args:` validators and unchanged call surfaces                          |
| 17-02-A  | 17-02 | Webhook verification fails closed when secret missing                                                      | unit tests                     | webhook route/helper tests exit 0 and missing-secret path returns failure                                   |
| 17-02-B  | 17-02 | Convex auth configuration no longer silently accepts missing issuer config                                 | grep + typecheck               | `convex/auth.config.ts` validates envs or fails clearly                                                     |
| 17-03-A  | 17-03 | Operator/webhook routes have explicit rate limiting                                                        | read + targeted tests          | touched routes reject or throttle repeated calls predictably                                                |
| 17-03-B  | 17-03 | Integration clients use explicit timeout/retry behavior                                                    | grep + unit tests              | fetch clients contain timeout/retry logic and tests pass                                                    |
| 17-03-C  | 17-03 | Scheduled/`ctx.run*` targets stay internal and auto-sync no longer relies on app self-HTTP                 | grep + read                    | touched Convex files use `internal.` refs and avoid circular self-fetch path                                |
| 17-04-A  | 17-04 | Dashboard has recoverable App Router error boundaries                                                      | file existence + visual verify | `app/global-error.tsx` and `app/dashboard/error.tsx` exist; fallback renders instead of white screen        |
| 17-04-B  | 17-04 | Main dashboard segments show route loading feedback                                                        | file existence + human verify  | `loading.tsx` exists for dashboard shell/main sections and appears during navigation                        |
| 17-05-A  | 17-05 | `formatMoney` is centralized                                                                               | grep                           | dashboard/components import shared formatter instead of local duplicates                                    |
| 17-05-B  | 17-05 | Custom dialogs are keyboard/focus accessible                                                               | read + human verify            | touched dialogs trap focus, expose dialog semantics, and support close/retry interactions                   |
| 17-06-A  | 17-06 | Occupancy is derived from attendee assignments, not room counter writes                                    | grep + tests                   | assign/unassign paths stop patching `occupiedBeds`; read models still expose correct counts                 |
| 17-06-B  | 17-06 | Duplicate room assignment mutations are removed or aligned to one truth-based implementation               | grep + read                    | duplicate attendee/accommodation assignment flows no longer diverge semantically                            |
| 17-07-A  | 17-07 | CSV export includes archive metadata                                                                       | grep + unit test               | CSV rows contain `isArchived`, `archivedAt`, `archiveReason` values in row output                           |
| 17-07-B  | 17-07 | Auto-match and quota checks happen in the same mutation boundary as the write                              | grep + read                    | Next.js/domain code no longer does query-then-write preflight for these paths                               |
| 17-07-C  | 17-07 | Touched Convex db operations use explicit table names and awaited writes                                   | grep + read                    | no touched `ctx.db.get/patch/replace/delete` calls omit the table name; no floating promises                |
| 17-08-A  | 17-08 | Audited finance/attendee `.collect()` hot paths are removed or bounded                                     | grep                           | no unbounded hot-path collects remain in audited functions                                                  |
| 17-08-B  | 17-08 | Refactors keep code type-safe                                                                              | command                        | `npm run typecheck` exits 0                                                                                 |
| 17-08-C  | 17-08 | No new query `.filter((q) => ...)`, `Date.now()` query logic, or redundant prefix indexes on touched paths | grep + schema review           | touched queries use indexes/bounds and schema changes do not leave obvious redundant prefixes               |
| 17-09-A  | 17-09 | Accommodation board read amplification is reduced without DTO drift                                        | read + targeted tests          | board no longer does whole-table reads and behavior tests pass                                              |
| 17-09-B  | 17-09 | Model interfaces are extracted into shared type modules without contract drift                             | grep + typecheck               | `lib/types/*.ts` contains extracted model types and touched callers import them without DTO changes         |
| 17-09-C  | 17-09 | Performance and interface refactors keep route/domain behavior covered by tests                            | targeted tests                 | touched finance, attendee, accommodation, and Tikkie tests exit 0                                           |

## Minimum commands

```bash
npm run typecheck
npm test -- tests/tikkie/webhook-route.test.ts tests/ticket-tailor/sync-route.test.ts
rg "ctx\.auth\.getUserIdentity\(|assert.*Auth|require.*Identity" convex/attendees.ts convex/orders.ts convex/payments.ts convex/tikkie.ts convex/accommodation.ts convex/events.ts convex/sync.ts
rg "rate limit|timeout|retry|AbortController" app/api lib/integrations
rg "\.collect\(" convex/attendees.ts convex/orders.ts convex/payments.ts convex/tikkie.ts convex/accommodation.ts
rg "\.filter\(\(?q|Date\.now\(" convex
rg "ctx\.db\.(get|patch|replace|delete)\(" convex
npm test -- tests/payments/payments-route.test.ts tests/payments/orders-search-route.test.ts tests/attendees/attendee-detail-route.test.ts tests/accommodation/allocation-filters.test.ts tests/tikkie/tikkie-links.test.ts
rg "formatMoney" app/dashboard components
```

## Human verification

- Trigger a dashboard route failure in local dev and confirm `app/dashboard/error.tsx` shows a recoverable fallback with a reset action.
- Navigate between main dashboard routes and confirm `loading.tsx` feedback appears.
- Spot-check one touched modal/dialog flow for keyboard focus and escape/close behavior.
