---
phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
plan: "04"
subsystem: api
tags: [convex, payments, tikkie, api-routes]
requires:
  - phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
    provides: Canonical Convex tree and typed Clerk-aware server bridge.
provides:
  - Payments and Tikkie domain modules migrated to generated Convex refs
  - Payment/Tikkie Convex contracts widened to match real route usage (`orderId`, `sourceId`, template lookups)
  - Tikkie route/test behavior preserved with typed refs and test-safe bridge execution
affects: [13-05, payments, tikkie]
tech-stack:
  added: []
  patterns:
    - "Payments and Tikkie domain code now calls `api.payments.*` and `api.tikkie.*` refs instead of raw path strings."
    - "The shared Convex server bridge can execute generated refs through test fetch shims without reintroducing string callers."
key-files:
  created: []
  modified:
    - convex/payments.ts
    - convex/tikkie.ts
    - lib/domain/finance/payments.ts
    - lib/domain/finance/tikkie-links.ts
    - lib/domain/finance/tikkie-templates.ts
    - app/api/payments/tikkie/sync/route.ts
    - lib/convex/server.ts
key-decisions:
  - "Kept route-facing payment/Tikkie contracts stable while widening Convex validators to cover real mutation/query arguments already used by the app."
  - "Preserved Tikkie targeted test behavior by routing generated refs through a test-only mock fetch path in the server bridge."
patterns-established:
  - "Generated refs are the only app-facing call shape; test compatibility belongs in the bridge, not in route/domain string fallbacks."
requirements-completed: []
duration: 41 min
completed: 2026-03-26
---

# Phase 13 Plan 04 Summary

**Payments and Tikkie flows now use typed Convex refs, and the Convex contracts match the app’s real payment/template/status workflows.**

## Accomplishments

- Migrated payment creation, assignment, list, sync, template, and link-refresh code from string dispatch to generated refs.
- Tightened `convex/payments.ts` with indexed reads, explicit `returns:` validators, and real support for `orderId`, `sourceId`, and matched metadata.
- Updated `convex/tikkie.ts` template/status contracts and kept all Tikkie route tests green.

## Verification

- `npm run typecheck`
- `npm test -- tests/tikkie/tikkie-links.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/webhook-route.test.ts`
- `rg '"payments:|"tikkie:' lib/domain/finance app/api/payments app/api/dashboard/tikkie-links/route.ts app/api/dashboard/tikkie-templates/route.ts app/api/jobs/tikkie/status-sync/route.ts app/api/admin/tikkie/subscription/route.ts app/api/webhooks/tikkie/route.ts`

---

_Phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts_
_Completed: 2026-03-26_
