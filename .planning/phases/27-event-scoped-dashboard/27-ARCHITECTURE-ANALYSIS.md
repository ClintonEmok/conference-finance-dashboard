# Phase 27: Event-Scoped Dashboard — Architecture Analysis

**Analysis Date:** 2026-04-21
**Phase:** 27-event-scoped-dashboard
**Milestone:** v3.0 Canonical Orders Foundation

---

## Executive Summary

Phase 27 restructures the admin dashboard entry point so authenticated users land on an event chooser and operate within an event-scoped shell rather than the current broad global command center at `/dashboard`. The work is primarily a routing and shell composition change; the canonical order/payable data model (the focus of phases 28–31) is unaffected.

**What changes:** The post-login landing moves from a cross-event overview (`app/dashboard/page.tsx`) to an event-first chooser (surfacing `app/dashboard/events/page.tsx` or a new entry surface). The global `DashboardShell` sidebar (`app/dashboard/dashboard-shell.tsx`) narrows from platform-scoped navigation to event-scoped or event-switching navigation. Existing event-scoped routes (`/dashboard/events/[slug]/*`) become the primary working context and must remain functional.

**What does not change:** The canonical finance tables, order/payable data model, API contracts, Convex schema, and all `/api/dashboard/*` endpoints are entirely out of scope for this phase. The `manage-orders`, `reconciliation`, `payments`, `attendees`, and `accommodation` pages continue to work as cross-event or event-filtered surfaces via query params; no route deletion is required unless a plan specifically decides to consolidate redundant routes.

**Net effect:** Phase 27 is a landing/chooser rewire with modest shell narrowing. The risk is concentrated in URL compatibility (bookmarks, direct links, `eventId` query param flows) and the decision of whether `/dashboard/manage-orders` should become event-mandatory. The bulk of the phase is routing and navigation composition, not data modeling.

---

## Current Architecture Map

### Route Tree

```
app/dashboard/
├── layout.tsx                  # Auth wrapper → DashboardShell
├── page.tsx                    # GLOBAL command center (cross-event) ← REPLACED
├── loading.tsx                 # Skeleton for global page
├── error.tsx                   # Global error boundary
├── dashboard-shell.tsx         # Sidebar nav + header + breadcrumbs ← MODIFIED
│
├── events/
│   ├── page.tsx                # Event index/chooser (exists) ← BECOMES ENTRY?
│   ├── new/page.tsx            # Create event
│   └── [slug]/
│       ├── page.tsx            # Event hub (quick routes) ← EXISTING
│       ├── layout.tsx          # Event-scoped sub-shell (active event card + nav) ← EXISTS
│       ├── overview/page.tsx   # Event finance/orders drilldown ← EXISTS
│       ├── attendees/page.tsx  # Event attendees ← EXISTS
│       ├── tickets/page.tsx     # Ticket types ← EXISTS
│       ├── accommodation/page.tsx
│       ├── payments/page.tsx    # Event Tikkie + finance assignment
│       ├── sources/page.tsx
│       └── settings/page.tsx
│
├── manage-orders/
│   ├── page.tsx                # Primary operator order ledger (eventId filter) ← CROSS-EVENT
│   └── [orderId]/page.tsx      # Order detail
│
├── orders/                     # Legacy redirect only
│   └── page.tsx                # → redirect("/dashboard/manage-orders")
│
├── financial/page.tsx          # Cross-event revenue drilldown (eventId filter)
├── reconciliation/page.tsx     # Cross-event reconciliation (eventId filter)
├── payments/page.tsx           # Cross-event payment management
├── attendees/page.tsx          # Cross-event attendee directory (eventId filter)
│
├── accommodation/
│   ├── page.tsx                # Event-scoped accommodation workspace (requires eventId)
│   ├── [event-slug]/page.tsx   # Event room matrix
│   └── rooms/[roomId]/page.tsx
│
├── integrations/page.tsx       # System-level (no event context)
├── ticket-tailor/sync/page.tsx
├── settings/ticket-types/page.tsx
└── email-preview/page.tsx
```

