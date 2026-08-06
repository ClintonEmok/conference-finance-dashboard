/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "@/convex/_generated/api"
import schema from "@/convex/schema"
import { loadOrderAmountDueBreakdowns } from "@/convex/finance"
import { buildAccommodationPriceSnapshot } from "@/lib/domain/finance/accommodation-amounts"

const modules = import.meta.glob("../../convex/**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

// getRoomAllocationBoard has no `returns` validator, so convex-test types its
// projection rows as `{}`. These local shapes pin the fields the matrix reads.
type BoardAttendeeRow = {
  attendeeId: string
  orderId: string | null
  attendeeName: string | null
  paymentState: "paid" | "partial" | "unpaid" | null
  amountDueMinor: number | null
  paidAmountMinor: number | null
}

type AttendeeDetailRow = {
  _id: string
  amountDueMinor: number
  orderAmountDueMinor: number | null
}

type SyncPaidOrderRow = {
  _id: string
  amountDueMinor: number | null
}

const BASE_EVENT_AT = 1_750_000_000_000

type AuditSeed = {
  eventId: string
  categoryStandardId: string
  categorySuperiorId: string
  ticketIncludedId: string
  ticketNotIncludedId: string
  cotOptionId: string
}

/**
 * Seeds one internal event with a complete accommodation configuration:
 * 2 base nights, standard €30 and superior €45 per person per night, and a
 * cot €5/unit/night option. The `ticketIncludedId` ticket carries
 * accommodationIncluded=true; the `ticketNotIncludedId` ticket is
 * accommodation-free (both €20 tickets).
 *
 * The locked formula makes this fixture deterministic:
 *  - Attendee A (included ticket + standard + 1 cot for 2 nights):
 *    coveredNights = 2 → base charge 0; cot 2×500 = 1000; total accommodation
 *    1000 + ticket 2000 = 3000.
 *  - Attendee B (not-included ticket + standard, 2 nights): base 2×3000 =
 *    6000 + ticket 2000 = 8000.
 *  - Representative order total = 11000.
 */
async function seedAuditEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<AuditSeed> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "phase45-audit",
      title: "Phase 45 Audit Event",
      startsAt: BASE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const categoryStandardId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    })
  })
  const categorySuperiorId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "superior",
      label: "Superior",
      sortOrder: 2,
    })
  })
  const cotOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "cot",
      label: "Cot",
      kind: "addon",
      unit: "per_night",
    })
  })

  const ticketIncludedId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Ticket with accommodation",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      updatedAt: BASE_EVENT_AT,
    })
  })
  const ticketNotIncludedId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Ticket only",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_EVENT_AT,
    })
  })

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: BASE_EVENT_AT - 2 * 24 * 60 * 60 * 1000,
      baseCheckOutAt: BASE_EVENT_AT,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      defaultCategoryId: categoryStandardId as never,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: BASE_EVENT_AT,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      pricePerPersonMinor: 3000,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: categorySuperiorId as never,
      occupancy: "shared",
      pricePerPersonMinor: 4500,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: cotOptionId as never,
      enabled: true,
      priceMinor: 500,
    })
  })

  return {
    eventId: String(eventId),
    categoryStandardId: String(categoryStandardId),
    categorySuperiorId: String(categorySuperiorId),
    ticketIncludedId: String(ticketIncludedId),
    ticketNotIncludedId: String(ticketNotIncludedId),
    cotOptionId: String(cotOptionId),
  }
}

type OrderSeed = {
  orderId: string
  attendeeAId: string
  attendeeBId: string
}

/** Inserts an order with two attendees and their ticket selections. */
async function seedOrder(
  t: TestConvexForDataModel<GenericDataModel>,
  seed: AuditSeed,
  bookingRef: string
): Promise<OrderSeed> {
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal",
      bookingRef,
      bookerName: "Jane Doe",
      bookerEmail: "jane@example.com",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeAId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "audit-a",
      name: "Jane Doe",
      gender: "female",
      sortOrder: 0,
    })
  })
  const attendeeBId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "audit-b",
      name: "John Doe",
      gender: "male",
      sortOrder: 1,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeAId as never,
      ticketTypeId: seed.ticketIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeBId as never,
      ticketTypeId: seed.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 1,
    })
  })
  return {
    orderId: String(orderId),
    attendeeAId: String(attendeeAId),
    attendeeBId: String(attendeeBId),
  }
}

