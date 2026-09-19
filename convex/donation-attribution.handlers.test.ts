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
  loadMatchedPaymentTotalsByOrderId,
  loadOrderAmountDueBreakdowns,
  loadOrderPaymentAttributions,
} from "./finance"
import {
  deriveAllocationPaymentBreakdowns,
  type AllocationPaymentState,
} from "../lib/domain/finance/allocation-payment-state"

/**
 * End-to-end handler tracer for Phase 56 plan 02: the canonical loader path
 * (`loadRecordedAllocationsByOrderId` -> `loadOrderPaymentAttributions`)
 * composed with REAL Phase 55 writes.
 *
 * Why a handler suite rather than more pure-module tests: 56-01 proved the
 * derivation in isolation; this file proves the DATABASE-BOUND path — a
 * standalone donation created through `payments.createStandaloneDonation`,
 * allocated through `donations.allocateDonation` /
 * `donations.allocateDonationToAttendee`, read back through the ONE shared
 * owner. The tracer asserts individual attendee figures, not just the order
 * total, because the defect this phase prevents — folding allocation credit
 * into the due-weight spread — reconciles at the order level and only diverges
 * per attendee.
 *
 * No `donationAllocations` row is hand-inserted on any happy path: the tracer
 * deliberately goes through the production mutation so the read is proven
 * against real writes, not against a fixture the test itself authored.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-attribution",
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

type AllocationRequestInput = { method: "manual"; rows: ManualRowInput[] }

const TRACER_BATCH_KEY = "tracer-batch-key"
const TARGETED_BATCH_KEY = "targeted-batch-key"

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]): AllocationRequestInput {
  return { method: "manual", rows }
}

// ---------------------------------------------------------------------------
// Projection reads through the REAL loaders
// ---------------------------------------------------------------------------

type AttendeeProjectionRow = {
  attendeeId: string
  amountDueMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  paymentState: AllocationPaymentState
  targetedCreditMinor: number
  poolShareMinor: number
}

type OrderProjection = {
  amountDueMinor: number
  appliedPaymentsMinor: number
  orderPaidAmountMinor: number
  orderOutstandingAmountMinor: number
  targetedCreditMinor: number
  wholeOrderCreditMinor: number
  orderPoolMinor: number
  byAttendeeId: AttendeeProjectionRow[]
}

/**
 * Runs `loadOrderAmountDueBreakdowns` + `loadOrderPaymentAttributions` inside
 * one function context and projects the returned Maps into plain serializable
 * data (a `t.run` result cannot contain a `Map`).
 */
async function readOrderProjections(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, OrderProjection>> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = orderIds.map((_id) => ({ _id }))
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const attributions = await loadOrderPaymentAttributions({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
    })

    const projections: Record<string, OrderProjection> = {}
    for (const [orderKey, attribution] of attributions) {
      projections[orderKey] = {
        amountDueMinor: attribution.amountDueMinor,
        appliedPaymentsMinor: attribution.appliedPaymentsMinor,
        orderPaidAmountMinor: attribution.orderPaidAmountMinor,
        orderOutstandingAmountMinor: attribution.orderOutstandingAmountMinor,
        targetedCreditMinor: attribution.targetedCreditMinor,
        wholeOrderCreditMinor: attribution.wholeOrderCreditMinor,
        orderPoolMinor: attribution.orderPoolMinor,
        byAttendeeId: Array.from(attribution.byAttendeeId.values())
          .map((row) => ({
            attendeeId: row.attendeeId,
            amountDueMinor: row.amountDueMinor,
            paidAmountMinor: row.paidAmountMinor,
            outstandingAmountMinor: row.outstandingAmountMinor,
            paymentState: row.paymentState,
            targetedCreditMinor: row.targetedCreditMinor,
            poolShareMinor: row.poolShareMinor,
          }))
          .sort((left, right) =>
            left.attendeeId.localeCompare(right.attendeeId)
          ),
      }
    }

    return projections
  })
}

async function readOrderProjection(
  t: TestConvex,
  orderId: Id<"orders">
): Promise<OrderProjection> {
  const projections = await readOrderProjections(t, [orderId])
  const projection = projections[String(orderId)]
  if (!projection) {
    throw new Error(`order ${String(orderId)} is missing from the projection`)
  }
  return projection
}

