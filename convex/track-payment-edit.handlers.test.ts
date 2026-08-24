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
 * selections. Both attendees hold standard/shared selections under the
 * simplified contract: a-1 = 2000 + 2×3000 = 8000; a-2 = 2500 + 2×3000 =
 * 8500; total 16500. a-2's ticket keeps its superior-suite roomTypeId as
 * admin-allocation metadata only.
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
        totalNights: 2,
        coveredNights: 0,
        optionLines: [],
      }
    : undefined

  for (const [attendeeId, categoryId, occupancy] of [
    [attendeeOneId, seed.categoryStandardId, "shared"],
    // The included stay resolves to Standard for every ticket; the ticket's
    // superior-suite room type stays admin-allocation metadata only.
    [attendeeTwoId, seed.categoryStandardId, "shared"],
  ]) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: categoryId as never,
        occupancy: occupancy as "single" | "shared" | "family",
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
  await createOrderWithSelections(t, seed)

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
  expect(context?.accommodation.options.map((o) => o.optionKey).sort()).toEqual(
    ["cot"]
  )
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
    selections,
  })

  expect(result.status).toBe("applied")
  // a-1: 2000 + 3×3000 = 11000; a-2: 2500 + 3×3000 = 11500; total 22500.
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
    selections,
  })

  expect(result.status).toBe("applied")
  // a-1: 2000 + 3×3000 = 11000; a-2: 2500 + 3×3000 = 11500 → 22500.
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

test("booking-reference-only ownership is rejected without email or edit token", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

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
    bookingRef: BOOKING_REF,
    bookerEmail: null,
    editToken: null,
    idempotencyKey,
    selections,
  })

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      requestSignature,
      idempotencyKey,
      selections,
    })
  ).rejects.toThrow("EDIT_OWNERSHIP")

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
})

test("unsigned and mis-signed direct calls are rejected before any write", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const selections = [
    replacement({
      attendeeKey: "a-1",
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: "forged.signature",
      idempotencyKey,
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
        
      }),
      replacement({
        attendeeKey: "a-2",
        occupancy: "shared",
        
      }),
    ],
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: wrongSignature,
      idempotencyKey,
        selections,
    })
  ).rejects.toThrow("SIGNATURE_REQUIRED")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
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
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
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
        selections,
    })
  ).rejects.toThrow("EDIT_OWNERSHIP")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)

  // OWN-02: rejected ownership attempts leave no audit or selection rows.
  const allAudits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(allAudits).toHaveLength(0)
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
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
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
    selections: [tamperedSelection, baseSelections[1]],
  }
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, tampered2)
  ).rejects.toThrow()

  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
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
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
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
        selections: crossEventSelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  // An unknown option key fails the shared resolver.
  const invalidCotSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      optionSelections: [
        { optionKey: "does_not_exist", quantity: 1, nights: 2 },
      ],
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
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
        selections: invalidCotSelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  // A category-dependent payload is rejected: the buyer can never choose the
  // ticket's admin category — the included stay is always Standard.
  const constrainedBreakSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categorySuperiorId,
      occupancy: "shared",
      
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
        selections: constrainedBreakSelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  // A replacement missing one attendee is rejected (cardinality).
  const partialSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
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
        selections: partialSelections,
    })
  ).rejects.toThrow("EDIT_CONFLICT")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
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
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
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
    totalAmountMinor: 16500,
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
      occupancy: "shared",
      nightBeforeLevel: "standard",
      optionSelections: [{ optionKey: "cot", quantity: 2, nights: 2 }],
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      nightBeforeLevel: "standard",
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
    selections,
  })

  expect(result.status).toBe("applied")
  // a-1: 2000 + 3×3000 (night before) + 2 cots × 2 nights × 500 = 13000; a-2: 2500 +
  // 3×3000 = 11500 → 24500.
  expect(result.amountDueMinor).toBe(24500)

  // The persisted selection rows carry the server-resolved stay fields.
  const rows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", String(order.orderId) as never))
      .take(10)
  })
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(row.nightCount).toBe(3)
    expect(row.nightBeforeLevel).toBe("standard")
    expect(row.checkInAt).toBe(BASE_EVENT_AT - 2 * DAY_MS)
    expect(row.checkOutAt).toBe(BASE_EVENT_AT)
    expect(row.confirmedAt).toBeUndefined()
  }
  const optionRows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationOptionSelections")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", String(order.orderId) as never)
      )
      .collect()
  })
  expect(optionRows).toContainEqual(
    expect.objectContaining({
      optionKey: "cot",
      quantity: 2,
      nights: 2,
    })
  )
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
  // The included-stay category is server-resolved to Standard for both
  // attendees — the buyer never chose it.
  expect(a1Row?.categoryId).toBe(seed.categoryStandardId)
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
  expect(afterOrder?.totalAmountMinor).toBe(16500)
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
      
    }),
    replacement({
      attendeeKey: "a-2",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
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
    selections,
  })

  expect(result.status).toBe("unchanged")
  expect(result.amountDueMinor).toBe(16500)

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
})

