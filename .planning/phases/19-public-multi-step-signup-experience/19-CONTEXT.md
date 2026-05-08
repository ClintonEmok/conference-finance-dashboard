# Phase 19: Public Multi-Step Signup Experience - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the full public (non-admin) signup journey on top of Phase 18 contracts, including per-event entry pages and the 4-step flow: (1) ticket selection, (2) conditional room assignment, (3) attendee details and notes, and (4) review and submit. This phase is UI/UX and submission-flow orchestration only; operator-facing handoff and compatibility bridge work remain Phase 20.

</domain>

<decisions>
## Implementation Decisions

### Step navigation and progression

- **D-01:** Use a linear progression model with back-navigation/edit support; users cannot jump ahead to unfinished steps.
- **D-02:** Show progress as a labeled stepper with all 4 step names and clear active/completed state.
- **D-03:** When users edit upstream data (especially tickets/rooms), invalidate dependent downstream step data and require reconfirmation before submit.
- **D-04:** Preserve a full local draft so accidental reload/back navigation can restore in-progress state.

### Ticket step interaction

- **D-05:** Start with event cards in the flow (event selection is visible in the UI, not only URL-driven).
- **D-06:** Keep unavailable ticket types visible but disabled with machine-readable/state-aligned reason copy.
- **D-07:** Use per-ticket quantity controls to derive attendee count and downstream attendee rows.
- **D-08:** Keep ticket detail density concise at selection time: ticket name, price, and availability status.

### Room assignment experience

- **D-09:** Primary assignment interaction should be drag-and-drop for mapping attendees to bed slots.
- **D-10:** Show a persistent unfilled-bed warning during assignment, not only at final review.
- **D-11:** Users may continue with unassigned beds only after explicit acknowledgement that open spots may be random-filled.
- **D-12:** Assignment UI should only expose valid/assignable slot targets in primary selection interactions.

### Validation, recovery, and confirmation UX

- **D-13:** Required-field validation should be shown both inline (field-level) and in a step-level summary block for fast correction.
- **D-14:** Validate required attendee rooming fields on step transition and again at final submit.
- **D-15:** When idempotent retry returns restore payload, present an explicit user choice to continue prior submission or update/edit it.
- **D-16:** Post-submit success state should include booking reference, concise submission recap, and clear next-step messaging.

### Public event page scope

- **D-17:** Phase 19 includes a public per-event entry page (`/events/[slug]`) that shows signup-critical event details and routes users into the multi-step signup flow for that event.

### Event page content contract

- **D-18:** Event page content must include hero basics (event name, date/time, location, short summary), signup status state/reason, and a primary `Start signup` CTA.
- **D-19:** Event page must include a ticket overview (name, price, availability status with disabled reasons) without exposing exact remaining counts.
- **D-20:** Event page must include accommodation context when relevant, including the warning that unassigned beds may be random-filled.
- **D-21:** Event page must include a concise 4-step flow preview (`tickets -> rooms -> attendee details -> review/submit`) so users know what happens after clicking `Start signup`.
- **D-22:** If retry/restore context is present, event entry must offer explicit user choice to continue prior submission or edit/update before entering the flow.

### the agent's Discretion

- Exact visual styling, microcopy wording, and spacing/typography tokens as long as D-01 through D-22 behavior holds.
- Exact drag-and-drop library or implementation approach, provided accessibility and deterministic assignment behavior are preserved.
- Exact draft-storage mechanism (e.g., local storage keying/expiry) as long as full local draft restore behavior is met.

</decisions>

<specifics>
## Specific Ideas

- Keep the experience native and guided, with low-friction progression for non-admin users.
- Add a clear per-event entry surface (`/events/[slug]`) as the default public starting point for signup.
- Keep event-page content focused on signup-critical information in this phase (defer marketing-depth content).
- Preserve the locked journey shape from milestone context: `tickets -> rooms -> attendee details/notes -> review/submit`.
- Keep room-assignment risk explicit: open beds can be filled by another attendee.

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements authority

- `.planning/ROADMAP.md` — Phase 19 boundary, dependencies, success criteria, and plan targets.
- `.planning/REQUIREMENTS.md` — Requirement IDs for this phase (`USF-04`, `USF-05`, `RMD-01`, `RMD-02`, `RMD-03`).
- `.planning/PROJECT.md` — v2 milestone intent and non-negotiables.
- `.planning/STATE.md` — carried-forward constraints and Phase 18 completion baseline.
- `.planning/MILESTONE-CONTEXT.md` — locked flow order, assignment mode, required attendee fields, and warning intent.

### Prior phase decisions that constrain Phase 19

- `.planning/phases/18-dual-source-event-signup-platform/18-CONTEXT.md` — canonical contracts and locked replay/abuse/eligibility decisions used by this UI phase.

### Existing implementation surfaces to align with

- `convex/signupCatalog.ts` — public catalog contract (events, tickets, accommodation eligibility/slots).
- `convex/signupSubmission.ts` — submission mutation invariants and restore-payload behavior.
- `lib/convex/hooks/signup.ts` — client hook for catalog consumption.
- `lib/types/signup.ts` — shared signup envelope/result types and error code surface.
- `app/api/signup/submit/route.ts` — public submit API contract and guard error mapping.
- `proxy.ts` — middleware boundary confirming public signup pages/routes remain unauthenticated.

### Project standards

- `convex/_generated/ai/guidelines.md` — required Convex constraints for any contract touchpoints in this phase.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `lib/convex/hooks/signup.ts`: Existing `usePublicSignupCatalog` hook ready for ticket/event/accommodation UI wiring.
- `app/api/signup/submit/route.ts`: Public submit endpoint already applies honeypot, rate limit, idempotency key handling, and conflict mapping.
- `components/ui/*`: Existing shadcn primitives (`button`, `card`, `input`, `dialog`, `badge`, `skeleton`) can power step UI and validation presentation.
- `app/dashboard/accommodation/inventory/page.tsx`: Existing in-repo multi-step interaction pattern (progress bars, staged step content) is a reusable UX reference.

### Established Patterns

- Public surface is open by design; only `/dashboard(.*)` is protected in `proxy.ts`.
- Current project pattern favors server/domain contract boundaries with thin route handlers and typed domain adapters.
- Signup domain already returns restore payload for idempotent retries; UI should consume this as a user choice, not silent replay.

### Integration Points

- New Phase 19 pages/components should consume catalog from `api.signupCatalog.getPublicSignupCatalog` via `usePublicSignupCatalog`.
- Final submit step should post through `POST /api/signup/submit` and map known conflict/error contracts into actionable UI states.
- Step-state orchestration must align with Phase 18 constraints: conditional room step, per-attendee ticket rows, and restore-payload re-entry path.

</code_context>

<deferred>
## Deferred Ideas

- Operator-side consumption and compatibility adapter work (Phase 20).
- Public attendee account/self-service edit portal after submission (post-v2 scope).
- Waitlist and advanced room-matching automation.

</deferred>

---

_Phase: 19-public-multi-step-signup-experience_
_Context gathered: 2026-03-30_
