---
phase: 26-order-ops-refresh
plan: 06
type: execute
wave: 3
depends_on:
  - 26-order-ops-refresh-05
files_modified:
  - lib/domain/finance/attendee-detail.ts
  - lib/domain/finance/tikkie-links.ts
  - tests/attendees/attendee-detail-domain.test.ts
  - tests/finance/tikkie-links.test.ts
autonomous: true
gap_closure: true
must_haves:
  truths:
    - "Attendee detail and Tikkie link lookups use canonical order ids on the runtime path."
    - "Provider identifiers remain available only through explicit boundary calls or legacy compatibility."
    - "The attendee detail surface still shows payment history and Tikkie links after the contract change."
  artifacts:
    - path: "lib/domain/finance/attendee-detail.ts"
      provides: "Canonical attendee payment-history and balance computation"
    - path: "lib/domain/finance/tikkie-links.ts"
      provides: "Canonical Tikkie link resolution with explicit provider boundary"
    - path: "tests/attendees/attendee-detail-domain.test.ts"
      provides: "Regression coverage for canonical attendee detail lookup"
    - path: "tests/finance/tikkie-links.test.ts"
      provides: "Regression coverage for canonical Tikkie link resolution"
  key_links:
    - from: "lib/domain/finance/attendee-detail.ts"
      to: "lib/domain/finance/matched-payments.ts"
      via: "canonical order-id matching"
      pattern: "buildMatchedTotalsBy.*OrderId"
    - from: "lib/domain/finance/tikkie-links.ts"
      to: "convex.orders.getOrderById"
      via: "canonical order lookup before any provider fallback"
      pattern: "api\\.orders\\.getOrderById"
    - from: "tests/finance/tikkie-links.test.ts"
      to: "lib/domain/finance/tikkie-links.ts"
      via: "canonical and legacy link resolution cases"
      pattern: "orderId|providerOrderId"
---

<objective>
Remove the last ambiguous provider-id fallbacks from the attendee and Tikkie-facing runtime helpers.

Purpose: make the runtime contract unambiguous while preserving the ability to resolve legacy records through an explicit boundary.
Output: attendee detail and Tikkie link flows that prefer canonical order ids first.
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
@lib/domain/finance/attendee-detail.ts
@lib/domain/finance/tikkie-links.ts
@tests/attendees/attendee-detail-domain.test.ts
@tests/finance/tikkie-links.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite attendee detail to use the canonical order id path</name>
  <files>lib/domain/finance/attendee-detail.ts, tests/attendees/attendee-detail-domain.test.ts</files>
  <read_first>lib/domain/finance/attendee-detail.ts, lib/domain/finance/matched-payments.ts, tests/attendees/attendee-detail-domain.test.ts, convex/orders.ts</read_first>
  <action>Change `getAttendeeDetail` so payment-history assignment, list-endpoint selection, and balance computation resolve from canonical `order.id` first. Keep any remaining provider lookup behind the explicit boundary helper only for legacy compatibility, remove the per-call provider-first cache from the runtime path, and preserve the existing payment-history ordering and null handling.</action>
  <acceptance_criteria>
    - `lib/domain/finance/attendee-detail.ts` no longer uses `order.providerOrderId ?? order.id` for payment matching.
    - `tests/attendees/attendee-detail-domain.test.ts` still passes when `providerOrderId` is null and the list endpoint uses `orderId=`.
    - The attendee detail payment history still renders assigned payments and Tikkie link events.
  </acceptance_criteria>
  <verify>Run `npm test -- tests/attendees/attendee-detail-domain.test.ts` and `npm run typecheck`.</verify>
  <done>The attendee detail surface matches payments by canonical order id only.</done>
</task>

<task type="auto">
  <name>Task 2: Make Tikkie link resolution canonical-first</name>
  <files>lib/domain/finance/tikkie-links.ts, tests/finance/tikkie-links.test.ts</files>
  <read_first>lib/domain/finance/tikkie-links.ts, convex/orders.ts, tests/finance/tikkie-links.test.ts</read_first>
  <action>Refactor `listTikkiePaymentLinksByOrder` and `createTikkiePaymentLink` so `orderId` is the primary contract, `providerOrderId` is resolved only through the boundary helper, and the runtime path does not prefer provider ids when canonical ids are already available. Add a focused test suite for canonical lookup plus legacy compatibility.</action>
  <acceptance_criteria>
    - `lib/domain/finance/tikkie-links.ts` resolves canonical `orderId` before any provider fallback.
    - `tests/finance/tikkie-links.test.ts` covers canonical `orderId` lookup and legacy provider compatibility.
    - `lib/domain/finance/tikkie-links.ts` still returns the same Tikkie DTO shape after the refactor.
  </acceptance_criteria>
  <verify>Run `npm test -- tests/finance/tikkie-links.test.ts` and `npm run typecheck`.</verify>
  <done>Tikkie link lookup and creation no longer rely on ambiguous provider-first joins.</done>
</task>

</tasks>

<verification>
1. Attendee detail resolves payment history from canonical order ids.
2. Tikkie link lookup prefers canonical order ids and keeps legacy compatibility isolated.
3. The attendee detail surface still shows the same business information after the contract change.
</verification>

<success_criteria>
1. No ambiguous provider-first fallback remains in attendee or Tikkie runtime helpers.
2. Provider identifiers are boundary-only, not runtime truth.
3. Targeted tests and typecheck pass.
</success_criteria>

<output>
After completion, create `.planning/phases/26-order-ops-refresh/26-order-ops-refresh-06-SUMMARY.md`
</output>