/** Inserts the representative accommodation selections (A = cot child row, B = base). */
async function seedRepresentativeSelections(
  t: TestConvexForDataModel<GenericDataModel>,
  seed: AuditSeed,
  order: OrderSeed
) {
  const selectionAId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: order.orderId as never,
      attendeeId: order.attendeeAId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      nightCount: 2,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationOptionSelections", {
      orderId: order.orderId as never,
      attendeeId: order.attendeeAId as never,
      selectionId: selectionAId as never,
      optionKey: "cot",
      quantity: 1,
      nights: 2,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: order.orderId as never,
      attendeeId: order.attendeeBId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      nightCount: 2,
    })
  })
}

async function loadOrderAmountDue(
  t: TestConvexForDataModel<GenericDataModel>,
  orderId: string
) {
  return await t.query(async (ctx) => {
    const loaderCtx =
      ctx as unknown as Parameters<typeof loadOrderAmountDueBreakdowns>[0]
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: orderId as never },
    ])
    const breakdown = breakdowns.get(orderId)
    if (!breakdown) return null
    return {
      amountDueMinor: breakdown.amountDueMinor,
      amountDueByAttendeeId: Object.fromEntries(
        breakdown.amountDueByAttendeeId
      ),
      accommodationLines: breakdown.accommodationLines,
    }
  })
}

function insertAppliedPayment(
  t: TestConvexForDataModel<GenericDataModel>,
  params: {
    seed: AuditSeed
    orderId: string
    payerName: string
    amountMinor: number
  }
) {
  return t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "bank_transfer",
      payerName: params.payerName,
      amountMinor: params.amountMinor,
      paidAt: BASE_EVENT_AT,
      eventId: params.seed.eventId as never,
      orderId: params.orderId,
      status: "auto_matched",
      matchedAt: BASE_EVENT_AT,
      matchedBy: "auto",
    })
  })
}

function insertFlexibleOrderLink(
  t: TestConvexForDataModel<GenericDataModel>,
  params: {
    seed: AuditSeed
    orderId: string
    token: string
  }
) {
  return t.mutation(async (ctx) => {
    return await ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: `provider-${params.token}`,
      providerEventId: `provider-event-${params.token}`,
      orderId: params.orderId,
      eventId: params.seed.eventId,
      linkType: "order",
      paymentRequestToken: params.token,
      paymentRequestUrl: `https://tikkie.me/pay/${params.token}`,
      status: "created",
      statusSource: "create",
      providerStatus: "OPEN",
      // Flexible-zero: the installment link is created with amount 0 and is
      // never derived from canonical due.
      amountMinor: 0,
      description: "Accommodation payment",
      expiryDate: BASE_EVENT_AT + 30 * 24 * 60 * 60 * 1000,
    })
  })
}

function insertReportShare(
  t: TestConvexForDataModel<GenericDataModel>,
  seed: AuditSeed,
  token: string
) {
  return t.mutation(async (ctx) => {
    return await ctx.db.insert("reportShares", {
      eventId: seed.eventId as never,
      token,
      createdAt: BASE_EVENT_AT,
    })
  })
}

// ---------------------------------------------------------------------------
// One server-owned amount-due and per-attendee breakdown across every named
// consumer: canonical loader, booking lookup, public tracking, order ledger,
// reconciliation, payment summary, auto-match inputs, attendee detail,
// revenue/reporting, Allocation inputs, and internal sync.
// ---------------------------------------------------------------------------

