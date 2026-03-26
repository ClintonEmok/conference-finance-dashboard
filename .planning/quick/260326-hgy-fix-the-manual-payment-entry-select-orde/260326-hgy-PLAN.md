---
phase: quick-260326-hgy-fix-the-manual-payment-entry-select-orde
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - components/payments/manual-entry-form.tsx
  - app/api/orders/search/route.ts
  - tests/payments/orders-search-route.test.ts
autonomous: true
must_haves:
  truths:
    - "In manual payment entry, operators can type buyer name/order id and see a search dropdown with matching orders."
    - "Selecting a dropdown result sets the order id used for submission, so manual payments are linked to the chosen order."
    - "Order search requests from the manual-payment UI resolve successfully instead of silently failing due to query mismatch."
  artifacts:
    - path: "components/payments/manual-entry-form.tsx"
      provides: "Searchable order picker with explicit loading, result, and no-result dropdown states"
    - path: "app/api/orders/search/route.ts"
      provides: "Protected order-search API that normalizes incoming query parameter variants and returns consistent results"
    - path: "tests/payments/orders-search-route.test.ts"
      provides: "Route regression coverage for auth guard and search query parsing"
  key_links:
    - from: "components/payments/manual-entry-form.tsx"
      to: "/api/orders/search"
      via: "debounced fetch while typing in Select Order"
      pattern: "fetch\(`/api/orders/search\?"
    - from: "app/api/orders/search/route.ts"
      to: "convex/orders.ts:searchOrders"
      via: "convexQuery(api.orders.searchOrders, { search, limit })"
      pattern: "api\.orders\.searchOrders"
---

<objective>
Fix the manual payment "Select Order" flow so it behaves like a real search dropdown and reliably returns selectable orders.

Purpose: Prevent finance operators from getting blocked when recording bank/cash payments because order lookup is inconsistent or unclear.
Output: A working searchable order dropdown in manual payment entry, compatible order-search API parsing, and regression tests for the search route contract.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@convex/_generated/ai/guidelines.md
@components/payments/manual-entry-form.tsx
@app/api/orders/search/route.ts
@convex/orders.ts
@tests/attendees/attendee-detail-route.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make manual payment order selection a reliable search dropdown</name>
  <files>components/payments/manual-entry-form.tsx</files>
  <action>Refine the existing Select Order input into a stable search-dropdown interaction: keep debounced search, show explicit dropdown states (searching, no results, results), and only keep `values.orderId` when a concrete order has been selected. Ensure typing after selection clears stale selected-order state, and ensure dropdown visibility is deterministic (open on active search interaction, close on selection/clear). Reuse current styling and payload shape; do not redesign the entire form or payment submit contract.</action>
  <verify>Run `npm run typecheck`.</verify>
  <done>Operators can search for orders in the manual entry form, see clear dropdown feedback, and select an order that persists as the submission `orderId`.</done>
</task>

<task type="auto">
  <name>Task 2: Normalize order search API query parsing so UI requests always resolve</name>
  <files>app/api/orders/search/route.ts</files>
  <action>Update GET query parsing to accept both `search` and `q` (with trimmed normalization and `search` taking precedence when both are present), keep the existing auth gate and response contract, and continue enforcing the current limit cap. This prevents UI breakage when search UIs pass different query key names. Do not alter endpoint path, auth helper, or response JSON shape.</action>
  <verify>Run `npm run typecheck`.</verify>
  <done>`/api/orders/search` returns expected results for either `?search=...` or `?q=...` while preserving current auth/error behavior.</done>
</task>

<task type="auto">
  <name>Task 3: Add route regression tests for auth and query compatibility</name>
  <files>tests/payments/orders-search-route.test.ts</files>
  <action>Create focused Vitest coverage for `app/api/orders/search/route.ts` with mocked `requireApiUser` and `convexQuery`. Cover: (1) unauthenticated request returns shared unauthorized payload, (2) `search` query is passed through to `api.orders.searchOrders`, (3) `q` query is accepted and mapped to the same Convex search argument. Keep the test narrow to route behavior and avoid real Convex calls.</action>
  <verify>Run `npm test -- tests/payments/orders-search-route.test.ts`.</verify>
  <done>The test suite protects the order-search route contract used by manual payment entry, including both query-key variants.</done>
</task>

</tasks>

<verification>
- `npm run typecheck`
- `npm test -- tests/payments/orders-search-route.test.ts`
- In `/dashboard/reconciliation`, open "Add Payment", type at least 3 characters in "Select Order", confirm dropdown shows loading/result/empty states, select an order, submit a payment, and confirm the request succeeds without an "Please select an order" validation error.
</verification>

<success_criteria>

- Manual payment entry exposes a usable search dropdown for order selection.
- Selected dropdown orders map to the exact `orderId` used in payment submission.
- Order search API calls from manual entry succeed regardless of `search` vs `q` query key usage.
- Regression tests cover auth gate and query parsing behavior for `/api/orders/search`.
  </success_criteria>

<output>
After completion, create `.planning/quick/260326-hgy-fix-the-manual-payment-entry-select-orde/260326-hgy-SUMMARY.md`
</output>
