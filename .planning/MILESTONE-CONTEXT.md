# Milestone Context: v2.0 Replan

**Captured:** 2026-03-29
**Milestone:** v2.0 Attendee Signup + Accommodation Self-Assignment
**Primary owner intent:** Focus on the user-facing (non-admin) experience.

## Vision (from questioning)

- Build a native, Ticket Tailor-like public signup journey in the app.
- Let attendees sign up for events and complete accommodation data in one flow.
- Let one main booker (often family lead) assign names to room beds before submit.
- Collect enough data upfront to reduce manual room allocation cleanup later.

## Confirmed Product Decisions

- **Flow order:** Tickets -> Rooms -> Attendee details/notes -> Review/Submit.
- **Assignment mode:** Booker assigns all attendees and room beds in one submission flow.
- **Unfilled beds:** Explicitly marked as open/random-fill risk before final submit.
- **Required attendee data:** Gender, location/city, dietary restrictions, roommate request, phone.

## UX Direction

- Keep the flow guided and low-friction, not admin-heavy.
- Keep copy clear around accommodation uncertainty (open bed may be filled by another attendee).
- Prioritize predictable validation and clear error handling over advanced automation.

## Operational Intent

- Increase room-assignment data quality at signup time.
- Preserve existing integration-backed operations while expanding internal/public signup capability.
- Feed submitted assignment + notes into operator workflows without manual reshaping.

## Constraints to Preserve

- Existing Clerk dashboard protection model remains intact (`/dashboard` protected, public flows open).
- Existing Ticket Tailor + Tikkie behavior must remain backward compatible.
- Convex write invariants must remain transactional and deterministic.
