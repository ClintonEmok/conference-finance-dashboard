/// <reference types="vite/client" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import {
  loadCanonicalOrderBalances,
  loadOrderAmountDueBreakdowns,
} from "./finance"

/**
 * Handler proof for Phase 61 plan 08: `orders.getOrderAllocationLedger` — the
 * additive per-order allocation + canonical balance read (D-07 / UI-SPEC G2).
 *
 * The suite proves the read against REAL allocation writes (always through
 * `api.donations.allocateDonation`, never a hand-written
 * `donationAllocations` row):
 *   (a) rows exact + canonical deep-equality + the list-sums-to-canonical
 *       identity + scalars pinned to the owner's figures,
 *   (b) the allocation-free control (D-10): no row fabricated, paid stays
 *       payment-only,
 *   (c) every refusal: event mismatch, unknown / removed / merged order,
 *       non-internal event, missing identity,
 *   (d) the bounded-read and no-second-pass source pins,
 *   (e) the scalars' edge (due 0) and the owner's omission rule.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:order-allocation-ledger",
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

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]) {
  return { method: "manual" as const, rows }
}

// ---------------------------------------------------------------------------
// Direct reads through the canonical owner (the oracle for pass-through)
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

// ---------------------------------------------------------------------------
// Seeding helpers (file-local, mirroring the Phase 55/56 handler suites). The
// donation is always created and allocated through the production mutations.
// ---------------------------------------------------------------------------

async function seedEvent(
  t: TestConvex,
  slug: string,
  primarySourceKind: "internal" | "integration" = "internal"
): Promise<Id<"events">> {
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
      primarySourceKind,
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

async function attachOrderExtension(
  t: TestConvex,
  orderId: Id<"orders">,
  providerOrderId: string,
  options?: { removedAt?: number }
): Promise<void> {
  await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTailorOrders", {
      providerOrderId,
      providerEventId: "provider-event-allocation-ledger",
      orderId,
      ...(options?.removedAt !== undefined
        ? { removedAt: options.removedAt }
        : {}),
      rawPayload: {},
    })
  )
}

// ---------------------------------------------------------------------------
// (a) The credit fixture: rows exact, canonical pass-through, list identity
// ---------------------------------------------------------------------------

test("returns the order's allocation rows beside the canonical balance and the list sums to it", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "ledger-credit")

  // Due 20000 over two attendees, a 10000 applied payment: attributable
  // outstanding is A1 6000 / A2 4000. The donation then allocates 6000
  // whole_order (into the order pool) + 4000 event_charges (targeted at A1).
  const a1 = await createAttendee(seeded, eventId, {
    attendeeKey: "credit-a1",
    name: "Credit One",
    ticketPriceMinor: 12_000,
  })
  const a2 = await createAttendee(seeded, eventId, {
    orderId: a1.orderId,
    attendeeKey: "credit-a2",
    name: "Credit Two",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a1.orderId, 10_000)

  const donationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 10_000,
  })
  const result = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: a2.attendeeId, amountMinor: 6_000, scope: "whole_order" },
      {
        attendeeId: a1.attendeeId,
        amountMinor: 4_000,
        scope: "event_charges",
      },
    ]),
    idempotencyKey: "order-allocation-ledger-credit",
  })
  expect(result).toMatchObject({
    donationId,
    allocatedTotalMinor: 10_000,
    remainingMinor: 0,
  })

  // Read the RECORDED rows back from the index — the oracle for the row shape,
  // including `recordedAt`, without assuming any creation/index order.
  const recordedRows = await seeded.run(async (ctx) => {
    const rows: Array<{
      donationId: Id<"payments">
      attendeeId: Id<"orderAttendees">
      amountMinor: number
      scope: AllocationScope
      recordedAt: number
    }> = []
    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_orderId", (q) => q.eq("orderId", a1.orderId))) {
      rows.push({
        donationId: row.donationId,
        attendeeId: row.attendeeId,
        amountMinor: row.amountMinor,
        scope: row.scope,
        recordedAt: row.createdAt,
      })
    }
    return rows
  })
  expect(recordedRows).toHaveLength(2)

  const ledger = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: a1.orderId,
    eventId,
  })
  if (ledger === null) {
    throw new Error("expected the allocation ledger read to return a row")
  }

  // The rows are the recorded amounts (4000 / 6000), NOT the per-attendee
  // applied figures (A1 12000 / A2 8000) — the list is the credit's origin.
  expect(ledger.allocationRows).toHaveLength(2)
  expect(ledger.allocationRows).toEqual(expect.arrayContaining(recordedRows))

  // Pass-through proof: the money fields equal the canonical owner's output,
  // read directly for the same order in the same test.
  const direct = await readCanonicalBalances(seeded, [a1.orderId])
  expect(ledger.balances).toEqual(direct[String(a1.orderId)])
  expect(ledger.balances).toMatchObject({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 10_000,
    allocationCreditMinor: 6_000,
    paidAmountMinor: 20_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 20_000,
  })

  // The identity the UI list depends on (uncapped fixture: credit below every
  // ceiling): the itemised rows account for exactly the credit inside the
  // canonical paid figure.
  const recordedTotal = ledger.allocationRows.reduce(
    (sum, row) => sum + row.amountMinor,
    0
  )
  expect(recordedTotal).toBe(10_000)
  expect(ledger.balances?.paidAmountMinor).toBe(
    (ledger.balances?.appliedPaymentMinor ?? 0) + recordedTotal
  )

  // Display scalars pinned to hand-computed values from the owner's figures.
  expect(ledger.coveragePercent).toBe(100)
  expect(ledger.sharedOutstandingPerAttendeeMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// (b) The allocation-free control (D-10)
// ---------------------------------------------------------------------------

test("an allocation-free order keeps the payment-only paid figure and fabricates no row", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "ledger-control")

  const a1 = await createAttendee(seeded, eventId, {
    attendeeKey: "control-a1",
    name: "Control One",
    ticketPriceMinor: 12_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: a1.orderId,
    attendeeKey: "control-a2",
    name: "Control Two",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a1.orderId, 10_000)

  const ledger = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: a1.orderId,
    eventId,
  })
  if (ledger === null) {
    throw new Error("expected the allocation ledger read to return a row")
  }

  expect(ledger.allocationRows).toEqual([])
  expect(ledger.balances).toMatchObject({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 10_000,
    allocationCreditMinor: 0,
    paidAmountMinor: 10_000,
    outstandingAmountMinor: 10_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 10_000,
  })
  expect(ledger.balances?.paidAmountMinor).toBe(
    ledger.balances?.appliedPaymentMinor
  )
  expect(ledger.coveragePercent).toBe(50)
  expect(ledger.sharedOutstandingPerAttendeeMinor).toBe(5_000)

  const direct = await readCanonicalBalances(seeded, [a1.orderId])
  expect(ledger.balances).toEqual(direct[String(a1.orderId)])
})

// ---------------------------------------------------------------------------
// (c) Refusals
// ---------------------------------------------------------------------------

test("refuses a mismatched event, an unknown order, and serves nothing anonymously", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "ledger-refusals")
  const otherEventId = await seedEvent(seeded, "ledger-refusals-other")

  const a1 = await createAttendee(seeded, eventId, {
    attendeeKey: "refusal-a1",
    name: "Refusal One",
    ticketPriceMinor: 12_000,
  })

  // The same order under a DIFFERENT event id is refused: the read serves only
  // the event the caller asked for, never an inferred scope.
  const mismatched = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: a1.orderId,
    eventId: otherEventId,
  })
  expect(mismatched).toBeNull()

  // An unknown order id is refused, not fabricated as a zero balance.
  const gone = await createAttendee(seeded, eventId, {
    attendeeKey: "refusal-gone",
    name: "Gone",
    ticketPriceMinor: 1_000,
  })
  await seeded.mutation(async (ctx) => {
    await ctx.db.delete("orders", gone.orderId)
  })
  const unknown = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: gone.orderId,
    eventId,
  })
  expect(unknown).toBeNull()

  // Missing identity is the house financial-read gate.
  await expect(
    seeded.query(api.orders.getOrderAllocationLedger, {
      orderId: a1.orderId,
      eventId,
    })
  ).rejects.toThrow("Unauthorized")
})

test("refuses a removed order, a merged order, and a non-internal event", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "ledger-visibility")

  // Removed via the provider extension marker (mirrors isOrderRemoved).
  const removed = await createAttendee(seeded, eventId, {
    attendeeKey: "refusal-removed",
    name: "Removed",
    ticketPriceMinor: 5_000,
  })
  await attachOrderExtension(seeded, removed.orderId, "provider-removed", {
    removedAt: BASE_AT + 1,
  })
  const removedRead = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: removed.orderId,
    eventId,
  })
  expect(removedRead).toBeNull()

  // Merged via the core marker (mirrors isOrderMergedCore).
  const mergeTarget = await createAttendee(seeded, eventId, {
    attendeeKey: "refusal-merge-target",
    name: "Merge Target",
    ticketPriceMinor: 5_000,
  })
  const mergedOrderId = await seeded.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "internal" as const,
      bookingRef: "BK-REFUSAL-MERGED",
      bookerName: "Merged",
      bookerEmail: "merged@example.com",
      mergedIntoOrderId: mergeTarget.orderId,
      submittedAt: BASE_AT,
    })
  )
  const mergedRead = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: mergedOrderId,
    eventId,
  })
  expect(mergedRead).toBeNull()

  // A non-internal (integration) event is refused even with a matching event
  // id — the dashboard serves internal events only.
  const integrationEventId = await seedEvent(
    seeded,
    "ledger-integration",
    "integration"
  )
  const integrationOrder = await createAttendee(seeded, integrationEventId, {
    attendeeKey: "refusal-integration",
    name: "Integration",
    ticketPriceMinor: 5_000,
  })
  const integrationRead = await authed.query(
    api.orders.getOrderAllocationLedger,
    { orderId: integrationOrder.orderId, eventId: integrationEventId }
  )
  expect(integrationRead).toBeNull()
})

// ---------------------------------------------------------------------------
// (d) The bounded-read and no-second-pass source pins
// ---------------------------------------------------------------------------

/**
 * Slice the new query's own source, anchored on its DECLARATION and ending at
 * the next top-level `export const`. A missing declaration THROWS, so the
 * absence pins below can never pass because the subject was deleted.
 */