### Shell Composition

**`app/dashboard/layout.tsx` (14 lines)**
- Server component. Calls `requirePageUser()` then renders `DashboardShell`.
- No event context propagation; user email is the only context passed.

**`app/dashboard/dashboard-shell.tsx` (343 lines)**
- `"use client"`. Uses `usePathname()` to determine active state.
- `navigationSections` defines 5 top-level sections: Overview, Events, Finance, Operations, System.
- Active detection uses `isPathActive()` with `pathname === href || pathname.startsWith(`${href}/`)`.
- Auto-collapse logic: entering a "scoped" detail view (`/dashboard/events/[slug]`, `/dashboard/manage-orders/[orderId]`, etc.) collapses the sidebar from icon-only to closed.
- `scopedPatterns` regex list determines "scoped" state (lines 159-167):
  ```ts
  /^\/dashboard\/events\/(?!new$)[^/]+/,
  /^\/dashboard\/manage-orders\/[^/]+/,
  /^\/dashboard\/orders\/[^/]+/,
  /^\/dashboard\/attendees\/[^/]+/,
  /^\/dashboard\/accommodation\/(?!inventory$)[^/]+/,
  ```
- User email displayed in footer; no event context in shell.

**`app/dashboard/events/[slug]/layout.tsx` (191 lines)**
- `"use client"`. Fetches event by slug via `useEventBySlug(slug)`.
- Renders: (1) event card with title/status, (2) sub-navigation with 7 menu items.
- Menu items: Event overview, Contact people, Tickets, Accommodation (conditional), Finance, Sources, Settings.
- Uses `usePathname()` for active link highlighting.
- "View public page" link goes to `/events/${slug}` (external).

### Landing/Chooser Flow

**Current: `/dashboard` → Global Command Center**

`app/dashboard/page.tsx` (753 lines) renders:
- "Global overview" header + cross-event CTA cards
- 4 metric cards (order value, paid, refunded, net)
- Event overviews grid (first 6 events, links to `/dashboard/events/${slug}/overview`)
- Trend table (global order trend, cross-event)
- Contact people snippet table (cross-event)
- Order status mix sidebar
- Quick actions (4 links: manage-orders, events, financial, reconciliation)

This page fetches from `/api/dashboard/revenue` and `/api/dashboard/attendees` with optional `eventId` filter. No mandatory event scoping.

**Candidate to become entry: `app/dashboard/events/page.tsx` (320 lines)**

Already renders:
- Event index table with status filter and search
- "New Event" button
- Empty state when no events exist
- Click row → `router.push(\`/dashboard/events/${event.slug}\`)`

This is the closest existing surface to the described chooser. Reuse is explicitly called out in 27-CONTEXT.md (D-03): "Reuse the existing `/dashboard/events` list surface as the chooser candidate."

**Event-scoped working context: `app/dashboard/events/[slug]/page.tsx` (242 lines)**
- Event hub card (title, description, 3 CTA buttons)
- 4 stat cards (contact people, ticket types, hotels linked, submissions)
- Quick routes grid (6 links: overview, contact people, tickets, finance, rooms, settings)
- Event context card (start, timezone, currency, accommodation)

The event hub is a router surface, not a data-heavy page. It dispatches to child pages but holds no canonical state itself.

---

## Event-Scoping Model

**Existing pattern:** `app/dashboard/events/[slug]/layout.tsx` establishes event context for all child routes under `[slug]`. The event slug comes from the URL; no query param is required. All child pages (`overview`, `attendees`, `tickets`, `payments`, `accommodation`, `sources`, `settings`) inherit the same event context through the layout.

**What is not yet event-scoped:**
- `/dashboard` — global cross-event landing
- `/dashboard/financial` — cross-event revenue
- `/dashboard/reconciliation` — cross-event reconciliation
- `/dashboard/payments` — cross-event payment management
- `/dashboard/manage-orders` — cross-event order ledger (accepts `eventId` query param optionally)
- `/dashboard/attendees` — cross-event attendee directory (accepts `eventId` query param optionally)
- `/dashboard/accommodation` — requires eventId in query params (redirects to event selector if absent)
- `/dashboard/orders` — legacy redirect only

