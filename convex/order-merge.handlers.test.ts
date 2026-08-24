/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Doc, Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_merge_admin",
  name: "Merge Admin",
  email: "merge-admin@example.com",
}

const BASE_EVENT_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

async function createEvent(
  t: TestConvexForDataModel<GenericDataModel>,
  slugSuffix: string
) {
  return await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: `merge-event-${slugSuffix}`,
      title: "Merge Event",
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
}

type SeedContext = {
  eventId: Id<"events">
  otherEventId: Id<"events">
  categoryStandardId: Id<"accommodationCategories">
  cotOptionId: Id<"accommodationOptions">
  ticketTypeId: Id<"ticketTypes">
  sourceOrderId1: Id<"orders">
  sourceOrderId2: Id<"orders">
  targetOrderId: Id<"orders">
  attendeeId1: Id<"orderAttendees">
  attendeeId2: Id<"orderAttendees">
  ticketSelId1: Id<"orderTicketSelections">
  ticketSelId2: Id<"orderTicketSelections">
  accomSelId1: Id<"orderAccommodationSelections">
  accomSelId2: Id<"orderAccommodationSelections">
  optionChildId1: Id<"orderAccommodationOptionSelections">
  optionChildId2: Id<"orderAccommodationOptionSelections">
  assignmentId1: Id<"orderAssignments">
  assignmentId2: Id<"orderAssignments">
  ttAttendeeId1: Id<"ticketTailorAttendees">
  ttAttendeeId2: Id<"ticketTailorAttendees">
  ttOrderId1: Id<"ticketTailorOrders">
  ttOrderId2: Id<"ticketTailorOrders">
  paymentId1: Id<"payments">
  paymentId2: Id<"payments">
  linkId1: Id<"tikkiePaymentLinks">
  linkId2: Id<"tikkiePaymentLinks">
  otherSourceOrderId: Id<"orders">
}

