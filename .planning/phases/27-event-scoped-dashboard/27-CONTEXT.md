# Phase 27: Event-Scoped Dashboard - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure the admin dashboard so authenticated users land on an event chooser, can open an existing event or create a new one, and then operate inside an event-scoped dashboard shell rather than a broad global admin surface.

</domain>

<decisions>
## Implementation Decisions

### Entry flow

- **D-01:** The post-login landing should be event-first, not the current broad `/dashboard` overview.
- **D-02:** Opening an existing event and creating a new event are both first-class entry actions.
- **D-03:** Reuse the existing `/dashboard/events` list surface as the chooser candidate; `/dashboard/page.tsx` can become a thin entry or redirect if needed.
- **D-04:** Existing events should be surfaced in a simple chooser that favors recent or commonly used events.

### Event scoping

- **D-05:** The selected event should live in the URL so reloads, bookmarks, and direct links stay scoped.
- **D-06:** Dashboard content after selection should be event-specific by default; the global shell only exists for switching events and top-level navigation.
- **D-07:** Direct entry to event-specific routes remains valid, but those routes should still read as part of the selected event scope.

### Shell behavior

- **D-08:** Keep the global dashboard shell minimal and focused; do not reintroduce a broad platform-style admin home.
- **D-09:** Event creation is part of the dashboard entry experience, not a hidden side path.
- **D-10:** If no events exist, show a create-first empty state instead of a dead-end chooser.
- **D-11:** `/dashboard` should behave as the chooser/bridge, and selected-event navigation should use slug URLs.
- **D-12:** `/dashboard/events` stays the canonical chooser/home surface, while `/dashboard/events/[slug]` is the in-event workspace entry.
- **D-13:** Keep the broader dashboard surface hidden from the main nav for now, but do not delete it outright because it may become an admin-only utility later.
- **D-14:** The chooser should be visibly event-first: a top-level chooser hero plus recent-events emphasis, with search and all-events browsing kept secondary.
- **D-15:** The shell should lose the old Overview / Finance / Operations framing from primary nav; only event switching and low-emphasis utility links should remain visible.
- **D-16:** The shared event switcher should make the active slug explicit so both the global shell and event layout can show the current event consistently.

### Agent Discretion

- Exact chooser presentation (cards vs list vs split layout)
- Whether the hidden global dashboard should remain accessible by direct URL only or be gated behind a future role/power-user surface

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and state

- `.planning/ROADMAP.md` — Updated milestone order and phase 27 scope
- `.planning/STATE.md` — Current milestone state and handoff notes

### Event-scoped dashboard background

- `.planning/phases/migrate-tt-event-ids-to-canonical.md` — Canonical event ID migration rationale that supports event-centric dashboard routing

### Relevant dashboard surfaces

- `app/dashboard/page.tsx` — Dashboard landing entry
- `app/dashboard/events/page.tsx` — Existing event index and chooser candidate
- `app/dashboard/dashboard-shell.tsx` — Global shell/navigation container
- `app/dashboard/events/new/page.tsx` — Create-event flow
- `app/dashboard/events/[slug]/page.tsx` — Event-scoped entry route
- `app/dashboard/events/[slug]/overview/page.tsx` — Event overview surface
- `app/dashboard/events/[slug]/layout.tsx` — Event-local shell precedent
- `app/dashboard/manage-orders/page.tsx` — Event-focused operator surface

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/dashboard/events/page.tsx` already does most chooser work: it loads events, filters by status, searches by title or slug, shows a create-new button, and already has an empty state.
- `app/dashboard/events/[slug]/layout.tsx` is the closest existing pattern for event-scoped navigation: active event card, subnav, and public-page link.
- `app/dashboard/events/[slug]/overview/page.tsx` already treats one event as the context boundary for finance, orders, attendees, and reconciliation drilldowns.
- `app/dashboard/page.tsx` still behaves like a broad command center with global metrics and cross-event quick actions; that is the main surface to reshape.
- `app/dashboard/dashboard-shell.tsx` still exposes Overview, Events, Finance, Operations, and System sections; the phase is about replacing that broad framing with event-scoped navigation.

### Integration Points

- `app/dashboard/events/page.tsx` is the obvious place to start for the chooser UX.
- `app/dashboard/page.tsx` is the current login landing and will likely redirect or become the chooser entry.
- `app/dashboard/dashboard-shell.tsx` likely needs to switch from platform-scoped navigation to event-scoped navigation.
- `app/dashboard/events/new/page.tsx` is the create-event destination and should stay first-class.

</code_context>

<specifics>
## Specific Ideas

- The product intent is: after login, admins should see a focused event chooser and then work inside the selected event.
- "Dashboard scoped by events" means a single-event admin should not need to reason about the whole platform at login.
- Keep the event chooser simple and biased toward the next action, not toward showing the whole system.
- The current `events` list page already contains most of the chooser ingredients; phase 27 is mainly about turning it into the entry flow and tightening the surrounding shell.

</specifics>

<deferred>
## Deferred Ideas

- Cross-event analytics hub
- Multi-event management console beyond switching/selecting events
- Full redesign of event creation flow beyond the first-step chooser

</deferred>

---

_Phase: 27-event-scoped-dashboard_
_Context gathered: 2026-04-21_
