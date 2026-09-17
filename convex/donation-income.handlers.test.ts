/// <reference types="vite/client" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadRecordedAllocatedMinorByDonationIds } from "./donations"
import { loadCanonicalOrderBalances } from "./finance"
import { deriveEventDonationIncome } from "../lib/domain/finance/donation-income"
import { deriveBalanceAmounts } from "../lib/domain/finance/amounts"

/**
 * Phase 56 plan 05 handler tracer — DACC-02's second half.
 *
 * One event carries the plan's fixture:
 *   (a) a 100 donation allocated 60 + 40 `event_charges` across two attendees
 *       of the target order (fully allocated, two rows);
 *   (b) a 250 donation allocated 100 as a single `whole_order` row naming a
 *       third attendee of the SAME order (partially allocated, remainder 150);
 *   (c) a 75 donation with no allocations;
 *   (d) an overpaid control order (due 100, 150 applied payment) whose
 *       `deriveBalanceAmounts` `donationAmountMinor` is 50 — the
 *       ORDER-OVERPAYMENT class control.
 * A second event carries one 50 allocation-free donation so the global
 * `getStandaloneDonations` branches have to prove their cross-event reach.
 *
 * Both allocations are written through the production `donations.allocateDonation`
 * mutation and every donation through `payments.createStandaloneDonation`, so
 * the reads are proven against real writes, never against hand-inserted rows.
 *
 * Figures are MINOR units (425 = €4.25). The plan's integers are used verbatim.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-income",
  name: "Admin",
  email: "admin@example.com",
}

const ALLOCATION_KEY_A = "donation-income-allocation-a"
const ALLOCATION_KEY_B = "donation-income-allocation-b"

/** Distinct `paidAt` values so every range branch narrows deterministically. */
const PAID_AT = {
  donationA: BASE_AT,
  donationB: BASE_AT + 1_000,
  donationC: BASE_AT + 2_000,
  secondEventDonation: BASE_AT + 3_000,
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
// convex/donation-attribution.handlers.test.ts)
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

type IncomeFixture = {
  eventId: Id<"events">
  secondEventId: Id<"events">
  orderId: Id<"orders">
  attendee1Id: Id<"orderAttendees">
  attendee2Id: Id<"orderAttendees">
  attendee3Id: Id<"orderAttendees">
  controlOrderId: Id<"orders">
  controlAttendeeId: Id<"orderAttendees">
  donationAId: Id<"payments">
  donationBId: Id<"payments">
  donationCId: Id<"payments">
  secondEventDonationId: Id<"payments">
}

/**
 * Seeds the plan's fixture WITHOUT any allocations, so a caller can capture the
 * canonical baseline before `allocateIncomeFixture` moves it.
 */
async function seedIncomeBase(
  t: TestConvex,
  authed: TestConvex
): Promise<IncomeFixture> {
  const eventId = await seedEvent(t, "donation-income-event")
  const secondEventId = await seedEvent(t, "donation-income-second-event")

  // The allocation target order: due 6_000 + 4_000 + 10_000 = 20_000 with no
  // applied payments, so every allocated minor unit is visible as credit.
  const first = await createAttendee(t, eventId, {
    attendeeKey: "income-a1",
    name: "Attendee A1",
    ticketPriceMinor: 6_000,
  })
  const second = await createAttendee(t, eventId, {
    orderId: first.orderId,
    attendeeKey: "income-a2",
    name: "Attendee A2",
    ticketPriceMinor: 4_000,
    sortOrder: 1,
  })
  const third = await createAttendee(t, eventId, {
    orderId: first.orderId,
    attendeeKey: "income-a3",
    name: "Attendee A3",
    ticketPriceMinor: 10_000,
    sortOrder: 2,
  })

  // The overpayment control: due 100 with a 150 applied payment, so
  // `deriveBalanceAmounts` reports `donationAmountMinor` 50 and the order has
  // zero writable capacity (no allocation can land on it).
  const control = await createAttendee(t, eventId, {
    attendeeKey: "income-control",
    name: "Control attendee",
    ticketPriceMinor: 100,
  })
  await createAppliedPayment(t, eventId, control.orderId, 150)

  const donationAId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 100,
    paidAt: PAID_AT.donationA,
  })
  const donationBId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 250,
    paidAt: PAID_AT.donationB,
  })
  const donationCId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 75,
    paidAt: PAID_AT.donationC,
  })
  const secondEventDonationId = await createStandaloneDonation(authed, {
    eventId: secondEventId,
    amountMinor: 50,
    paidAt: PAID_AT.secondEventDonation,
  })

  return {
    eventId,
    secondEventId,
    orderId: first.orderId,
    attendee1Id: first.attendeeId,
    attendee2Id: second.attendeeId,
    attendee3Id: third.attendeeId,
    controlOrderId: control.orderId,
    controlAttendeeId: control.attendeeId,
    donationAId,
    donationBId,
    donationCId,
    secondEventDonationId,
  }
}