async function seedMergeOrders(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await createEvent(t, "m1")
  const otherEventId = await createEvent(t, "m2")

  const categoryStandardId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
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
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    breakfastIncluded: true,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 3000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
  })

  const ticketTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Merge Ticket",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const sourceOrderId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal" as const,
      bookingRef: "BK-SRC-ALPHA",
      bookerName: "Source One",
      bookerEmail: "source1@example.com",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const sourceOrderId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal" as const,
      bookingRef: "BK-SRC-BRAVO",
      bookerName: "Source Two",
      bookerEmail: "source2@example.com",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const targetOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal" as const,
      bookingRef: "BK-TGT-CANON",
      bookerName: "Target Canon",
      bookerEmail: "target@example.com",
      submittedAt: BASE_EVENT_AT,
    })
  })

  const attendeeId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: sourceOrderId1 as never,
      attendeeKey: "merge-a1",
      name: "Attendee 1",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  const attendeeId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: sourceOrderId2 as never,
      attendeeKey: "merge-a2",
      name: "Attendee 2",
      gender: "unknown",
      sortOrder: 0,
    })
  })

  const ticketSelId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: sourceOrderId1 as never,
      attendeeId: attendeeId1 as never,
      ticketTypeId: ticketTypeId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  const ticketSelId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: sourceOrderId2 as never,
      attendeeId: attendeeId2 as never,
      ticketTypeId: ticketTypeId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })

  const accomSelId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: sourceOrderId1 as never,
      attendeeId: attendeeId1 as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      checkInAt: BASE_EVENT_AT - 2 * DAY_MS,
      checkOutAt: BASE_EVENT_AT,
      nightCount: 2,
    })
  })
  const accomSelId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: sourceOrderId2 as never,
      attendeeId: attendeeId2 as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      checkInAt: BASE_EVENT_AT - 2 * DAY_MS,
      checkOutAt: BASE_EVENT_AT,
      nightCount: 2,
    })
  })

  const optionChildId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationOptionSelections", {
      orderId: sourceOrderId1 as never,
      attendeeId: attendeeId1 as never,
      selectionId: accomSelId1 as never,
      optionKey: "cot",
      quantity: 1,
      nights: 2,
      sortOrder: 0,
    })
  })
  const optionChildId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationOptionSelections", {
      orderId: sourceOrderId2 as never,
      attendeeId: attendeeId2 as never,
      selectionId: accomSelId2 as never,
      optionKey: "cot",
      quantity: 1,
      nights: 2,
      sortOrder: 0,
    })
  })

  const hotelId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationHotels", {
      name: "Merge Hotel",
      city: "Amsterdam",
    })
  })
  const roomId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRooms", {
      hotelId: String(hotelId),
      roomTypeId: "fake-room-type",
      label: "Room 1",
      capacity: 2,
    })
  })
  const slotId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationSlots", {
      eventId: eventId as never,
      hotelId: hotelId as never,
      roomId: roomId as never,
      slotLabel: "Slot 1",
      genderPolicy: "mixed",
      isAssignable: true,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const assignmentId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAssignments", {
      orderId: sourceOrderId1 as never,
      attendeeId: attendeeId1 as never,
      slotId: slotId as never,
      assignmentIntent: "assign",
      sortOrder: 0,
    })
  })
  const assignmentId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAssignments", {
      orderId: sourceOrderId2 as never,
      attendeeId: attendeeId2 as never,
      slotId: slotId as never,
      assignmentIntent: "assign",
      sortOrder: 1,
    })
  })

  const ttAttendeeId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTailorAttendees", {
      providerEventId: String(eventId),
      providerOrderId: "EXT-1",
      orderId: sourceOrderId1 as never,
      attendeeId: attendeeId1 as never,
      rawPayload: {},
    })
  })
  const ttAttendeeId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTailorAttendees", {
      providerEventId: String(eventId),
      providerOrderId: "EXT-2",
      orderId: sourceOrderId2 as never,
      attendeeId: attendeeId2 as never,
      rawPayload: {},
    })
  })

  const ttOrderId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTailorOrders", {
      providerOrderId: "TT-EXT-1",
      providerEventId: String(eventId),
      orderId: sourceOrderId1 as never,
      rawPayload: {},
    })
  })
  const ttOrderId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTailorOrders", {
      providerOrderId: "TT-EXT-2",
      providerEventId: String(eventId),
      orderId: sourceOrderId2 as never,
      rawPayload: {},
    })
  })

  const paymentId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "bank_transfer",
      payerName: "Payer 1",
      amountMinor: 2000,
      paidAt: BASE_EVENT_AT,
      orderId: String(sourceOrderId1),
    })
  })
  const paymentId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "cash",
      payerName: "Payer 2",
      amountMinor: 1500,
      paidAt: BASE_EVENT_AT,
      orderId: String(sourceOrderId2),
    })
  })

  const linkId1 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "TT-EXT-1",
      providerEventId: String(eventId),
      orderId: String(sourceOrderId1),
      linkType: "order",
      paymentRequestToken: "tok-1",
      paymentRequestUrl: "https://tikkie.example.com/1",
      status: "created",
      providerStatus: "created",
      amountMinor: 2000,
      description: "Link 1",
      expiryDate: BASE_EVENT_AT + 7 * DAY_MS,
    })
  })
  const linkId2 = await t.mutation(async (ctx) => {
    return await ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "TT-EXT-2",
      providerEventId: String(eventId),
      orderId: String(sourceOrderId2),
      linkType: "order",
      paymentRequestToken: "tok-2",
      paymentRequestUrl: "https://tikkie.example.com/2",
      status: "created",
      providerStatus: "created",
      amountMinor: 1500,
      description: "Link 2",
      expiryDate: BASE_EVENT_AT + 7 * DAY_MS,
    })
  })

  const otherSourceOrderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: otherEventId as never,
      source: "internal" as const,
      bookingRef: "BK-OTHER",
      bookerName: "Other",
      submittedAt: BASE_EVENT_AT,
    })
  })

  return {
    eventId: eventId as Id<"events">,
    otherEventId: otherEventId as Id<"events">,
    categoryStandardId: categoryStandardId as Id<"accommodationCategories">,
    cotOptionId: cotOptionId as Id<"accommodationOptions">,
    ticketTypeId: ticketTypeId as Id<"ticketTypes">,
    sourceOrderId1: sourceOrderId1 as Id<"orders">,
    sourceOrderId2: sourceOrderId2 as Id<"orders">,
    targetOrderId: targetOrderId as Id<"orders">,
    attendeeId1: attendeeId1 as Id<"orderAttendees">,
    attendeeId2: attendeeId2 as Id<"orderAttendees">,
    ticketSelId1: ticketSelId1 as Id<"orderTicketSelections">,
    ticketSelId2: ticketSelId2 as Id<"orderTicketSelections">,
    accomSelId1: accomSelId1 as Id<"orderAccommodationSelections">,
    accomSelId2: accomSelId2 as Id<"orderAccommodationSelections">,
    optionChildId1: optionChildId1 as Id<"orderAccommodationOptionSelections">,
    optionChildId2: optionChildId2 as Id<"orderAccommodationOptionSelections">,
    assignmentId1: assignmentId1 as Id<"orderAssignments">,
    assignmentId2: assignmentId2 as Id<"orderAssignments">,
    ttAttendeeId1: ttAttendeeId1 as Id<"ticketTailorAttendees">,
    ttAttendeeId2: ttAttendeeId2 as Id<"ticketTailorAttendees">,
    ttOrderId1: ttOrderId1 as Id<"ticketTailorOrders">,
    ttOrderId2: ttOrderId2 as Id<"ticketTailorOrders">,
    paymentId1: paymentId1 as Id<"payments">,
    paymentId2: paymentId2 as Id<"payments">,
    linkId1: linkId1 as Id<"tikkiePaymentLinks">,
    linkId2: linkId2 as Id<"tikkiePaymentLinks">,
    otherSourceOrderId: otherSourceOrderId as Id<"orders">,
  }
}

