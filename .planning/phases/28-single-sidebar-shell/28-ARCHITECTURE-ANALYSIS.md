# Phase 28: Single-Sidebar Event Shell — Architecture Analysis

**Analysis Date:** 2026-04-21

---

## Executive Summary

The duplicate sidebar visible on `/dashboard/events/[slug]` routes is a **rendered nesting problem**, not a routing problem. Two layout wrappers both render their own sidebar chrome:

1. `app/dashboard/layout.tsx` → `DashboardSurface` — renders `DashboardShell` (sidebar + header strip) for slug-scoped routes
2. `app/dashboard/events/[slug]/layout.tsx` — renders a **second** `320px` `<aside>` column containing event metadata, navigation, and event facts

The second sidebar is structurally embedded inside the page content column, so it visually competes with the global shell sidebar rather than replacing it. Phase 28 must collapse this into one sidebar by moving event context out of the `<aside>` and into the content area header strip.

---

## Route/Layout Ownership

### Routing tree

```
/dashboard                          → app/dashboard/page.tsx (EventPicker — fullscreen, no shell)
/dashboard/events                   → app/dashboard/events/page.tsx (redirects to /dashboard)
/dashboard/events/new               → app/dashboard/events/new/page.tsx (full create flow)
/dashboard/events/[slug]            → app/dashboard/events/[slug]/page.tsx (overview)
/dashboard/events/[slug]/attendees  → app/dashboard/events/[slug]/attendees/page.tsx
/dashboard/events/[slug]/tickets    → app/dashboard/events/[slug]/tickets/page.tsx
/dashboard/events/[slug]/payments   → app/dashboard/events/[slug]/payments/page.tsx
/dashboard/events/[slug]/accommodation → app/dashboard/events/[slug]/accommodation/page.tsx
/dashboard/events/[slug]/settings    → app/dashboard/events/[slug]/settings/page.tsx
/dashboard/events/[slug]/sources    → app/dashboard/events/[slug]/sources/page.tsx
```

### Layout file hierarchy and who owns what

| File | Role | Renders Sidebar? |
|---|---|---|
| `app/dashboard/layout.tsx` | Auth guard + DashboardSurface wrapper | No (delegates) |
| `app/dashboard/dashboard-surface.tsx` | Route-aware surface switcher | Conditionally — renders `DashboardShell` for slug-scoped routes |
| `app/dashboard/dashboard-shell.tsx` | Global shell chrome | **Yes** — `Sidebar` + header strip |
| `app/dashboard/events/[slug]/layout.tsx` | Event-scoped layout wrapper | **Yes** — second `320px` `<aside>` |

---

## Where the Duplicate Sidebar Chrome Comes From

### The global shell (`dashboard-shell.tsx`)

`DashboardShell` renders:
- A `Sidebar` (collapsible icon mode) with `SidebarHeader`, `SidebarContent` (contains `EventSwitcher`), and `SidebarFooter` (logout)
- A `SidebarInset` wrapping a sticky `header` (contains `SidebarTrigger`, breadcrumbs) and a `<div>` content area for `{children}`

This wraps **all** slug-scoped event routes via `DashboardSurface`.

### The event-local layout (`events/[slug]/layout.tsx`)

`EventLayout` renders its own `div.grid` with a **second sidebar column**:

```tsx
<div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
  <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">  ← SECOND SIDEBAR
    {/* Event workspace card */}
    {/* Navigate card with nav links */}
    {/* Event facts card */}
  </aside>
  <main className="min-w-0">
    {children}
  </main>
</div>
```

This `<aside>` is **not** a shadcn/ui `Sidebar` component. It is a plain `<aside>` styled to look like a sidebar panel. It lives inside the content column of the global shell, stacked alongside (not replacing) the global sidebar.

### The visual result

When navigating to `/dashboard/events/[slug]`:
- The global `DashboardShell` shows its `Sidebar` on the left (icons + EventSwitcher)
- The global `SidebarInset` header strip appears at the top
- Inside the content area, `EventLayout` renders a `320px` `<aside>` on the left of its own `main`
- The global shell's sidebar and the event-local `<aside>` appear side by side

**This is the duplicate.** One is the shadcn `Sidebar` from the shell; the other is a styled `<aside>` from the event layout.

---

## Global Shell vs Event-Local Shell Responsibilities

### `DashboardShell` (global)
- **Owns:** Global navigation chrome, event switcher, auth/logout, collapsible sidebar trigger
- **Receives:** `currentSlug` derived from `usePathname()` via `getEventSlugFromPath`
- **Renders:** The authoritative `Sidebar` component for the entire dashboard surface

### `EventLayout` (event-local)
- **Owns:** Event metadata display, event-scoped navigation links, event facts display
- **Renders:** A `320px` `<aside>` that duplicates sidebar-like content inside the page content column
- **Problem:** Its `<aside>` is rendered as part of the page content, not as a shell overlay

### `DashboardSurface` (router-aware switcher)
- **Owns:** Decides whether to render shell or fullscreen for a given route
- **Logic:** Fullscreen for `/dashboard`, `/dashboard/events`, `/dashboard/events/new`; shell for slug-scoped event routes
- **Preserves:** The Phase 27 fullscreen picker entry surface