test("an already-used idempotency key replays its stored result without duplicate writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

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
    selections,
  })
  expect(first.status).toBe("applied")
  expect(first.amountDueMinor).toBe(22500)
  expect(first.totalPaidMinor).toBe(0)
  expect(first.remainingMinor).toBe(22500)
  expect(first.progressPercent).toBe(0)
  expect(first.overpaymentDeltaMinor).toBe(0)

  // Retry with the same key and identical envelope: replayed, same result —
  // the complete canonical response is returned from the stored audit row,
  // never recomputed from mutable payment state (CR-08).
  const second = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    selections,
  })
  expect(second.status).toBe("replayed")
  expect(second).toEqual({ ...first, status: "replayed" })

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(1)
  expect(audits[0].amountDueAfterMinor).toBe(22500)
  expect(audits[0].totalPaidMinor).toBe(0)
  expect(audits[0].remainingMinor).toBe(22500)
  expect(audits[0].progressPercent).toBe(0)
  expect(audits[0].overpaymentDeltaMinor).toBe(0)
  expect(await loadAmountDue(t, String(order.orderId))).toBe(22500)

  // Persisted rows prove the write path: the replacement exactly matches the
  // stored server-resolved preferences and is stable across the replay.
  const persistedRows = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", order.orderId as never))) {
      rows.push({
        attendeeId: String(row.attendeeId),
        categoryId: row.categoryId ? String(row.categoryId) : null,
        occupancy: row.occupancy ?? null,
        nightCount: row.nightCount ?? null,
        confirmedAt: row.confirmedAt ?? null,
        priceSnapshot: row.priceSnapshot ?? null,
      })
    }
    return rows
  })
  expect(persistedRows).toHaveLength(2)
  const persistedOne = persistedRows.find(
    (row) => row.attendeeId === String(order.attendeeOneId)
  )
  const persistedTwo = persistedRows.find(
    (row) => row.attendeeId === String(order.attendeeTwoId)
  )
  expect(persistedOne).toMatchObject({
    categoryId: String(seed.categoryStandardId),
    occupancy: "shared",
    nightCount: 3,
    confirmedAt: null,
    priceSnapshot: null,
  })
  expect(persistedTwo).toMatchObject({
    categoryId: String(seed.categoryStandardId),
    occupancy: "shared",
    nightCount: 3,
    confirmedAt: null,
    priceSnapshot: null,
  })
})

test("a replay returns the originally stored money result even when a payment is posted between attempts", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

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
    selections,
  })
  expect(first.status).toBe("applied")
  expect(first.totalPaidMinor).toBe(0)
  expect(first.remainingMinor).toBe(22500)
  expect(first.progressPercent).toBe(0)
  expect(first.overpaymentDeltaMinor).toBe(0)

  // A payment arrives between the first attempt and the retry. A replay that
  // recomputed money from the current payment rows would now report paid =
  // 30000 / remaining = 0 / progress = 100 / overpayment = 7500; the stored
  // result must win so the same idempotency key never returns different money.
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "tikkie" as const,
      sourceId: "tikkie-payment-posted-after-edit",
      payerName: "Booker",
      amountMinor: 30000,
      paidAt: BASE_EVENT_AT - DAY_MS,
      eventId: seed.eventId as never,
      orderId: String(order.orderId),
      status: "auto_matched" as const,
      matchedAt: BASE_EVENT_AT - DAY_MS,
    })
  })

  const second = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    selections,
  })
  expect(second.status).toBe("replayed")
  // The replay returns the exact originally stored server result (CR-08) —
  // no recompute against the newly posted payment.
  expect(second).toEqual({ ...first, status: "replayed" })
  expect(second.totalPaidMinor).toBe(0)
  expect(second.remainingMinor).toBe(22500)
  expect(second.progressPercent).toBe(0)
  expect(second.overpaymentDeltaMinor).toBe(0)

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(1)
})

