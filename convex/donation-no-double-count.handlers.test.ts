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
import { isOrderAppliedPayment } from "../lib/domain/finance/amounts"

/**
 * Phase 59 plan 02 — DVER-02's CONSOLIDATED no-double-count proof.
 *
 * ONE fixture, ONE production write path, ONE run. The property already exists
 * in pieces across earlier suites (56-05's delta identity sits on a DIFFERENT
 * fixture at `convex/donation-income.handlers.test.ts:422`; the scope-gated
 * attribution property is `convex/donation-attribution.handlers.test.ts:363`;
 * the allocation-free byte-identity regression is `:568`; the order
 * ledger/reconciliation agreement is
 * `convex/canonical-order-balance.handlers.test.ts:307`; the WRITE half of
 * DACC-03 — no allocation path touches a payment row — is
 * `convex/donation-allocation.handlers.test.ts:3814`). None of that is
 * duplicated here. What DVER-02 asks for and this file delivers is the whole
 * identity set on ONE fixture: the allocated portion counts ONCE against the
 * attendee, the unallocated remainder counts ONCE as event-level donation
 * income, and the donation's FACE is never counted twice anywhere.
 *
 * THE FIXTURE (exact integers, EUR minor units):
 *   - Order A: Maria due 12_000 + Tom due 8_000 => due 20_000, NO payment.
 *   - Order B: Solo due 5_000 => due 5_000, NO payment.
 *   - Order C: Control due 4_000 with a 4_000 APPLIED payment — the
 *     payment-only CONTROL whose `appliedPaymentMinor` must keep meaning what
 *     it always did, and whose bridge contribution is exactly ZERO.
 *   - Donation D1 = 20_000, allocated in ONE `allocateDonation` submission:
 *     6_000 `event_charges` to Maria + 5_000 `whole_order` naming Solo.
 *     => allocated 11_000, remainder 9_000.
 *   - Donation D2 = 7_000, never allocated.
 *
 * EXPECTED FIGURES (every one read from an owner, stated in comments beside
 * each assertion):
 *   - Order A: due 20_000 / paid 6_000 / outstanding 14_000, and
 *     `allocationCreditMinor` 0 — that field is `whole_order`-ONLY, so A's
 *     `event_charges` credit is correctly invisible to it.
 *   - Order B: due 5_000 / paid 5_000 / outstanding 0, allocationCredit 5_000.
 *   - Order C: due 4_000 / paid 4_000 / outstanding 0, appliedPayment 4_000.
 *   - Income: 11_000 allocated + 16_000 unallocated remainder over 27_000 of
 *     faces, each counted once.
 *   - Bridge: Σ(paid − appliedPayment) over A, B, C = 6_000 + 5_000 + 0 =
 *     11_000 === income.totals.allocatedMinor.
 *
 * Every paid/outstanding figure comes from `loadCanonicalOrderBalances` or
 * `loadOrderPaymentAttributions` — the TWO canonical owners. The only local
 * arithmetic is a subtraction between two owner reads (the bridge identity and
 * the `Σ attendee === order` invariant). No figure is locally re-derived and
 * no stored value is compared against a locally computed number.
 *
 * No `donationAllocations` row is hand-inserted: the allocations are written
 * through the production mutation, so the reads are proven against real
 * writes, never against a fixture this test authored.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-no-double-count",
  name: "Admin",
  email: "admin@example.com",
}

const ALLOCATION_KEY_D1 = "donation-no-double-count-d1"

/** Distinct `paidAt` values so every ordering consumer stays deterministic. */
const PAID_AT = {
  donationD1: BASE_AT,
  donationD2: BASE_AT + 1_000,
} as const

type TestConvex = TestConvexForDataModel<GenericDataModel>

type FinanceLoaderCtx = Parameters<typeof loadCanonicalOrderBalances>[0]["ctx"]

type ManualAllocationRow = {
  attendeeId: Id<"orderAttendees">
  amountMinor: number
  scope: "event_charges" | "whole_order"
}

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualAllocationRow[]) {
  return { method: "manual" as const, rows }
}

