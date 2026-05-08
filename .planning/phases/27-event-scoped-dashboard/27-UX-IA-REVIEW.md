# Phase 27 — UX / IA Review

**Audited:** 2026-04-21
**Sources:** `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/phases/27-event-scoped-dashboard/27-CONTEXT.md`, and the dashboard files listed in the phase brief.

---

## UX Summary

The current dashboard still behaves like a broad admin command center. That is in direct tension with Phase 27, which wants authenticated users to land on an event chooser and then work inside an event-scoped shell.

The strongest existing pieces are the event list (`app/dashboard/events/page.tsx`) and the event-local shell (`app/dashboard/events/[slug]/layout.tsx`), because both already center an individual event. The weakest piece is the login landing (`app/dashboard/page.tsx`), which leads with global metrics, global actions, and cross-event language.

Bottom line: the broad dashboard should not remain the primary landing surface. It should be demoted to a thin redirect or secondary utility page, while the event chooser and selected-event shell become the main IA.

---

## IA Assessment

### What is currently happening

- **Landing path is global-first**: `/dashboard` opens with “Global overview” and multiple cross-system actions.
- **Chooser exists but is not primary**: `/dashboard/events` has the right building blocks, but it reads like a management table rather than a post-login selection screen.
- **Event scope exists locally, not globally**: `/dashboard/events/[slug]` and its layout are clearly event-scoped, but they are downstream of a global shell that still frames the app as a platform.
- **Navigation depth is too high**: users move through global shell → event shell → event page → deeper task pages. That is a lot of IA before reaching actual work.

### Fit to Phase 27 goal

- **Login landing:** poor fit
- **Chooser flow:** partial fit, needs redesign
- **Event selection:** fit is present but not elevated enough
- **Selected-event IA:** good foundation, but buried under global navigation

### Recommended IA direction

1. Make `/dashboard` resolve to the chooser experience.
2. Make event selection the primary decision point.
3. Treat `/dashboard/events/[slug]` as the event home.
4. Reduce the global shell to switching events + a small set of scoped top-level links.
5. Remove or demote any “platform overview” language until a true cross-event admin use case is proven.

---

## Page-by-Page Findings

### `app/dashboard/page.tsx`

**Compatibility with event-scoped goal: low**

- Opens with “Global overview” and “Live ops health across orders, balances, and event drilldowns” (`272-315`), which frames the app as a broad command center.
- Presents global metrics before any event choice (`319-364`). That makes event selection secondary.
- Uses event filtering as a dashboard filter, not as a chooser or entry point (`141-269`).
- Surfaces cross-event quick actions like “Manage orders,” “Financial drilldown,” and “Review reconciliation” (`113-138`, `297-315`), reinforcing platform-level thinking.
- Only later shows event cards (`374-427`), and those are still presented as overview cards rather than the primary landing choice.

**Assessment:** this page should not stay as the default login landing. It is the clearest candidate for redesign or removal from the main path.

### `app/dashboard/events/page.tsx`

**Compatibility with event-scoped goal: medium to high**

- This is the best existing chooser candidate: it lists events, supports search, status filtering, and has a strong create button (`78-145`).
- The empty state is clear (`225-235`) and the loading skeletons are sensible (`202-224`).
- However, it still behaves like an admin table, not a chooser. The public URL column, copy buttons, and dense table layout add operational clutter (`180-317`).
- Row click navigation is the main action, but the page does not visually bias the next step toward “open an event” or “create a new one.”

**Assessment:** keep the surface, but redesign it as a chooser/home, not a management index.

### `app/dashboard/dashboard-shell.tsx`

**Compatibility with event-scoped goal: low**

- The shell still exposes global sections: Overview, Events, Finance, Operations, System (`62-148`).
- This is a platform IA, not an event-scoped IA.
- The sidebar content creates a second global navigation layer above the event-specific layout.
- The shell also auto-collapses on scoped pages (`158-189`), which suggests the code already knows the detailed work lives elsewhere.

**Assessment:** this should be slimmed down aggressively. Keep event switching and maybe a minimal top-level nav; remove the command-center framing.

### `app/dashboard/events/new/page.tsx`

**Compatibility with event-scoped goal: medium**

