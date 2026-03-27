# Pitfalls Research

**Domain:** Adding event signup + dual-source events to existing conference finance dashboard
**Researched:** 2026-03-27
**Confidence:** HIGH — based on existing codebase analysis, Convex OCC documentation, and v1.0 requirements traceability

## Critical Pitfalls

### Pitfall 1: Capacity Overbooking via Non-Transactional Counting

**What goes wrong:**
Two concurrent signups read the same "seats available" count, both see capacity, both write registrations — resulting in overbooking. The event shows 100/100 capacity but actually has 101 registrations.

**Why it happens:**
Developers read a capacity field, check if `registered < capacity`, then insert a registration. This is a classic read-then-write race condition. Convex mutations are transactional (OCC with serializability), but only if the capacity check and registration insert happen in the _same mutation_. If you check capacity in a query and insert in a mutation, or split across two mutations, the race window opens.

**How to avoid:**

- Read the event's `registeredCount` and insert the registration in the **same Convex mutation**. Convex OCC will automatically retry if another mutation races.
- Use a denormalized counter on the event document (`registeredCount: number`) rather than counting registration rows each time (Convex guidelines: never use `.collect().length` for counts).
- The mutation should: (1) read event doc, (2) check `registeredCount < capacity`, (3) insert registration, (4) patch event `registeredCount + 1`. All in one transactional mutation.
- For high-throughput scenarios, consider a sharded counter (Convex has a built-in component for this), but for church conference scale (~hundreds of registrations), a single counter field is fine.

**Warning signs:**

- Capacity check and registration insertion are in separate functions
- Using a query to check capacity before calling a mutation to register
- Counting registrations with `.collect().length` instead of a stored counter

**Phase to address:**
Phase 17-01 (Schema + Convex contracts) — define capacity fields and transactional register mutation

---

### Pitfall 2: Duplicate Registrations from Same Email

**What goes wrong:**
Same person signs up multiple times for the same event (double-click, form resubmit, different browsers). Finance views show inflated attendee counts. Reconciliation shows more registrations than Ticket Tailor orders for integration events, confusing operators.

**Why it happens:**
Public signup forms have no identity. Unlike admin-created records (which come from authenticated Ticket Tailor sync), public submissions are unauthenticated. Without a server-side duplicate guard, nothing prevents the same email from registering twice.

**How to avoid:**

- In the registration mutation, query for existing registrations with the same `email` + `eventId` combo before inserting. Reject with a clear error if found.
- Add a Convex index on `internalRegistrations` for `(eventId, email)` lookup.
- Server-side only — never rely on client-side "disable submit button" as the only guard (users can bypass it).
- Consider also checking against `ticketTailorAttendees` by email for the same event, so someone who already bought a Ticket Tailor ticket can't double-register via internal signup.

**Warning signs:**

- No index on email + eventId for registrations table
- Duplicate prevention is client-side only (disabled button, localStorage flag)
- No cross-source duplicate check against Ticket Tailor attendees

**Phase to address:**
Phase 17-01 (Schema + contracts) — add index and duplicate guard in mutation

---

### Pitfall 3: Source-Agnostic Reads Breaking Finance Views

**What goes wrong:**
After adding internal events, existing finance dashboard views (`getEvents`, `getAttendees`, revenue totals, reconciliation) only query `ticketTailor*` tables. Internal event registrations are invisible to finance operators. Or worse: someone adds internal events to the same queries without normalizing the data shape, breaking downstream consumers that expect `providerEventId`, `providerOrderId`, etc.

**Why it happens:**
The existing codebase (`convex/events.ts`, `convex/attendees.ts`) is hardcoded to `ticketTailorEvents` and `ticketTailorAttendees` tables. The temptation is either (a) leave them untouched and internal events are invisible, or (b) bolt internal events into the same queries without a unified contract, creating shape mismatches.

**How to avoid:**