function attendeeRow(
  projection: OrderProjection,
  attendeeId: Id<"orderAttendees">
): AttendeeProjectionRow {
  const row = projection.byAttendeeId.find(
    (entry) => entry.attendeeId === String(attendeeId)
  )
  if (!row) {
    throw new Error(
      `attendee ${String(attendeeId)} is missing from the projection`
    )
  }
  return row
}

/** The payment-only applied totals, as the D-06 snapshot consumes them. */
async function readMatchedTotals(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, number>> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const totals = await loadMatchedPaymentTotalsByOrderId(
      loaderCtx,
      orderIds.map((_id) => ({ _id }))
    )
    return Object.fromEntries(totals)
  })
}

// ---------------------------------------------------------------------------
// Seeding helpers (file-local and minimal, copied from the Phase 55 handler
// suite). The donation itself is ALWAYS created through the production
// `payments.createStandaloneDonation` mutation, never hand-inserted.
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
    sortOrder?: number
  }
): Promise<{ orderId: Id<"orders">; attendeeId: Id<"orderAttendees"> }> {
  const orderId =
    input.orderId ??
    (await t.mutation(async (ctx) =>
      ctx.db.insert("orders", {
        eventId,
        source: "internal" as const,
        bookingRef: `BK-${input.attendeeKey.toUpperCase()}`,
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

async function countAllocationRowsForDonation(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      count += 1
    }
    return count
  })
}

type PaymentSnapshotRow = {
  _id: string
  amountMinor: number
  status: string | null
  donationKind: string | null
  orderId: string | null
  eventId: string | null
}

/** Every payment row of the event, in a comparable shape (DACC-03/D-06). */
async function snapshotPayments(
  t: TestConvex,
  eventId: Id<"events">
): Promise<PaymentSnapshotRow[]> {
  return t.query(async (ctx) => {
    const rows: PaymentSnapshotRow[] = []
    for await (const row of ctx.db
      .query("payments")
      .withIndex("eventId", (q) => q.eq("eventId", eventId))) {
      rows.push({
        _id: String(row._id),
        amountMinor: Number(row.amountMinor),
        status: row.status ? String(row.status) : null,
        donationKind: row.donationKind ? String(row.donationKind) : null,
        orderId: row.orderId ? String(row.orderId) : null,
        eventId: row.eventId ? String(row.eventId) : null,
      })
    }
    return rows
  })
}

// ---------------------------------------------------------------------------
// Cases 1-3: the tracer, event_charges targeting, and the D-06 snapshot
// ---------------------------------------------------------------------------

test("a real allocated donation reduces the order and attendee outstanding by exactly the allocated amount", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "attribution-tracer")

  // Tracer order: due €120 + €80 with a €100 REAL applied payment recorded.
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "tracer-a",
    name: "Attendee A",
    ticketPriceMinor: 12_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "tracer-b",
    name: "Attendee B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a.orderId, 10_000)

  // Targeting order: unpaid, due €100 + €100.
  const c = await createAttendee(seeded, eventId, {
    attendeeKey: "target-c",
    name: "Attendee C",
    ticketPriceMinor: 10_000,
  })
  const d = await createAttendee(seeded, eventId, {
    orderId: c.orderId,
    attendeeKey: "target-d",
    name: "Attendee D",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })

  // Both donations are created through the production mutation.
  const donationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 10_000,
  })
  const targetedDonationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 7_500,
  })

  const paymentsBefore = await snapshotPayments(seeded, eventId)
  expect(paymentsBefore).toHaveLength(3) // 1 applied payment + 2 donations

  // --- Case 1, pre-allocation baseline through the shared owner -----------
  const pre = await readOrderProjection(seeded, a.orderId)
  expect(pre.orderPaidAmountMinor).toBe(10_000)
  expect(pre.orderOutstandingAmountMinor).toBe(10_000)
  const preA = attendeeRow(pre, a.attendeeId)
  const preB = attendeeRow(pre, b.attendeeId)
  expect(preA).toMatchObject({
    amountDueMinor: 12_000,
    paidAmountMinor: 6_000,
    outstandingAmountMinor: 6_000,
    paymentState: "partial",
  })
  expect(preB).toMatchObject({
    amountDueMinor: 8_000,
    paidAmountMinor: 4_000,
    outstandingAmountMinor: 4_000,
    paymentState: "partial",
  })

  // --- Case 1: allocate €100 whole_order naming B through the production
  // mutation (never a hand-written donationAllocations row) -----------------
  const tracerResult = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: b.attendeeId, amountMinor: 10_000, scope: "whole_order" },
    ]),
    idempotencyKey: TRACER_BATCH_KEY,
  })
  expect(tracerResult).toMatchObject({
    donationId,
    allocatedTotalMinor: 10_000,
    remainingMinor: 0,
  })

  // --- Case 1, post-allocation through the SAME owner ----------------------
  const post = await readOrderProjection(seeded, a.orderId)
  const postA = attendeeRow(post, a.attendeeId)
  const postB = attendeeRow(post, b.attendeeId)

  expect(post.orderPaidAmountMinor).toBe(20_000)
  expect(post.orderOutstandingAmountMinor).toBe(0)
  expect(postA).toMatchObject({
    paidAmountMinor: 12_000,
    outstandingAmountMinor: 0,
    paymentState: "paid",
  })
  expect(postB).toMatchObject({
    paidAmountMinor: 8_000,
    outstandingAmountMinor: 0,
    paymentState: "paid",
  })

  // Σ attendee outstanding ≡ order outstanding. This is the invariant the
  // blanket targeted-first rule breaks: it strands €60 of the credit and
  // leaves attendee outstanding at €100 against an order outstanding of €0.
  const attendeeOutstandingSum = post.byAttendeeId.reduce(
    (sum, row) => sum + row.outstandingAmountMinor,
    0
  )
  expect(attendeeOutstandingSum).toBe(post.orderOutstandingAmountMinor)

  // THE DELTA PROPERTY, explicit: the order drops by exactly the allocated
  // €100; each attendee drops by their share of the order pool credit (A €60,
  // B €40 — the whole_order credit joins the €100 real payment as a €200 pool
  // weighted 120:80 by remaining attributable outstanding).
  expect(
    pre.orderOutstandingAmountMinor - post.orderOutstandingAmountMinor
  ).toBe(10_000)
  expect(preA.outstandingAmountMinor - postA.outstandingAmountMinor).toBe(6_000)
  expect(preB.outstandingAmountMinor - postB.outstandingAmountMinor).toBe(4_000)

  // DISCRIMINATING ASSERTION (D-03). Under a blanket targeted-first rule B's
  // €100 credit would be capped at B's own €40 and the stranded €60 dropped;
  // the remaining €100 real payment would then spread by due weight (A = €60)
  // or by remaining need (A = €75), so A could never reach €120. This
  // assertion fails whenever the whole_order credit is attributed to the named
  // attendee instead of distributed through the order pool — the defect this
  // phase exists to prevent.
  expect(postA.paidAmountMinor).toBe(12_000)

  // --- Case 2: event_charges targeting stays attendee-scoped ---------------
  const targetedPre = await readOrderProjection(seeded, c.orderId)
  expect(targetedPre.orderOutstandingAmountMinor).toBe(20_000)

  const targetedResult = await authed.mutation(api.donations.allocateDonation, {
    donationId: targetedDonationId,
    eventId,
    request: manualRequest([
      { attendeeId: c.attendeeId, amountMinor: 7_500, scope: "event_charges" },
    ]),
    idempotencyKey: TARGETED_BATCH_KEY,
  })
  expect(targetedResult).toMatchObject({
    allocatedTotalMinor: 7_500,
    remainingMinor: 0,
  })

  const targetedPost = await readOrderProjection(seeded, c.orderId)
  expect(attendeeRow(targetedPost, c.attendeeId)).toMatchObject({
    amountDueMinor: 10_000,
    paidAmountMinor: 7_500,
    outstandingAmountMinor: 2_500,
    paymentState: "partial",
    targetedCreditMinor: 7_500,
  })
  expect(attendeeRow(targetedPost, d.attendeeId)).toMatchObject({
    amountDueMinor: 10_000,
    paidAmountMinor: 0,
    outstandingAmountMinor: 10_000,
    paymentState: "unpaid",
    targetedCreditMinor: 0,
  })
  expect(targetedPost.orderPaidAmountMinor).toBe(7_500)
  expect(targetedPost.orderOutstandingAmountMinor).toBe(12_500)

  // --- Case 3: the D-06 exclusion snapshot (after BOTH allocations) --------
  const paymentsAfter = await snapshotPayments(seeded, eventId)
  expect(paymentsAfter).toHaveLength(paymentsBefore.length)
  expect(paymentsAfter).toEqual(paymentsBefore)

  const donationRow = paymentsAfter.find((row) => row._id === String(donationId))
  expect(donationRow).toMatchObject({
    amountMinor: 10_000,
    status: "donation",
    donationKind: "standalone",
    orderId: null,
    eventId: String(eventId),
  })
  const targetedDonationRow = paymentsAfter.find(
    (row) => row._id === String(targetedDonationId)
  )
  expect(targetedDonationRow).toMatchObject({
    amountMinor: 7_500,
    status: "donation",
    donationKind: "standalone",
    orderId: null,
    eventId: String(eventId),
  })

  // The raw stored donation row keeps `orderId` undefined (never assigned to
  // an order) — asserted on the document itself, not the normalized snapshot.
  const rawDonation = await seeded.query(async (ctx) =>
    ctx.db.get("payments", donationId)
  )
  expect(rawDonation?.orderId).toBeUndefined()

  // `loadMatchedPaymentTotalsByOrderId` returns exactly the hand-created real
  // payment totals, with no donation contribution anywhere.
  const matchedTotals = await readMatchedTotals(seeded, [a.orderId, c.orderId])
  expect(matchedTotals[String(a.orderId)]).toBe(10_000)
  expect(matchedTotals[String(c.orderId)] ?? 0).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 4: backward compatibility at the loader boundary (D-10)
