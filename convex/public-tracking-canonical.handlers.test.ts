/// <reference types="vite/client" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import { isOrderAppliedPayment } from "../lib/domain/finance/amounts"
import { mintEditRequestSignature } from "../lib/domain/track-payment/edit-token"

/**
 * Phase 56 plan 03, Task 4: the customer-facing tracker and the permalink edit
 * read are money REPORTS, so they consume the ONE canonical order-level owner
 * (`loadCanonicalOrderBalances`) instead of keeping a payment-only paid figure.
 *
 * Cases:
 *   1. an allocated order reads `paid` with zero remaining for the customer
 *      (before/after through the real `donations.allocateDonation` mutation),
 *      while `paymentCount` still counts applied payment rows;
 *   2. an allocation-free order's tracker payload is byte-identical to the
 *      legacy payment-only composition, computed in-test from the same rows;
 *   3. the permalink no-op (`unchanged`) read reports the canonical paid for an
 *      order cleared by an allocation, with no audit row written;
 *   4. the permalink applied read persists the PRE-edit due as
 *      `amountDueBeforeMinor` (never collapsed into the after-edit read) and
 *      canonical paid fields on the audit row;
 *   5. a structural guard keeps the local paid reader and the superseded due
 *      reader from coming back.
 *
 * The tracker suite uses a plain (non-accommodation) event; the edit suite
 * copies the configured-event helpers from `track-payment-edit.handlers.test.ts`
 * so the permalink contract is exercised exactly as shipped.
 */

const modules = import.meta.glob("./**/*.ts")

const TEST_TRACK_PAYMENT_SECRET = "test-track-payment-secret"
process.env.SIGNUP_SUBMISSION_SECRET = TEST_TRACK_PAYMENT_SECRET

const BASE_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

const adminIdentity = {
  tokenIdentifier: "admin:public-tracking-canonical",
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

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]) {
  return { method: "manual" as const, rows }
}

