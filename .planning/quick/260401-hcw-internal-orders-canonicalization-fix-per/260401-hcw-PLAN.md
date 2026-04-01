---
phase: 26-canonical-runtime-contract
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/sync/orders.ts
  - convex/payments.ts
  - lib/domain/finance/payments.ts
  - convex/orders.ts
  - lib/types/order.ts
  - lib/domain/finance/order-ledger.ts
  - lib/domain/finance/reconciliation.ts
  - lib/domain/finance/matched-payments.ts
  - app/api/payments/route.ts
  - app/dashboard/orders/page.tsx
  - app/dashboard/orders/[orderId]/page.tsx
  - app/dashboard/reconciliation/page.tsx
  - tests/finance/internal-orders-canonicalization.test.ts
  - tests/payments/payments-route.test.ts
  - tests/reconciliation/reconciliation-outstanding.test.ts
autonomous: true
must_haves:
  truths:
    - Internal sync writes persist totalAmountMinor on canonical orders instead of leaving totals implicit.
    - Payment writes resolve provider-facing order references to the canonical orders._id before insert or patch.
    - Read/API responses expose missing provider ids and missing amounts as null or explicit missing states, not empty strings or zeroes.
    - Dashboard order and reconciliation screens render explicit placeholders for missing provider ids or amounts.
    - Targeted tests lock provider-order lookup precedence and null-safe read contracts.
  artifacts:
    - path: convex/sync/orders.ts
      provides: Internal order upsert/backfill path that persists totals
      contains: totalAmountMinor
    - path: convex/payments.ts
      provides: Canonical payment write mutations
      contains: assignPaymentToOrder
    - path: lib/domain/finance/payments.ts
      provides: Write-side payment helpers that resolve canonical order ids
      contains: normalize
    - path: convex/orders.ts
      provides: Nullable order read/query contract
      contains: providerOrderId
    - path: lib/types/order.ts
      provides: Nullable order ledger validators
      contains: nullable
    - path: lib/domain/finance/order-ledger.ts
      provides: Order ledger DTO contract
      contains: OrderLedgerRow
    - path: lib/domain/finance/reconciliation.ts
      provides: Reconciliation row contract
      contains: ReconciliationRow
    - path: lib/domain/finance/matched-payments.ts
      provides: Provider-order matching helper
      contains: buildMatchedTotalsByProviderOrderId
    - path: app/api/payments/route.ts
      provides: Payment list API response shape
      contains: resolvePaymentOrder
    - path: app/dashboard/orders/page.tsx
      provides: Order ledger dashboard
      contains: OrdersPayload
    - path: app/dashboard/orders/[orderId]/page.tsx
      provides: Order detail dashboard
      contains: totalAmountMinor
    - path: app/dashboard/reconciliation/page.tsx
      provides: Reconciliation dashboard
      contains: providerOrderId
    - path: tests/finance/internal-orders-canonicalization.test.ts
      provides: Backend canonicalization regression coverage
      contains: canonical
    - path: tests/payments/payments-route.test.ts
      provides: Payments route contract coverage
      contains: provider order id lookup
    - path: tests/reconciliation/reconciliation-outstanding.test.ts
      provides: Reconciliation null-safe regression coverage
      contains: missing-amount
  key_links:
    - from: convex/sync/orders.ts
      to: convex/payments.ts
      via: canonical order ids must exist before payment writes run
      pattern: orderId
    - from: convex/orders.ts
      to: lib/types/order.ts
      via: validator-backed query responses
      pattern: orderLedgerRowValidator
    - from: lib/domain/finance/reconciliation.ts
      to: app/dashboard/reconciliation/page.tsx
      via: reconciliation rows drive missing-amount UI
      pattern: missing-amount
    - from: app/api/payments/route.ts
      to: app/dashboard/orders/[orderId]/page.tsx
      via: payment detail fetches must preserve null order facts
      pattern: resolvePaymentOrder
---

<objective>
Make the internal-orders-first runtime canonical: internal sync writes persist totals, payment writes resolve canonical order ids, and all read/API/UI surfaces expose missing provider ids and amounts explicitly instead of coercing them to empty strings or zeroes.

