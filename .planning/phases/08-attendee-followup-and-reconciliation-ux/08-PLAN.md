---
phase: 08-attendee-followup-and-reconciliation-ux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/dashboard/reconciliation/page.tsx
  - src/app/dashboard/attendees/page.tsx
  - src/components/attendee-table.tsx
  - src/components/attendee-detail-link.tsx
  - src/app/api/orders/[orderId]/route.ts
  - src/components/reconciliation-card.tsx
  - src/components/reconciliation-summary.tsx
autonomous: false
user_setup: []
---

<objective>
Improve reconciliation and attendees UX with five targeted fixes: simplify reconciliation page layout, fix attendee follow-up flow to navigate directly to attendee detail, add attendee breakdown per order, fix attendees route amount display, and add background auto-sync.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="checkpoint:human-verify">
  <name>Task 1: Simplify Reconciliation Page Layout</name>
  <files>
    - src/app/dashboard/reconciliation/page.tsx
    - src/components/reconciliation-card.tsx
    - src/components/reconciliation-summary.tsx
  </files>
  <action>
    Review the current reconciliation page layout and simplify it:

    1. Identify the current layout structure and visual complexity
    2. Simplify the reconciliation page by:
       - Consolidate redundant information displays
       - Reduce card nesting depth
       - Use clearer visual hierarchy with primary/secondary information
       - Ensure mobile responsiveness is maintained (card grid layout)
       - Make key metrics (total outstanding, order count, paid amount) prominent
    3. Remove unnecessary data points that don't help operators make decisions
    4. Add clear call-to-action buttons for follow-up actions
    5. Ensure the page loads quickly without heavy calculations

    Reference the recent quick task 260323-07i redesign which converted the reconciliation desktop view into a card grid.

  </action>
  <verify>
    1. Open /dashboard/reconciliation
    2. Verify the page displays a clean card grid on desktop
    3. Verify mobile responsiveness works correctly
    4. Verify key metrics are prominently displayed
    5. Verify follow-up actions are easily accessible
  </verify>
  <done>
    Reconciliation page has a simplified, card-based layout with clear visual hierarchy and accessible follow-up actions.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix Attendee Follow-up Flow - Direct Navigation to Attendee Detail</name>
  <files>
    - src/components/attendee-detail-link.tsx
    - src/components/attendee-table.tsx
    - src/app/dashboard/attendees/[attendeeId]/page.tsx
  </files>
  <action>
    Fix the attendee follow-up flow to navigate directly to attendee detail:

    1. Create or update `attendee-detail-link.tsx` component:
       - This should be a link/button component that navigates to `/dashboard/attendees/[attendeeId]`
       - Use the attendee's name or a combination of name + order reference as the link text/label
       - Preserve the `orderId` and any other context in URL query params for back navigation

    2. Update `attendee-table.tsx`:
       - Replace any custom click handlers with the standardized `attendee-detail-link.tsx` component
       - Ensure clicking a row or follow-up button navigates directly to `/dashboard/attendees/[attendeeId]`
       - Do NOT navigate to intermediate pages

    3. Ensure the attendee detail page (`/dashboard/attendees/[attendeeId]/page.tsx`):
       - Accepts the attendeeId from URL params
       - Loads and displays the attendee's full details
       - Has proper back navigation that returns to the correct list context

  </action>
  <verify>
    1. From reconciliation page, click on any attendee name/link in an outstanding balance row
    2. Verify navigation goes directly to `/dashboard/attendees/[attendeeId]`
    3. Verify the attendee detail page shows the correct attendee information
    4. Verify back navigation returns to the reconciliation page with context preserved
  </verify>
  <done>
    Clicking an attendee in any follow-up context navigates directly to the attendee detail page without intermediate pages.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Attendee Breakdown Per Order</name>
  <files>
    - src/app/api/orders/[orderId]/route.ts
    - src/components/order-attendee-breakdown.tsx
    - src/app/dashboard/reconciliation/page.tsx
  </files>
  <action>
    Add attendee breakdown display per order on the reconciliation page:

    1. Create `order-attendee-breakdown.tsx` component:
       - Accepts an order object as prop
       - Displays each attendee in the order with:
         - Attendee name
         - Ticket type
         - Individual amount (if available from sync data)
         - Payment status indicator
       - Show a collapsible section if there are many attendees (>3)

    2. Create or update `GET /api/orders/[orderId]` endpoint:
       - Include attendee array in the response with name, ticketType, amount fields
       - Include total attendee count
       - Return canonical payment status per attendee if available

    3. Integrate the attendee breakdown into the reconciliation page:
       - Show attendee breakdown inline when expanding an order card
       - Or show a summary row: "X attendees" with expand/collapse capability

  </action>
  <verify>
    1. Visit /dashboard/reconciliation
    2. Click to expand any order with multiple attendees
    3. Verify the attendee breakdown shows all attendees with names and ticket types
    4. Verify the breakdown is collapsed by default if there are more than 3 attendees
  </verify>
  <done>
    Each order on the reconciliation page shows a breakdown of its attendees with names, ticket types, and individual payment status.
  </done>
