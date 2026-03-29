# Phase 18: Signup Domain Foundation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the Phase 18 backend/domain foundation for a public ticket-first signup flow: one source-aware canonical read contract (event + tickets + accommodation readiness) and one atomic submission write path with transactional safeguards (capacity, duplicate handling, abuse controls). This phase defines contracts and invariants only; full multi-step UI delivery remains Phase 19.

</domain>

<decisions>
## Implementation Decisions

### Canonical model and write boundary

- **D-01:** Use an additive canonical signup model instead of extending `ticketTailor*` tables in place. Keep existing Ticket Tailor tables stable for backward compatibility.
- **D-02:** Expose one source-agnostic read contract for public signup so integration and internal events resolve through the same shape.
- **D-03:** Persist each submission as one atomic envelope (`booker + attendees + ticket selections + room-assignment intent + notes`) in a single mutation transaction.

### Canonical event model (locked)

- **D-19:** Canonical event record lives in `events` and does not store provider-specific payloads.
- **D-20:** Integration linkage is modeled in a separate table `eventSources` to support one canonical event mapped to zero/one/many external providers over time.
- **D-21:** `events` stores product-facing event truth (`slug`, `title`, `startsAt`, `endsAt`, `timezone`, `currency`, `isPublished`, `isSignupOpen`, `accommodationEnabled`, `primarySourceKind`, `primarySourceProvider?`).
- **D-22:** `eventSources` stores provider binding truth (`eventId`, `provider`, `externalEventId`, `syncStatus`, `lastSyncedAt`, optional `providerSnapshotRef`) and must be indexed for both provider lookup and event lookup.
- **D-23:** Public contract always resolves from `events`; provider tables (`ticketTailorEvents`, future providers) are adapter inputs only.
- **D-24:** Canonical table naming for this phase should not use a required `signup*` prefix. Preferred names: `events`, `eventSources`, `ticketTypes`, `accommodationSlots`, `submissions`, `submissionAttendees`, `submissionTicketSelections`, `submissionAssignments`, `submissionIdempotency`.

### Phase 18 canonical table layout (locked)

- **D-25:** Phase 18 adds these canonical tables (additive only; no deletion/rename of existing tables):
  - `events`: `slug`, `title`, `startsAt`, `endsAt`, `timezone`, `currency`, `isPublished`, `isSignupOpen`, `accommodationEnabled`, `primarySourceKind`, `primarySourceProvider?`; indexes `by_slug`, `by_startsAt`, `by_signup_visibility`.
  - `eventSources`: `eventId`, `provider`, `externalEventId`, `syncStatus`, `lastSyncedAt`, `providerSnapshotRef?`; indexes `by_provider_and_externalEventId`, `by_eventId`, `by_eventId_and_provider`.
  - `ticketTypes`: `eventId`, `label`, `priceMinor`, `isActive`, `visibility`, `availabilityState`, `unavailableReason?`; indexes `by_eventId`, `by_eventId_and_availabilityState`.
  - `accommodationSlots`: `eventId`, `hotelId`, `roomId`, `slotLabel`, `genderPolicy`, `isAssignable`, `ineligibilityReason?`; indexes `by_eventId`, `by_eventId_and_isAssignable`.
  - `submissions`: `eventId`, `source`, `idempotencyKey`, `bookingRef`, `honeypotSeen`, `notes?`, `bookerName`, `bookerEmail`, `bookerPhone?`, `submittedAt`.
  - `submissionAttendees`: `submissionId`, `name`, `email?`, `phone?`, `gender`, `location?`, `dietaryRestrictions?`, `roommatePreference?`, `roommateAvoid?`.
  - `submissionTicketSelections`: `submissionId`, `ticketTypeId`, `attendeeId`, `quantity` (`1` per row; per-attendee model).
  - `submissionAssignments`: `submissionId`, `attendeeId`, `slotId`, `assignmentIntent`.
  - `submissionIdempotency`: `eventId`, `idempotencyKey`, `fingerprint`, `submissionId`, `expiresAt`; indexes `by_eventId_and_idempotencyKey`, `by_eventId_and_fingerprint`, `by_expiresAt`.

### Public catalog contract behavior

- **D-04:** Public catalog returns only events that are published and open for signup.
- **D-05:** Events are ordered by `startsAt` ascending (soonest first).
- **D-06:** Ticket types remain visible when unavailable, but are returned as non-selectable with a machine-readable reason.
- **D-07:** Ticket availability detail is coarse (`selectable` state + reason), not exact remaining-count promises.

### Accommodation readiness contract

- **D-08:** Contract exposes accommodation readiness as boolean + machine-readable reason (`eligible` or why not).
- **D-09:** If accommodation is enabled but no assignable inventory exists, signup skips the room step and returns explicit reason data (not a full-flow hard block).
- **D-10:** For eligible events, contract exposes assignable bed-slot units (not just room/hotel totals) so Phase 19 can support name-to-bed mapping.
- **D-11:** Constraint payload stays core for Phase 19: room label/type/capacity, occupancy/readiness, and assignment-eligibility notes.

### Duplicate and retry behavior