- Event creation is clearly first-class and not hidden, which matches Phase 27 (`207-548`).
- The post-create redirect goes to the event-scoped route (`160`). Good.
- But the form is still a large standalone creation workflow, which is fine as a destination but not ideal as the primary login entry.

**Assessment:** keep as a first-class secondary action from the chooser, not the landing surface.

### `app/dashboard/events/[slug]/page.tsx`

**Compatibility with event-scoped goal: high**

- This is the strongest event hub in the codebase: it anchors the user in one event and surfaces that event’s stats and routes (`45-239`).
- The quick routes are directly event-specific (`149-203`).
- It gives the selected event a visible identity and context, which is exactly what Phase 27 wants.

**Assessment:** this should become the default in-event home.

### `app/dashboard/events/[slug]/overview/page.tsx`

**Compatibility with event-scoped goal: high**

- This page is fully scoped to one event and focuses on event work: order mix, contact people, reconciliation, and grouping controls (`139-649`).
- It uses the selected event in query construction and navigation (`154-216`, `296-311`, `641-645`).
- It is a strong example of how the selected event should shape the rest of the IA.

**Assessment:** keep it, but ensure it sits under a cleaner event home and shell.

### `app/dashboard/events/[slug]/layout.tsx`

**Compatibility with event-scoped goal: high**

- This is the best shell precedent for Phase 27: active event card, status badge, public page link, and scoped sub-navigation (`73-180`).
- It already treats the selected event as the organizing principle.
- It also hides irrelevant sections like accommodation when disabled, which is good scoped IA behavior (`90-94`, `151-177`).

**Assessment:** keep this pattern and extend it; do not let the global shell compete with it.

---

## Redesign / Removal Candidates

### Strong removal candidate: `app/dashboard/page.tsx`

Why:
- It is the wrong mental model for Phase 27.
- It leads with global status, not event choice.
- It duplicates what the event chooser and event home should do better.

Recommended action:
- Replace with a thin redirect to `/dashboard/events`, or
- Convert into a minimal chooser landing that shows only recent events, create-event CTA, and a very small helper summary.

### Strong redesign candidate: `app/dashboard/dashboard-shell.tsx`

Why:
- It is still a platform shell.
- It broadens the IA instead of narrowing it.

Recommended action:
- Remove Overview/Finance/Operations/System as primary sections for Phase 27.
- Keep only event switching and a small event-scoped nav.

### Moderate redesign candidate: `app/dashboard/events/page.tsx`

Why:
- It has the right data, but the wrong emphasis.

Recommended action:
- Reframe it as “Choose an event.”
- Promote recent/open events and the create-new action.
- Reduce table density and operational columns.

---

## Accessibility / Clarity Concerns

- **Clickable table rows** in `app/dashboard/events/page.tsx` rely on `onClick` only (`237-244`), which is weaker for keyboard users and screen readers than an actual button/link pattern.
- **Global labels are vague**: “Overview,” “Financial,” “Operations,” and “System” do not help a single-event admin understand where to go first (`62-148`).
- **Global language conflicts with scope**: “Global overview” and “Canonical overview” on the landing page add conceptual noise for an event-first product (`272-294`).
- **No clear empty-state landing for no events on `/dashboard`**: if there are no events, the user still sees a broad dashboard shell instead of a create-first chooser.
- **Event not found handling is sparse** in `app/dashboard/events/[slug]/layout.tsx`; the message exists, but the broader IA should reduce the chance of dead-end states by making the chooser and selected-event path clearer.

---

## Recommended Directions to Discuss with the User

1. **Should `/dashboard` become a redirect to `/dashboard/events`?**
   - Best if Phase 27 wants a clean event-first login.

2. **Should `/dashboard/events` become the new chooser home?**
   - Best if you want one canonical post-login surface with recent events + create new.

3. **Should the event hub (`/dashboard/events/[slug]`) become the default in-event landing?**
   - Strong yes; it already acts like the right scoped home.

4. **Should the global dashboard shell be simplified or retired?**
   - Yes. It currently contradicts the event-scoped model.

5. **Do we want any cross-event dashboard at all in v3.0?**
   - If yes, keep it as a secondary utility, not the first screen after login.

---

## Conclusion

Phase 27 already has the right raw pieces for an event-scoped dashboard, but the product still communicates “broad admin console” at login. The most important fix is structural, not cosmetic: move the first decision to event selection, and let the chosen event shape every downstream page and shell.
