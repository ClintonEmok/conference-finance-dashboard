# Phase 28 UX/IA Review: Single-Sidebar Event Shell

**Date:** 2026-04-21
**Focus:** User experience and information architecture after selecting an event

---

## What the User Sees and Feels Today

After selecting an event from the picker, a user lands on `/dashboard/events/[slug]` and immediately faces **two sidebar columns**:

1. **Global sidebar** (`dashboard-shell.tsx`, ~80px collapsed / icon mode): Logo + `EventSwitcher` + LogoutButton
2. **Event-local aside** (`events/[slug]/layout.tsx`, 320px fixed): Three stacked sections — "Event workspace" (title, slug, status, action buttons), "Navigate" (7 nav items with icons/descriptions), "Event facts" (starts, timezone, currency, accommodation)

The content column starts after these two columns. The event-local aside uses `xl:sticky xl:top-20` so it stays in view while scrolling.

### What this feels like

- **Heavy and nested** — Two layers of chrome before any task content appears
- **Duplicative** — Event title appears in both `EventSwitcher` (compact, inside global sidebar) and "Event workspace" section (full, inside event-local aside). "Back to picker" appears in both `EventSwitcher` (button) and event-local aside (button).
- **Uncertain hierarchy** — User can't immediately tell which sidebar is "primary" for navigation; both have navigation-like elements

---

## Why the Two-Sidebar Pattern is Confusing or Heavy

### Visual weight is backwards

The global sidebar (~80px wide, icon mode available) carries the logo and the `EventSwitcher` but is visually thin. The event-local aside (320px, always visible) dominates with three dense sections. A user would naturally assume the wider, more content-rich column is the primary navigation — but it's event-specific chrome, not primary navigation.

### Navigation is split across both sidebars

- `EventSwitcher` (global): Contains event list + "Picker" escape hatch
- Event-local "Navigate" section: Overview, Contact people, Tickets, Accommodation, Finance, Sources, Settings

This means navigating to a different section of the same event requires the user to look in the event-local aside, but switching events requires the global sidebar. The two jobs are separated but the separation isn't obvious from the UI.

### Event context is redundant

The event-local aside "Event workspace" section shows:
- Title (already shown in `EventSwitcher`)
- Slug (already derivable)
- Status badge (already visible)
- "Public page" button
- "Back to picker" button

`EventSwitcher` already shows the active event title and has a "Picker" escape. The duplication creates visual noise and implies these are different things when they're the same thing displayed twice.

### Sticky behavior creates a trapped feel

The event-local aside sticks at `top-20` during scroll. Combined with the global sidebar, this means the entire left ~400px of the viewport is locked chrome. The user can't scroll it away, and at certain viewport widths it creates awkward overflow behavior.

---

## Which Surfaces Should Be Visually Primary vs Secondary

### Primary: Event content area (content column)

The page title, task-specific content, and any in-content navigation should be the dominant visual surface. Today this is the rightmost column after both sidebars.

### Secondary: Single authoritative sidebar

One sidebar should carry event context (title/status, not redundant) and navigation. It should be:
- **Narrower** than today's 320px event-local aside
- **Not duplicated** with event title already shown in switcher
- **Not sticky** or at least not covering the full left side

### Transition: Header strip inside content area

Event metadata (title, slug, status, public page link, back-to-picker) should live in a compact header strip above the content — not in the sidebar at all. This is already partially started in `EventOverviewPage` (lines 113–135 show event title + status badge in a header block) but the pattern isn't consolidated.

---

## The Cleanest Event-Scoped Mental Model

The user is inside **one workspace for one event**. There is one sidebar that does one job: navigation and switching. Everything else about the event — title, slug, status, links — lives in a compact header strip at the top of the content area.

**Mental model rules:**
- One sidebar, one job → event-scoped navigation
- Event switcher lives in the sidebar (already true)
- Event metadata lives above content (compact header strip)
- Route-specific content is the primary surface

**What this means for chrome:**
- Global sidebar: Logo + EventSwitcher + logout (no redundant event context)
- Compact header: Title / slug / status / public page link / back-to-picker (one line or small strip)
- Content: Primary surface, no sidebar chrome

---

## Smallest UI Direction That Removes Duplication While Keeping the App Usable

### What to remove

1. **Remove the entire event-local aside** (`events/[slug]/layout.tsx` 320px column). Delete the three-section stacked panel ("Event workspace", "Navigate", "Event facts").

### What to keep / relocate

2. **Event metadata (title, slug, status, public page link, back-to-picker)**: Move into a compact header section above the content. This already exists partially in `EventOverviewPage` header — generalize it into a shared `EventPageHeader` component or inline it in the layout as a single strip.

3. **Navigation items** (Overview, Contact people, Tickets, etc.): These belong inside the content area — either as a horizontal tab strip below the compact header, or as a narrower secondary column within the content grid. The nav items have rich descriptions (used for tooltips on desktop) which suggest a compact sidebar within the content area is better than a tab strip. A narrow (~240px) in-content nav column keeps the descriptions readable without competing with the main content.

4. **EventSwitcher**: Stays in the global sidebar. Already correct.

### Minimum viable change

The smallest meaningful change is:
- `events/[slug]/layout.tsx` renders a compact event header strip (title, slug, status badge, public-page link, back-to-picker) instead of the 320px aside
- Nav items render as a compact horizontal nav or in-content secondary nav
- Event facts (starts, timezone, currency) move into the compact header or a small callout within the page, not as a sidebar panel

This preserves:
- Event switching via `EventSwitcher` in global sidebar
- Deep-linking to any `/dashboard/events/[slug]` route
- Fullscreen picker entry point (untouched, per phase context)
- Direct slug-based entry and reload behavior

This eliminates:
- The second sidebar column entirely
- Duplicate event title/status in both global and event-local chrome
- The "Event workspace" / "Event facts" / "Navigate" stacked sections as sidebar panels

---

## Document Path

`.planning/phases/28-single-sidebar-shell/28-UX-IA-REVIEW.md`

## Key UX/IA Finding

**The event-local 320px aside is the root of the problem.** It duplicates event context already visible in `EventSwitcher`, creates two navigation surfaces, and locks a large chunk of viewport as sticky chrome. The minimum fix is: remove the event-local aside, move its event metadata (title, slug, status, links) into a compact content-header strip, and route navigation into the content area as a narrower in-content nav column. This gives one sidebar one job and makes event-scoped pages feel like a single clean workspace rather than two nested dashboards.