function uniqueIdempotencyKey(): string {
  return `edit-idem-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------------------
// Shared seeding helpers (file-local and minimal)
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
    totalAmountMinor?: number
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
        ...(input.totalAmountMinor !== undefined
          ? { totalAmountMinor: input.totalAmountMinor }
          : {}),
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

/**
 * The pre-change tracker composition, restated in the test from the same raw
 * rows the old code read: due from the canonical breakdown loader, paid from
 * the canonical-id payment index filtered by `isOrderAppliedPayment`, and the
 * arithmetic the tracker used to perform locally.
 */
async function readLegacyTrackerComposition(
  t: TestConvex,
  orderId: Id<"orders">
): Promise<{
  totalDueMinor: number
  appliedMinor: number
  remainingMinor: number
  overpaymentDeltaMinor: number
  progressPercent: number
  paymentCount: number
  paymentStatus: "unpaid" | "partial" | "paid" | "overpaid"
}> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      [{ _id: orderId }]
    )
    const totalDueMinor =
      dueBreakdownsByOrderId.get(String(orderId))?.amountDueMinor ?? 0

    let appliedMinor = 0
    let paymentCount = 0
    for await (const payment of ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", String(orderId)))) {
      if (!isOrderAppliedPayment(payment)) {
        continue
      }
      appliedMinor += Number(payment.amountMinor)
      paymentCount += 1
    }

    const remainingMinor = Math.max(0, totalDueMinor - appliedMinor)
    const overpaymentDeltaMinor = Math.max(0, appliedMinor - totalDueMinor)
    const paymentStatus: "unpaid" | "partial" | "paid" | "overpaid" =
      appliedMinor === 0
        ? "unpaid"
        : appliedMinor < totalDueMinor
          ? "partial"
          : appliedMinor === totalDueMinor
            ? "paid"
            : "overpaid"
    const progressPercent =
      totalDueMinor <= 0
        ? 100
        : Math.min(100, Math.round((appliedMinor / totalDueMinor) * 100))

    return {
      totalDueMinor,
      appliedMinor,
      remainingMinor,
      overpaymentDeltaMinor,
      progressPercent,
      paymentCount,
      paymentStatus,
    }
  })
}

// ---------------------------------------------------------------------------
// Cases 1-2: the tracker
// ---------------------------------------------------------------------------

test("an allocated order reads paid with zero remaining on the tracker while an allocation-free order is byte-identical", async () => {
  const seeded = fresh()
  const authed = seeded.withIdentity(adminIdentity)
  const eventId = await seedEvent(seeded, "tracker-canonical")

  // Order L: due 20000 (A 12000, B 8000), a 10000 real applied payment, and a
  // stored provider total of 4000 deliberately different from the live due.
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "track-l-a",
    name: "Tracked A",
    ticketPriceMinor: 12_000,
    bookingRef: "BK-TRACK-L",
    totalAmountMinor: 4_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "track-l-b",
    name: "Tracked B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, a.orderId, 10_000)

  // Order N: the same shape with NO allocation — the byte-identity control.
  const n = await createAttendee(seeded, eventId, {
    attendeeKey: "track-n-a",
    name: "Control A",
    ticketPriceMinor: 12_000,
    bookingRef: "BK-TRACK-N",
    totalAmountMinor: 4_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: n.orderId,
    attendeeKey: "track-n-b",
    name: "Control B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  await createAppliedPayment(seeded, eventId, n.orderId, 10_000)

  // --- Case 1 pre-allocation: payment-only semantics ------------------------
  const beforeL = await seeded.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-TRACK-L",
  })
  expect(beforeL?.payment).toEqual({
    totalDueMinor: 20_000,
    totalPaidMinor: 10_000,
    remainingMinor: 10_000,
    progressPercent: 50,
    overpaymentDeltaMinor: 0,
    paymentCount: 1,
    paymentStatus: "partial",
  })
  expect(beforeL?.order.amountDueMinor).toBe(20_000)
  expect(beforeL?.order.totalAmountMinor).toBe(4_000)

  // --- Case 1: a real whole_order allocation through the production mutation
  const donationId = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 10_000,
  })
  const allocationResult = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: b.attendeeId, amountMinor: 10_000, scope: "whole_order" },
    ]),
    idempotencyKey: "tracker-canonical-l",
  })
  expect(allocationResult).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 0,
  })

  const afterL = await seeded.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-TRACK-L",
  })
  expect(afterL?.payment).toEqual({
    totalDueMinor: 20_000,
    totalPaidMinor: 20_000,
    remainingMinor: 0,
    progressPercent: 100,
    overpaymentDeltaMinor: 0,
    paymentCount: 1,
    paymentStatus: "paid",
  })
  expect(afterL?.order.amountDueMinor).toBe(20_000)
  // The stored provider total stays exposed verbatim.
  expect(afterL?.order.totalAmountMinor).toBe(4_000)
  // The tracker is a report: no allocation detail leaks into the payload.
  expect(Object.keys(afterL?.payment ?? {}).sort()).toEqual([
    "overpaymentDeltaMinor",
    "paymentCount",
    "paymentStatus",
    "progressPercent",
    "remainingMinor",
    "totalDueMinor",
    "totalPaidMinor",
  ])
  expect(afterL?.tikkieUrl).toBeNull()
  expect(afterL?.tikkieAmountMinor).toBeNull()
  expect(afterL?.tikkieDescription).toBeNull()

  // The outstanding drop equals the allocated 10000 exactly.
  expect(
    (beforeL?.payment.remainingMinor ?? 0) -
      (afterL?.payment.remainingMinor ?? 0)
  ).toBe(10_000)

  // Same payload through the email-or-ref query.
  const afterByEmail = await seeded.query(
    api.publicTracking.getByEmailOrBookingRef,
    { emailOrBookingRef: "BK-TRACK-L" }
  )
  expect(afterByEmail?.payment).toEqual(afterL?.payment)

  // --- Case 2: the allocation-free control is byte-identical ---------------
  const legacyN = await readLegacyTrackerComposition(seeded, n.orderId)
  expect(legacyN).toEqual({
    totalDueMinor: 20_000,
    appliedMinor: 10_000,
    remainingMinor: 10_000,
    overpaymentDeltaMinor: 0,
    progressPercent: 50,
    paymentCount: 1,
    paymentStatus: "partial",
  })

  const trackerN = await seeded.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-TRACK-N",
  })
  expect(trackerN?.payment).toEqual({
    totalDueMinor: legacyN.totalDueMinor,
    totalPaidMinor: legacyN.appliedMinor,
    remainingMinor: legacyN.remainingMinor,
    progressPercent: legacyN.progressPercent,
    overpaymentDeltaMinor: legacyN.overpaymentDeltaMinor,
    paymentCount: legacyN.paymentCount,
    paymentStatus: legacyN.paymentStatus,
  })
  expect(trackerN?.order).toEqual({
    buyerName: "Booker",
    buyerPhone: null,
    submittedAt: BASE_AT,
    orderedAt: null,
    totalAmountMinor: 4_000,
    amountDueMinor: legacyN.totalDueMinor,
    status: null,
  })
  expect(trackerN?.bookingRef).toBe("BK-TRACK-N")
})

// ---------------------------------------------------------------------------
// Edit-path helpers, copied from `track-payment-edit.handlers.test.ts`
// ---------------------------------------------------------------------------

type SeedContext = {
  eventId: Id<"events">
  categoryStandardId: Id<"accommodationCategories">
  categorySuperiorId: Id<"accommodationCategories">
  unconstrainedTicketId: Id<"ticketTypes">
  constrainedTicketId: Id<"ticketTypes">
}

type OrderContext = {
  orderId: Id<"orders">
  attendeeOneId: Id<"orderAttendees">
  attendeeTwoId: Id<"orderAttendees">
  bookingRef: string
}

async function createConfiguredEvent(
  t: TestConvex,
  slug: string
): Promise<SeedContext> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug,
      title: "Tracker Canonical Event",
      startsAt: BASE_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_AT,
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

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: BASE_AT - 2 * DAY_MS,
      baseCheckOutAt: BASE_AT,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: BASE_AT,
    })
  })

  for (const rate of [
    { categoryId: categoryStandardId, occupancy: "shared", pricePerPersonMinor: 3000 },
    { categoryId: categoryStandardId, occupancy: "single", pricePerPersonMinor: 5000 },
    { categoryId: categorySuperiorId, occupancy: "shared", pricePerPersonMinor: 4500 },
    { categoryId: categorySuperiorId, occupancy: "single", pricePerPersonMinor: 6500 },
  ]) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("eventAccommodationRates", {
        eventId: eventId as never,
        categoryId: rate.categoryId as never,
        occupancy: rate.occupancy as "single" | "shared" | "family",
        pricePerPersonMinor: rate.pricePerPersonMinor,
      })
    })
  }

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: cotOptionId as never,
      enabled: true,
      priceMinor: 500,
    })
  })

  const constrainedRoomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Superior Suite",
      defaultCapacity: 2,
      categoryId: categorySuperiorId as never,
    })
  })

  const unconstrainedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Unconstrained ticket",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_AT,
    })
  })
  const constrainedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Superior-suite ticket",
      priceMinor: 2500,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      roomTypeId: constrainedRoomTypeId as never,
      updatedAt: BASE_AT,
    })
  })

  return {
    eventId: eventId as Id<"events">,
    categoryStandardId: categoryStandardId as Id<"accommodationCategories">,
    categorySuperiorId: categorySuperiorId as Id<"accommodationCategories">,
    unconstrainedTicketId: unconstrainedTicketId as Id<"ticketTypes">,
    constrainedTicketId: constrainedTicketId as Id<"ticketTypes">,
  }
}

/**
 * An order with two attendees and their unconfirmed options-only selections:
 * a-1 = 2000 + 2×3000 = 8000; a-2 = 2500 + 2×3000 = 8500; total 16500.
 */
async function createOrderWithSelections(
  t: TestConvex,
  seed: SeedContext,
  input: { bookingRef: string }
): Promise<OrderContext> {
  const bookingRef = input.bookingRef

  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef,
      bookerName: "Booker",
      bookerEmail: "booker@example.com",
      bookerPhone: "+31612345678",
      submittedAt: BASE_AT,
    })
  })

  const attendeeOneId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "a-1",
      name: "Attendee One",
      gender: "female" as const,
      sortOrder: 0,
    })
  })
  const attendeeTwoId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "a-2",
      name: "Attendee Two",
      gender: "male" as const,
      sortOrder: 1,
    })
  })

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeOneId as never,
      ticketTypeId: seed.unconstrainedTicketId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeTwoId as never,
      ticketTypeId: seed.constrainedTicketId as never,
      quantity: 1,
      sortOrder: 1,
    })
  })

  for (const [attendeeId, categoryId, occupancy] of [
    [attendeeOneId, seed.categoryStandardId, "shared"],
    [attendeeTwoId, seed.categoryStandardId, "shared"],
  ]) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: categoryId as never,
        occupancy: occupancy as "single" | "shared" | "family",
        checkInAt: BASE_AT - 2 * DAY_MS,
        checkOutAt: BASE_AT,
        nightCount: 2,
      })
    })
  }

  return {
    orderId: orderId as Id<"orders">,
    attendeeOneId: attendeeOneId as Id<"orderAttendees">,
    attendeeTwoId: attendeeTwoId as Id<"orderAttendees">,
    bookingRef,
  }
}

function replacement(input: {
  attendeeKey: string
  categoryId?: Id<"accommodationCategories">
  occupancy: "single" | "shared" | "family"
  nightBeforeLevel?: "standard" | "superior"
  optionSelections?: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
}): {
  attendeeKey: string
  categoryId?: Id<"accommodationCategories">
  occupancy: "single" | "shared" | "family"
  nightBeforeLevel?: "standard" | "superior"
  optionSelections: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
} {
  return {
    attendeeKey: input.attendeeKey,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    occupancy: input.occupancy,
    ...(input.nightBeforeLevel
      ? { nightBeforeLevel: input.nightBeforeLevel }
      : {}),
    optionSelections: input.optionSelections ?? [],
  }
}

async function signEditEnvelope(input: {
  bookingRef: string
  bookerEmail?: string | null
  editToken?: string | null
  idempotencyKey: string
  selections: ReturnType<typeof replacement>[]
}): Promise<string> {
  return mintEditRequestSignature({
    bookingRef: input.bookingRef,
    bookerEmail: input.bookerEmail ?? null,
    editToken: input.editToken ?? null,
    idempotencyKey: input.idempotencyKey,
    selections: input.selections,
    secret: TEST_TRACK_PAYMENT_SECRET,
  })
}

async function loadAmountDue(
  t: TestConvex,
  orderId: Id<"orders">
): Promise<number> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: orderId },
    ])
    return breakdowns.get(String(orderId))?.amountDueMinor ?? 0
  })
}

type AuditRow = {
  orderId: string
  amountDueBeforeMinor: number
  amountDueAfterMinor: number
  totalPaidMinor: number
  remainingMinor: number
  progressPercent: number
  overpaymentDeltaMinor: number
}

async function readAuditRows(t: TestConvex): Promise<AuditRow[]> {
  return t.query(async (ctx) => {
    const rows: AuditRow[] = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push({
        orderId: String(row.orderId),
        amountDueBeforeMinor: Number(row.amountDueBeforeMinor),
        amountDueAfterMinor: Number(row.amountDueAfterMinor),
        totalPaidMinor: Number(row.totalPaidMinor),
        remainingMinor: Number(row.remainingMinor),
        progressPercent: Number(row.progressPercent),
        overpaymentDeltaMinor: Number(row.overpaymentDeltaMinor),
      })
    }
    return rows
  })
}

// ---------------------------------------------------------------------------
// Case 3: the permalink no-op read is canonical
// ---------------------------------------------------------------------------

test("the permalink no-op read reports the canonical paid on an order cleared by an allocation", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t, "tracker-canonical-unchanged")
  const order = await createOrderWithSelections(t, seed, {
    bookingRef: "BK-CANON-UNCHANGED",
  })

  // Size the allocation to clear the order's remaining outstanding: the due is
  // 16500 with no real applied payments.
  const amountDue = await loadAmountDue(t, order.orderId)
  expect(amountDue).toBe(16_500)

  const donationId = await createStandaloneDonation(authed, {
    eventId: seed.eventId,
    amountMinor: amountDue,
  })
  const allocationResult = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId: seed.eventId,
    request: manualRequest([
      {
        attendeeId: order.attendeeOneId,
        amountMinor: amountDue,
        scope: "whole_order",
      },
    ]),
    idempotencyKey: "canonical-unchanged-allocation",
  })
  expect(allocationResult).toMatchObject({
    allocatedTotalMinor: 16_500,
    remainingMinor: 0,
  })

  // An identical replacement reaches the `unchanged` no-op branch.
  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: "BK-CANON-UNCHANGED",
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: "BK-CANON-UNCHANGED",
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    selections,
  })

  expect(result.status).toBe("unchanged")
  expect(result.amountDueMinor).toBe(16_500)
  // Canonical paid: the allocation cleared the order even though the
  // payment-only sum is 0. The pre-change read would report 0 / 16500 here.
  expect(result.totalPaidMinor).toBe(16_500)
  expect(result.remainingMinor).toBe(0)
  expect(result.progressPercent).toBe(100)
  expect(result.overpaymentDeltaMinor).toBe(0)

  // The no-op contract is unchanged: no audit row is written.
  expect(await readAuditRows(t)).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Case 4: the applied read persists the PRE-edit due as the audit basis
// ---------------------------------------------------------------------------

test("the permalink applied read keeps the pre-edit audit basis and canonical paid fields", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t, "tracker-canonical-applied")
  const order = await createOrderWithSelections(t, seed, {
    bookingRef: "BK-CANON-APPLIED",
  })

  const amountDueBefore = await loadAmountDue(t, order.orderId)
  expect(amountDueBefore).toBe(16_500)

  // An allocation clears the order's remaining outstanding (no real payments).
  const donationId = await createStandaloneDonation(authed, {
    eventId: seed.eventId,
    amountMinor: amountDueBefore,
  })
  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId: seed.eventId,
    request: manualRequest([
      {
        attendeeId: order.attendeeTwoId,
        amountMinor: amountDueBefore,
        scope: "whole_order",
      },
    ]),
    idempotencyKey: "canonical-applied-allocation",
  })

  // A CHANGED replacement (the optional night-before raises each attendee's
  // due by one night) reaches the `applied` branch and moves the due from
  // 16500 to 22500, so before and after are different numbers.
  const selections = [
    replacement({
      attendeeKey: "a-1",
      occupancy: "shared",
      nightBeforeLevel: "standard",
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      nightBeforeLevel: "standard",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: "BK-CANON-APPLIED",
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: "BK-CANON-APPLIED",
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    selections,
  })

  expect(result.status).toBe("applied")
  expect(result.amountDueMinor).toBe(22_500)
  // Canonical paid: 16500 of allocation credit and no real payments. A
  // payment-only read would report totalPaidMinor 0 / remainingMinor 22500.
  expect(result.totalPaidMinor).toBe(16_500)
  expect(result.remainingMinor).toBe(6_000)
  expect(result.progressPercent).toBe(73)
  expect(result.overpaymentDeltaMinor).toBe(0)
  expect(await loadAmountDue(t, order.orderId)).toBe(22_500)

  const audits = await readAuditRows(t)
  expect(audits).toHaveLength(1)
  const audit = audits[0]
  expect(audit.orderId).toBe(String(order.orderId))
  // CR-08: the persisted BEFORE basis is the PRE-edit due. Collapsing the
  // standalone before-read into the after-read would record 22500 here, and
  // this pair of assertions is what discriminates the two implementations.
  expect(audit.amountDueBeforeMinor).toBe(16_500)
  expect(audit.amountDueBeforeMinor).not.toBe(audit.amountDueAfterMinor)
  expect(audit.amountDueAfterMinor).toBe(22_500)
  // The audit's paid fields are canonical too.
  expect(audit.totalPaidMinor).toBe(16_500)
  expect(audit.remainingMinor).toBe(6_000)
  expect(audit.progressPercent).toBe(73)
  expect(audit.overpaymentDeltaMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Case 5: structural guard
// ---------------------------------------------------------------------------

test("the tracker file keeps no local paid reader and no superseded due reader", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "publicTracking.ts"),
    "utf8"
  )

  // The canonical owner is wired in.
  expect(source).toContain("loadCanonicalOrderBalances")
  // Neither the deleted paid helper nor the superseded due loader may return.
  expect(source).not.toContain("loadPaidTotalForOrder")
  expect(source).not.toContain("loadOrderAmountDueBreakdowns")
  // The paid-reduce idiom is the second owner this plan removed.
  expect(source).not.toContain("sum + payment.amountMinor")
  // The public surface did not grow: no allocation rows or attendee ids.
  expect(source).not.toContain("donationAllocations")
  expect(source).not.toContain("allocationCreditMinor")
})
