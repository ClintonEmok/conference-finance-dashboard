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
  loadMatchedPaymentTotalsByOrderId,
  loadOrderAmountDueBreakdowns,
  loadOrderAttendeePaymentBreakdowns,
  loadOrderPaymentAttributions,
} from "./finance"
import {
  deriveAllocationPaymentBreakdowns,
  type AllocationPaymentState,
} from "../lib/domain/finance/allocation-payment-state"
import { deriveBalanceAmounts } from "../lib/domain/finance/amounts"
import { upsertAttendeeSearchDocument } from "./search"

/**
 * Attendee-level agreement proof for Phase 56 plan 04 (success criterion 1).
 *
 * One fixture, one run: order L is cleared by a real `whole_order` allocation
 * written through `donations.allocateDonation`, and order N is the
 * allocation-free control. The same attendee figures must come back from
 * attendee detail, the attendee ledger, the allocation board's data source, the
 * reporting rows and the reconciliation rows — each asserted against the shared
 * attribution owner (`loadOrderPaymentAttributions`) in the same test run, so a
 * divergence is a hard failure rather than a page that disagrees later.
 *
 * Figures are in MINOR units (12_000 = 120.00). The plan's €-scale prose
 * (120 / 80 / 100 / 200) is these values divided by 100.
 *
 * The allocation is created through the production mutation (never a
 * hand-inserted `donationAllocations` row) and the donation through
 * `payments.createStandaloneDonation`, exactly as plan 56-02's tracer does.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:attendee-attribution",
  name: "Admin",
  email: "admin@example.com",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

type FinanceLoaderCtx = Parameters<typeof loadOrderAmountDueBreakdowns>[0]

function fresh() {
  return convexTest(schema, modules)
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
        status: "pending" as const,
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
      // Phase 62: the ledger scans `orderAttendees.by_eventId` (source rows),
      // so the fixture carries the additive copy.
      eventId,
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

type LedgerFixture = {
  eventId: Id<"events">
  orderL: Id<"orders">
  attendeeLA: Id<"orderAttendees">
  attendeeLB: Id<"orderAttendees">
  orderN: Id<"orders">
  attendeeNA: Id<"orderAttendees">
  attendeeNB: Id<"orderAttendees">
  donationId: Id<"payments">
}

/**
 * Order L: due 12_000 + 8_000, a real 10_000 applied payment, then a 10_000
 * `whole_order` allocation naming the attendee with the 8_000 due. Order N has
 * the same shape and NO allocations (the control).
 */
async function seedLedgerFixture(
  t: TestConvex,
  authed: TestConvex
): Promise<LedgerFixture> {
  const eventId = await seedEvent(t, "attendee-attribution")

  const lA = await createAttendee(t, eventId, {
    attendeeKey: "l-a",
    name: "L Attendee A",
    ticketPriceMinor: 12_000,
  })
  const lB = await createAttendee(t, eventId, {
    orderId: lA.orderId,
    attendeeKey: "l-b",
    name: "L Attendee B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(t, eventId, lA.orderId, 10_000)

  const nA = await createAttendee(t, eventId, {
    attendeeKey: "n-a",
    name: "N Attendee A",
    ticketPriceMinor: 12_000,
  })
  const nB = await createAttendee(t, eventId, {
    orderId: nA.orderId,
    attendeeKey: "n-b",
    name: "N Attendee B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(t, eventId, nA.orderId, 10_000)

  // Legacy projection fixture, retained until 62-04 removes the writers: the
  // ledger no longer reads `searchDocuments` (it scans source rows since
  // 62-03), so these rows are dead weight for the assertions below.
  for (const attendeeId of [
    lA.attendeeId,
    lB.attendeeId,
    nA.attendeeId,
    nB.attendeeId,
  ]) {
    await t.mutation(async (ctx) => {
      await upsertAttendeeSearchDocument(ctx, attendeeId)
    })
  }

  const donationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 10_000,
  })

  const allocation = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: {
      method: "manual",
      rows: [
        {
          attendeeId: lB.attendeeId,
          amountMinor: 10_000,
          scope: "whole_order",
        },
      ],
    },
    idempotencyKey: "attendee-attribution-batch",
  })
  expect(allocation).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 0,
  })

  return {
    eventId,
    orderL: lA.orderId,
    attendeeLA: lA.attendeeId,
    attendeeLB: lB.attendeeId,
    orderN: nA.orderId,
    attendeeNA: nA.attendeeId,
    attendeeNB: nB.attendeeId,
    donationId,
  }
}