**URL state pattern for event-scoped pages:**

Event-scoped pages use URL slug (`[slug]`) as the primary event identifier. Event-filtered cross-event pages use `?eventId=` query param. This is a dual-key pattern that will require handling during the phase 27 refactor.

---

## URL/State Dependencies

### Cross-Event Routes with `eventId` Query Param

| Route | Accepts `eventId`? | Behavior without `eventId` |
|-------|-------------------|---------------------------|
| `/dashboard/manage-orders` | Yes (optional) | Shows all events |
| `/dashboard/financial` | Yes (optional) | Aggregates all events |
| `/dashboard/reconciliation` | Yes (optional) | Aggregates all events |
| `/dashboard/attendees` | Yes (optional) | Shows all events |
| `/dashboard/accommodation` | Yes (mandatory) | Renders event selector, not workspace |

### Event-Scoped Routes (URL slug)

All routes under `/dashboard/events/[slug]/*` use slug as primary key. The Convex hook `useEventBySlug(slug)` fetches the event document. No `eventId` query param required.

### Bookmarks and Direct Links

The following routes are likely to be bookmarked or shared:
- `/dashboard/manage-orders` — operator entry point
- `/dashboard/events/${slug}/overview` — event drilldown
- `/dashboard/events/${slug}/attendees` — attendee list
- `/dashboard/events/${slug}/payments` — finance surface
- `/dashboard/accommodation/${slug}` — room matrix

All of these must remain functional. The phase 27 changes should not break direct navigation to these paths.

---

## Affected Files and Routes

### Tier 1 — Likely to Change

| File | Change |
|------|--------|
| `app/dashboard/page.tsx` | Becomes redirect to event chooser OR thin entry surface with chooser-only content. 753-line global overview page needs replacement/redirect. |
| `app/dashboard/dashboard-shell.tsx` | `navigationSections` must be restructured: Overview section likely replaced with event-switching action; Finance/Operations sections may need relabeling or scoping to reflect new entry model. `scopedPatterns` regex list should be reviewed. |
| `app/dashboard/events/page.tsx` | Promoted from secondary index to primary landing. Must support "no events" empty state (D-10). May need enhancement: recent events first, create-new prominent. |

### Tier 2 — Event Layout Shell (Exist, May Be Tweaked)

| File | Notes |
|------|-------|
| `app/dashboard/events/[slug]/layout.tsx` | Event sub-shell already exists. Should remain intact. Minor tweaks to subnav labels only if navigation sections change. |
| `app/dashboard/events/[slug]/page.tsx` | Event hub router surface. Already correct pattern. |
| `app/dashboard/events/new/page.tsx` | Create event flow. Must remain first-class. |

### Tier 3 — Finance/Order Surfaces (No Structural Change)

| File | Notes |
|------|-------|
| `app/dashboard/manage-orders/page.tsx` | Cross-event order ledger. Accepts `eventId` filter. May become event-mandatory in the future, but not in phase 27 scope. |
| `app/dashboard/financial/page.tsx` | Cross-event financial overview. `?eventId` filter. No structural change. |
| `app/dashboard/reconciliation/page.tsx` | Cross-event reconciliation. `?eventId` filter. No structural change. |
| `app/dashboard/payments/page.tsx` | Cross-event payments. No structural change. |
| `app/dashboard/attendees/page.tsx` | Cross-event attendees. `?eventId` filter. No structural change. |

### Tier 4 — System Pages (No Change)

| File | Notes |
|------|-------|
| `app/dashboard/integrations/page.tsx` | System-level. No event context. |
| `app/dashboard/ticket-tailor/sync/page.tsx` | Admin sync tool. No structural change. |
| `app/dashboard/email-preview/page.tsx` | Preview only. |
| `app/dashboard/settings/ticket-types/page.tsx` | Global settings. |

### Tier 5 — Unchanged (Already Event-Scoped)