/** Fixture (a) + (b): the 60/40 `event_charges` pair and the 100 `whole_order` row. */
async function allocateIncomeFixture(
  authed: TestConvex,
  fixture: IncomeFixture
): Promise<void> {
  await authed.mutation(api.donations.allocateDonation, {
    donationId: fixture.donationAId,
    eventId: fixture.eventId,
    request: manualRequest([
      {
        attendeeId: fixture.attendee1Id,
        amountMinor: 60,
        scope: "event_charges",
      },
      {
        attendeeId: fixture.attendee2Id,
        amountMinor: 40,
        scope: "event_charges",
      },
    ]),
    idempotencyKey: ALLOCATION_KEY_A,
  })

  await authed.mutation(api.donations.allocateDonation, {
    donationId: fixture.donationBId,
    eventId: fixture.eventId,
    request: manualRequest([
      { attendeeId: fixture.attendee3Id, amountMinor: 100, scope: "whole_order" },
    ]),
    idempotencyKey: ALLOCATION_KEY_B,
  })
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

type BalanceProjection = {
  amountDueMinor: number
  appliedPaymentMinor: number
  allocationCreditMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  donationAmountMinor: number
}

async function readBalances(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, BalanceProjection>> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const balances = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders: orderIds.map((_id) => ({ _id })),
    })

    const projections: Record<string, BalanceProjection> = {}
    for (const [orderKey, balance] of balances) {
      projections[orderKey] = {
        amountDueMinor: balance.amountDueMinor,
        appliedPaymentMinor: balance.appliedPaymentMinor,
        allocationCreditMinor: balance.allocationCreditMinor,
        paidAmountMinor: balance.paidAmountMinor,
        outstandingAmountMinor: balance.outstandingAmountMinor,
        donationAmountMinor: balance.donationAmountMinor,
      }
    }
    return projections
  })
}

type IncomeProjectionRow = {
  donationId: string
  donationAmountMinor: number
  allocatedMinor: number
  unallocatedRemainderMinor: number
}

async function readBranch(
  client: TestConvex,
  args: { eventId?: Id<"events">; from?: number; to?: number }
) {
  return client.query(api.payments.getStandaloneDonations, {
    ...args,
    paginationOpts: { numItems: 50, cursor: null },
  })
}

type StandaloneDonationRow = {
  _id: Id<"payments">
  amountMinor: number
  paidAt: number
  allocatedMinor?: number
  unallocatedRemainderMinor?: number
}

/**
 * Every returned row must carry BOTH composition fields as numbers and they
 * must equal the income projection's figures for the same donation. A row
 * missing the fields reads `undefined` and fails here — the point of scanning
 * every branch.
 */
function expectEnrichedComposition(
  rows: StandaloneDonationRow[],
  incomeByDonationId: ReadonlyMap<string, IncomeProjectionRow>
) {
  for (const row of rows) {
    const income = incomeByDonationId.get(String(row._id))
    expect(
      income,
      `income projection is missing donation ${String(row._id)}`
    ).toBeDefined()
    expect(row.amountMinor).toBe(income?.donationAmountMinor)
    expect(typeof row.allocatedMinor).toBe("number")
    expect(typeof row.unallocatedRemainderMinor).toBe("number")
    expect(row.allocatedMinor).toBe(income?.allocatedMinor)
    expect(row.unallocatedRemainderMinor).toBe(
      income?.unallocatedRemainderMinor
    )
  }
}

