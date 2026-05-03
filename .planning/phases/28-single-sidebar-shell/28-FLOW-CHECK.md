# Phase 28 Flow Check: Single-Sidebar Event Shell

**Purpose:** verify route, loading, and navigation wiring before removing the event-local sidebar.

## Route / shell map

### 1) `/dashboard`
- `app/dashboard/layout.tsx` authenticates with `requirePageUser("/dashboard")`.
- `app/dashboard/dashboard-surface.tsx` treats this as a fullscreen route, so **no dashboard shell** is rendered.
- `app/dashboard/page.tsx` shows the fullscreen `EventPicker`.
- `app/dashboard/loading.tsx` is the fullscreen loading state for the picker entry.

### 2) `/dashboard/events`
- `app/dashboard/events/page.tsx` redirects back to `/dashboard`.
- This is a compatibility alias, not a real workspace surface.

### 3) `/dashboard/events/new`
- Also treated as fullscreen by `DashboardSurface`.
- Keeps the picker/create flow separate from event-scoped workspace chrome.

### 4) `/dashboard/events/[slug]` and nested event routes
- `DashboardSurface` wraps slug-scoped routes in `DashboardShell`.
- `DashboardShell` derives `currentSlug` from the pathname, so the switcher stays aligned on refresh/deep links.
- `app/dashboard/events/[slug]/layout.tsx` currently adds the **second sidebar** with event title, status, facts, and section nav.
- `app/dashboard/events/[slug]/page.tsx` is the event home.
- `app/dashboard/events/[slug]/overview/page.tsx` is a client-loaded data surface for the selected event.

## Picker → event shell flow

1. User lands on `/dashboard` after auth.
2. Picker shows the event list and creates/selects an event.
3. `EventSwitcher` pushes `/dashboard/events/${slug}`.
4. The slug route renders inside `DashboardShell`.
5. The event-local layout currently adds a second sidebar; Phase 28 should move that context into the main header/content strip.

## Switching / loading behavior

- `EventSwitcher` uses `router.push()` for event changes and the picker shortcut.
- Switching to a new slug should keep the global shell visible while the nested event content changes.
- `app/dashboard/events/[slug]/layout.tsx` returns skeletons while `useEventBySlug(slug)` is unresolved, then renders event context.
- `app/dashboard/events/[slug]/overview/page.tsx` fetches `/api/dashboard/*` data client-side and shows loading skeletons while requests are in flight.

## Direct-link / refresh behavior

- Direct entry to `/dashboard/events/[slug]` or deeper pages should still resolve the slug from the URL.
- Because `currentSlug` is path-derived, the switcher should stay on the correct event after refresh.
- If the slug is invalid, the event layout shows “Event not found” with a back-to-picker link.
- The dashboard-level auth gate runs before the workspace renders, so unauthenticated users should be redirected before shell chrome matters.

## Integration risks if the second sidebar is removed

1. **Lost route discovery** – the event-local sidebar currently owns section navigation for attendees, tickets, payments, sources, settings, etc.
2. **Lost event context** – title, slug, status, public-page link, and back-to-picker affordances must be relocated or the shell becomes ambiguous.
3. **Bad deep-link UX** – slug routes must still feel scoped on refresh; do not move slug state into transient client state.
4. **Blank loading gaps** – if the new header strip does not carry loading skeletons, event pages may feel empty while `useEventBySlug`/API calls resolve.
5. **Switcher regression** – the global shell must keep `EventSwitcher` visible and obvious, or users lose a fast way to change scope.

## Verification checklist

- [ ] `/dashboard` stays fullscreen picker only.
- [ ] `/dashboard/events` still redirects to `/dashboard`.
- [ ] `/dashboard/events/[slug]` renders one shell only.
- [ ] Event switcher still changes slugs from the shell.
- [ ] Deep links and refresh keep the active slug visible.
- [ ] Invalid slugs still fall back to picker safely.
- [ ] Event context/nav moved out of the removed sidebar is still discoverable.
- [ ] Loading states remain usable while event data/API calls resolve.