| File | Notes |
|------|-------|
| `app/dashboard/events/[slug]/overview/page.tsx` | Already reads event from URL slug. |
| `app/dashboard/events/[slug]/attendees/page.tsx` | Already event-scoped. |
| `app/dashboard/events/[slug]/tickets/page.tsx` | Already event-scoped. |
| `app/dashboard/events/[slug]/accommodation/page.tsx` | Already event-scoped. |
| `app/dashboard/events/[slug]/payments/page.tsx` | Already event-scoped. |
| `app/dashboard/events/[slug]/sources/page.tsx` | Already event-scoped. |
| `app/dashboard/events/[slug]/settings/page.tsx` | Already event-scoped. |

---

## What Is Likely to Change

### 1. Post-Login Landing Redirect

`app/dashboard/page.tsx` (753 lines) is the current login destination. For phase 27, it either:
- Redirects to `/dashboard/events` (preserving `/dashboard` URL but serving the chooser)
- Gets replaced by the events page at `/dashboard/events` (with `/dashboard` as redirect)

This is the primary mechanical change. The global overview page content is relocated or discarded.

### 2. Dashboard Shell Navigation Sections

`dashboard-shell.tsx` defines 5 sections. Under event-first entry, the "Overview" section (pointing to `/dashboard`) becomes ambiguous — the new "overview" IS the event chooser. Likely restructuring:
- "Overview" → replaced with event-switching action (go to chooser or switch event)
- "Events" → remains (links to `/dashboard/events`)
- "Finance" → label may change but structure remains (cross-event or event-filtered views)
- "Operations" → label may change
- "System" → unchanged

The auto-collapse on scoped view logic (`scopedPatterns` regex) is already correctly identifying event-scoped routes. No change needed here unless new patterns need adding.

### 3. Event Chooser Surface (`app/dashboard/events/page.tsx`)

This page is the closest existing chooser but was designed as an index/list page. Enhancements likely needed:
- Sort order: recent/upcoming events first (D-04 in 27-CONTEXT.md)
- Empty state: create-first UX when no events exist (D-10)
- "New Event" button already present and prominent — good
- Search by title or slug — already present — good
- Status filter (published/draft) — already present — good

### 4. Event-Scoped Layout (`app/dashboard/events/[slug]/layout.tsx`)

Already the correct pattern. The sub-navigation (7 items) plus active event card is exactly the event-scoped shell described in D-06 and D-07. No structural change; only potential label refinements.

### 5. Direct URL Compatibility

Routes like `/dashboard/manage-orders` and `/dashboard/financial` currently work without `eventId`. After phase 27, these remain cross-event capable. The event-scoped work in this phase does not mandate `eventId` on these routes; they continue to aggregate all events unless filtered.

---

## What Should Not Change

1. **All event-scoped child routes under `/dashboard/events/[slug]/*`**: The `[slug]/layout.tsx` and all child pages are already correctly event-scoped. No work needed here unless the navigation sections in the parent shell are restructured in a way that breaks links.

2. **All API routes under `/api/dashboard/*`**: The data fetching layer is not in scope. Revenue, orders, attendees, reconciliation, accommodation APIs all remain as-is.

3. **Convex hooks and data model**: `useEventBySlug`, `useEvents`, `useAttendeesForEvent`, and all other Convex hooks remain unchanged.

4. **Cross-event pages that use `eventId` as optional filter**: `manage-orders`, `financial`, `reconciliation`, `attendees`, `payments` continue to work with or without `eventId`. They are not becoming event-mandatory in this phase.

5. **System-level pages**: `integrations`, `ticket-tailor/sync`, `email-preview`, `settings/ticket-types` have no event context and are unaffected.

6. **The `app/dashboard/layout.tsx` auth wrapper**: Server component that calls `requirePageUser`. This is the correct layer for auth and must stay intact.

7. **The `dashboard-shell.tsx` auto-collapse logic for scoped views**: Already working. The `scopedPatterns` regex list correctly identifies event-scoped routes. No change needed.

---

## Risk Areas