test("distinct applied edits produce distinct append-only server-valued audit rows", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const editOne = [
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
    selections: editOne,
  })
  expect(resultOne.status).toBe("applied")

  const editTwo = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "single",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      nightBeforeLevel: "standard",
      
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
  // The first edit re-priced 16500 → 22500 (both night-before standard); the
  // second 22500 → 23500 (a-1 single standard: 2000 + 2×5000 = 12000; a-2:
  // night-before standard: 11500).
  expect(audits[0].amountDueBeforeMinor).toBe(16500)
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

  // Add the night-before to both attendees (16500 → 22500) first, then drop
  // a-1's night-before (22500 → 19500). Payments of 30000 exceed the final
  // due by 10500.
  const upSelections = [
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
    selections: upSelections,
  })
  expect(up.amountDueMinor).toBe(22500)
  expect(up.overpaymentDeltaMinor).toBe(7500)

  const downSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      nightBeforeLevel: "standard",
      
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

test("reusing an idempotency key with a different envelope rejects with EDIT_IDEMPOTENCY_CONFLICT", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  await createOrderWithSelections(t, seed)

  const appliedSelections = [
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
  const first = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: await signEditEnvelope({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      idempotencyKey,
      selections: appliedSelections,
    }),
    idempotencyKey,
    selections: appliedSelections,
  })
  expect(first.status).toBe("applied")

  // Same key, DIFFERENT replacement payload: the stored request digest does
  // not match, so the retry must fail closed instead of claiming "replayed".
  const changedSelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      nightBeforeLevel: "standard",
      
    }),
  ]
  const error = await t.mutation(
    api.publicTracking.updateAccommodation,
    {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: await signEditEnvelope({
        bookingRef: BOOKING_REF,
        bookerEmail: "booker@example.com",
        idempotencyKey,
        selections: changedSelections,
      }),
      idempotencyKey,
        selections: changedSelections,
    }
  ).catch((err: unknown) => err)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toContain("EDIT_IDEMPOTENCY_CONFLICT")

  // The conflicting retry wrote nothing.
  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(1)
})

test("a same-key replay returns the stored result even after the organizer confirms the configuration", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

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
    selections,
  })
  expect(first.status).toBe("applied")
  expect(first.totalPaidMinor).toBe(0)

  // The organizer now confirms the configuration — the confirmedAt guard
  // would reject a fresh edit, but the replay check runs BEFORE that guard,
  // so the retry still returns the stored result (CR-03).
  await t.mutation(async (ctx) => {
    const rows = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", order.orderId as never))
      .take(10)
    for (const row of rows) {
      await ctx.db.patch("orderAccommodationSelections", row._id, {
        confirmedAt: BASE_EVENT_AT,
        configVersion: BASE_EVENT_AT,
      })
    }
  })

  const second = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature,
    idempotencyKey,
    selections,
  })
  expect(second.status).toBe("replayed")
  // The replay returns the full originally stored canonical response (CR-08).
  expect(second).toEqual({ ...first, status: "replayed" })

  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(1)
  expect(audits[0].totalPaidMinor).toBe(0)
  expect(audits[0].remainingMinor).toBe(22500)
  expect(audits[0].progressPercent).toBe(0)
  expect(audits[0].overpaymentDeltaMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Phase 45 security matrix: cross-order ownership, key-bound signatures,
// duplicate attendee keys, and broken ticket entitlement all fail before
// writes with typed non-leaky errors.
// ---------------------------------------------------------------------------

test("cross-order ownership fails without leaking editability and without writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)
  // A second order on the same event whose booker email is valid FOR THAT
  // ORDER — but must never grant access to the first order.
  const otherOrder = await createOrderWithSelections(t, seed, {
    bookingRef: "BK-20260806-OTHER01",
    bookerEmail: "other@example.com",
  })

  const selections = [
    replacement({
      attendeeKey: "a-1",
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
    }),
  ]

  // The other order's valid booker email against the first order.
  const emailKey = uniqueIdempotencyKey()
  const emailSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "other@example.com",
    idempotencyKey: emailKey,
    selections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "other@example.com",
      requestSignature: emailSignature,
      idempotencyKey: emailKey,
      selections,
    })
  ).rejects.toThrow("EDIT_OWNERSHIP")

  // A genuine edit token minted for the OTHER booking reference must not
  // unlock the first order either.
  const otherToken = await mintTrackPaymentEditToken({
    bookingRef: "BK-20260806-OTHER01",
    bookerEmail: "other@example.com",
    secret: TEST_TRACK_PAYMENT_SECRET,
  })
  const tokenKey = uniqueIdempotencyKey()
  const tokenSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    editToken: otherToken,
    idempotencyKey: tokenKey,
    selections,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      editToken: otherToken,
      requestSignature: tokenSignature,
      idempotencyKey: tokenKey,
      selections,
    })
  ).rejects.toThrow("EDIT_OWNERSHIP")

  // Neither attempt wrote anything: amount stable, no audit rows, the other
  // order's own preferences untouched.
  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
  expect(await loadAmountDue(t, String(otherOrder.orderId))).toBe(16500)
  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
})

