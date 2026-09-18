import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * D-07's reconciliation guard (Phase 61, plan 61-09).
 *
 * The defect this pins: `order-detail-surface.tsx` derived its paid figure by
 * reducing the payments list (`payments.filter(isOrderAppliedPayment).reduce(…)`),
 * excluding donation allocation credit entirely — so an allocated order showed
 * wrong paid / outstanding / coverage, contradicting the surface's own
 * "verbatim" comment. Three properties are load-bearing:
 *
 *  1. SERVER-OWNED PAID. Every figure is a field of
 *     `api.orders.getOrderAllocationLedger` → `loadCanonicalOrderBalances`
 *     (`balances?.paidAmountMinor`, `outstandingAmountMinor`, etc.) and the
 *     surface performs NO money arithmetic — no payments reduce, no local
 *     balance derivation, no operator adjacent to a `*Minor` identifier.
 *  2. ROWS IN THE LIST. The recorded allocation rows render as their own
 *     labelled entries (`Donation allocation` + amount + target attendee +
 *     scope + recorded time) INSIDE the order's transaction list, through the
 *     panel's distinct `OrderAllocationRow` type — so the itemised list
 *     accounts for the canonical paid figure (payments + allocations). The
 *     live check in 61-09-SUMMARY asserts the rendered amounts equal the
 *     donation's recorded rows AND that payments + allocations equal the
 *     canonical Paid.
 *  3. NEVER A PAYMENT. The payments and allocations render through two
 *     separate maps; an allocation carries no status, no source and no unlink
 *     affordance, and no donation's payments row is assigned to the order to
 *     make the list balance (`assignPaymentToOrder` is absent).
 *
 * LEGACY REGISTER (D-07 bullet 6): `legacy-reconciliation-surface.tsx` is the
 * other component referencing `isOrderAppliedPayment` — a DISPLAY filter in
 * `AssignedPaymentsList` only; it derives no paid total (its only reduce is
 * `visibleOrders.reduce(…)` over orders — legacy reconciliation math, outside
 * this phase). It is registered here, deliberately NOT fixed.
 *
 * Presence pins read the COMMENT-STRIPPED source (the milestone's recorded
 * failure mode: a doc comment satisfied a raw scan while the wiring was dead);
 * absence pins read the raw bytes, where a comment can only fail louder.
 */

const ROOT = resolve(import.meta.dirname, "../..")

const SURFACE_PATH = "components/dashboard/orders/order-detail-surface.tsx"
const PANEL_PATH = "components/dashboard/orders/panels/payments-panel.tsx"
const LEGACY_RECONCILIATION_PATH =
  "components/dashboard/finance/legacy-reconciliation-surface.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*$/gm, "")
}

// Read every pinned file up front: a rename is an ENOENT failure here, never a
// silently skipped assertion.
const surface = readSource(SURFACE_PATH)
const panel = readSource(PANEL_PATH)
const legacyReconciliation = readSource(LEGACY_RECONCILIATION_PATH)

const surfaceCode = stripComments(surface)
const panelCode = stripComments(panel)
const legacyCode = stripComments(legacyReconciliation)

/** The slice from `start` through the first `end` after it. */
function sliceFrom(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  expect(startIndex, `expected to find ${start}`).toBeGreaterThan(-1)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(endIndex, `expected to find ${end} after ${start}`).toBeGreaterThan(-1)
  return source.slice(startIndex, endIndex + end.length)
}

describe("server-owned paid (D-07)", () => {
  it("reads the canonical ledger and renders its balance fields", () => {
    expect(surfaceCode).toContain("getOrderAllocationLedger")
    expect(surfaceCode).toContain("ledger?.balances")
    expect(surfaceCode).toContain("balances?.paidAmountMinor")
    expect(surfaceCode).toContain("balances?.outstandingAmountMinor")
    expect(surfaceCode).toContain("balances?.donationAmountMinor")
    expect(surfaceCode).toContain("ledger?.coveragePercent")
    expect(surfaceCode).toContain("ledger?.sharedOutstandingPerAttendeeMinor")
  })

  it("scopes the read to this order and event", () => {
    const ledgerCall = sliceFrom(
      surfaceCode,
      "api.orders.getOrderAllocationLedger",
      "skip"
    )
    expect(ledgerCall).toContain('orderId: orderId as Id<"orders">')
    expect(ledgerCall).toContain("eventId: event._id")
  })

  it("no longer derives a paid figure from the payments list", () => {
    for (const forbidden of [
      "isOrderAppliedPayment",
      "matchedPayments",
      ".reduce(",
      "Math.",
      ".toFixed(",
      "deriveBalanceAmounts",
      "assignPaymentToOrder",
    ] as const) {
      expect(
        surface,
        `${SURFACE_PATH} must not contain ${forbidden} — the paid figure is the server owner's`
      ).not.toContain(forbidden)
    }
    // A `*Minor` identifier adjacent to an arithmetic operator — the exact
    // client money formula this plan removed.
    expect(surface).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(surface).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
  })
})