// ---------------------------------------------------------------------------

test("an allocation-free order keeps the exact pre-Phase-56 figures at the loader boundary", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "attribution-baseline")
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "baseline-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "baseline-b",
    name: "Attendee B",
    ticketPriceMinor: 5_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a.orderId, 6_000)

  const comparison = await seeded.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = [{ _id: a.orderId }]
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
    ).get(String(a.orderId))
    const paidTotalMinor =
      (
        await loadMatchedPaymentTotalsByOrderId(loaderCtx, orders)
      ).get(String(a.orderId)) ?? 0

    // The pre-Phase-56 projection, computed from the same raw inputs.
    const baseline = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId:
        dueBreakdownsByOrderId.get(String(a.orderId))?.amountDueByAttendeeId ??
        new Map(),
      paidTotalMinor,
    })

    const toRows = (rows: Array<{
      attendeeId: string
      amountDueMinor: number
      paidAmountMinor: number
      paymentState: AllocationPaymentState
    }>) =>
      rows
        .map((row) => ({
          attendeeId: row.attendeeId,
          amountDueMinor: row.amountDueMinor,
          paidAmountMinor: row.paidAmountMinor,
          paymentState: row.paymentState,
        }))
        .sort((left, right) => left.attendeeId.localeCompare(right.attendeeId))

    return {
      orderPaidAmountMinor: attribution?.orderPaidAmountMinor ?? null,
      matchedTotalMinor: paidTotalMinor,
      orderOutstandingAmountMinor:
        attribution?.orderOutstandingAmountMinor ?? null,
      attributionRows: toRows([
        ...(attribution?.byAttendeeId.values() ?? []),
      ]),
      baselineRows: toRows([...baseline.values()]),
    }
  })

  // This is the proof existing orders cannot shift: with zero allocation rows
  // the owner delegates to `deriveAllocationPaymentBreakdowns`, so its
  // per-attendee record set is identical, record for record, and the
  // order-level paid figure is the same `loadMatchedPaymentTotalsByOrderId`
  // value the old loader used.
  expect(comparison.attributionRows).toEqual(comparison.baselineRows)
  expect(comparison.orderPaidAmountMinor).toBe(comparison.matchedTotalMinor)
  expect(comparison.orderPaidAmountMinor).toBe(6_000)
  expect(comparison.orderOutstandingAmountMinor).toBe(9_000)
  expect(comparison.attributionRows).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// Case 5: idempotence — re-reading and replaying