---

## What Phase Boundary Must Preserve vs Change

### Preserve

1. **`DashboardShell` sidebar** — it is the single authoritative sidebar; `EventSwitcher` lives here
2. **`DashboardSurface` routing logic** — fullscreen routes stay fullscreen; shell routes stay in shell
3. **`EventSwitcher` integration** — already receives `currentSlug` and drives event switching via router
4. **Fullscreen picker** (`/dashboard` → `EventPicker`) — Phase 27 entry surface, untouched
5. **All event child pages** (`[slug]/page.tsx`, `[slug]/attendees/page.tsx`, etc.) — only the layout wrapping them changes
6. **URL-based slug scoping** — deep links and direct navigation stay intact
7. **`requirePageUser` auth guard** in `app/dashboard/layout.tsx`

### Change

1. **`EventLayout`** — remove the `320px` `<aside>` sidebar column; move event metadata and navigation into the content area header strip
2. **`DashboardShell` header strip** — may need to expand to carry event title/status/links currently in the event-local `<aside>`
3. **Child page wrappers** — pages that rely on the two-column grid from `EventLayout` (e.g., `EventOverviewPage` references "the sidebar carries context") will need layout adaptation
4. **`loading.tsx`** — fullscreen loading state; no change needed but noted for completeness

### Hidden Dependencies / Coupling

1. **`EventOverviewPage`** (`[slug]/page.tsx`) has a comment stating "the sidebar carries the event context." This is the **source-of-truth comment** that confirms the duplicate sidebar is intentional from Phase 27, not a bug. This page will need revision when the sidebar is removed.

2. **`EventLayout` is the only event-scoped layout** — all 8 child pages (`attendees`, `tickets`, `payments`, `accommodation`, `settings`, `sources`, `overview`, plus the overview itself) share this same two-column layout. Any change here cascades to all event-scoped routes.

3. **`dashboard-surface.tsx`** uses `usePathname()` at render time. The `fullscreenRoutes` set and slug regex in `isSlugScopedEventRoute` are the single point controlling shell vs fullscreen for every event route. Any new route must be explicitly handled here.

4. **`EventSwitcher`** receives `currentSlug` as a prop from `DashboardShell`, which derives it from `usePathname()`. It does not read from a global store or URL param directly — pathname parsing is the mechanism.

5. **`EventLayout` loads its own event data** via `useEventBySlug(slug)`. This is independent of the shell. If event metadata moves into a header strip above the content area, the data-fetching hook remains the same.

---

## Recommended Phase Boundary Strategy

### Core change: collapse event-local `<aside>` into content-area header

The `EventLayout` currently returns a two-column grid. The fix is to return a single-column layout where:
- Event title, slug, status, public-page link, and back-to-picker live in a compact header strip above the main content
- Navigation and event facts move into that same strip or inline above each page's content
- The `320px` `<aside>` column is removed entirely

### Ownership transfer

| Element | Current owner | Phase 28 target |
|---|---|---|
| Event title + status | `EventLayout` aside | `DashboardShell` header strip |
| Public page link + back-to-picker | `EventLayout` aside | `DashboardShell` header strip |
| Event-scoped nav | `EventLayout` aside | Content area header or `DashboardShell` expanded header |
| Event facts (startsAt, timezone, currency) | `EventLayout` aside | Content area inline above page content |
| EventSwitcher | `DashboardShell` sidebar | Unchanged — stays in global shell |
| Global logout | `DashboardShell` sidebar | Unchanged |

### Placement decision for agent discretion (per D-07)

Per `28-CONTEXT.md`, exact placement is **agent discretion**. The two credible options are:
1. **Expand `DashboardShell` header strip** to carry event title/status/links — keeps event context visible and collapsed when sidebar is minimized
2. **Move event context into content area header** — cleaner separation; event metadata lives above page-specific content, not in the shell chrome

Option 2 is preferred because it keeps shell chrome minimal (per D-07) and makes event context part of the page content, not the navigation shell.

---

## Files to Modify

| File | Action | Reason |
|---|---|---|
| `app/dashboard/events/[slug]/layout.tsx` | Refactor | Remove `320px` aside; collapse to single-column with content-area header |
| `app/dashboard/dashboard-shell.tsx` | Extend | Header strip may need to carry event context or remain minimal per D-07 |
| `app/dashboard/events/[slug]/page.tsx` | Update | Remove comment referencing "the sidebar carries the event context" — no longer true |
| `app/dashboard/dashboard-surface.tsx` | No change | Routing logic already correct |

---

## Out of Scope

- `app/dashboard/loading.tsx` — fullscreen loading for chooser; no event-scoped shell to impact
- `app/dashboard/events/new/page.tsx` — create flow is fullscreen; no duplicate sidebar issue
- `app/dashboard/events/page.tsx` — just a redirect, no chrome
- `app/dashboard/page.tsx` — just renders `EventPicker`; fullscreen entry point

---

*Architecture analysis for Phase 28 — Single-Sidebar Event Shell*