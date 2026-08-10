/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import { loadOrderAmountDueBreakdowns } from "./finance"
import type { Doc, Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

const BASE_EVENT_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

// Expected canonical amount due for an attendee with ticket-a (€20, no
// accommodation included), standard/shared 2-night stay, superior_upgrade
// (€10/night × 2) and cot (€5/night × 2): 2000 + 6000 + 2000 + 1000.
const EXPECTED_FULL_AMOUNT_DUE_MINOR = 11_000

type SeedContext = {
  eventId: Id<"events">
  otherEventId: Id<"events">
  categoryStandardId: Id<"accommodationCategories">
  cotOptionId: Id<"accommodationOptions">
  sourceOrderId: Id<"orders">
  targetOrderId: Id<"orders">
  attendeeId: Id<"orderAttendees">
  ticketSelectionId: Id<"orderTicketSelections">
  accommodationSelectionId: Id<"orderAccommodationSelections">
  optionChildIds: Array<Id<"orderAccommodationOptionSelections">>
  assignmentId: Id<"orderAssignments">
  extensionId: Id<"ticketTailorAttendees">
  noTicketAttendeeId: Id<"orderAttendees">
  singleAttendeeId: Id<"orderAttendees">
  otherOrderId: Id<"orders">
  ghostOrderId: Id<"orders">
}

async function createEvent(
  t: TestConvexForDataModel<GenericDataModel>,
  slugSuffix: string
) {
  return await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: `orders-event-${slugSuffix}`,
      title: "Orders Event",
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

async function createOrder(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: Id<"events">,
  bookingRef: string
) {
  return await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef,
      bookerName: "Orders Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
}

/**
 * Seeds a fully configured event with:
 * - catalog categories (standard, superior), options (cot, superior_upgrade),
 *   event config (2 nights), rates, and enabled event options;
 * - two orders in the event (source order with one fully-linked attendee —
 *   ticket selection, accommodation selection + option children, assignment,
 *   extension row — and an empty target order);
 * - a second event with an order of its own for cross-event scope tests;
 * - a `single`-constrained ticket/room type for occupancy-entitlement tests.
 */
async function seedOrdersForAttendeeMutations(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await createEvent(t, "one")
  const otherEventId = await createEvent(t, "two")

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
  const superiorUpgradeOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "superior_upgrade",
      label: "Superior upgrade",
      kind: "upgrade",
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
    occupancy: "single",
    pricePerPersonMinor: 5000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 3000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categorySuperiorId,
    occupancy: "single",
    pricePerPersonMinor: 5500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categorySuperiorId,
    occupancy: "shared",
    pricePerPersonMinor: 4500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: superiorUpgradeOptionId,
    enabled: true,
    priceMinor: 1000,
  })

  const ticketTypeId = await t.mutation(async (ctx) => {
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

  const roomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Single room",
      defaultCapacity: 1,
      categoryId: categoryStandardId as never,
    })
  })
  const singleTicketTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Single constrained",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      roomTypeId: roomTypeId as never,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const sourceOrderId = await createOrder(t, eventId, "BK-ORD-SRC01")
  const targetOrderId = await createOrder(t, eventId, "BK-ORD-TGT01")
  const singleOrderId = await createOrder(t, eventId, "BK-ORD-SNG01")

  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: sourceOrderId as never,
      attendeeKey: "orders-a",
      name: "Orders Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  const ticketSelectionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: sourceOrderId as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ticketTypeId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  const accommodationSelectionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: sourceOrderId as never,
      attendeeId: attendeeId as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      checkInAt: BASE_EVENT_AT - 2 * DAY_MS,
      checkOutAt: BASE_EVENT_AT,
      nightCount: 2,
    })
  })
  const optionChildIds: Array<Id<"orderAccommodationOptionSelections">> = []
  for (const [sortOrder, option] of [
    { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
    { optionKey: "cot", quantity: 1, nights: 2 },
  ].entries()) {
    const childId = await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAccommodationOptionSelections", {
        orderId: sourceOrderId as never,
        attendeeId: attendeeId as never,
        selectionId: accommodationSelectionId as never,
        optionKey: option.optionKey,
        quantity: option.quantity,
        nights: option.nights,
        sortOrder,
      })
    })
    optionChildIds.push(childId as Id<"orderAccommodationOptionSelections">)
  }
  const assignmentId = await t.mutation(async (ctx) => {
    const hotelId = await ctx.db.insert("accommodationHotels", {
      name: "Orders Hotel",
      city: "Amsterdam",
    })
    const roomId = await ctx.db.insert("accommodationRooms", {
      hotelId: String(hotelId),
      roomTypeId: String(roomTypeId),
      label: "Room 1",
      capacity: 1,
    })
    const slotId = await ctx.db.insert("accommodationSlots", {
      eventId: eventId as never,
      hotelId: hotelId as never,
      roomId: roomId as never,
      slotLabel: "Slot 1",
      genderPolicy: "mixed",
      isAssignable: true,
      updatedAt: BASE_EVENT_AT,
    })
    return await ctx.db.insert("orderAssignments", {
      orderId: sourceOrderId as never,
      attendeeId: attendeeId as never,
      slotId: slotId as never,
      assignmentIntent: "assign",
      sortOrder: 0,
    })
  })
  const extensionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTailorAttendees", {
      providerEventId: String(eventId),
      providerOrderId: "EXT-ORD-1",
      orderId: sourceOrderId as never,
      attendeeId: attendeeId as never,
      rawPayload: {},
      name: "Orders Buyer",
    })
  })

  // An attendee without a ticket selection (fail-closed fixture) on the
  // source order, and an attendee on the single-constrained ticket
  // (occupancy-entitlement fixture) on its own order so the source order's
  // canonical amount stays attributable to the primary attendee alone.
  const noTicketAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: sourceOrderId as never,
      attendeeKey: "orders-no-ticket",
      name: "No Ticket Buyer",
      gender: "unknown",
      sortOrder: 1,
    })
  })
  const singleAttendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: singleOrderId as never,
      attendeeKey: "orders-single",
      name: "Single Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: singleOrderId as never,
      attendeeId: singleAttendeeId as never,
      ticketTypeId: singleTicketTypeId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })

  const otherOrderId = await createOrder(t, otherEventId, "BK-ORD-OTH01")

  // A deleted order id in the same event: a well-formed target id that does
  // not resolve, for the fail-closed missing-target assertion.
  const ghostOrderId = await createOrder(t, eventId, "BK-ORD-GHOST01")
  await t.mutation(async (ctx) => {
    await ctx.db.delete("orders", ghostOrderId as never)
  })

  return {
    eventId: eventId as Id<"events">,
    otherEventId: otherEventId as Id<"events">,
    categoryStandardId: categoryStandardId as Id<"accommodationCategories">,
    cotOptionId: cotOptionId as Id<"accommodationOptions">,
    sourceOrderId: sourceOrderId as Id<"orders">,
    targetOrderId: targetOrderId as Id<"orders">,
    attendeeId: attendeeId as Id<"orderAttendees">,
    ticketSelectionId: ticketSelectionId as Id<"orderTicketSelections">,
    accommodationSelectionId:
      accommodationSelectionId as Id<"orderAccommodationSelections">,
    optionChildIds,
    assignmentId: assignmentId as Id<"orderAssignments">,
    extensionId: extensionId as Id<"ticketTailorAttendees">,
    noTicketAttendeeId: noTicketAttendeeId as Id<"orderAttendees">,
    singleAttendeeId: singleAttendeeId as Id<"orderAttendees">,
    otherOrderId: otherOrderId as Id<"orders">,
    ghostOrderId: ghostOrderId as Id<"orders">,
  }
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
      accommodationLines: breakdown.accommodationLines,
    }
  })
}