</task>

<task type="auto">
  <name>Task 4: Fix Attendees Route Amount Display</name>
  <files>
    - src/app/dashboard/attendees/page.tsx
    - src/app/api/attendees/route.ts
    - src/components/attendee-table.tsx
  </files>
  <action>
    Fix the attendees route amount display to show correct values:

    1. Review `src/app/api/attendees/route.ts`:
       - Verify it returns the correct `outstandingBalance` or `amountDue` per attendee
       - Ensure this value is derived from the canonical order payment status
       - Handle edge cases: paid attendees should show $0 or "Paid" not a balance

    2. Update `attendee-table.tsx`:
       - Ensure the amount column displays the correct value from the API
       - Format amounts consistently (currency symbol, decimal places)
       - Use appropriate color coding: red for outstanding, green for paid
       - Show "Paid" or checkmark for fully paid attendees instead of $0.00

    3. Update `src/app/dashboard/attendees/page.tsx`:
       - Pass the correct amount data to the attendee table
       - Verify the page summary/header shows correct totals

  </action>
  <verify>
    1. Visit /dashboard/attendees
    2. Verify each attendee row shows the correct outstanding balance amount
    3. Verify paid attendees show "Paid" status instead of "$0.00"
    4. Verify amounts match the order-level totals
  </verify>
  <done>
    The attendees route displays correct amounts per attendee: outstanding balances for unpaid attendees and "Paid" status for fully paid attendees.
  </done>
</task>

<task type="auto">
  <name>Task 5: Add Background Auto-Sync</name>
  <files>
    - src/app/api/sync/route.ts
    - src/lib/sync/scheduler.ts
    - src/components/sync-status-indicator.tsx
  </files>
  <action>
    Add background auto-sync to keep Ticket Tailor data current:

    1. Create `src/lib/sync/scheduler.ts`:
       - Implement a lightweight scheduler that triggers sync at regular intervals
       - Use a simple interval-based approach (e.g., every 5 minutes) for MVP
       - Store last sync timestamp in memory or a lightweight cache
       - Prevent overlapping sync jobs with a running flag

    2. Update `src/app/api/sync/route.ts`:
       - Make the sync endpoint idempotent
       - Return sync status: `{ running: boolean, lastSync: Date | null, error: string | null }`
       - Support a `?force=true` query param to force immediate sync

    3. Create `src/components/sync-status-indicator.tsx`:
       - Display a subtle indicator showing sync status
       - States: syncing (spinner), synced (timestamp), error (warning icon)
       - Show "Last synced: X minutes ago" or "Syncing..." during active sync
       - Position in a non-intrusive location (top bar or header)

    4. Add the sync indicator to dashboard layout:
       - Include in the main dashboard header or top navigation
       - Make it visible but not distracting

  </action>
  <verify>
    1. Visit /dashboard/reconciliation
    2. Verify the sync status indicator appears in the header
    3. Wait for a sync interval and verify the indicator updates
    4. Verify no duplicate syncs occur when rapid navigation happens
    5. If sync fails, verify error state is displayed
  </verify>
  <done>
    Background auto-sync runs at regular intervals and displays sync status in the dashboard header without disrupting operator workflow.
  </done>
</task>

</tasks>

<verification>
1. Reconciliation page displays simplified card-based layout with clear metrics
2. Clicking attendee name navigates directly to attendee detail
3. Order cards expand to show attendee breakdown with names and ticket types
4. Attendees page shows correct amounts: outstanding for unpaid, "Paid" for paid
5. Sync status indicator visible in header and updates automatically
</verification>

<success_criteria>

- Reconciliation page is simplified and operator-friendly
- Attendee follow-up flow navigates directly to attendee detail (no intermediate pages)
- Each order shows its attendee breakdown with relevant details
- Attendees route displays correct payment amounts and statuses
- Background sync keeps data current and shows status in UI
  </success_criteria>

<output>
After completion, create `.planning/phases/08-attendee-followup-and-reconciliation-ux/08-01-SUMMARY.md`
</output>
