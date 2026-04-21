---
phase: 26-order-ops-refresh
plan: 05
type: execute
wave: 2
depends_on:
  - 26-order-ops-refresh-04
files_modified:
  - convex/orders.ts
  - convex/finance/provider-boundary.ts
  - lib/domain/finance/attendees.ts
  - tests/finance/order-ledger.test.ts
  - tests/finance/attendees.test.ts
autonomous: true
gap_closure: true
must_haves:
  truths:
    - "Convex order reads no longer reach ticketTailor tables inline outside a dedicated boundary helper."
    - "Attendee ledger matching uses canonical internal order ids."
    - "Runtime finance reads explain provider data only through an explicit adapter boundary."
  artifacts:
    - path: "convex/finance/provider-boundary.ts"
      provides: "Dedicated provider-to-canonical order boundary helper"
    - path: "convex/orders.ts"
      provides: "Order ledger reads that consume boundary data instead of inline provider joins"
    - path: "lib/domain/finance/attendees.ts"
      provides: "Attendee ledger that keys matched totals by canonical order id"
    - path: "tests/finance/order-ledger.test.ts"
      provides: "Regression coverage for order-ledger event and boundary behavior"
    - path: "tests/finance/attendees.test.ts"
      provides: "Regression coverage for attendee ledger canonical matching"
  key_links:
    - from: "convex/orders.ts"
      to: "convex/finance/provider-boundary.ts"
      via: "isolated boundary helper"
      pattern: "provider-boundary|boundary"
    - from: "lib/domain/finance/attendees.ts"
      to: "lib/domain/finance/matched-payments.ts"
      via: "canonical order-id matched totals"
      pattern: "buildMatchedTotalsBy.*OrderId"
    - from: "tests/finance/attendees.test.ts"
      to: "lib/domain/finance/attendees.ts"
      via: "canonical order-id regression"
      pattern: "orderId|providerOrderId"
---

<objective>
Move the remaining finance ledger reads behind an explicit provider boundary.

Purpose: keep Ticket Tailor lookups out of the inline runtime read paths and make attendee balances depend on canonical order ids only.
Output: a Convex boundary helper for provider joins and a canonical attendee ledger.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/26-order-ops-refresh/26-VERIFICATION.md
@.planning/codebase/FINANCIAL_DATA_FLOW.md
@.planning/codebase/CONCERNS.md
@convex/orders.ts
@lib/domain/finance/attendees.ts
@tests/finance/order-ledger.test.ts
@tests/finance/attendees.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract a provider boundary for Convex order reads</name>
  <files>convex/orders.ts, convex/finance/provider-boundary.ts</files>
  <read_first>convex/orders.ts, convex/finance.ts, convex/sync/orders.ts, tests/finance/order-ledger.test.ts</read_first>
  <action>Move the `ticketTailorOrders` and `ticketTailorAttendees` read joins used by `getOrderWithExtension`, `getVisibleOrdersWithExtensions`, `getOrderLedger`, and `getOrderById` into `convex/finance/provider-boundary.ts`. Keep mutation/upsert paths in `convex/orders.ts` untouched, and make the runtime read helpers consume only the boundary helper output.</action>
  <acceptance_criteria>
    - `convex/finance/provider-boundary.ts` owns the inline provider-table read joins.
    - `convex/orders.ts` read helpers no longer contain `ctx.db.query("ticketTailorOrders")` or `ctx.db.query("ticketTailorAttendees")`.
    - `tests/finance/order-ledger.test.ts` still passes after the boundary extraction.
  </acceptance_criteria>
  <verify>Run `npm test -- tests/finance/order-ledger.test.ts` and `npm run typecheck`.</verify>
  <done>Ticket Tailor joins are isolated behind a dedicated Convex boundary helper.</done>
</task>

<task type="auto">
  <name>Task 2: Make the attendee ledger canonical-order keyed</name>
  <files>lib/domain/finance/attendees.ts, tests/finance/attendees.test.ts</files>
  <read_first>lib/domain/finance/attendees.ts, lib/domain/finance/matched-payments.ts, tests/finance/attendees.test.ts</read_first>
  <action>Switch attendee balance calculations to the canonical `orderId` key from the matched-totals helper, delete the per-call provider lookup cache from the ledger path, and keep provider ids only for display. Preserve the existing balance math and event filtering, but stop using provider ids as the matching source of truth.</action>
  <acceptance_criteria>
    - `lib/domain/finance/attendees.ts` no longer calls a provider-first matched totals helper.
    - `lib/domain/finance/attendees.ts` no longer needs a provider lookup cache to compute balances.
    - `tests/finance/attendees.test.ts` covers a ledger row where `providerOrderId` is null.
  </acceptance_criteria>
  <verify>Run `npm test -- tests/finance/order-ledger.test.ts tests/finance/attendees.test.ts` and `npm run typecheck`.</verify>
  <done>Attendee balances no longer require provider ids to match.</done>
</task>

</tasks>

<verification>
1. Convex order reads do not inline provider-table joins.
2. Attendee ledger balances compute from canonical order ids.
3. Boundary extraction preserves existing ledger behavior and tests.
</verification>

<success_criteria>
1. Provider data access is explicit and isolated.
2. Attendee-ledger matching no longer depends on provider ids.
3. Targeted tests and typecheck pass.
</success_criteria>

<output>
After completion, create `.planning/phases/26-order-ops-refresh/26-order-ops-refresh-05-SUMMARY.md`
</output>
