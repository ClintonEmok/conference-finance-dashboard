---
phase: 26-order-ops-refresh
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/domain/finance/payments.ts
  - app/api/payments/route.ts
  - lib/domain/finance/matched-payments.ts
  - lib/domain/finance/reconciliation.ts
  - tests/payments/payments-route.test.ts
  - tests/reconciliation/reconciliation-outstanding.test.ts
autonomous: true
gap_closure: true
must_haves:
  truths:
    - "Payment lookup and reconciliation use one canonical internal orders identifier contract."
    - "Legacy provider-id resolution exists only in migration-only adapter code."
    - "Legacy payment records still resolve and reconcile correctly after the canonical join change."
  artifacts:
    - path: "lib/domain/finance/payments.ts"
      provides: "Canonical order-id resolution for payment writes and assignment"
    - path: "app/api/payments/route.ts"
      provides: "Payment enrichment that resolves order facts by canonical order id"
    - path: "lib/domain/finance/matched-payments.ts"
      provides: "Canonical matched-payment aggregation keyed by internal order id"
    - path: "lib/domain/finance/reconciliation.ts"
      provides: "Reconciliation rows that consume canonical matched totals"
    - path: "tests/payments/payments-route.test.ts"
      provides: "Regression coverage for payment enrichment lookup order"
    - path: "tests/reconciliation/reconciliation-outstanding.test.ts"
      provides: "Regression coverage for canonical reconciliation matching"
  key_links:
    - from: "app/api/payments/route.ts"
      to: "convex.orders.getOrderById"
      via: "canonical payment enrichment lookup"
      pattern: "api\\.orders\\.getOrderById"
    - from: "lib/domain/finance/matched-payments.ts"
      to: "convex.orders.getOrderById"
      via: "canonical matched-payment aggregation"
      pattern: "api\\.orders\\.getOrderById"
    - from: "lib/domain/finance/reconciliation.ts"
      to: "lib/domain/finance/matched-payments.ts"
      via: "canonical matched totals map"
      pattern: "buildMatchedTotalsBy.*OrderId"
---

<objective>
Close the runtime-join gap by making payment enrichment and reconciliation use one canonical internal order identity.

Purpose: eliminate provider-first joins from the runtime payment path while keeping historical records readable through an explicit migration-only adapter.
Output: canonical payment lookup, canonical matched-payment aggregation, and reconciliation rows keyed by internal order id.
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
@app/api/payments/route.ts
@lib/domain/finance/payments.ts
@lib/domain/finance/matched-payments.ts
@lib/domain/finance/reconciliation.ts
@tests/payments/payments-route.test.ts
@tests/reconciliation/reconciliation-outstanding.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make payment enrichment canonical-first</name>
  <files>lib/domain/finance/payments.ts, app/api/payments/route.ts</files>
  <read_first>lib/domain/finance/payments.ts, app/api/payments/route.ts, convex/orders.ts, tests/payments/payments-route.test.ts</read_first>
  <action>Change `resolveCanonicalOrderId` and `resolvePaymentOrder` so the runtime path resolves and enriches against `orders._id` first, not `providerOrderId`. Keep any provider-id fallback inside a private migration-only adapter path, preserve null handling for missing order facts, and remove provider-first lookup from `GET /api/payments`.</action>
  <acceptance_criteria>
    - `app/api/payments/route.ts` no longer calls `api.orders.getOrderByProviderId`.
    - `lib/domain/finance/payments.ts` resolves payment assignment through `api.orders.getOrderById` on the runtime path.
    - `tests/payments/payments-route.test.ts` asserts canonical lookup happens before any legacy fallback.
  </acceptance_criteria>
  <verify>Run `npm test -- tests/payments/payments-route.test.ts` and `npm run typecheck`.</verify>
  <done>Payment enrichment no longer prefers provider ids on the runtime path.</done>
</task>

<task type="auto">
  <name>Task 2: Canonicalize matched-payment aggregation and reconciliation</name>
  <files>lib/domain/finance/matched-payments.ts, lib/domain/finance/reconciliation.ts, tests/reconciliation/reconciliation-outstanding.test.ts</files>
  <read_first>lib/domain/finance/matched-payments.ts, lib/domain/finance/reconciliation.ts, convex/orders.ts, tests/reconciliation/reconciliation-outstanding.test.ts</read_first>
  <action>Rename or replace the provider-centric matched-totals helper with a canonical order-id helper, then update reconciliation to consume that canonical map directly. Keep a compatibility adapter only for historical rows if needed, but the main runtime path must not translate `providerOrderId ?? orderId` back and forth.</action>
  <acceptance_criteria>
    - `lib/domain/finance/matched-payments.ts` keys matched totals by canonical internal order id.
    - `lib/domain/finance/reconciliation.ts` no longer contains `providerOrderId ?? orderId` for matching.
    - `tests/reconciliation/reconciliation-outstanding.test.ts` covers canonical matching plus the legacy fallback case.
  </acceptance_criteria>
  <verify>Run `npm test -- tests/reconciliation/reconciliation-outstanding.test.ts` and `npm run typecheck`.</verify>
  <done>Reconciliation rows and matched totals resolve by internal order id.</done>
</task>

</tasks>

<verification>
1. Payment runtime reads use canonical order ids first.
2. Reconciliation uses the same canonical key as payment matching.
3. Historical payment records still reconcile after the adapter-only fallback change.
</verification>

<success_criteria>
1. The payment/reconciliation join contract is unambiguous.
2. Provider-id handling is isolated from the runtime payment path.
3. Targeted tests and typecheck pass.
</success_criteria>

<output>
After completion, create `.planning/phases/26-order-ops-refresh/26-order-ops-refresh-04-SUMMARY.md`
</output>