function expectDescendingPaidAt(rows: StandaloneDonationRow[]) {
  const paidAtValues = rows.map((row) => row.paidAt)
  expect(paidAtValues).toEqual(
    [...paidAtValues].sort((left, right) => right - left)
  )
}

// ---------------------------------------------------------------------------
// Cases 1-2: the composition, the event total and the no-double-count bridge
// ---------------------------------------------------------------------------

test("cases 1-2: per-donation composition, the event total and the no-double-count bridge", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedIncomeBase(t, authed)

  // Baseline BEFORE both allocations: there is no credit to report yet.
  const before = await readBalances(t, [fixture.orderId, fixture.controlOrderId])
  expect(before[String(fixture.orderId)].paidAmountMinor).toBe(0)
  expect(before[String(fixture.orderId)].allocationCreditMinor).toBe(0)

  await allocateIncomeFixture(authed, fixture)

  // --- Case 1: per-donation composition -----------------------------------
  const income = await authed.query(api.donations.getEventDonationIncome, {
    eventId: fixture.eventId,
  })
  expect(income.eventId).toBe(fixture.eventId)
  expect(income.donations).toHaveLength(3)

  const byDonationId = new Map(
    income.donations.map((row) => [String(row.donationId), row])
  )

  // (a) 100 = 60 + 40, fully allocated.
  expect(byDonationId.get(String(fixture.donationAId))).toMatchObject({
    donationAmountMinor: 100,
    allocatedMinor: 100,
    unallocatedRemainderMinor: 0,
    allocationCount: 2,
  })

  // (b) 250 = 100 whole_order + 150 remainder.
  expect(byDonationId.get(String(fixture.donationBId))).toMatchObject({
    donationAmountMinor: 250,
    allocatedMinor: 100,
    unallocatedRemainderMinor: 150,
    allocationCount: 1,
    payerName: "Donor",
    paidAt: PAID_AT.donationB,
    source: "cash",
  })

  // (c) 75 with no allocations at all.
  expect(byDonationId.get(String(fixture.donationCId))).toMatchObject({
    donationAmountMinor: 75,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 75,
    allocationCount: 0,
  })

  // --- Case 2: event total and the exact no-double-count identity ---------
  expect(income.totals).toEqual({
    donationCount: 3,
    donationsMinor: 425,
    allocatedMinor: 200,
    unallocatedRemainderMinor: 225,
  })
  expect(income.totals.donationsMinor).toBe(
    income.totals.allocatedMinor + income.totals.unallocatedRemainderMinor
  )

  // The bridge to the order side: fixture (a)'s rows are `event_charges`
  // (60 + 40) and fixture (b)'s row is `whole_order` (100), all on ONE order.
  // The credit the canonical balances gained is exactly the allocated total —
  // both scopes together, no minor unit in both totals.
  const after = await readBalances(t, [fixture.orderId, fixture.controlOrderId])
  const incomeOrder = after[String(fixture.orderId)]
  expect(incomeOrder.appliedPaymentMinor).toBe(0)
  expect(incomeOrder.paidAmountMinor).toBe(200)
  expect(incomeOrder.outstandingAmountMinor).toBe(19_800)
  expect(incomeOrder.donationAmountMinor).toBe(0)

  const creditGainedMinor = Object.values(after).reduce(
    (sum, balance) =>
      sum + (balance.paidAmountMinor - balance.appliedPaymentMinor),
    0
  )
  expect(creditGainedMinor).toBe(200)
  expect(creditGainedMinor).toBe(income.totals.allocatedMinor)

  // (ii) `allocationCreditMinor` is the WHOLE_ORDER-only field: 100 for this
  // order — NOT the 200 the delta identity carries (60 + 40 event_charges plus
  // 100 whole_order). Both assertions pin the field's scope.
  expect(incomeOrder.allocationCreditMinor).toBe(100)
  expect(incomeOrder.allocationCreditMinor).not.toBe(200)
})

