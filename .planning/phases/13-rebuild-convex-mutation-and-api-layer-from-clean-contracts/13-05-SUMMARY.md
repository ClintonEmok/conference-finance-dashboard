---
phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
plan: "05"
subsystem: api
tags: [convex, sync, webhooks, cleanup, regression]
requires:
  - phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
    provides: Orders/reporting, attendee/accommodation, and payment/Tikkie readers/writers migrated to generated refs.
provides:
  - Ticket Tailor sync/webhook flows migrated to generated Convex refs
  - Legacy nested generated files removed
  - Shared Convex server bridge no longer accepts raw string dispatch
affects: [sync, webhooks, lib-convex-bridge]
tech-stack:
  added: []
  patterns:
    - "Ticket Tailor integration code now uses `api.sync.*` refs exclusively."
    - "`lib/convex/server.ts` accepts only generated public refs, with a test-only fetch shim for Vitest mocks."
key-files:
  created: []
  modified:
    - convex/sync.ts
    - convex/events.ts
    - convex/orders.ts
    - lib/convex/server.ts
    - lib/integrations/ticket-tailor/sync.ts
    - lib/integrations/ticket-tailor/webhook.ts
    - app/api/ticket-tailor/webhook-events/route.ts
    - convex/functions/_generated/* (deleted)
key-decisions:
  - "Removed string-path compatibility only after every known caller had been migrated to generated refs."
  - "Deleted obsolete nested generated files instead of keeping dead duplicate codegen artifacts around."
patterns-established:
  - "Bridge cleanup happens after caller migration; tests can keep mock-path shims without preserving string-based public APIs."
requirements-completed: []
duration: 46 min
completed: 2026-03-26
---

# Phase 13 Plan 05 Summary

**Ticket Tailor sync/webhook paths and the shared Convex bridge are fully cleaned up; raw string dispatch and nested generated artifacts are gone.**

## Accomplishments

- Migrated Ticket Tailor sync and webhook modules plus the webhook-events route to generated `api.sync.*` refs.
- Removed string-overload support and legacy reference maps from `lib/convex/server.ts`.
- Deleted the obsolete `convex/functions/_generated/*` tree and cleared remaining `as any` Convex id lookups in shared event/order readers.

## Verification

- `npx convex codegen`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `rg 'convexQuery\("|convexMutation\("|@/convex/functions/_generated|as any' lib app convex`

---

_Phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts_
_Completed: 2026-03-26_
