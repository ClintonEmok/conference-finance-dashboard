/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import {
  loadCanonicalOrderBalances,
  loadOrderAmountDueBreakdowns,
  loadOrderPaymentAttributions,
} from "./finance"

/**
 * Phase 57 plan 05 — the exact-restoration suite (DDEL-02).
 *
 * WHAT THIS SUITE PROVES: deleting an allocated standalone donation returns
 * every affected canonical order and attendee figure to the value it held
 * BEFORE the allocation. The equality is asserted against the Phase 56 owners
 * — `loadCanonicalOrderBalances` (the one order-level balance owner) and
 * `loadOrderPaymentAttributions` (the one per-attendee / order-pool owner) —
 * and the event income against `donations.getEventDonationIncome`. Never
 * against a locally re-derived figure: a local sum would only prove internal
 * consistency, because the owners would agree with themselves and a shifted
 * figure could pass.
 *
 * THE HARD RULE: no case sums payments or allocation rows locally. Every
 * monetary comparison reads through one of the three owners. The only local
 * arithmetic is a DELTA between two owner reads (e.g. `before.totals.x −
 * after.totals.x`), which IS the assertion, not an input to it.
 *
 * NON-VACUITY IS PART OF THE PROOF: `expect(S2).toEqual(S0)` passes when the
 * fixture never allocated anything. Every restoration case therefore asserts
 * the credited intermediate state is real FIRST (`S1` differs from `S0`,
 * `allocationCreditMinor` equals the `whole_order` total, the targeted
 * attendee's outstanding strictly fell), and case 4 proves the deletion
 * actually happened — the donation row is gone and its `operation: "delete"`
 * ledger row exists — before trusting the untouched-order comparison.
 *
 * COVERAGE: both scopes (mixed `event_charges` + `whole_order` on one order,
 * plus a `whole_order`-only pool reversal), the competing-donation rule, the
 * zero-attributable-charge class (the Phase 56 order-Q class) and a
 * zero-allocation deletion. The donation is always created through
 * `payments.createStandaloneDonation` and allocated through
 * `donations.allocateDonation`; the deletion is always
 * `donationDeletion.deleteDonation` — no hand-written reversal.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-restoration",
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

type ManualRequestInput = {
  method: "manual"
  rows: ManualRowInput[]
}

/** The seven canonical order figures — `CanonicalOrderBalance` verbatim. */
type CanonicalSnapshot = {
  amountDueMinor: number
  appliedPaymentMinor: number
  allocationCreditMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  donationAmountMinor: number
  appliedAmountMinor: number
}

/** The six per-attendee figures the attribution owner exposes. */
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

function manualRequest(rows: ManualRowInput[]): ManualRequestInput {
  return { method: "manual", rows }
}

// ---------------------------------------------------------------------------
// Direct reads through the Phase 56 canonical owners. Copied in intent from
// `convex/canonical-order-balance.handlers.test.ts:96-164` so this suite reads
// the SAME seven order fields and the SAME six attendee fields.
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
// suites). The donation, the allocation and the deletion always go through the
// production mutations.
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

