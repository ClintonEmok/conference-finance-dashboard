# Phase 21: UI for Event Creation and Event Pages

## Goal

Create admin-facing UI for creating, editing, and viewing events with source-agnostic display (integration vs internal).

## Decisions

### 1. Event Creation Form Layout

**Decision:** Single page form with collapsible sections

**Sections:**

1. **Basic Info** (always visible)
   - Slug (URL-friendly identifier, auto-generated from title)
   - Title (display name)
2. **Schedule** (collapsible)
   - Start date + time (combined datetime picker)
   - End date + time (optional)
   - Timezone (searchable dropdown with IANA zones)
3. **Settings** (collapsible)
   - Currency (dropdown: GBP, USD, EUR, etc.)
   - Is Published (toggle)
   - Is Signup Open (toggle, disabled unless published)
   - Accommodation Enabled (toggle)

**Technical notes:**

- Use `date-fns-tz` for timezone handling
- Slug auto-generation: convert title to kebab-case
- Validation: unique slug, start date in future, end after start

### 2. Event List/Index Page Design

**Decision:** Table view with filters

**Columns:**

- Title (clickable, links to detail)
- Start Date (formatted: "Jan 15, 2025")
- Status badge (Published/Draft)
- Source badge (Internal/TT)
- Actions: Edit, View

**Filters:**

- Source: All / Internal / TicketTailor
- Status: All / Published / Draft

**Default sort:** `startsAt` ascending (next event first)

**Empty state:** "No events yet. Create your first event to get started."

### 3. Event Detail/Edit Page Layout

**Decision:** Tabbed interface with read/edit toggle

**Tabs:**

1. **Overview** (readonly stats)
   - Event info card
   - Quick stats (signups count, etc.)
   - Source info (if TT-linked)
2. **Settings** (edit form)
   - Same form structure as create page
   -
3. **Sources** (show linked sources)
   - List of event sources (TT, etc.)
   - Provider details
   - Sync status
4. **Accommodation** (conditional tab, only if enabled)
   - Accommodation settings
   - Submission queue

**Danger zone:** At bottom of Settings tab, soft delete action

### 4. Source Indicator Display

**Decision:** Subtle in list, detailed in detail view

**Event List:**

- Show small badge/icon: "Internal" (blue) or "TT" (purple)
- Tooltip on hover showing full source info

**Event Detail:**

- Overview tab shows full source metadata
- Sources tab shows detailed linkage info
- For TT events: show providerEventId, last sync status

### 5. Event Status Management

**Decision:** Three independent toggles with dependency

**Toggles:**

- `isPublished` - visible to public
- `isSignupOpen` - accepting signups (disabled toggle if not published)
- `accommodationEnabled` - accommodation module active

**Status summary:** Show combined status badge:

- "Live" (published + open)
- "Published" (published only)
- "Draft" (unpublished)

**Validation:** `isSignupOpen` requires `isPublished=true`

## Task Breakdown

### Task 21-01: Create Event List page

**Files to create:**

- `app/(admin)/admin/events/page.tsx` - Event list page
- `app/(admin)/admin/events/_components/event-table.tsx` - Data table with sorting/filtering
- `app/(admin)/admin/events/_components/event-filters.tsx` - Filter controls

**API needed:**

- `getEvents` query (already exists)

**Components needed:**

- DataTable with columns
- Badge for status/source
- Filter dropdowns
- Empty state

### Task 21-02: Create Event Create page

**Files to create:**

- `app/(admin)/admin/events/new/page.tsx` - Create event page
- `app/(admin)/admin/events/_components/event-form.tsx` - Reusable form component
- `app/(admin)/admin/events/_components/datetime-field.tsx` - Combined date+time+timezone input
- `app/(admin)/admin/events/_components/slug-field.tsx` - Slug input with auto-generation

**API needed:**

- `createEvent` mutation (already exists)
- `useCreateEvent` hook (already exists)

**Components needed:**

- Form sections (collapsible)
- DateTime picker
- Timezone selector
- Currency selector
- Toggle switches

### Task 21-03: Create Event Detail/Edit page

**Files to create:**

- `app/(admin)/admin/events/[slug]/page.tsx` - Event detail page with tabs
- `app/(admin)/admin/events/_components/event-tabs.tsx` - Tab navigation
- `app/(admin)/admin/events/_components/event-overview.tsx` - Overview tab content
- `app/(admin)/admin/events/_components/event-sources.tsx` - Sources tab content

**API needed:**

- `getEventBySlug` query (may need to create)
- `updateEvent` mutation (already exists)
- `getEventSourcesForEvent` query (already exists)

**Components needed:**

- Tabs
- Stats cards
- Source info cards
- Edit toggle/switch

### Task 21-04: Navigation and routing

**Files to modify:**

- `app/(admin)/admin/layout.tsx` - Add Events link to sidebar
- `app/(admin)/admin/page.tsx` - Maybe add events quick link on dashboard

## Files to Read

- `convex/events.ts` - See existing queries/mutations
- `lib/convex/hooks/events.ts` - See existing hooks
- `app/(admin)/_components/sidebar.tsx` - Add navigation item
- Existing form patterns in codebase for consistency

## Success Criteria

- [ ] Admin can view list of all events with filtering
- [ ] Admin can create new internal events
- [ ] Admin can edit existing events
- [ ] Source indicators visible but subtle
- [ ] Status toggles work with proper dependencies
- [ ] Form validation works correctly
- [ ] Navigation accessible from admin sidebar

## Dependencies

- Phase 20 complete (source-agnostic event model)
- `createEvent` and `updateEvent` mutations exist ✓
- `events` table schema finalized ✓

## Related Files

- `convex/events.ts` - Backend queries/mutations
- `lib/convex/hooks/events.ts` - Frontend hooks
- `lib/types/event.ts` - TypeScript types
