# Roadmap: Conference Finance Dashboard

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27 (archive: `.planning/milestones/v1.0-ROADMAP.md`, requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`, audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`)
- 🚧 **v2.0 Attendee Signup + Accommodation Self-Assignment** — replanned 2026-03-29

## Active Milestone: v2.0

**Objective:** Deliver a public, multi-step signup journey that feels native, captures accommodation-ready attendee details, and lets families/groups assign rooms themselves before submission.

### Scope

- Public ticket-first signup flow
- Conditional accommodation step for eligible events
- Booker-managed room assignment for family/group submissions
- Attendee details capture for rooming decisions (gender, location, dietary, phone, roommate request)
- Canonical contracts that keep integration-backed and internal events compatible
- Operator handoff for room allocations using submitted data

### Out of Scope

- Full attendee account portal and post-submit self-service edits
- Automated optimization-based rooming engine
- Multi-tenant support
- Replacing Ticket Tailor/Tikkie source behavior for existing integration-backed events

## Phases

- [ ] **Phase 18: Signup Domain Foundation**
- [ ] **Phase 19: Public Multi-Step Signup Experience**
- [ ] **Phase 20: Operator Handoff + Compatibility Layer**

---

### Phase 18: Signup Domain Foundation

**Goal:** Create the canonical data and mutation foundation for ticket-first signup with optional accommodation assignment.

**Depends on:** v1.0 baseline + completed hardening work from prior phase 17

**Requirements:** USF-01, USF-02, USF-03, USF-06, DOM-01, DOM-02, DOM-03

**Success Criteria:**

1. One source-aware event/ticket/accommodation read contract powers public signup for both integration and internal events
2. Signup submission mutation persists booker, attendees, ticket selections, assignments, and notes atomically
3. Capacity and duplicate guards are enforced in the same transaction as writes
4. Accommodation eligibility is represented explicitly so the UI can conditionally show/hide the room-assignment step
5. Public submission path includes abuse protection (rate limit + honeypot/idempotency strategy)

Plans:

- [ ] 18-01-PLAN.md — Canonical signup contracts (event + ticket + accommodation + room constraints)
- [ ] 18-02-PLAN.md — Atomic submission mutation (`booker + attendees + assignments + notes`)
- [ ] 18-03-PLAN.md — Transactional guards + public abuse controls (capacity, duplicate checks, idempotent retries, rate limit/honeypot)

---

### Phase 19: Public Multi-Step Signup Experience

**Goal:** Deliver the non-admin flow end-to-end: tickets first, then accommodations, then attendee details/notes, then review/submit.

**Depends on:** Phase 18

**Requirements:** USF-04, USF-05, RMD-01, RMD-02, RMD-03

**Success Criteria:**

1. Public users can complete a 4-step journey without auth and submit successfully
2. Booker can assign names to room beds for their family/group in one flow
3. Unfilled beds are clearly marked with random-fill warning before confirmation
4. Required attendee rooming fields block submission when missing and show actionable validation copy

Plans:

- [ ] 19-01-PLAN.md — Route + step shell for ticket-first signup flow
- [ ] 19-02-PLAN.md — Accommodation assignment UI (family/group bed mapping + unfilled-bed warnings)
- [ ] 19-03-PLAN.md — Attendee details/notes + review/submit UX

---

### Phase 20: Operator Handoff + Compatibility Layer

**Goal:** Ensure submitted signup data is immediately useful to operators and remains compatible with existing integration-backed finance workflows.

**Depends on:** Phase 18, Phase 19

**Requirements:** OPS-01, OPS-02

**Success Criteria:**

1. Operator room/allocation views can read submitted assignment + note fields directly
2. Internal and integration events continue to share source-agnostic dashboard read models
3. Existing Ticket Tailor/Tikkie behaviors remain stable while internal signup data enters the same downstream operational flows

Plans:

- [x] 20-01-PLAN.md — Operator read model for submitted rooming data (assignments + notes)
- [ ] 20-02-PLAN.md — Source-agnostic adapter updates (internal + integration compatibility)
- [ ] 20-03-PLAN.md — End-to-end verification: signup submission -> operator rooming workflow

### Phase 21: Accommodation UX Redesign

**Goal:** Make adding accommodation to an event feel like a coherent single workflow. Move from scattered multi-page setup to inline event settings flow.

**Depends on:** Phase 20

**Success Criteria:**

1. Event settings page becomes the primary accommodation setup interface (inline hotel linking, room creation, room type management)
2. Single unified mutation for hotel-to-event linking (consolidated from two parallel mutations)
3. Automatic slot generation when rooms are provisioned/linked for an event
4. Clear status indicators and guardrails (warn when linking hotels with 0 rooms)
5. Scope Reach Management modal removed from inventory page

Plans:

- [x] 21-01-PLAN.md — Consolidate hotel linking mutations + add auto-slot generation ✓
- [x] 21-02-PLAN.md — Redesign event settings accommodation section (inline flow) ✓
- [x] 21-03-PLAN.md — Remove Scope Reach modal and deprecated linking path ✓

### Phase 22: Redesign signup UX for family ticket allocation with attendee grouping and room bedslot allocation UI ✓ COMPLETE

**Goal:** Redesign the public signup flow to let families/groups determine how their attendees get allocated across bedslots. New step order: Tickets → Attendee Details → Rooms → Review.

**Requirements**: USF-04, USF-05, RMD-01, RMD-02, RMD-03

**Depends on:** Phase 21
**Plans:** 3/3 plans complete

Plans:

- [x] 22-01-PLAN.md — Flow reorder + location field (foundation) ✓
- [x] 22-02-PLAN.md — Room assignment redesign with bedslot grouping (core UI) ✓
- [x] 22-03-PLAN.md — Review step restructure with expandable sections (final polish) ✓

### Phase 23: Add email confirmation and show tikkie link (payment). after signup is completed and improve tracking. we can fetch tikkie automatically already, but payments are done by name. payment details only show first letter and last name

**Goal:** Add email confirmation to signup submissions and display Tikkie payment links after signup completion. Improve payment tracking with privacy-aware name matching (first letter + last name display). Add buyer details step and clear localStorage on completion.
**Requirements**: USF-01, USF-06
**Depends on:** Phase 22
**Plans:** 4/6 plans executed

Plans:

- [x] 23-01-PLAN.md — Email infrastructure and async confirmation emails with Resend ✓
- [x] 23-02-PLAN.md — Success page with expandable sections and booking reference routing
- [ ] 23-03-PLAN.md — Tikkie link display with QR code on success page and in emails
- [x] 23-04-PLAN.md — Privacy-aware name masking and attendee name payment matching ✓
- [x] 23-05-PLAN.md — Buyer details step (between tickets and attendees)
- [x] 23-06-PLAN.md — Clear localStorage draft after successful submission

### Phase 24: canonical orders rewrite

**Goal:** Consolidate parallel data models (TicketTailor sync tables + submission tables) into unified "orders" core with provider-specific extension tables.
**Requirements**: DOM-01, DOM-02, DOM-03
**Depends on:** Phase 23
**Plans:** 1/6 complete, 5 remaining in 3 waves

Plans:

- [x] 24-01-PLAN.md — Schema rewrite: submissions→orders, slim TT tables with FKs to core ✓
- [ ] 24-02-PLAN.md — TT sync pipeline: write to core + extension tables simultaneously
- [ ] 24-03-PLAN.md — Order management + Tikkie: read from core orders table
- [ ] 24-04-PLAN.md — Payment matching: read orders from core table
- [ ] 24-05-PLAN.md — Accommodation board: read from core + extension, update assignments
- [ ] 24-06-PLAN.md — Signup submission: write to core orders tables

---

## Progress

| Phase                                       | Goal                                                            | Requirements                   | Plans | Status  |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ----- | ------- |
| 18 - Signup Domain Foundation               | Canonical contracts + atomic signup writes                      | USF-01..03, USF-06, DOM-01..03 | 3     | Pending |
| 19 - Public Multi-Step Signup Experience    | Ticket-first non-admin flow + room assignment                   | USF-04..05, RMD-01..03         | 3     | Pending |
| 20 - Operator Handoff + Compatibility Layer | Use submitted rooming data in ops without breaking integrations | OPS-01..02                     | 3     | Pending |

| Phase                                                | Goal                                                            | Requirements                   | Plans       | Status      |
| ---------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ----------- | ----------- |
| 18 - Signup Domain Foundation                        | Canonical contracts + atomic signup writes                      | USF-01..03, USF-06, DOM-01..03 | 3           | Pending     |
| 19 - Public Multi-Step Signup Experience             | Ticket-first non-admin flow + room assignment                   | USF-04..05, RMD-01..03         | 3           | Pending     |
| 20 - Operator Handoff + Compatibility Layer          | Use submitted rooming data in ops without breaking integrations | OPS-01..02                     | 3           | Pending     |
| 21 - Accommodation UX Redesign                       | Inline event settings accommodation flow                        | —                              | 3           | Complete    |
| 22 - Redesign signup UX for family ticket allocation | Family ticket allocation with attendee grouping                 | USF-04..05, RMD-01..03         | 3           | Complete    |
| 23 - Email confirmation + Tikkie + Privacy tracking  | Email confirmations, Tikkie links, privacy masking              | 4/6                            | In Progress |
| 24 - Canonical orders rewrite                        | Unified orders core with TT extension tables                    | DOM-01..03                     | 1/6         | In Progress |

**Totals:** 7 phases, 27 plans, 19 requirements mapped