### Risk 1: URL Bookmark Compatibility for `/dashboard`

The current login landing is `/dashboard`. If the decision is to redirect `/dashboard` → `/dashboard/events`, any bookmark to `/dashboard` still works (it redirects). However, if the chosen approach is to serve the global overview content at `/dashboard` with event-first navigation layered on top, the existing cross-event views in that page need to coexist with the new chooser-first UX without creating a confusing dual-mode interface.

**Mitigation:** Prefer the redirect approach. Keep `/dashboard` as a simple redirect (or thin entry surface) pointing to the chooser, and preserve all bookmarked sub-routes as-is.

### Risk 2: `manage-orders` Without Event Context

`/dashboard/manage-orders` is the primary operator entry point (per STATE.md: "The manage-orders route is the primary operator entry point"). Phase 27 may create pressure to make this route event-mandatory (require `eventId`). Currently it works cross-event. If phase 27's design intent is that operators always open an event first, then `manage-orders` should accept `eventId` as mandatory, not optional.

**Decision needed:** Does `manage-orders` become event-scoped (requires `eventId`), or does it remain a cross-event ledger that operators can open before selecting an event? This affects whether phase 27's event-chooser entry fully replaces the current landing or merely supplements it.

### Risk 3: Dual Navigation Identity

`app/dashboard/events/[slug]/layout.tsx` renders a full secondary sidebar (event card + nav). `app/dashboard/dashboard-shell.tsx` renders the primary sidebar. After phase 27, an operator in an event-scoped route would see two sidebars: the global shell sidebar + the event-local sidebar. This is a known pattern in the current codebase (`events/[slug]/layout.tsx` already does this). The risk is that the global shell navigation becomes less relevant when an operator is deep in an event-scoped route, making the global nav feel like dead weight or causing confusion about which navigation is authoritative.

**No immediate fix required** — this is an existing duality that the codebase already tolerates. However, if the global shell's "Overview" section is restructured to be event-switching, the operator's mental model should align: global shell = event switching, event-local shell = event work.

### Risk 4: Shell Narrowing Scope Creep

`dashboard-shell.tsx` navigation sections are defined as a static `navigationSections` array. If phase 27 requires dynamic navigation (e.g., showing only relevant sections based on selected event), this becomes a larger refactor. The phase 27 scope (D-08) says "Keep the global dashboard shell minimal and focused; do not reintroduce a broad platform-style admin home." This suggests no major shell restructuring — just relabeling/reorganizing existing sections. However, the line between "minimal" and "redesign" is fuzzy and could expand.

**Mitigation:** Stick to navigation label changes and section reorganization. Do not add dynamic event-specific nav items to the global shell.

### Risk 5: Empty State for Chooser With No Events

27-CONTEXT.md (D-10) requires: "If no events exist, show a create-first empty state instead of a dead-end chooser." `app/dashboard/events/page.tsx` already has an empty state (line 232): "No events yet. Create your first event to get started." This is already implemented. Verify the CTA is prominent enough.

---

## Open Questions

### Q1: Should `/dashboard` Redirect or Become the Chooser?

Two options:
- **Option A:** `/dashboard` redirects to `/dashboard/events`. Clean URL model. All bookmarks to `/dashboard` continue to work via redirect. Chooser lives at `/dashboard/events`.
- **Option B:** `/dashboard` itself becomes the chooser surface (replacing the current 753-line global overview page content with the event chooser). No redirect needed. Chooser lives at `/dashboard`.

Option A is simpler mechanically and matches D-03 from 27-CONTEXT.md ("`/dashboard/page.tsx` can become a thin entry or redirect if needed"). Option B avoids a URL change but requires replacing the entire current page content.

### Q2: Does `manage-orders` Become Event-Mandatory?

The phase 27 success criteria (ROADMAP.md) say operators land on event chooser and the dashboard is "scoped to the selected event." This implies operators should always have an event in context. However, `manage-orders` is described as the primary operator entry point and currently works cross-event without `eventId`. 