- Create explicit source-agnostic read DTOs (as noted in `17-CONTEXT.md`). A unified `EventSummary` type with `{ source: "integration" | "internal", eventId, name, ... }`.
- Build new query functions that union both sources into the unified shape. Keep existing `ticketTailor*` queries working for backward compatibility but deprecate them.
- Finance views (revenue, reconciliation) should consume the unified contract, not reach into source-specific tables.
- Internal events don't have `providerEventId` or `providerOrderId` — the DTO must handle nullable provider fields gracefully.

**Warning signs:**

- Dashboard queries still import directly from `ticketTailorEvents` table
- No `source` discriminator in event/attendee read models
- Finance totals show only Ticket Tailor data after internal events exist

**Phase to address:**
Phase 17-03 (Admin source selector + unified read model) — build source-agnostic contracts

---

### Pitfall 4: Public Page Auth Middleware Blocking Unauthenticated Access

**What goes wrong:**
The project uses Clerk auth with middleware that protects all routes. Adding public `/events` pages requires carving out unauthenticated paths. If the Clerk middleware config isn't updated, public users get redirected to sign-in before they can see events. Or the opposite: misconfiguration accidentally exposes admin routes.

**Why it happens:**
Clerk's Next.js middleware typically uses `createRouteMatcher` with protected routes. When adding public pages, developers either forget to exclude `/events` from the protected list, or they use an overly broad matcher like `/((?!api|_next|sign-in).*)` which catches `/events`.

**How to avoid:**

- Update Clerk middleware to explicitly list `/events` and `/events/:path*` as public routes.
- Test both directions: (1) unauthenticated user can browse `/events` and submit signup, (2) unauthenticated user CANNOT access `/dashboard/*`.
- Use Clerk's `createRouteMatcher` with an explicit list of protected patterns rather than an exclusion pattern.
- Add an integration test that hits `/events` without auth cookies and expects 200, not 302.

**Warning signs:**

- Middleware uses exclusion patterns (`!api|!_next`) rather than inclusion patterns for protection
- No test verifying public route access without auth
- Manual testing only done while already signed in as admin

**Phase to address:**
Phase 17-02 (Public pages + signup flow) — update middleware config

---

### Pitfall 5: Public Signup Form Abuse and Spam

**What goes wrong:**
Without any protection, a bot discovers the signup endpoint and submits hundreds of fake registrations, filling the event to capacity and blocking real attendees. The admin sees a full event with garbage data.

**Why it happens:**
Public signup endpoints are unauthenticated by design. Unlike admin actions (protected by Clerk), the registration mutation is callable by anyone. Without rate limiting, CAPTCHA, or honeypot fields, automated abuse is trivial.

**How to avoid:**

