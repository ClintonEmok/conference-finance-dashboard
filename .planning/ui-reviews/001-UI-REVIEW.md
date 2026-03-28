# Conference Finance Dashboard — Production UI Review

**Audited:** 2026-03-28
**Scope:** All frontend components, dashboard pages, layout, and providers
**Baseline:** Code quality review against Next.js 14+ / React best practices
**Screenshots:** Not captured (code-only audit, no dev server detected)

---

## Strengths

### Excellent Foundation

- **Clean provider architecture** — `app/layout.tsx:34-39` — Clerk → Convex → React Query → ThemeProvider nesting is correct and follows Next.js App Router conventions
- **Proper QueryClient SSR handling** — `app/providers.tsx:12-21` — The singleton pattern prevents duplicate clients on server renders
- **AbortController usage throughout** — Every data-fetching page uses `AbortController` for cleanup (e.g., `app/dashboard/page.tsx:188`, `app/dashboard/orders/page.tsx:114`)
- **Loading skeleton states everywhere** — Every page with data fetching has proper skeleton loaders, not just spinners
- **Form validation before API calls** — `app/dashboard/page.tsx:160-173`, `components/payments/manual-entry-form.tsx:50-74` — Client-side validation prevents unnecessary network requests
- **Error state handling** — Every fetch has try/catch with user-facing error messages, not console-only errors
- **Type safety** — All component props and API response types are properly typed with TypeScript interfaces
- **Smart use of `useMemo`** — Computed metrics like `paymentProgress` (`app/dashboard/attendees/[attendeeId]/page.tsx:189`) and date validation errors are memoized

### Strong UX Patterns

- **Consistent status badge system** — `Badge` variants are used consistently across orders, payments, and attendees pages
- **Breadcrumb navigation** — Attendee detail page (`app/dashboard/attendees/[attendeeId]/page.tsx:211-215`) has clear back navigation
- **Confirmation for destructive actions** — `app/dashboard/orders/[orderId]/page.tsx:305-306` — `window.confirm()` before order removal
- **Responsive sidebar** — `app/dashboard/dashboard-shell.tsx` — Desktop sidebar with mobile fallback navigation
- **Filter date validation** — Inline validation prevents "from > to" date ranges across all filter forms

### Good Code Organization

- **Extracted utility functions** — `formatMoney`, `toIsoBoundary`, `toDateInputValue` are reused across pages
- **Filter state management** — Accommodation filter state is extracted to its own module (`app/dashboard/accommodation/filter-state.ts`)
- **Component separation** — Payment components (`PaymentList`, `AssignDialog`, `ManualPaymentEntryForm`) are properly isolated

---

## Issues

### Critical (Must Fix)

**1. No error boundaries — any component crash takes down the entire dashboard**

- **Files:** All page components, `app/layout.tsx`
- **What's wrong:** There are zero React error boundaries in the entire application. If any component throws an unhandled error (e.g., accessing `.property` on `null`), the entire app crashes with a white screen.
- **Why it matters:** In production, a single failed API response shape or a timing race condition will crash the whole dashboard instead of showing a graceful fallback.
- **How to fix:** Add a top-level error boundary in `app/layout.tsx` wrapping `{children}`, and individual `error.tsx` files in each route segment. At minimum:
  ```tsx
  // app/dashboard/error.tsx
  "use client"
  export default function DashboardError({ error, reset }) {
    return (
      <div className="p-8 text-center">
        <h2>Something went wrong</h2>
        <button onClick={reset}>Try again</button>
      </div>
    )
  }
  ```

**2. Bulk assignment sends N sequential API calls with no error handling per call**