// ---------------------------------------------------------------------------
// Authentication: both admin mutations require an identity; anonymous callers
// fail closed before any validation or write.
// ---------------------------------------------------------------------------

test("setAttendeeAccommodation and moveAttendeeToOrder reject anonymous callers", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  // A separate anonymous instance: requireIdentity fires before any read, so
  // the well-formed ids never need to resolve on this instance.
  const anonymous = fresh()
  await expect(
    anonymous.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: String(seed.attendeeId),
      eventId: seed.eventId,
      occupancy: "shared",
    })
  ).rejects.toThrow("Unauthorized")

  await expect(
    anonymous.mutation(api.attendees.moveAttendeeToOrder, {
      attendeeId: String(seed.attendeeId),
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("Unauthorized")
})

// ---------------------------------------------------------------------------
// setAttendeeAccommodation: scope, validation, server-authoritative pricing.
// ---------------------------------------------------------------------------

test("setAttendeeAccommodation rejects a missing attendee", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: "orderAttendees_doesnotexist",
      eventId: seed.eventId,
      occupancy: "shared",
    })
  ).rejects.toThrow("Attendee not found.")
})

test("setAttendeeAccommodation rejects an attendee from another event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: String(seed.attendeeId),
      eventId: seed.otherEventId,
      occupancy: "shared",
    })
  ).rejects.toThrow("Attendee does not belong to the supplied event.")
})