async function createOrder(
  t: TestConvex,
  eventId: Id<"events">,
  bookingRef: string
): Promise<Id<"orders">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "internal" as const,
      bookingRef,
      bookerName: "Booker",
      bookerEmail: "booker@example.com",
      submittedAt: BASE_AT,
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
    (await createOrder(t, eventId, `BK-${input.attendeeKey.toUpperCase()}`))

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
 * A bare attendee row with NO ticket selection, for the zero-attributable
 * charge order (Phase 56's order-Q class): every due weight is 0 because no
 * selection contributes a charge.
 */
async function createBareAttendee(
  t: TestConvex,
  orderId: Id<"orders">,
  input: { attendeeKey: string; name: string; sortOrder?: number }
): Promise<Id<"orderAttendees">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: input.attendeeKey,
      name: input.name,
      gender: "unknown" as const,
      sortOrder: input.sortOrder ?? 0,
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

/** The PRODUCTION standalone-donation write — never a hand-written row. */
async function createDonation(
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

/** `donations.allocateDonation` with a fresh key unless one is supplied. */
let allocationKeySeq = 0
function allocate(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    request: ManualRequestInput
    idempotencyKey?: string
  }
) {
  allocationKeySeq += 1
  return client.mutation(api.donations.allocateDonation, {
    ...args,
    idempotencyKey:
      args.idempotencyKey ?? `restoration-allocate-${allocationKeySeq}`,
  })
}

/**
 * The frozen deletion result the handler returns. `deleteDonation` carries no
 * `returns` validator (matching the neighbouring `donations.ts` mutations), so
 * the test states the contract explicitly.
 */
type DeletionResult = {
  donationId: string
  deleted: true
  donationAmountMinor: number
  reversedAllocationMinor: number
  remainingMinor: number
  allocationCount: number
  rows: Array<{
    attendeeId: string
    orderId: string
    amountMinor: number
    scope: string
  }>
}

/** `donationDeletion.deleteDonation` with a fresh key unless one is supplied. */
let deletionKeySeq = 0
function deleteDonation(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    idempotencyKey?: string
  }
): Promise<DeletionResult> {
  deletionKeySeq += 1
  return client.mutation(api.donationDeletion.deleteDonation, {
    ...args,
    idempotencyKey:
      args.idempotencyKey ?? `restoration-delete-${deletionKeySeq}`,
  })
}

// ---------------------------------------------------------------------------
// The event-income owner read (`donations.getEventDonationIncome`) and the
// row-existence instruments case 4 uses to prove a deletion happened.
// ---------------------------------------------------------------------------

async function readEventIncome(client: TestConvex, eventId: Id<"events">) {
  return client.query(api.donations.getEventDonationIncome, { eventId })
}

type EventIncome = Awaited<ReturnType<typeof readEventIncome>>

function incomeRowFor(income: EventIncome, donationId: Id<"payments">) {
  return income.donations.find(
    (row) => String(row.donationId) === String(donationId)
  )
}

/** Row-count fixture check — never a monetary figure. */
async function countAllocationRows(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<number> {
  return t.run(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      count += 1
    }
    return count
  })
}