- **File:** `app/dashboard/accommodation/page.tsx:564-588`
- **What's wrong:** `assignMultipleAttendeesToRoom` loops through `attendeeIds` calling `fetch()` sequentially. If any single call fails mid-loop, the error is caught at the outer `try/catch` but individual failures are silently ignored. No rollback, no partial-success reporting.
- **Why it matters:** Users could think 10 attendees were assigned when only 3 succeeded. The UI then shows "Assigned 10 attendees" (line 580) even if only 3 actually worked.
- **How to fix:** Either use a bulk API endpoint, or collect per-call results and report accurate counts:
  ```tsx
  const results = await Promise.allSettled(ids.map(id => fetch(...)))
  const succeeded = results.filter(r => r.status === 'fulfilled').length
  setAssignmentMessage(`Assigned ${succeeded} of ${ids.length} attendees.`)
  ```

**3. Authentication token not included in fetch calls**

- **Files:** All `fetch()` calls across the app (e.g., `app/dashboard/page.tsx:209`, `app/dashboard/payments/page.tsx:84`)
- **What's wrong:** Every `fetch()` call is a plain `fetch(url)` with no Authorization header. The app relies entirely on cookie-based auth (Clerk's session cookies). While this works, there's no CSRF protection visible, and the API routes aren't explicitly validating `Origin` headers.
- **Why it matters:** If API routes are accessible without proper middleware validation, this is a security concern. More importantly, the `fetch` calls in server components vs client components may behave differently with cookies.
- **How to fix:** Verify that Clerk middleware is protecting all `/api/dashboard/*` routes. Add `credentials: "same-origin"` to fetch calls, or use Clerk's `getToken()` for explicit token-based auth on sensitive operations.

### Important (Should Fix)

**4. Typo in error message**

- **File:** `app/dashboard/attendees/page.tsx:157`
- **What's wrong:** `setErrorMessage("Field to load attendees.")` — should be "Failed to load attendees."
- **Why it matters:** Users see a grammatically incorrect error message.
- **How to fix:** Change to `"Failed to load attendees."`

**5. Missing null safety on attendee name initial avatar**

- **File:** `app/dashboard/attendees/[attendeeId]/page.tsx:188`
- **What's wrong:** `payload.attendee.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)` — if `name` is null, the optional chaining makes `initials` undefined, but the `<div>` at line 198 still renders it.
- **Why it matters:** An empty avatar with no initials is a poor UX for unnamed attendees.
- **How to fix:** Add a fallback: `initials ?? "??"`

**6. `as any` type cast on status select**

- **File:** `app/dashboard/orders/page.tsx:252`
- **What's wrong:** `onChange={(e) => setStatusInput(e.target.value as any)}` — the `as any` bypasses TypeScript checking.
- **Why it matters:** If someone adds a new option to the `<select>` without updating the type, it won't be caught at compile time.
- **How to fix:** Use a proper type assertion: `setStatusInput(e.target.value as "all" | CanonicalOrderStatus)`

**7. `formatMoney` is duplicated across 8+ files**

- **Files:** `app/dashboard/page.tsx:85-92`, `app/dashboard/financial/page.tsx:51-58`, `app/dashboard/orders/page.tsx:72-79`, `app/dashboard/reconciliation/page.tsx:84-91`, `components/payments/payment-list.tsx:57-64`, `components/payments/assign-dialog.tsx:33-40`, `components/dashboard/event-tikkie-section.tsx:70-77`, `app/dashboard/orders/[orderId]/page.tsx:71-78`, `app/dashboard/attendees/[attendeeId]/page.tsx:110-117`
- **What's wrong:** Identical `formatMoney` function copy-pasted into every file.
- **Why it matters:** If the currency format needs to change (e.g., switching from USD format to EUR locale format), you'd need to update 9+ files. This is a maintenance risk.
- **How to fix:** Extract to `lib/format.ts` and import everywhere.

**8. AssignDialog uses custom modal, not shadcn Dialog**