// ── Authentication ─────────────────────────────────────────────────────

test("mergeOrders rejects anonymous callers", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  const anonymous = fresh()
  await expect(
    anonymous.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("Unauthorized")
})

// ── Input guardrails ──────────────────────────────────────────────────

test("mergeOrders rejects empty source array", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("At least one source order is required")
})

test("mergeOrders rejects duplicate source IDs", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1, seed.sourceOrderId1],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("Duplicate source order IDs are not allowed")
})

test("mergeOrders rejects self-targeting", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1],
      targetOrderId: seed.sourceOrderId1,
    })
  ).rejects.toThrow("A source order cannot also be the target")
})

test("mergeOrders rejects missing source order", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  // Convex validates ID format at the validator level; delete an order to get
  // a valid-format ID that doesn't resolve.
  const ghostId = await t.mutation(async (ctx) => {
    const id = await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef: "BK-GHOST",
      submittedAt: BASE_EVENT_AT,
    })
    await ctx.db.delete("orders", id)
    return id
  })

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [ghostId],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("Source order")
})

test("mergeOrders rejects missing target order", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  const ghostId = await t.mutation(async (ctx) => {
    const id = await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef: "BK-GHOST-TGT",
      submittedAt: BASE_EVENT_AT,
    })
    await ctx.db.delete("orders", id)
    return id
  })

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1],
      targetOrderId: ghostId,
    })
  ).rejects.toThrow("Target order not found")
})

test("mergeOrders rejects cross-event source", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.otherSourceOrderId],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("different event")
})

// ── Successful multi-source merge ─────────────────────────────────────