If phase 27 requires `manage-orders` to be event-mandatory, then accessing `/dashboard/manage-orders` without `eventId` should either redirect to the chooser or show an event-selection prompt. This is a breaking change for any direct links to `manage-orders`.

If `manage-orders` stays cross-event, then operators can bypass the event-first landing by bookmarking `manage-orders` directly, which undermines the phase 27 intent.

**Recommendation:** Keep `manage-orders` cross-event for phase 27. Evaluate event-mandatory behavior as a separate decision in phase 28 or later when the deterministic money model is being defined.

### Q3: Is There a Need for a Dedicated "No Events" Landing?

If an admin has never created an event, what do they see at `/dashboard/events`? Currently: empty state with "Create your first event to get started." This matches D-10. However, if the chooser is to be the entry point and there are events, the empty state is fine. No additional landing needed.

### Q4: What Happens to the Global Metrics on `/dashboard`?

The current `/dashboard/page.tsx` (753 lines) has cross-event metrics (total order value, paid, refunded, net across all events). If phase 27 replaces this with an event chooser, those metrics are no longer visible on the landing page. Operators who relied on the global metrics view at login would need to go to `/dashboard/financial` (which has similar metrics) or a specific event's overview.

This is acceptable given the phase 27 goal is event-first entry, not cross-event analytics. The metrics are preserved in existing pages, just not on the landing.

### Q5: Should the Global Shell's "Finance" and "Operations" Sections Be Relabeled?

Currently: Finance (with sub-items: Reconciliation, Payments, Manage Orders, Payment templates) and Operations (Attendees, Accommodation/Inventory). After event-first landing, these sections might be better described as "Event Work" or "Event Operations" to signal they operate within the selected event. However, they also contain cross-event routes like `manage-orders` and `attendees`. Relabeling must be consistent with the actual behavior.

**Recommendation:** Keep section labels as-is for phase 27. Clarify labeling as a follow-up if the shell navigation feels misaligned after operators use the event-first entry.

### Q6: Does the Chooser Need "Recent Events" Sorting?

27-CONTEXT.md (D-04) says "Existing events should be surfaced in a simple chooser that favors recent or commonly used events." `app/dashboard/events/page.tsx` currently sorts by `startsAt` ascending (next event first). This is already "upcoming first" not "recent first." Consider adding a "recently accessed" dimension if operator feedback indicates the current sort is insufficient.

---

## Recommendation

Phase 27 is a routing and navigation composition change. The architecture already has the correct patterns in place (event-scoped layout, event-local shell, event-filtered cross-event pages). The work is primarily to wire the entry point correctly.

**Recommended approach (Option A for Q1):**

1. **`/dashboard/page.tsx`** → replace content with `redirect("/dashboard/events")`. The global overview page is relocated to `/dashboard/financial` (which already has the same metrics). Keep the file, just redirect.

2. **`app/dashboard/events/page.tsx`** → promote to entry surface. Add "recently accessed" sorting as a tiebreaker within the existing `startsAt` sort. Confirm empty state CTA is prominent.

3. **`app/dashboard/dashboard-shell.tsx`** → update `navigationSections`: replace "Overview" section with an event-switching shortcut (link to `/dashboard/events`). The section title could become "Event" with label "Switch event". Keep all other sections intact.

4. **`app/dashboard/events/[slug]/layout.tsx`** → no structural changes. Verify subnav labels are correct.

5. **No changes** to cross-event pages (`manage-orders`, `financial`, `reconciliation`, `payments`, `attendees`), system pages, API routes, or Convex hooks.

**This keeps risk low:** minimal routing changes, no data layer touched, no route deletions, all existing URLs remain functional.

**Alternative to consider:** If operators have bookmarked `manage-orders` as their primary entry point and the event-first landing is intended for new sessions only, consider leaving `/dashboard/page.tsx` as a thin entry surface (not a full redirect) that shows the event chooser as the primary CTA but also has a link to "Open manage orders" directly. This would preserve direct access while guiding new sessions toward the event-first model.

The choice between redirect vs. thin entry depends on whether the team wants to enforce event-first navigation or merely encourage it through the default landing.