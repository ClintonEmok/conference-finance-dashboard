/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import {
  mintEditRequestSignature,
  mintTrackPaymentEditToken,
  verifyTrackPaymentEditToken,
} from "../lib/domain/track-payment/edit-token"

const modules = import.meta.glob("./**/*.ts")

const TEST_TRACK_PAYMENT_SECRET = "test-track-payment-secret"
process.env.SIGNUP_SUBMISSION_SECRET = TEST_TRACK_PAYMENT_SECRET

function fresh() {
  return convexTest(schema, modules)
}

const BASE_EVENT_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000
const BOOKING_REF = "BK-20260806-TEST01"
const CONFIRMED_REF = "BK-20260806-CONF01"

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
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "track-payment-edit-event",
      title: "Track Payment Edit Event",
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
  const upgradeOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "superior_upgrade",
      label: "Superior Upgrade",
      kind: "upgrade",
      unit: "per_night",
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
    return await ctx.db.insert("accommodationAgeBands", {
      code: "under_3",
      label: "Under 3",
      minAge: 0,
      maxAge: 3,
      sortOrder: 1,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationAgeBands", {
      code: "18_plus",
      label: "18 and over",
      minAge: 18,
      sortOrder: 4,
    })
  })

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
      baseCheckOutAt: BASE_EVENT_AT,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: BASE_EVENT_AT,
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
      optionId: upgradeOptionId as never,
      enabled: true,
      priceMinor: 1500,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: cotOptionId as never,
      enabled: true,
      priceMinor: 500,
      eligibilityAgeBandCode: "under_3" as never,
    })
  })

  for (const agePricing of [
    { ageBandCode: "18_plus", rateType: "full", value: 0, sortOrder: 1 },
    { ageBandCode: "under_3", rateType: "free", value: 0, sortOrder: 2 },
  ]) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("eventAccommodationAgePricing", {
        eventId: eventId as never,
        ageBandCode: agePricing.ageBandCode as never,
        rateType: agePricing.rateType as "free" | "full" | "percent" | "flat",
        value: agePricing.value,
        sortOrder: agePricing.sortOrder,
      })
    })
  }

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
      updatedAt: BASE_EVENT_AT,
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
      updatedAt: BASE_EVENT_AT,
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
 * Creates an order with two attendees and their unconfirmed options-only
 * selections. a-1 holds the unconstrained ticket (standard/shared/18_plus),
 * a-2 holds the superior-suite ticket (superior/shared/18_plus). Original
 * canonical amount due: a-1 = 2000 + 2×3000 = 8000; a-2 = 2500 + 2×4500 =
 * 11500; total 19500.
 */
