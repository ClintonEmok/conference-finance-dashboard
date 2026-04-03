---
id: SEED-002
status: dormant
planted: 2026-04-03
planted_during: v3.0 - Canonical Orders Foundation / Phase 26 - Canonical Runtime Contract
trigger_when: revisiting ticket setup
scope: Large
---

# SEED-002: Ticket-Driven Room Eligibility

## Idea Summary

Keep signup and accommodation rules aligned by making ticket type the source of room entitlement per attendee. One ticket should map to one attendee, the attendee step should show the selected ticket instead of asking for ticket type again, and room eligibility should be derived from the ticket's allowed room types.

## Why This Matters

This keeps the signup flow, allocation flow, and catalog rules consistent instead of letting them drift apart. It also avoids asking users for room choices before the ticket defines them, and preserves demand as a request/waitlist/pending state when inventory is exhausted instead of failing the signup outright.

## When to Surface

**Trigger:** revisiting ticket setup

This seed should be presented during `/gsd-new-milestone` when the milestone scope includes any of these conditions:

- ticket setup, ticket catalog, or ticket-type eligibility changes
- attendee signup flow or room assignment UX
- room eligibility, inventory, or waitlist behavior
- dashboard accommodation allocation rules

## Scope Estimate

**Large** — likely a full milestone.

This would probably touch:

- signup state and step flow
- ticket selection and attendee details UX
- room assignment logic and tests
- catalog/schema fields for room eligibility
- dashboard allocation behavior
- inventory exhaustion handling

## Breadcrumbs

Related code and decisions found in the current codebase:

- `components/signup/state.ts`
- `components/signup/steps/TicketStep.tsx`
- `components/signup/steps/AttendeeDetailsStep.tsx`
- `components/signup/steps/RoomAssignmentStep.tsx`
- `components/signup/steps/ReviewSubmitStep.tsx`
- `components/signup/assignment.ts`
- `components/signup/assignment.test.ts`
- `lib/domain/signup/catalog.ts`
- `lib/types/signup.ts`
- `convex/signupCatalog.ts`
- `convex/signupSubmission.ts`
- `convex/schema.ts`
- `app/dashboard/accommodation/[event-slug]/page.tsx`
- `lib/domain/accommodation/assignments.ts`
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/seeds/SEED-001-qr-code-event-check-in.md`

## Notes

This idea was intentionally deferred from the current v3.0 / Phase 26 work because the implementation scope is broad and crosses signup UX, accommodation allocation, and schema rules. Keep it dormant until the next ticket setup or accommodation redesign effort, then surface it automatically as the reminder to unify the rule set.

Specific rules captured in the discussion:

- room entitlement should be derived from ticket type per attendee
- one ticket per attendee
- if `roomTypeIds` is omitted or empty, all room types are allowed
- if exactly one room type is allowed, auto-apply it and do not ask the user
- if multiple room types are allowed, prompt later if needed
- the dashboard allocation screen should follow the same ticket-based room eligibility rule
- no admin override was requested for now
- if room inventory is exhausted, capture intent as a request/waitlist/pending status