// ---------------------------------------------------------------------------
// Seeding helpers (file-local and minimal, same style as
// convex/donation-income.handlers.test.ts). Donations are ALWAYS created
// through the production `payments.createStandaloneDonation` mutation.
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
  input: { eventId: Id<"events">; amountMinor: number; paidAt: number }
): Promise<Id<"payments">> {
  return client.mutation(api.payments.createStandaloneDonation, {
    eventId: input.eventId,
    payerName: "Donor",
    amountMinor: input.amountMinor,
    paidAt: input.paidAt,
    source: "cash",
  })
}

type NoDoubleCountFixture = {
  eventId: Id<"events">
  orderAId: Id<"orders">
  mariaId: Id<"orderAttendees">
  tomId: Id<"orderAttendees">
  orderBId: Id<"orders">
  soloId: Id<"orderAttendees">
  orderCId: Id<"orders">
  controlId: Id<"orderAttendees">
  donationD1Id: Id<"payments">
  donationD2Id: Id<"payments">
}

/**
 * Seeds the plan's fixture WITHOUT any allocations, so the caller captures the
 * canonical baseline before `allocateDonation` moves it.
 */
async function seedNoDoubleCountFixture(
  t: TestConvex,
  authed: TestConvex
): Promise<NoDoubleCountFixture> {
  const eventId = await seedEvent(t, "donation-no-double-count")

  // Order A — due 12_000 + 8_000 = 20_000, NO payment: the allocation credit
  // is the only thing that can move this order.
  const maria = await createAttendee(t, eventId, {
    attendeeKey: "ndc-maria",
    name: "Maria",
    ticketPriceMinor: 12_000,
  })
  const tom = await createAttendee(t, eventId, {
    orderId: maria.orderId,
    attendeeKey: "ndc-tom",
    name: "Tom",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })

  // Order B — due 5_000, NO payment.
  const solo = await createAttendee(t, eventId, {
    attendeeKey: "ndc-solo",
    name: "Solo",
    ticketPriceMinor: 5_000,
  })

  // Order C — the PAYMENT-ONLY control: due 4_000 with a 4_000 applied
  // payment. Its bridge contribution is exactly zero, so the bridge identity
  // is not trivially satisfied by donation credit.
  const control = await createAttendee(t, eventId, {
    attendeeKey: "ndc-control",
    name: "Control",
    ticketPriceMinor: 4_000,
  })
  await createAppliedPayment(t, eventId, control.orderId, 4_000)

  // D1 and D2: the production standalone-donation path (never hand-inserted).
  const donationD1Id = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 20_000,
    paidAt: PAID_AT.donationD1,
  })
  const donationD2Id = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 7_000,
    paidAt: PAID_AT.donationD2,
  })

  return {
    eventId,
    orderAId: maria.orderId,
    mariaId: maria.attendeeId,
    tomId: tom.attendeeId,
    orderBId: solo.orderId,
    soloId: solo.attendeeId,
    orderCId: control.orderId,
    controlId: control.attendeeId,
    donationD1Id,
    donationD2Id,
  }
}

// ---------------------------------------------------------------------------
// Read helpers — every figure comes from an owner, projected into plain data
// ---------------------------------------------------------------------------

type OrderBalanceProjection = {
  amountDueMinor: number
  appliedPaymentMinor: number
  allocationCreditMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  donationAmountMinor: number
  appliedAmountMinor: number
}

/** `loadCanonicalOrderBalances` — the ONE order-level balance owner. */
async function readBalances(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, OrderBalanceProjection>> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const balances = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders: orderIds.map((_id) => ({ _id })),
    })

    const projections: Record<string, OrderBalanceProjection> = {}
    for (const [orderKey, balance] of balances) {
      projections[orderKey] = {
        amountDueMinor: balance.amountDueMinor,
        appliedPaymentMinor: balance.appliedPaymentMinor,
        allocationCreditMinor: balance.allocationCreditMinor,
        paidAmountMinor: balance.paidAmountMinor,
        outstandingAmountMinor: balance.outstandingAmountMinor,
        donationAmountMinor: balance.donationAmountMinor,
        appliedAmountMinor: balance.appliedAmountMinor,
      }
    }
    return projections
  })
}

