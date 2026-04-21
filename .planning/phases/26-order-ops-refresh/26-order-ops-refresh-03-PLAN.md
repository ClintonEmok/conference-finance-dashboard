---
phase: 26-order-ops-refresh
plan: 03
type: execute
wave: 3
depends_on:
  - 26-order-ops-refresh-01
  - 26-order-ops-refresh-02
files_modified:
  - app/dashboard/page.tsx
  - app/dashboard/financial/page.tsx
  - app/dashboard/events/[slug]/overview/page.tsx
  - app/dashboard/events/[slug]/page.tsx
autonomous: true
must_haves:
  truths:
    - "The dashboard home shows global ops health and directs users to the right next action."
    - "Each event has a dedicated overview page with event-specific totals and drilldowns."
    - "Terminology is consistent across the overview surfaces."
  artifacts:
    - path: "app/dashboard/page.tsx"
      provides: "Global overview landing page"
    - path: "app/dashboard/financial/page.tsx"
      provides: "Global finance/ops summary surface"
    - path: "app/dashboard/events/[slug]/overview/page.tsx"
      provides: "Per-event overview page"
    - path: "app/dashboard/events/[slug]/page.tsx"
      provides: "Event detail page that links to the new overview"
  key_links:
    - from: "app/dashboard/page.tsx"
      to: "/api/dashboard/revenue"
      via: "fetch for global KPI cards"
      pattern: "api/dashboard/revenue"
    - from: "app/dashboard/events/[slug]/overview/page.tsx"
      to: "/api/dashboard/orders"
      via: "event-scoped fetch for drilldowns"
      pattern: "eventId=.*api/dashboard/orders"
    - from: "app/dashboard/events/[slug]/page.tsx"
      to: "/dashboard/manage-orders"
      via: "overview/manage-orders shortcut"
      pattern: "manage-orders"
---

<objective>
Refresh the dashboard into clearer global and per-event overview surfaces.

Purpose: make status, revenue, and event drilldowns easier to scan while aligning the copy with the new order-management language.
Output: a sharper global overview, a dedicated per-event overview page, and consistent terminology on the touched dashboard surfaces.
</objective>

<ia>
- Primary global overview: `/dashboard`.
- Secondary drilldown: `/dashboard/financial`.
- Event hub: `/dashboard/events/[slug]`.
- Event-scoped overview: `/dashboard/events/[slug]/overview`.
- Default grouping on overview surfaces is by order, with family or attendee grouping available where it reduces noise.
- Use `contact person` in headings, tabs, helper copy, and CTA labels on every touched surface.
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
@app/dashboard/page.tsx
@app/dashboard/financial/page.tsx
@app/dashboard/events/[slug]/page.tsx
@app/api/dashboard/revenue/route.ts
@app/api/dashboard/orders/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Refresh the global dashboard into an explicit overview surface</name>
  <files>app/dashboard/page.tsx, app/dashboard/financial/page.tsx</files>
  <action>Reframe the home/financial landing copy around the new terminology, surface the global KPIs needed for ops, and make the primary actions point to manage-orders and the event overview surfaces. Keep data loading bounded and existing API contracts intact.</action>
  <verify>Run `npm run typecheck`, `npm test -- tests/finance/order-ledger.test.ts tests/finance/attendees.test.ts`, and manually check `/dashboard`.</verify>
  <done>The global overview communicates current ops status at a glance.</done>
</task>

<task type="auto">
  <name>Task 2: Add the per-event overview route and align terminology</name>
  <files>app/dashboard/events/[slug]/overview/page.tsx, app/dashboard/events/[slug]/page.tsx</files>
  <action>Create a dedicated per-event overview page with event-scoped totals, order-status breakdowns, attendee counts, and shortcuts into manage-orders/edit flows. Update the existing event detail page to expose the new overview route and use the new terminology consistently in tabs, headings, and helper copy.</action>
  <verify>Run `npm run typecheck`, `npm test -- tests/finance/order-ledger.test.ts tests/finance/attendees.test.ts`, and manually check `/dashboard/events/{slug}/overview`.</verify>
  <done>Each event has a first-class overview page with the new language and drilldowns.</done>
</task>

</tasks>

<verification>
1. Global dashboard metrics still load from the existing API routes.
2. Per-event overview pages are reachable and event-scoped.
3. User-facing copy across overview surfaces uses the same terminology.</verification>

<success_criteria>
1. The home dashboard is clearly an overview, not a generic landing page.
2. Every event has an event-scoped overview page.
3. The new terminology is consistent across the touched dashboard surfaces.
</success_criteria>

<output>
After completion, create `.planning/phases/26-order-ops-refresh/26-order-ops-refresh-03-SUMMARY.md`
</output>