async function createOrderWithSelections(
  t: TestConvexForDataModel<GenericDataModel>,
  seed: SeedContext,
  input: {
    bookingRef?: string
    bookerEmail?: string
    confirmed?: boolean
    withPaymentMinor?: number
    withTikkieLink?: boolean
    totalAmountMinor?: number
  } = {}
): Promise<OrderContext> {
  const bookingRef = input.bookingRef ?? BOOKING_REF
  const bookerEmail = input.bookerEmail ?? "booker@example.com"

  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef,
      bookerName: "Booker",
      bookerEmail,
      bookerPhone: "+31612345678",
      submittedAt: BASE_EVENT_AT,
      ...(input.totalAmountMinor !== undefined
        ? { totalAmountMinor: input.totalAmountMinor }
        : {}),
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

  const confirmedAt = input.confirmed ? BASE_EVENT_AT : undefined
  const configVersion = input.confirmed ? BASE_EVENT_AT : undefined
  const priceSnapshot = input.confirmed
    ? {
        baseRatePerNightMinor: 3000,
        upgradeRatePerNightMinor: 1500,
        cotRatePerNightMinor: 500,
        totalNights: 2,
        coveredNights: 0,
        categoryIsSuperior: false,
        upgradeSelected: false,
        cotSelected: false,
        ageBandCode: "18_plus",
        cotEligibilityAgeBandCode: null,
      }
    : undefined

  for (const [attendeeId, categoryId, occupancy] of [
    [attendeeOneId, seed.categoryStandardId, "shared"],
    [attendeeTwoId, seed.categorySuperiorId, "shared"],
  ]) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: categoryId as never,
        occupancy: occupancy as "single" | "shared" | "family",
        upgradeSelected: false,
        cotSelected: false,
        ageBandCode: "18_plus" as never,
        checkInAt: BASE_EVENT_AT - 2 * DAY_MS,
        checkOutAt: BASE_EVENT_AT,
        nightCount: 2,
        confirmedAt: confirmedAt as never,
        configVersion: configVersion as never,
        priceSnapshot: priceSnapshot as never,
      })
    })
  }

  if (input.withPaymentMinor !== undefined) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("payments", {
        source: "tikkie" as const,
        sourceId: "tikkie-payment-1",
        payerName: "Booker",
        amountMinor: input.withPaymentMinor as number,
        paidAt: BASE_EVENT_AT - DAY_MS,
        eventId: seed.eventId as never,
        orderId: String(orderId),
        status: "auto_matched" as const,
        matchedAt: BASE_EVENT_AT - DAY_MS,
      })
    })
  }

  if (input.withTikkieLink) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("tikkiePaymentLinks", {
        providerOrderId: "provider-order-1",
        providerEventId: "provider-event-1",
        orderId: String(orderId),
        eventId: String(seed.eventId),
        linkType: "order",
        paymentRequestToken: "prt-flexible-zero",
        paymentRequestUrl: "https://pay.example.com/tikkie/flexible-zero-1",
        status: "created",
        statusSource: "create",
        providerStatus: "OPEN",
        amountMinor: 0,
        description: "Flexible payment request",
        expiryDate: BASE_EVENT_AT + 30 * DAY_MS,
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

type EditAgeBandCode = "under_3" | "3_11" | "12_17" | "18_plus"

function replacement(input: {
  attendeeKey: string
  categoryId: Id<"accommodationCategories">
  occupancy: "single" | "shared" | "family"
  upgradeSelected?: boolean
  cotSelected?: boolean
  ageBandCode?: EditAgeBandCode | null
}): {
  attendeeKey: string
  categoryId: Id<"accommodationCategories">
  occupancy: "single" | "shared" | "family"
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode?: EditAgeBandCode
} {
  return {
    attendeeKey: input.attendeeKey,
    categoryId: input.categoryId,
    occupancy: input.occupancy,
    upgradeSelected: input.upgradeSelected ?? false,
    cotSelected: input.cotSelected ?? false,
    ageBandCode: input.ageBandCode ?? undefined,
  }
}

async function signEditEnvelope(input: {
  bookingRef: string
  bookerEmail?: string | null
  editToken?: string | null
  idempotencyKey: string
  honeypotSeen?: boolean
  selections: ReturnType<typeof replacement>[]
}): Promise<string> {
  return mintEditRequestSignature({
    bookingRef: input.bookingRef,
    bookerEmail: input.bookerEmail ?? null,
    editToken: input.editToken ?? null,
    idempotencyKey: input.idempotencyKey,
    honeypotSeen: input.honeypotSeen ?? false,
    selections: input.selections,
    secret: TEST_TRACK_PAYMENT_SECRET,
  })
}

async function loadAmountDue(
  t: TestConvexForDataModel<GenericDataModel>,
  orderId: string
): Promise<number | null> {
  return t.query(async (ctx) => {
    const loaderCtx =
      ctx as unknown as Parameters<typeof loadOrderAmountDueBreakdowns>[0]
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: orderId as never },
    ])
    return breakdowns.get(String(orderId))?.amountDueMinor ?? null
  })
}