Purpose: lock the phase-26 runtime contract before deeper money-model work.
Output: one atomic plan that subagents can execute in parallel where safe.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@AGENTS.md
@convex/_generated/ai/guidelines.md
@convex/sync/orders.ts
@convex/payments.ts
@lib/domain/finance/payments.ts
@convex/orders.ts
@lib/types/order.ts
@lib/domain/finance/order-ledger.ts
@lib/domain/finance/reconciliation.ts
@lib/domain/finance/matched-payments.ts
@app/api/payments/route.ts
@app/dashboard/orders/page.tsx
@app/dashboard/orders/[orderId]/page.tsx
@app/dashboard/reconciliation/page.tsx
@tests/payments/payments-route.test.ts
@tests/reconciliation/reconciliation-outstanding.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Canonicalize internal writes and backfill missing totals</name>
  <files>convex/sync/orders.ts, convex/payments.ts, lib/domain/finance/payments.ts, tests/finance/internal-orders-canonicalization.test.ts</files>
  <action>
    Update the internal order sync path so canonical orders always persist totalAmountMinor on create/update, then add one bounded backfill helper for legacy internal rows that still miss totals.

    Canonicalize payment writes so the write helpers resolve provider-facing order ids to the canonical orders._id before inserting or patching payments; keep provider ids as lookup inputs only, never as the stored foreign key.

    Add a focused regression test file that proves the internal sync path stores totals and the payment write path stores canonical order ids, including a legacy-row backfill case.

  </action>
  <verify>Run the new backend canonicalization test file and confirm the backfill only patches rows with missing canonical data.</verify>
  <done>Internal writes persist totals and payment writes store canonical orders._id references.</done>
</task>

<task type="auto">
  <name>Task 2: Make finance reads and API contracts null-safe</name>
  <files>convex/orders.ts, lib/types/order.ts, lib/domain/finance/order-ledger.ts, lib/domain/finance/reconciliation.ts, lib/domain/finance/matched-payments.ts, app/api/payments/route.ts</files>
  <action>
    Update the order ledger and reconciliation query stack so missing providerOrderId and totalAmountMinor values stay null all the way out to the API contract instead of being coerced to "" or 0.

    Adjust the shared order validators to accept nullable ledger fields, make reconciliation reasons explicit when amounts are absent, and keep the payments API enrichment path provider-id-first while returning nullable order facts rather than fabricating "Unknown" or zero values.

  </action>
  <verify>Run the changed domain/API contract checks and confirm the returned payloads preserve nulls for missing provider ids and amounts.</verify>
  <done>Read/API layers emit explicit missing-data states and no longer coerce absent provider ids or totals.</done>
</task>

<task type="auto">
  <name>Task 3: Update dashboard surfaces and contract tests</name>
  <files>app/dashboard/orders/page.tsx, app/dashboard/orders/[orderId]/page.tsx, app/dashboard/reconciliation/page.tsx, tests/payments/payments-route.test.ts, tests/reconciliation/reconciliation-outstanding.test.ts</files>
  <action>
    Update the dashboard pages to consume the new nullable contracts from Task 2: render explicit placeholders for missing provider ids or totals, avoid counting absent totals as real zero-value money in summary math, and keep reconciliation/order detail screens usable when canonical facts are incomplete.

    Refresh the route/unit tests to prove provider-order lookup precedence and null-safe response behavior so the UI contract cannot regress back to empty-string/zero fallbacks.

  </action>
  <verify>Run the updated route/unit tests plus a build or typecheck pass to confirm the UI compiles against the nullable contracts.</verify>
  <done>Dashboard surfaces missing provider ids and amounts explicitly, and the regression tests lock the new behavior.</done>
</task>

</tasks>

<verification>
Execute Tasks 1 and 2 in parallel. Task 3 starts after Task 2 lands, because the dashboard contract depends on the new nullable read shapes.

Finish by running the targeted tests for the changed backend, domain/API, and dashboard paths together with a final build/typecheck.
</verification>

<success_criteria>

- Canonical internal orders persist totals on sync writes and legacy rows can be backfilled safely.
- Payment writes always store canonical order ids.
- Finance reads and API responses preserve nulls for missing provider ids or totals.
- Dashboard pages and tests show explicit missing-data states instead of empty/zero coercions.
  </success_criteria>

<output>
After completion, create `.planning/quick/260401-hcw-internal-orders-canonicalization-fix-per/260401-hcw-SUMMARY.md`.
</output>
