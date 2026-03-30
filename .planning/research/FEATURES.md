# Feature Research: Attendee Signup + Accommodation Self-Assignment

**Domain:** Public conference registration and rooming data capture
**Researched:** 2026-03-29
**Confidence:** HIGH

## Table Stakes (v2.0 Must-Have)

- Public non-admin signup flow with clear progress steps
- Ticket-first flow ordering
- Conditional accommodation step only when event inventory applies
- Booker-managed assignment of people to room beds
- Required attendee rooming fields (gender, location, dietary, roommate request, phone)
- Explicit warning for unfilled beds (possible random fill)
- Atomic submit with actionable validation errors
- Compatibility with existing operator accommodation and finance workflows

## High-Value Differentiators

- Native in-app flow tailored to room allocation (instead of generic external forms)
- Family/group self-assignment before operator intervention
- Better upstream data quality for downstream allocation decisions
- Source-agnostic behavior that keeps integration-backed and internal events aligned

## Explicit Non-Goals (v2.0)

- Full public attendee account portal
- Post-submit self-service booking edits
- Automated optimization-grade roommate engine
- Multi-tenant organization support
- Coupon/discount commerce layer

## Risk-Heavy Features Requiring Guardrails

- **Public submit endpoint:** needs abuse controls (rate limit + honeypot + idempotency strategy)
- **Capacity + duplicate protection:** must run in same transaction as write
- **Room assignment compatibility:** assignment contract must be immediately consumable by operator tooling

## Feature Dependency Chain

1. Canonical contracts and write model
2. Transactional and public-safety guards
3. Public multi-step UX
4. Operator read compatibility verification

## MVP Acceptance Shape

- A family/group can complete one guided signup, assign beds where applicable, submit once, and appear in operator rooming surfaces without manual data reshaping.
