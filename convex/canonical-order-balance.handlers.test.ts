/// <reference types="vite/client" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import {
  loadCanonicalOrderBalances,
  loadOrderAmountDueBreakdowns,
  loadOrderPaymentAttributions,
} from "./finance"
import { deriveBalanceAmounts } from "../lib/domain/finance/amounts"

/**
 * Cross-surface agreement tracer for Phase 56 plan 03.
 *
 * The phase's success criterion 1 is about AGREEMENT, not just correctness:
 * the order ledger (`orders.getOrdersWithFilters`), the reconciliation rows
 * (`orders.getOrdersForReconciliation`), the status counts
 * (`orders.getOrderPaymentStatus`) and the order payment summary
 * (`payments.getPaymentSummary`) must all report the SAME canonical balance for
 * the same order. This suite reads every one of those surfaces in the same run
 * as the direct `loadCanonicalOrderBalances` result, so a divergence is a hard
 * failure and never a coincidence.
 *
 * The fixture pairs an allocated order with the two classes most likely to
 * shift if the composition is wrong:
 *   - the allocation-free backward-compatibility control (D-10), and
 *   - the zero-attributable-charge class (order Q): every due weight is 0 and
 *     the order's paid figure must still be the applied payment total, never a
 *     per-attendee-Σ shortcut that reports 0.
 *
 * The allocation is executed through the production `donations.allocateDonation`
 * mutation, never a hand-written `donationAllocations` row, so the read is
 * proven against real writes.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:canonical-order-balance",
  name: "Admin",
  email: "admin@example.com",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

type FinanceLoaderCtx = Parameters<typeof loadOrderAmountDueBreakdowns>[0]

type AllocationScope = "event_charges" | "whole_order"

type ManualRowInput = {
  attendeeId: Id<"orderAttendees">
  amountMinor: number
  scope: AllocationScope
}

type CanonicalSnapshot = {
  amountDueMinor: number
  appliedPaymentMinor: number
  allocationCreditMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  donationAmountMinor: number
  appliedAmountMinor: number
}

type AttendeeSnapshot = {
  attendeeId: string
  amountDueMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  targetedCreditMinor: number
  poolShareMinor: number
}

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]) {
  return { method: "manual" as const, rows }
}

// ---------------------------------------------------------------------------
// Direct reads through the canonical owner
// ---------------------------------------------------------------------------

async function readCanonicalBalances(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, CanonicalSnapshot>> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = orderIds.map((_id) => ({ _id }))
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const balances = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
    })

    const snapshots: Record<string, CanonicalSnapshot> = {}
    for (const [orderKey, balance] of balances) {
      snapshots[orderKey] = {
        amountDueMinor: balance.amountDueMinor,
        appliedPaymentMinor: balance.appliedPaymentMinor,
        allocationCreditMinor: balance.allocationCreditMinor,
        paidAmountMinor: balance.paidAmountMinor,
        outstandingAmountMinor: balance.outstandingAmountMinor,
        donationAmountMinor: balance.donationAmountMinor,
        appliedAmountMinor: balance.appliedAmountMinor,
      }
    }
    return snapshots
  })
}

async function readAttendeeSnapshots(
  t: TestConvex,
  orderId: Id<"orders">
): Promise<Record<string, AttendeeSnapshot>> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = [{ _id: orderId }]
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const attribution = (
      await loadOrderPaymentAttributions({
        ctx: loaderCtx,
        orders,
        dueBreakdownsByOrderId,
      })
    ).get(String(orderId))

    const rows: Record<string, AttendeeSnapshot> = {}
    if (!attribution) {
      return rows
    }
    for (const [attendeeKey, row] of attribution.byAttendeeId) {
      rows[attendeeKey] = {
        attendeeId: row.attendeeId,
        amountDueMinor: row.amountDueMinor,
        paidAmountMinor: row.paidAmountMinor,
        outstandingAmountMinor: row.outstandingAmountMinor,
        targetedCreditMinor: row.targetedCreditMinor,
        poolShareMinor: row.poolShareMinor,
      }
    }
    return rows
  })
}

// ---------------------------------------------------------------------------
// Seeding helpers (file-local and minimal, mirroring the Phase 55/56 handler
// suites). The donation is always created through the production mutation.
// ---------------------------------------------------------------------------

async function seedEvent(t: TestConvex, slug: string): Promise<Id<"events">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug,
      title: slug,
      startsAt: BASE_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_AT,
    })
  )
}

async function createAttendee(
  t: TestConvex,
  eventId: Id<"events">,
  input: {
    orderId?: Id<"orders">
    attendeeKey: string
    name: string
    ticketPriceMinor: number
    bookingRef?: string
    sortOrder?: number
  }
): Promise<{ orderId: Id<"orders">; attendeeId: Id<"orderAttendees"> }> {
  const orderId =
    input.orderId ??
    (await t.mutation(async (ctx) =>
      ctx.db.insert("orders", {
        eventId,
        source: "internal" as const,
        bookingRef: input.bookingRef ?? `BK-${input.attendeeKey.toUpperCase()}`,
        bookerName: "Booker",
        bookerEmail: "booker@example.com",
        submittedAt: BASE_AT,
      })
    ))

  const ticketTypeId = await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId,
      label: `Ticket ${input.attendeeKey}`,
      priceMinor: input.ticketPriceMinor,
      isActive: true,
      visibility: "public" as const,
      availabilityState: "selectable" as const,
      accommodationIncluded: false,
      updatedAt: BASE_AT,
    })
  )

  const attendeeId = await t.mutation(async (ctx) =>
    ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: input.attendeeKey,
      name: input.name,
      gender: "unknown" as const,
      sortOrder: input.sortOrder ?? 0,
    })
  )

  await t.mutation(async (ctx) =>
    ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId,
      quantity: 1,
      sortOrder: 0,
    })
  )

  return { orderId, attendeeId }
}

/**
 * The core order plus its provider extension. `getOrderPaymentStatus` reads
 * only orders that carry a `ticketTailorOrders` extension row, so the status
 * case needs one per seeded order; the extension carries no status flags that
 * could alter a balance.
 */
