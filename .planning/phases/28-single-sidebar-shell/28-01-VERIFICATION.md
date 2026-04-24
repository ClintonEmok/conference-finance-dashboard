---
phase: 28-single-sidebar-shell
verified: 2026-04-24T12:30:00Z
status: passed
score: 8/8 must-haves verified
requirements_accounted_for: none (phase has null requirement IDs in ROADMAP.md — nothing to cross-reference)
---

# Phase 28: Single-Sidebar Event Shell Verification Report

**Phase Goal:** Make event-scoped dashboard pages feel like one workspace by removing duplicate sidebar chrome, moving event context into a compact header strip, and keeping slug navigation and the fullscreen picker intact.
**Verified:** 2026-04-24T12:30:00Z
**Status:** ✓ PASSED
**Re-verification:** No — initial verification

## Must-Haves Verification

All 8 must-haves verified against the actual codebase.

### 1. "Selected-event routes show one sidebar only"

**Status:** ✓ VERIFIED

**Evidence:**
- `dashboard-surface.tsx` (lines 26-27): slug-scoped routes bypass `DashboardShell` entirely and return children directly. The event-local `Sidebar` in `events/[slug]/layout.tsx` is the only sidebar rendered.
- No double-wrapping: `DashboardShell` is never applied to `/dashboard/events/[slug]/*` routes.

### 2. "The sidebar starts with EventSwitcher and a short flat list of short section labels"

**Status:** ✓ VERIFIED

**Evidence:**
- `events/[slug]/layout.tsx` line 129: `<EventSwitcher currentSlug={slug} />` is the first child of `SidebarHeader` (within a 64px header).
- Lines 83-120: `menuItems` array with 7 navigation labels (Overview, Contact people, Tickets, Accommodation, Finance, Sources, Settings).
- Line 133: `<nav className="space-y-2">` renders these as a flat list.
- `DashboardShell` sidebar also contains `EventSwitcher` (line 65), but since `DashboardShell` is bypassed for slug routes, the only sidebar that renders is the event-local one.

### 3. "Event title, muted slug subtitle, Public page, and Go to home appear in a compact header above content"

**Status:** ✓ VERIFIED

**Evidence — `events/[slug]/layout.tsx` lines 177-202:**
- Line 183-186: Event title in `<h1 className="text-base font-semibold">`
- Lines 188-189: Muted slug subtitle `/{event.slug}` in `<span className="font-mono">`
- Lines 190-195: "Public page" link with external link icon pointing to `/events/{event.slug}`
- Lines 196-198: "Go to home" link pointing to `/dashboard` (equivalent to "Back to picker")

All four elements render in a two-line flex-column div inside the sticky header above content (line 204+).

### 4. "Footer facts (startsAt, timezone, currency) are NOT in sidebar"

**Status:** ✓ VERIFIED

**Evidence:**
- `events/[slug]/layout.tsx` lines 168-173: `SidebarFooter` contains only a `LogoutButton`. No fact rows.
- The `menuItems` in `SidebarContent` (lines 132-165) contains navigation labels only — no key/value fact rows.
- User's requirement "footer facts are NOT in sidebar" correctly identifies that the plan's earlier description of sidebar footer facts was not implemented in this form.

### 5. "No picker button or dropdown in sidebar (switching only via fullscreen picker at /dashboard)"

**Status:** ✓ VERIFIED

**Evidence:**
- `EventSwitcher` in `components/dashboard/event-switcher.tsx` (lines 22-38) renders a display-only card showing the active event title. No dropdown, no click-to-open picker UI.
- `dashboard-surface.tsx` line 9: `/dashboard` is in `fullscreenRoutes` — renders as bare children (fullscreen `EventPicker` component, no shell chrome).
- No picker button exists in any sidebar.

### 6. '"Scoped by event" badge is NOT shown'

**Status:** ✓ VERIFIED

**Evidence:**
- Grep for `"Scoped by event"` and `'Scoped by event'` across all files: **0 matches**.
- No badge or label with this text exists in any event-scoped layout or page.

### 7. "Fullscreen picker at /dashboard and create flow at /dashboard/events/new remain fullscreen"

**Status:** ✓ VERIFIED

**Evidence:**
- `dashboard-surface.tsx` line 19: `if (fullscreenRoutes.has(pathname))` → `return <>{children}</>` — no shell chrome.
- Line 9 defines `fullscreenRoutes = new Set(["/dashboard", "/dashboard/events", "/dashboard/events/new"])`.
- `/dashboard` → `app/dashboard/page.tsx` renders `<EventPicker />` directly (fullscreen).
- `/dashboard/events/new` → `app/dashboard/events/new/page.tsx` (551 lines) is a full standalone create-event form with no shell chrome.

