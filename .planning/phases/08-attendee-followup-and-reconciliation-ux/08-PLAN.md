---
phase: 08-attendee-followup-and-reconciliation-ux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/dashboard/reconciliation/page.tsx
  - app/dashboard/attendees/page.tsx
  - app/api/dashboard/orders/[orderId]/route.ts
  - components/dashboard/order-attendee-breakdown.tsx
autonomous: false
requirements_addressed: [UX-02, UX-03, UX-04]
---

<objective>
Implement targeted UX improvements for reconciliation and attendees: direct attendee detail navigation from reconciliation, attendee breakdown per order on reconciliation cards, and correct amount display on the attendees page.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-attendee-followup-and-reconciliation-ux/08-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Attendee Follow-up Flow - Direct Navigation to Attendee Detail</name>
  <files>app/dashboard/reconciliation/page.tsx</files>
  <read_first>
    - app/dashboard/reconciliation/page.tsx (current CTA link at line ~796)
    - app/dashboard/attendees/page.tsx (row click handler at line ~446)
    - lib/domain/finance/attendees.ts (attendee lookup by order)
  </read_first>
  <action>
    Modify the "Open attendee follow-up" button in reconciliation cards to navigate directly to attendee detail instead of the filtered attendees list.

    CURRENT (line ~795-801 in reconciliation/page.tsx):
    ```
    <Link href={`/dashboard/attendees?search=${...}&eventId=${...}&source=outstanding-balances&orderId=${...}`}>
      Open attendee follow-up
    ```

    CHANGE TO:
    1. When the row's order has exactly ONE attendee, link directly to `/dashboard/attendees/{attendeeId}?search={orderId}&eventId={eventId}&source=reconciliation`
    2. When the order has MULTIPLE attendees, link to `/dashboard/attendees?search={orderId}&eventId={eventId}&source=reconciliation` (existing filtered list behavior)
    3. Pass `source=reconciliation` (not `outstanding-balances`) to distinguish the origin

    To determine single vs multi-attendee:
    - Query `prisma.ticketTailorAttendee.count({ where: { providerOrderId } })` via a new helper or extend the reconciliation API
    - For MVP, show "View attendee(s)" that goes to the filtered list (existing behavior) for all orders
    - Then separately add a "View details" link on each attendee row in the breakdown (Task 2)

  </action>
  <acceptance_criteria>
    - Reconciliation card CTA says "Open attendee follow-up" and links to `/dashboard/attendees?search={orderId}&source=reconciliation`
    - Clicking it opens the attendees page filtered by that order
    - The `source=reconciliation` param is passed for origin tracking
    - Back navigation from attendee detail returns to `/dashboard/attendees?search={orderId}&source=reconciliation`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Fix Attendees Page Amount Display - Show "Paid" Instead of €0.00</name>
  <files>app/dashboard/attendees/page.tsx</files>
  <read_first>
    - app/dashboard/attendees/page.tsx (Amounts cell at lines ~506-513)
    - lib/domain/finance/attendees.ts (deriveOutstandingAmount at line ~111)
  </read_first>
  <action>
    In the Amounts TableCell of attendees/page.tsx, modify the rendering to show "Paid" status for attendees with €0 outstanding balance instead of "Outstanding €0.00".

    CURRENT (lines ~506-513):
    ```tsx
    <TableCell>
      <div className="text-xs">Total {formatMoney(row.totalAmountMinor)}</div>
      <div className="text-[11px] text-muted-foreground">
        Outstanding {formatMoney(row.outstandingAmountMinor)}
      </div>
    </TableCell>
    ```

    CHANGE TO:
    ```tsx
    <TableCell>
      <div className="text-xs">Total {formatMoney(row.totalAmountMinor)}</div>
      {row.outstandingAmountMinor > 0 ? (
        <div className="text-[11px] text-muted-foreground">
          Outstanding {formatMoney(row.outstandingAmountMinor)}
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckIcon className="size-3" /> Paid
        </div>
      )}
    </TableCell>
    ```

    Add import for `Check` icon from lucide-react at the top of the file.

  </action>
  <acceptance_criteria>
    - `Check` imported from lucide-react in attendees/page.tsx
    - Attendees with `outstandingAmountMinor === 0` show "Paid" with green check icon instead of "Outstanding €0.00"
    - Attendees with `outstandingAmountMinor > 0` show "Outstanding {amount}" (unchanged behavior)
    - Paid status uses `text-emerald-600 dark:text-emerald-400` color classes
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Add Attendee Breakdown Per Order on Reconciliation Cards</name>
  <files>
    - app/api/dashboard/orders/[orderId]/route.ts
    - components/dashboard/order-attendee-breakdown.tsx
    - app/dashboard/reconciliation/page.tsx
  </files>
  <read_first>
    - app/dashboard/reconciliation/page.tsx (card rendering at lines ~723-858)
    - lib/domain/finance/attendees.ts (attendee data shape)
    - prisma/schema.prisma (TicketTailorAttendee model)
  </read_first>
  <action>
    Add attendee breakdown to each reconciliation card, showing individual attendee names/ticket types with expand/collapse.

    STEP 1 — Create GET /api/dashboard/orders/[orderId] endpoint:
    Create `app/api/dashboard/orders/[orderId]/route.ts`:
    ```typescript
    // GET /api/dashboard/orders/{orderId}
    // Returns: { order: {...}, attendees: [{id, name, ticketTypeLabel, normalizedStatus}] }
    // Auth: require session (copy auth pattern from existing routes)
    // Query: prisma.ticketTailorOrder.findFirst({ where: { OR: [{providerOrderId}, {id}] }, include: { attendees: { select: {id, name, ticketTypeLabel} } } })
    ```

    STEP 2 — Create OrderAttendeeBreakdown component:
    Create `components/dashboard/order-attendee-breakdown.tsx`:
    ```typescript
    type Props = {
      orderId: string
      eventId: string
    }
    // - Fetches /api/dashboard/orders/{orderId}?eventId={eventId}
    // - Shows count badge: "2 attendees"
    // - Collapsed by default (useDisclosure from @/components/ui/use-disclosure or simple useState)
    // - Expanded: shows each attendee as a row: name | ticket type | status badge
    // - If order has single attendee, show "1 attendee" inline without expand/collapse
    ```

    STEP 3 — Integrate into reconciliation cards:
    Add below the "Outstanding" section in each reconciliation card (before the CTA buttons):
    ```tsx
    <OrderAttendeeBreakdown
      orderId={row.providerOrderId}
      eventId={row.providerEventId}
    />
    ```

  </action>
  <acceptance_criteria>
    - File `app/api/dashboard/orders/[orderId]/route.ts` exists with GET handler
    - GET /api/dashboard/orders/{orderId}?eventId={eventId} returns `{order: {...}, attendees: [{id, name, ticketTypeLabel, normalizedStatus}]}`
    - File `components/dashboard/order-attendee-breakdown.tsx` exists
    - Component shows attendee count badge on each reconciliation card
    - Expands to show individual attendee rows with name, ticket type, and status
    - Component handles loading state (Skeleton) and error state (quiet fail with no crash)
    - Single-attendee orders show "1 attendee" inline without expand/collapse
  </acceptance_criteria>
