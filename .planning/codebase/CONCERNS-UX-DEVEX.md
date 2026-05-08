# UX, Testing & Developer Experience Audit

**Analysis Date:** 2026-03-31

## User Experience (UX)

### Loading States

**What works well:**

- Dashboard root has a well-designed skeleton loader: `app/dashboard/loading.tsx` (100 lines)
- Financial page has `FinancialSkeleton` component: `app/dashboard/financial/loading.tsx` (38 lines)
- Orders, attendees, and reconciliation pages each have `loading.tsx` files
- Skeleton placeholders match the actual UI structure (metric cards, tables, progress bars)

**Issues:**

- **Payments page ignores its loading.tsx**: `app/dashboard/payments/page.tsx` manages its own `isLoading` state inline and shows "--" for values during load. The Next.js `loading.tsx` file exists at `app/dashboard/payments/loading.tsx` but is never triggered because the component handles loading internally.
- **No loading states for sub-routes**: `app/dashboard/orders/[orderId]/`, `app/dashboard/attendees/[attendeeId]/`, `app/dashboard/accommodation/[event-slug]/`, `app/dashboard/accommodation/inventory/` have no `loading.tsx` files.
- **Inline loading inconsistency**: Some pages show skeleton tables (`app/dashboard/orders/page.tsx` lines 362-394), others show "--" text (`app/dashboard/payments/page.tsx` line 182). Users see different loading behaviors across the app.

### Error States

**What works well:**

- Global error boundary: `app/global-error.tsx` (51 lines) — polished UI with error detail, reset button
- Dashboard error boundary: `app/dashboard/error.tsx` → `components/dashboard/dashboard-error-state.tsx` (54 lines) — reusable component with retry
- Most pages display error banners (e.g., `app/dashboard/page.tsx` lines 335-339, `app/dashboard/orders/page.tsx` lines 330-334)
- Error messages are user-friendly (not raw stack traces)

**Issues:**

- **Typo in attendees error**: `app/dashboard/attendees/page.tsx` line 157 — "Field to load attendees." should be "Failed to load attendees."
- **Financial page has no error.tsx**: `app/dashboard/financial/` has `loading.tsx` but no `error.tsx`. If the page crashes, users see the generic global error instead of a contextual one.
- **Integrations page has no error.tsx**: Same issue — `app/dashboard/integrations/` has `loading.tsx` but no `error.tsx`.
- **Error banners don't auto-dismiss**: Error messages persist until the next successful load or page navigation. No "dismiss" button on error banners.
- **No retry mechanism on financial page**: `app/dashboard/financial/page.tsx` uses `useEffect` with empty deps `[]` (line 127). If the API call fails, the user must refresh the entire page — there's no retry button.

### Empty States

**What works well:**

- Dashboard trend table shows "No synced orders found for the default scope." (`app/dashboard/page.tsx` lines 397-400)
- Attendees table shows "No attendees found for the default scope." (`app/dashboard/page.tsx` lines 499-502)
- Orders table shows "No orders found matching the criteria." (`app/dashboard/orders/page.tsx` lines 396-401)
- Accommodation event selector shows a card grid with empty state: "No events with accommodation" + "View Events" CTA (`app/dashboard/accommodation/page.tsx` lines 700-713)

**Issues:**

- **No empty state for payments page**: If there are no payments, the page shows empty stat cards (0 values) but no explanatory message or guidance.
- **No empty state for reconciliation page**: Unknown — needs verification.
- **Empty states are plain text**: All empty states are simple `<p>` elements with muted text. No illustrations, no suggested actions, no links to relevant setup pages.

### Form UX

**What works well:**

- Orders page filter form has inline date validation error display (`app/dashboard/orders/page.tsx` lines 323-327)
- Dashboard page has inline validation for date ranges (`app/dashboard/page.tsx` lines 170-183)
- Submit buttons are disabled during loading states
- Accommodation assignment validates room selection before submission (`app/dashboard/accommodation/page.tsx` lines 549-558)

**Issues:**

- **No success feedback on most forms**: The orders filter form applies filters silently. No "Filters applied" confirmation. The accommodation assignment shows a message but it doesn't auto-dismiss.
- **Payments manual entry form**: `components/payments/manual-entry-form.tsx` — no visible validation feedback in the parent component. Success callback exists but no visual confirmation beyond the form closing.
- **No form reset option**: Filter forms have no "Clear all filters" button. Users must manually clear each field.
- **Select elements lack proper styling**: `app/dashboard/orders/page.tsx` lines 259-274 and 277-291 use native `<select>` elements with minimal styling. They don't match the shadcn design system.
- **No loading state on filter submit**: The "Apply Filters" button disables during load, but there's no spinner or visual indication that filters are being applied.

