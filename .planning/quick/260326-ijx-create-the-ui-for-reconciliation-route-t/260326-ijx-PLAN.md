---
phase: quick
plan: 260326-ijx
type: execute
wave: 1
depends_on: []
files_modified:
  - app/dashboard/reconciliation/payments/page.tsx
autonomous: true
user_setup: []
must_haves:
  truths:
    - "Operator can view all unassigned payments on a dedicated route"
    - "Operator can search and filter unassigned payments by source or date"
    - "Operator can attach each unassigned payment to a specific order"
    - "After assignment, payment status updates and disappears from unassigned view"
  artifacts:
    - path: app/dashboard/reconciliation/payments/page.tsx
      provides: "Dedicated payment assignment page"
      min_lines: 150
  key_links:
    - from: app/dashboard/reconciliation/payments/page.tsx
      to: /api/payments
      via: fetch with filters
    - from: app/dashboard/reconciliation/payments/page.tsx
      to: /api/payments/[id]/assign
      via: PATCH mutation
    - from: app/dashboard/reconciliation/payments/page.tsx
      to: /api/orders/search
      via: order search dropdown
---

<objective>
Create a dedicated route for assigning unassigned payments to orders at `/dashboard/reconciliation/payments`.

Purpose: Provide a focused UI for operators to quickly attach unassigned payments (from Tikkie, bank transfer, or cash) to specific orders, reducing reconciliation friction.

Output: New page at `app/dashboard/reconciliation/payments/page.tsx` with unassigned payment list, search/filter controls, and inline assignment capability.
</objective>

<context>
@.planning/STATE.md
@app/dashboard/reconciliation/page.tsx (existing reconciliation with payment section)
@components/payments/assign-dialog.tsx (existing assignment dialog)
@components/payments/payment-list.tsx (existing payment list component)
</context>

<tasks>

<task type="auto">
  <name>Create dedicated reconciliation payments page</name>
  <files>app/dashboard/reconciliation/payments/page.tsx</files>
  <action>
Create `app/dashboard/reconciliation/payments/page.tsx`:

1. Page header with title "Unassigned Payments" and description explaining purpose
2. Filter controls:
   - Source filter: All / Tikkie / Bank Transfer / Cash
   - Date range: from/to inputs (last 30 days default)
3. Unassigned payments table showing: Date, Source, Payer, Amount, Actions
4. "Assign" button per row that opens AssignDialog
5. After successful assignment, show toast notification and remove from list

Reuse existing components:

- Import and use `AssignDialog` from `@/components/payments/assign-dialog`
- Reuse payment loading logic from `PaymentList` but filter to `status=unassigned`
- Reuse order search from `/api/orders/search`

Style: Match existing dashboard patterns (shadcn components, dark theme from dashboard-shell).
</action>
<verify>

- File exists: `ls app/dashboard/reconciliation/payments/page.tsx`
- Typecheck passes: `npm run typecheck`
- Route accessible: returns valid page component
  </verify>
  <done>
- Dedicated page at `/dashboard/reconciliation/payments` shows only unassigned payments
- Each payment row has functional "Assign" button
- Assignment dialog searches orders via `/api/orders/search`
- Successful assignment updates payment status and refreshes list
  </done>
  </task>

</tasks>

<verification>
- Check: `grep -q "reconciliation/payments" app/dashboard/dashboard-shell.tsx` — add navigation item if needed
- Check: `npm run typecheck` passes
- Manual: Visit `/dashboard/reconciliation/payments` and verify unassigned payments display with assign capability
</verification>

<success_criteria>

- New route `/dashboard/reconciliation/payments` exists and loads
- Unassigned payments display with source, payer name, amount, date
- Filter by source and date works
- Assign button opens dialog, allows order search, and completes assignment
- After assignment, payment no longer appears in unassigned list
  </success_criteria>

<output>
After completion, create `.planning/quick/260326-ijx-create-the-ui-for-reconciliation-route-t/260326-ijx-SUMMARY.md`
</output>