</task>

</tasks>

<verification>
1. Visit /dashboard/reconciliation and verify the "Open attendee follow-up" button passes `source=reconciliation`
2. Visit /dashboard/attendees — paid attendees show green "Paid" checkmark, not "Outstanding €0.00"
3. Click to expand attendee breakdown on any reconciliation card — individual attendees visible with names and ticket types
4. Single-attendee orders show "1 attendee" without needing to expand
</verification>

<success_criteria>

- Reconciliation CTA passes `source=reconciliation` for origin tracking
- Attendees page shows "Paid" (green check) for €0 outstanding, not "Outstanding €0.00"
- Reconciliation cards show attendee count badge with expandable breakdown
- Single-attendee orders show inline without expand/collapse
- All changes work on mobile (cards are responsive)
  </success_criteria>

<output>
After completion, create `.planning/phases/08-attendee-followup-and-reconciliation-ux/08-01-SUMMARY.md`
</output>
---
phase: 08-attendee-followup-and-reconciliation-ux
plan: 02
type: execute
wave: 2
depends_on: [08-01]
files_modified:
  - app/dashboard/reconciliation/page.tsx
  - app/dashboard/attendees/page.tsx
  - components/dashboard/sync-status-indicator.tsx
  - app/dashboard/dashboard-shell.tsx
  - app/providers.tsx
autonomous: false
requirements_addressed: [UX-05]
---

<objective>
Add background auto-sync infrastructure using TanStack Query refetch intervals and a sync status indicator in the dashboard shell.
</objective>

