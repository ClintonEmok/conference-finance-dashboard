# Feature Research: Event Signup + Dual-Source Events

**Domain:** Church conference event registration and management
**Researched:** 2026-03-27
**Confidence:** HIGH (deep codebase analysis) + MEDIUM (web research on church registration patterns)

---

## Context

This project already has a mature v1.0 finance dashboard with Ticket Tailor integration, Tikkie payments, reconciliation, and accommodation management. The v2.0 milestone adds:

1. **Public event signup** — unauthenticated users browse events and register
2. **Internal event management** — admin creates events/ticket types without Ticket Tailor
3. **Dual-source architecture** — `integration`-backed (Ticket Tailor) and `internal` events coexist with source-agnostic finance reads

Existing infrastructure to build on:

- Convex backend with typed contracts
- Clerk auth (dashboard routes only — public routes are new)
- Tikkie payment link generation + status tracking
- Accommodation/hotel/room inventory + attendee room assignment
- Ticket Tailor sync pipeline (events, orders, attendees)

---

## Table Stakes (Users Expect These)

Features that must exist or the signup flow feels broken/incomplete.

| Feature                                        | Why Expected                                                                    | Complexity | Notes                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Event listing page** (`/events`)             | Public entry point; users need to see what's available                          | LOW        | Public route, no auth required. Show event name, date, location, availability status.                                                       |
| **Event detail page** (`/events/[slug-or-id]`) | Users expect to read full details before committing                             | LOW        | Description, date/time, location, ticket types, capacity indicator, sign-up CTA.                                                            |
| **Registration form with name + email**        | Absolute minimum for any signup; without this you can't contact the registrant  | LOW        | Name (required), email (required). Church context: also collect phone number (standard for church events).                                  |
| **Ticket type selection**                      | Church conferences have multiple tiers (adult, child, youth, leader, volunteer) | MEDIUM     | Admin defines ticket types with labels, prices, capacity limits. Registrant picks type + quantity.                                          |
| **Capacity enforcement**                       | Overselling events erodes trust immediately                                     | MEDIUM     | Per-ticket-type caps + optional overall event cap. Must be atomic (Convex transactions help here).                                          |
| **Confirmation after submission**              | Users need proof they registered                                                | LOW        | On-page success message + summary of what was submitted.                                                                                    |
| **Duplicate submission guard**                 | Same person signing up twice creates reconciliation nightmares                  | MEDIUM     | Match on email + event. Return existing registration instead of creating duplicate. Critical for church events where families share emails. |
| **Admin event CRUD**                           | Operators need to create/edit/archive events without code                       | MEDIUM     | Create event, set name/description/dates/location, define ticket types, toggle publish status.                                              |
| **Published/draft status**                     | Events in progress shouldn't be visible to public                               | LOW        | Boolean on event: `isPublished`. Only published events appear on `/events`.                                                                 |

### Church/Conference-Specific Table Stakes

| Feature                               | Why Expected                                                                           | Complexity | Notes                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Household/group registration**      | Church events are family affairs; Planning Center, Breeze, Eventbrite all support this | HIGH       | One registrant signs up multiple people (spouse, children). Each person is a separate attendee record but grouped. Connects to existing `attendeeFamilyGroups` table. |
| **Dietary/accessibility needs field** | Standard for residential church conferences (meals, mobility)                          | LOW        | Optional text field per attendee. Stored as custom answer on registration.                                                                                            |
| **Age group / category selection**    | Church events segment by age (children, youth, adults, seniors)                        | LOW        | Ties into ticket type, but also used for accommodation allocation (existing `ageGroup` field on attendees).                                                           |

---

## Differentiators (Competitive Advantage)

Features that set this apart from generic event tools, aligned with the existing finance/reconciliation core value.