// ---------------------------------------------------------------------------
// Case 3: disjointness from the order-overpayment class
// ---------------------------------------------------------------------------

test("case 3: the income figure is disjoint from the order-overpayment class", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedIncomeBase(t, authed)
  await allocateIncomeFixture(authed, fixture)

  const control = (
    await readBalances(t, [fixture.controlOrderId])
  )[String(fixture.controlOrderId)]

  // The control's positive overpayment figure, asserted through the ONE owner.
  expect(control.amountDueMinor).toBe(100)
  expect(control.paidAmountMinor).toBe(150)
  expect(control.outstandingAmountMinor).toBe(0)
  expect(control.donationAmountMinor).toBe(50)
  expect(control.donationAmountMinor).toBeGreaterThan(0)
  expect(control.donationAmountMinor).toBe(
    deriveBalanceAmounts(control.amountDueMinor, control.paidAmountMinor)
      .donationAmountMinor
  )

  const income = await authed.query(api.donations.getEventDonationIncome, {
    eventId: fixture.eventId,
  })

  // The classes are separate: folding the control's 50 into the income
  // projection would change one of these exact integers.
  expect(income.totals.donationsMinor).toBe(425)
  expect(income.totals.allocatedMinor).toBe(200)
  expect(income.totals.unallocatedRemainderMinor).toBe(225)
  expect(income.totals.unallocatedRemainderMinor).not.toBe(
    225 + control.donationAmountMinor
  )
  expect(income.totals.donationsMinor).not.toBe(
    425 + control.donationAmountMinor
  )

  // Conversely, allocation activity can never change the control's
  // overpayment class. An allocation ON the overpaid order is refused by the
  // capacity bound (its attributable outstanding is zero)...
  await expect(
    authed.mutation(api.donations.allocateDonation, {
      donationId: fixture.donationCId,
      eventId: fixture.eventId,
      request: manualRequest([
        {
          attendeeId: fixture.controlAttendeeId,
          amountMinor: 1,
          scope: "whole_order",
        },
      ]),
      idempotencyKey: "donation-income-control-refused",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")

  const afterRefusal = (
    await readBalances(t, [fixture.controlOrderId])
  )[String(fixture.controlOrderId)]
  expect(afterRefusal.donationAmountMinor).toBe(control.donationAmountMinor)

  // ...and REMOVING an allocation elsewhere moves the income total by exactly
  // the freed 100 while the control's figure stays put.
  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId: fixture.donationBId,
    eventId: fixture.eventId,
    attendeeId: fixture.attendee3Id,
    idempotencyKey: "donation-income-remove-b",
  })

  const incomeAfterRemoval = await authed.query(
    api.donations.getEventDonationIncome,
    { eventId: fixture.eventId }
  )
  expect(incomeAfterRemoval.totals.donationsMinor).toBe(425)
  expect(incomeAfterRemoval.totals.allocatedMinor).toBe(100)
  expect(incomeAfterRemoval.totals.unallocatedRemainderMinor).toBe(325)

  const afterRemoval = (
    await readBalances(t, [fixture.controlOrderId])
  )[String(fixture.controlOrderId)]
  expect(afterRemoval.donationAmountMinor).toBe(control.donationAmountMinor)
  expect(afterRemoval.paidAmountMinor).toBe(control.paidAmountMinor)
})

// ---------------------------------------------------------------------------
// Case 4: donation-list composition — all eight paginate branches
// ---------------------------------------------------------------------------