describe("the allocation rows render in the order's transaction list (D-07)", () => {
  it("passes the ledger rows to the panel beside the payments", () => {
    expect(surfaceCode).toContain("allocations={allocationRows}")
    expect(panelCode).toContain("allocations: OrderAllocationRow[]")
  })

  it("builds the rows from the ledger, resolving the attendee name from the payload", () => {
    const rowsDerivation = sliceFrom(
      surfaceCode,
      "const allocationRows",
      "[ledger, orderPayload]"
    )
    expect(rowsDerivation).toContain("ledger?.allocationRows")
    expect(rowsDerivation).toContain("orderPayload?.attendees")
    expect(rowsDerivation).toContain("String(row.attendeeId)")
  })

  it("declares a distinct allocation row type with no payment markers", () => {
    const typeBlock = sliceFrom(
      panelCode,
      "export type OrderAllocationRow",
      "}"
    )
    for (const field of [
      "donationId",
      "amountMinor",
      "scope",
      "recordedAt",
    ] as const) {
      expect(typeBlock, `OrderAllocationRow must carry ${field}`).toContain(
        field
      )
    }
    expect(
      typeBlock,
      "an allocation row is not a payment: no status marker"
    ).not.toContain("status")
    expect(
      typeBlock,
      "an allocation row is not a payment: no source marker"
    ).not.toContain("source")
  })

  it("renders each allocation as its own labelled row", () => {
    const allocationBlock = sliceFrom(panelCode, "allocations.map(", "))}")
    for (const literal of [
      "Donation allocation",
      "formatMoney(allocation.amountMinor)",
      "scopeLabel(allocation.scope)",
      "formatDateTime(allocation.recordedAt)",
      "allocation.attendeeName",
    ] as const) {
      expect(
        allocationBlock,
        `the allocation row must render ${literal}`
      ).toContain(literal)
    }
  })

  it("keeps the empty state from hiding allocation-only lists", () => {
    expect(panelCode).toContain(
      "payments.length === 0 && allocations.length === 0"
    )
    expect(panelCode).toContain("No payments")
  })
})

describe("a donation allocation is never presented as a payment (D-07)", () => {
  it("renders through two separate maps, never a merged array", () => {
    expect(panelCode).toContain("payments.map(")
    expect(panelCode).toContain("allocations.map(")
    for (const merged of [
      "[...payments, ...allocations]",
      "[...payments,",
      "...allocations]",
    ] as const) {
      expect(
        panel,
        `the payment and allocation lists must never be merged (${merged})`
      ).not.toContain(merged)
    }
  })

  it("keeps the unlink affordance on the payments path only", () => {
    for (const forbidden of [
      "onUnassign(allocation",
      "paymentStatusLabel(allocation",
      "paymentSourceLabel(allocation",
    ] as const) {
      expect(
        panel,
        `${forbidden} must not exist — an allocation row has no payment affordance`
      ).not.toContain(forbidden)
    }
    const unassignCalls = [...panelCode.matchAll(/onUnassign\(/g)]
    expect(
      unassignCalls.length,
      "onUnassign( exists exactly once — the payments path"
    ).toBe(1)
    const paymentsBlock = sliceFrom(panelCode, "payments.map(", "))}")
    expect(paymentsBlock).toContain("onUnassign(")
  })

  it("never assigns a donation's payments row to the order", () => {
    expect(surface).not.toContain("assignPaymentToOrder")
    expect(panel).not.toContain("assignPaymentToOrder")
  })
})

describe("the legacy display filter is registered, not silently left (D-07 bullet 6)", () => {
  it("is a display filter over payments, never a paid total", () => {
    // The determination: `AssignedPaymentsList` filters the payments list for
    // display with `isOrderAppliedPayment`; no paid figure is derived from it.
    // Registered here, not fixed — legacy reconciliation math is outside this
    // phase's scope.
    expect(legacyCode).toContain("(payments ?? []).filter(")
    expect(legacyCode).toContain("(p) => isOrderAppliedPayment(p)")

    const reduceReceivers = [
      ...legacyReconciliation.matchAll(/([A-Za-z]+)\.reduce\(/g),
    ].map((match) => match[1])
    expect(
      reduceReceivers,
      "the legacy reconciliation surface's only reduce is visibleOrders.reduce( — a payments-derived total here is a new owner"
    ).toEqual(["visibleOrders"])
    expect(
      legacyReconciliation,
      "legacy-reconciliation-surface.tsx must not grow a paidAmountMinor total — it is registered as a display filter only"
    ).not.toContain("paidAmountMinor")
  })
})
