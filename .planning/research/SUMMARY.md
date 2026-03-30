# Project Research Summary

**Project:** Conference Finance Dashboard — v2.0 Attendee Signup + Accommodation Self-Assignment
**Domain:** Church conference registration, accommodation, and finance operations
**Researched:** 2026-03-29
**Confidence:** HIGH

## Executive Summary

The v2.0 milestone has been reoriented to the non-admin user flow. Research confirms the best path is additive and compatibility-first: build a public ticket-first multi-step signup that conditionally adds accommodation assignment, capture rooming-critical attendee data at submission time, and hand off structured data directly to operator rooming flows.

Existing system strengths (Convex contracts, Clerk dashboard boundary, accommodation pipeline, reconciliation and Tikkie paths) should be preserved. The main engineering requirement is a robust canonical submission contract with atomic writes and transactional guards.

## Key Findings

- Current accommodation and assignment behavior is tightly coupled to attendee assignment state and should stay single-sourced.
- Public route space is already available (`/dashboard` is the protected boundary), so non-admin signup routes can be introduced without auth middleware expansion.
- Convex guidance and docs strongly support one-mutation submission envelopes, strict validators, bounded/indexed reads, and deterministic retry-safe mutation design.
- Highest risks are partial writes, overbooking/duplicates under concurrency, public endpoint abuse, and compatibility regressions into existing operator/finance surfaces.

## Updated Research Artifacts

- Core milestone research: `.planning/research/v2.0-attendee-signup-self-assignment.md`
- Milestone intent/context capture: `.planning/MILESTONE-CONTEXT.md`

## Roadmap Implication

Research supports this 3-phase sequence:

1. **Phase 18:** Signup domain foundation (contracts, atomic writes, transactional/public safety guards)
2. **Phase 19:** Public multi-step signup experience
3. **Phase 20:** Operator handoff + compatibility verification

## Readiness Verdict

Ready for phase planning and execution. No blocker unknowns remain for starting `/gsd-plan-phase 18`.

---

_Research completed: 2026-03-29_
_Ready for roadmap: yes_