async function paymentRowExists(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<boolean> {
  return t.run(
    async (ctx) => (await ctx.db.get("payments", donationId)) !== null
  )
}

/** The `operation: "delete"` ledger row — the donation-level deletion record. */
async function hasDeleteLedgerRow(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<boolean> {
  return t.run(async (ctx) => {
    for await (const row of ctx.db.query("donationAllocationSubmissions")) {
      if (
        String(row.donationId) === String(donationId) &&
        row.operation === "delete"
      ) {
        return true
      }
    }
    return false
  })
}

// ---------------------------------------------------------------------------
// Case 1 — DDEL-02: mixed-scope exact restoration on an order with a real
// applied payment, with the credited intermediate state asserted non-vacuous.
// Reads: loadCanonicalOrderBalances + loadOrderPaymentAttributions.
// ---------------------------------------------------------------------------

test("mixed-scope exact restoration returns the seven canonical figures and the six attendee figures to their pre-allocation values", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "restoration-mixed-scope")

  // Order O: A 40_000 + B 30_000, plus a real applied payment of 10_000.
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "o-a",
    name: "O Attendee A",
    ticketPriceMinor: 40_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "o-b",
    name: "O Attendee B",
    ticketPriceMinor: 30_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a.orderId, 10_000)

  const oKey = String(a.orderId)
  const aKey = String(a.attendeeId)

  const S0 = await readCanonicalBalances(seeded, [a.orderId])
  const A0 = await readAttendeeSnapshots(seeded, a.orderId)
  expect(S0[oKey]).toBeDefined()
  expect(A0[aKey]).toBeDefined()
  expect(A0[String(b.attendeeId)]).toBeDefined()

  // The donation under test: 50_000, mixed scopes — 25_000 `event_charges`
  // to A and 15_000 `whole_order` to B, both through the production mutation.
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 50_000,
  })
  const allocation = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: a.attendeeId, amountMinor: 25_000, scope: "event_charges" },
      { attendeeId: b.attendeeId, amountMinor: 15_000, scope: "whole_order" },
    ]),
  })
  expect(allocation).toMatchObject({
    donationId,
    allocatedTotalMinor: 40_000,
    remainingMinor: 10_000,
  })

  const S1 = await readCanonicalBalances(seeded, [a.orderId])
  const A1 = await readAttendeeSnapshots(seeded, a.orderId)

  // Non-vacuity: the allocation must have moved the canonical figures before
  // any restoration equality below can mean anything.
  expect(S1[oKey]).not.toEqual(S0[oKey])
  // `allocationCreditMinor` is Phase 56-05's `wholeOrderCreditMinor` — the
  // Σ `whole_order` credit only. The 25_000 `event_charges` row deliberately
  // does not appear in it; it moves the attendee figures instead.
  expect(S1[oKey].allocationCreditMinor).toBe(15_000)
  expect(S1[oKey].paidAmountMinor).toBe(50_000)
  expect(S1[oKey].outstandingAmountMinor).toBe(20_000)
  expect(A1[aKey].outstandingAmountMinor).toBeLessThan(
    A0[aKey].outstandingAmountMinor
  )
  expect(A1[aKey].targetedCreditMinor).toBe(25_000)
  expect(A1[aKey].paidAmountMinor).toBe(33_333)
  expect(A1[aKey].outstandingAmountMinor).toBe(6_667)
  // Allocations never touch payments, and this donation can never surface as
  // an order overpayment: the two payment-class fields are identical across
  // allocation and deletion.
  expect(S1[oKey].appliedPaymentMinor).toBe(S0[oKey].appliedPaymentMinor)
  expect(S1[oKey].appliedPaymentMinor).toBe(10_000)
  expect(S1[oKey].donationAmountMinor).toBe(S0[oKey].donationAmountMinor)
  expect(S1[oKey].donationAmountMinor).toBe(0)

  const deletion = await deleteDonation(authed, { donationId, eventId })
  expect(deletion).toMatchObject({
    deleted: true,
    donationAmountMinor: 50_000,
    reversedAllocationMinor: 40_000,
    remainingMinor: 10_000,
    allocationCount: 2,
  })

  const S2 = await readCanonicalBalances(seeded, [a.orderId])
  const A2 = await readAttendeeSnapshots(seeded, a.orderId)

  // DDEL-02: exact restoration — every field of both owners' projections.
  expect(S2[oKey]).toEqual(S0[oKey])
  expect(A2).toEqual(A0)
  expect(S2[oKey].appliedPaymentMinor).toBe(S0[oKey].appliedPaymentMinor)
  expect(S2[oKey].donationAmountMinor).toBe(S0[oKey].donationAmountMinor)
  expect(S2[oKey].allocationCreditMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 2 — DDEL-02: `whole_order`-only reversal changes the order pool, so
// the credited state must be non-vacuous before the restoration equality.
// Reads: loadCanonicalOrderBalances + loadOrderPaymentAttributions.
// ---------------------------------------------------------------------------

test("whole_order-only reversal is non-vacuous and restores the canonical figures exactly", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "restoration-whole-order")

  // Order P: one attendee on a 30_000 ticket, no applied payments — enough
  // outstanding that the whole_order claim fits.
  const p = await createAttendee(seeded, eventId, {
    attendeeKey: "p-a",
    name: "P Attendee",
    ticketPriceMinor: 30_000,
  })
  const pKey = String(p.orderId)
  const pAttendeeKey = String(p.attendeeId)

  const S0 = await readCanonicalBalances(seeded, [p.orderId])
  const A0 = await readAttendeeSnapshots(seeded, p.orderId)
  // Defensive: an order omitted from the owner map would deep-equal itself, so
  // the baseline is pinned to real figures before any equality is asserted.
  expect(S0[pKey]).toMatchObject({
    amountDueMinor: 30_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 30_000,
  })
  expect(A0[pAttendeeKey]).toBeDefined()

  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 20_000,
  })
  const allocation = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: p.attendeeId, amountMinor: 20_000, scope: "whole_order" },
    ]),
  })
  expect(allocation).toMatchObject({
    allocatedTotalMinor: 20_000,
    remainingMinor: 0,
  })

  const S1 = await readCanonicalBalances(seeded, [p.orderId])
  const A1 = await readAttendeeSnapshots(seeded, p.orderId)

  // Non-vacuity, all three terms: the order moved, the pool credit equals the
  // whole_order total, and the attendee's outstanding fell. Without these a
  // no-op allocation would let the restoration equality below pass trivially.
  expect(S1[pKey]).not.toEqual(S0[pKey])
  expect(S1[pKey].allocationCreditMinor).toBe(20_000)
  expect(S1[pKey].paidAmountMinor).toBe(20_000)
  expect(A1[pAttendeeKey].outstandingAmountMinor).toBeLessThan(
    A0[pAttendeeKey].outstandingAmountMinor
  )
  expect(A1[pAttendeeKey].poolShareMinor).toBe(20_000)

  await deleteDonation(authed, { donationId, eventId })

  const S2 = await readCanonicalBalances(seeded, [p.orderId])
  const A2 = await readAttendeeSnapshots(seeded, p.orderId)

  expect(S2[pKey]).toEqual(S0[pKey])
  expect(A2).toEqual(A0)
  expect(S2[pKey].allocationCreditMinor).toBe(S0[pKey].allocationCreditMinor)
  expect(S2[pKey].allocationCreditMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 3 — DDEL-02: the competing-donation rule. A second donation's
// allocations must survive the deletion and still apply, so the post-deletion
// baseline is the state captured WITH the competitor's rows present — never
// the pre-this-donation history.
// Reads: loadCanonicalOrderBalances + loadOrderPaymentAttributions.
// ---------------------------------------------------------------------------

test("competing-donation control: the surviving donation's credit still applies after the deletion", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "restoration-competing")

  // Order O2: two attendees, 50_000 + 30_000 = 80_000 due, no payments — wide
  // enough for both whole_order claims.
  const c = await createAttendee(seeded, eventId, {
    attendeeKey: "o2-c",
    name: "O2 Attendee C",
    ticketPriceMinor: 50_000,
  })
  const d = await createAttendee(seeded, eventId, {
    orderId: c.orderId,
    attendeeKey: "o2-d",
    name: "O2 Attendee D",
    ticketPriceMinor: 30_000,
    sortOrder: 1,
  })
  const o2Key = String(c.orderId)

  // The competitor lands FIRST: 20_000 whole_order, 10_000 committed.
  const competitorId = await createDonation(authed, {
    eventId,
    amountMinor: 20_000,
  })
  await allocate(authed, {
    donationId: competitorId,
    eventId,
    request: manualRequest([
      { attendeeId: c.attendeeId, amountMinor: 10_000, scope: "whole_order" },
    ]),
  })

  // S0 is captured with the competitor's rows already present.
  const S0 = await readCanonicalBalances(seeded, [c.orderId])
  const A0 = await readAttendeeSnapshots(seeded, c.orderId)
  expect(S0[o2Key].allocationCreditMinor).toBe(10_000)
  expect(S0[o2Key].paidAmountMinor).toBe(10_000)

  // The donation under test: 30_000 whole_order, 15_000 committed.
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 30_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: d.attendeeId, amountMinor: 15_000, scope: "whole_order" },
    ]),
  })

  const S1 = await readCanonicalBalances(seeded, [c.orderId])
  const A1 = await readAttendeeSnapshots(seeded, c.orderId)
  expect(S1[o2Key]).not.toEqual(S0[o2Key])
  expect(S1[o2Key].allocationCreditMinor).toBe(25_000)

  await deleteDonation(authed, { donationId, eventId })

  const S2 = await readCanonicalBalances(seeded, [c.orderId])
  const A2 = await readAttendeeSnapshots(seeded, c.orderId)

  expect(S2[o2Key]).toEqual(S0[o2Key])
  expect(A2).toEqual(A0)
  // The competitor's claim is what remains: 10_000, not 0.
  expect(S2[o2Key].allocationCreditMinor).toBe(10_000)
  // The competitor's own rows survive the deletion (row count, never a
  // locally derived money figure).
  expect(await countAllocationRows(seeded, competitorId)).toBe(1)
})