test("case 4: the donation list carries the composition on all eight paginate branches", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedIncomeBase(t, authed)
  await allocateIncomeFixture(authed, fixture)

  const mainIncome = await authed.query(api.donations.getEventDonationIncome, {
    eventId: fixture.eventId,
  })
  const secondIncome = await authed.query(
    api.donations.getEventDonationIncome,
    { eventId: fixture.secondEventId }
  )
  const incomeByDonationId = new Map<string, IncomeProjectionRow>(
    [...mainIncome.donations, ...secondIncome.donations].map((row) => [
      String(row.donationId),
      {
        donationId: String(row.donationId),
        donationAmountMinor: row.donationAmountMinor,
        allocatedMinor: row.allocatedMinor,
        unallocatedRemainderMinor: row.unallocatedRemainderMinor,
      },
    ])
  )

  // (i) event-scoped, no date range — the all-rows branch.
  const eventAll = await readBranch(authed, { eventId: fixture.eventId })
  const eventRows = eventAll.page as StandaloneDonationRow[]
  expect(eventRows.map((row) => row._id)).toEqual([
    fixture.donationCId,
    fixture.donationBId,
    fixture.donationAId,
  ])
  expect(eventRows).toHaveLength(3)
  expectDescendingPaidAt(eventRows)
  expectEnrichedComposition(eventRows, incomeByDonationId)
  // The pagination envelope survives the enrichment spread.
  expect(eventAll.isDone).toBe(true)
  expect(typeof eventAll.continueCursor).toBe("string")

  // (ii) event-scoped with `from` + `to` around the middle donation's paidAt:
  // the range really narrows (A and C are excluded) and the row is enriched.
  const eventRange = await readBranch(authed, {
    eventId: fixture.eventId,
    from: PAID_AT.donationB,
    to: PAID_AT.donationB,
  })
  expect((eventRange.page as StandaloneDonationRow[]).map((row) => row._id)).toEqual(
    [fixture.donationBId]
  )
  expectEnrichedComposition(
    eventRange.page as StandaloneDonationRow[],
    incomeByDonationId
  )

  // (iii) global branch with NO eventId: the same donations come back with the
  // same figures, plus the second event's donation — all enriched.
  const globalAll = await readBranch(authed, {})
  const globalRows = globalAll.page as StandaloneDonationRow[]
  expect(globalRows.map((row) => row._id)).toEqual([
    fixture.secondEventDonationId,
    fixture.donationCId,
    fixture.donationBId,
    fixture.donationAId,
  ])
  expectDescendingPaidAt(globalRows)
  expectEnrichedComposition(globalRows, incomeByDonationId)

  // The remaining five branches, each asserted enriched and correctly narrowed.
  const eventFrom = await readBranch(authed, {
    eventId: fixture.eventId,
    from: PAID_AT.donationB,
  })
  expect((eventFrom.page as StandaloneDonationRow[]).map((row) => row._id)).toEqual(
    [fixture.donationCId, fixture.donationBId]
  )
  expectEnrichedComposition(
    eventFrom.page as StandaloneDonationRow[],
    incomeByDonationId
  )

  const eventTo = await readBranch(authed, {
    eventId: fixture.eventId,
    to: PAID_AT.donationB,
  })
  expect((eventTo.page as StandaloneDonationRow[]).map((row) => row._id)).toEqual(
    [fixture.donationBId, fixture.donationAId]
  )
  expectEnrichedComposition(
    eventTo.page as StandaloneDonationRow[],
    incomeByDonationId
  )

  const globalRange = await readBranch(authed, {
    from: PAID_AT.donationB,
    to: PAID_AT.donationB,
  })
  expect(
    (globalRange.page as StandaloneDonationRow[]).map((row) => row._id)
  ).toEqual([fixture.donationBId])
  expectEnrichedComposition(
    globalRange.page as StandaloneDonationRow[],
    incomeByDonationId
  )

  const globalFrom = await readBranch(authed, { from: PAID_AT.donationC })
  expect((globalFrom.page as StandaloneDonationRow[]).map((row) => row._id)).toEqual(
    [fixture.secondEventDonationId, fixture.donationCId]
  )
  expectEnrichedComposition(
    globalFrom.page as StandaloneDonationRow[],
    incomeByDonationId
  )

  const globalTo = await readBranch(authed, { to: PAID_AT.donationA })
  expect((globalTo.page as StandaloneDonationRow[]).map((row) => row._id)).toEqual(
    [fixture.donationAId]
  )
  expectEnrichedComposition(
    globalTo.page as StandaloneDonationRow[],
    incomeByDonationId
  )
})

// ---------------------------------------------------------------------------
// Case 5: idempotence — no growth on re-read or re-derivation
// ---------------------------------------------------------------------------

