# Project Research Summary

**Project:** Conference Finance Dashboard — v2.0 Event Signup & Dual-Source Events
**Domain:** Church conference event registration with integrated finance
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

This project adds public event signup and internal event management to a mature conference finance dashboard that already integrates Ticket Tailor, Tikkie payments, reconciliation, and accommodation allocation. The v2.0 milestone introduces a **dual-source architecture** where integration-backed (Ticket Tailor) and admin-created (internal) events coexist behind a unified data contract, allowing the existing finance dashboard to operate on both sources transparently.

The research concludes a **minimal-impact, additive approach** is optimal. The existing stack (Next.js 16 + React 19 + Convex + Clerk + shadcn/ui) is solid and well-suited. Only 4 new runtime dependencies are needed: `react-hook-form`, `@hookform/resolvers`, `zod`, and `@convex-dev/rate-limiter`. The architecture centers on a **canonical `events` table** with a source discriminator, where Ticket Tailor events sync in via an adapter and internal events write directly. Public pages live in a separate route group (`/events/`) with no auth, while dashboard pages remain protected. This preserves all existing sync, reconciliation, and accommodation pipelines untouched.

The biggest risks are **capacity overbooking** (mitigated by Convex's transactional mutations with denormalized counters), **public form abuse** (mitigated by Convex-native rate limiting + honeypot), and **finance view breakage** when adding a second event source (mitigated by a source-agnostic read layer that unions both sources into a unified DTO). The research identifies a clear 6-phase build order that respects dependency chains and avoids the most common pitfalls.

## Key Findings

### Recommended Stack

**Existing stack is validated — no changes needed.** The 8 core technologies (Next.js 16, React 19, Convex, Clerk, shadcn/ui, Tailwind 4, TanStack Query, lucide-react) are all current and working well.

**New additions (4 runtime + 5 shadcn components):**

- `react-hook-form` ^7.66.0 — Form state management. Industry standard, minimal re-renders. shadcn Form is built around it.
- `@hookform/resolvers` ^4.1.3 — Zod ↔ React Hook Form bridge. Required by shadcn Form.
- `zod` ^3.24.2 — Schema validation. v3 (not v4) for ecosystem compatibility. Shared schemas between client forms and Convex mutations.
- `@convex-dev/rate-limiter` — Convex-native rate limiting. Transactional (rolls back if mutation fails). Critical for public signup abuse prevention.
- shadcn components: `form`, `select`, `textarea`, `checkbox`, `radio-group`

**Intentionally excluded:** Formik, react-select, i18n libs, Sentry, date-fns, uuid/nanoid, email services, react-phone-input — all out of scope for MVP.

### Expected Features

**Must have (table stakes — launch blockers):**

- Public event listing page (`/events`) — entry point for attendees
- Event detail page with ticket type info — users need details before committing
- Registration form (name, email, phone, ticket type) — minimum viable signup
- Capacity enforcement (atomic, per-ticket-type) — overselling destroys trust
- Duplicate submission guard (email + event) — prevents reconciliation nightmares
- Admin event CRUD with publish/draft toggle — operators need this to manage events
- Source-agnostic finance dashboard — core differentiator, both sources in one view
- Registration → Tikkie payment link — auto-generate on signup, show on confirmation

**Should have (competitive differentiators — v2.0.x):**

- Household/group registration — church events are family affairs
- Dietary/accessibility fields — standard for residential conferences
- Registration status page (email-based lookup) — no login required
- Email confirmation — on-page confirmation is primary; email is enhancement

**Defer (v2.1+):**

- Waitlist (manual only) — avoid race conditions of auto-promotion
- Early bird ticket types — use separate ticket type entries instead
- Self-service registration editing — admin handles changes for MVP
- QR code tickets — name + email check-in is sufficient
- Real-time availability counters — "Available / Almost Full / Full" is enough

### Architecture Approach

A **canonical events table** with a `source` discriminator (`"ticket_tailor"` | `"internal"`) sits on top of the existing `ticketTailorEvents` raw import buffer. Integration events sync into it via a new adapter mutation. Internal events write to it directly. All downstream consumers (finance, public pages, accommodation) reference this canonical table and never check source. Public pages live in `app/events/` with their own layout (no auth, no dashboard shell). Dashboard event management lives in `app/dashboard/events/`. The existing sync, Tikkie, reconciliation, and accommodation code is untouched.

**Major components:**

1. **Canonical `events` table** — unified event records from all sources, indexed by slug, source, and publish status
2. **`eventSignups` table** — public registration records with email+eventId dedup index
3. **`internalEventTicketTypes` table** — admin-defined ticket type config for internal events
4. **Integration sync adapter** — extends existing `sync.ts` to populate canonical events after Ticket Tailor import
5. **Source-agnostic read layer** — unified queries (`getPublicEvents`, `getEventsForLedger`) that return both sources
6. **Public route layer** — `/events/` route group with separate layout, no Clerk auth
7. **Rate-limited signup endpoint** — Convex mutation with `@convex-dev/rate-limiter`

### Critical Pitfalls

1. **Capacity overbooking via non-transactional counting** — Read capacity check + registration insert must happen in the _same_ Convex mutation. Use a denormalized `registeredCount` field, never `.collect().length`. Convex OCC handles retries automatically.

2. **Source-agnostic reads breaking finance views** — Existing finance queries are hardcoded to `ticketTailor*` tables. Build new unified queries that union both sources into a common DTO shape. Keep existing queries working but deprecate them.

3. **Public route auth blocking** — Clerk middleware must explicitly exclude `/events/*` from protected routes. Test unauthenticated access returns 200, not redirect.

4. **Public signup form abuse** — Rate limit the registration mutation (Convex `rateLimiter`), add a honeypot field. Church scale (~hundreds) doesn't need CAPTCHA unless abuse occurs.

5. **Registration data shape mismatch with order model** — Internal registrations need an `internalOrders` table mirroring the existing order shape (`totalAmountMinor`, `currency`, `normalizedStatus`) so finance views sum across both sources.

## Implications for Roadmap

Based on research, suggested 6-phase structure:

### Phase 1: Schema Foundation + Data Contracts

**Rationale:** Everything else depends on the schema existing. All additive — zero risk to existing code.
**Delivers:** `events`, `eventSignups`, `internalEventTicketTypes` tables with proper indexes. Slug strategy. Denormalized capacity counters. Internal order model aligned with finance expectations.
**Addresses:** Table stakes: publish/draft toggle, capacity model, slug uniqueness
**Avoids:** Pitfall 7 (slug collisions), Pitfall 8 (order model mismatch), Pitfall 1 (capacity overbooking — denormalized counter defined)
**Research flag:** LOW — well-documented Convex schema patterns

### Phase 2: Canonical Event Queries + Internal CRUD

**Rationale:** Needs schema from Phase 1. Public pages and dashboard both depend on having queries and mutations available.
**Delivers:** Unified Convex queries (`getPublicEvents`, `getEventBySlug`, `getEventsBySource`), internal event CRUD mutations, `eventSignups.ts`, domain types (`lib/domain/events/`)
**Addresses:** Admin event CRUD, source-agnostic contract foundation
**Avoids:** Pitfall 3 (source-agnostic reads) — builds unified read model from the start
**Research flag:** LOW — extending existing `convex/events.ts` pattern

### Phase 3: Integration Sync Adapter

**Rationale:** Needs canonical events table + queries from Phase 2. Must happen before finance integration so canonical events are populated from Ticket Tailor.
**Delivers:** `syncIntegrationEvent` mutation, modification to `lib/integrations/ticket-tailor/sync.ts`, one-time backfill migration
**Addresses:** Dual-source architecture — Ticket Tailor events flow into canonical table
**Avoids:** Pitfall 3 (source-agnostic reads) — ensures integration events appear in unified queries
**Research flag:** MEDIUM — timing of `syncIntegrationEvent` call relative to order sync needs validation

### Phase 4: Public Pages + Signup Flow

**Rationale:** Needs queries from Phase 2 (works with internal events even before Phase 3). Independent of sync adapter.
**Delivers:** `/events/` route group (listing, detail, confirmation), public signup API endpoint, React Hook Form + Zod validation, rate limiting, honeypot
**Addresses:** Event listing, event detail, registration form, duplicate guard, capacity enforcement, confirmation page
**Avoids:** Pitfall 4 (auth blocking) — separate layout, no `requirePageUser()`. Pitfall 5 (form abuse) — rate limiter + honeypot. Pitfall 1 (overbooking) — transactional capacity check in single mutation.
**Research flag:** LOW — standard Next.js App Router patterns, well-documented

### Phase 5: Dashboard Event Management

**Rationale:** Needs queries + mutations from Phase 2. Can be built in parallel with Phase 4.
**Delivers:** `/dashboard/events/` pages (list, editor), CRUD API routes, dashboard shell navigation update, source badge on event listings
**Addresses:** Admin event CRUD UI, publish/draft toggle UI, capacity status indicators
**Avoids:** UX pitfall — source badge distinguishes integration vs internal events
**Research flag:** LOW — follows existing dashboard page patterns

### Phase 6: Finance Integration + Accommodation Bridge

**Rationale:** Needs canonical events populated (Phase 3) and internal order model (Phase 1). Must come last to avoid breaking existing finance views.
**Delivers:** Modified `getEventsForLedger` to include all sources, Tikkie flow on unified order model, room allocation extended for internal attendees, source-agnostic finance verification
**Addresses:** Source-agnostic finance dashboard, registration → Tikkie link, accommodation pipeline for internal registrants
**Avoids:** Pitfall 3 (finance breakage), Pitfall 6 (room allocation for internal attendees), Pitfall 8 (order model mismatch)
**Research flag:** MEDIUM — `getOrdersWithFilters` join behavior with mixed sources needs validation. Room allocation extension for dual attendee types needs testing.

### Phase Ordering Rationale

- **Phases 1→2→3 form the data backbone** — schema, then queries, then sync adapter. Each builds on the previous.
- **Phases 4 and 5 are parallel** — public pages and dashboard management are independent once Phase 2 provides the query layer.
- **Phase 6 is last** — finance integration requires both sources populated in canonical table, and modifying existing finance queries has the highest regression risk.
- **Pitfall prevention is front-loaded** — Phases 1-2 address 5 of 8 critical pitfalls by establishing correct patterns (denormalized counters, unified DTOs, slug strategy, internal orders) before any UI code is written.

### Research Flags

**Needs deeper research during planning:**

- **Phase 3 (Sync Adapter):** Exact timing of `syncIntegrationEvent` relative to order/attendee sync. The two-step sync adds latency and must handle drift between raw and canonical tables.
- **Phase 6 (Finance Integration):** `getOrdersWithFilters` behavior with mixed event sources. Room allocation mutation extension for dual attendee types (polymorphic reference vs unified table).

**Standard patterns (skip research):**

- **Phase 1 (Schema):** Standard Convex `defineTable` with indexes — well-documented
- **Phase 2 (Queries/CRUD):** Extends existing `convex/events.ts` pattern — established codebase pattern
- **Phase 4 (Public Pages):** Next.js App Router layout scoping + React Hook Form — mature, well-documented
- **Phase 5 (Dashboard):** Follows existing `/dashboard/*` page pattern — established codebase pattern

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | All versions verified via package.json. New deps confirmed via Context7 (React Hook Form, shadcn Form, Convex rate limiter).                                         |
| Features     | HIGH       | Deep codebase analysis of existing schema, functions, and v1.0 requirements. Church registration patterns validated against Planning Center + Eventbrite benchmarks. |
| Architecture | HIGH       | Canonical table pattern well-established. Existing Convex codebase follows clean patterns. App Router layout scoping is well-understood.                             |
| Pitfalls     | HIGH       | Based on Convex OCC docs, existing codebase analysis, and v1.0 requirements traceability. All pitfalls have concrete prevention strategies.                          |

**Overall confidence:** HIGH

### Gaps to Address

- **Backfill migration strategy:** One-time migration from `ticketTailorEvents` → canonical `events` table needs a runbook. Straightforward but needs careful sequencing with existing sync.
- **ConvexProviderWithClerk behavior on public pages:** Root layout wraps in ClerkProvider. Public pages work without auth if Convex functions don't call `ctx.auth.getUserIdentity()`. Verify this doesn't cause token exchange overhead on public routes.
- **Household registration scope:** Marked as v2.0.x (post-MVP). Connects to existing `attendeeFamilyGroups` table — needs design work on how multi-person signup maps to the family group model.
- **Email confirmation delivery:** Explicitly deferred. On-page confirmation is primary. If email is added later, need to evaluate Resend/SendGrid/Mailgun integration.

## Sources

### Primary (HIGH confidence)

- Existing codebase: `convex/schema.ts`, `convex/events.ts`, `convex/attendees.ts`, `convex/orders.ts`, `convex/sync.ts` — direct code analysis
- Convex OCC documentation — transactional mutation behavior, denormalized counters
- Convex rate limiting component — `@convex-dev/rate-limiter` configuration
- Context7 `/react-hook-form/resolvers` — React Hook Form + Zod integration
- Context7 `/shadcn-ui/ui` — shadcn Form component built around RHF
- Context7 `/colinhacks/zod` — v3.24.2 stable, v4 available but ecosystem catching up
- `package.json` + `components.json` — existing stack versions and config

### Secondary (MEDIUM confidence)

- Church registration patterns — Planning Center Registrations feature benchmark
- Web search: church conference event registration features 2026
- Web search: event registration form field requirements 2026
- v1.0-REQUIREMENTS.md — ES-01 through ES-05 deferred requirements

### Tertiary (LOW confidence)

- Integration sync timing — theoretical, needs validation during Phase 3 implementation
- Room allocation dual-attendee extension — inferred from existing `assignRoom` mutation pattern, needs testing

---

_Research completed: 2026-03-27_
_Ready for roadmap: yes_