### Accessibility (a11y)

**Issues:**

- **Table rows are not keyboard-navigable**: `app/dashboard/orders/page.tsx` line 408 and `app/dashboard/attendees/page.tsx` line 296 use `onClick` on `<tr>` elements without `role="button"`, `tabIndex`, or keyboard event handlers. Keyboard users cannot navigate these rows.
- **Mobile navigation lacks semantic structure**: `app/dashboard/dashboard-shell.tsx` lines 302-426 — the mobile nav is a block of buttons with no `<nav>` landmark or ARIA labels for the sections.
- **Missing ARIA labels on icon-only buttons**: The expand/collapse chevron buttons in the desktop sidebar (`app/dashboard/dashboard-shell.tsx` lines 229-248) have no `aria-label` or `aria-expanded`. The mobile version does have them (lines 353-358), but the desktop version does not.
- **Color contrast concerns**: The dashboard metric cards use white text on purple gradient backgrounds (`app/dashboard/page.tsx` lines 293-299). The `text-white/70` for labels may not meet WCAG AA contrast ratios on lighter portions of the gradient.
- **No skip navigation link**: There's no "Skip to main content" link for keyboard/screen reader users.
- **Loading skeletons have no ARIA labels**: `Skeleton` components don't have `aria-busy` or `aria-label` to indicate loading state to screen readers.
- **Error messages not linked to inputs**: Form validation errors are displayed below forms but not connected via `aria-describedby` to the relevant input fields.

### Responsive Design

**What works well:**

- Dashboard shell has distinct desktop sidebar (`hidden lg:flex`) and mobile button grid (`lg:hidden`)
- Metric cards use responsive grid: `sm:grid-cols-2 lg:grid-cols-4`
- Tables have `overflow-x-auto` wrappers for horizontal scrolling on small screens

**Issues:**

- **No hamburger menu**: The mobile navigation shows ALL navigation items as a block at the top of every page (`app/dashboard/dashboard-shell.tsx` lines 302-426). This is overwhelming and takes up significant screen space. A collapsible hamburger menu would be better.
- **Accommodation page is extremely long on mobile**: With 1287+ lines of content, the accommodation page requires extensive vertical scrolling on mobile with no section collapsing.
- **Tables don't adapt to mobile**: All data tables use `overflow-x-auto` which means horizontal scrolling. On very small screens, this is difficult to use. Consider card-based layouts for mobile.
- **Filter forms wrap awkwardly**: The filter forms on orders and attendees pages use `flex-wrap` which can create inconsistent layouts on narrow screens.

### Performance

**Issues:**

- **No virtual scrolling for large tables**: Orders and attendees tables render all rows in the current page (25 rows). If page size increases, performance degrades linearly.
- **No React.memo on list items**: Table rows and metric cards re-render on every parent state change. `app/dashboard/page.tsx` has 664 lines of component logic — any state change triggers a full re-render.
- **Convex subscriptions not used**: The app uses raw `fetch()` + `useEffect` for all dashboard data. Convex's real-time subscriptions (`useQuery`) would eliminate unnecessary re-fetches and provide instant updates.
- **No image optimization**: `next.config.mjs` is empty — no `images.domains` or `images.remotePatterns` configured.
- **Bundle size**: `@tanstack/react-query` is installed but unused for dashboard data. `shadcn` is listed as a runtime dependency (should be devDependency).

## Testing

### Current Test Coverage

**Test files found (25 total):**

```
tests/accommodation/accommodation-filter-state.test.ts
tests/accommodation/allocation-filters.test.ts
tests/accommodation/allocation-proposal.test.ts
tests/accommodation/inventory-metrics.test.ts
tests/attendees/attendee-detail-route.test.ts
tests/finance/attendees.test.ts
tests/finance/order-ledger.test.ts
tests/payments/orders-search-route.test.ts
tests/payments/payments-route.test.ts
tests/reconciliation/reconciliation-follow-up.test.ts
tests/reconciliation/reconciliation-outstanding.test.ts
tests/signup-flow/assignment.test.ts
tests/signup-flow/submission-client.test.ts
tests/ticket-tailor/client.test.ts
tests/ticket-tailor/custom-answers.test.ts
tests/ticket-tailor/custom-questions-db.test.ts
tests/ticket-tailor/sync-route.test.ts
tests/ticket-tailor/sync.test.ts
tests/ticket-tailor/webhook-route.test.ts
tests/ticket-tailor/webhook-verify.test.ts
tests/tikkie/subscription-route.test.ts
tests/tikkie/tikkie-event-links-route.test.ts
tests/tikkie/tikkie-links.test.ts
tests/tikkie/webhook-route.test.ts
tests/tikkie/webhook-verify.test.ts
```

