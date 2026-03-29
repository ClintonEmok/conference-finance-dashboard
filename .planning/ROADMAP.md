# Roadmap: Conference Finance Dashboard

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27 (archive: `.planning/milestones/v1.0-ROADMAP.md`, requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`, audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`)
- 🚧 **v2.0 Event Signup + Dual-Source Events** — planned

## Active Milestone: v2.0

**Objective:** Run conference registrations from either external integrations or internal tooling while preserving one consistent finance/reconciliation experience.

### Scope

- Public event listing + event detail + signup flow
- Internal event/ticket type/registration data model
- Source-aware admin controls for integration vs internal mode
- Source-agnostic event contracts for dashboard/finance reads
- Backward compatibility for existing Ticket Tailor and Tikkie workflows

### Out of Scope

- Multi-tenant/public attendee account management
- Full self-service attendee profile editing after signup
- Replacing provider integrations as source of truth for integration-backed events

## Phases

- [ ] **Phase 17: Fix Critical Code Review Issues (INSERTED)** — urgent
- [ ] **Phase 18: Schema + Canonical Contracts**
- [ ] **Phase 19: Public Signup Pages**
- [ ] **Phase 20: Admin Event Management**
- [ ] **Phase 21: Finance Integration**

---

### Phase 17: Fix Critical Code Review Issues (INSERTED)

**Goal:** Address critical security, auth, data integrity, and UI issues discovered during the 4-subagent code review of the v1.0 codebase before starting v2.0 work.

**Depends on:** Completed v1.0 baseline (Phase 16)

**Requirements:** TBD (to be scoped during planning)

**Success Criteria:**

1. ✅ All Convex mutations enforce authentication via `ctx.auth.getUserIdentity()` — no publicly callable financial operations
2. ✅ Webhook signature verification rejects requests when secrets are not configured
3. Room occupancy uses authoritative count (remove denormalized `occupiedBeds` drift)
4. Unbounded `.collect()` calls replaced with indexed queries or `.take(N)`/`.paginate()`
5. ✅ Error boundaries exist for all dashboard routes — no white-screen crashes
6. CSV export includes all fields (isArchived, archivedAt, archiveReason)
7. Race conditions in payment auto-match and Tikkie quota enforcement resolved
8. ✅ `formatMoney` consolidated into shared utility (no longer duplicated in 14 files)
9. ✅ Custom modal shells in payment/Tikkie UI replaced with accessible Radix Dialog primitives

Plans:

- [x] 17-01-PLAN.md — Convex auth guard on audited public write mutations
- [x] 17-02-PLAN.md — Webhook fail-closed behavior + Convex auth config validation (completed 2026-03-28)
- [x] 17-03-PLAN.md — Rate limiting, integration timeouts/retries, and auto-sync hardening (completed 2026-03-29)
- [ ] 17-04-PLAN.md — Dashboard error/loading boundaries
- [x] 17-05-PLAN.md — Route-level error and loading fallbacks (completed 2026-03-28)
- [x] 17-06-PLAN.md — Centralize money formatting + fix modal accessibility (completed 2026-03-29)
- [x] 17-07-PLAN.md — Room occupancy single-sourced from attendee assignments + mutation consolidation (completed 2026-03-29)
- [ ] 17-08-PLAN.md — Indexed/bounded finance and attendee reads
- [ ] 17-09-PLAN.md — Accommodation board performance + shared interface extraction

---

### Phase 18: Schema + Canonical Contracts

**Goal:** Establish the canonical event data model that both internal and integration-backed events share, with atomic capacity enforcement and a source-agnostic foundation for all downstream consumers.

**Depends on:** Phase 17 (critical fixes resolved)

**Requirements:** ESCH-01, ESCH-02, ESCH-03, ESCH-04

**Success Criteria:**

1. Canonical `events` table exists with `source` discriminator, `slug`, `published`, `startsAt`, `location`, `currency`, and `bannerImageKey` fields and both integration-synced and internal events populate it
2. `eventTicketTypes` is populated for both sources — one table powers public detail pages and finance views regardless of event source
3. Registration insert rejects when capacity is full (denormalized counter, atomic in single Convex mutation)
4. Registration insert rejects duplicate email per event (normalized email comparison, atomic in same mutation as insert)
5. Admin can upload banner images via Cloudflare R2 presigned URLs; public pages serve images from R2 CDN

Plans:

- [ ] 18-01-PLAN.md — Canonical schema (`events`, `eventTicketTypes`, `eventRegistrations` tables) + domain types
- [ ] 18-02-PLAN.md — Cloudflare R2 integration (presigned upload API route + CDN serving helper)
- [ ] 18-03-PLAN.md — Integration sync adapter (Ticket Tailor → canonical tables) + one-time backfill
- [ ] 18-04-PLAN.md — Internal event CRUD mutations + source-agnostic Convex queries

---

### Phase 19: Public Signup Pages

**Goal:** Public users can discover published events, view event details, and register with capacity and duplicate protection — no auth required.

**Depends on:** Phase 18 (schema, queries, mutations)

**Requirements:** EPUB-01, EPUB-02, EPUB-03, EPUB-04, EPUB-05

**Success Criteria:**

1. Public user can browse published events at `/events` with banner image thumbnail, title, date, and location visible for each event
2. Public user can view event detail page showing banner image, description, date, location, and available ticket types with remaining capacity status
3. Public user can submit a registration form with name, email, phone, and selected ticket type
4. Registration fails with clear message when event is at capacity — no overbooking occurs
5. Registration fails with clear message when the same email has already registered for that event

Plans:

- [ ] 19-01-PLAN.md — `/events` route group (listing page + detail page, no auth layout isolation)
- [ ] 19-02-PLAN.md — Registration form (React Hook Form + Zod) + signup Convex mutation with rate limiting
- [ ] 19-03-PLAN.md — Confirmation/error UX (success page, capacity-full feedback, duplicate feedback)

---

### Phase 20: Admin Event Management

**Goal:** Admin can manage internal events end-to-end (create, edit ticket types, view registrations) and browse integration events in a unified read-only view.

**Depends on:** Phase 18 (schema, queries, mutations)

**Requirements:** EADM-01, EADM-02, EADM-03, EADM-04, EADM-05

**Success Criteria:**

1. Admin can view a unified event list showing both integration-synced and internal events, distinguished by source badge
2. Admin can create an internal event with title, description, date, location, slug, publish status, currency, and optional banner image upload
3. Admin can add, edit, and remove ticket types on internal events (name, price, capacity)
4. Integration events appear as read-only entries in the admin event list — admin cannot edit them
5. Admin can view registrations for internal events with attendee name, email, phone, and ticket type

Plans:

- [ ] 20-01-PLAN.md — Dashboard events list page (unified view, source filter, source badges)
- [ ] 20-02-PLAN.md — Internal event editor + ticket type management (create/edit events, add/edit/remove ticket types)
- [ ] 20-03-PLAN.md — Registration viewer for internal events (attendee list with details)

---

### Phase 21: Finance Integration

**Goal:** Finance dashboard and reconciliation views show revenue from both Ticket Tailor and internal events transparently, with automatic Tikkie link generation for paid internal registrations.

**Depends on:** Phase 18 (canonical events), Phase 19 (registrations exist)

**Requirements:** EFIN-01, EFIN-02, EFIN-03, EFIN-04

**Success Criteria:**

1. Revenue and orders dashboard shows combined totals from Ticket Tailor and internal events without duplicate or missing data
2. Reconciliation view displays orders and payments from both sources in a single unified list
3. Internal registrations automatically create Tikkie payment links using event-level templates (same flow as existing Ticket Tailor orders)
4. Dashboard event references resolve through canonical `events` table — no finance view breaks when viewing internal events

Plans:

- [ ] 21-01-PLAN.md — `internalOrders` table + shared `OrderDTO` read-time union layer
- [ ] 21-02-PLAN.md — Source-agnostic revenue/dashboard/reconciliation view updates
- [ ] 21-03-PLAN.md — Auto-Tikkie flow for paid internal registrations

---

## Progress

| Phase                                           | Goal                                                | Requirements                       | Plans | Status  |
| ----------------------------------------------- | --------------------------------------------------- | ---------------------------------- | ----- | ------- |
| 17 - Fix Critical Code Review Issues (INSERTED) | Security, auth, data integrity, UI resilience fixes | TBD                                | 6/9   | Active  |
| 18 - Schema + Canonical Contracts               | Canonical event data model with dual-source support | ESCH-01, ESCH-02, ESCH-03, ESCH-04 | 4     | Pending |
| 19 - Public Signup Pages                        | Public event discovery and registration flow        | EPUB-01..05                        | 3     | Pending |
| 20 - Admin Event Management                     | Admin CRUD for internal events + unified list       | EADM-01..05                        | 3     | Pending |
| 21 - Finance Integration                        | Source-agnostic finance views + auto-Tikkie         | EFIN-01..04                        | 3     | Pending |

**Totals:** 5 phases, 22 plans, 18 requirements mapped