test("one canonical amount-due and per-attendee breakdown across every consumer", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedAuditEvent(t)
  const order = await seedOrder(t, seed, "BK-45-REP01")
  await seedRepresentativeSelections(t, seed, order)
  await insertAppliedPayment(t, {
    seed,
    orderId: order.orderId,
    payerName: "Jane Doe",
    amountMinor: 5000,
  })
  await insertFlexibleOrderLink(t, {
    seed,
    orderId: order.orderId,
    token: "link-rep01",
  })
  await insertReportShare(t, seed, "report-rep01")

  // 1. Canonical loader: 11000, A = 3000, B = 8000.
  const breakdown = await loadOrderAmountDue(t, order.orderId)
  expect(breakdown?.amountDueMinor).toBe(11000)
  expect(breakdown?.amountDueByAttendeeId[order.attendeeAId]).toBe(3000)
  expect(breakdown?.amountDueByAttendeeId[order.attendeeBId]).toBe(8000)
  expect(breakdown?.accommodationLines.map((line) => line.kind)).toEqual([
    "option",
    "accommodation",
  ])

  // 2. Booking lookup (signup success/review): same canonical total + lines.
  const booking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-45-REP01",
  })
  expect(booking?.totalAmountMinor).toBe(11000)
  expect(booking?.accommodationLines).toHaveLength(2)

  // 3. Public tracking (permalink): canonical due/paid/remaining/status.
  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-REP01",
  })
  expect(tracking?.order.amountDueMinor).toBe(11000)
  expect(tracking?.payment.totalDueMinor).toBe(11000)
  expect(tracking?.payment.totalPaidMinor).toBe(5000)
  expect(tracking?.payment.remainingMinor).toBe(6000)
  expect(tracking?.payment.overpaymentDeltaMinor).toBe(0)
  expect(tracking?.payment.paymentStatus).toBe("partial")
  // The flexible link stays amount 0 — canonical due drives balance, not the
  // link amount.
  expect(tracking?.tikkieAmountMinor).toBe(0)

  // 4. Reconciliation: canonical amount-due/outstanding row.
  const reconciliation = await t.query(
    api.orders.getOrdersForReconciliation,
    {
      eventId: seed.eventId,
      from: 0,
      to: Date.now(),
    }
  )
  const repRow = reconciliation.find(
    (row) => row.orderId === order.orderId
  )
  expect(repRow?.amountDueMinor).toBe(11000)
  expect(repRow?.matchedAmountMinor).toBe(5000)
  expect(repRow?.outstandingAmountMinor).toBe(6000)

  // 5. Order ledger (filters + totals): same totals authority.
  const ledger = await t.query(api.orders.getOrdersWithFilters, {
    eventId: seed.eventId,
    page: 1,
    pageSize: 100,
  })
  expect(ledger.totals.amountDueMinor).toBe(11000)
  expect(ledger.totals.matchedAmountMinor).toBe(5000)
  expect(ledger.totals.outstandingAmountMinor).toBe(6000)
  const ledgerRow = ledger.orders.find(
    (row) => row.orderId === order.orderId
  )
  expect(ledgerRow?.amountDueMinor).toBe(11000)
  expect(ledgerRow?.outstandingAmountMinor).toBe(6000)

  // 6. Payment summary: order total is canonical due, not provider total.
  const paymentSummary = await t.query(api.payments.getPaymentSummary, {
    orderId: order.orderId,
  })
  expect(paymentSummary.orderTotal).toBe(11000)
  expect(paymentSummary.totalPaid).toBe(5000)
  expect(paymentSummary.remaining).toBe(6000)

  // 7. Attendee detail: per-attendee canonical due inside the order total.
  const attendees = (await t.query(api.attendees.getAttendeesWithTickets, {
    eventId: seed.eventId,
  })) as AttendeeDetailRow[]
  const attendeeA = attendees.find((a) => a._id === order.attendeeAId)
  const attendeeB = attendees.find((a) => a._id === order.attendeeBId)
  expect(attendeeA?.amountDueMinor).toBe(3000)
  expect(attendeeA?.orderAmountDueMinor).toBe(11000)
  expect(attendeeB?.amountDueMinor).toBe(8000)
  expect(attendeeB?.orderAmountDueMinor).toBe(11000)

  // 8. Revenue/reporting share: aggregate totals equal the canonical order.
  const fullReport = await t.query(api.reports.getFullReportByToken, {
    token: "report-rep01",
  })
  expect(fullReport?.aggregate?.totals.amountDueMinor).toBe(11000)
  expect(fullReport?.aggregate?.totals.paidMinor).toBe(5000)
  expect(fullReport?.aggregate?.totals.outstandingMinor).toBe(6000)
  expect(fullReport?.aggregate?.totals.overpaidMinor).toBe(0)

  // 9. Allocation board inputs: tri-state paid projection from canonical due.
  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: seed.eventId,
  })
  const unassigned = (board.unassignedAttendees as BoardAttendeeRow[]).filter(
    (row) => row.orderId === order.orderId
  )
  const unassignedA = unassigned.find(
    (row) => row.attendeeId === order.attendeeAId
  )
  const unassignedB = unassigned.find(
    (row) => row.attendeeId === order.attendeeBId
  )
  expect(unassignedA?.paymentState).toBe("partial")
  expect(unassignedA?.amountDueMinor).toBe(3000)
  // 5000 paid split by due weight: A gets 1364, B gets 3636.
  expect(unassignedA?.paidAmountMinor).toBe(1364)
  expect(unassignedB?.paymentState).toBe("partial")
  expect(unassignedB?.amountDueMinor).toBe(8000)
  expect(unassignedB?.paidAmountMinor).toBe(3636)

  // 10. Internal sync projection: amount-due authority for provider sync.
  const paidOrders = (await t.query(internal.sync.internalGetPaidOrders, {})) as SyncPaidOrderRow[]
  const syncRow = paidOrders.find(
    (row) => row._id === order.orderId
  )
  expect(syncRow?.amountDueMinor).toBe(11000)
})