type AttendeeAttributionProjection = {
  attendeeId: string
  amountDueMinor: number
  paymentShareMinor: number
  targetedCreditMinor: number
  unappliedTargetedCreditMinor: number
  poolShareMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
}

type OrderAttributionProjection = {
  appliedPaymentsMinor: number
  targetedCreditMinor: number
  wholeOrderCreditMinor: number
  orderPoolMinor: number
  unattributedTargetedCreditMinor: number
  orderPaidAmountMinor: number
  orderOutstandingAmountMinor: number
  byAttendeeId: AttendeeAttributionProjection[]
}

/** `loadOrderPaymentAttributions` — the ONE per-attendee attribution owner. */
async function readAttributions(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, OrderAttributionProjection>> {
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

    const projections: Record<string, OrderAttributionProjection> = {}
    for (const [orderKey, attribution] of attributions) {
      projections[orderKey] = {
        appliedPaymentsMinor: attribution.appliedPaymentsMinor,
        targetedCreditMinor: attribution.targetedCreditMinor,
        wholeOrderCreditMinor: attribution.wholeOrderCreditMinor,
        orderPoolMinor: attribution.orderPoolMinor,
        unattributedTargetedCreditMinor:
          attribution.unattributedTargetedCreditMinor,
        orderPaidAmountMinor: attribution.orderPaidAmountMinor,
        orderOutstandingAmountMinor: attribution.orderOutstandingAmountMinor,
        byAttendeeId: Array.from(attribution.byAttendeeId.values()).map(
          (row) => ({
            attendeeId: row.attendeeId,
            amountDueMinor: row.amountDueMinor,
            paymentShareMinor: row.paymentShareMinor,
            targetedCreditMinor: row.targetedCreditMinor,
            unappliedTargetedCreditMinor: row.unappliedTargetedCreditMinor,
            poolShareMinor: row.poolShareMinor,
            paidAmountMinor: row.paidAmountMinor,
            outstandingAmountMinor: row.outstandingAmountMinor,
          })
        ),
      }
    }
    return projections
  })
}

/** Fails loudly on a missing key — never a `?? 0` default. */
function balanceFor(
  balances: Record<string, OrderBalanceProjection>,
  orderId: Id<"orders">
): OrderBalanceProjection {
  const balance = balances[String(orderId)]
  if (!balance) {
    throw new Error(
      `order ${String(orderId)} is missing from loadCanonicalOrderBalances`
    )
  }
  return balance
}

/** Fails loudly on a missing key — never a `?? 0` default. */
function attributionFor(
  attributions: Record<string, OrderAttributionProjection>,
  orderId: Id<"orders">
): OrderAttributionProjection {
  const attribution = attributions[String(orderId)]
  if (!attribution) {
    throw new Error(
      `order ${String(orderId)} is missing from loadOrderPaymentAttributions`
    )
  }
  return attribution
}

/** Fails loudly on a missing attendee — never a fabricated zero row. */
function attendeeFor(
  attribution: OrderAttributionProjection,
  attendeeId: Id<"orderAttendees">
): AttendeeAttributionProjection {
  const row = attribution.byAttendeeId.find(
    (entry) => entry.attendeeId === String(attendeeId)
  )
  if (!row) {
    throw new Error(
      `attendee ${String(attendeeId)} is missing from the attribution`
    )
  }
  return row
}

/** `getEventDonationIncome` — the ONE event donation-income projection. */
async function readIncome(client: TestConvex, eventId: Id<"events">) {
  return client.query(api.donations.getEventDonationIncome, { eventId })
}

