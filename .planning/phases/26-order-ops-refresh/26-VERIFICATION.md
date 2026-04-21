---
phase: 26-order-ops-refresh
verified: 2026-04-21T16:27:45Z
status: gaps_found
score: 1/3 must-haves verified
gaps:
  - truth: "Runtime joins use one canonical internal orders identifier contract"
    status: partial
    reason: "Canonical write paths exist, but runtime-facing helpers still resolve the same relationship through providerOrderId/orderId fallbacks instead of a single internal key."
    artifacts:
      - path: "lib/domain/finance/payments.ts"
        issue: "resolveCanonicalOrderId accepts providerOrderId or orderId and resolves by provider first."
      - path: "app/api/payments/route.ts"
        issue: "resolvePaymentOrder enriches by providerOrderId first, then falls back to orderId."
      - path: "lib/domain/finance/matched-payments.ts"
        issue: "Reconciliation still maps matched payments by providerOrderId ?? orderId and performs legacy lookups."
    missing:
      - "Make canonical orderId the sole join key for new runtime reads/writes"
      - "Move legacy provider-id handling behind migration-only adapters"
  - truth: "Provider data is accessed through explicit ingest/mapping boundaries instead of acting as runtime truth"
    status: failed
    reason: "Runtime-facing finance code still depends directly on ticketTailor-derived tables and provider fields, so the boundary is convention-based rather than enforced."
    artifacts:
      - path: "convex/orders.ts"
        issue: "Queries ticketTailorOrders and ticketTailorAttendees inside runtime order reads."
      - path: "lib/domain/finance/attendee-detail.ts"
        issue: "Builds finance and payment history from providerOrderId-based matches."
      - path: "lib/domain/finance/tikkie-links.ts"
        issue: "Resolves links by providerOrderId and falls back to orderId."
    missing:
      - "A dedicated boundary layer for provider-to-canonical mapping"
      - "Runtime finance reads limited to canonical internal tables"
  - truth: "Legacy provider fallbacks are isolated enough that the new contract is unambiguous"
    status: failed
    reason: "Mixed identifiers remain first-class in public payment and reconciliation surfaces, so the cutover contract is still ambiguous."
    artifacts:
      - path: "lib/domain/finance/reconciliation.ts"
        issue: "Uses providerOrderId ?? orderId as the reconciliation lookup key."
      - path: "lib/domain/finance/matched-payments.ts"
        issue: "Maintains a legacy lookup cache from canonical order ids back to provider ids."
    missing:
      - "Single canonical lookup path"
      - "Boundary-only legacy adapter"
---

# Phase 26: Canonical Runtime Contract Verification Report

**Phase Goal:** New and updated runtime joins use one internal order identity contract, while provider data is accessed through explicit ingest/mapping boundaries instead of direct runtime truth.

**Verified:** 2026-04-21T16:27:45Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Runtime joins use one canonical internal orders identifier contract | △ PARTIAL | Canonical write paths exist, but runtime-facing helpers still accept and resolve provider/order ids interchangeably. |
| 2 | Provider data is accessed through explicit ingest/mapping boundaries | ✗ FAILED | Finance/runtime helpers still query `ticketTailor*` tables and depend on provider fields directly. |
| 3 | Legacy provider fallbacks are isolated enough that the new contract is unambiguous | ✗ FAILED | Public payment/reconciliation helpers still use mixed-key fallback logic. |

**Score:** 1/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `convex/orders.ts` | Canonical order mutation/query behavior | ✓ VERIFIED | `getOrderWithAttendees` and `buildCanonicalOrderStatusPatch` exist and are substantive. |
| `convex/sync/orders.ts` | Sync-driven status propagation | ✓ VERIFIED | Canonical order/extension upsert logic is present. |
| `lib/domain/finance/payments.ts` | Canonical order-id resolution for payment writes | △ PARTIAL | Canonical resolution exists, but provider-id fallback remains. |
| `app/api/payments/route.ts` | Payment enrichment/read surface | △ PARTIAL | Still resolves provider ids first, then canonical ids. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `lib/domain/finance/payments.ts` | `convex/orders.ts` | canonical order lookup | △ PARTIAL | Canonical lookup works, but provider-first fallback remains. |
| `app/api/payments/route.ts` | `convex/orders.ts` | payment enrichment | △ PARTIAL | Uses provider-order lookup before canonical lookup. |
| `lib/domain/finance/reconciliation.ts` | `convex/payments.ts` / payment joins | reconciliation keying | ✗ FAILED | Mixed `providerOrderId ?? orderId` keying keeps legacy semantics in the runtime path. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
| --- | --- | --- |
| RTM-02 | ✗ BLOCKED | Runtime join helpers still rely on mixed provider/internal identifier semantics. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `lib/domain/finance/reconciliation.ts` | 161-177 | Mixed identifier fallback | Warning | Keeps legacy provider-id semantics in a runtime join path. |
| `lib/domain/finance/matched-payments.ts` | 52-69 | Legacy lookup cache | Warning | Canonical order ids are still translated back to provider ids for reconciliation. |
| `app/api/payments/route.ts` | 88-115 | Provider-first resolution | Warning | Public payment enrichment still prefers provider ids over canonical ids. |

### Gaps Summary

The phase has the canonical write pieces in place, but the runtime contract is not yet cleanly isolated: several finance/read paths still mix provider and internal ids, and provider-derived tables remain directly reachable from runtime-facing helpers.

---

_Verified: 2026-04-21T16:27:45Z_
_Verifier: Claude (gsd-verifier)_
