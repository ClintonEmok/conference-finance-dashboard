---
phase: quick-260910-tum-implement-crud-gaps-for-payments-and-att
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/payments.ts
  - convex/attendees.ts
  - app/api/payments/[id]/route.ts
  - app/api/dashboard/attendees/[attendeeId]/remove/route.ts
  - components/payments/payment-list.tsx
  - components/dashboard/attendee-order-editor.tsx
  - components/dashboard/orders/panels/attendees-panel.tsx
  - app/dashboard/payments/page.tsx
  - convex/attendee-order-mutations.handlers.test.ts
  - tests/payments/payment-delete-route.test.ts
  - tests/attendees/attendee-remove-route.test.ts
autonomous: true
must_haves:
  truths:
    - "Operators can delete an unassigned manually-created (bank_transfer or cash) payment from the payment history table and see the row removed after refresh."
    - "Dashboard operators can remove a single attendee from an order while retaining at least one attendee; the order amount due is recomputed exactly through the canonical server-side amount loader."
    - "Buyers on the public manage-booking page can remove one of their attendees (when at least one remains) after verifying ownership; the booking summary, ticket quantities, accommodation lines, and amount due all reflect the removal."
  artifacts:
    - path: "convex/payments.ts"
      provides: "Authenticated deletePayment mutation restricted to unassigned manual cash/bank_transfer payments"
    - path: "app/api/payments/[id]/route.ts"
      provides: "Protected DELETE /api/payments/[id] endpoint with 404/400/500 handling"
    - path: "convex/attendees.ts"
      provides: "Authenticated removeAttendeeFromOrder mutation that deletes all attendee-scoped rows, decrements ticket inventory, and recomputes both orders via loadOrderAmountDueBreakdowns"
    - path: "app/api/dashboard/attendees/[attendeeId]/remove/route.ts"
      provides: "Protected DELETE endpoint for dashboard attendee removal"
    - path: "components/payments/payment-list.tsx"
      provides: "Delete button + confirm/loading/error states on eligible payment rows"
    - path: "components/dashboard/attendee-order-editor.tsx"
      provides: "Remove attendee action + confirmation in the dashboard editor"
    - path: "components/dashboard/orders/panels/attendees-panel.tsx"
      provides: "Remove attendee button on each attendee card with refresh on save"
    - path: "convex/attendee-order-mutations.handlers.test.ts"
      provides: "Convex tests for removal success, minimum-attendee guard, inventory decrement, and exact amount recompute"
    - path: "tests/payments/payment-delete-route.test.ts"
      provides: "Route regression tests for DELETE /api/payments/[id]"
    - path: "tests/attendees/attendee-remove-route.test.ts"
      provides: "Route regression tests for dashboard attendee removal"
  key_links:
    - from: "components/payments/payment-list.tsx"
      to: "/api/payments/[id]"
      via: "DELETE fetch"
      pattern: "DELETE"
    - from: "components/dashboard/attendee-order-editor.tsx"
      to: "/api/dashboard/attendees/[attendeeId]/remove"
      via: "DELETE fetch"
      pattern: "remove"
    - from: "convex/attendees.ts"
      to: "convex/finance.ts:loadOrderAmountDueBreakdowns"
      via: "recompute after removal"
      pattern: "loadOrderAmountDueBreakdowns"
---

<objective>
Close the CRUD gaps for manual payments and order attendees.

Purpose: Finance operators currently cannot delete mistakenly recorded unassigned manual payments, and no one can remove an attendee who is no longer coming from either the dashboard or the buyer-facing manage-booking page.

Output: (1) authenticated deletion for unassigned manual cash/bank_transfer payments with a working dashboard row action and route tests; (2) authenticated dashboard attendee removal and ownership-verified public manage-booking attendee removal, both retaining at least one attendee, deleting all attendee-scoped rows, decrementing ticket inventory, and recomputing the order amount due exactly through the canonical loader.
</objective>

