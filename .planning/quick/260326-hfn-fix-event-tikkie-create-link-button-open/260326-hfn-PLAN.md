---
phase: quick-260326-hfn-fix-event-tikkie-create-link-button-open
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - components/dashboard/event-tikkie-section.tsx
  - app/api/dashboard/tikkie-event-links/route.ts
  - tests/tikkie/tikkie-event-links-route.test.ts
autonomous: true
must_haves:
  truths:
    - "Clicking 'Create Tikkie link' opens a modal instead of immediately creating a link."
    - "Operator can enter a custom amount in euros and create an event link using that amount."
    - "Entering 0 is accepted and creates an open-amount event Tikkie link."
  artifacts:
    - path: "components/dashboard/event-tikkie-section.tsx"
      provides: "Create-link modal UI and submit flow with amount input mapped to POST payload"
    - path: "app/api/dashboard/tikkie-event-links/route.ts"
      provides: "POST input guard that explicitly accepts 0 and rejects invalid/negative amountMinor values"
    - path: "tests/tikkie/tikkie-event-links-route.test.ts"
      provides: "Route-level regression coverage for amountMinor=0 acceptance and invalid amount rejection"
  key_links:
    - from: "components/dashboard/event-tikkie-section.tsx"
      to: "app/api/dashboard/tikkie-event-links/route.ts"
      via: "POST /api/dashboard/tikkie-event-links with eventId/providerEventId/amountMinor"
      pattern: "fetch\(\"/api/dashboard/tikkie-event-links\""
    - from: "create-link modal amount input"
      to: "POST body amountMinor"
      via: "EUR string parsed to cents integer, preserving 0"
      pattern: "amountMinor"
---

<objective>
Fix the event-level Tikkie create-link flow so the button opens a modal that lets operators enter the amount before creating the link.

Purpose: Prevent accidental immediate link creation and support explicit open-amount links when the operator enters 0.
Output: Financial page create-link CTA opens a modal, submits user-entered amount to the event-link POST route, and route/tests confirm 0 is valid.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@convex/_generated/ai/guidelines.md
@components/dashboard/event-tikkie-section.tsx
@app/api/dashboard/tikkie-event-links/route.ts
@tests/attendees/attendee-detail-route.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace direct create action with amount-entry modal in EventTikkieSection</name>
  <files>components/dashboard/event-tikkie-section.tsx</files>
  <action>Change the current Create button behavior so it opens a modal/dialog state (`isCreateModalOpen`) instead of calling `handleCreateLink` directly. Add an amount input in euros (string UI state), helper text that `0` means open amount, and submit/cancel actions. On submit, parse euros to integer cents (`amountMinor`), allow `0`, reject negative or non-numeric values with inline error, and POST `{ eventId, providerEventId, amountMinor }` to `/api/dashboard/tikkie-event-links`. Keep existing refetch/error handling after success, close/reset modal on success, and preserve the existing event picker/assignment behavior unchanged.</action>
  <verify>Run `npm run typecheck`.</verify>
  <done>Clicking Create Tikkie link opens a modal; entering `0` successfully creates an event link request with `amountMinor: 0`; entering a positive amount submits the matching cent value.</done>
</task>

<task type="auto">
  <name>Task 2: Add POST amount validation contract and regression test for zero/open amount</name>
  <files>app/api/dashboard/tikkie-event-links/route.ts, tests/tikkie/tikkie-event-links-route.test.ts</files>
  <action>In the event-link POST route, add a small parser/guard for `amountMinor` that accepts `undefined` or integer values `>= 0`, explicitly preserving `0`, and returns a 400 BAD_REQUEST for negative/NaN/non-integer values. Then add `tests/tikkie/tikkie-event-links-route.test.ts` that mocks auth + domain create function and verifies: (1) authenticated POST with `amountMinor: 0` reaches `createEventTikkieLink` and returns success, (2) negative or invalid amount returns 400 with BAD_REQUEST contract, and (3) unauthenticated response shape remains the shared unauthorized payload.</action>
  <verify>Run `npm test -- tests/tikkie/tikkie-event-links-route.test.ts`.</verify>
  <done>Route contract is explicit that open-amount links (`amountMinor: 0`) are valid, and regression tests protect against reintroducing a positive-only amount requirement.</done>
</task>

</tasks>

<verification>
- `npm run typecheck`
- `npm test -- tests/tikkie/tikkie-event-links-route.test.ts`
- Manual: open `/dashboard/financial`, click **Create Tikkie link**, verify modal opens, submit `0`, and confirm link creation succeeds without validation rejection.
</verification>

<success_criteria>

- Create-link CTA no longer creates immediately; it opens an amount-entry modal.
- User-entered amount is submitted to event-link POST as `amountMinor` in cents.
- Entering `0` is supported as open amount and does not fail validation.
  </success_criteria>

<output>
After completion, create `.planning/quick/260326-hfn-fix-event-tikkie-create-link-button-open/260326-hfn-SUMMARY.md`
</output>
