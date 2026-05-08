# Phase 28: Single-Sidebar Event Shell - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate the selected-event dashboard chrome so once an event is chosen, users work inside one event-local sidebar shell instead of seeing duplicate global and event-local sidebars.

</domain>

<decisions>
## Implementation Decisions

### Sidebar ownership

- **D-01:** The event-local shell replaces the dashboard shell sidebar on selected-event routes.
- **D-02:** The single sidebar on event-scoped pages starts with `EventSwitcher`, then a short flat list of event sections.
- **D-03:** Section labels stay short only, with no long descriptions in the sidebar.
- **D-04:** The same section list appears on every event-scoped page.

### Header strip

- **D-05:** Event-scoped pages use a compact two-line header block above content.
- **D-06:** The slug appears as a muted subtitle, not as a primary label.
- **D-07:** `Public page` and `Back to picker` stay as inline text buttons in that header.
- **D-08:** The header block appears on every event-scoped page.

### Event facts

- **D-09:** Event facts live in a sidebar footer card.
- **D-10:** Show `startsAt`, timezone, and currency by default; keep accommodation out of the default visible set.
- **D-11:** Render the facts as key/value rows.
- **D-12:** The facts card appears on every event-scoped page.

### Sticky behavior

- **D-13:** The event-local sidebar stays pinned on desktop.
- **D-14:** The full shell stays visible together while scrolling, with internal scroll handling overflow.
- **D-15:** Sticky behavior is consistent on every event-scoped page.

### Carried forward

- The fullscreen picker from Phase 27 remains untouched.
- URL-based slug scoping remains path-derived and must survive refresh/deep links.

### Agent Discretion

- Exact spacing and typography inside the compact header block
- Whether small utility links inside the sidebar footer need an additional grouping treatment

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and state

- `.planning/ROADMAP.md` - Updated milestone order and phase 28 scope
- `.planning/STATE.md` - Current milestone state and handoff notes

### Prior phase context

- `.planning/phases/27-event-scoped-dashboard/27-CONTEXT.md` - Phase 27 entry flow, picker, and event-scoped dashboard decisions that Phase 28 builds on

### Phase 28 findings

- `.planning/phases/28-single-sidebar-shell/28-ARCHITECTURE-ANALYSIS.md` - Current sidebar ownership, duplication source, and cascading layout impact
- `.planning/phases/28-single-sidebar-shell/28-UX-IA-REVIEW.md` - User-facing chrome hierarchy and the cleanest one-sidebar mental model
- `.planning/phases/28-single-sidebar-shell/28-FLOW-CHECK.md` - Picker-to-shell flow, deep-link risks, and loading considerations

### Relevant dashboard surfaces

- `app/dashboard/dashboard-surface.tsx` - Route-aware fullscreen vs shell routing
- `app/dashboard/dashboard-shell.tsx` - Current global shell chrome to slim or bypass on selected-event routes
- `app/dashboard/events/[slug]/layout.tsx` - Current event-local layout that should become the single-sidebar workspace
- `app/dashboard/events/[slug]/page.tsx` - Event home surface
- `app/dashboard/events/[slug]/overview/page.tsx` - Existing lighter header precedent for event content
- `components/dashboard/event-switcher.tsx` - Event switching control that must remain obvious in the single sidebar
- `app/dashboard/page.tsx` - Fullscreen event picker entry
- `app/dashboard/loading.tsx` - Fullscreen picker loading state
- `app/dashboard/events/page.tsx` - Chooser alias redirect
- `app/dashboard/events/new/page.tsx` - Fullscreen create-event flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `app/dashboard/events/[slug]/layout.tsx` already has the raw pieces for the single sidebar: event title, status, actions, section nav, and facts.
- `components/dashboard/event-switcher.tsx` already handles event switching and can be relocated into the event-local shell.
- `app/dashboard/events/[slug]/page.tsx` already provides the event home surface that sits beside the chrome.
- `app/dashboard/events/[slug]/overview/page.tsx` already shows a lighter header treatment that can inform the compact header block.

### Established Patterns

- `DashboardSurface` already separates fullscreen picker routes from slug-scoped workspace routes.
- Slug-based event selection is already path-derived, not client-state-derived.
- The current event-local layout and the global shell both expose context; Phase 28 is about collapsing that into one selected-event shell.

### Integration Points

- `app/dashboard/events/[slug]/layout.tsx` is the main leverage point because it wraps all event-scoped child routes.
- Any sidebar change cascades to attendees, tickets, payments, accommodation, settings, and sources routes through the shared layout.
- `app/dashboard/dashboard-shell.tsx` still owns the current global sidebar chrome and will need to stop presenting duplicate event-scoped navigation on selected-event routes.

</code_context>

<specifics>
## Specific Ideas

- Once an event is picked, users should feel inside that event's workspace, not inside a general dashboard plus a second local panel.
- The sidebar should be readable at a glance: switcher first, then short section names, then a small facts card.
- The facts card should stay lightweight and not recreate the dense old 320px panel.

</specifics>

<deferred>
## Deferred Ideas

- Deeper redesign of event navigation labels beyond short names
- Admin-only or power-user secondary dashboard surfaces
- Richer event facts beyond the default starts/timezone/currency card

</deferred>

---

_Phase: 28-single-sidebar-shell_
_Context gathered: 2026-04-21_