// ---------------------------------------------------------------------------
// Distinct financial views are intentional: stored provider total, paid
// totals, flexible link amount 0. The representative order's stored
// `orders.totalAmountMinor` is the provider/write-time total, not the live
// accommodation authority.
// ---------------------------------------------------------------------------

test("stored provider total, paid total, and flexible link amount stay distinct views", async () => {
  const t = fresh()
  const seed = await seedAuditEvent(t)
  const order = await seedOrder(t, seed, "BK-45-REP02")
  await seedRepresentativeSelections(t, seed, order)
  await insertAppliedPayment(t, {
    seed,
    orderId: order.orderId,
    payerName: "Jane Doe",
    amountMinor: 5000,
  })
  await insertFlexibleOrderLink(t, {
    seed,
    orderId: order.orderId,
    token: "link-rep02",
  })
  // Provider/write-time total deliberately different from the live canonical
  // total: the loader must still be the only accommodation authority.
  await t.mutation(async (ctx) => {
    return await ctx.db.patch("orders", order.orderId as never, {
      totalAmountMinor: 4000,
    })
  })

  const breakdown = await loadOrderAmountDue(t, order.orderId)
  expect(breakdown?.amountDueMinor).toBe(11000)

  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-REP02",
  })
  // order.totalAmountMinor is exposed verbatim as the stored provider total…
  expect(tracking?.order.totalAmountMinor).toBe(4000)
  // …while canonical due (amountDueMinor/totalDueMinor) is the loader result.
  expect(tracking?.order.amountDueMinor).toBe(11000)
  expect(tracking?.payment.totalDueMinor).toBe(11000)
  expect(tracking?.payment.totalPaidMinor).toBe(5000)

  // The link amount is the flexible installment amount, never derived from due.
  const links = await t.query(api.tikkie.getPaymentLinksByOrderId, {
    orderId: order.orderId,
  })
  expect(links).toHaveLength(1)
  expect(links[0]?.amountMinor).toBe(0)
  expect(links[0]?.status).toBe("created")
})

// ---------------------------------------------------------------------------
// Live vs snapshot: unconfirmed orders re-price through the loader when a rate
// changes; confirmed snapshot rows stay fixed. Legacy/no-selection orders stay
// ticket-only and missing-config unconfirmed rows stay €0 — all safe.
// ---------------------------------------------------------------------------