// ---------------------------------------------------------------------------
// Case 4 — DDEL-02: the zero-attributable-charge control (Phase 56's order-Q
// class). Order Q's figures must be untouched by a deletion on another order,
// and the deletion itself must be proven to have happened first — otherwise a
// silently failed deletion would let the Q comparison pass vacuously.
// Reads: loadCanonicalOrderBalances.
// ---------------------------------------------------------------------------

test("zero-attributable-charge control: order Q is untouched by a deletion proven to have happened", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "restoration-zero-charge")

  // Order Q: attendees but no ticket selections, so every due weight is 0,
  // plus one real applied payment. A per-attendee-Σ shortcut would report 0
  // here; the canonical owner reports the payment total.
  const qOrderId = await createOrder(seeded, eventId, "BK-Q")
  await createBareAttendee(seeded, qOrderId, {
    attendeeKey: "q-a",
    name: "Q Attendee A",
    sortOrder: 0,
  })
  await createBareAttendee(seeded, qOrderId, {
    attendeeKey: "q-b",
    name: "Q Attendee B",
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, qOrderId, 5_000)

  // Order O3: the deletion target — its own order, with an allocated donation.
  const o3 = await createAttendee(seeded, eventId, {
    attendeeKey: "o3-a",
    name: "O3 Attendee",
    ticketPriceMinor: 40_000,
  })
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 15_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      {
        attendeeId: o3.attendeeId,
        amountMinor: 15_000,
        scope: "event_charges",
      },
    ]),
  })

  // Fixture check: the donation really carries a recorded allocation row
  // BEFORE the deletion. A row count, never a monetary figure.
  expect(await countAllocationRows(seeded, donationId)).toBe(1)

  const qKey = String(qOrderId)
  const Q0 = await readCanonicalBalances(seeded, [qOrderId])
  expect(Q0[qKey]).toBeDefined()

  const deletion = await deleteDonation(authed, { donationId, eventId })
  expect(deletion).toMatchObject({ deleted: true, allocationCount: 1 })

  // Prove the deletion actually happened before trusting the Q comparison.
  expect(await paymentRowExists(seeded, donationId)).toBe(false)
  expect(await hasDeleteLedgerRow(seeded, donationId)).toBe(true)

  const Q1 = await readCanonicalBalances(seeded, [qOrderId])
  expect(Q1).toEqual(Q0)
  // The Phase 56 order-Q rule: the order-level applied figure is the payment
  // total, never a per-attendee Σ that reports 0, and the capped applied class
  // stays 0 because the attributable due is 0.
  expect(Q1[qKey].appliedPaymentMinor).toBe(5_000)
  expect(Q1[qKey].paidAmountMinor).toBe(5_000)
  expect(Q1[qKey].appliedAmountMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 5 — DDEL-02: a zero-allocation deletion. It must succeed, leave every
// canonical figure unchanged, and drop event donation income by the donation's
// FULL amount (nothing was allocated, so the whole face value is the income).
// Reads: loadCanonicalOrderBalances + donations.getEventDonationIncome.
// ---------------------------------------------------------------------------

test("zero-allocation deletion leaves the canonical figures unchanged and drops event income by the full amount", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "restoration-zero-allocation")

  // An order that the zero-allocation donation cannot touch (it has no rows).
  const r = await createAttendee(seeded, eventId, {
    attendeeKey: "r-a",
    name: "R Attendee",
    ticketPriceMinor: 10_000,
  })
  const rKey = String(r.orderId)

  const R0 = await readCanonicalBalances(seeded, [r.orderId])
  // Defensive: an order omitted from the owner map would deep-equal itself, so
  // the baseline is pinned to real figures before any equality is asserted.
  expect(R0[rKey]).toMatchObject({
    amountDueMinor: 10_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 10_000,
  })

  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 20_000,
  })

  const incomeBefore = await readEventIncome(authed, eventId)
  expect(incomeBefore.totals).toEqual({
    donationCount: 1,
    donationsMinor: 20_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 20_000,
  })

  const deletion = await deleteDonation(authed, { donationId, eventId })
  expect(deletion.allocationCount).toBe(0)
  expect(deletion.rows).toEqual([])
  expect(deletion.reversedAllocationMinor).toBe(0)
  expect(deletion.remainingMinor).toBe(20_000)

  const R1 = await readCanonicalBalances(seeded, [r.orderId])
  expect(R1).toEqual(R0)

  const incomeAfter = await readEventIncome(authed, eventId)
  expect(incomeAfter.donations).toEqual([])
  expect(incomeAfter.totals).toEqual({
    donationCount: 0,
    donationsMinor: 0,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 0,
  })
  // The income drop is the FULL 20_000, not the allocated remainder of an
  // allocated donation.
  expect(
    incomeBefore.totals.unallocatedRemainderMinor -
      incomeAfter.totals.unallocatedRemainderMinor
  ).toBe(20_000)
})