// ---------------------------------------------------------------------------
// Shared projections read through the REAL loaders
// ---------------------------------------------------------------------------

type AttendeeFigures = {
  amountDueMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  paymentState: AllocationPaymentState
}

type OrderFigures = {
  amountDueMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  byAttendeeId: Record<string, AttendeeFigures>
}

/** `loadOrderPaymentAttributions` + `loadCanonicalOrderBalances`, projected. */
async function readOwnerFigures(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<Record<string, OrderFigures>> {
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
    const balances = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
    })

    const figures: Record<string, OrderFigures> = {}
    for (const orderId of orderIds) {
      const key = String(orderId)
      const attribution = attributions.get(key)
      const balance = balances.get(key)
      if (!attribution || !balance) continue

      const byAttendeeId: Record<string, AttendeeFigures> = {}
      for (const [attendeeId, row] of attribution.byAttendeeId) {
        byAttendeeId[attendeeId] = {
          amountDueMinor: Number(row.amountDueMinor),
          paidAmountMinor: Number(row.paidAmountMinor),
          outstandingAmountMinor: Number(row.outstandingAmountMinor),
          paymentState: row.paymentState,
        }
      }

      figures[key] = {
        amountDueMinor: Number(balance.amountDueMinor),
        paidAmountMinor: Number(balance.paidAmountMinor),
        outstandingAmountMinor: Number(balance.outstandingAmountMinor),
        byAttendeeId,
      }
    }

    return figures
  })
}