test("unconfirmed order re-prices live, confirmed order stays fixed, flexible link untouched", async () => {
  const t = fresh()
  const seed = await seedAuditEvent(t)

  // Live order: one attendee, not-included ticket + standard 2 nights = 8000.
  const liveOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal",
      bookingRef: "BK-45-LIVE01",
      bookerName: "Live Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const liveAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: liveOrderId as never,
      attendeeKey: "live-a",
      name: "Live Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: liveOrderId as never,
      attendeeId: liveAttendeeId as never,
      ticketTypeId: seed.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: liveOrderId as never,
      attendeeId: liveAttendeeId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      
      nightCount: 2,
    })
  })
  await insertFlexibleOrderLink(t, {
    seed,
    orderId: String(liveOrderId),
    token: "link-live01",
  })

  // Confirmed order: identical selection, confirmed with a snapshot = 8000.
  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: "conf-a",
      categoryCode: "standard",
      occupancy: "shared",
      
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      options: [],
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })
  const confirmedOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal",
      bookingRef: "BK-45-CONF01",
      bookerName: "Confirmed Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const confirmedAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: confirmedOrderId as never,
      attendeeKey: "conf-a",
      name: "Confirmed Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: confirmedOrderId as never,
      attendeeId: confirmedAttendeeId as never,
      ticketTypeId: seed.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: confirmedOrderId as never,
      attendeeId: confirmedAttendeeId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: snapshot,
    })
  })

  const before = await loadOrderAmountDue(t, String(liveOrderId))
  expect(before?.amountDueMinor).toBe(8000)

  // Admin raises the standard rate €30 → €40.
  await t.mutation(async (ctx) => {
    const rate = await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId_and_categoryId_and_occupancy", (q) =>
        q
          .eq("eventId", seed.eventId as never)
          .eq("categoryId", seed.categoryStandardId as never)
          .eq("occupancy", "shared")
      )
      .first()
    if (rate) {
      await ctx.db.patch("eventAccommodationRates", rate._id, {
        pricePerPersonMinor: 4000,
      })
    }
  })

  // Live order re-prices: ticket 2000 + base 2×4000 = 10000.
  const liveAfter = await loadOrderAmountDue(t, String(liveOrderId))
  expect(liveAfter?.amountDueMinor).toBe(10000)
  const liveTracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-LIVE01",
  })
  expect(liveTracking?.payment.totalDueMinor).toBe(10000)

  // Confirmed order stays fixed at 8000 across tracking and booking lookup.
  const confirmedAfter = await loadOrderAmountDue(t, String(confirmedOrderId))
  expect(confirmedAfter?.amountDueMinor).toBe(8000)
  const confirmedTracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-CONF01",
  })
  expect(confirmedTracking?.payment.totalDueMinor).toBe(8000)
  const confirmedBooking = await t.query(
    api.signupSubmission.getByBookingRef,
    { bookingRef: "BK-45-CONF01" }
  )
  expect(confirmedBooking?.totalAmountMinor).toBe(8000)

  // The open flexible link is untouched: same count, same amount 0, still
  // created (never regenerated/expired/superseded by the rate edit).
  const links = await t.query(api.tikkie.getPaymentLinksByOrderId, {
    orderId: String(liveOrderId),
  })
  expect(links).toHaveLength(1)
  expect(links[0]?.amountMinor).toBe(0)
  expect(links[0]?.status).toBe("created")
  const trackingLinks = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-LIVE01",
  })
  expect(trackingLinks?.tikkieAmountMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Legacy and missing-config safety: an order without accommodation selections
// keeps its ticket-only total everywhere, and an unconfirmed selection on an
// event without a config contributes €0 (ticket-only), while a confirmed row
// prices from its snapshot even when the config is later removed.
// ---------------------------------------------------------------------------

test("legacy no-selection and missing-config orders retain safe ticket-only behavior", async () => {
  const t = fresh()
  const seed = await seedAuditEvent(t)

  // Legacy order: no accommodation selections at all.
  const legacyOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal",
      bookingRef: "BK-45-LEG01",
      bookerName: "Legacy Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const legacyAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: legacyOrderId as never,
      attendeeKey: "legacy-a",
      name: "Legacy Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: legacyOrderId as never,
      attendeeId: legacyAttendeeId as never,
      ticketTypeId: seed.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })

  // Missing-config event: unconfirmed selection but no eventAccommodationConfig.
  const noConfigEventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "phase45-noconfig",
      title: "No Config Event",
      startsAt: BASE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_EVENT_AT,
    })
  })
  const noConfigOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: noConfigEventId as never,
      source: "internal",
      bookingRef: "BK-45-NOCFG01",
      bookerName: "No Config Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const noConfigAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: noConfigOrderId as never,
      attendeeKey: "noconfig-a",
      name: "No Config Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: noConfigOrderId as never,
      attendeeId: noConfigAttendeeId as never,
      ticketTypeId: seed.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: noConfigOrderId as never,
      attendeeId: noConfigAttendeeId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      
      nightCount: 2,
    })
  })

  // Confirmed order whose snapshot must survive complete config removal.
  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: "noconfig-conf",
      categoryCode: "standard",
      occupancy: "shared",
      
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      options: [],
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })
  const confirmedOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal",
      bookingRef: "BK-45-CONF02",
      bookerName: "Confirmed No Config Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const confirmedAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: confirmedOrderId as never,
      attendeeKey: "noconfig-conf",
      name: "Confirmed No Config Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: confirmedOrderId as never,
      attendeeId: confirmedAttendeeId as never,
      ticketTypeId: seed.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: confirmedOrderId as never,
      attendeeId: confirmedAttendeeId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: snapshot,
    })
  })

  // Legacy order: ticket-only total, no accommodation lines, everywhere.
  const legacyBreakdown = await loadOrderAmountDue(t, String(legacyOrderId))
  expect(legacyBreakdown?.amountDueMinor).toBe(2000)
  expect(legacyBreakdown?.accommodationLines).toEqual([])
  const legacyBooking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-45-LEG01",
  })
  expect(legacyBooking?.totalAmountMinor).toBe(2000)
  expect(legacyBooking?.accommodationLines).toEqual([])
  const legacyTracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-LEG01",
  })
  expect(legacyTracking?.payment.totalDueMinor).toBe(2000)
  const legacyRecon = await t.query(api.orders.getOrdersForReconciliation, {
    eventId: seed.eventId,
    from: 0,
    to: Date.now(),
  })
  expect(
    legacyRecon.find((row) => row.orderId === legacyOrderId)?.amountDueMinor
  ).toBe(2000)

  // Missing-config order: unconfirmed selection contributes €0 → ticket-only.
  const noConfigBreakdown = await loadOrderAmountDue(
    t,
    String(noConfigOrderId)
  )
  expect(noConfigBreakdown?.amountDueMinor).toBe(2000)
  expect(noConfigBreakdown?.accommodationLines).toEqual([])
  const noConfigBooking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-45-NOCFG01",
  })
  expect(noConfigBooking?.totalAmountMinor).toBe(2000)
  expect(noConfigBooking?.accommodationLines).toEqual([])

  // Confirmed row prices from its snapshot even after the config is removed.
  await t.mutation(async (ctx) => {
    const config = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId as never))
      .first()
    if (config) {
      await ctx.db.delete("eventAccommodationConfig", config._id)
    }
  })
  const confirmedAfter = await loadOrderAmountDue(t, String(confirmedOrderId))
  expect(confirmedAfter?.amountDueMinor).toBe(8000)
  expect(confirmedAfter?.accommodationLines[0]?.ratePerNightMinor).toBe(3000)
})

