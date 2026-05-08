---
phase: quick-260326-hit-the-open-atteendee-followup-should-open-
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - app/dashboard/reconciliation/page.tsx
  - components/dashboard/order-attendee-breakdown.tsx
  - lib/domain/finance/reconciliation-follow-up.ts
  - tests/reconciliation/reconciliation-follow-up.test.ts
autonomous: true
must_haves:
  truths:
    - "Clicking 'Open attendee follow-up' from reconciliation opens an attendee detail route (`/dashboard/attendees/[attendeeId]`) instead of the attendee list filter page when attendee data is available."
    - "Reconciliation context (order/event/source) is still preserved in query params so operators can navigate back with context."
    - "If no attendee id can be resolved for an order, the action safely falls back to the existing attendees list filter URL instead of breaking navigation."
  artifacts:
    - path: "app/dashboard/reconciliation/page.tsx"
      provides: "Desktop and mobile 'Open attendee follow-up' actions built from attendee-detail-aware href logic"
    - path: "components/dashboard/order-attendee-breakdown.tsx"
      provides: "Order attendee breakdown emits a stable attendee id candidate usable by parent reconciliation CTA"
    - path: "lib/domain/finance/reconciliation-follow-up.ts"
      provides: "Single source helper for follow-up href generation with detail-first and fallback behavior"
    - path: "tests/reconciliation/reconciliation-follow-up.test.ts"
      provides: "Regression coverage for detail-first routing and fallback list routing"
  key_links:
    - from: "components/dashboard/order-attendee-breakdown.tsx"
      to: "app/dashboard/reconciliation/page.tsx"
      via: "callback prop carrying resolved attendee id per order row"
      pattern: "onResolvedAttendeeId"
    - from: "app/dashboard/reconciliation/page.tsx"
      to: "app/dashboard/attendees/[attendeeId]/page.tsx"
      via: "detail-first href builder"
      pattern: "`/dashboard/attendees/${attendeeId}`"
    - from: "app/dashboard/reconciliation/page.tsx"
      to: "app/dashboard/attendees/page.tsx"
      via: "fallback href when attendee id missing"
      pattern: "`/dashboard/attendees?search="
---

<objective>
Fix reconciliation follow-up navigation so the row action opens attendee detail directly, not the attendee list with pre-applied filters.

Purpose: Reduce operator friction by taking users straight to the actionable attendee detail screen from finance follow-up.
Output: Reconciliation row CTAs resolve detail-first attendee URLs with safe fallback behavior and regression tests for link construction.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@app/dashboard/reconciliation/page.tsx
@components/dashboard/order-attendee-breakdown.tsx
@app/dashboard/attendees/[attendeeId]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add detail-first reconciliation follow-up href builder with fallback</name>
  <files>lib/domain/finance/reconciliation-follow-up.ts, tests/reconciliation/reconciliation-follow-up.test.ts</files>
  <action>Create a small pure helper that builds the reconciliation follow-up URL from `{ attendeeId, providerOrderId, providerEventId }`. Rule set: when `attendeeId` is present, return `/dashboard/attendees/{attendeeId}` with reconciliation context query params (`source=reconciliation`, `orderId`, `eventId`, plus `search` if needed for back-navigation continuity); when absent, return the existing attendees list filter URL (`/dashboard/attendees?search=...&eventId=...&source=reconciliation&orderId=...`). Add a focused Vitest file that covers both branches and protects against regressions in query param wiring. Keep this helper framework-agnostic and string-based (no React imports).</action>
  <verify>Run `npm test -- tests/reconciliation/reconciliation-follow-up.test.ts`.</verify>
  <done>Href generation is centralized and tested for detail-first and fallback behavior.</done>
</task>

<task type="auto">
  <name>Task 2: Wire reconciliation row actions to resolved attendee detail targets</name>
  <files>components/dashboard/order-attendee-breakdown.tsx, app/dashboard/reconciliation/page.tsx</files>
  <action>Update `OrderAttendeeBreakdown` to optionally emit a resolved attendee id for its order (use stable attendee `id` from the loaded order attendees payload, preferring the single attendee case and a deterministic first attendee for multi-attendee orders). In `reconciliation/page.tsx`, store resolved attendee ids keyed by `providerOrderId`, then use the new helper to build both desktop and mobile "Open attendee follow-up" hrefs. Preserve current button copy and styling, keep `OrderAttendeeBreakdown` behavior unchanged visually, and do not remove existing fallback navigation when attendee data is unavailable or still loading.</action>
  <verify>Run `npm run typecheck`.</verify>
  <done>Reconciliation CTA links navigate to attendee detail pages when possible, while preserving a non-breaking fallback to filtered attendees list URLs.</done>
</task>

</tasks>

<verification>
- `npm test -- tests/reconciliation/reconciliation-follow-up.test.ts`
- `npm run typecheck`
- Manual check: open `/dashboard/reconciliation`, click "Open attendee follow-up" for a row with attendee data, and confirm it lands on `/dashboard/attendees/{attendeeId}` (not `/dashboard/attendees?...`).
</verification>

<success_criteria>

- Reconciliation row actions no longer default to `/dashboard/attendees?...` when attendee id is available.
- Navigation reaches attendee detail route directly from both desktop and mobile reconciliation layouts.
- Existing reconciliation context is retained in query params and fallback list behavior still works when no attendee id is resolvable.
  </success_criteria>

<output>
After completion, create `.planning/quick/260326-hit-the-open-atteendee-followup-should-open-/260326-hit-SUMMARY.md`
</output>