function attendeeFigures(
  figures: Record<string, OrderFigures>,
  orderId: Id<"orders">,
  attendeeId: Id<"orderAttendees">
): AttendeeFigures {
  const row = figures[String(orderId)]?.byAttendeeId[String(attendeeId)]
  if (!row) {
    throw new Error(
      `attendee ${String(attendeeId)} is missing from the attribution owner`
    )
  }
  return row
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

/**
 * Cases 1-7 share one fixture: the allocation must be observable on every
 * surface in the SAME run (the plan's agreement rule), and the allocation-free
 * control must be read against the legacy derivation in the same run.
 */
test("every attendee-level surface agrees with the shared attribution", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedLedgerFixture(t, authed)
  const {
    eventId,
    orderL,
    attendeeLA,
    attendeeLB,
    orderN,
    attendeeNA,
    attendeeNB,
  } = fixture

  const owner = await readOwnerFigures(t, [orderL, orderN])

  // Sanity: the owner itself. Order L is fully cleared (pool = 10_000 real +
  // 10_000 whole_order credit, distributed 12_000:8_000 by remaining need);
  // order N keeps the legacy due-weighted split of its 10_000 payment.
  expect(owner[String(orderL)]).toMatchObject({
    amountDueMinor: 20_000,
    paidAmountMinor: 20_000,
    outstandingAmountMinor: 0,
  })
  expect(attendeeFigures(owner, orderL, attendeeLA)).toMatchObject({
    amountDueMinor: 12_000,
    paidAmountMinor: 12_000,
    outstandingAmountMinor: 0,
    paymentState: "paid",
  })
  expect(attendeeFigures(owner, orderL, attendeeLB)).toMatchObject({
    amountDueMinor: 8_000,
    paidAmountMinor: 8_000,
    outstandingAmountMinor: 0,
    paymentState: "paid",
  })
  expect(owner[String(orderN)]).toMatchObject({
    amountDueMinor: 20_000,
    paidAmountMinor: 10_000,
    outstandingAmountMinor: 10_000,
  })

  // --- Case 1: attendee detail -------------------------------------------
  const detailL = await t.query(api.orders.getOrderWithAttendees, { orderId: orderL })
  const detailN = await t.query(api.orders.getOrderWithAttendees, { orderId: orderN })
  expect(detailL).not.toBeNull()
  expect(detailN).not.toBeNull()

  const detailAttendee = (
    detail: NonNullable<typeof detailL>,
    attendeeId: Id<"orderAttendees">
  ) => {
    const row = detail.attendees.find((a) => String(a.id) === String(attendeeId))
    if (!row) throw new Error(`attendee ${String(attendeeId)} missing from order detail`)
    return row
  }

  const detailLA = detailAttendee(detailL!, attendeeLA)
  const detailLB = detailAttendee(detailL!, attendeeLB)
  expect(detailLA.paidAmountMinor).toBe(12_000)
  expect(detailLA.outstandingAmountMinor).toBe(0)
  expect(detailLB.paidAmountMinor).toBe(8_000)
  expect(detailLB.outstandingAmountMinor).toBe(0)

  // The attendee NAMED by the whole_order allocation is fully cleared. A
  // blanket targeted-first rule would cap B's credit at B's own 4_000
  // outstanding and leave 4_000 outstanding here — this is the discriminating
  // assertion for D-01 on the detail surface.
  expect(detailLB.outstandingAmountMinor).toBe(0)

  // The allocation-free control, figure pair by figure pair.
  const detailNA = detailAttendee(detailN!, attendeeNA)
  const detailNB = detailAttendee(detailN!, attendeeNB)
  expect(detailNA.paidAmountMinor).toBe(6_000)
  expect(detailNA.outstandingAmountMinor).toBe(6_000)
  expect(detailNB.paidAmountMinor).toBe(4_000)
  expect(detailNB.outstandingAmountMinor).toBe(4_000)

  // --- Case 2: the attendee ledger ---------------------------------------
  const ledger = await authed.query(api.attendees.getAttendeeLedgerPage, {
    eventId,
    search: undefined,
    cursor: null,
    pageSize: 50,
    from: null,
    to: null,
  })
  const ledgerRows = ledger.rows as Array<{
    _id: string
    orderId: string
    amountDueMinor: number
    paidAmountMinor: number
    outstandingAmountMinor: number
  }>
  expect(ledgerRows).toHaveLength(4)

  // Read both surfaces in the same run: each ledger row must equal the shared
  // owner's figure for the same attendee, not a locally rebuilt one.
  for (const row of ledgerRows) {
    const orderId = row.orderId as Id<"orders">
    const attendeeId = row._id as Id<"orderAttendees">
    const expected = attendeeFigures(owner, orderId, attendeeId)
    expect(row.amountDueMinor).toBe(expected.amountDueMinor)
    expect(row.paidAmountMinor).toBe(expected.paidAmountMinor)
    expect(row.outstandingAmountMinor).toBe(expected.outstandingAmountMinor)
  }

  const ledgerLB = ledgerRows.find((row) => row._id === String(attendeeLB))
  expect(ledgerLB?.paidAmountMinor).toBe(8_000)
  expect(ledgerLB?.outstandingAmountMinor).toBe(0)

  // --- Case 3: the allocation board's data source ------------------------
  // The board is covered BY CONSTRUCTION: it consumes
  // `loadOrderAttendeePaymentBreakdowns`, and that adapter is asserted equal to
  // the owner here for the board's exact call shape (every attendee of the
  // order grouped by order id).
  const boardShape = await t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = [{ _id: orderL }, { _id: orderN }]
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const attendeeIdsByOrderId = new Map<string, string[]>([
      [String(orderL), [String(attendeeLA), String(attendeeLB)]],
      [String(orderN), [String(attendeeNA), String(attendeeNB)]],
    ])
    const rows = await loadOrderAttendeePaymentBreakdowns({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
      attendeeIdsByOrderId,
    })
    const projections: Record<
      string,
      {
        amountDueMinor: number
        paidAmountMinor: number
        paymentState: AllocationPaymentState
      }
    > = {}
    for (const [attendeeId, row] of rows) {
      projections[attendeeId] = {
        amountDueMinor: Number(row.amountDueMinor),
        paidAmountMinor: Number(row.paidAmountMinor),
        paymentState: row.paymentState,
      }
    }
    return projections
  })

  for (const [attendeeId, row] of Object.entries(boardShape)) {
    const belongsToOrderL =
      String(attendeeId) === String(attendeeLA) ||
      String(attendeeId) === String(attendeeLB)
    const orderId = belongsToOrderL ? orderL : orderN
    const expected = attendeeFigures(owner, orderId, attendeeId as Id<"orderAttendees">)
    expect(row.paidAmountMinor).toBe(expected.paidAmountMinor)
    expect(row.amountDueMinor).toBe(expected.amountDueMinor)
    expect(row.paymentState).toBe(expected.paymentState)
  }
  expect(boardShape[String(attendeeLB)]?.paidAmountMinor).toBe(8_000)

  // --- Case 4: reporting rows --------------------------------------------
  await t.mutation(async (ctx) => {
    await ctx.db.insert("reportShares", {
      eventId,
      token: "report-attendee-attribution",
      createdAt: BASE_AT,
    })
  })

  const report = await t.query(api.reports.getFullReportByToken, {
    token: "report-attendee-attribution",
  })
  expect(report).not.toBeNull()

  type ReportAttendeeRow = {
    name: string
    amountDueMinor: number
    paidMinor: number
    outstandingMinor: number
    overpaidMinor: number
  }
  type ReportGroupRow = {
    orderId: string
    amountDueMinor: number
    paidMinor: number
    outstandingMinor: number
    overpaidMinor: number
    attendees: ReportAttendeeRow[]
  }
  const reportGroups = (report?.attendees?.orderGroups ?? []) as ReportGroupRow[]
  const groupL = reportGroups.find((group) => group.orderId === String(orderL))
  const groupN = reportGroups.find((group) => group.orderId === String(orderN))
  expect(groupL).toBeDefined()
  expect(groupN).toBeDefined()

  // Group totals equal the canonical balance for the same order.
  expect(groupL).toMatchObject({
    amountDueMinor: 20_000,
    paidMinor: 20_000,
    outstandingMinor: 0,
    overpaidMinor: 0,
  })
  expect(groupN).toMatchObject({
    amountDueMinor: 20_000,
    paidMinor: 10_000,
    outstandingMinor: 10_000,
    overpaidMinor: 0,
  })

  for (const attendee of groupL!.attendees) {
    expect(attendee.outstandingMinor).toBe(0)
  }
  const reportGroupLB = groupL!.attendees.find(
    (attendee) => attendee.name === "L Attendee B"
  )
  expect(reportGroupLB?.paidMinor).toBe(8_000)
  expect(reportGroupLB?.outstandingMinor).toBe(0)

  // --- Case 5: backward-compatibility control (order N) -------------------
  // Every attendee-level figure equals `deriveBalanceAmounts(due, share)` where
  // the share comes from the REAL pre-Phase-56 derivation, computed in-test.
  const legacy = await t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = [{ _id: orderN }]
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const paidTotalMinor =
      (await loadMatchedPaymentTotalsByOrderId(loaderCtx, orders)).get(
        String(orderN)
      ) ?? 0
    const breakdowns = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId:
        dueBreakdownsByOrderId.get(String(orderN))?.amountDueByAttendeeId ??
        new Map(),
      paidTotalMinor,
    })

    const rows: Array<{
      attendeeId: string
      amountDueMinor: number
      paidAmountMinor: number
      outstandingAmountMinor: number
      paymentState: AllocationPaymentState
    }> = []
    for (const [attendeeId, row] of breakdowns) {
      const balance = deriveBalanceAmounts(
        Number(row.amountDueMinor),
        Number(row.paidAmountMinor)
      )
      rows.push({
        attendeeId,
        amountDueMinor: Number(balance.amountDueMinor),
        paidAmountMinor: Number(balance.paidAmountMinor),
        outstandingAmountMinor: Number(balance.outstandingAmountMinor),
        paymentState: row.paymentState,
      })
    }
    return rows
  })

  expect(legacy).toHaveLength(2)
  for (const row of legacy) {
    const ownerRow = attendeeFigures(owner, orderN, row.attendeeId as Id<"orderAttendees">)
    expect(ownerRow.amountDueMinor).toBe(row.amountDueMinor)
    expect(ownerRow.paidAmountMinor).toBe(row.paidAmountMinor)
    expect(ownerRow.outstandingAmountMinor).toBe(row.outstandingAmountMinor)
    expect(ownerRow.paymentState).toBe(row.paymentState)
  }
  expect(
    legacy.find((row) => row.attendeeId === String(attendeeNA))
  ).toMatchObject({ paidAmountMinor: 6_000, outstandingAmountMinor: 6_000 })
  expect(
    legacy.find((row) => row.attendeeId === String(attendeeNB))
  ).toMatchObject({ paidAmountMinor: 4_000, outstandingAmountMinor: 4_000 })

  // --- Case 7: reconciliation rows (SC1's named consumer) -----------------
  const reconciliationRows = await t.query(
    api.orders.getOrdersForReconciliation,
    { eventId, from: 0, to: Date.now() }
  )
  const rowL = reconciliationRows.find((row) => row.orderId === String(orderL))
  const rowN = reconciliationRows.find((row) => row.orderId === String(orderN))
  expect(rowL).toBeDefined()
  expect(rowN).toBeDefined()

  // The allocated order's reconciliation row shows zero outstanding, produced
  // by the row's canonical matched amount (including allocation credit).
  expect(rowL).toMatchObject({
    matchedAmountMinor: 20_000,
    outstandingAmountMinor: 0,
  })
  expect(rowN).toMatchObject({
    matchedAmountMinor: 10_000,
    outstandingAmountMinor: 10_000,
  })
})