- **File:** `components/payments/assign-dialog.tsx:143-291`
- **What's wrong:** The dialog uses a manual `fixed inset-0 z-50` pattern with no focus trapping, no `aria-modal`, no `role="dialog"`, and no Escape key handler. The backdrop click only works on the backdrop div, not on escape key.
- **Why it matters:** Accessibility: keyboard users can tab behind the modal. Screen readers don't announce it as a dialog. Users can't dismiss with Escape.
- **How to fix:** Replace with the shadcn `Dialog` component (already imported in `components/ui/dialog.tsx`) which handles focus trapping, aria attributes, and escape key.

**9. Same custom modal anti-pattern in event-tikkie-section.tsx**

- **File:** `components/dashboard/event-tikkie-section.tsx:654-771` (create link modal) and `773-853` (assign modal)
- **What's wrong:** Same manual modal pattern with no accessibility support.
- **Why it matters:** Same accessibility issues as above.
- **How to fix:** Use shadcn `Dialog` component.

**10. `window.confirm()` for destructive action instead of proper confirmation dialog**

- **File:** `app/dashboard/orders/[orderId]/page.tsx:305-306`
- **What's wrong:** `window.confirm("Remove this order from local dashboard records?")` — native browser confirm dialogs are inaccessible, can't be styled, and block the main thread.
- **Why it matters:** Screen readers may not announce the dialog content. The UX is inconsistent with the rest of the app's styled components.
- **How to fix:** Use a shadcn `AlertDialog` or a custom confirmation modal with proper focus management.

**11. No `loading.tsx` or `Suspense` boundaries for route transitions**

- **Files:** All `app/dashboard/*/page.tsx` files
- **What's wrong:** There are no `loading.tsx` files in any dashboard route segments. When navigating between pages, there's no loading indicator until the client component mounts and starts fetching.
- **Why it matters:** Users click a navigation link and see nothing happen for 1-2 seconds while the page component loads.
- **How to fix:** Add `loading.tsx` files with skeleton placeholders in each route segment.

**12. Inline styles for progress bar widths**

- **File:** `app/dashboard/page.tsx:487`
- **What's wrong:** `style={{ width: `${width}%` }}` — while this works, it's mixing Tailwind with inline styles.
- **Why it matters:** Minor inconsistency, but inline styles bypass CSP if strict CSP is needed.
- **How to fix:** Use Tailwind's arbitrary value syntax or CSS variables. Alternatively, this is acceptable for dynamic values but should be documented.

### Minor (Nice to Have)

**13. `useState` initializer called on every render in `app/page.tsx`**

- **File:** `app/page.tsx:33-34, 42-43`
- **What's wrong:** `!isLoaded || !isSignedIn` is evaluated twice with the same condition. The two conditional blocks could be consolidated.
- **How to fix:** Merge into a single conditional or use a variable.

**14. Navigation section `title` used as React key**

- **File:** `app/dashboard/dashboard-shell.tsx:177`
- **What's wrong:** `key={section.title}` — using string labels as keys is fragile if labels ever change or contain duplicates.
- **How to fix:** Use a stable `id` field or the section index.

**15. Hardcoded pixel values in sidebar**

- **File:** `app/dashboard/dashboard-shell.tsx:165,171-172`
- **What's wrong:** `h-[calc(100svh-3rem)]`, `text-[11px]`, `text-[9px]`, `text-[10px]` — many arbitrary pixel values.
- **How to fix:** These are acceptable for fine-tuned spacing but could be extracted to CSS custom properties for consistency.

**16. Theme hotkey binds 'D' globally**

- **File:** `components/theme-provider.tsx:50-51`
- **What's wrong:** Pressing 'D' anywhere (outside input fields) toggles dark mode. This is undocumented and could confuse users.
- **How to fix:** Either remove the hotkey or document it visibly. Consider a more specific key combination.

**17. `console.error` left in production code**

- **File:** `components/payments/payment-list.tsx:157`
- **What's wrong:** `console.error("Failed to load payments:", error)` — in production, this leaks to browser console.
- **How to fix:** Use a proper error reporting service or remove.