test("mergeOrders moves all canonical rows and creates aliases", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  const result = await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1, seed.sourceOrderId2],
    targetOrderId: seed.targetOrderId,
  })

  expect(result.targetOrderId).toBe(seed.targetOrderId)
  expect(result.targetBookingRef).toBe("BK-TGT-CANON")
  expect(result.movedSources).toBe(2)
  expect(result.movedAttendees).toBe(2)
  expect(result.movedPayments).toBe(2)
  expect(result.aliasCount).toBe(2)
  expect(result.amountDueMinor).toBeGreaterThan(0)

  // Verify target booking ref unchanged
  const target = await t.query(async (ctx) => {
    return await ctx.db.get("orders", seed.targetOrderId)
  })
  expect(target?.bookingRef).toBe("BK-TGT-CANON")
  expect(target?.mergedIntoOrderId).toBeUndefined()

  // Verify attendees moved to target
  const a1 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAttendees", seed.attendeeId1)
  })
  const a2 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAttendees", seed.attendeeId2)
  })
  expect(a1?.orderId).toBe(seed.targetOrderId)
  expect(a2?.orderId).toBe(seed.targetOrderId)

  // Verify ticket selections moved
  const ts1 = await t.query(async (ctx) => {
    return await ctx.db.get("orderTicketSelections", seed.ticketSelId1)
  })
  const ts2 = await t.query(async (ctx) => {
    return await ctx.db.get("orderTicketSelections", seed.ticketSelId2)
  })
  expect(ts1?.orderId).toBe(seed.targetOrderId)
  expect(ts2?.orderId).toBe(seed.targetOrderId)

  // Verify accommodation selections moved
  const as1 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAccommodationSelections", seed.accomSelId1)
  })
  const as2 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAccommodationSelections", seed.accomSelId2)
  })
  expect(as1?.orderId).toBe(seed.targetOrderId)
  expect(as2?.orderId).toBe(seed.targetOrderId)

  // Verify option children moved
  const oc1 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAccommodationOptionSelections", seed.optionChildId1)
  })
  const oc2 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAccommodationOptionSelections", seed.optionChildId2)
  })
  expect(oc1?.orderId).toBe(seed.targetOrderId)
  expect(oc2?.orderId).toBe(seed.targetOrderId)

  // Verify assignments moved
  const aa1 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAssignments", seed.assignmentId1)
  })
  const aa2 = await t.query(async (ctx) => {
    return await ctx.db.get("orderAssignments", seed.assignmentId2)
  })
  expect(aa1?.orderId).toBe(seed.targetOrderId)
  expect(aa2?.orderId).toBe(seed.targetOrderId)

  // Verify TT attendees moved
  const ta1 = await t.query(async (ctx) => {
    return await ctx.db.get("ticketTailorAttendees", seed.ttAttendeeId1)
  })
  const ta2 = await t.query(async (ctx) => {
    return await ctx.db.get("ticketTailorAttendees", seed.ttAttendeeId2)
  })
  expect(ta1?.orderId).toBe(seed.targetOrderId)
  expect(ta2?.orderId).toBe(seed.targetOrderId)

  // Verify payments moved
  const p1 = await t.query(async (ctx) => {
    return await ctx.db.get("payments", seed.paymentId1)
  })
  const p2 = await t.query(async (ctx) => {
    return await ctx.db.get("payments", seed.paymentId2)
  })
  expect(p1?.orderId).toBe(String(seed.targetOrderId))
  expect(p2?.orderId).toBe(String(seed.targetOrderId))

  // Verify tikkie links moved
  const lk1 = await t.query(async (ctx) => {
    return await ctx.db.get("tikkiePaymentLinks", seed.linkId1)
  })
  const lk2 = await t.query(async (ctx) => {
    return await ctx.db.get("tikkiePaymentLinks", seed.linkId2)
  })
  expect(lk1?.orderId).toBe(String(seed.targetOrderId))
  expect(lk2?.orderId).toBe(String(seed.targetOrderId))

  // Verify sources marked merged
  const s1 = await t.query(async (ctx) => {
    return await ctx.db.get("orders", seed.sourceOrderId1)
  })
  const s2 = await t.query(async (ctx) => {
    return await ctx.db.get("orders", seed.sourceOrderId2)
  })
  expect(s1?.mergedIntoOrderId).toBe(seed.targetOrderId)
  expect(typeof s1?.mergedAt).toBe("number")
  expect(s2?.mergedIntoOrderId).toBe(seed.targetOrderId)
  expect(typeof s2?.mergedAt).toBe("number")

  // Verify TT extensions marked removed
  const tt1 = await t.query(async (ctx) => {
    return await ctx.db.get("ticketTailorOrders", seed.ttOrderId1)
  })
  const tt2 = await t.query(async (ctx) => {
    return await ctx.db.get("ticketTailorOrders", seed.ttOrderId2)
  })
  expect(typeof tt1?.removedAt).toBe("number")
  expect(typeof tt2?.removedAt).toBe("number")
})