async function attachOrderExtension(
  t: TestConvex,
  orderId: Id<"orders">,
  providerOrderId: string
): Promise<void> {
  await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTailorOrders", {
      providerOrderId,
      providerEventId: "provider-event-canonical",
      orderId,
      rawPayload: {},
    })
  )
}

/** An order-assigned payment that `isOrderAppliedPayment` counts. */
async function createAppliedPayment(
  t: TestConvex,
  eventId: Id<"events">,
  orderId: Id<"orders">,
  amountMinor: number
): Promise<Id<"payments">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      orderId: String(orderId),
      payerName: "Payer",
      amountMinor,
      paidAt: BASE_AT,
      status: "auto_matched" as const,
    })
  )
}

async function createStandaloneDonation(
  client: TestConvex,
  input: { eventId: Id<"events">; amountMinor: number }
): Promise<Id<"payments">> {
  return client.mutation(api.payments.createStandaloneDonation, {
    eventId: input.eventId,
    payerName: "Donor",
    amountMinor: input.amountMinor,
    paidAt: BASE_AT,
    source: "cash",
  })
}

// ---------------------------------------------------------------------------
// Cases 1-4: the four order-level surfaces agree on the canonical balance
// ---------------------------------------------------------------------------

test("the order ledger, reconciliation, status counts and payment summary all agree on the canonical order balance", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "canonical-balance-agreement")

  // Order L: due 20000 (A 12000, B 8000), a 10000 REAL applied payment, then a
  // 10000 whole_order allocation naming B through the production mutation.
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "l-a",
    name: "L Attendee A",
    ticketPriceMinor: 12_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "l-b",
    name: "L Attendee B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a.orderId, 10_000)

  // Order N: same shape and NO allocation — the backward-compatibility control.
  const n = await createAttendee(seeded, eventId, {
    attendeeKey: "n-a",
    name: "N Attendee A",
    ticketPriceMinor: 12_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: n.orderId,
    attendeeKey: "n-b",
    name: "N Attendee B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, n.orderId, 10_000)

  // Order P: due 10000, no payments, no allocations.
  const p = await createAttendee(seeded, eventId, {
    attendeeKey: "p-a",
    name: "P Attendee",
    ticketPriceMinor: 10_000,
  })

  // Order Q: the zero-attributable-charge control. One attendee on a zero-price
  // ticket (so every due weight is 0) plus a 15000 real applied payment.
  const q = await createAttendee(seeded, eventId, {
    attendeeKey: "q-a",
    name: "Q Attendee",
    ticketPriceMinor: 0,
  })
  await createAppliedPayment(seeded, eventId, q.orderId, 15_000)

  // Overpaid control: due 10000, a 15000 applied payment, no allocations. Its
  // overpayment class must come from `deriveBalanceAmounts`, never inflate.
  const overpaid = await createAttendee(seeded, eventId, {
    attendeeKey: "o-a",
    name: "Overpaid Attendee",
    ticketPriceMinor: 10_000,
  })
  await createAppliedPayment(seeded, eventId, overpaid.orderId, 15_000)

  await attachOrderExtension(seeded, a.orderId, "provider-canonical-l")
  await attachOrderExtension(seeded, n.orderId, "provider-canonical-n")
  await attachOrderExtension(seeded, p.orderId, "provider-canonical-p")
  await attachOrderExtension(seeded, q.orderId, "provider-canonical-q")
  await attachOrderExtension(
    seeded,
    overpaid.orderId,
    "provider-canonical-overpaid"
  )

  // --- Case 3 pre-state: L is partial before the allocation -----------------
  const statusBefore = await authed.query(api.orders.getOrderPaymentStatus, {})

  const donationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 10_000,
  })
  const tracerResult = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: b.attendeeId, amountMinor: 10_000, scope: "whole_order" },
    ]),
    idempotencyKey: "canonical-balance-l",
  })
  expect(tracerResult).toMatchObject({
    donationId,
    allocatedTotalMinor: 10_000,
    remainingMinor: 0,
  })

  // --- Case 3: the status buckets key off the canonical paid ---------------
  // The query is global (no event scope), so the assertion is the counts delta
  // around the allocation: L moves from partial to paid, and no other bucket
  // moves. The absolute delta on the paid total is exactly the allocated 10000.
  const statusAfter = await authed.query(api.orders.getOrderPaymentStatus, {})
  expect(statusAfter.summary.paid - statusBefore.summary.paid).toBe(1)
  expect(statusAfter.summary.partial - statusBefore.summary.partial).toBe(-1)
  expect(statusAfter.summary.unassigned - statusBefore.summary.unassigned).toBe(0)
  expect(statusAfter.summary.overpaid - statusBefore.summary.overpaid).toBe(0)
  expect(
    statusAfter.totalAmountMinor - statusBefore.totalAmountMinor
  ).toBe(10_000)

  // --- Case 1: the ledger row and the reconciliation row -------------------
  const reconciliation = await authed.query(
    api.orders.getOrdersForReconciliation,
    { eventId, from: 0, to: Date.now() }
  )
  const rowL = reconciliation.find((row) => row.orderId === a.orderId)
  expect(rowL).toMatchObject({
    amountDueMinor: 20_000,
    matchedAmountMinor: 20_000,
    outstandingAmountMinor: 0,
    appliedAmountMinor: 20_000,
    donationAmountMinor: 0,
  })
  const rowN = reconciliation.find((row) => row.orderId === n.orderId)
  expect(rowN).toMatchObject({
    amountDueMinor: 20_000,
    matchedAmountMinor: 10_000,
    outstandingAmountMinor: 10_000,
  })
  const rowP = reconciliation.find((row) => row.orderId === p.orderId)
  expect(rowP).toMatchObject({
    amountDueMinor: 10_000,
    matchedAmountMinor: 0,
    outstandingAmountMinor: 10_000,
  })

  const ledger = await authed.query(api.orders.getOrdersWithFilters, {
    eventId,
    page: 1,
    pageSize: 100,
  })
  const ledgerRowL = ledger.orders.find((row) => row.orderId === a.orderId)
  expect(ledgerRowL).toMatchObject({
    amountDueMinor: 20_000,
    matchedAmountMinor: 20_000,
    outstandingAmountMinor: 0,
  })
  const ledgerRowN = ledger.orders.find((row) => row.orderId === n.orderId)
  expect(ledgerRowN).toMatchObject({
    amountDueMinor: 20_000,
    matchedAmountMinor: 10_000,
    outstandingAmountMinor: 10_000,
  })

  // --- Case 2: the order-detail payment summary ----------------------------
  const summaryL = await authed.query(api.payments.getPaymentSummary, {
    orderId: String(a.orderId),
  })
  expect(summaryL).toMatchObject({
    totalPaid: 20_000,
    orderTotal: 20_000,
    remaining: 0,
    paymentCount: 1,
  })
  const summaryN = await authed.query(api.payments.getPaymentSummary, {
    orderId: String(n.orderId),
  })
  expect(summaryN).toMatchObject({
    totalPaid: 10_000,
    orderTotal: 20_000,
    remaining: 10_000,
    paymentCount: 1,
  })

  // --- Case 1 (same run): every surface equals the direct owner result -----
  const snapshots = await readCanonicalBalances(seeded, [
    a.orderId,
    n.orderId,
    p.orderId,
    q.orderId,
    overpaid.orderId,
  ])
  const canonicalL = snapshots[String(a.orderId)]
  const canonicalN = snapshots[String(n.orderId)]
  const canonicalP = snapshots[String(p.orderId)]
  const canonicalQ = snapshots[String(q.orderId)]
  const canonicalOverpaid = snapshots[String(overpaid.orderId)]
  expect(canonicalL).toBeDefined()
  expect(canonicalN).toBeDefined()
  expect(canonicalP).toBeDefined()
  expect(canonicalQ).toBeDefined()
  expect(canonicalOverpaid).toBeDefined()

  expect(canonicalL).toMatchObject({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 10_000,
    allocationCreditMinor: 10_000,
    paidAmountMinor: 20_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 20_000,
  })

  // Field-for-field equality between the direct owner and each surface, read in
  // the same run — a divergence is a hard failure here.
  expect(ledgerRowL?.amountDueMinor).toBe(canonicalL.amountDueMinor)
  expect(ledgerRowL?.matchedAmountMinor).toBe(canonicalL.paidAmountMinor)
  expect(ledgerRowL?.outstandingAmountMinor).toBe(
    canonicalL.outstandingAmountMinor
  )
  expect(rowL?.amountDueMinor).toBe(canonicalL.amountDueMinor)
  expect(rowL?.matchedAmountMinor).toBe(canonicalL.paidAmountMinor)
  expect(rowL?.appliedAmountMinor).toBe(canonicalL.appliedAmountMinor)
  expect(rowL?.donationAmountMinor).toBe(canonicalL.donationAmountMinor)
  expect(rowL?.outstandingAmountMinor).toBe(canonicalL.outstandingAmountMinor)
  expect(summaryL.totalPaid).toBe(canonicalL.paidAmountMinor)
  expect(summaryL.orderTotal).toBe(canonicalL.amountDueMinor)
  expect(summaryL.remaining).toBe(canonicalL.outstandingAmountMinor)

  expect(ledgerRowN?.matchedAmountMinor).toBe(canonicalN.paidAmountMinor)
  expect(rowN?.matchedAmountMinor).toBe(canonicalN.paidAmountMinor)
  expect(rowN?.outstandingAmountMinor).toBe(canonicalN.outstandingAmountMinor)
  expect(summaryN.totalPaid).toBe(canonicalN.paidAmountMinor)
  expect(summaryN.remaining).toBe(canonicalN.outstandingAmountMinor)

  // --- Case 4: the overpayment figure is never inflated by allocation credit
  // Order L is fully cleared by the allocation yet reports no overpayment: the
  // Phase 55 capacity bound keeps credit inside the outstanding.
  expect(canonicalL.donationAmountMinor).toBe(0)
  // The overpaid control (due 10000 / paid 15000, no allocations) keeps its
  // `deriveBalanceAmounts` overpayment class of exactly 5000.
  expect(canonicalOverpaid).toMatchObject({
    amountDueMinor: 10_000,
    paidAmountMinor: 15_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 5_000,
    appliedAmountMinor: 10_000,
  })
  expect(rowN?.donationAmountMinor).toBe(0)
  const rowOverpaid = reconciliation.find(
    (row) => row.orderId === overpaid.orderId
  )
  expect(rowOverpaid?.donationAmountMinor).toBe(5_000)

  // The ledger totals accumulate the CAPPED canonical applied figure: the
  // overpaid control contributes 10000 here (never the uncapped 15000), and
  // order Q contributes 0 because its applied class is capped at a zero due.
  const expectedAppliedSum = Object.values(snapshots).reduce(
    (sum, snapshot) => sum + snapshot.appliedAmountMinor,
    0
  )
  expect(ledger.totals.matchedAmountMinor).toBe(expectedAppliedSum)
  expect(ledger.totals.matchedAmountMinor).toBe(
    20_000 + 10_000 + 0 + 0 + 10_000
  )
  expect(ledger.totals.amountDueMinor).toBe(
    20_000 + 20_000 + 10_000 + 0 + 10_000
  )
  expect(ledger.totals.outstandingAmountMinor).toBe(
    0 + 10_000 + 10_000 + 0 + 0
  )

  // --- Case 1 per-attendee: the whole_order credit is distributed, never
  // blanket-attributed to the named attendee. A targeted-first regression
  // would cap B at B's remaining need and strand credit, so A could never
  // reach the full 12000.
  const attendeesL = await readAttendeeSnapshots(seeded, a.orderId)
  expect(attendeesL[String(a.attendeeId)]).toMatchObject({
    amountDueMinor: 12_000,
    paidAmountMinor: 12_000,
    outstandingAmountMinor: 0,
  })
  expect(attendeesL[String(b.attendeeId)]).toMatchObject({
    amountDueMinor: 8_000,
    paidAmountMinor: 8_000,
    outstandingAmountMinor: 0,
  })
  const attendeeOutstandingSum = Object.values(attendeesL).reduce(
    (sum, row) => sum + row.outstandingAmountMinor,
    0
  )
  expect(attendeeOutstandingSum).toBe(canonicalL.outstandingAmountMinor)
})

