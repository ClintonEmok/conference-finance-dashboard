# Milestones

## v1.0 MVP (Shipped: 2026-03-27)

**Stats:** 21 phases, 41 plans, 98 tasks

**Key accomplishments:**

- Secured dashboard and operator APIs with Clerk, preserving consistent unauthorized contracts.
- Established durable Ticket Tailor sync with normalized finance states and safe manual re-sync controls.
- Delivered finance operations surfaces: revenue trends, order drilldown, CSV export, reconciliation, attendee detail, and room assignment.
- Added Tikkie event-level link generation, payment tracking, manual assignment, and reconciliation integration.
- Migrated backend to typed Convex contracts across domain and API boundaries.
- Closed major audit blockers in sync-route protection and compatibility-aware allocation logic.

### Known Gaps (Accepted for v1.0 closeout)

- **ACC-05**: Accommodation filter UX still needs a dedicated family-group operator control and final neutral semantics for unchecked "Priority only" behavior.
- **FLOW-01**: Full cross-screen UX flow coherence still requires final human visual verification.

### Archive

- Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
- Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

## v2.0 Attendee Signup + Accommodation Self-Assignment (Planned: replanned 2026-03-29)

**Target outcomes:**

- Deliver a public, non-admin multi-step signup flow that starts with tickets and conditionally includes room assignment.
- Let one booker assign beds for family/group attendees before submit.
- Capture rooming-critical data (gender, location, dietary, phone, roommate requests) in the signup flow.
- Keep operator and finance downstream flows compatible with existing Ticket Tailor/Tikkie behavior.

### Planning References

- Requirements: `.planning/REQUIREMENTS.md`
- Roadmap: `.planning/ROADMAP.md`
- State: `.planning/STATE.md`
- Milestone context: `.planning/MILESTONE-CONTEXT.md`
- Research: `.planning/research/v2.0-attendee-signup-self-assignment.md`