function ledgerSourceSlice(source: string): string {
  const start = source.indexOf("export const getOrderAllocationLedger")
  expect(
    start,
    "export const getOrderAllocationLedger is missing from convex/orders.ts"
  ).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("\nexport const ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

test("the new read stays bounded, index-backed and free of a second pass", () => {
  const source = readFileSync(resolve(import.meta.dirname, "orders.ts"), "utf8")
  const slice = ledgerSourceSlice(source)

  // Bounded per-order iteration through the declared index.
  expect(slice).toContain("for await")
  expect(slice).toContain('withIndex("by_orderId"')
  expect(slice).not.toContain(".collect(")
  expect(slice).not.toContain(".take(")

  // ONE balance pass: the canonical owner, and no direct due-breakdown /
  // payments / attribution call beside it.
  expect(slice).toContain("loadCanonicalOrderBalances(")
  expect(slice).not.toContain("loadOrderAmountDueBreakdowns(")
  expect(slice).not.toContain("loadMatchedPaymentTotalsByOrderId(")
  expect(slice).not.toContain("loadOrderPaymentAttributions(")

  // Guard presence, so the absence pins above cannot pass vacuously on a
  // gutted function body.
  expect(slice).toContain("await requireIdentity(ctx)")
  expect(slice).toContain("String(order.eventId) !== String(args.eventId)")
  expect(slice).toContain("isInternalEvent(")
  expect(slice).toContain("isOrderRemoved(")
  expect(slice).toContain("isOrderMergedCore(")
})

// ---------------------------------------------------------------------------
// (e) The scalars' edge and the owner's omission rule
// ---------------------------------------------------------------------------

test("a zero-due order reports coverage 100 and never a fabricated balance", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "ledger-zero-due")

  const zero = await createAttendee(seeded, eventId, {
    attendeeKey: "zero-a1",
    name: "Zero One",
    ticketPriceMinor: 0,
  })

  const ledger = await authed.query(api.orders.getOrderAllocationLedger, {
    orderId: zero.orderId,
    eventId,
  })
  if (ledger === null) {
    throw new Error("expected the allocation ledger read to return a row")
  }

  expect(ledger.balances).toMatchObject({
    amountDueMinor: 0,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 0,
  })
  expect(ledger.allocationRows).toEqual([])
  expect(ledger.coveragePercent).toBe(100)
  expect(ledger.sharedOutstandingPerAttendeeMinor).toBe(0)

  // The read hands the owner a bare order ref, and the owner prices every
  // requested existing order — so the handler's `balances: null` branch (the
  // owner's omission rule) is NOT constructible from this call shape: an
  // omission requires the caller to pre-supply a due map that lacks the order.
  // The demonstration below shows the rule the branch mirrors.
  const omittedSize = await seeded.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const omitted = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders: [{ _id: zero.orderId }],
      dueBreakdownsByOrderId: new Map(),
    })
    return omitted.size
  })
  expect(omittedSize).toBe(0)

  const direct = await readCanonicalBalances(seeded, [zero.orderId])
  expect(ledger.balances).toEqual(direct[String(zero.orderId)])
})