<context>
@.planning/phases/08-attendee-followup-and-reconciliation-ux/08-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 4: Add TanStack Query RefetchInterval for Background Sync</name>
  <files>
    - app/dashboard/reconciliation/page.tsx
    - app/dashboard/attendees/page.tsx
    - app/providers.tsx
  </files>
  <read_first>
    - app/dashboard/reconciliation/page.tsx (data fetching with useEffect at lines ~195-265)
    - app/dashboard/attendees/page.tsx (data fetching with useEffect at lines ~149-222)
    - app/providers.tsx (TanStack Query setup at lines ~1-32)
  </read_first>
  <action>
    Migrate data fetching from raw useEffect+useState to TanStack Query hooks for automatic background refetching.

    STEP 1 — Add sync status API endpoint:
    Create `app/api/dashboard/sync/status/route.ts`:
    ```typescript
    // GET /api/dashboard/sync/status
    // Returns: { lastSyncAt: string | null, isSyncing: boolean }
    // Reads lastTicketTailorSyncRun from prisma ordered by createdAt desc
    // Auth: require session
    ```

    STEP 2 — Create TanStack Query hooks:
    Create `hooks/dashboard/use-reconciliation-data.ts`:
    ```typescript
    // export function useReconciliationData(filters: ReconciliationFilters)
    // Wraps: fetch('/api/dashboard/reconciliation?...')
    // Config: { refetchInterval: 5 * 60 * 1000 } // 5 minutes
    // Returns: { data, isLoading, error, refetch }
    ```

    Create `hooks/dashboard/use-attendees-data.ts`:
    ```typescript
    // export function useAttendeesData(filters: AttendeesFilters)
    // Wraps: fetch('/api/dashboard/attendees?...')
    // Config: { refetchInterval: 5 * 60 * 1000 }
    // Returns: { data, isLoading, error, refetch }
    ```

    Create `hooks/dashboard/use-sync-status.ts`:
    ```typescript
    // export function useSyncStatus()
    // Wraps: fetch('/api/dashboard/sync/status')
    // Config: { refetchInterval: 60 * 1000 } // 1 minute for status indicator
    // Returns: { data: {lastSyncAt, isSyncing}, ... }
    ```

    STEP 3 — Migrate reconciliation/page.tsx:
    Replace the useEffect+useState pattern with useReconciliationData hook.
    Preserve all existing state management (appliedEventId, appliedStatus, appliedFrom, appliedTo).
    The query key should include filter values so refetching respects current filters.

    STEP 4 — Migrate attendees/page.tsx:
    Same pattern: replace useEffect+useState with useAttendeesData hook.

    Keep all existing UI (loading skeletons, error messages, empty states) — just change data source.

  </action>
  <acceptance_criteria>
    - TanStack Query hooks exist in `hooks/dashboard/use-reconciliation-data.ts`, `hooks/dashboard/use-attendees-data.ts`, `hooks/dashboard/use-sync-status.ts`
    - GET /api/dashboard/sync/status returns `{lastSyncAt, isSyncing}` from prisma
    - `reconciliation/page.tsx` uses `useReconciliationData` hook instead of raw useEffect+useState
    - `attendees/page.tsx` uses `useAttendeesData` hook instead of raw useEffect+useState
    - Both hooks have `refetchInterval: 300000` (5 minutes)
    - `useSyncStatus` has `refetchInterval: 60000` (1 minute)
    - Existing loading skeletons and error states remain unchanged
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 5: Add Sync Status Indicator to Dashboard Shell</name>
  <files>
    - components/dashboard/sync-status-indicator.tsx
    - app/dashboard/dashboard-shell.tsx
  </files>
  <read_first>
    - app/dashboard/dashboard-shell.tsx (sidebar user area at lines ~154-163)
    - hooks/dashboard/use-sync-status.ts (created in Task 4)
  </read_first>
  <action>
    Add a subtle sync status indicator to the dashboard shell sidebar, positioned near the user session area.

    Create `components/dashboard/sync-status-indicator.tsx`:
    ```typescript
    type SyncStatus = {
      lastSyncAt: string | null
      isSyncing: boolean
    }
    // States:
    // - isSyncing=true: "Syncing..." with animated RefreshCcwDot spinning icon (use CSS animation)
    // - lastSyncAt recent (<5 min ago): "Synced {relative time}" with green dot
    // - lastSyncAt stale (>5 min ago): "Last synced {relative time}" with gray dot
    // - lastSyncAt null: "Not synced" with yellow warning dot
    // Clicking the indicator triggers a manual sync via POST /api/ticket-tailor/sync with {} body
    // On manual sync click: show "Syncing..." state
    ```

    Integrate into `dashboard-shell.tsx`:
    Add `SyncStatusIndicator` component in the sidebar's bottom area, replacing or extending the user session block:
    ```tsx
    {/* Replace current session div (lines 154-163) with: */}
    <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 backdrop-blur dark:bg-white/6">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Signed in</p>
        <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
      </div>
      <SyncStatusIndicator />
    </div>
    ```

  </action>
  <acceptance_criteria>
    - `components/dashboard/sync-status-indicator.tsx` exists
    - SyncStatusIndicator shows correct state based on `useSyncStatus()` data
    - Syncing state shows spinning RefreshCcwDot icon with "Syncing..." text
    - Synced state shows green dot + relative time ("Synced 2m ago")
    - Stale state (>5 min) shows gray dot + "Last synced {time}"
    - Not-synced state shows yellow dot + "Not synced"
    - Clicking indicator triggers POST /api/ticket-tailor/sync with `{}`
    - Component is positioned in dashboard shell sidebar near user session area
    - Component uses `text-[10px]` or `text-[11px]` font size to stay subtle
  </acceptance_criteria>
</task>

</tasks>

<verification>
1. Visit /dashboard/reconciliation — verify TanStack Query is refetching on interval (check network tab)
2. Visit /dashboard — sync status indicator visible in sidebar near signed-in user
3. "Syncing..." state shows when sync is in progress
4. "Synced X min ago" shows after successful sync
5. Clicking sync indicator triggers manual sync
6. Error state shows "Not synced" with warning dot
</verification>

<success_criteria>

- Background refetch runs every 5 minutes for reconciliation and attendees pages
- Sync status indicator visible in dashboard shell sidebar
- Indicator shows accurate sync state with relative timestamps
- Manual sync trigger works via indicator click
- No duplicate syncs when navigating between pages (TanStack Query handles this)
  </success_criteria>

<output>
After completion, create `.planning/phases/08-attendee-followup-and-reconciliation-ux/08-02-SUMMARY.md`
</output>