function uniqueIdempotencyKey(): string {
  return `edit-idem-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------------------
// Edit-context projection
// ---------------------------------------------------------------------------

test("edit-context projection returns bounded selections, choices, and lock state without credentials", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const context = await t.query(api.publicTracking.getTrackPaymentEditContext, {
    bookingRef: "  bk-20260806-test01  ",
  })

  expect(context).not.toBeNull()
  expect(context?.bookingRef).toBe(BOOKING_REF)
  expect(context?.event.currency).toBe("EUR")
  expect(context?.locked).toBe(false)
  expect(context?.hasSelections).toBe(true)
  expect(context?.selections).toHaveLength(2)
  expect(context?.selections.map((s) => s.attendeeKey).sort()).toEqual([
    "a-1",
    "a-2",
  ])
  expect(context?.selections[0].attendeeName).toBeTruthy()
  expect(context?.selections[0].ticketLabel).toBeTruthy()
  expect(context?.selections.every((s) => s.confirmed === false)).toBe(true)

  // Ticket entitlement: a-1 holds the unconstrained ticket (no category
  // restriction), a-2 holds the superior-suite ticket (resolved to the
  // superior category).
  const a1 = context?.selections.find((s) => s.attendeeKey === "a-1")
  const a2 = context?.selections.find((s) => s.attendeeKey === "a-2")
  expect(a1?.ticketCategoryId).toBeUndefined()
  expect(a2?.ticketCategoryId).toBe(seed.categorySuperiorId)

  const categories = context?.accommodation.activeCategories ?? []
  expect(categories.map((c) => c.code).sort()).toEqual(["standard", "superior"])
  const standard = categories.find((c) => c.code === "standard")
  expect(standard?.rates).toContainEqual({
    occupancy: "shared",
    pricePerPersonMinor: 3000,
  })
  expect(context?.accommodation.options.map((o) => o.optionCode).sort()).toEqual(
    ["cot", "superior_upgrade"]
  )
  expect(context?.accommodation.ageBands.map((b) => b.code).sort()).toEqual([
    "18_plus",
    "under_3",
  ])
  expect(context?.accommodation.config?.nightCount).toBe(2)

  // No raw credential is ever returned by a public query.
  const serialized = JSON.stringify(context)
  expect(serialized).not.toContain("token")
  expect(serialized).not.toContain("signature")
  expect(serialized).not.toContain("paymentRequestToken")
})

test("edit-context projection returns null for unknown references and renders confirmed rows locked", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)

  expect(
    await t.query(api.publicTracking.getTrackPaymentEditContext, {
      bookingRef: "BK-99999999-NOPE01",
    })
  ).toBeNull()

  await createOrderWithSelections(t, seed, {
    bookingRef: CONFIRMED_REF,
    confirmed: true,
  })
  const confirmed = await t.query(
    api.publicTracking.getTrackPaymentEditContext,
    { bookingRef: CONFIRMED_REF }
  )
  expect(confirmed?.locked).toBe(true)
  expect(confirmed?.selections.every((s) => s.confirmed === true)).toBe(true)
})

// ---------------------------------------------------------------------------
// Ownership gates and request signatures
// ---------------------------------------------------------------------------

test("email ownership succeeds and returns an applied result with canonical re-price", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "  BOOKER@example.com ",
    idempotencyKey,
    selections,
  })

  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "  BOOKER@example.com ",
    requestSignature,
    idempotencyKey,
    honeypotSeen: false,
    selections,
  })

  expect(result.status).toBe("applied")
  // a-1: 2000 + 2×4500 = 11000; a-2: 2500 + 2×4500 = 11500; total 22500.
  expect(result.amountDueMinor).toBe(22500)
  expect(result.overpaymentDeltaMinor).toBe(0)

  // The canonical loader agrees with the mutation's server-derived total.
  expect(await loadAmountDue(t, String(order.orderId))).toBe(22500)
})

test("HMAC edit token ownership succeeds without email", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const editToken = await mintTrackPaymentEditToken({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    secret: TEST_TRACK_PAYMENT_SECRET,
  })
  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: null,
    editToken,
    idempotencyKey,
    selections,
  })

  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    editToken,
    requestSignature,
    idempotencyKey,
    honeypotSeen: false,
    selections,
  })

  expect(result.status).toBe("applied")
  // a-1: 2000 + 2×4500 = 11000; a-2: 2500 + 2×4500 = 11500 → 22500.
  expect(result.amountDueMinor).toBe(22500)

  // The audit row records the token ownership method.
  const allAudits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(allAudits).toHaveLength(1)
  expect(allAudits[0].ownershipMethod).toBe("token")
  expect(allAudits[0].orderId).toBe(order.orderId)
})

test("unsigned and mis-signed direct calls are rejected before any write", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: "forged.signature",
      idempotencyKey,
      honeypotSeen: false,
      selections,
    })
  ).rejects.toThrow("SIGNATURE_REQUIRED")

  // A signature bound to a different envelope (changed selections) is also
  // rejected, and no audit row or selection change is written.
  const wrongSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections: [
      replacement({
        attendeeKey: "a-1",
        categoryId: seed.categoryStandardId,
        occupancy: "single",
        ageBandCode: "18_plus",
      }),
      replacement({
        attendeeKey: "a-2",
        categoryId: seed.categorySuperiorId,
        occupancy: "shared",
        ageBandCode: "18_plus",
      }),
    ],
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: wrongSignature,
      idempotencyKey,
      honeypotSeen: false,
      selections,
    })
  ).rejects.toThrow("SIGNATURE_REQUIRED")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(19500)
  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
})

test("wrong ownership fails without leaking editability and without writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyOne = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "attacker@example.com",
    idempotencyKey: keyOne,
    selections,
  })

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "attacker@example.com",
      requestSignature,
      idempotencyKey: keyOne,
      honeypotSeen: false,
      selections,
    })
  ).rejects.toThrow("EDIT_OWNERSHIP")

  // A wrong edit token also fails.
  const keyTwo = uniqueIdempotencyKey()
  const wrongTokenSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: null,
    editToken: "forged-token",
    idempotencyKey: keyTwo,
    selections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      editToken: "forged-token",
      requestSignature: wrongTokenSignature,
      idempotencyKey: keyTwo,
      honeypotSeen: false,
      selections,
    })
  ).rejects.toThrow("EDIT_OWNERSHIP")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(19500)
})

test("client price, stay, room, slot and snapshot fields are rejected at the mutation boundary", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const baseSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyOne = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey: keyOne,
    selections: baseSelections,
  })

  const tampered = {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey: keyOne,
    honeypotSeen: false,
    selections: baseSelections,
    // A client-supplied total the mutation must never accept.
    totalAmountMinor: 1,
  } as never

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, tampered)
  ).rejects.toThrow()

  // Same for a client night count inside a selection.
  const keyTwo = uniqueIdempotencyKey()
  const tamperedSelection = {
    ...baseSelections[0],
    nightCount: 99,
  }
  const tampered2 = {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: await signEditEnvelope({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      idempotencyKey: keyTwo,
      selections: [tamperedSelection, baseSelections[1]],
    }),
    idempotencyKey: keyTwo,
    honeypotSeen: false,
    selections: [tamperedSelection, baseSelections[1]],
  }
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, tampered2)
  ).rejects.toThrow()

  expect(await loadAmountDue(t, String(order.orderId))).toBe(19500)
  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
})

test("stale and cross-event choices are rejected before writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const otherEvent = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  // A category from another event is not in this event's active set.
  const crossEventSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: otherEvent.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyOne = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey: keyOne,
    selections: crossEventSelections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature,
      idempotencyKey: keyOne,
      honeypotSeen: false,
      selections: crossEventSelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  // An invalid age/cot combination fails the shared resolver.
  const invalidCotSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
      cotSelected: true,
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyTwo = uniqueIdempotencyKey()
  const cotSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey: keyTwo,
    selections: invalidCotSelections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: cotSignature,
      idempotencyKey: keyTwo,
      honeypotSeen: false,
      selections: invalidCotSelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  // A constrained ticket cannot move to a different category.
  const constrainedBreakSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyThree = uniqueIdempotencyKey()
  const constrainedSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey: keyThree,
    selections: constrainedBreakSelections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: constrainedSignature,
      idempotencyKey: keyThree,
      honeypotSeen: false,
      selections: constrainedBreakSelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  // A replacement missing one attendee is rejected (cardinality).
  const partialSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyFour = uniqueIdempotencyKey()
  const partialSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey: keyFour,
    selections: partialSelections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: partialSignature,
      idempotencyKey: keyFour,
      honeypotSeen: false,
      selections: partialSelections,
    })
  ).rejects.toThrow("EDIT_CONFLICT")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(19500)
})

// ---------------------------------------------------------------------------
// confirmedAt guard, replace persistence, no-op, replay, audit, overpayment
// ---------------------------------------------------------------------------

test("confirmed orders reject edits atomically", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed, {
    bookingRef: CONFIRMED_REF,
    confirmed: true,
  })

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: CONFIRMED_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: CONFIRMED_REF,
      bookerEmail: "booker@example.com",
      requestSignature,
      idempotencyKey,
      honeypotSeen: false,
      selections,
    })
  ).rejects.toThrow("EDIT_CONFIRMED")

  // The confirmed rows are untouched (still carry their snapshot contract).
  const rows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", String(order.orderId) as never))
      .take(10)
  })
  expect(rows.every((row) => row.confirmedAt !== undefined)).toBe(true)
})

test("applied edits persist server-resolved preferences and stay fields and leave order total, payments, assignments, and Tikkie links untouched", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed, {
    withPaymentMinor: 10000,
    withTikkieLink: true,
    totalAmountMinor: 19500,
  })

  // Snapshot the untouched documents before the edit.
  const beforeOrder = await t.query(async (ctx) => {
    return await ctx.db.get(order.orderId)
  })
  const beforePayments = await t.query(async (ctx) => {
    return await ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", String(order.orderId)))
      .take(10)
  })
  const beforeAssignments = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAssignments")
      .withIndex("by_orderId", (q) => q.eq("orderId", String(order.orderId) as never))
      .take(10)
  })
  const beforeTikkie = await t.query(async (ctx) => {
    return await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("orderId", (q) => q.eq("orderId", String(order.orderId)))
      .take(10)
  })

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
      upgradeSelected: true,
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    honeypotSeen: false,
    selections,
  })

  expect(result.status).toBe("applied")
  // a-1: 2000 + 2×4500 = 11000 (superior base; upgrade flag is redundant for
  // the superior category so no separate upgrade line); a-2: 11500 → 22500.
  expect(result.amountDueMinor).toBe(22500)

  // The persisted selection rows carry the server-resolved stay fields.
  const rows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", String(order.orderId) as never))
      .take(10)
  })
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(row.nightCount).toBe(2)
    expect(row.checkInAt).toBe(BASE_EVENT_AT - 2 * DAY_MS)
    expect(row.checkOutAt).toBe(BASE_EVENT_AT)
    expect(row.confirmedAt).toBeUndefined()
  }
  const attendeeKeys = new Map<string, string>()
  for (const attendee of await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", String(order.orderId) as never))
      .take(10)
  })) {
    attendeeKeys.set(String(attendee._id), attendee.attendeeKey)
  }
  const a1Row = rows.find((r) => attendeeKeys.get(String(r.attendeeId)) === "a-1")
  expect(a1Row?.categoryId).toBe(seed.categorySuperiorId)
  expect(a1Row?.occupancy).toBe("shared")

  // Nothing outside the selection rows changes.
  const afterOrder = await t.query(async (ctx) => {
    return await ctx.db.get(order.orderId)
  })
  const afterPayments = await t.query(async (ctx) => {
    return await ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", String(order.orderId)))
      .take(10)
  })
  const afterAssignments = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAssignments")
      .withIndex("by_orderId", (q) => q.eq("orderId", String(order.orderId) as never))
      .take(10)
  })
  const afterTikkie = await t.query(async (ctx) => {
    return await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("orderId", (q) => q.eq("orderId", String(order.orderId)))
      .take(10)
  })

  expect(afterOrder).toEqual(beforeOrder)
  expect(afterOrder?.totalAmountMinor).toBe(19500)
  expect(afterPayments).toEqual(beforePayments)
  expect(afterAssignments).toEqual(beforeAssignments)
  expect(afterTikkie).toEqual(beforeTikkie)
  // The flexible-zero Tikkie link is untouched and stays zero.
  expect(beforeTikkie[0]?.amountMinor).toBe(0)
  expect(afterTikkie[0]?.paymentRequestUrl).toBe(
    "https://pay.example.com/tikkie/flexible-zero-1"
  )
})

test("an identical replacement is a true no-op with no audit row", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    honeypotSeen: false,
    selections,
  })

  expect(result.status).toBe("unchanged")
  expect(result.amountDueMinor).toBe(19500)

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
  expect(await loadAmountDue(t, String(order.orderId))).toBe(19500)
})

test("an already-used idempotency key replays its stored result without duplicate writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  const first = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    honeypotSeen: false,
    selections,
  })
  expect(first.status).toBe("applied")
  expect(first.amountDueMinor).toBe(22500)

  // Retry with the same key and identical envelope: replayed, same result.
  const second = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    honeypotSeen: false,
    selections,
  })
  expect(second.status).toBe("replayed")
  expect(second.amountDueMinor).toBe(22500)

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(1)
  expect(await loadAmountDue(t, String(order.orderId))).toBe(22500)
})

test("distinct applied edits produce distinct append-only server-valued audit rows", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const editOne = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyOne = uniqueIdempotencyKey()
  const resultOne = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: await signEditEnvelope({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      idempotencyKey: keyOne,
      selections: editOne,
    }),
    idempotencyKey: keyOne,
    honeypotSeen: false,
    selections: editOne,
  })
  expect(resultOne.status).toBe("applied")

  const editTwo = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "single",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const keyTwo = uniqueIdempotencyKey()
  const resultTwo = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: await signEditEnvelope({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      idempotencyKey: keyTwo,
      selections: editTwo,
    }),
    idempotencyKey: keyTwo,
    honeypotSeen: false,
    selections: editTwo,
  })
  expect(resultTwo.status).toBe("applied")

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db
      .query("orderAccommodationEditAudits")
      .withIndex("by_orderId_and_requestDigest", (q) =>
        q.eq("orderId", order.orderId as never)
      )) {
      rows.push(row)
    }
    return rows.sort((a, b) => a._creationTime - b._creationTime)
  })

  expect(audits).toHaveLength(2)
  expect(audits[0].idempotencyKey).toBe(keyOne)
  expect(audits[1].idempotencyKey).toBe(keyTwo)
  // The first edit re-priced 19500 → 22500; the second 22500 → 23500
  // (a-1 single standard: 2000 + 2×5000 = 12000; a-2: 11500).
  expect(audits[0].amountDueBeforeMinor).toBe(19500)
  expect(audits[0].amountDueAfterMinor).toBe(22500)
  expect(audits[1].amountDueBeforeMinor).toBe(22500)
  expect(audits[1].amountDueAfterMinor).toBe(23500)
  expect(audits[0].beforeSelectionDigest).not.toBe(audits[0].afterSelectionDigest)
  expect(audits[1].beforeSelectionDigest).toBe(audits[0].afterSelectionDigest)
  expect(audits[0].ownershipMethod).toBe("email")
  expect(audits[0].requestDigest).toBeTruthy()
  expect(audits[1].requestDigest).not.toBe(audits[0].requestDigest)
})

test("a downward re-price returns the server-computed overpayment while the flexible-zero link stays", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed, {
    withPaymentMinor: 30000,
    withTikkieLink: true,
  })

  // Move a-1 to superior (19500 → 22500) first, then back down to standard
  // (22500 → 19500). Payments of 30000 exceed the final due by 10500.
  const upSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const upKey = uniqueIdempotencyKey()
  const up = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: await signEditEnvelope({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      idempotencyKey: upKey,
      selections: upSelections,
    }),
    idempotencyKey: upKey,
    honeypotSeen: false,
    selections: upSelections,
  })
  expect(up.amountDueMinor).toBe(22500)
  expect(up.overpaymentDeltaMinor).toBe(7500)

  const downSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      ageBandCode: "18_plus",
    }),
  ]
  const downKey = uniqueIdempotencyKey()
  const down = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: await signEditEnvelope({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      idempotencyKey: downKey,
      selections: downSelections,
    }),
    idempotencyKey: downKey,
    honeypotSeen: false,
    selections: downSelections,
  })

  expect(down.status).toBe("applied")
  expect(down.amountDueMinor).toBe(19500)
  expect(down.totalPaidMinor).toBe(30000)
  expect(down.remainingMinor).toBe(0)
  expect(down.progressPercent).toBe(100)
  // Server-computed overpayment = paid − new canonical due.
  expect(down.overpaymentDeltaMinor).toBe(10500)

  // The flexible-zero Tikkie link document is untouched.
  const tikkieRows = await t.query(async (ctx) => {
    return await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("orderId", (q) => q.eq("orderId", String(order.orderId)))
      .take(10)
  })
  expect(tikkieRows).toHaveLength(1)
  expect(tikkieRows[0].amountMinor).toBe(0)
  expect(tikkieRows[0].paymentRequestUrl).toBe(
    "https://pay.example.com/tikkie/flexible-zero-1"
  )
})

test("a route-issued edit token verifies against the canonical permalink binding", async () => {
  const token = await mintTrackPaymentEditToken({
    bookingRef: "bk-20260806-test01",
    bookerEmail: "BOOKER@example.com",
    secret: TEST_TRACK_PAYMENT_SECRET,
  })
  expect(
    await verifyTrackPaymentEditToken(token, {
      bookingRef: "BK-20260806-TEST01",
      bookerEmail: "booker@example.com",
      secret: TEST_TRACK_PAYMENT_SECRET,
    })
  ).toBe(true)
})