| Feature                                       | Value Proposition                                                                                                                        | Complexity | Notes                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source-agnostic finance dashboard**         | Operators see revenue/orders/reconciliation for BOTH Ticket Tailor and internal events in one view. No other church tool does this well. | HIGH       | Core v2 differentiator. Requires unified event contract (ES-05). Existing dashboard queries need to read from `ticketTailorOrders` OR `internalRegistrations`.                  |
| **Integrated Tikkie payment on signup**       | Registration directly generates a Tikkie payment link — no manual step. Competitors require separate payment tools.                      | MEDIUM     | Registration creates order → system auto-generates Tikkie link → link shown on confirmation page + emailed. Builds on existing `tikkiePaymentTemplates` + `tikkiePaymentLinks`. |
| **Registration → accommodation pipeline**     | Signups flow directly into room allocation. No re-keying data.                                                                           | MEDIUM     | Internal registrations create attendee records that feed existing accommodation allocation engine (ACC-01 through ACC-06).                                                      |
| **Unified attendee view**                     | One attendee detail page shows registration data, payment history, room assignment — regardless of source.                               | MEDIUM     | Existing `DASH-04` attendee detail + source-agnostic reads.                                                                                                                     |
| **Dual-source event operations**              | Run some events through Ticket Tailor, others internally, with identical admin experience for finance.                                   | HIGH       | Differentiator vs. tools locked into one ticketing platform. Church teams often use multiple tools.                                                                             |
| **Registration with payment status tracking** | Public registrant can see if their payment is pending/paid without logging into admin dashboard.                                         | MEDIUM     | Lightweight public status page at `/events/[id]/status?email=...` showing registration + Tikkie payment status.                                                                 |

---

## Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build (or defer heavily).

| Anti-Feature                                       | Why Requested                                                  | Why Problematic                                                                                                                                    | Alternative                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Public attendee accounts / login**               | "Registrants should manage their own bookings"                 | Adds auth complexity (Clerk public users vs admin users), session management, password resets, GDPR scope. Church teams prefer admin-managed flow. | Admin handles changes. Provide email-based status lookup (no account needed).                                                  |
| **Full self-service registration editing**         | "Let registrants change their ticket type, add people, cancel" | Race conditions on capacity, payment recalculation, Tikkie link invalidation. Major scope creep for MVP.                                           | Registrant emails admin, admin edits via dashboard. Add self-service in v2.x after validation.                                 |
| **Real-time availability counters on public page** | "Show '3 spots left' to create urgency"                        | WebSocket/subscription complexity for public (unauthenticated) users. Cache invalidation headaches. Can cause overselling if not perfectly synced. | Show capacity status as "Available" / "Almost Full" / "Full" based on periodic check (updated on registration, not real-time). |
| **Complex discount/coupon system**                 | "Early bird pricing, group discounts, promo codes"             | Coupon validation, stacking rules, audit trail, price recalculation on partial use. Planning Center charges extra for this.                        | Use ticket types for early bird (e.g., "Early Bird Adult" with earlier deadline). Keep discount codes for post-MVP.            |
| **Multi-step wizard registration**                 | "Make it look professional with progress steps"                | Church registrations are typically short. Multi-step adds drop-off risk, state management complexity, and mobile UX issues.                        | Single-page form with collapsible sections. Keep it fast.                                                                      |
| **QR code tickets / digital passes**               | "Send a scannable ticket like Eventbrite"                      | QR generation, validation infrastructure, check-in app. Not needed for church conferences where you have a known attendee list.                    | Use attendee name + email for check-in. Existing `checkedInAt` field supports this.                                            |
| **Social login for public registrants**            | "Let people sign up with Google/Facebook"                      | Adds OAuth provider config, account linking logic, privacy concerns for church context where many attendees prefer minimal data sharing.           | Email-only registration. No account created.                                                                                   |
| **Waitlist with auto-promotion**                   | "When someone cancels, auto-promote from waitlist"             | Race conditions, notification timing, payment capture for promoted registrants, Tikkie link generation on promotion.                               | Manual waitlist: admin sees waitlisted registrations, manually promotes.                                                       |

---

## Feature Dependencies

```
[Event CRUD]
    └──requires──> [Ticket Type Definition]
                      └──requires──> [Capacity Model]

[Public Event Listing]
    └──requires──> [Event CRUD] + [Published Status]

[Registration Form]
    └──requires──> [Public Event Listing] + [Ticket Type Selection]

[Duplicate Guard]
    └──requires──> [Registration Form]

[Household Registration]
    └──requires──> [Registration Form]
    └──enhances──> [Accommodation Allocation (existing)]

[Tikkie on Signup]
    └──requires──> [Registration Form] + [Tikkie Templates (existing)]
    └──enhances──> [Reconciliation Dashboard (existing)]

[Source-Agnostic Dashboard]
    └──requires──> [Event CRUD] + [Unified Event Contract]
    └──enhances──> [Finance Dashboard (existing)]

[Registration Status Page]
    └──requires──> [Registration Form] + [Tikkie on Signup]
```

### Dependency Notes