### What's Covered

- **API route handlers**: Most `app/api/` routes have corresponding tests
- **Accommodation logic**: Filter state, allocation filters, proposal generation, inventory metrics
- **Signup flow**: Assignment logic, submission client
- **Ticket Tailor integration**: Client, sync, webhooks, custom answers
- **Tikkie integration**: Webhooks, subscription routes, payment links
- **Finance logic**: Order ledger, attendees data

### Critical Gaps

**No React component tests:**

- Zero tests for any `.tsx` files. All UI components are untested.
- `components/dashboard/`, `components/payments/`, `components/signup/`, `components/ui/` — all untested
- `app/dashboard/` page components — all untested

**No Convex function tests:**

- Convex mutations and queries in `convex/*.ts` are tested indirectly via API routes but have no isolated unit tests
- `convex/accommodation.ts` (1227 lines of business logic) — zero direct tests
- `convex/payments.ts` — zero direct tests
- `convex/orders.ts` — zero direct tests

**No tests for money formatting:**

- `lib/format.ts` (`formatMoney`) — critical financial function with zero tests
- A formatting bug would affect every monetary display in the app

**No tests for date utilities:**

- `toDateInputValue()` and `toIsoBoundary()` are duplicated across 3+ files with no tests
- Edge cases (timezone, DST, invalid input) are untested

**No E2E tests:**

- No Playwright, Cypress, or similar framework configured
- Full user flows (login → dashboard → filter → export) are untested

**Stale Prisma-based tests:**

- `tests/tikkie/tikkie-links.test.ts` (868 lines) mocks Prisma client methods that no longer exist in production code
- These tests provide false confidence — they pass but don't validate actual behavior

### Test Configuration

**File:** `vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
})
```

**Issues:**

- `environment: "node"` prevents testing React components (no DOM)
- No coverage configuration or thresholds
- No setup file for test utilities or global mocks
- No `jsdom` or `happy-dom` environment for component tests

## Developer Experience

### TypeScript Configuration

**File:** `tsconfig.json`

- `"strict": true` — good, full strict mode enabled
- `"noEmit": true` — correct for Next.js
- Path alias `@/*` → `./*` — configured correctly

**Issues:**

- Despite strict mode, `as any` casts are used throughout:
  - `app/dashboard/orders/page.tsx` line 283: `setStatusInput(e.target.value as any)`
  - `app/dashboard/events/[slug]/page.tsx` — ~15 `any` usages
  - `app/dashboard/accommodation/[event-slug]/page.tsx` — ~10 `any` usages
- No `noUncheckedIndexedAccess` flag — array access can return `undefined` without type checking

### ESLint Configuration

**File:** `eslint.config.mjs` (18 lines)

```typescript
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
])
```

**Issues:**

- Only extends Next.js defaults — no custom rules
- No import ordering rules
- No `no-console` rule (debug `console.log` found in `convex/sync.ts:44`)
- No `@typescript-eslint/no-explicit-any` rule (despite `any` usage)
- No React hooks rules beyond Next.js defaults

### Prettier Configuration

**File:** `.prettierrc` (11 lines)

```json
{
  "endOfLine": "lf",
  "semi": false,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "app/globals.css",
  "tailwindFunctions": ["cn", "cva"]
}
```

**What works well:**

- Tailwind CSS plugin configured for class sorting
- `cn` and `cva` recognized as Tailwind functions
- Consistent formatting settings

**Issues:**

- `printWidth: 80` is quite narrow for JSX, causing excessive line breaks in components

### Git Hooks

**Status:** None configured

- No `.husky/` directory
- No `lint-staged` in `package.json`
- Code can be committed without linting, formatting, or type-checking

### CI/CD

**Status:** None configured

- No `.github/workflows/` directory
- No automated testing on push/PR
- `npm test` command exists but nothing runs it automatically

### Documentation

**README.md** (21 lines):

- Generic "Next.js template with shadcn/ui" — no project-specific information
- No architecture overview, setup instructions, or domain context
- No mention of Convex, Clerk, Ticket Tailor, or Tikkie integrations

**CLAUDE.md** (7 lines):

- Only contains Convex AI guidelines
- No project context for AI assistants

**AGENTS.md** (same as CLAUDE.md):