// ---------------------------------------------------------------------------
// Case 5: backward compatibility (D-10) and the zero-attributable-charge class
// ---------------------------------------------------------------------------

test("allocation-free orders keep the exact pre-Phase-56 composition, including the zero-attributable-charge class", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "canonical-balance-baseline")

  // Order N: due 20000, 10000 applied, no allocations.
  const n = await createAttendee(seeded, eventId, {
    attendeeKey: "base-a",
    name: "Baseline A",
    ticketPriceMinor: 12_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: n.orderId,
    attendeeKey: "base-b",
    name: "Baseline B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, n.orderId, 10_000)

  // Order P: due 10000, no payments, no allocations.
  const p = await createAttendee(seeded, eventId, {
    attendeeKey: "unpaid-a",
    name: "Unpaid",
    ticketPriceMinor: 10_000,
  })

  // Order Q: zero attributable charges (zero-price ticket) + 15000 applied.
  const q = await createAttendee(seeded, eventId, {
    attendeeKey: "zero-a",
    name: "Zero Charge",
    ticketPriceMinor: 0,
  })
  await createAppliedPayment(seeded, eventId, q.orderId, 15_000)

  const snapshots = await readCanonicalBalances(seeded, [
    n.orderId,
    p.orderId,
    q.orderId,
  ])
  const canonicalN = snapshots[String(n.orderId)]
  const canonicalP = snapshots[String(p.orderId)]
  const canonicalQ = snapshots[String(q.orderId)]

  // The legacy composition, computed in-test from the same payment-only inputs:
  // with zero allocation rows the canonical balance IS `deriveBalanceAmounts`
  // over the canonical due and the `isOrderAppliedPayment` total. If the owner
  // ever added or removed a term for allocation-free orders, this equality
  // fails by naming the number that moved.
  const legacyN = deriveBalanceAmounts(
    canonicalN.amountDueMinor,
    canonicalN.appliedPaymentMinor
  )
  expect(canonicalN).toMatchObject({
    amountDueMinor: legacyN.amountDueMinor,
    appliedPaymentMinor: 10_000,
    allocationCreditMinor: 0,
    paidAmountMinor: legacyN.paidAmountMinor,
    outstandingAmountMinor: legacyN.outstandingAmountMinor,
    donationAmountMinor: legacyN.donationAmountMinor,
    appliedAmountMinor: legacyN.appliedAmountMinor,
  })
  expect(canonicalN).toMatchObject({
    amountDueMinor: 20_000,
    paidAmountMinor: 10_000,
    outstandingAmountMinor: 10_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 10_000,
  })

  const legacyP = deriveBalanceAmounts(
    canonicalP.amountDueMinor,
    canonicalP.appliedPaymentMinor
  )
  expect(canonicalP).toMatchObject({
    amountDueMinor: legacyP.amountDueMinor,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: legacyP.paidAmountMinor,
    outstandingAmountMinor: legacyP.outstandingAmountMinor,
    donationAmountMinor: legacyP.donationAmountMinor,
    appliedAmountMinor: legacyP.appliedAmountMinor,
  })
  expect(canonicalP).toMatchObject({
    amountDueMinor: 10_000,
    paidAmountMinor: 0,
    outstandingAmountMinor: 10_000,
  })

  // --- The zero-attributable-charge class (order Q) ------------------------
  // Every due weight is 0, but the order's paid figure must still be the real
  // applied payment total — a per-attendee-Σ derivation would report 0 and
  // shift all three surfaces below.
  expect(canonicalQ).toMatchObject({
    amountDueMinor: 0,
    appliedPaymentMinor: 15_000,
    allocationCreditMinor: 0,
    paidAmountMinor: 15_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 15_000,
    appliedAmountMinor: 0,
  })

  const reconciliation = await authed.query(
    api.orders.getOrdersForReconciliation,
    { eventId, from: 0, to: Date.now() }
  )
  const rowQ = reconciliation.find((row) => row.orderId === q.orderId)
  expect(rowQ).toMatchObject({
    amountDueMinor: 0,
    matchedAmountMinor: 15_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 15_000,
  })

  const summaryQ = await authed.query(api.payments.getPaymentSummary, {
    orderId: String(q.orderId),
  })
  expect(summaryQ).toMatchObject({
    totalPaid: 15_000,
    orderTotal: 0,
    remaining: 0,
    paymentCount: 1,
  })

  // The two controls also hold on the ledger rows (uncapped row total, capped
  // totals contribution) — asserted above in the agreement case; here the
  // direct owner is the oracle for the same fields.
  const ledger = await authed.query(api.orders.getOrdersWithFilters, {
    eventId,
    page: 1,
    pageSize: 100,
  })
  const ledgerRowN = ledger.orders.find((row) => row.orderId === n.orderId)
  const ledgerRowQ = ledger.orders.find((row) => row.orderId === q.orderId)
  expect(ledgerRowN?.matchedAmountMinor).toBe(canonicalN.paidAmountMinor)
  expect(ledgerRowN?.outstandingAmountMinor).toBe(
    canonicalN.outstandingAmountMinor
  )
  expect(ledgerRowQ?.matchedAmountMinor).toBe(canonicalQ.paidAmountMinor)
  expect(ledgerRowQ?.outstandingAmountMinor).toBe(
    canonicalQ.outstandingAmountMinor
  )
})