test("case 5: the projection is idempotent and no total grows on re-derivation", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedIncomeBase(t, authed)
  await allocateIncomeFixture(authed, fixture)

  const first = await authed.query(api.donations.getEventDonationIncome, {
    eventId: fixture.eventId,
  })
  const second = await authed.query(api.donations.getEventDonationIncome, {
    eventId: fixture.eventId,
  })
  expect(second).toEqual(first)

  // Re-derive from the SAME stored rows (the shared reader + the pure
  // composer, no query): the totals must be identical, never larger.
  const reDerived = await t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const donationIds = [
      fixture.donationAId,
      fixture.donationBId,
      fixture.donationCId,
    ]
    const summaries = await loadRecordedAllocatedMinorByDonationIds(
      loaderCtx,
      donationIds
    )

    const input = await Promise.all(
      donationIds.map(async (donationId) => {
        const donation = await loaderCtx.db.get("payments", donationId)
        const summary = summaries.get(String(donationId))
        return {
          donationId: String(donationId),
          amountMinor: donation ? donation.amountMinor : 0,
          recordedAllocations: [
            { amountMinor: summary ? summary.allocatedMinor : 0 },
          ],
        }
      })
    )

    return deriveEventDonationIncome({ donations: input }).totals
  })

  expect(reDerived).toEqual(first.totals)
  expect(reDerived.donationCount).toBeLessThanOrEqual(
    first.totals.donationCount
  )
  expect(reDerived.donationsMinor).toBeLessThanOrEqual(
    first.totals.donationsMinor
  )
  expect(reDerived.allocatedMinor).toBeLessThanOrEqual(
    first.totals.allocatedMinor
  )
  expect(reDerived.unallocatedRemainderMinor).toBeLessThanOrEqual(
    first.totals.unallocatedRemainderMinor
  )
})

// ---------------------------------------------------------------------------
// Case 6: the bounded, index-backed read shape
// ---------------------------------------------------------------------------

function sourceSlice(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start, `${startMarker} is missing`).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("\nexport ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

test("case 6: the new reads stay index-backed and bounded, with one enrichment step", () => {
  const donationsSource = readFileSync(
    resolve(import.meta.dirname, "donations.ts"),
    "utf8"
  )
  const paymentsSource = readFileSync(
    resolve(import.meta.dirname, "payments.ts"),
    "utf8"
  )

  // No unbounded collect anywhere in either module.
  expect(donationsSource).not.toContain(".collect(")
  expect(paymentsSource).not.toContain(".collect(")

  // The income query reads the event's donations through the event/payment
  // index with `for await` (bounded by one event, never truncated).
  const incomeSlice = sourceSlice(
    donationsSource,
    "export const getEventDonationIncome"
  )
  expect(incomeSlice).toContain("by_donationKind_and_eventId_and_paidAt")
  expect(incomeSlice).toContain("for await")
  expect(incomeSlice).not.toContain(".collect(")

  // The ONE per-donation allocated-sum reader is index-backed and iterates
  // rather than capping.
  const readerSlice = sourceSlice(
    donationsSource,
    "export async function loadRecordedAllocatedMinorByDonationIds"
  )
  expect(readerSlice).toContain('withIndex("by_donationId"')
  expect(readerSlice).toContain("for await")
  expect(readerSlice).not.toContain(".collect(")
  expect(readerSlice).not.toContain(".take(")

  // The donations list consumes the SAME reader, and its eight branches all
  // feed the single enrichment step: no branch returns a raw paginate result.
  const listSlice = sourceSlice(
    paymentsSource,
    "export const getStandaloneDonations"
  )
  expect(listSlice).toContain("loadRecordedAllocatedMinorByDonationIds")
  expect(listSlice).toContain("deriveEventDonationIncome")
  expect(listSlice).toContain("by_donationKind_and_eventId_and_paidAt")
  expect(listSlice.match(/\.paginate\(args\.paginationOpts\)/g)).toHaveLength(8)
  expect(listSlice).not.toContain("return await ctx.db")
  expect(listSlice).toContain("return { ...page, page: enrichedRows }")

  // And the new query is registered on the generated API surface.
  expect(donationsSource).toContain("export const getEventDonationIncome")
})