- **D-12:** The same booker is allowed to submit multiple distinct bookings for the same event; duplicate guards must not block legitimate repeat bookings.
- **D-13:** Accidental re-submits of the same payload should resolve idempotently by loading the already-submitted booking context (not creating a second record).
- **D-14:** Idempotent repeat protection uses a short retry window (minutes-to-hours behavior, not multi-day lockout).
- **D-15:** Idempotent repeat response returns the same submission reference and enough payload to prefill/restore the previously submitted booking in the signup flow; do not expose a `reused` marker in user-facing contract copy.
- **D-18:** Repeat-detection contract should support a user choice to continue with the previous submission or update it, while still preventing silent duplicate inserts.

### Transaction and abuse safeguards

- **D-16:** Capacity and duplicate/idempotency checks run in the same transaction as submission writes (no split pre-check endpoint).
- **D-17:** Public submission path includes abuse controls in Phase 18 (`rate limit` + `honeypot` and/or idempotency strategy) while preserving deterministic retries.

### the agent's Discretion

- Exact non-core metadata fields in `eventSources` (for example sync diagnostics) as long as D-19 through D-24 remain true.
- Exact internal idempotency mechanism (request key vs envelope fingerprint) if behavior matches D-12 through D-15 and D-18.
- Exact reason-code taxonomy names for unavailable tickets/accommodation, provided they are machine-readable and stable.
- Exact Convex module layout (adapter/helper placement) while preserving one stable public canonical contract.

</decisions>

<specifics>
## Specific Ideas

- Product intent remains a native, Ticket Tailor-like signup experience inside this app.
- Downstream flow anchor is fixed: `tickets -> rooms -> attendee details/notes -> review/submit`.
- One family/group booker assigns names to room beds in one submission flow.
- Any unfilled bed must be explicit before submit as open/random-fill risk (implemented in later UI phase but contract needs to support it).

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements authority

- `.planning/ROADMAP.md` — Phase 18 boundary, success criteria, and plan targets.
- `.planning/REQUIREMENTS.md` — Requirement IDs for this phase (`USF-01`, `USF-02`, `USF-03`, `USF-06`, `DOM-01`, `DOM-02`, `DOM-03`).
- `.planning/PROJECT.md` — v2 milestone goals and non-negotiable compatibility constraints.
- `.planning/STATE.md` — carried-forward architecture/security constraints from prior phases.

### User-decided milestone context

- `.planning/MILESTONE-CONTEXT.md` — locked flow order, assignment mode, required attendee data, and random-fill warning intent.

### Research and risk framing

- `.planning/research/v2.0-attendee-signup-self-assignment.md` — research findings and phase-fit recommendations.
- `.planning/research/PITFALLS.md` — known pitfalls for transactional writes, abuse controls, and compatibility.

### Code contracts to align with

- `convex/_generated/ai/guidelines.md` — mandatory Convex function/schema/query constraints.
- `convex/schema.ts` — existing provider-centric tables and indexes that canonical model must coexist with.
- `convex/events.ts` — current event read behavior to replace with canonical public read contract.
- `lib/convex/hooks/events.ts` — existing event hook surface likely to host canonical public reads.
- `lib/rate-limit.ts` — reusable rate-limit behavior and response contract for public abuse controls.
- `proxy.ts` — confirms only `/dashboard(.*)` is protected; public signup routes stay open.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `lib/rate-limit.ts`: Reusable request limiter (`enforceRateLimit`) with standard 429 JSON contract and headers.
- `lib/domain/accommodation/inventory.ts`: Existing inventory shaping helpers useful for accommodation readiness payloads.
- `lib/domain/accommodation/assignments.ts`: Existing assignment normalization patterns relevant to bed-slot contract design.
- `lib/convex/hooks/events.ts`: Existing event hook entry point for adding canonical public event/ticket queries.

### Established Patterns

- Provider-centric storage exists today in `convex/schema.ts` (`ticketTailorEvents`, `ticketTailorOrders`, `ticketTailorAttendees`), so canonical entities must be additive and compatibility-safe.
- Current `convex/events.ts` uses provider-centric reads and unbounded `.collect()` in public queries; Phase 18 should shift to bounded/index-first canonical reads.
- Public routes are possible without auth changes because `proxy.ts` protects `/dashboard` only.

### Integration Points

- Canonical public read functions should live in Convex and be consumed via `lib/convex/hooks/events.ts` (or adjacent signup-specific hooks).
- Atomic submission mutation must integrate with accommodation entities in `convex/accommodation.ts` without breaking existing operator workflows.
- New canonical submission data should be bridged so later Phase 20 operator reads can consume it without reshaping existing TT/Tikkie finance flows.

</code_context>

<deferred>
## Deferred Ideas

- Full public multi-step UX implementation, validation copy, and review/submit screens (Phase 19).
- Operator-facing handoff screens and compatibility verification across internal/integration read models (Phase 20).
- Advanced optimization-based room matching engine beyond captured preferences (post-v2).

</deferred>

---

_Phase: 18-dual-source-event-signup-platform_
_Context gathered: 2026-03-29_