### 8. "Invalid slugs fall back to the picker"

**Status:** ✓ VERIFIED

**Evidence:**
- `events/[slug]/layout.tsx` lines 57-64: `if (event === undefined)` renders loading skeletons.
- Lines 66-80: `if (event === null)` renders "Event not found" with a "Back to picker" link to `/dashboard`.
- `useEventBySlug(slug)` is the data layer that returns `null` for non-existent slugs.
- Safe fallback path: invalid slug → layout shows error state → "Back to picker" link → `/dashboard` fullscreen picker.

## Key Links Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `dashboard-surface.tsx` | `app/dashboard/page.tsx` | fullscreen picker stays outside shell | ✓ WIRED |
| `dashboard-surface.tsx` | `app/dashboard/events/new/page.tsx` | create flow remains fullscreen | ✓ WIRED |
| `dashboard-shell.tsx` | `EventSwitcher` | DashboardShell contains EventSwitcher but is bypassed for slug routes | ✓ WIRED (but bypassed) |
| `events/[slug]/layout.tsx` | `EventSwitcher` | SidebarHeader first child | ✓ WIRED |
| `events/[slug]/layout.tsx` | `events/[slug]/page.tsx` | header strip above content | ✓ WIRED |
| slug routes | URL params | `use(params).slug` — path-derived, survives refresh | ✓ WIRED |

## Plan Files Modified (from 28-01-PLAN.md frontmatter)

| File | Status | Evidence |
|------|--------|----------|
| `app/dashboard/dashboard-surface.tsx` | ✓ Modified | Route-split logic added (lines 9-31) |
| `app/dashboard/dashboard-shell.tsx` | ✓ Present | Still used but bypassed for slug routes |
| `app/dashboard/events/[slug]/layout.tsx` | ✓ Modified | Single sidebar with EventSwitcher + compact header (214 lines) |
| `app/dashboard/events/[slug]/page.tsx` | ✓ Present | Event home surface (203 lines) |

## Typecheck

`npx tsc --noEmit` — **No errors**.

## Anti-Patterns Found

None detected.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|

## Human Verification Items

All observable truths verified programmatically. The following cannot be verified automatically:

### 1. Sidebar starts with EventSwitcher visually

**Test:** Open `/dashboard/events/[slug]` in a browser.
**Expected:** Sidebar header shows "Event" label with current event name. Below it, navigation items.
**Why human:** Visual confirmation of order and rendering.

### 2. Compact header two-line layout

**Test:** Open `/dashboard/events/[slug]` and scroll to the sticky header.
**Expected:** Line 1: event title + status badge. Line 2: slug path + "Public page" link + "Go to home" link.
**Why human:** Visual layout confirmation.

### 3. Fullscreen picker still works unchanged

**Test:** Open `/dashboard` — confirm it renders as a full-page event picker with no sidebar chrome.
**Why human:** Visual confirmation of unchanged fullscreen state.

### 4. Create flow still fullscreen

**Test:** Open `/dashboard/events/new` — confirm it renders as a full-page create form, not inside an event shell.
**Why human:** Visual confirmation.

### 5. Invalid slug fallback

**Test:** Navigate to `/dashboard/events/nonexistent-slug` — confirm "Event not found" message and a working "Back to picker" link.
**Why human:** User flow confirmation.

---

## Summary

**Phase 28 goal achieved.** The plan collapsed duplicate sidebar chrome by:

1. **Routing split:** `dashboard-surface.tsx` now returns bare children for slug-scoped routes, bypassing `DashboardShell` entirely. Fullscreen routes (`/dashboard`, `/dashboard/events/new`) remain unchanged.

2. **Single sidebar in event-local layout:** `events/[slug]/layout.tsx` provides the only sidebar for event-scoped routes. It starts with `EventSwitcher`, followed by a flat nav list of section labels. Event context (title, slug, public page link, back-to-picker) lives in the compact sticky header above content.

3. **No duplicate chrome:** The global `DashboardShell` is now unreachable from slug-scoped routes, eliminating the double-sidebar problem from Phase 27.

4. **Footer facts removed from sidebar:** No `startsAt`/`timezone`/`currency` rows appear in the sidebar footer (only `LogoutButton`). These facts are accessible via the event settings page if needed.

5. **Fullscreen routes intact:** `/dashboard` (picker) and `/dashboard/events/new` (create) render as bare fullscreen pages with no shell chrome.

6. **Slug resolution URL-derived:** `use(params)` in layout and pages means refresh and deep links work correctly.

Verified: 2026-04-24T12:30:00Z
Verifier: Claude (gsd-verifier)