test("mergeOrders migrates provider-keyed payments and Tikkie records", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  const providerPaymentId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("payments", {
      source: "tikkie",
      sourceId: "provider-payment-1",
      payerName: "Provider Payer",
      amountMinor: 2500,
      paidAt: BASE_EVENT_AT,
      eventId: seed.eventId,
      orderId: "TT-EXT-1",
      status: "auto_matched",
    })
  })
  const legacyTikkiePaymentId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("tikkiePayments", {
      paymentLinkId: "legacy-link-1",
      paymentRequestToken: "legacy-request-1",
      paymentToken: "legacy-payment-1",
      payerName: "Legacy Payer",
      amountMinor: 1750,
      paidAt: BASE_EVENT_AT,
      orderId: "TT-EXT-1",
      matchStatus: "auto_matched",
    })
  })
  const providerLinkId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "TT-EXT-1",
      providerEventId: String(seed.eventId),
      orderId: "TT-EXT-1",
      linkType: "order",
      paymentRequestToken: "provider-link-token",
      paymentRequestUrl: "https://tikkie.example.com/provider",
      status: "paid",
      providerStatus: "paid",
      amountMinor: 2500,
      description: "Provider link",
      expiryDate: BASE_EVENT_AT + 7 * DAY_MS,
    })
  })

  await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })

  const migrated = await t.query(async (ctx) => ({
    payment: await ctx.db.get("payments", providerPaymentId),
    legacyTikkiePayment: await ctx.db.get(
      "tikkiePayments",
      legacyTikkiePaymentId
    ),
    link: await ctx.db.get("tikkiePaymentLinks", providerLinkId),
  }))
  expect(migrated.payment?.orderId).toBe(String(seed.targetOrderId))
  expect(migrated.legacyTikkiePayment?.orderId).toBe(
    String(seed.targetOrderId)
  )
  expect(migrated.link?.orderId).toBe(String(seed.targetOrderId))
})

test("mergeOrders loads complete child sets beyond the old 500-row cap", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await t.mutation(async (ctx) => {
    for (let index = 0; index < 500; index += 1) {
      await ctx.db.insert("orderAttendees", {
        orderId: seed.sourceOrderId1,
        attendeeKey: `large-${index}`,
        name: `Large attendee ${index}`,
        gender: "unknown",
        sortOrder: index + 1,
      })
    }
  })

  const result = await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })

  expect(result.movedAttendees).toBe(501)
  const counts = await t.query(async (ctx) => {
    const targetRows = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", seed.targetOrderId))
      .collect()
    const sourceRows = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", seed.sourceOrderId1))
      .collect()
    return { target: targetRows.length, source: sourceRows.length }
  })
  expect(counts).toEqual({ target: 501, source: 0 })
})

// ── Alias resolution ──────────────────────────────────────────────────

test("old source booking refs resolve to the target through aliases", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })

  // Alias exists
  const alias = await t.query(async (ctx) => {
    const results = await ctx.db
      .query("orderBookingRefAliases")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", "BK-SRC-ALPHA"))
      .collect()
    return results[0] ?? null
  })
  expect(alias).not.toBeNull()
  expect(alias?.targetOrderId).toBe(seed.targetOrderId)
  expect(alias?.sourceOrderId).toBe(seed.sourceOrderId1)
  expect(alias?.canonicalBookingRef).toBe("BK-TGT-CANON")

  // publicTracking resolves through alias
  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-SRC-ALPHA",
  })
  expect(tracking).not.toBeNull()
  expect(tracking?.bookingRef).toBe("BK-TGT-CANON")

  // signupSubmission resolves through alias
  const submission = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-SRC-ALPHA",
  })
  expect(submission).not.toBeNull()
  expect(submission?.bookingRef).toBe("BK-TGT-CANON")
})

