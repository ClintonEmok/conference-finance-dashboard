# Phase 13 Research — Rebuild Convex Mutation and API Layer from Clean Contracts

**Date:** 2026-03-26
**Discovery level:** 2 — standard research
**Why:** This phase is a medium-risk architectural cleanup inside an existing Convex migration. It changes the canonical Convex project layout, server-call boundary, public/internal function exposure, and several operator-facing API contracts.

## Question

What does the codebase need in order to turn the current Convex backend into a clean, typed, bounded contract layer that Next.js routes and integrations can trust long-term?

## Current State

- Convex works today, but the implementation carries migration debt from Phase 11:
  - `convex.json` points codegen at `convex/functions` instead of the standard top-level `convex/` tree.
  - The repo has duplicate schema/generated structures: `convex/schema.ts` plus `convex/functions/schema.ts`, and both `convex/_generated/*` and `convex/functions/_generated/*` exist.
  - `lib/convex/api.ts` imports `@/convex/functions/_generated/api` and casts the result to `any`.
  - `lib/convex/server.ts` calls Convex through raw `/api/query` and `/api/mutation` fetches using string paths like `"orders:searchOrders"`.
- Many Convex functions currently violate the project’s own generated AI guidelines:
  - heavy use of `.collect()` and in-memory `.filter()` on unbounded tables;
  - broad public query/mutation surfaces where some helpers should be internal-only;
  - repeated `as any` casts around document ids;
  - oversized domain files mixing list/detail/reporting/upsert responsibilities.
- App behavior is still correct enough to preserve:
  - Clerk already forwards auth to Convex from `lib/convex/client.tsx`.
  - Protected Next.js route handlers already centralize auth through `requireApiUser()`.
  - Domain modules in `lib/domain/**` and integration modules in `lib/integrations/**` are the stable app-facing boundaries and should keep their JSON contracts unless this phase intentionally narrows them.

## Documentation Findings

### Convex (Context7: `/websites/convex_dev`)

Relevant current guidance:

1. Convex’s standard project shape is a top-level `convex/` directory with generated API in `convex/_generated/*`.
2. File-based routing determines generated refs such as `api.orders.searchOrders`.
3. Next.js server code should call Convex with generated function references, not stringly-typed route names.
4. Use public functions only for true app/API entrypoints; helper logic callable only from Convex should use `internalQuery` / `internalMutation`.
5. Queries should prefer indexes and bounded result sets; avoid unbounded `.collect()`/`.filter()` patterns where indexed reads or pagination can express the contract.
6. `paginationOptsValidator` is the standard way to expose paginated list queries when the caller needs page-by-page access.

Relevant examples from current docs:

```ts
import { api } from "@/convex/_generated/api"

const reference = api.orders.searchOrders
```

```ts
import { paginationOptsValidator } from "convex/server"

export const listMessages = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db.query("messages").paginate(args.paginationOpts)
  },
})
```

```ts
import { internalQuery } from "./_generated/server"

export const getUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.userId)
  },
})
```

### Project-specific Convex rules (`convex/_generated/ai/guidelines.md`)

The repo’s Convex rules reinforce the same direction and explicitly require:

1. Validators on every public and internal function.
2. `api`/`internal` generated refs for cross-function calls.
3. `v.id("table")` and `Id<"table">` instead of string ids where the table is known.
4. Avoiding `.filter()` in database queries in favor of indexes.
5. Returning bounded collections unless the product explicitly needs all rows.

## Recommended Migration Shape

### 1. Re-canonicalize Convex around one top-level app tree

Make `convex/` the only canonical functions directory again.

Concretely:

- Move domain modules from `convex/functions/*.ts` to `convex/*.ts` with the same basenames.
- Keep only `convex/schema.ts` as the schema source.
- Regenerate and standardize on `convex/_generated/*`.
- Stop importing anything from `convex/functions/_generated/*`.

Why: every later contract cleanup becomes easier once codegen, refs, and import paths all point at one canonical location.

### 2. Replace string-path server fetches with typed function-reference calls

`lib/convex/server.ts` should become a typed server bridge that accepts generated query/mutation refs and attaches Clerk’s `convex` JWT automatically.

Target outcome:

