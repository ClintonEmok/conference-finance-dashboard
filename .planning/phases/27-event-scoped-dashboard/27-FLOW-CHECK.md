# Phase 27 Flow Check

Research only. No code changes.

## Flow Matrix

| Flow | Current state | If `/dashboard` becomes chooser | If `/dashboard` redirects to `/dashboard/events` | If `/dashboard/events` becomes main entry |
|---|---|---|---|---|
| Auth landing | `app/dashboard/layout.tsx` gates all dashboard pages with `requirePageUser("/dashboard")`; `app/page.tsx` links signed-in users to `/dashboard`. | Works, but the current broad overview UI must be replaced. | Works, but redirect should be intentional and probably server-side to avoid a flash of the old shell/page. | Works if `/dashboard` is kept as a bridge or redirect. |
| Post-login choice | Today land on a broad global overview with metrics and quick actions. | Best fit for the phase intent; chooser can live here. | Chooser moves to `/dashboard/events`; `/dashboard` is only a bridge. | Strong fit; `/dashboard/events` already has list/search/new-event behavior. |
| Create-event entry | `/dashboard/events/new` exists and is linked from the events list. | Must remain first-class in the chooser. | Must remain first-class on the redirected destination. | Already close to ideal. |
| Open selected event | Events list pushes to `/dashboard/events/[slug]`; event hub and nested pages are URL-scoped. | No change, but chooser should lead into this path clearly. | No change. | No change. |
| Direct deep links | Event-scoped routes remain directly accessible via slug URLs and the event layout resolves the event from the slug. | Must stay valid. | Must stay valid. | Must stay valid. |
| Broad shell | Current shell still frames the app as Overview / Events / Finance / Operations / System. | Needs rework so chooser does not look like a generic admin home. | Needs rework so redirected landing does not expose stale “Overview” framing. | Needs rework so event-scoped navigation is emphasized over platform-wide framing. |

## Integration Dependencies

### Landing/auth chain

- `app/page.tsx` sends signed-in organizers to `/dashboard`.
- `app/dashboard/layout.tsx` calls `requirePageUser("/dashboard")` for every dashboard route.
- `lib/auth/server.ts` returns `redirectToSignIn({ returnBackUrl })`, so the chosen landing URL matters for the post-auth round trip.

### Chooser / event selection chain

- `app/dashboard/events/page.tsx` already loads events, filters/searches them, shows **New Event**, and navigates into `/dashboard/events/[slug]`.
- `app/dashboard/events/new/page.tsx` creates an event and then pushes to `/dashboard/events/${slug}`.
- `app/dashboard/events/[slug]/page.tsx` is the event hub; `/overview`, `/attendees`, `/tickets`, `/payments`, `/accommodation`, and `/settings` all hang off it.
- `app/dashboard/events/[slug]/layout.tsx` is the selected-event shell and is the main direct-link precedent.

### Global dashboard / cross-event chain

- `app/dashboard/page.tsx` currently consumes `/api/dashboard/revenue` and `/api/dashboard/attendees` and links into event-specific and global ops pages.
- `app/dashboard/financial/page.tsx`, `app/dashboard/reconciliation/page.tsx`, and `app/dashboard/manage-orders/page.tsx` are still global drilldowns that accept `eventId` filtering.
- Event overview pages link back into these global surfaces with `?eventId=...`.

## Route-Level Risks

### `/dashboard`

- Today it is not a chooser; it is a broad command-center page with global metrics, event trend data, and contact-person snippets.
- If it becomes a chooser, the current API work on the page becomes dead weight unless moved elsewhere.
- If it becomes a redirect, bookmarks and auth return paths will change behavior; make sure the redirect target is stable.

### `/dashboard/events`

- This is already the closest chooser candidate.
- It currently opens the event hub, not the per-event overview, so any chooser intent must preserve that distinction.
- It already contains create-event and list/search behavior, but no explicit “selected event” state outside the URL.

### `/dashboard/events/[slug]` and nested event routes

- These routes are directly accessible and should stay that way.
- They depend on `useEventBySlug(slug)` and render `null` while unresolved, so missing/invalid slugs need clear handling.
- The selected-event shell already provides local nav; if the global shell changes, these routes still need a stable event context.

### Global drilldown routes

- `/dashboard/manage-orders`, `/dashboard/financial`, `/dashboard/reconciliation`, `/dashboard/attendees`, and `/dashboard/accommodation` remain global/workspace routes, not event pages.
- They already rely on `eventId` query strings and cross-links from event surfaces.
- If the landing becomes event-scoped, these routes should still be reachable from the selected event workspace without losing filter context.

## Auth / Redirect Concerns

- `requirePageUser("/dashboard")` is currently the auth landing contract. If `/dashboard` becomes a redirect, decide whether the sign-in return URL should remain `/dashboard` or move to `/dashboard/events`.
- Prefer a server-side redirect if `/dashboard` is no longer a real page; a client-side redirect can flash the old shell/page and briefly load the wrong dashboard UI.
- If `/dashboard/events` becomes the true first screen, update all organizer-facing entry points that assume `/dashboard` is the final destination.
- The current shell nav still contains a top-level **Overview** item pointing at `/dashboard`; that will be misleading if `/dashboard` is no longer an overview.

## Recommended Verification Checklist

1. Sign in as an organizer and confirm the post-auth landing resolves to the intended target.
2. Confirm `/dashboard` behavior explicitly:
   - chooser page, or
   - redirect, or
   - thin bridge only.
3. Confirm `/dashboard/events` shows the chooser surface, including create-first empty state when no events exist.
4. Open an existing event from the chooser and verify the selected-event workspace loads with the correct slug in the URL.
5. Direct-load `/dashboard/events/[slug]` and nested pages (`overview`, `attendees`, `tickets`, `payments`, `settings`, `accommodation`) and verify each still resolves without needing chooser state.
6. Verify the create-event flow from the chooser returns to the new event workspace.
7. Verify legacy/global drilldowns still accept `eventId` and preserve filtering from event-scoped links.
8. Verify the shell/nav no longer advertises a stale broad overview if `/dashboard` is repurposed.
9. Verify invalid/missing event slugs show a useful failure state and a route back to the chooser.
10. Verify browser refresh/bookmark behavior on selected-event URLs keeps the same event scope.

## Bottom Line

The codebase is already partially event-scoped, but the landing path is still broad. The biggest coordination risks are the `/dashboard` auth/redirect contract, the stale broad shell framing, and preserving direct slug-based event routes while making `/dashboard/events` or `/dashboard` the new first step.
