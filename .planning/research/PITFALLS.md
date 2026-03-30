# Pitfalls Research: v2.0 Signup Replan

**Domain:** Non-admin multi-step signup with accommodation self-assignment
**Researched:** 2026-03-29
**Confidence:** HIGH

## Critical Pitfalls

### 1) Partial Submission Writes

**Failure mode:** Booker, attendees, assignments, and notes persist inconsistently.

**Avoidance:** Single atomic mutation for complete submission envelope.

---

### 2) Capacity and Duplicate Races

**Failure mode:** Concurrent submits overbook capacity or create duplicate registrations.

**Avoidance:** Check-and-write in same mutation transaction; no pre-check query split.

---

### 3) Public Endpoint Abuse

**Failure mode:** Bot/spam submissions fill events or create noisy data.

**Avoidance:** Public rate limits + honeypot and/or idempotency strategy at submit boundary.

---

### 4) Source Compatibility Regressions

**Failure mode:** New internal/public signup data breaks existing Ticket Tailor/Tikkie-based reads.

**Avoidance:** Source-aware domain model with source-agnostic downstream read contracts.

---

### 5) Room Assignment Contract Drift

**Failure mode:** Public self-assignment data cannot be consumed by operator room views without manual mapping.

**Avoidance:** Define canonical assignment payload and keep operator read model aligned from Phase 18 onward.

---

### 6) Auth Boundary Regression

**Failure mode:** Public pages accidentally require auth, or dashboard routes become exposed.

**Avoidance:** Keep existing `proxy.ts` boundary intact (`/dashboard` protected, public signup routes open) and verify both directions.

## Phase Mapping

- **Phase 18:** Pitfalls 1, 2, 3, 5 (contracts + atomic writes + guards)
- **Phase 19:** Pitfalls 3, 6 (public UX + route behavior)
- **Phase 20:** Pitfall 4 (compatibility and operator handoff verification)