// ---------------------------------------------------------------------------

test("re-deriving the projection and replaying an allocation are both idempotent", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "attribution-idempotence")
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "idem-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "idem-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 15_000,
  })

  // --- The set-replace batch path (`allocateDonation`) ---------------------
  const batchKey = "idempotence-batch-key"
  const batchRequest = manualRequest([
    { attendeeId: a.attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])
  const batchResult = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: batchRequest,
    idempotencyKey: batchKey,
  })

  // Reading the projection twice in a row is deeply equal (D-09).
  const firstRead = await readOrderProjection(seeded, a.orderId)
  const secondRead = await readOrderProjection(seeded, a.orderId)
  expect(secondRead).toEqual(firstRead)

  const rowsBeforeReplay = await countAllocationRowsForDonation(
    seeded,
    donationId
  )
  expect(rowsBeforeReplay).toBe(1)

  const batchReplay = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: batchRequest,
    idempotencyKey: batchKey,
  })
  expect(batchReplay).toEqual(batchResult)
  expect(await countAllocationRowsForDonation(seeded, donationId)).toBe(
    rowsBeforeReplay
  )
  expect(await readOrderProjection(seeded, a.orderId)).toEqual(firstRead)

  // --- The single-row additive path (`allocateDonationToAttendee`) ---------
  const oneKey = "idempotence-one-key"
  const oneResult = await authed.mutation(
    api.donations.allocateDonationToAttendee,
    {
      donationId,
      eventId,
      attendeeId: b.attendeeId,
      amountMinor: 4_000,
      scope: "event_charges",
      idempotencyKey: oneKey,
    }
  )
  expect(oneResult).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 5_000,
  })

  const beforeOneReplay = await readOrderProjection(seeded, a.orderId)
  const rowsBeforeOneReplay = await countAllocationRowsForDonation(
    seeded,
    donationId
  )
  expect(rowsBeforeOneReplay).toBe(2)

  const oneReplay = await authed.mutation(
    api.donations.allocateDonationToAttendee,
    {
      donationId,
      eventId,
      attendeeId: b.attendeeId,
      amountMinor: 4_000,
      scope: "event_charges",
      idempotencyKey: oneKey,
    }
  )
  expect(oneReplay).toEqual(oneResult)
  expect(await countAllocationRowsForDonation(seeded, donationId)).toBe(
    rowsBeforeOneReplay
  )
  expect(await readOrderProjection(seeded, a.orderId)).toEqual(beforeOneReplay)

  // The additive row landed where it was submitted and moved no sibling.
  const finalProjection = await readOrderProjection(seeded, a.orderId)
  expect(attendeeRow(finalProjection, a.attendeeId)).toMatchObject({
    paidAmountMinor: 6_000,
    outstandingAmountMinor: 4_000,
  })
  expect(attendeeRow(finalProjection, b.attendeeId)).toMatchObject({
    paidAmountMinor: 4_000,
    outstandingAmountMinor: 6_000,
  })
})

// ---------------------------------------------------------------------------
// Case 6: the bounded, index-backed read shape
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

test("the allocation read stays index-backed and bounded on donationAllocations.by_orderId", () => {
  const source = readFileSync(resolve(import.meta.dirname, "finance.ts"), "utf8")

  // No unbounded scan anywhere in the finance loader module.
  expect(source).not.toContain(".collect(")

  // The credit read is index-backed, unbounded-iteration-only, no fixed cap.
  const readSlice = functionSource(source, "loadRecordedAllocationsByOrderId")
  expect(readSlice).toContain('query("donationAllocations")')
  expect(readSlice).toContain('withIndex("by_orderId"')
  expect(readSlice).toContain("for await")
  expect(readSlice).not.toContain(".collect(")
  expect(readSlice).not.toContain(".take(")

  // The ONE owner composes that read (never a second credit reader).
  const ownerSlice = functionSource(source, "loadOrderPaymentAttributions")
  expect(ownerSlice).toContain("loadRecordedAllocationsByOrderId")
  expect(ownerSlice).toContain("loadMatchedPaymentTotalsByOrderId")
  expect(ownerSlice).not.toContain(".collect(")
})