**18. No ARIA labels on icon-only buttons in sidebar navigation**

- **File:** `app/dashboard/dashboard-shell.tsx:210-224`
- **What's wrong:** The expand/collapse buttons for sidebar navigation items have no `aria-label` or `aria-expanded` attributes (the mobile version at line 324-327 does have them).
- **How to fix:** Add `aria-label` and `aria-expanded` to desktop sidebar expand buttons.

**19. Inconsistent text casing**

- **Files:** Various
- **What's wrong:** Mix of "Conference OP" (dashboard-shell.tsx:263), uppercase tracking for labels, and sentence case for descriptions. Some error messages start lowercase.
- **How to fix:** Establish a consistent casing convention and apply it.

---

## Recommendations

### Performance

1. **Add React.memo to `PaymentList`** — Re-renders on every parent state change even when `refreshKey` hasn't changed.
2. **Virtualize long lists** — The reconciliation infinite scroll loads all rows into the DOM. For large conferences (1000+ orders), this could cause performance issues. Consider `@tanstack/react-virtual`.
3. **Debounce search inputs** — `app/dashboard/attendees/page.tsx` search input triggers a re-fetch on every keystroke without debouncing (the `applyFilters` is on form submit, which is good, but the input itself could benefit from debounce if you add live search).

### Accessibility

1. **Add skip navigation link** — No way to skip the sidebar on keyboard navigation.
2. **Add `aria-live` regions for loading/error states** — When data loads or errors appear, screen readers aren't notified.
3. **Ensure all interactive elements have focus indicators** — The `outline-none` class on inputs removes default focus rings without providing replacements.

### Maintainability

1. **Extract shared types** — `Payment`, `Order`, `CanonicalOrderStatus` types are duplicated across files.
2. **Create a shared `lib/format.ts`** for `formatMoney`, `formatDate`, `formatDateTime`.
3. **Add `not-found.tsx`** route segments for better 404 handling.
4. **Consider extracting the `useEffect` + fetch pattern** into a custom hook like `useApiData(url, deps)` to reduce boilerplate.

---

## Assessment

**Ready for production?** With fixes

**Reasoning:** The codebase has strong fundamentals — good TypeScript usage, proper loading/error states, abort controllers, and responsive design. However, the **complete absence of error boundaries** is a production blocker: a single component crash (e.g., from an unexpected API response shape) will take down the entire dashboard. The accessibility issues (custom modals without proper ARIA, missing focus management) also need attention before a public launch. Fix the 3 critical issues and the app is production-ready.

### Pillar Scores (for structured assessment)

| Pillar               | Score | Key Finding                                                                |
| -------------------- | ----- | -------------------------------------------------------------------------- |
| 1. Copywriting       | 3/4   | One typo ("Field to load"), otherwise clear and consistent                 |
| 2. Visuals           | 3/4   | Strong visual hierarchy, consistent badge system, good skeleton states     |
| 3. Color             | 3/4   | Proper use of CSS custom properties, no hardcoded hex values in components |
| 4. Typography        | 3/4   | Consistent size scale, many arbitrary pixel sizes but organized            |
| 5. Spacing           | 3/4   | Tailwind spacing used consistently, some arbitrary values                  |
| 6. Experience Design | 2/4   | No error boundaries, inaccessible modals, missing loading.tsx              |

**Overall: 17/24**

### Top 3 Priority Fixes

1. **Add error boundaries** — Wrap dashboard layout in error boundary + add `error.tsx` in each route segment. Prevents white-screen crashes in production.
2. **Replace custom modals with shadcn Dialog** — `assign-dialog.tsx`, `event-tikkie-section.tsx` modals lack focus trapping, aria attributes, and escape key handling. Use the existing `components/ui/dialog.tsx`.
3. **Fix bulk assignment race condition** — `accommodation/page.tsx:564-588` — Collect per-call results and report accurate success/failure counts instead of assuming all succeed.