test("a signature is bound to its idempotency key and cannot be replayed under another key", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

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
  const appliedKey = uniqueIdempotencyKey()
  const appliedSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey: appliedKey,
    selections,
  })

  const first = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    requestSignature: appliedSignature,
    idempotencyKey: appliedKey,
    selections,
  })
  expect(first.status).toBe("applied")

  // Replay the SAME signature under a DIFFERENT key: the mutation recomputes
  // the signature over its own args, so the key mismatch fails verification —
  // a captured signature can never be replayed with a fresh key.
  const replayedKey = uniqueIdempotencyKey()
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature: appliedSignature,
      idempotencyKey: replayedKey,
      selections,
    })
  ).rejects.toThrow("SIGNATURE_REQUIRED")

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

test("a duplicate attendee key in the replacement is rejected before writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  const duplicateKeySelections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-1",
      occupancy: "shared",
      
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections: duplicateKeySelections,
  })

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature,
      idempotencyKey,
      selections: duplicateKeySelections,
    })
  ).rejects.toThrow("EDIT_INVALID")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
})

test("a ticket whose room-type entitlement is broken rejects the edit before writes", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)
  const order = await createOrderWithSelections(t, seed)

  // a-2 holds the superior-suite (constrained) ticket; deleting the room type
  // the ticket points at breaks its entitlement resolution and must fail
  // closed as an entitlement error.
  await t.mutation(async (ctx) => {
    const roomType = await ctx.db.query("accommodationRoomTypes").first()
    if (roomType) {
      await ctx.db.delete("accommodationRoomTypes", roomType._id)
    }
  })

  const selections = [
    replacement({
      attendeeKey: "a-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      
    }),
    replacement({
      attendeeKey: "a-2",
      occupancy: "shared",
      
    }),
  ]
  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await signEditEnvelope({
    bookingRef: BOOKING_REF,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
  })

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      requestSignature,
      idempotencyKey,
      selections,
    })
  ).rejects.toThrow("EDIT_CONFLICT")

  expect(await loadAmountDue(t, String(order.orderId))).toBe(16500)
  const audits = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationEditAudits")) {
      rows.push(row)
    }
    return rows
  })
  expect(audits).toHaveLength(0)
})

test("the canonical loader fails closed on a missing ticket reference (CQ-13)", async () => {
  const t = fresh()
  const seed = await createConfiguredEvent(t)

  // Insert a ticket row, point a selection at it, then delete the ticket so
  // the reference is dangling at load time (the ID validator prevents
  // inserting a pointer to a never-existing document).
  const danglingOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef: "BK-DANGLING-TKT",
      bookerName: "Dangling Ticket Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const danglingAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: danglingOrderId as never,
      attendeeKey: "dangling-ticket",
      name: "Dangling Ticket Attendee",
      gender: "unknown" as const,
      sortOrder: 0,
    })
  })
  const danglingTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Dangling ticket",
      priceMinor: 1000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: danglingOrderId as never,
      attendeeId: danglingAttendeeId as never,
      ticketTypeId: danglingTicketId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.delete("ticketTypes", danglingTicketId)
  })

  // The dangling reference must never be priced at zero: the canonical money
  // projection fails closed with a descriptive error.
  await expect(loadAmountDue(t, String(danglingOrderId))).rejects.toThrow(
    /does not exist/
  )
})