/** Fails loudly on a missing donation — never a fabricated zero row. */
function incomeRowFor(
  income: Awaited<ReturnType<typeof readIncome>>,
  donationId: Id<"payments">
) {
  const row = income.donations.find(
    (entry) => String(entry.donationId) === String(donationId)
  )
  if (!row) {
    throw new Error(
      `donation ${String(donationId)} is missing from getEventDonationIncome`
    )
  }
  return row
}

// ---------------------------------------------------------------------------
// DVER-02: the consolidated once-each proof, on ONE fixture in ONE run
// ---------------------------------------------------------------------------

test("DVER-02: a standalone donation is counted once — allocated against the attendee, remainder as event income", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedNoDoubleCountFixture(t, authed)
  const orderIds = [fixture.orderAId, fixture.orderBId, fixture.orderCId]

  // --- Pre-allocation baseline --------------------------------------------
  // Captured BEFORE the write, so every "after" figure is shown to have MOVED
  // rather than restated. The baseline is itself a set of owner reads.
  const balancesBefore = await readBalances(t, orderIds)
  const incomeBefore = await readIncome(authed, fixture.eventId)

  // The fixture prices as stated — a zero-due order would make every
  // downstream assertion vacuous.
  expect(balanceFor(balancesBefore, fixture.orderAId)).toEqual({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 20_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 0,
  })
  expect(balanceFor(balancesBefore, fixture.orderBId)).toEqual({
    amountDueMinor: 5_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 5_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 0,
  })
  // The control already carries its REAL applied payment, before any
  // allocation exists.
  expect(balanceFor(balancesBefore, fixture.orderCId)).toEqual({
    amountDueMinor: 4_000,
    appliedPaymentMinor: 4_000,
    allocationCreditMinor: 0,
    paidAmountMinor: 4_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 4_000,
  })

  // Before the write, income is a PURE remainder: nothing is allocated.
  expect(incomeBefore.totals).toEqual({
    donationCount: 2,
    donationsMinor: 27_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 27_000,
  })
  expect(incomeRowFor(incomeBefore, fixture.donationD1Id)).toMatchObject({
    donationAmountMinor: 20_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 20_000,
    allocationCount: 0,
  })
  expect(incomeRowFor(incomeBefore, fixture.donationD2Id)).toMatchObject({
    donationAmountMinor: 7_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 7_000,
    allocationCount: 0,
  })

  // --- The production write path ------------------------------------------
  // 6_000 `event_charges` to Maria + 5_000 `whole_order` naming Solo: one
  // submission, one frozen result, 11_000 of the 20_000 face allocated.
  const written = await authed.mutation(api.donations.allocateDonation, {
    donationId: fixture.donationD1Id,
    eventId: fixture.eventId,
    request: manualRequest([
      {
        attendeeId: fixture.mariaId,
        amountMinor: 6_000,
        scope: "event_charges",
      },
      { attendeeId: fixture.soloId, amountMinor: 5_000, scope: "whole_order" },
    ]),
    idempotencyKey: ALLOCATION_KEY_D1,
  })
  expect(written).toMatchObject({
    donationId: fixture.donationD1Id,
    allocatedTotalMinor: 11_000,
    remainingMinor: 9_000,
  })

  // --- Non-vacuous: the write is behind us ---------------------------------
  // The baseline is asserted (not merely read), so every "after" figure below
  // is a MOVE from the pre-state rather than a restatement of it.
  const balancesAfter = await readBalances(t, orderIds)
  const attributionsAfter = await readAttributions(t, orderIds)
  const income = await readIncome(authed, fixture.eventId)

  expect(balanceFor(balancesBefore, fixture.orderAId).paidAmountMinor).toBe(0)
  expect(incomeBefore.totals.allocatedMinor).toBe(0)
  expect(incomeBefore.totals.unallocatedRemainderMinor).toBe(27_000)

  // =========================================================================
  // (1) ORDER SIDE — the allocated portion counts ONCE, and it is EXACTLY the
  // allocation. Every figure below is `loadCanonicalOrderBalances`' own output.
  // =========================================================================

  // Order A — due 20_000 / paid 6_000 / outstanding 14_000. The
  // `allocationCreditMinor` 0 is CORRECT AND LOAD-BEARING: that field is
  // `whole_order`-ONLY (STATE 56-03/56-05), and A's credit is `event_charges`,
  // so a future widening of the field's meaning must be a conscious decision
  // that fails here first.
  expect(balanceFor(balancesAfter, fixture.orderAId)).toEqual({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 6_000,
    outstandingAmountMinor: 14_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 6_000,
  })

  // Order B — due 5_000 / paid 5_000 / outstanding 0, with the 5_000
  // `whole_order` credit visible in `allocationCreditMinor`.
  expect(balanceFor(balancesAfter, fixture.orderBId)).toEqual({
    amountDueMinor: 5_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 5_000,
    paidAmountMinor: 5_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 5_000,
  })

  // Order C — the payment-only CONTROL, proving `appliedPaymentMinor` still
  // means what it always did: the real 4_000 payment alone.
  expect(balanceFor(balancesAfter, fixture.orderCId)).toEqual({
    amountDueMinor: 4_000,
    appliedPaymentMinor: 4_000,
    allocationCreditMinor: 0,
    paidAmountMinor: 4_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 4_000,
  })

  // THE BRIDGE: Σ(paidAmountMinor − appliedPaymentMinor) over the event's
  // orders === the income projection's allocated total. The subtraction is
  // between two OWNER reads, never a locally derived balance.
  //   6_000 + 5_000 + 0 = 11_000, and the control contributes exactly 0.
  const bridgeTotal = orderIds.reduce((sum, orderId) => {
    const balance = balanceFor(balancesAfter, orderId)
    return sum + (balance.paidAmountMinor - balance.appliedPaymentMinor)
  }, 0)
  expect(bridgeTotal).toBe(11_000)
  expect(bridgeTotal).toBe(income.totals.allocatedMinor)

  // =========================================================================
  // (2) PER-ATTENDEE — the invariant that makes "once" observable. Every
  // figure is `loadOrderPaymentAttributions`' own output.
  // =========================================================================

  const attributionA = attributionFor(attributionsAfter, fixture.orderAId)
  const attributionB = attributionFor(attributionsAfter, fixture.orderBId)

  // Order A's order-level credit composition: the 6_000 is TARGETED
  // (`event_charges`), the pool holds no whole-order credit, and nothing was
  // reported unapplied (the submission is inside every ceiling).
  expect(attributionA).toMatchObject({
    appliedPaymentsMinor: 0,
    targetedCreditMinor: 6_000,
    wholeOrderCreditMinor: 0,
    orderPoolMinor: 0,
    unattributedTargetedCreditMinor: 0,
  })

  // Maria: due 12_000, targeted credit exactly the recorded 6_000 — below her
  // attributable outstanding (12_000 − 0), so no cap and no excess — with no
  // payment share and no pool share.
  expect(attendeeFor(attributionA, fixture.mariaId)).toEqual({
    attendeeId: String(fixture.mariaId),
    amountDueMinor: 12_000,
    paymentShareMinor: 0,
    targetedCreditMinor: 6_000,
    unappliedTargetedCreditMinor: 0,
    poolShareMinor: 0,
    paidAmountMinor: 6_000,
    outstandingAmountMinor: 6_000,
  })

  // Tom: nothing was allocated to him. The credit must not leak across the
  // order's attendees (the defect a due-weight fold would cause).
  expect(attendeeFor(attributionA, fixture.tomId)).toEqual({
    attendeeId: String(fixture.tomId),
    amountDueMinor: 8_000,
    paymentShareMinor: 0,
    targetedCreditMinor: 0,
    unappliedTargetedCreditMinor: 0,
    poolShareMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 8_000,
  })

  // Order B: the whole_order credit joins the order pool and, on a
  // single-attendee order, lands exactly on that attendee.
  expect(attributionB).toMatchObject({
    appliedPaymentsMinor: 0,
    targetedCreditMinor: 0,
    wholeOrderCreditMinor: 5_000,
    orderPoolMinor: 5_000,
    unattributedTargetedCreditMinor: 0,
  })
  expect(attendeeFor(attributionB, fixture.soloId)).toEqual({
    attendeeId: String(fixture.soloId),
    amountDueMinor: 5_000,
    paymentShareMinor: 0,
    targetedCreditMinor: 0,
    unappliedTargetedCreditMinor: 0,
    poolShareMinor: 5_000,
    paidAmountMinor: 5_000,
    outstandingAmountMinor: 0,
  })

  // Σ per-attendee paid === order paid, and Σ per-attendee outstanding ===
  // order outstanding, for BOTH allocation-bearing orders. Both sums are over
  // the owner's own rows — an invariant check, not a money derivation.
  const sumPaidA = attributionA.byAttendeeId.reduce(
    (sum, row) => sum + row.paidAmountMinor,
    0
  )
  const sumOutstandingA = attributionA.byAttendeeId.reduce(
    (sum, row) => sum + row.outstandingAmountMinor,
    0
  )
  expect(sumPaidA).toBe(attributionA.orderPaidAmountMinor)
  expect(sumPaidA).toBe(6_000)
  expect(sumOutstandingA).toBe(attributionA.orderOutstandingAmountMinor)
  expect(sumOutstandingA).toBe(14_000)

  const sumPaidB = attributionB.byAttendeeId.reduce(
    (sum, row) => sum + row.paidAmountMinor,
    0
  )
  expect(sumPaidB).toBe(attributionB.orderPaidAmountMinor)
  expect(sumPaidB).toBe(5_000)

  // The order-level echo for A and B: order paid === applied payments +
  // targeted credit + whole-order credit. The terms are the OWNER's own
  // fields, so this is the invariant check that no credit went missing or
  // appeared twice, never a second owner of the figure.
  expect(attributionA.orderPaidAmountMinor).toBe(
    attributionA.appliedPaymentsMinor +
      attributionA.targetedCreditMinor +
      attributionA.wholeOrderCreditMinor
  )
  expect(attributionA.orderPaidAmountMinor).toBe(6_000)
  expect(attributionB.orderPaidAmountMinor).toBe(
    attributionB.appliedPaymentsMinor +
      attributionB.targetedCreditMinor +
      attributionB.wholeOrderCreditMinor
  )
  expect(attributionB.orderPaidAmountMinor).toBe(5_000)

  // =========================================================================
  // (3) INCOME SIDE — the remainder counts ONCE, and each donation's
  // composition is exact.
  // =========================================================================

  expect(income.donations).toHaveLength(2)

  // D1: 20_000 = 11_000 allocated + 9_000 remainder, from two recorded rows.
  expect(incomeRowFor(income, fixture.donationD1Id)).toMatchObject({
    donationAmountMinor: 20_000,
    allocatedMinor: 11_000,
    unallocatedRemainderMinor: 9_000,
    allocationCount: 2,
  })
  // D2: 7_000 = 0 allocated + 7_000 remainder, no recorded rows.
  expect(incomeRowFor(income, fixture.donationD2Id)).toMatchObject({
    donationAmountMinor: 7_000,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 7_000,
    allocationCount: 0,
  })

  expect(income.totals).toEqual({
    donationCount: 2,
    donationsMinor: 27_000,
    allocatedMinor: 11_000,
    unallocatedRemainderMinor: 16_000,
  })

  // Every row's composition is exact...
  for (const row of income.donations) {
    expect(row.allocatedMinor + row.unallocatedRemainderMinor).toBe(
      row.donationAmountMinor
    )
  }
  // ...the totals ARE the row sums (no second accounting anywhere), and the
  // owner's documented identity holds: faces = allocated + remainder.
  const summedAllocated = income.donations.reduce(
    (sum, row) => sum + row.allocatedMinor,
    0
  )
  const summedRemainder = income.donations.reduce(
    (sum, row) => sum + row.unallocatedRemainderMinor,
    0
  )
  expect(summedAllocated).toBe(income.totals.allocatedMinor)
  expect(summedRemainder).toBe(income.totals.unallocatedRemainderMinor)
  expect(income.totals.donationsMinor).toBe(
    income.totals.allocatedMinor + income.totals.unallocatedRemainderMinor
  )

  // THE FACE-NEVER-DOUBLED NEGATIVES. Each `not.toBe` names the wrong
  // implementation it would catch:
  //   - income reported as the FACES: a build that counted the face in income
  //     as well would read 27_000 of remainder (= donationsMinor) instead of
  //     the 16_000 remainder.
  expect(income.totals.unallocatedRemainderMinor).not.toBe(
    income.totals.donationsMinor
  )
  //   - income reported as allocated + faces: the same build with the
  //     allocation left in place would read 38_000 = 11_000 + 27_000.
  expect(income.totals.unallocatedRemainderMinor).not.toBe(
    income.totals.allocatedMinor + income.totals.donationsMinor
  )
  //   - the FACES counted against the orders: 27_000 of order credit instead
  //     of the 11_000 the allocation actually wrote.
  expect(bridgeTotal).not.toBe(income.totals.donationsMinor)
  //   - D1's FACE counted against its order: 20_000 of credit instead of the
  //     11_000 allocated across the two orders.
  expect(bridgeTotal).not.toBe(20_000)

  // =========================================================================
  // (4) THE PREDICATE AND ROW-LEVEL NEGATIVES (the READ half of DACC-03; the
  // WRITE half — no allocation path touches a payment row — is pinned at
  // convex/donation-allocation.handlers.test.ts:3814).
  // =========================================================================

  const rawD1 = await t.query(async (ctx) =>
    ctx.db.get("payments", fixture.donationD1Id)
  )
  const rawD2 = await t.query(async (ctx) =>
    ctx.db.get("payments", fixture.donationD2Id)
  )
  if (!rawD1 || !rawD2) {
    throw new Error("a standalone donation row is missing after allocation")
  }

  // The donation's own row stays event-scoped and standalone after the
  // allocation: it was never assigned to an order.
  expect(rawD1.orderId).toBeUndefined()
  expect(rawD1.status).toBe("donation")
  expect(rawD1.donationKind).toBe("standalone")
  expect(rawD2.orderId).toBeUndefined()
  expect(rawD2.status).toBe("donation")
  expect(rawD2.donationKind).toBe("standalone")

  // ...which is exactly WHY orders A and B show `appliedPaymentMinor` 0: the
  // `isOrderAppliedPayment` predicate excludes a standalone donation, so the
  // credit can only arrive through the allocation layer above.
  expect(isOrderAppliedPayment(rawD1)).toBe(false)
  expect(isOrderAppliedPayment(rawD2)).toBe(false)

  // Credit never manufactures an overpayment: `deriveBalanceAmounts`'
  // overpayment class stays 0 on every order because the capacity bound keeps
  // credit inside the order's own outstanding.
  expect(balanceFor(balancesAfter, fixture.orderAId).donationAmountMinor).toBe(
    0
  )
  expect(balanceFor(balancesAfter, fixture.orderBId).donationAmountMinor).toBe(
    0
  )
  expect(balanceFor(balancesAfter, fixture.orderCId).donationAmountMinor).toBe(
    0
  )

  // =========================================================================
  // (5) IDEMPOTENCE — re-deriving every figure twice returns deeply equal
  // values (the 56-05 property re-asserted on this fixture). No total grows.
  // =========================================================================

  const balancesSecond = await readBalances(t, orderIds)
  const attributionsSecond = await readAttributions(t, orderIds)
  const incomeSecond = await readIncome(authed, fixture.eventId)

  expect(balancesSecond).toEqual(balancesAfter)
  expect(attributionsSecond).toEqual(attributionsAfter)
  expect(incomeSecond).toEqual(income)
})