- Next.js server code calls `runConvexQuery(api.orders.searchOrders, args)` / `runConvexMutation(api.payments.assignPaymentToOrder, args)` (or equivalent helper names).
- `lib/convex/api.ts` no longer casts generated API refs to `any`.
- Legacy string-path wrappers are temporary compatibility shims only during migration and removed once all callers move over.

Why: this removes typo-prone path strings, restores end-to-end typing, and makes the route/domain boundary match documented Convex usage.

### 3. Split public operator contracts from internal write helpers

Current Convex files expose too much as public surface area.

Recommended rule:

- Public functions: only app/API entrypoints the Next.js layer genuinely calls.
- Internal functions/helpers: upserts, rollups, occupancy recalculation, sync fan-out helpers, and cross-function plumbing.

Why: this keeps operator-triggerable contracts small and auditable while letting complex data workflows stay inside Convex.

### 4. Rebuild high-traffic query contracts around bounded indexed reads

Prioritize the hot paths first:

- orders search;
- order ledger / revenue / reconciliation;
- attendee ledger / attendee detail;
- accommodation inventory / assignment board;
- payment list / latest Tikkie link projections.

Each contract should:

- use indexes first;
- cap or paginate list results;
- return exactly the operator-facing projection needed by current routes;
- avoid route-layer data stitching when the domain projection belongs in Convex.

### 5. Preserve current protected-route JSON contracts while swapping the backend boundary

This phase is a backend refactor, not a product redesign.

Preserve where currently used:

- `401 UNAUTHORIZED` JSON from `requireApiUser()`;
- current success shapes consumed by dashboard pages and tests;
- current status enums such as `paid | refunded | cancelled | pending` and `created | paid | expired`.

## Scope Boundaries

### In scope

- Convex project topology cleanup.
- Typed server bridge and generated API imports.
- Rebuilding public/internal Convex contracts for orders, attendees, accommodation, payments, Tikkie, and sync.
- Updating domain modules and route handlers to the new typed bridge.
- Removing leftover string-path and nested-generated imports once migration completes.

### Out of scope

- Product-level UX redesign.
- New finance features unrelated to contract cleanup.
- Large schema/data model changes beyond what the contract cleanup strictly requires.
- Clerk auth redesign (Phase 12 already established the target auth shape).

## Risks / Common Failure Modes

1. **Big-bang codegen breakage**
   - Risk: changing `convex.json` or file locations breaks imports everywhere at once.
   - Mitigation: make topology cleanup the first plan and keep migration-compatible server helpers until all callers move.

2. **Contract drift during refactor**
   - Risk: rebuilding Convex projections changes route payloads the dashboard already expects.
   - Mitigation: preserve existing JSON shapes in `lib/domain/**` and route handlers while narrowing only internal Convex plumbing.

3. **Public surface area remains too broad**
   - Risk: functions stay public because they are convenient to call from routes.
   - Mitigation: move helper/upsert/recalculation logic behind internal refs and keep public exports focused on app entrypoints.

4. **Performance cleanup stalls on mega-files**
   - Risk: trying to perfect all queries in one plan creates a huge, fragile rewrite.
   - Mitigation: refactor by domain slice after the shared foundation lands.

5. **Legacy wrappers never get removed**
   - Risk: typed helpers are added but raw string-path callers linger indefinitely.
   - Mitigation: finish with an explicit cleanup plan that grep-verifies zero remaining legacy calls/imports.

## Validation Architecture

### Fast checks after each task

- `npx convex codegen`
- `npm run typecheck`
- `npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/tikkie-links.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/webhook-route.test.ts`

### Full phase checks

- `npx convex codegen`
- `npm run build`
- `npm run typecheck`
- `npm test`
- `rg "@/convex/functions/_generated|convexQuery\(\"|convexMutation\(\"|as any" lib app convex`

### Manual checks required

None — this phase should be verifiable through codegen, typecheck, tests, and grep-based contract checks.

## Planning Implications

- The phase should be split into five plans:
  1. Canonical Convex topology + typed server bridge foundation.
  2. Orders/reporting/reconciliation read-contract rebuild.
  3. Attendee + accommodation contract rebuild.
  4. Payments + Tikkie mutation/API contract rebuild.
  5. Sync/webhook cleanup + legacy bridge removal + full regression.
- Best dependency graph:
  - Wave 1: foundation
  - Wave 2: orders/reporting, attendee/accommodation, and payments/Tikkie in parallel
  - Wave 3: sync cleanup + legacy removal + final regression
