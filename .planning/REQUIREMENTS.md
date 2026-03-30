# Requirements: Conference Finance Dashboard

**Defined:** 2026-03-29
**Core Value (v2.0 focus):** Give public attendees a guided, low-friction signup flow that captures accommodation-ready data so families can self-assign rooms and operators can run room allocation with fewer manual fixes.

## v2.0 Requirements (Replanned)

### User-Facing Signup Journey

- [ ] **USF-01**: Public attendees can complete a multi-step signup flow in this order: (1) ticket selection, (2) accommodation assignment when enabled for the event, (3) attendee details + notes, (4) review + submit.
- [ ] **USF-02**: Ticket choices shown in step 1 are sourced from admin-configured event ticket types; unavailable or sold-out types cannot be selected.
- [ ] **USF-03**: The accommodation step appears only when the selected event has accommodation enabled and available room inventory.
- [ ] **USF-04**: The primary booker can assign names across selected room beds for their group/family in a single submission flow (booker-managed assignment).
- [ ] **USF-05**: Any unassigned bed is clearly labeled before submit as an open spot that may be filled by another attendee ("random fill" warning).
- [ ] **USF-06**: Public submission path applies abuse controls (rate limiting + honeypot and/or idempotency token) to reduce spam/duplicate accidental submissions.

### Attendee Data for Rooming

- [ ] **RMD-01**: Each attendee record in the signup flow captures required rooming details: gender, location/city, dietary restrictions, roommate request, and phone number.
- [ ] **RMD-02**: Roommate request supports both positive preference (want to room with) and soft exclusion notes (prefer not to room with) as free-text guidance.
- [ ] **RMD-03**: Validation prevents submission when required attendee rooming fields are missing.

### Contracts & Domain Model

- [ ] **DOM-01**: Canonical event model remains source-aware (`integration` vs `internal`) while exposing one shared public contract for event, ticket types, accommodation inventory, and room constraints.
- [ ] **DOM-02**: Signup write path stores one submission envelope (booker + attendees + ticket selections + room assignments + notes) atomically so data cannot partially persist.
- [ ] **DOM-03**: Capacity and duplicate-protection checks run in the same write transaction as submission insert.

### Operator Handoff & Compatibility

- [ ] **OPS-01**: Operator accommodation views can consume submitted room assignments and notes without requiring data reshaping.
- [ ] **OPS-02**: Existing Ticket Tailor and Tikkie flows remain backward compatible for integration-backed events while internal signup paths adopt the same canonical event/ticket contracts.

## Future Requirements (Post-v2.0)

- Public attendee self-service edits after submission (manage own booking portal)
- Rule-based roommate matching engine (beyond free-text requests)
- Waitlist flow when accommodation or ticket capacity is full
- Rich household account system across multiple events

## Out of Scope (v2.0)

| Feature                                  | Reason                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| Full attendee login/account area         | Focus is one guided submission flow, not account lifecycle |
| Automated perfect room allocation engine | v2.0 captures data for operators; optimization can follow  |
| Multi-tenant church/org support          | Project remains single-org scoped                          |
| Discount/coupon commerce features        | Not needed for current church conference operations        |

## Traceability

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| USF-01      | 18    | Pending |
| USF-02      | 18    | Pending |
| USF-03      | 18    | Pending |
| USF-04      | 19    | Pending |
| USF-05      | 19    | Pending |
| USF-06      | 18    | Pending |
| RMD-01      | 19    | Pending |
| RMD-02      | 19    | Pending |
| RMD-03      | 19    | Pending |
| DOM-01      | 18    | Pending |
| DOM-02      | 18    | Pending |
| DOM-03      | 18    | Pending |
| OPS-01      | 20    | Pending |
| OPS-02      | 20    | Pending |

**Coverage:**

- v2.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---

_Requirements defined: 2026-03-29_
_Last updated: 2026-03-29 after milestone replan focused on non-admin signup and accommodation assignment_