// ---------------------------------------------------------------------------
// Case 6: the owner's reads stay index-backed and bounded
// ---------------------------------------------------------------------------

function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(
    start,
    `export async function ${name} is missing from convex/finance.ts`
  ).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("\nexport ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

test("the canonical balance owner stays index-backed and bounded", () => {
  const source = readFileSync(resolve(import.meta.dirname, "finance.ts"), "utf8")

  // No unbounded scan anywhere in the finance loader module.
  expect(source).not.toContain(".collect(")

  // The credit read is index-backed, unbounded-iteration-only, no fixed cap.
  const creditSlice = functionSource(source, "loadRecordedAllocationsByOrderId")
  expect(creditSlice).toContain('query("donationAllocations")')
  expect(creditSlice).toContain('withIndex("by_orderId"')
  expect(creditSlice).toContain("for await")
  expect(creditSlice).not.toContain(".collect(")

  // The order-level owner composes the ONE attribution owner and the ONE
  // overpayment owner; it prices at most once and never rescans payments.
  const ownerSlice = functionSource(source, "loadCanonicalOrderBalances")
  expect(ownerSlice).toContain("loadOrderPaymentAttributions")
  expect(ownerSlice).toContain("deriveBalanceAmounts")
  expect(ownerSlice).not.toContain("loadMatchedPaymentTotalsByOrderId(")
  expect(ownerSlice).not.toContain(".collect(")
})

// ---------------------------------------------------------------------------
// Case 7: the settlement basis (Phase 60 D-01) — proven on the real WRITE
// ---------------------------------------------------------------------------

test("a donation allocation clears the order and the real sync job flips its status to paid (settlement basis D-01)", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "canonical-settlement-basis")

  // Order A: due 20000 (A1 12000 / A2 8000), NO payments. It is cleared SOLELY
  // by a whole_order allocation, so the payment-only basis cannot settle it.
  const a1 = await createAttendee(seeded, eventId, {
    attendeeKey: "a-a1",
    name: "A One",
    ticketPriceMinor: 12_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: a1.orderId,
    attendeeKey: "a-a2",
    name: "A Two",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })

  // Control P (allocation-free, fully paid): due 4000 with a real applied
  // payment. It must keep settling exactly as it did before the migration.
  const p = await createAttendee(seeded, eventId, {
    attendeeKey: "p-a",
    name: "P One",
    ticketPriceMinor: 4_000,
  })
  await createAppliedPayment(seeded, eventId, p.orderId, 4_000)

  // Control Q (allocation-free, unpaid): due 5000, no payment.
  const q = await createAttendee(seeded, eventId, {
    attendeeKey: "q-a",
    name: "Q One",
    ticketPriceMinor: 5_000,
  })

  // Control R (partially allocated): due 5000 with a 3000 whole_order
  // allocation. Partial credit must NOT settle the order.
  const r = await createAttendee(seeded, eventId, {
    attendeeKey: "r-a",
    name: "R One",
    ticketPriceMinor: 5_000,
  })

  // Both allocations run through the production mutation, never a hand-written
  // donationAllocations row.
  const donationA = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 20_000,
  })
  const allocationA = await authed.mutation(api.donations.allocateDonation, {
    donationId: donationA,
    eventId,
    request: manualRequest([
      { attendeeId: a1.attendeeId, amountMinor: 20_000, scope: "whole_order" },
    ]),
    idempotencyKey: "canonical-settlement-a",
  })
  expect(allocationA).toMatchObject({
    donationId: donationA,
    allocatedTotalMinor: 20_000,
    remainingMinor: 0,
  })

  const donationR = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 3_000,
  })
  const allocationR = await authed.mutation(api.donations.allocateDonation, {
    donationId: donationR,
    eventId,
    request: manualRequest([
      { attendeeId: r.attendeeId, amountMinor: 3_000, scope: "whole_order" },
    ]),
    idempotencyKey: "canonical-settlement-r",
  })
  expect(allocationR).toMatchObject({
    donationId: donationR,
    allocatedTotalMinor: 3_000,
    remainingMinor: 0,
  })

  // The clearing is attributable to the allocation: A carries allocation credit
  // and ZERO applied payment. R carries partial credit with a real outstanding.
  const snapshots = await readCanonicalBalances(seeded, [
    a1.orderId,
    p.orderId,
    q.orderId,
    r.orderId,
  ])
  expect(snapshots[String(a1.orderId)]).toMatchObject({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 20_000,
    paidAmountMinor: 20_000,
    outstandingAmountMinor: 0,
  })
  expect(snapshots[String(p.orderId)]).toMatchObject({
    amountDueMinor: 4_000,
    appliedPaymentMinor: 4_000,
    allocationCreditMinor: 0,
    paidAmountMinor: 4_000,
    outstandingAmountMinor: 0,
  })
  expect(snapshots[String(q.orderId)]).toMatchObject({
    amountDueMinor: 5_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 5_000,
  })
  expect(snapshots[String(r.orderId)]).toMatchObject({
    amountDueMinor: 5_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 3_000,
    paidAmountMinor: 3_000,
    outstandingAmountMinor: 2_000,
  })

  // Capture the ACTUAL stored status per order before the job runs (the order
  // seeds leave it undefined) so the controls compare against repo truth rather
  // than an assumed pre-state.
  const orderIds = [a1.orderId, p.orderId, q.orderId, r.orderId] as const
  const readStatuses = () =>
    seeded.run(async (ctx) => {
      const statuses: Record<string, string | undefined> = {}
      for (const orderId of orderIds) {
        const order = await ctx.db.get("orders", orderId)
        statuses[String(orderId)] = order?.status
      }
      return statuses
    })
  const statusBefore = await readStatuses()

  // None of the four orders starts settled — the sync job is what writes it.
  for (const orderId of orderIds) {
    expect(statusBefore[String(orderId)]).not.toBe("paid")
  }

  const report = await seeded.mutation(internal.orders.syncFullyPaidOrders, {})
  const statusAfter = await readStatuses()

  // THE new behaviour: the allocation alone cleared order A, so the real job
  // flips its stored status to paid.
  expect(statusAfter[String(a1.orderId)]).toBe("paid")

  // Backward compatibility (Phase 56 D-10): the allocation-free fully-paid
  // order still settles exactly as before the migration.
  expect(statusAfter[String(p.orderId)]).toBe("paid")

  // The unpaid and partially-allocated controls are identical to their
  // pre-sync status — partial credit does not settle.
  expect(statusAfter[String(q.orderId)]).toBe(statusBefore[String(q.orderId)])
  expect(statusAfter[String(r.orderId)]).toBe(statusBefore[String(r.orderId)])
  expect(statusAfter[String(q.orderId)]).not.toBe("paid")
  expect(statusAfter[String(r.orderId)]).not.toBe("paid")

  // The report counts exactly the settled set (A + P) across the four active
  // orders.
  expect(report).toEqual({ scanned: 4, updated: 2 })
})
