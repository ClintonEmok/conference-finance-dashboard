# Phase 27 Evaluation Summary

**Date:** 2026-04-21
**Purpose:** Pre-planning architecture + UX/IA evaluation for the event-scoped dashboard overhaul.

## Source Reports

- `.planning/phases/27-event-scoped-dashboard/27-ARCHITECTURE-ANALYSIS.md`
- `.planning/phases/27-event-scoped-dashboard/27-UX-IA-REVIEW.md`
- `.planning/phases/27-event-scoped-dashboard/27-FLOW-CHECK.md`

## Overall Verdict

Phase 27 is a structural IA and shell overhaul, not a cosmetic refresh.

The current codebase already has the right event-scoped building blocks, but the default login landing still behaves like a broad admin console. The biggest change is to move the first decision to event selection, then let the selected event shape the rest of the dashboard.

## Confirmed Direction

- `/dashboard` should act as the chooser/bridge.
- `/dashboard/events` should remain the canonical chooser/home surface.
- Selected-event navigation should use slug URLs.
- The broad dashboard should stay hidden from the main nav for now, but not be deleted outright.

## What Is Likely to Change

### High confidence

- `app/dashboard/page.tsx` should stop being the primary global overview.
- `app/dashboard/events/page.tsx` should become the chooser/home candidate.
- `app/dashboard/dashboard-shell.tsx` should shrink from platform-style navigation to event switching plus minimal top-level links.
- `app/dashboard/events/[slug]/page.tsx` and `app/dashboard/events/[slug]/layout.tsx` should become the default in-event home and shell pattern.
- `app/dashboard/events/new/page.tsx` should remain a first-class entry path from the chooser.

### Medium confidence

- `/dashboard` may become a thin bridge or redirect to `/dashboard/events`.
- The events list page may need a redesign from dense table to chooser-focused layout.
- Broad shell labels like Overview, Finance, Operations, and System may need to be removed or heavily reduced.

### Low confidence / later-phase work

- Global drilldown pages like `manage-orders`, `financial`, `reconciliation`, and `attendees` may eventually become event-mandatory, but that is not required for this phase.
- Finance data model, APIs, and Convex schema should stay out of scope here.

## Pages That Look Like Redesign / Removal Candidates

### Strong candidate: `app/dashboard/page.tsx`

- It is still a global command center.
- It leads with cross-event metrics and actions instead of event choice.
- It is the clearest candidate to replace or demote.

### Strong candidate: `app/dashboard/dashboard-shell.tsx`

- The sidebar still frames the app as a broad platform.
- It competes with the event-local shell instead of reinforcing it.

### Moderate candidate: `app/dashboard/events/page.tsx`

- It already has the right data and chooser ingredients.
- It still reads like an admin table, not a post-login decision screen.

## Hidden Global Dashboard: Pros / Cons

### Pros

- Preserves a fallback utility surface for future role-based/admin-only workflows.
- Avoids deleting useful cross-event metrics and operator tools before the new IA is fully proven.
- Lets the team keep one place for power-user or platform-level views if roles are introduced later.

### Cons

- Can keep the broad command-center mental model alive if it remains too visible.
- Adds another route/surface to maintain even if it is no longer part of the primary UX.
- Risks confusing users if the hidden page is still reachable but not clearly intended for normal work.

## UX / IA Decision Points

- Should `/dashboard` redirect to `/dashboard/events`, or should it itself become the chooser?
- Should the chooser prioritize recent events, all events, or both?
- Should the empty state be create-first and lightweight?
- Should the broad dashboard concept be retired entirely for v3.0?
- Should the event hub (`/dashboard/events/[slug]`) become the default in-event home?

## Integration Risks

- Auth landing and redirect behavior may change if `/dashboard` becomes a bridge.
- Direct deep links to `/dashboard/events/[slug]/*` must keep working.
- Current `eventId` query-param flows on global drilldown pages must remain valid if those pages stay as secondary utilities.
- Invalid or missing event slugs need a clearer recovery path back to the chooser.

## Recommended Phase Boundary

Phase 27 should focus on:

1. Event-first landing.
2. Event chooser/home design.
3. Minimal event-scoped shell.
4. Preserve existing event-scoped routes.

Phase 27 should **not** attempt:

- finance model changes
- canonical order/payable work
- provider/runtime data model changes
- full Ticket Tailor redesign

## What I Need You To Crosscheck

Please confirm which landing model you want:

1. `/dashboard` becomes the chooser.
2. `/dashboard` redirects to `/dashboard/events`.
3. `/dashboard/events` becomes the canonical chooser/home and `/dashboard` is only a bridge.

Also confirm whether the broad dashboard page and global shell should be:

- removed,
- heavily redesigned,
- or kept as secondary utility surfaces.