test("setAttendeeAccommodation rejects an attendee without a ticket selection", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: String(seed.noTicketAttendeeId),
      eventId: seed.eventId,
      occupancy: "shared",
    })
  ).rejects.toThrow("Ticket selection not found for attendee.")
})

test("setAttendeeAccommodation rejects invalid, disabled, and duplicate options", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: String(seed.attendeeId),
      eventId: seed.eventId,
      occupancy: "shared",
      optionSelections: [{ optionKey: "bogus", quantity: 1, nights: 2 }],
    })
  ).rejects.toThrow(
    "Invalid accommodation selection: The selected accommodation option 'bogus' is not enabled for this event."
  )

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: String(seed.attendeeId),
      eventId: seed.eventId,
      occupancy: "shared",
      optionSelections: [
        { optionKey: "cot", quantity: 1, nights: 2 },
        { optionKey: "cot", quantity: 1, nights: 2 },
      ],
    })
  ).rejects.toThrow(
    "Invalid accommodation selection: The accommodation option 'cot' was selected more than once."
  )
})

test("setAttendeeAccommodation rejects an invalid occupancy", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation as any, {
      attendeeId: String(seed.attendeeId),
      eventId: seed.eventId,
      occupancy: "family",
    })
  ).rejects.toThrow()
})

test("setAttendeeAccommodation cannot override a ticket-derived occupancy", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.setAttendeeAccommodation, {
      attendeeId: String(seed.singleAttendeeId),
      eventId: seed.eventId,
      occupancy: "shared",
    })
  ).rejects.toThrow("Occupancy is determined by the selected ticket.")
})

test("setAttendeeAccommodation resolves a server-authoritative selection and recomputes amount due", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  const result = await t.mutation(api.attendees.setAttendeeAccommodation, {
    attendeeId: String(seed.attendeeId),
    eventId: seed.eventId,
    occupancy: "shared",
    optionSelections: [
      { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
      { optionKey: "cot", quantity: 1, nights: 2 },
    ],
  })

  expect(result.attendeeId).toBe(String(seed.attendeeId))
  expect(result.orderId).toBe(String(seed.sourceOrderId))
  expect(result.selection).toMatchObject({
    categoryCode: "standard",
    categoryLabel: "Standard",
    occupancy: "shared",
    nightCount: 2,
    nightBeforeLevel: null,
    options: [
      {
        optionKey: "superior_upgrade",
        label: "Superior upgrade",
        pricePerUnitMinor: 1000,
        quantity: 1,
        nights: 2,
      },
      {
        optionKey: "cot",
        label: "Cot",
        pricePerUnitMinor: 500,
        quantity: 1,
        nights: 2,
      },
    ],
  })
  expect(result.amountDueMinor).toBe(EXPECTED_FULL_AMOUNT_DUE_MINOR)

  const canonical = await loadOrderAmountDue(t, String(seed.sourceOrderId))
  expect(canonical?.amountDueMinor).toBe(EXPECTED_FULL_AMOUNT_DUE_MINOR)
})

test("setAttendeeAccommodation persists a night-before level with the derived night count", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  const result = await t.mutation(api.attendees.setAttendeeAccommodation, {
    attendeeId: String(seed.attendeeId),
    eventId: seed.eventId,
    occupancy: "shared",
    nightBeforeLevel: "superior",
    nightBeforeOccupancy: "shared",
  })

  expect(result.selection.nightCount).toBe(3)
  expect(result.selection.nightBeforeLevel).toBe("superior")
  // 2000 ticket + 2 base nights × 3000 + 1 night-before × 3000 + €10 premium.
  expect(result.amountDueMinor).toBe(12_000)
})

test("setAttendeeAccommodation is logically idempotent: one base row, no duplicate children", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  const args: {
    attendeeId: string
    eventId: Id<"events">
    occupancy: "single" | "shared"
    optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
  } = {
    attendeeId: String(seed.attendeeId),
    eventId: seed.eventId,
    occupancy: "shared",
    optionSelections: [
      { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
      { optionKey: "cot", quantity: 1, nights: 2 },
    ],
  }

  const first = await t.mutation(api.attendees.setAttendeeAccommodation, args)
  const second = await t.mutation(api.attendees.setAttendeeAccommodation, args)

  expect(second.amountDueMinor).toBe(first.amountDueMinor)

  const rows = await t.query(async (ctx) => {
    const baseRows = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId_and_attendeeId", (q) =>
        q.eq("orderId", seed.sourceOrderId).eq("attendeeId", seed.attendeeId)
      )
      .collect()
    const base = baseRows[0]
    const children = base
      ? await ctx.db
          .query("orderAccommodationOptionSelections")
          .withIndex("by_selectionId", (q) => q.eq("selectionId", base._id))
          .collect()
      : []
    return { baseRows: baseRows.length, children: children.length }
  })

  expect(rows.baseRows).toBe(1)
  expect(rows.children).toBe(2)
})