// ---------------------------------------------------------------------------
// Case 6: no second per-attendee paid owner (structural)
// ---------------------------------------------------------------------------

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, "..", relativePath), "utf8")
}

test("no per-attendee paid owner survives outside the shared attribution", () => {
  // A regression here is otherwise invisible until a page disagrees.
  const reports = readRepoFile("convex/reports.ts")
  expect(reports).not.toContain("allocateReportPaymentsByAttendee")
  expect(reports).toContain("loadOrderPaymentAttributions")

  const attendeeLedger = readRepoFile("lib/domain/finance/attendees.ts")
  expect(attendeeLedger).not.toContain("allocateMinorAmountByWeight")
  expect(attendeeLedger).not.toContain("buildMatchedTotalsByOrderId")
  expect(attendeeLedger).toContain("paidAmountMinor")

  const attendeeDetail = readRepoFile("lib/domain/finance/attendee-detail.ts")
  expect(attendeeDetail).not.toContain("allocateMinorAmountByWeight")
  expect(attendeeDetail).not.toContain("buildMatchedTotalsByOrderId")
  expect(attendeeDetail).toContain("paidAmountMinor")

  const reconciliation = readRepoFile("lib/domain/finance/reconciliation.ts")
  expect(reconciliation).not.toContain("buildMatchedTotalsByOrderId")
  expect(reconciliation).not.toContain("api.payments.getPayments")
  expect(reconciliation).toContain("matchedAmountMinor")
  expect(reconciliation).toContain("unallocatedRemainderMinor")

  // The board has no paid formula of its own: it consumes the adapter, and the
  // adapter is asserted equal to the owner above.
  const accommodation = readRepoFile("convex/accommodation.ts")
  expect(accommodation).toContain("loadOrderAttendeePaymentBreakdowns")
  expect(accommodation).toContain("dueBreakdownsByOrderId")
  expect(accommodation).toContain("loadOrderAmountDueBreakdowns")

  // The ONE owner still composes the credit read and the payment-only total.
  const finance = readRepoFile("convex/finance.ts")
  const ownerStart = finance.indexOf(
    "export async function loadOrderPaymentAttributions"
  )
  expect(ownerStart).toBeGreaterThanOrEqual(0)
  const ownerSlice = finance.slice(ownerStart)
  expect(ownerSlice).toContain("loadRecordedAllocationsByOrderId")
  expect(ownerSlice).toContain("deriveDonationAttribution")
})