- Add Convex rate limiting (`rateLimiter`) on the registration mutation — e.g., max 5 submissions per IP per minute.
- Consider a simple honeypot field (hidden CSS field that bots fill, humans don't) — reject if filled.
- For church conferences (low-volume, trusted audience), a honeypot + rate limit is likely sufficient. CAPTCHA is overkill unless abuse actually occurs.
- Add admin ability to bulk-delete suspicious registrations and restore capacity.
- Log registration source (IP, user-agent) for forensic analysis if abuse occurs.

**Warning signs:**

- No rate limiting on public mutations
- Registration mutation has no abuse detection at all
- No admin tooling to clean up bad registrations

**Phase to address:**
Phase 17-02 (Public signup flow) — add rate limiting and honeypot

---

### Pitfall 6: Dual-Source Attendee ID Collisions in Room Allocation

**What goes wrong:**
Room assignment (`assignRoom` mutation) takes a `ticketTailorAttendees` ID. Internal registrations go into a different table. The room allocation system can't assign rooms to internal registrants because it expects Ticket Tailor attendee IDs. Or someone hacks around it by inserting internal registrations into the `ticketTailorAttendees` table, creating a mixed-provenance mess.

**Why it happens:**
`convex/attendees.ts` `assignRoom` mutation explicitly uses `v.id("ticketTailorAttendees")`. The `roomAllocations` table references `eventId` and `roomId` but the attendee→room link is via `assignedRoomId` on `ticketTailorAttendees`. Internal registrations are in a separate table with no room assignment path.

**How to avoid:**

- Either: (a) create a unified attendees table with a `source` discriminator, or (b) extend room allocation to handle both attendee types via a polymorphic reference `{ source, attendeeId }`.
- Option (b) is less disruptive: add `internalAttendeeId` as an optional field on `roomAllocations`, or create a separate `internalRoomAssignments` table.
- The room allocation UI must be able to show and assign both types of attendees.
- Keep the existing `ticketTailorAttendees.assignedRoomId` working for backward compatibility.

**Warning signs:**

- Room assignment functions only accept `ticketTailorAttendees` IDs
- Internal registrations never appear in accommodation views
- No plan for how internal registrants get room assignments

**Phase to address:**
Phase 17-03 (Unified dashboard contracts) — extend room allocation for both sources

---

### Pitfall 7: Event Slug/ID Strategy Confusion

**What goes wrong:**
Public event pages use URL slugs (`/events/summer-conference-2026`). Internal events need slugs. Ticket Tailor events currently use `providerEventId` as the key. Mixing ID strategies leads to: slug collisions between sources, broken deep links when event names change, or confusion about which table an ID refers to.

**Why it happens:**
The existing system uses `providerEventId` (string from Ticket Tailor) as the cross-table foreign key. Internal events don't have a provider ID. If you generate slugs from event names, two events (one TT, one internal) could have the same slug. If you use Convex document IDs in URLs, they're ugly and opaque.

**How to avoid:**

- Generate unique slugs for internal events (e.g., `name + short-random-suffix`), with a unique index to prevent collisions.
- For public URLs, use slugs for internal events and `providerEventId` for integration events — but make the routing layer handle both.
- Or: introduce a unified `events` table that maps source-specific IDs to a common `publicSlug`. This is cleaner but adds a table.
- Never use raw Convex `_id` in public URLs — they're not human-readable and leak database internals.

**Warning signs:**

- No slug field on internal events table
- Public URLs use Convex document IDs
- No unique constraint on event slugs

**Phase to address:**
Phase 17-01 (Schema) — define slug strategy and unique index

---

### Pitfall 8: Registration Data Shape Mismatch with Existing Order/Payment Model

**What goes wrong:**
Internal registrations don't map cleanly to the existing `orders` → `attendees` → `payments` finance model. Ticket Tailor orders have `totalAmountMinor`, `currency`, `normalizedStatus`. An internal registration might be free, or have a different payment flow (Tikkie link sent after registration). Finance views that sum `orders.totalAmountMinor` break when internal events have no corresponding order records.

**Why it happens:**
The finance model assumes every attendee comes through an order with a monetary amount. Internal registrations might be: free (no order), pending payment (order created but Tikkie not yet sent), or paid externally (cash/bank). The reconciliation engine expects Ticket Tailor's order status model.

**How to avoid:**

- For internal events, create an `internalOrders` table that mirrors the shape operators expect: `eventId`, `attendeeId`, `totalAmountMinor`, `currency`, `normalizedStatus`.
- Free registrations get an order with `totalAmountMinor: 0, normalizedStatus: "paid"`.
- Paid registrations start as `pending` and transition to `paid` when payment is recorded.
- The source-agnostic finance read model sums across both `ticketTailorOrders` and `internalOrders`.

**Warning signs:**

- Internal registrations have no corresponding order record
- Finance totals only sum from `ticketTailorOrders`
- No payment tracking path for paid internal events

**Phase to address:**
Phase 17-01 (Schema) — define internal order model aligned with finance expectations

---

## Technical Debt Patterns

| Shortcut                                                                          | Immediate Benefit                             | Long-term Cost                                                                              | When Acceptable                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Store internal registrations in `ticketTailorAttendees` with null provider fields | No new tables, existing queries work          | Mixed provenance in one table, provider fields become meaningless, sync logic gets confused | Never — source separation is the core architectural decision     |
| Skip capacity enforcement for MVP                                                 | Faster to ship, fewer race condition concerns | Overbooking possible, requires data cleanup later                                           | Only for free events with unlimited capacity                     |
| Use client-side duplicate prevention only (disable button)                        | Simple implementation                         | Bots and double-clicks bypass it easily                                                     | Never — server-side check is mandatory                           |
| Hardcode event source in frontend components                                      | Quick visual differentiation                  | Every new source requires frontend changes                                                  | Never — source should be a data property, not a code branch      |
| Count registrations with `.collect().length` instead of denormalized counter      | Simpler code initially                        | Slow queries at scale, OCC conflicts on large tables                                        | Never for capacity checks — Convex explicitly warns against this |

## Integration Gotchas

| Integration             | Common Mistake                                                    | Correct Approach                                                                   |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Clerk middleware        | Protecting all routes, blocking public `/events`                  | Explicitly exclude `/events/*` from protected route matcher                        |
| Convex public mutations | No auth check OR no abuse protection on registration endpoint     | Use `rateLimiter` + honeypot; keep mutation public but rate-limited                |
| Ticket Tailor sync      | Sync overwriting internal event data in unified views             | Keep tables separate; unified reads query both, never merge into one table         |
| Tikkie payment links    | Assuming all events have Ticket Tailor orders for Tikkie creation | Build Tikkie flow on top of unified order model, not `ticketTailorOrders` directly |
| Convex OCC              | Splitting capacity check + registration into separate mutations   | Single transactional mutation: read count, check, insert, increment                |

## Performance Traps

| Trap                                          | Symptoms                             | Prevention                                                                   | When It Breaks                       |
| --------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------ |
| Counting registrations with `.collect()`      | Slow queries as registrations grow   | Denormalized counter on event document                                       | ~1,000+ registrations per event      |
| Loading all events in one query               | Slow page load for `/events` listing | Paginate with `.take()` or `paginate()`                                      | ~50+ events                          |
| Unbounded attendee lists in finance views     | Dashboard timeout                    | Index-based queries with pagination                                          | ~5,000+ attendees across events      |
| Real-time subscriptions on registration count | High bandwidth, frequent re-renders  | Poll on interval or subscribe to event doc only (not full registration list) | Concurrent users watching same event |

## Security Mistakes

| Mistake                                                               | Risk                                                                  | Prevention                                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Exposing Convex document IDs in public URLs                           | Enumeration attack — attacker can guess other event/registration IDs  | Use slugs or UUIDs for public-facing identifiers                                                                 |
| Accepting user-supplied `eventId` for registration without validation | Attacker registers for any event, including unpublished/draft events  | Validate event exists AND is published in the mutation                                                           |
| No input sanitization on registration form fields                     | XSS via stored name/email fields if displayed in admin dashboard      | Sanitize on display (React does this by default for text content, but be careful with `dangerouslySetInnerHTML`) |
| Registration mutation callable without any throttling                 | Denial of service — fill all events to fake capacity                  | Convex `rateLimiter` on registration mutation                                                                    |
| Storing raw Ticket Tailor API responses in internal event records     | Data leakage if TT payloads contain PII not intended for internal use | Don't cross-contaminate — internal events have no TT payload                                                     |

## UX Pitfalls

| Pitfall                                                                    | User Impact                                                             | Better Approach                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| No visual distinction between integration and internal events in dashboard | Operators confused about which events are externally managed vs. in-app | Source badge/icon on every event listing and detail view                                          |
| Registration success page has no next-steps guidance                       | User doesn't know if they're confirmed, what to expect, or how to pay   | Clear confirmation with: status, payment instructions (if applicable), event details              |
| Admin can't see capacity status at a glance                                | No way to know which events are filling up                              | Capacity indicator (e.g., "73/100 registered") on event cards                                     |
| Public event page shows financial data (revenue, orders)                   | Information leak — public users see admin-only data                     | Strict data separation: public pages get event metadata + capacity only                           |
| Form errors don't explain _why_ registration failed (e.g., "event full")   | User frustrated, doesn't know if it's a bug or intentional              | Specific error messages: "This event is full", "You're already registered", "Registration closed" |

## "Looks Done But Isn't" Checklist

- [ ] **Capacity enforcement:** Check that the capacity mutation is transactional (single mutation, not query+mutation) — test with concurrent requests
- [ ] **Duplicate prevention:** Verify server-side duplicate check exists — test by submitting same email twice
- [ ] **Public route access:** Hit `/events` without auth cookies — should return 200, not redirect to sign-in
- [ ] **Admin route protection:** Hit `/dashboard` without auth cookies — should redirect, not show data
- [ ] **Finance view completeness:** After creating an internal event with registrations, verify it appears in dashboard revenue/order views
- [ ] **Room allocation for internal attendees:** Verify internal registrants appear in accommodation views and can be assigned rooms
- [ ] **Source labeling:** Every event/attendee row in admin UI shows whether it's from Ticket Tailor or internal
- [ ] **Slug uniqueness:** Try creating two internal events with the same name — slugs must differ
- [ ] **Rate limiting:** Submit 10 registrations rapidly — should get rate-limited after threshold
- [ ] **Capacity recovery:** Delete a registration — verify `registeredCount` decrements and slot becomes available

## Recovery Strategies

| Pitfall                                         | Recovery Cost | Recovery Steps                                                                                                                     |
| ----------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Overbooked event                                | HIGH          | Identify excess registrations, contact affected users, manually adjust capacity or refund. Data cleanup requires careful ordering. |
| Duplicate registrations                         | MEDIUM        | Query for duplicate email+eventId combos, keep earliest, delete extras, adjust capacity counter.                                   |
| Finance views missing internal data             | MEDIUM        | Build unified read model, backfill any missing order records for existing internal registrations.                                  |
| Public route blocked by auth                    | LOW           | Update Clerk middleware config, deploy. No data impact.                                                                            |
| Spam registrations                              | MEDIUM        | Admin bulk-delete by pattern (same IP, same timestamp range), restore capacity counter. Add rate limiting.                         |
| Room allocation can't handle internal attendees | MEDIUM        | Extend room assignment mutations, create migration to allow both attendee types.                                                   |

## Pitfall-to-Phase Mapping

| Pitfall                                     | Prevention Phase                        | Verification                                     |
| ------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Capacity overbooking (P1)                   | 17-01 — Schema + transactional mutation | Concurrent registration load test                |
| Duplicate registrations (P2)                | 17-01 — Index + server-side guard       | Submit duplicate email, expect rejection         |
| Source-agnostic reads breaking (P3)         | 17-03 — Unified read DTOs               | Internal event appears in dashboard views        |
| Public route auth blocking (P4)             | 17-02 — Middleware config               | Unauthenticated `/events` returns 200            |
| Form abuse/spam (P5)                        | 17-02 — Rate limiting + honeypot        | Rapid submissions get throttled                  |
| Room allocation for internal attendees (P6) | 17-03 — Extended room assignment        | Internal registrant can be assigned a room       |
| Slug/ID collisions (P7)                     | 17-01 — Slug strategy + unique index    | Two events with same name get different slubs    |
| Order/payment model mismatch (P8)           | 17-01 — Internal order table            | Free registration shows as paid order in finance |

## Sources

- Convex OCC documentation: https://docs.convex.dev/database/advanced/occ — confirmed transactional mutations auto-retry on conflicts
- Convex best practices: https://docs.convex.dev/understanding/best-practices — denormalized counters, `.collect()` avoidance, access control on public functions
- Convex error guide: https://docs.convex.dev/error — OCC write conflicts, sharded counter pattern
- Convex rate limiting: https://docs.convex.dev/agents/rate-limiting — `rateLimiter` for abuse prevention
- Phase 17 CONTEXT: `.planning/phases/17-dual-source-event-signup-platform/17-CONTEXT.md` — scope boundaries, initial architecture direction
- v1.0 Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md` — ES-01 through ES-05 deferred requirements
- Existing schema: `convex/schema.ts` — current table structure and index strategy
- Existing functions: `convex/events.ts`, `convex/attendees.ts` — current query/mutation patterns

---

_Pitfalls research for: Adding event signup + dual-source events to conference finance dashboard_
_Researched: 2026-03-27_