<execution_context>
@/Users/clintonemok/.config/opencode/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/.planning/STATE.md
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/AGENTS.md
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/convex/_generated/ai/guidelines.md
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/convex/payments.ts
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/convex/attendees.ts
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/components/payments/payment-list.tsx
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/components/dashboard/attendee-order-editor.tsx
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/components/dashboard/orders/panels/attendees-panel.tsx
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/convex/attendee-order-mutations.handlers.test.ts
@/Users/clintonemok/.local/share/opencode/worktree/bed3edb6bdc4e083b5af231067d4132a2d3314d2/cleanup/tests/orders/order-detail-route.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend mutations and API routes for payment deletion and attendee removal</name>
  <files>convex/payments.ts, convex/attendees.ts, app/api/payments/[id]/route.ts, app/api/dashboard/attendees/[attendeeId]/remove/route.ts</files>
  <action>Add `deletePayment` mutation to convex/payments.ts guarded by requireIdentity: only allow deletion when the payment exists, its status is exactly "unassigned", and its source is "cash" or "bank_transfer" (never tikkie-synced or assigned/donation/ambiguous rows). Add `removeAttendeeFromOrder` to convex/attendees.ts guarded by requireIdentity: resolve the attendee, verify at least one other attendee remains on the order, then within the same transaction delete the canonical orderAttendees row, any ticketTailorAttendees extension rows (index attendeeId), the attendee's orderTicketSelections row, accommodation selection + option child rows, orderAssignments rows, and attendeeFamilyMembers rows; decrement the affected ticketTypes.soldCount safely (min 0); recompute the order amount due via loadOrderAmountDueBreakdowns and return { attendeeId, orderId, remainingAttendees, amountDueMinor }. Add DELETE /api/payments/[id] with requireApiUser + convexMutation(api.payments.deletePayment) and 404/400/500 mapping. Add DELETE /api/dashboard/attendees/[attendeeId]/remove with requireApiUser + convexMutation(api.attendees.removeAttendeeFromOrder) following the existing move-route style (unknown-field rejection not needed for DELETE).</action>
  <verify>Run `npm run typecheck`.</verify>
  <done>Convex mutations and both protected API DELETE routes exist with correct auth, guards, and error mapping; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 2: Dashboard UI for payment deletion and attendee removal</name>
  <files>components/payments/payment-list.tsx, app/dashboard/payments/page.tsx, components/dashboard/attendee-order-editor.tsx, components/dashboard/orders/panels/attendees-panel.tsx</files>
  <action>In payment-list.tsx add an `onDelete` prop and a per-row delete button (with window.confirm or a small inline confirm) shown only when status === "unassigned" and source is "cash" or "bank_transfer"; wire loading/error and call the prop with the payment. In app/dashboard/payments/page.tsx pass onDelete that fetches DELETE /api/payments/[id], shows a toast on success/failure, and bumps refreshKey. In attendees-panel.tsx add a destructive "Remove" button per attendee card that opens a confirmation dialog and, on confirm, fetches DELETE /api/dashboard/attendees/[attendeeId]/remove then calls onSaved() (which reloads). In attendee-order-editor.tsx add a "Remove attendee" section/button with a confirmation dialog that performs the same DELETE fetch and then calls onSaved(); keep the existing move/edit behavior intact.</action>
  <verify>Run `npm run typecheck`.</verify>
  <done>Dashboard payment history shows a working delete action for eligible rows; dashboard order attendees can be removed with a confirmation dialog; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 3: Tests for payment delete and attendee remove</name>
  <files>tests/payments/payment-delete-route.test.ts, tests/attendees/attendee-remove-route.test.ts, convex/attendee-order-mutations.handlers.test.ts</files>
  <action>Create tests/payments/payment-delete-route.test.ts mocking requireApiUser + convexMutation: unauthenticated returns 401; authenticated returns ok and calls api.payments.deletePayment; mutation "not found"/guard errors map to 404/400. Create tests/attendees/attendee-remove-route.test.ts similarly for the remove route (401, ok + mutation args, not-found → 404). In convex/attendee-order-mutations.handlers.test.ts add cases for removeAttendeeFromOrder: rejects anonymous callers; removes a middle attendee and recomputes amountDueMinor exactly; rejects removal when only one attendee remains; decrements ticketTypes.soldCount; deletes extension/accommodation/assignment/family rows.</action>
  <verify>Run `npm test -- tests/payments/payment-delete-route.test.ts tests/attendees/attendee-remove-route.test.ts convex/attendee-order-mutations.handlers.test.ts`.</verify>
  <done>Route and Convex tests cover auth, guards, row cleanup, inventory decrement, and exact amount recompute; targeted suites pass.</done>
</task>

</tasks>

<verification>
- `npm run typecheck`
- `npm test -- tests/payments/payment-delete-route.test.ts tests/attendees/attendee-remove-route.test.ts convex/attendee-order-mutations.handlers.test.ts`
- `npm test` (full suite) and `npm run build` (production build)
- After Convex changes: `npx convex codegen` and `npx convex dev --once`
- Do NOT modify or automate production data (legacy backfill / broadcasts remain operator-gated)
</verification>

<success_criteria>

- Unassigned manual cash/bank_transfer payments are deletable from the dashboard with confirmation and refresh.
- Tikkie-synced and assigned/donation payments remain protected from deletion.
- Dashboard operators can remove an attendee while keeping at least one; the order amount due is recomputed exactly via the canonical loader.
- Attendee removal deletes all attendee-scoped records and safely decrements ticket inventory.
- Targeted/full tests, typecheck, and production build are green; Convex codegen + dev pass after changes.
  </success_criteria>

<output>
After completion, create `.planning/quick/260910-tum-implement-crud-gaps-for-payments-and-att/260910-tum-SUMMARY.md`
</output>