- Only Convex AI guidelines

**Code comments:**

- Only `lib/format.ts` has JSDoc comments
- No JSDoc on Convex functions, API routes, or utility functions
- Complex logic (e.g., `app/dashboard/accommodation/page.tsx` IIFE patterns) has no explanatory comments

### Build Configuration

**File:** `next.config.mjs` (4 lines)

```typescript
const nextConfig = {}
export default nextConfig
```

**Issues:**

- Empty config — no security headers, no image optimization config, no redirects
- No `experimental` features enabled
- No `output: 'standalone'` for Docker deployment

## State Management

### Client State

**Pattern:** Each page component manages its own state with `useState` + `useEffect` + `fetch`.

**Issues:**

- **No shared state management**: Each page independently manages loading, error, and data state. No central state store or context.
- **React Query installed but unused**: `@tanstack/react-query` is installed and a `QueryProvider` exists in `app/providers.tsx`, but no dashboard page uses it. All data fetching uses raw `fetch()`.
- **URL state sync is complex**: `app/dashboard/accommodation/page.tsx` has a 50-line `syncUrlState` callback (lines 331-386) to keep URL params in sync with filter state. This is reimplemented differently on each page.

### Convex Subscriptions

**Current usage:** Convex hooks are defined in `lib/convex/hooks/` but dashboard pages use raw `fetch()` to API routes instead.

**Example of underutilization:**

```typescript
// Defined but unused:
// lib/convex/hooks/orders.ts
export function useOrders(args?: { eventId?: string; status?: string }) {
  return useQuery(api.orders.getOrders, args ?? {})
}

// What pages actually use:
// app/dashboard/orders/page.tsx
const response = await fetch(`/api/dashboard/orders?${query.toString()}`)
```

**Impact:**

- No real-time updates — users must manually refresh
- More boilerplate code (AbortController, loading state, error handling)
- Higher latency (HTTP round-trip vs. WebSocket)

### Custom Hooks

**Well-designed hooks:**

- `lib/convex/hooks/attendees.ts` — clean, typed, focused
- `lib/convex/hooks/orders.ts` — clean, typed, focused
- `lib/convex/hooks/index.ts` — barrel export

**Issues:**

- Hooks are defined but not used by dashboard pages
- No hooks for API route data fetching (the most common pattern in the app)
- No `useApiQuery` or `useApiMutation` abstractions for the `fetch()` pattern

## Component Architecture

### Patterns Observed

**UI Components (`components/ui/`):**

- 15 shadcn components: alert, avatar, badge, button, card, dialog, dropdown-menu, input, label, scroll-area, select, separator, skeleton, slider, table
- Well-structured, consistent API
- Use `cn()` for class merging

**Dashboard Components (`components/dashboard/`):**

- 5 components: `dashboard-error-state.tsx`, `event-tikkie-section.tsx`, `order-attendee-breakdown.tsx`, `tikkie-link-dialog.tsx`, `tikkie-link-summary.tsx`
- `event-tikkie-section.tsx` is likely large (reported 874 lines in existing CONCERNS.md)

**Payments Components (`components/payments/`):**

- 3 components: `assign-dialog.tsx`, `manual-entry-form.tsx`, `payment-list.tsx`
- Cleanly separated concerns

**Signup Components (`components/signup/`):**

- Multi-step flow: `SignupFlowShell.tsx`, `AttendeeGrouping.tsx`, `ReviewSection.tsx`, `steps/` directory
- Well-structured step-based architecture

### Issues

**Props drilling:**

- `app/dashboard/dashboard-shell.tsx` passes `userEmail` down from layout — not a concern
- `app/dashboard/accommodation/page.tsx` has deeply nested state that could benefit from context (selected attendee IDs, proposal state, submission detail state)

**Component composition:**

- Good use of composition in signup flow (shell + steps)
- Poor composition in page components — everything is inline
- `app/dashboard/accommodation/page.tsx` uses IIFE rendering pattern (lines 1028-1258) instead of extracted components

**Reusability:**

- Metric cards are duplicated across pages with different styles
- Table patterns are duplicated (loading skeletons, empty states, pagination)
- Filter form patterns are duplicated across orders, attendees, and accommodation pages

**Missing abstractions:**

- No `DataTable` component — each page implements its own table with loading/empty/pagination states
- No `MetricCard` component — each page implements its own metric display
- No `FilterBar` component — each page implements its own filter form
- No `EmptyState` component — each page uses inline `<p>` elements

---

_UX, Testing & DevEx audit: 2026-03-31_