- **Event CRUD → Ticket Type Definition → Capacity Model:** You can't create an event without defining what people can sign up for and how many spots exist.
- **Household Registration enhances Accommodation:** Family-group registrations automatically create `attendeeFamilyGroups` records, improving the existing allocation engine (ACC-04/ACC-06).
- **Tikkie on Signup enhances Reconciliation:** New registrations immediately appear in reconciliation with payment links, closing the loop for internal events.
- **Source-Agnostic Dashboard conflicts with nothing** but requires careful schema design — the unified event contract must not break existing Ticket Tailor queries.

---

## Internal vs Integration-Backed Events: Comparison

| Aspect                   | Integration-Backed (Ticket Tailor)         | Internal                                |
| ------------------------ | ------------------------------------------ | --------------------------------------- |
| **Event creation**       | Synced from Ticket Tailor API              | Admin creates in dashboard              |
| **Ticket types**         | Discovered from TT attendee records        | Admin defines explicitly                |
| **Orders/Registrations** | Synced from TT API (webhook + manual sync) | Created by public signup form           |
| **Attendee data**        | Pulled from TT issued tickets              | Collected at registration time          |
| **Payment**              | Handled by TT (external)                   | Tikkie link generated on signup         |
| **Revenue tracking**     | TT order amounts → dashboard               | Registration amounts → dashboard        |
| **Reconciliation**       | TT orders vs Tikkie payments               | Registration status vs Tikkie payments  |
| **Capacity**             | Managed in TT (source of truth)            | Managed in Convex (our source of truth) |
| **Source identifier**    | `source: "integration"`                    | `source: "internal"`                    |
| **Data ownership**       | TT owns event/order truth                  | We own everything                       |

### Key Design Principle

Both sources MUST produce the same shape for downstream consumers (dashboard, reconciliation, accommodation). The source field is a label, not a fork in logic. Dashboard queries should be:

```
getAllEvents() → returns { id, name, startsAt, source }[]
getOrdersForEvent(eventId) → returns orders regardless of source
getAttendeesForEvent(eventId) → returns attendees regardless of source
```

---

## MVP Definition (v2.0)

### Launch With (Phase 17)

Minimum to validate the dual-source + public signup concept.

- [ ] **Admin event CRUD** — create/edit/publish internal events with ticket types + capacity (ES-02)
- [ ] **Published/draft toggle** — control event visibility (ES-02)
- [ ] **Public event listing** (`/events`) — browse published events, no auth (ES-03)
- [ ] **Event detail page** — full event info + ticket types (ES-03)
- [ ] **Registration form** — name, email, phone, ticket type, quantity (ES-03)
- [ ] **Duplicate submission guard** — email+event dedup (ES-04)
- [ ] **Capacity enforcement** — atomic per-ticket-type cap check (ES-04)
- [ ] **Source selector** — admin chooses `integration` or `internal` per event (ES-01)
- [ ] **Source-agnostic event contract** — dashboard reads both sources (ES-05)
- [ ] **Registration → Tikkie link** — auto-generate on signup, show on confirmation (connects to TK-01/TK-02)

### Add After Validation (v2.0.x)

- [ ] **Household/group registration** — multi-person signup per submission
- [ ] **Dietary/accessibility fields** — optional per-attendee needs
- [ ] **Registration status page** — public email-based lookup
- [ ] **Email confirmation** — send registration summary via email
- [ ] **Age group / category** — segmented ticket types

### Future Consideration (v2.1+)

- [ ] **Waitlist (manual)** — admin-managed waitlist, no auto-promotion
- [ ] **Early bird ticket types** — time-limited pricing tiers
- [ ] **Registration export** — CSV download for internal event registrations
- [ ] **Check-in integration** — mark internal registrants as checked in from dashboard
- [ ] **Self-service edit** — email-magic-link to modify registration

---

## Feature Prioritization Matrix