// ---------------------------------------------------------------------------
// moveAttendeeToOrder: relinking, scope, money recompute, fail-closed checks.
// ---------------------------------------------------------------------------

test("moveAttendeeToOrder relinks every canonical child row and recomputes both orders", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  const sourceBefore = await loadOrderAmountDue(t, String(seed.sourceOrderId))
  expect(sourceBefore?.amountDueMinor).toBe(EXPECTED_FULL_AMOUNT_DUE_MINOR)

  const result = await t.mutation(api.attendees.moveAttendeeToOrder, {
    attendeeId: String(seed.attendeeId),
    targetOrderId: seed.targetOrderId,
  })

  expect(result.orderId).toBe(String(seed.targetOrderId))
  expect(result.sourceAmountDueMinor).toBe(0)
  expect(result.targetAmountDueMinor).toBe(EXPECTED_FULL_AMOUNT_DUE_MINOR)

  const links = await t.query(async (ctx) => {
    const attendee = await ctx.db.get("orderAttendees", seed.attendeeId)
    const ticketSelection = await ctx.db.get(
      "orderTicketSelections",
      seed.ticketSelectionId
    )
    const accommodationSelection = await ctx.db.get(
      "orderAccommodationSelections",
      seed.accommodationSelectionId
    )
    const optionChildren = await Promise.all(
      seed.optionChildIds.map((childId) =>
        ctx.db.get("orderAccommodationOptionSelections", childId)
      )
    )
    const assignment = await ctx.db.get("orderAssignments", seed.assignmentId)
    const extension = await ctx.db.get("ticketTailorAttendees", seed.extensionId)
    return {
      attendeeOrderId: attendee?.orderId,
      ticketOrderId: ticketSelection?.orderId,
      accommodationOrderId: accommodationSelection?.orderId,
      optionChildOrderIds: optionChildren.map((row) => row?.orderId),
      assignmentOrderId: assignment?.orderId,
      extensionOrderId: extension?.orderId,
    }
  })

  expect(links.attendeeOrderId).toBe(seed.targetOrderId)
  expect(links.ticketOrderId).toBe(seed.targetOrderId)
  expect(links.accommodationOrderId).toBe(seed.targetOrderId)
  expect(links.optionChildOrderIds).toEqual(
    seed.optionChildIds.map(() => seed.targetOrderId)
  )
  expect(links.assignmentOrderId).toBe(seed.targetOrderId)
  expect(links.extensionOrderId).toBe(seed.targetOrderId)

  const sourceAfter = await loadOrderAmountDue(t, String(seed.sourceOrderId))
  const targetAfter = await loadOrderAmountDue(t, String(seed.targetOrderId))
  expect(sourceAfter?.amountDueMinor).toBe(0)
  expect(targetAfter?.amountDueMinor).toBe(EXPECTED_FULL_AMOUNT_DUE_MINOR)
})

test("moveAttendeeToOrder fails closed on cross-event and missing targets", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.moveAttendeeToOrder, {
      attendeeId: String(seed.attendeeId),
      targetOrderId: seed.otherOrderId,
    })
  ).rejects.toThrow("Orders must belong to the same event")

  await expect(
    t.mutation(api.attendees.moveAttendeeToOrder, {
      attendeeId: String(seed.attendeeId),
      targetOrderId: seed.ghostOrderId,
    })
  ).rejects.toThrow("Target order not found")

  await expect(
    t.mutation(api.attendees.moveAttendeeToOrder, {
      attendeeId: String(seed.attendeeId),
      targetOrderId: seed.sourceOrderId,
    })
  ).rejects.toThrow("Source and target orders must be different")
})

test("moveAttendeeToOrder fails closed on a missing ticket selection", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.moveAttendeeToOrder, {
      attendeeId: String(seed.noTicketAttendeeId),
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("Attendee ticket selection is missing or inconsistent.")
})

test("moveAttendeeToOrder rejects a missing attendee", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedOrdersForAttendeeMutations(t)

  await expect(
    t.mutation(api.attendees.moveAttendeeToOrder, {
      attendeeId: "orderAttendees_doesnotexist",
      targetOrderId: seed.targetOrderId,
    })
  ).rejects.toThrow("Attendee not found.")
})
