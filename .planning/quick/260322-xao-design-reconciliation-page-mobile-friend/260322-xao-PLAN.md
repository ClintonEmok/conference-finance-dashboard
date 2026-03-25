---
phase: quick
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - app/dashboard/reconciliation/page.tsx
autonomous: true
---

<objective>
Redesign the reconciliation page to be mobile-friendly using shadcn semantic colors and responsive layouts, consistent with the financial page.
</objective>

<context>
@app/dashboard/reconciliation/page.tsx
</context>

<tasks>

<task type="auto">
<name>Replace purple gradient header with semantic shadcn Card</name>
<files>app/dashboard/reconciliation/page.tsx</files>
<action>
Replace the hardcoded purple gradient header card:

OLD (lines ~498-543):

```tsx
<article className="overflow-hidden rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-6 text-primary-foreground shadow-[0_20px_56px_rgba(78,52,166,0.24)] md:p-7">
```

NEW:

```tsx
<Card className="border border-border bg-card p-6 md:p-7">
```

Use the same Card component structure from the financial page header. Replace the hardcoded purple background, foreground, and shadow with semantic shadcn tokens. Keep the same layout (left side: title text + right side: stats grid). Use `text-foreground`, `text-muted-foreground`, `bg-muted/40`, `bg-card` instead of hardcoded colors.

Update the stats cells inside to use `rounded-lg border border-border bg-muted/40 p-4` (matching financial page pattern) instead of `bg-white/12`.
</action>
<verify>npm run build 2>&1 | tail -20</verify>
<done>Purple gradient header replaced with semantic shadcn Card</done>
</task>

<task type="auto">
<name>Make reconciliation table mobile-responsive</name>
<files>app/dashboard/reconciliation/page.tsx</files>
<action>
The reconciliation table has 8 columns that don't fit on mobile. Replace with a responsive card layout:

1. Wrap the table in `overflow-x-auto` (already present, keep it)
2. On mobile (hidden md:block for table), show each row as a Card
3. Use `hidden md:block` on the Table wrapper
4. Add a mobile card view using `block md:hidden` that shows key fields per row:
   - Order ID (mono, small)
   - Event name + status badge
   - Outstanding amount (highlighted)
   - Reasons (truncated)
   - Next step button
   - Tikkie link button
   - Tikkie link summary (compact)

For the mobile card, use:

```tsx
<div className="block space-y-3 md:hidden">
  {payload.rows.map((row) => (
    <Card key={row.providerOrderId} className="space-y-3 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs">{row.providerOrderId}</p>
          <p className="text-xs text-muted-foreground">{row.eventName}</p>
        </div>
        <Badge>{row.normalizedStatus}</Badge>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Outstanding</p>
        <p className="text-lg font-semibold text-foreground">
          {formatMoney(row.outstandingMinor)}
        </p>
      </div>
      {/* ... actions */}
    </Card>
  ))}
</div>
```

</action>
<verify>npm run build 2>&1 | tail -20</verify>
<done>Table rows become cards on mobile screens</done>
</task>

<task type="auto">
<name>Replace hardcoded alert and skeleton colors</name>
<files>app/dashboard/reconciliation/page.tsx</files>
<action>
Replace hardcoded colors in the error alert and skeleton loading:

OLD (error alert):

```tsx
<article className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
```

NEW:

```tsx
<article className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs text-destructive">
```

OLD (amber validation):

```tsx
<迁徙 className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
```

NEW:

```tsx
<p className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
```

(If `warning` token isn't available, use `bg-yellow-100 text-yellow-800` — but check semantic tokens first)

Replace any remaining `dark:bg-white/10 dark:text-primary-foreground` with `bg-muted/40 text-muted-foreground`.
</action>
<verify>npm run build 2>&1 | tail -20</verify>
<done>All hardcoded alert/skeleton colors replaced with semantic tokens</done>
</task>

<task type="auto">
<name>Refine metric cards and filter section spacing</name>
<files>app/dashboard/reconciliation/page.tsx</files>
<action>
The three metric cards (lines ~650-693) and filter card look mostly good but refine:

1. Ensure metric cards use `rounded-lg border border-border bg-muted/40 p-5` (matching financial page)
2. Replace `bg-primary/10` icon backgrounds with `bg-muted text-primary` (matching financial page)
3. Replace `bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300` with `bg-muted text-warning` or `bg-muted text-amber-600`
4. Ensure filter form uses consistent `gap-4` instead of `space-y-4`

The filter form inputs (lines ~563-645) should use consistent `Input` component and proper label styling matching shadcn patterns. The select elements can remain as native selects with `h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm`.
</action>
<verify>npm run build 2>&1 | tail -20</verify>
<done>Metric cards and filter section use consistent shadcn patterns</done>
</task>

</tasks>

<verification>
- `npm run build` passes
- No hardcoded gradient backgrounds like `bg-[linear-gradient(...)]`
- No hardcoded purple/amber/red hex colors remain
- Table has responsive card view on mobile (`block md:hidden`)
- All icon backgrounds use `bg-muted text-primary` pattern
- Skeleton loading uses `bg-muted/40` not hardcoded colors
</verification>

<success_criteria>

- Reconciliation page visually matches financial page design language
- Mobile layout shows cards instead of horizontal table
- All hardcoded colors replaced with semantic shadcn tokens
- No regression in functionality
- Build passes cleanly
  </success_criteria>

<output>
After completion, create `.planning/quick/260322-xao-design-reconciliation-page-mobile-friend/260322-xao-SUMMARY.md`
</output>