// ---------------------------------------------------------------------------
// Case 6 — DDEL-02 / DACC-02's no-double-count interaction: the income delta.
// Deleting one donation removes exactly its own composition from the event
// totals and leaves an untouched sibling donation's row byte-identical.
// Reads: donations.getEventDonationIncome.
// ---------------------------------------------------------------------------

test("event income delta: the deleted donation's composition is removed and the sibling's is untouched", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "restoration-income-delta")

  // An order able to absorb 40_000 of the 50_000 donation across two rows.
  const e = await createAttendee(seeded, eventId, {
    attendeeKey: "s-e",
    name: "S Attendee E",
    ticketPriceMinor: 30_000,
  })
  const f = await createAttendee(seeded, eventId, {
    orderId: e.orderId,
    attendeeKey: "s-f",
    name: "S Attendee F",
    ticketPriceMinor: 30_000,
    sortOrder: 1,
  })

  // D: 50_000, allocated 40_000 (two rows) — remainder 10_000.
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 50_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: e.attendeeId, amountMinor: 20_000, scope: "event_charges" },
      { attendeeId: f.attendeeId, amountMinor: 20_000, scope: "whole_order" },
    ]),
  })

  // D_keep: 20_000 with no allocations — the untouched sibling.
  const keepId = await createDonation(authed, { eventId, amountMinor: 20_000 })

  const before = await readEventIncome(authed, eventId)
  expect(before.donations).toHaveLength(2)

  const deletedRowBefore = incomeRowFor(before, donationId)
  const keepRowBefore = incomeRowFor(before, keepId)
  expect(deletedRowBefore).toBeDefined()
  expect(keepRowBefore).toBeDefined()
  expect(deletedRowBefore).toMatchObject({
    donationAmountMinor: 50_000,
    allocatedMinor: 40_000,
    unallocatedRemainderMinor: 10_000,
    allocationCount: 2,
  })
  expect(keepRowBefore).toMatchObject({
    donationAmountMinor: 20_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 20_000,
    allocationCount: 0,
  })
  expect(before.totals).toEqual({
    donationCount: 2,
    donationsMinor: 70_000,
    allocatedMinor: 40_000,
    unallocatedRemainderMinor: 30_000,
  })

  await deleteDonation(authed, { donationId, eventId })

  const after = await readEventIncome(authed, eventId)
  expect(after.donations).toHaveLength(1)
  expect(incomeRowFor(after, donationId)).toBeUndefined()

  // The sibling's row is byte-identical before and after.
  const keepRowAfter = incomeRowFor(after, keepId)
  expect(keepRowAfter).toBeDefined()
  expect(keepRowAfter).toEqual(keepRowBefore)

  expect(after.totals).toEqual({
    donationCount: 1,
    donationsMinor: 20_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 20_000,
  })
  // The event totals fall by exactly the deleted donation's composition:
  // count − 1, donations − 50_000, allocated − 40_000, remainder − 10_000.
  expect(before.totals.donationCount - after.totals.donationCount).toBe(1)
  expect(before.totals.donationsMinor - after.totals.donationsMinor).toBe(
    50_000
  )
  expect(before.totals.allocatedMinor - after.totals.allocatedMinor).toBe(
    40_000
  )
  expect(
    before.totals.unallocatedRemainderMinor -
      after.totals.unallocatedRemainderMinor
  ).toBe(10_000)
})