// ---------------------------------------------------------------------------
// Paid/partial/unpaid/overpaid classification and auto-match inputs use the
// canonical due — never orders.status or a provider total.
// ---------------------------------------------------------------------------

test("paid-state classification and auto-match use canonical due as authority", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedAuditEvent(t)

  // One attendee helper for a single-selection order with a given due.
  async function seedSingleOrder(
    bookingRef: string,
    amountMinor: number[],
    unpaid: boolean
  ) {
    const orderId = await t.mutation(async (ctx) => {
      return await ctx.db.insert("orders", {
        eventId: seed.eventId as never,
        source: "internal",
        bookingRef,
        bookerName: bookingRef === "BK-45-PAID01" ? "Paid Buyer" : "State Buyer",
        submittedAt: BASE_EVENT_AT,
      })
    })
    const attendeeId = await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAttendees", {
        orderId: orderId as never,
        attendeeKey: bookingRef,
        name: bookingRef === "BK-45-PAID01" ? "Paid Buyer" : "State Buyer",
        gender: "unknown",
        sortOrder: 0,
      })
    })
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderTicketSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        ticketTypeId: seed.ticketNotIncludedId as never,
        quantity: 1,
        sortOrder: 0,
      })
    })
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: seed.categoryStandardId as never,
        occupancy: "shared",
        
        nightCount: 2,
      })
    })
    if (!unpaid) {
      for (const amount of amountMinor) {
        await insertAppliedPayment(t, {
          seed,
          orderId: String(orderId),
          payerName: "State Buyer",
          amountMinor: amount,
        })
      }
    }
    return { orderId: String(orderId), attendeeId: String(attendeeId) }
  }

  // All three orders have canonical due 8000 (ticket 2000 + base 2×3000).
  const paid = await seedSingleOrder("BK-45-PAID01", [8000], false)
  const overpaid = await seedSingleOrder("BK-45-OVER01", [5000, 5000], false)
  const unpaid = await seedSingleOrder("BK-45-UNPAID01", [], true)

  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-PAID01",
  })
  expect(tracking?.payment.paymentStatus).toBe("paid")
  expect(tracking?.payment.overpaymentDeltaMinor).toBe(0)

  const overTracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-OVER01",
  })
  expect(overTracking?.payment.paymentStatus).toBe("overpaid")
  expect(overTracking?.payment.overpaymentDeltaMinor).toBe(2000)
  expect(overTracking?.payment.totalPaidMinor).toBe(10000)
  expect(overTracking?.payment.totalDueMinor).toBe(8000)

  const unpaidTracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-45-UNPAID01",
  })
  expect(unpaidTracking?.payment.paymentStatus).toBe("unpaid")

  // Allocation board: paid before unpaid, and the overpaid attendee renders
  // as paid with the full paid amount (internal events record matched
  // payments regardless of provider order status).
  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: seed.eventId,
  })
  const stateByBooking = new Map(
    (board.unassignedAttendees as BoardAttendeeRow[])
      .filter((row) => row.orderId !== null)
      .map((row) => [row.attendeeId, row])
  )
  expect(stateByBooking.get(paid.attendeeId)?.paymentState).toBe("paid")
  expect(stateByBooking.get(paid.attendeeId)?.amountDueMinor).toBe(8000)
  expect(stateByBooking.get(paid.attendeeId)?.paidAmountMinor).toBe(8000)
  expect(stateByBooking.get(overpaid.attendeeId)?.paymentState).toBe("paid")
  expect(stateByBooking.get(overpaid.attendeeId)?.paidAmountMinor).toBe(10000)
  expect(stateByBooking.get(unpaid.attendeeId)?.paymentState).toBe("unpaid")
  expect(stateByBooking.get(unpaid.attendeeId)?.paidAmountMinor).toBe(0)

  // Reports: overpaid attendee exposes the donation/overpaid share.
  await insertReportShare(t, seed, "report-state01")
  const report = await t.query(api.reports.getFullReportByToken, {
    token: "report-state01",
  })
  expect(report?.aggregate?.totals.overpaidMinor).toBe(2000)

  // Auto-match inputs compare candidate payments to canonical due: an
  // unassigned payment of 8000 fits exactly and auto-matches to PAID01; a
  // 9999 payment cannot fit any canonical due and stays unassigned.
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "bank_transfer",
      payerName: "Paid Buyer",
      amountMinor: 8000,
      paidAt: BASE_EVENT_AT,
      status: "unassigned",
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "bank_transfer",
      payerName: "Paid Buyer",
      amountMinor: 9999,
      paidAt: BASE_EVENT_AT,
      status: "unassigned",
    })
  })
  const autoMatched = await t.mutation(api.payments.autoMatchPayments, {
    eventId: seed.eventId,
  })
  expect(autoMatched.matchedCount).toBe(1)
  const paymentRows = await t.query(async (ctx) => {
    return await ctx.db.query("payments").collect()
  })
  const matchedPayment = paymentRows.find((p) => p.amountMinor === 8000)
  const unmatchablePayment = paymentRows.find((p) => p.amountMinor === 9999)
  expect(matchedPayment?.status).toBe("auto_matched")
  expect(matchedPayment?.orderId).toBe(paid.orderId)
  // A payment that cannot fit any canonical due is never applied to an order:
  // it stays unassigned (or is flagged ambiguous by name score) with no
  // orderId — the amount authority rejected it.
  expect(unmatchablePayment?.orderId).toBeUndefined()
  expect(unmatchablePayment?.status).not.toBe("auto_matched")
})
