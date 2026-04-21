---
phase: 26-order-ops-refresh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/tikkie.ts
  - lib/domain/finance/payments.ts
  - convex/orders.ts
  - convex/sync/orders.ts
  - app/api/dashboard/orders/[orderId]/route.ts
  - app/api/dashboard/attendees/[attendeeId]/route.ts
autonomous: true
must_haves:
  truths:
    - "Provider sync updates change the canonical order status shown in dashboard views."
    - "Payment references are rendered with one shared prefix across creation and display."
    - "Order and attendee detail endpoints accept validated edits and reject invalid payloads."
  artifacts:
    - path: "convex/orders.ts"
      provides: "Canonical order status mutation behavior"
    - path: "convex/sync/orders.ts"
      provides: "Sync-driven status propagation"
    - path: "convex/tikkie.ts"
      provides: "Payment creation using the global prefix"
    - path: "app/api/dashboard/orders/[orderId]/route.ts"
      provides: "Order edit API"
      exports: ["GET", "PATCH", "DELETE"]
    - path: "app/api/dashboard/attendees/[attendeeId]/route.ts"
      provides: "Attendee edit API"
      exports: ["GET", "PATCH"]
  key_links:
    - from: "convex/sync/orders.ts"
      to: "convex/orders.ts"
      via: "normalized status mutation"
      pattern: "updateOrderStatus|patch\\(\"orders\""
    - from: "app/api/dashboard/orders/[orderId]/route.ts"
      to: "convex/orders.ts"
      via: "validated PATCH"
      pattern: "convexMutation\\(api\\.orders\\."
    - from: "convex/tikkie.ts"
      to: "lib/domain/finance/payments.ts"
      via: "shared prefix helper"
      pattern: "PAYMENT_.*PREFIX"
---

<objective>
Stabilize the backend contract for the new order-management phase.

Purpose: keep payment references, sync-driven order statuses, and dashboard edit APIs aligned so the UI can safely move to a new operator workflow.
Output: a shared payment prefix, canonical status sync behavior, and validated order/attendee PATCH endpoints.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/SYNC-ANALYSIS.md
@.planning/codebase/TABLE_RELATIONSHIPS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@convex/orders.ts
@convex/sync/orders.ts
@convex/tikkie.ts
@lib/domain/finance/payments.ts
@app/api/dashboard/orders/[orderId]/route.ts
@app/api/dashboard/attendees/[attendeeId]/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add a shared global payment prefix</name>
  <files>lib/domain/finance/payments.ts, convex/tikkie.ts</files>
  <action>Create one shared prefix constant/helper and use it in both payment-link creation and payment display formatting. Preserve null/empty handling for legacy records, and do not change matching logic or order-id resolution semantics.</action>
  <verify>Run `npm test -- tests/payments/payments-route.test.ts tests/finance/order-ledger.test.ts` and `npm run typecheck`.</verify>
  <done>Every newly generated payment reference uses the same prefix, and dashboard/payment API reads render it consistently.</done>
</task>

<task type="auto">
  <name>Task 2: Make sync-driven order status writes canonical</name>
  <files>convex/orders.ts, convex/sync/orders.ts</files>
  <action>Route provider status changes through one canonical helper, keep `orders.status` as the source for dashboard reads, and preserve `refundedAt`/`cancelledAt` timestamps on the extension record. Avoid duplicating status mapping logic across sync entry points.</action>
  <verify>Run `npm test -- tests/finance/internal-orders-canonicalization.test.ts tests/finance/order-ledger.test.ts` and `npm run typecheck`.</verify>
  <done>Sync updates and order ledger reads agree on the same normalized status for the same order.</done>
</task>

<task type="auto">
  <name>Task 3: Expand dashboard PATCH handlers for edits</name>
  <files>app/api/dashboard/orders/[orderId]/route.ts, app/api/dashboard/attendees/[attendeeId]/route.ts</files>
  <action>Add validated PATCH payloads for the fields the new manage-orders UI needs, keep auth checks in place, and return structured 4xx errors for invalid input. Do not accept raw IDs or unbounded field bags.</action>
  <verify>Run `npm test -- tests/attendees/attendee-detail-route.test.ts` and `npm run typecheck`.</verify>
  <done>Both endpoints accept valid edits and reject invalid payloads with explicit client errors.</done>
</task>

</tasks>

<verification>
1. Typecheck passes.
2. Targeted Vitest suites for payments, canonical orders, and attendee routes pass.
3. Edited order and attendee APIs return the updated objects after PATCH.
</verification>

<success_criteria>
1. Payment references share a single global prefix everywhere this phase touches them.
2. Sync updates keep canonical order status, timestamps, and dashboard reads aligned.
3. Order and attendee admin edits are validated, authenticated, and ready for the manage-orders UI.
</success_criteria>

<output>
After completion, create `.planning/phases/26-order-ops-refresh/26-order-ops-refresh-01-SUMMARY.md`
</output>