test("old aliases follow a target through a second merge", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)
  const secondTarget = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId,
      source: "internal",
      bookingRef: "BK-TGT-SECOND",
      bookerName: "Second Target",
      bookerEmail: "second-target@example.com",
      submittedAt: BASE_EVENT_AT + 1,
    })
  })

  await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })
  await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.targetOrderId],
    targetOrderId: secondTarget,
  })

  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-SRC-ALPHA",
  })
  expect(tracking?.bookingRef).toBe("BK-TGT-SECOND")
  const submission = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-SRC-ALPHA",
  })
  expect(submission?.bookingRef).toBe("BK-TGT-SECOND")
})

test("mergeOrders rejects attendee-key collisions before any writes", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  const duplicateAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: seed.targetOrderId,
      attendeeKey: "merge-a1",
      name: "Duplicate target attendee",
      gender: "unknown",
      sortOrder: 0,
    })
  })

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("would collide during merge")

  const state = await t.query(async (ctx) => ({
    source: await ctx.db.get("orders", seed.sourceOrderId1),
    sourceAttendee: await ctx.db.get("orderAttendees", seed.attendeeId1),
    duplicateAttendee: await ctx.db.get("orderAttendees", duplicateAttendeeId),
    aliases: await ctx.db
      .query("orderBookingRefAliases")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", "BK-SRC-ALPHA"))
      .collect(),
  }))
  expect(state.source?.mergedIntoOrderId).toBeUndefined()
  expect(state.sourceAttendee?.orderId).toBe(seed.sourceOrderId1)
  expect(state.duplicateAttendee?.orderId).toBe(seed.targetOrderId)
  expect(state.aliases).toHaveLength(0)
})

// ── Booking-ref collision checks ──────────────────────────────────────

test("mergeOrders rejects source with same booking ref as target", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  // Create a source with same ref as target
  const conflictingSource = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef: "BK-TGT-CANON",
      bookerName: "Conflicting",
      submittedAt: BASE_EVENT_AT,
    })
  })

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [conflictingSource as Id<"orders">],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("same booking reference as the target")
})

test("mergeOrders rejects sources with duplicate booking refs", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  // Create a second source with same ref as first source
  const dupSource = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef: "BK-SRC-ALPHA",
      bookerName: "Duplicate Ref",
      submittedAt: BASE_EVENT_AT,
    })
  })

  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1, dupSource as Id<"orders">],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("same booking reference")
})

// ── Idempotent merge guard ────────────────────────────────────────────

test("mergeOrders rejects already-merged source", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })

  // Re-merge the same source — now it should be rejected
  await expect(
    t.mutation(api.orders.mergeOrders, {
      sourceOrderIds: [seed.sourceOrderId1],
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("has already been merged")
})

// ── Single-attendee source support ────────────────────────────────────

test("mergeOrders handles a source with a single attendee", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  const result = await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })

  expect(result.movedSources).toBe(1)
  expect(result.movedAttendees).toBe(1)
  expect(result.aliasCount).toBe(1)
})

// ── Source without TT extension ────────────────────────────────────────

test("mergeOrders handles a source without a Ticket Tailor extension", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedMergeOrders(t)

  // Delete the TT extension for source 1
  await t.mutation(async (ctx) => {
    await ctx.db.delete("ticketTailorOrders", seed.ttOrderId1)
  })

  const result = await t.mutation(api.orders.mergeOrders, {
    sourceOrderIds: [seed.sourceOrderId1],
    targetOrderId: seed.targetOrderId,
  })

  expect(result.movedSources).toBe(1)
  expect(result.movedAttendees).toBe(1)
})
