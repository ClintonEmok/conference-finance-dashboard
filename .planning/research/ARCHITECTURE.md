# Architecture Research: Attendee Signup + Accommodation Self-Assignment

**Domain:** Public signup + accommodation handoff in a finance-first conference platform
**Researched:** 2026-03-29
**Confidence:** HIGH

## Architecture Direction

Use an additive architecture that introduces a canonical public signup contract while preserving integration-backed operational paths.

Core principle: **one submission envelope, one write transaction, one operator-consumable output shape**.

## System Boundaries

- **Public surface (unauthenticated):** Signup pages and submit action
- **Protected operator surface (Clerk):** Dashboard, allocation board, reconciliation
- **Shared backend domain:** Source-aware event/ticket/accommodation contracts + submission write model

Current auth boundary already supports this: `proxy.ts` protects `/dashboard(.*)` and leaves public routes open.

## Data Model Strategy

- Keep source boundary explicit (`integration` vs `internal`) at event layer
- Expose one source-agnostic read shape for public signup pages
- Persist signup in one envelope containing:
  - booker
  - attendees
  - ticket selections
  - room assignments
  - notes/rooming metadata
- Ensure operator read models can consume assignment + notes directly (no reshape pass)

## Write Path Strategy

Single mutation per submission with:

1. Validation (strict args)
2. Transactional guards (capacity, duplicates)
3. Abuse controls (rate limit/honeypot/idempotency)
4. Atomic persistence of all submission parts
5. Deterministic return contract

This aligns with Convex mutation/OCC semantics and existing project guardrail patterns.

## Compatibility Strategy

- Do not break existing Ticket Tailor/Tikkie behavior
- Add internal/public signup data through canonical adapters
- Keep reconciliation and allocation reads source-agnostic
- Verify end-to-end path before enabling broad rollout

## Architecture Risks and Controls

- **Partial writes:** prevented by one mutation envelope
- **Concurrency overbooking:** prevented by transactional guard checks at mutation boundary
- **Public abuse:** limited by route + mutation safeguards
- **Legacy regression:** prevented by compatibility adapters and phase-gated rollout

## Phase Fit

- **Phase 18:** contracts + atomic submission + guards
- **Phase 19:** public multi-step UX
- **Phase 20:** operator handoff and compatibility verification