| Feature                   | User Value | Implementation Cost | Priority |
| ------------------------- | ---------- | ------------------- | -------- |
| Event CRUD + ticket types | HIGH       | MEDIUM              | P1       |
| Public event listing      | HIGH       | LOW                 | P1       |
| Registration form         | HIGH       | LOW                 | P1       |
| Capacity enforcement      | HIGH       | MEDIUM              | P1       |
| Duplicate guard           | HIGH       | MEDIUM              | P1       |
| Source-agnostic contract  | HIGH       | HIGH                | P1       |
| Tikkie on signup          | HIGH       | MEDIUM              | P1       |
| Published/draft toggle    | HIGH       | LOW                 | P1       |
| Household registration    | MEDIUM     | HIGH                | P2       |
| Dietary fields            | MEDIUM     | LOW                 | P2       |
| Registration status page  | MEDIUM     | MEDIUM              | P2       |
| Email confirmation        | MEDIUM     | MEDIUM              | P2       |
| Age group categories      | MEDIUM     | LOW                 | P2       |
| Waitlist (manual)         | LOW        | LOW                 | P3       |
| Early bird tickets        | LOW        | LOW                 | P3       |

---

## Competitor Feature Analysis

| Feature                  | Planning Center Registrations  | Eventbrite              | Our Approach                                                                         |
| ------------------------ | ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| Event creation           | Full CRUD, categories, caps    | Full CRUD, ticket tiers | Admin CRUD with ticket types + capacity. Simpler than PC.                            |
| Public signup            | Church Center app + web        | Eventbrite listing page | Next.js public routes. No app needed.                                                |
| Household signup         | Yes (family registration)      | No (individual only)    | Yes — leverages existing `attendeeFamilyGroups`.                                     |
| Payment                  | Card/ACH only (US/CA/AU/NZ)    | Card/PayPal global      | Tikkie (Netherlands-focused) + manual bank transfer. Matches existing payment infra. |
| Capacity management      | Per-category caps              | Per-ticket-type caps    | Per-ticket-type caps with atomic enforcement.                                        |
| Waitlist                 | Yes (auto-promote)             | Yes (auto-promote)      | Manual only for MVP. Avoids race conditions.                                         |
| Pricing                  | Per-attendee tier ($0–$239/mo) | Per-ticket fee (3.7%+)  | Free (self-hosted). Differentiator for cost-sensitive churches.                      |
| Integration with finance | Internal PC ecosystem only     | Standalone              | Integrated with existing reconciliation + Tikkie + accommodation.                    |

---

## Existing Infrastructure to Reuse

| Existing Asset                                   | How It Connects to v2                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `tikkiePaymentTemplates`                         | Pre-fill Tikkie amounts for internal event ticket types                                             |
| `tikkiePaymentLinks` + `tikkiePayments`          | Registration creates payment link; payment auto-matches registration                                |
| `attendeeFamilyGroups` / `attendeeFamilyMembers` | Household registration populates these directly                                                     |
| `accommodationRooms` / room allocation engine    | Internal registrants flow into accommodation like TT attendees                                      |
| `payments` table (source-agnostic)               | Already supports `tikkie`/`bank_transfer`/`cash` — internal registrations use same                  |
| Convex typed contracts                           | New internal event queries follow same pattern as existing `events.ts`, `orders.ts`, `attendees.ts` |
| Clerk auth                                       | Dashboard routes stay protected; public `/events` routes bypass Clerk                               |

---

## Risks Specific to Features

| Risk                                              | Impact                                  | Mitigation                                                                                                   |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unified event contract breaks existing TT queries | v1.0 dashboard regression               | Wrap existing queries, don't rewrite. Add source field, default to `"integration"` for TT records.           |
| Capacity race condition on popular events         | Oversold events                         | Use Convex transactions for atomic capacity check + decrement. Test with concurrent registration simulation. |
| Public form spam                                  | Junk registrations filling capacity     | Honeypot field + rate limiting on Convex mutation. Add CAPTCHA only if spam occurs.                          |
| Tikkie link generation fails on signup            | Registration exists but no payment link | Queue link generation (async action). Show "payment link pending" on confirmation. Retry via cron.           |
| Email deliverability for confirmation             | Registrant never receives confirmation  | Show confirmation on-page as primary. Email is enhancement, not requirement for MVP.                         |

---

## Sources

- Existing codebase analysis (schema.ts, events.ts, orders.ts, attendees.ts, accommodation.ts, payments.ts, tikkie.ts)
- v1.0-REQUIREMENTS.md (ES-01 through ES-05 deferred requirements)
- PROJECT.md + ROADMAP.md (v2.0 scope definition)
- Planning Center Registrations (get.planningcenteronline.com/registrations) — church registration feature benchmark
- Web search: church conference event registration features 2026
- Web search: event registration form field requirements 2026

---

_Feature research for: Conference Finance Dashboard v2.0 — Event Signup + Dual-Source Events_
_Researched: 2026-03-27_
