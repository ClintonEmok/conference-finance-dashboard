---
phase: 26-order-ops-refresh
plan: 02
type: execute
wave: 2
depends_on:
  - 26-order-ops-refresh-01
files_modified:
  - app/dashboard/manage-orders/page.tsx
  - app/dashboard/manage-orders/[orderId]/page.tsx
  - app/dashboard/orders/page.tsx
  - app/dashboard/orders/[orderId]/page.tsx
  - app/dashboard/dashboard-shell.tsx
autonomous: true
must_haves:
  truths:
    - "Admins can open /dashboard/manage-orders and browse the ledger without using the legacy orders route."
    - "Legacy /dashboard/orders links continue to work during the cutover."
    - "Operators can edit order and attendee details from the new management surface."
  artifacts:
    - path: "app/dashboard/manage-orders/page.tsx"
      provides: "Dedicated manage-orders list view"
    - path: "app/dashboard/manage-orders/[orderId]/page.tsx"
      provides: "Dedicated manage-orders detail/edit view"
    - path: "app/dashboard/orders/page.tsx"
      provides: "Compatibility redirect or alias for the old orders route"
    - path: "app/dashboard/orders/[orderId]/page.tsx"
      provides: "Compatibility redirect or alias for the old order detail route"
    - path: "app/dashboard/dashboard-shell.tsx"
      provides: "Primary nav entry to manage-orders"
  key_links:
    - from: "app/dashboard/manage-orders/page.tsx"
      to: "/api/dashboard/orders"
      via: "fetch with filters/pagination"
      pattern: "fetch.*api/dashboard/orders"
    - from: "app/dashboard/manage-orders/[orderId]/page.tsx"
      to: "/api/dashboard/orders/[orderId]"
      via: "PATCH + detail refresh"
      pattern: "api/dashboard/orders/.+PATCH"
    - from: "app/dashboard/dashboard-shell.tsx"
      to: "/dashboard/manage-orders"
      via: "navigation link"
      pattern: "/dashboard/manage-orders"
---

<objective>
Create the new operator-facing manage-orders route.

Purpose: give admins a dedicated place to inspect and manage orders while keeping the old route safe during the cutover.
Output: a primary /dashboard/manage-orders flow, legacy redirects, and nav that points users to the new route.
</objective>

<ia>
- Primary route: `/dashboard/manage-orders`.
- Compatibility only: `/dashboard/orders` and `/dashboard/orders/[orderId]`.
- The manage-orders page owns order detail, edit, and action entry points.
- The legacy orders route may alias or redirect, but it must not become a second management vocabulary.
- Keep breadcrumbs and titles anchored to the manage-orders hub so operators always know where they are.
</ia>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/26-order-ops-refresh/26-order-ops-refresh-IA.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@app/dashboard/orders/page.tsx
@app/dashboard/orders/[orderId]/page.tsx
@app/dashboard/dashboard-shell.tsx
@app/api/dashboard/orders/route.ts
@app/api/dashboard/orders/[orderId]/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move the order ledger into a dedicated manage-orders route</name>
  <files>app/dashboard/manage-orders/page.tsx, app/dashboard/manage-orders/[orderId]/page.tsx, app/dashboard/orders/page.tsx, app/dashboard/orders/[orderId]/page.tsx, app/dashboard/dashboard-shell.tsx</files>
  <action>Copy the current order list/detail experience into `/dashboard/manage-orders`, keep `/dashboard/orders` as a compatibility redirect or alias, and update shell nav/cross-links so the new route is the primary operator entry point. Preserve filters, pagination, and loading/error states.</action>
  <verify>Run `npm run typecheck`, `npm test -- tests/payments/orders-search-route.test.ts`, and manually confirm `/dashboard/orders` lands on `/dashboard/manage-orders`.</verify>
  <done>Order management is reachable from the new route without breaking old links.</done>
</task>

<task type="auto">
  <name>Task 2: Add inline order and attendee edit workflows</name>
  <files>app/dashboard/manage-orders/[orderId]/page.tsx, app/api/dashboard/orders/[orderId]/route.ts, app/api/dashboard/attendees/[attendeeId]/route.ts</files>
  <action>Add edit forms and buttons for the supported order and attendee fields, submit PATCH requests, refresh the detail view after save, and surface validation errors inline. Keep destructive actions gated behind the existing archive/cancel rules.</action>
  <verify>Run `npm test -- tests/attendees/attendee-detail-route.test.ts` and manually verify save/reload on `/dashboard/manage-orders/{orderId}`.</verify>
  <done>Operators can edit order and attendee details from the new management surface.</done>
</task>

</tasks>

<verification>
1. New manage-orders route loads and paginates correctly.
2. Old orders URLs continue to resolve during the cutover.
3. Inline edits persist and re-render without a full page failure.
</verification>

<success_criteria>
1. /dashboard/manage-orders is the primary order-management entry point.
2. Legacy /dashboard/orders routes remain safe compatibility aliases.
3. Order and attendee edits work end-to-end from the manage-orders surface.
</success_criteria>

<output>
After completion, create `.planning/phases/26-order-ops-refresh/26-order-ops-refresh-02-SUMMARY.md`
</output>
