/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import { mintEditRequestSignature } from "../lib/domain/track-payment/edit-token"

const modules = import.meta.glob("./**/*.ts")

const TEST_TRACK_PAYMENT_SECRET = "test-paid-priority-secret"
process.env.SIGNUP_SUBMISSION_SECRET = TEST_TRACK_PAYMENT_SECRET

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

test("allocation board rejects missing or blank event scope", async () => {
  const t = fresh().withIdentity(adminIdentity)

  await expect(
    t.query(api.accommodation.getRoomAllocationBoard, {} as never)
  ).rejects.toThrow()
  await expect(
    t.query(api.accommodation.getRoomAllocationBoard, { eventId: "   " })
  ).rejects.toThrow(/non-blank event ID/)
})

test("allocation board resolves a provider event identifier to its canonical event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("eventSources", {
      eventId: seed.eventId,
      provider: "tickettailor",
      externalEventId: "provider-event-52",
      syncStatus: "active",
      updatedAt: BASE_EVENT_AT,
    })
  })
  const order = await createOrder(t, seed, {
    attendeeKey: "provider-event-attendee",
    name: "Provider Event Attendee",
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: "provider-event-52",
  })

  expect(board.filters.eventId).toBe(String(seed.eventId))
  expect(
    board.unassignedAttendees.map((row: { attendeeId: string }) => row.attendeeId)
  ).toContain(String(order.attendeeId))
})

test("allocation board separates occupants from beds and redacts foreign occupancy", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const first = await seedPaidPriorityEvent(t)
  const second = await seedPaidPriorityEvent(t)

  const bedTicketId = await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId: first.eventId,
      label: "Bed ticket",
      priceMinor: TICKET_PRICE_MINOR,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      requiresBed: true,
      updatedAt: BASE_EVENT_AT,
    })
  )
  await t.mutation(async (ctx) => {
    await ctx.db.patch("ticketTypes", first.ticketTypeId, {
      requiresBed: false,
    })
  })

  const noBed = await createOrder(t, first, {
    attendeeKey: "no-bed",
    name: "No Bed Occupant",
  })
  const bed = await createOrder(t, first, {
    attendeeKey: "bed-user",
    name: "Bed User",
    ticketTypeId: bedTicketId,
  })
  const foreign = await createOrder(t, second, {
    attendeeKey: "foreign-bed-user",
    name: "Foreign Private Name",
  })
  const ticketOnly = await createOrder(t, first, {
    attendeeKey: "ticket-only",
    name: "Ticket Only",
    includeAccommodationSelection: false,
  })

  await t.mutation(async (ctx) => {
    await ctx.db.patch("orderAttendees", noBed.attendeeId, {
      assignedRoomId: String(first.roomId),
    })
    await ctx.db.patch("orderAttendees", bed.attendeeId, {
      assignedRoomId: String(first.roomId),
    })
    await ctx.db.patch("orderAttendees", foreign.attendeeId, {
      assignedRoomId: String(first.roomId),
    })
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(first.eventId),
  })
  const room = board.rooms.find(
    (candidate: { id: string }) => String(candidate.id) === String(first.roomId)
  )

  expect(room).toMatchObject({
    occupantCount: 3,
    occupiedBeds: 2,
    availableBeds: 0,
    foreignOccupantCount: 1,
    occupancyIncomplete: false,
  })
  expect(room?.occupants).toHaveLength(2)
  expect(
    room?.occupants.map(
      (occupant: { attendeeName: string | null }) => occupant.attendeeName
    )
  ).not.toContain("Foreign Private Name")
  expect(
    room?.occupants.find(
      (occupant: { attendeeId: string }) =>
        occupant.attendeeId === String(noBed.attendeeId)
    )
  )
    .toMatchObject({ requiresBed: false })
  expect(
    room?.occupants.find(
      (occupant: { attendeeId: string }) =>
        occupant.attendeeId === String(bed.attendeeId)
    )
  )
    .toMatchObject({ requiresBed: true })
  expect(
    board.unassignedAttendees.map(
      (attendee: { attendeeId: string }) => attendee.attendeeId
    )
  ).not.toContain(String(ticketOnly.attendeeId))
  expect(board.summary).toMatchObject({
    totalOccupants: 3,
    occupiedBeds: 2,
    availableBeds: 2,
    foreignOccupants: 1,
    occupancyIncomplete: false,
  })

  const inventory = await t.query(api.accommodation.listAccommodationInventory, {})
  const inventoryRoom = inventory.rooms.find(
    (candidate: { id: string }) => String(candidate.id) === String(first.roomId)
  )
  expect(inventoryRoom).toMatchObject({
    occupantCount: 3,
    occupiedBeds: 2,
    availableBeds: 0,
    occupancyIncomplete: false,
  })

  const roomDetails = await t.query(api.accommodation.getRoomsWithDetails, {})
  const detailedRoom = roomDetails.find(
    (candidate: { id: string }) => String(candidate.id) === String(first.roomId)
  )
  expect(detailedRoom).toMatchObject({
    occupantCount: 3,
    occupiedBeds: 2,
    availableBeds: 0,
    occupancyIncomplete: false,
  })
})

test("assignment mutations allow no-bed occupants in full rooms but reject bed users and ticket-only attendees", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const bedTicketId = await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId: seed.eventId,
      label: "Bed ticket",
      priceMinor: TICKET_PRICE_MINOR,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      requiresBed: true,
      updatedAt: BASE_EVENT_AT,
    })
  )
  await t.mutation(async (ctx) => {
    await ctx.db.patch("ticketTypes", seed.ticketTypeId, {
      requiresBed: false,
    })
  })

  const firstBed = await createOrder(t, seed, {
    attendeeKey: "full-bed-one",
    name: "Full Bed One",
    ticketTypeId: bedTicketId,
  })
  const secondBed = await createOrder(t, seed, {
    attendeeKey: "full-bed-two",
    name: "Full Bed Two",
    ticketTypeId: bedTicketId,
  })
  const noBed = await createOrder(t, seed, {
    attendeeKey: "full-room-no-bed",
    name: "Full Room No Bed",
  })
  const blockedBed = await createOrder(t, seed, {
    attendeeKey: "blocked-bed",
    name: "Blocked Bed",
    ticketTypeId: bedTicketId,
  })
  const ticketOnly = await createOrder(t, seed, {
    attendeeKey: "ticket-only-write",
    name: "Ticket Only Write",
    includeAccommodationSelection: false,
  })

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(firstBed.attendeeId),
    roomId: String(seed.roomId),
    eventId: String(seed.eventId),
  })
  await t.mutation(api.accommodation.assignRoomToAttendee, {
    attendeeId: String(secondBed.attendeeId),
    roomId: String(seed.roomId),
    eventId: String(seed.eventId),
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(noBed.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).resolves.toEqual({ ok: true })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(blockedBed.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow("Room is already full")

  await expect(
    t.mutation(api.accommodation.assignRoomToAttendee, {
      attendeeId: String(ticketOnly.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow("not eligible for accommodation placement")

  const board = await loadBoard(t, seed.eventId)
  const room = board.rooms.find(
    (candidate: { id: string }) => String(candidate.id) === String(seed.roomId)
  )
  expect(room).toMatchObject({
    occupantCount: 3,
    occupiedBeds: 2,
    availableBeds: 0,
  })
})

test("foreign-event bed occupancy blocks a bed-consuming assignment", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const first = await seedPaidPriorityEvent(t)
  const second = await seedPaidPriorityEvent(t)
  const foreign = await createOrder(t, second, {
    attendeeKey: "foreign-bed",
    name: "Foreign Bed",
  })
  const local = await createOrder(t, first, {
    attendeeKey: "local-bed",
    name: "Local Bed",
  })
  const blocked = await createOrder(t, first, {
    attendeeKey: "blocked-by-foreign-bed",
    name: "Blocked By Foreign Bed",
  })

  await t.mutation(async (ctx) => {
    await ctx.db.patch("orderAttendees", foreign.attendeeId, {
      assignedRoomId: String(first.roomId),
    })
  })

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(local.attendeeId),
    roomId: String(first.roomId),
    eventId: String(first.eventId),
  })
  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(blocked.attendeeId),
      roomId: String(first.roomId),
      eventId: String(first.eventId),
    })
  ).rejects.toThrow("Room is already full")
})

test("live bed authority ignores a cross-event ticket selection and keeps the legacy one-bed fallback", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const first = await seedPaidPriorityEvent(t)
  const second = await seedPaidPriorityEvent(t)
  const foreignNoBedTicketId = await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId: second.eventId,
      label: "Foreign no-bed ticket",
      priceMinor: TICKET_PRICE_MINOR,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      requiresBed: false,
      updatedAt: BASE_EVENT_AT,
    })
  )
  const local = await createOrder(t, first, {
    attendeeKey: "cross-event-ticket",
    name: "Cross Event Ticket",
  })
  const selection = await t.mutation(async (ctx) =>
    ctx.db
      .query("orderTicketSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", local.attendeeId))
      .unique()
  )
  await t.mutation(async (ctx) => {
    await ctx.db.patch("orderTicketSelections", selection!._id, {
      ticketTypeId: foreignNoBedTicketId,
    })
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(first.eventId),
  })
  expect(
    board.unassignedAttendees.find(
      (row: { attendeeId: string }) => row.attendeeId === String(local.attendeeId)
    )
  ).toMatchObject({ requiresBed: true })
})

test("provider bridges are resolved globally and provider-only occupancy consumes event room inventory", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const bridged = await createOrder(t, seed, {
    attendeeKey: "stale-provider-bridge",
    name: "Canonical Bridge",
  })
  const providerOnlyOrder = await createOrder(t, seed, {
    attendeeKey: "provider-only-order",
    name: "Provider Only Canonical",
  })
  await t.mutation(async (ctx) => {
    await ctx.db.patch("orderAttendees", bridged.attendeeId, {
      assignedRoomId: String(seed.secondRoomId),
    })
    await ctx.db.insert("ticketTailorAttendees", {
      providerAttendeeId: "provider-bridged",
      providerEventId: "provider-event",
      providerOrderId: "provider-order",
      orderId: bridged.orderId,
      attendeeId: bridged.attendeeId,
      assignedRoomId: String(seed.roomId),
      rawPayload: {},
    })
    await ctx.db.insert("ticketTailorAttendees", {
      providerAttendeeId: "provider-only",
      providerEventId: "provider-event",
      providerOrderId: "provider-only-order",
      orderId: providerOnlyOrder.orderId,
      assignedRoomId: String(seed.roomId),
      rawPayload: {},
    })
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(seed.eventId),
  })
  const firstRoom = board.rooms.find(
    (room: { id: string }) => room.id === String(seed.roomId)
  )
  const secondRoom = board.rooms.find(
    (room: { id: string }) => room.id === String(seed.secondRoomId)
  )
  expect(firstRoom).toMatchObject({
    occupantCount: 1,
    occupiedBeds: 1,
    foreignOccupantCount: 0,
  })
  expect(secondRoom).toMatchObject({ occupantCount: 1, occupiedBeds: 1 })

  await t.mutation(api.accommodation.upsertEventAccommodationResource, {
    eventId: seed.eventId,
    kind: "room",
    roomTypeId: seed.roomTypeId,
    count: 1,
  })
  const target = await createOrder(t, seed, {
    attendeeKey: "resource-target",
    name: "Resource Target",
  })
  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(target.attendeeId),
      roomId: String(seed.secondRoomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow(/event resource limit reached/)
})

test("assignment and unassignment reject foreign events and unlinked hotels", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const first = await seedPaidPriorityEvent(t)
  const second = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, first, {
    attendeeKey: "cross-event-attendee",
    name: "Cross Event Attendee",
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(second.roomId),
      eventId: String(second.eventId),
    })
  ).rejects.toThrow("Attendee does not belong to this event")

  const unlinkedRoomId = await t.mutation(async (ctx) => {
    const hotelId = await ctx.db.insert("accommodationHotels", {
      name: "Unlinked Hotel",
      city: "Amsterdam",
    })
    return await ctx.db.insert("accommodationRooms", {
      hotelId: String(hotelId),
      roomTypeId: String(first.roomTypeId),
      label: "UNLINKED-101",
      capacity: 2,
    })
  })
  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(unlinkedRoomId),
      eventId: String(first.eventId),
    })
  ).rejects.toThrow("Room hotel is not enabled for this event")

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(order.attendeeId),
    roomId: String(first.roomId),
    eventId: String(first.eventId),
  })
  await expect(
    t.mutation(api.accommodation.unassignAttendeeFromRoom, {
      attendeeId: String(order.attendeeId),
      eventId: String(second.eventId),
    })
  ).rejects.toThrow("Attendee does not belong to this event")
  await expect(
    t.mutation(api.accommodation.unassignAttendeeFromRoom, {
      attendeeId: String(order.attendeeId),
      eventId: String(first.eventId),
    })
  ).resolves.toEqual({ ok: true })
})

const BASE_EVENT_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000
// Ticket €20 + standard/shared €30 × 2 nights = €80 due per attendee.
const TICKET_PRICE_MINOR = 2000
const RATE_PER_NIGHT_MINOR = 3000
const NIGHT_COUNT = 2
const ATTENDEE_DUE_MINOR = TICKET_PRICE_MINOR + RATE_PER_NIGHT_MINOR * NIGHT_COUNT // 8000

type SeedContext = {
  eventId: Id<"events">
  categoryStandardId: Id<"accommodationCategories">
  ticketTypeId: Id<"ticketTypes">
  roomId: Id<"accommodationRooms">
  secondRoomId: Id<"accommodationRooms">
  roomTypeId: Id<"accommodationRoomTypes">
  unavailableRoomTypeId: Id<"accommodationRoomTypes">
  hotelId: Id<"accommodationHotels">
}

/**
 * Seeds an internal event with a fully configured accommodation catalog
 * (standard/shared €30/night, 2 nights), one ticket type, and two empty
 * capacity-2 rooms. The hotel is explicitly linked to the event so direct
 * room-assignment mutations exercise the event-hotel authorization gate.
 */
async function seedPaidPriorityEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "paid-priority-event",
      title: "Paid Priority Event",
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
    pricePerPersonMinor: RATE_PER_NIGHT_MINOR,
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
      label: "Ticket only",
      priceMinor: TICKET_PRICE_MINOR,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const hotelId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationHotels", {
      name: "Paid Priority Hotel",
      city: "Amsterdam",
    })
  })
  await t.mutation(async (ctx) => {
    await ctx.db.insert("accommodationEventHotels", {
      eventId: eventId as never,
      hotelId: String(hotelId),
    })
  })
  const roomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Shared Twin",
      defaultCapacity: 2,
    })
  })
  const unavailableRoomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Unavailable Single",
      defaultCapacity: 1,
    })
  })
  const roomId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRooms", {
      hotelId: String(hotelId),
      roomTypeId: String(roomTypeId),
      label: "P-101",
      capacity: 2,
    })
  })
  const secondRoomId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRooms", {
      hotelId: String(hotelId),
      roomTypeId: String(roomTypeId),
      label: "P-102",
      capacity: 2,
    })
  })

  return {
    eventId: eventId as Id<"events">,
    categoryStandardId: categoryStandardId as Id<"accommodationCategories">,
    ticketTypeId: ticketTypeId as Id<"ticketTypes">,
    roomId: roomId as Id<"accommodationRooms">,
    secondRoomId: secondRoomId as Id<"accommodationRooms">,
    roomTypeId: roomTypeId as Id<"accommodationRoomTypes">,
    unavailableRoomTypeId: unavailableRoomTypeId as Id<"accommodationRoomTypes">,
    hotelId: hotelId as Id<"accommodationHotels">,
  }
}

type OrderContext = {
  orderId: Id<"orders">
  attendeeId: Id<"orderAttendees">
  bookingRef: string
}

async function createOrder(
  t: TestConvexForDataModel<GenericDataModel>,
  seed: SeedContext,
  input: {
    attendeeKey: string
    name: string
    ticketTypeId?: Id<"ticketTypes">
    bookingRef?: string
    bookerName?: string
    bookerEmail?: string
    location?: string
    roommatePreference?: string
    roommateAvoid?: string
    orderStatus?: "paid" | "refunded" | "cancelled" | "pending"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    allocatedRoomTypeId?: string
    withPaymentMinor?: number
    ageBandCode?: "under_3" | "18_plus" | null
    includeAccommodationSelection?: boolean
  }
): Promise<OrderContext> {
  const bookingRef = input.bookingRef ?? `BK-PP-${input.attendeeKey.toUpperCase()}`
  const bookerEmail = input.bookerEmail ?? "booker@example.com"

  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: seed.eventId as never,
      source: "internal" as const,
      bookingRef,
      bookerName: input.bookerName ?? "Booker",
      bookerEmail,
      submittedAt: BASE_EVENT_AT,
      ...(input.orderStatus ? { status: input.orderStatus } : {}),
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: input.attendeeKey,
      name: input.name,
      gender: "unknown" as const,
      sortOrder: 0,
      ...(input.allocationPriority
        ? { allocationPriority: input.allocationPriority }
        : {}),
      ...(input.allocatedRoomTypeId
        ? { allocatedRoomTypeId: input.allocatedRoomTypeId }
        : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.roommatePreference
        ? { roommatePreference: input.roommatePreference }
        : {}),
      ...(input.roommateAvoid ? { roommateAvoid: input.roommateAvoid } : {}),
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      ticketTypeId: (input.ticketTypeId ?? seed.ticketTypeId) as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  if (input.includeAccommodationSelection !== false) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: seed.categoryStandardId as never,
        occupancy: "shared",
        
        nightCount: NIGHT_COUNT,
      })
    })
  }
  if (input.withPaymentMinor !== undefined) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("payments", {
        source: "tikkie" as const,
        sourceId: `tikkie-payment-${input.attendeeKey}`,
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

  return {
    orderId: orderId as Id<"orders">,
    attendeeId: attendeeId as Id<"orderAttendees">,
    bookingRef,
  }
}

async function addAttendeeToOrder(
  t: TestConvexForDataModel<GenericDataModel>,
  seed: SeedContext,
  orderId: Id<"orders">,
  input: {
    attendeeKey: string
    name: string
    ageBandCode?: "under_3" | "18_plus" | null
  }
): Promise<Id<"orderAttendees">> {
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: input.attendeeKey,
      name: input.name,
      gender: "unknown" as const,
      sortOrder: 1,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      ticketTypeId: seed.ticketTypeId as never,
      quantity: 1,
      sortOrder: 1,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      categoryId: seed.categoryStandardId as never,
      occupancy: "shared",
      
      nightCount: NIGHT_COUNT,
    })
  })
  return attendeeId as Id<"orderAttendees">
}

async function linkFamily(
  t: TestConvexForDataModel<GenericDataModel>,
  primaryAttendeeId: string,
  memberAttendeeIds: string[],
  label = "Placement Family"
) {
  const familyGroupId = await t.mutation(async (ctx) =>
    ctx.db.insert("attendeeFamilyGroups", {
      label,
      primaryAttendeeId,
    })
  )
  await t.mutation(async (ctx) => {
    for (const attendeeId of memberAttendeeIds) {
      await ctx.db.insert("attendeeFamilyMembers", {
        familyGroupId: String(familyGroupId),
        attendeeId,
        relationship: attendeeId === primaryAttendeeId ? "parent" : "child",
      })
    }
  })
  return familyGroupId
}

async function createNoBedTicket(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: Id<"events">
) {
  return (await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId,
      label: "No-bed family ticket",
      priceMinor: TICKET_PRICE_MINOR,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      requiresBed: false,
      updatedAt: BASE_EVENT_AT,
    })
  )) as Id<"ticketTypes">
}

async function loadBoard(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: Id<"events">
) {
  return (await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(eventId),
  })) as {
    unassignedAttendees: Array<{
      attendeeId: string
      attendeeName: string | null
      orderId: string | null
      bookingRef: string | null
      bookerName: string | null
      location: string | null
       roommatePreference: string | null
       roommateAvoid: string | null
       hasFamily: boolean
       groupMemberIds: string[]
       groupAssignmentAvailable: boolean
       occupancy: "single" | "shared" | "family" | null
      categoryLabel: string | null
      allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
      paymentState: "paid" | "partial" | "unpaid" | null
      amountDueMinor: number | null
      paidAmountMinor: number | null
      compatibility?: {
        status: "compatible" | "no_match" | "unavailable"
        summary: string
        recommendedRoomId?: string
      }
    }>
     submissionQueueRows: Array<{
       attendeeId: string
       attendeeName: string | null
       allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
       paymentState: "paid" | "partial" | "unpaid" | null
       amountDueMinor: number | null
       paidAmountMinor: number | null
     }>
     rooms: Array<{ id: string }>
   }
}

async function loadSelectionRows(
  t: TestConvexForDataModel<GenericDataModel>,
  orderId: string
) {
  return await t.mutation(async (db) => {
    const rows = []
    for await (const row of db.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId as never))) {
      rows.push(row)
    }
    return rows
  })
}

// ---------------------------------------------------------------------------
// Board projection: canonical tri-state from due/paid maps, never order.status
// ---------------------------------------------------------------------------

test("board renders a pending internal order with a recorded payment as paid", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await createOrder(t, seed, {
    attendeeKey: "a-paid",
    name: "Paid Attendee",
    orderStatus: "pending",
    withPaymentMinor: ATTENDEE_DUE_MINOR,
  })

  const board = await loadBoard(t, seed.eventId)
  const row = board.unassignedAttendees.find(
    (attendee) => attendee.attendeeName === "Paid Attendee"
  )
  expect(row?.paymentState).toBe("paid")
  expect(row?.amountDueMinor).toBe(ATTENDEE_DUE_MINOR)
  expect(row?.paidAmountMinor).toBe(ATTENDEE_DUE_MINOR)
})

test("board returns complete payment fields on unassigned and queue rows", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await createOrder(t, seed, {
    attendeeKey: "a-paid",
    name: "Paid Attendee",
    withPaymentMinor: ATTENDEE_DUE_MINOR,
  })
  await createOrder(t, seed, {
    attendeeKey: "b-unpaid",
    name: "Unpaid Attendee",
    includeAccommodationSelection: true,
  })

  const board = await loadBoard(t, seed.eventId)
  const paidRow = board.unassignedAttendees.find(
    (attendee) => attendee.attendeeName === "Paid Attendee"
  )
  expect(paidRow?.paymentState).toBe("paid")
  expect(paidRow?.amountDueMinor).toBe(ATTENDEE_DUE_MINOR)
  expect(paidRow?.paidAmountMinor).toBe(ATTENDEE_DUE_MINOR)

  const unpaidRow = board.unassignedAttendees.find(
    (attendee) => attendee.attendeeName === "Unpaid Attendee"
  )
  expect(unpaidRow?.paymentState).toBe("unpaid")
  expect(unpaidRow?.amountDueMinor).toBe(ATTENDEE_DUE_MINOR)
  expect(unpaidRow?.paidAmountMinor).toBe(0)

  // The submission queue rows expose the same server-owned projection.
  expect(board.submissionQueueRows.length).toBeGreaterThanOrEqual(2)
  const queuePaid = board.submissionQueueRows.find((row) =>
    row.attendeeId.includes("a-paid")
  )
  expect(queuePaid?.paymentState).toBe("paid")
})

test("board exposes an additive compatible-room preview without assigning", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("accommodationEventHotels", {
      eventId: seed.eventId as never,
      hotelId: String(seed.hotelId),
    })
    await ctx.db.insert("accommodationRooms", {
      hotelId: String(seed.hotelId),
      roomTypeId: "stale-room-type-reference",
      label: "Malformed room metadata",
      capacity: 2,
    })
  })
  const order = await createOrder(t, seed, {
    attendeeKey: "a-compatible",
    name: "Compatible Attendee",
    allocationPriority: "HIGH",
    allocatedRoomTypeId: String(seed.roomTypeId),
    withPaymentMinor: ATTENDEE_DUE_MINOR,
  })

  const board = await loadBoard(t, seed.eventId)
  const row = board.unassignedAttendees.find(
    (attendee) => attendee.attendeeId === String(order.attendeeId)
  )
  expect(row).toMatchObject({
    attendeeName: "Compatible Attendee",
    allocationPriority: "HIGH",
    hasFamily: false,
    paymentState: "paid",
    compatibility: {
      status: "compatible",
      recommendedRoomId: String(seed.roomId),
      summary: "Available room matches the requested room type.",
    },
  })

  const attendee = await t.mutation(async (ctx) =>
    ctx.db.get("orderAttendees", order.attendeeId)
  )
  expect(attendee?.assignedRoomId).toBeUndefined()
  const room = await t.mutation(async (ctx) =>
    ctx.db.get("accommodationRooms", seed.roomId)
  )
  expect(room).toBeDefined()
})

test("board exposes complete manual placement context on an unresolved row", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("accommodationEventHotels", {
      eventId: seed.eventId as never,
      hotelId: String(seed.hotelId),
    })
  })
  const order = await createOrder(t, seed, {
    attendeeKey: "a-context",
    name: "Context Attendee",
    bookingRef: "BK-PP-CONTEXT01",
    bookerName: "Context Booker",
    location: "Amsterdam",
    roommatePreference: "Alex",
    roommateAvoid: "Jordan",
    allocationPriority: "HIGH",
    allocatedRoomTypeId: String(seed.roomTypeId),
    withPaymentMinor: ATTENDEE_DUE_MINOR,
  })

  const board = await loadBoard(t, seed.eventId)
  expect(
    board.unassignedAttendees.find(
      (attendee) => attendee.attendeeId === String(order.attendeeId)
    )
  ).toMatchObject({
    attendeeName: "Context Attendee",
    orderId: String(order.orderId),
    bookingRef: "BK-PP-CONTEXT01",
    bookerName: "Context Booker",
    location: "Amsterdam",
    roommatePreference: "Alex",
    roommateAvoid: "Jordan",
    hasFamily: false,
    occupancy: "shared",
    categoryLabel: "Standard",
    paymentState: "paid",
    allocationPriority: "HIGH",
    compatibility: {
      status: "compatible",
      recommendedRoomId: String(seed.roomId),
    },
  })
})

test("event-scoped board excludes foreign internal orders and rooms", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const first = await seedPaidPriorityEvent(t)
  const second = await seedPaidPriorityEvent(t)

  await t.mutation(async (ctx) => {
    await ctx.db.insert("accommodationEventHotels", {
      eventId: first.eventId as never,
      hotelId: String(first.hotelId),
    })
    await ctx.db.insert("accommodationEventHotels", {
      eventId: second.eventId as never,
      hotelId: String(second.hotelId),
    })
  })
  const firstOrder = await createOrder(t, first, {
    attendeeKey: "first-event-attendee",
    name: "First Event Attendee",
  })
  const secondOrder = await createOrder(t, second, {
    attendeeKey: "second-event-attendee",
    name: "Second Event Attendee",
  })

  const firstBoard = await loadBoard(t, first.eventId)
  expect(firstBoard.unassignedAttendees.map((row) => row.attendeeId)).toContain(
    String(firstOrder.attendeeId)
  )
  expect(firstBoard.unassignedAttendees.map((row) => row.attendeeId)).not.toContain(
    String(secondOrder.attendeeId)
  )
  expect(firstBoard.submissionQueueRows.map((row) => row.attendeeId)).not.toContain(
    String(secondOrder.attendeeId)
  )
  expect(firstBoard.rooms.map((room) => room.id)).not.toContain(
    String(second.roomId)
  )
})

test("board keeps complete constrained groups across filters and disables unconstrained groups", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("accommodationEventHotels", {
      eventId: seed.eventId as never,
      hotelId: String(seed.hotelId),
    })
  })
  const first = await createOrder(t, seed, {
    attendeeKey: "a-constrained-group",
    name: "Constrained Group Member",
    allocatedRoomTypeId: String(seed.roomTypeId),
    location: "Amsterdam",
  })
  const second = await addAttendeeToOrder(t, seed, first.orderId, {
    attendeeKey: "b-constrained-group",
    name: "Hidden Group Member",
  })
  await t.mutation(async (ctx) => {
    await ctx.db.patch("orderAttendees", second, {
      allocatedRoomTypeId: seed.roomTypeId,
      location: "Utrecht",
    })
  })

  const filteredBoard = await t.query(
    api.accommodation.getRoomAllocationBoard,
    { eventId: String(seed.eventId), location: "Amsterdam" }
  )
  const filteredRow = filteredBoard.unassignedAttendees.find(
    (row: { attendeeId: string }) => row.attendeeId === String(first.attendeeId)
  )
  expect(filteredRow?.groupMemberIds).toEqual(
    expect.arrayContaining([String(first.attendeeId), String(second)])
  )
  expect(filteredRow?.groupAssignmentAvailable).toBe(true)
  expect(filteredBoard.unassignedAttendees).toHaveLength(1)

  const unconstrained = await createOrder(t, seed, {
    attendeeKey: "a-unconstrained-group",
    name: "Unconstrained Group Member",
  })
  const unconstrainedSecond = await addAttendeeToOrder(
    t,
    seed,
    unconstrained.orderId,
    { attendeeKey: "b-unconstrained-group", name: "Unconstrained Member Two" }
  )
  const unconstrainedBoard = await loadBoard(t, seed.eventId)
  const unconstrainedRow = unconstrainedBoard.unassignedAttendees.find(
    (row: { attendeeId: string }) => row.attendeeId === String(unconstrained.attendeeId)
  )
  expect(unconstrainedRow?.groupMemberIds).toEqual(
    expect.arrayContaining([
      String(unconstrained.attendeeId),
      String(unconstrainedSecond),
    ])
  )
  expect(unconstrainedRow?.groupAssignmentAvailable).toBe(false)
})

test("board projects one validated parent unit with nested no-bed children and waiting follow-ups", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const noBedTicketId = await createNoBedTicket(t, seed.eventId)
  const parent = await createOrder(t, seed, {
    attendeeKey: "family-parent",
    name: "Family Parent",
    allocatedRoomTypeId: String(seed.roomTypeId),
  })
  const childOne = await createOrder(t, seed, {
    attendeeKey: "family-child-one",
    name: "Family Child One",
    ticketTypeId: noBedTicketId,
  })
  const childTwo = await createOrder(t, seed, {
    attendeeKey: "family-child-two",
    name: "Family Child Two",
    ticketTypeId: noBedTicketId,
  })
  const familyGroupId = await linkFamily(
    t,
    String(parent.attendeeId),
    [String(parent.attendeeId), String(childOne.attendeeId), String(childTwo.attendeeId)],
    "Parent Anchored Family"
  )

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(seed.eventId),
  })
  const parentRows = board.unassignedAttendees.filter(
    (row: { familyGroupId?: string | null }) =>
      row.familyGroupId === String(familyGroupId)
  )
  expect(parentRows).toHaveLength(1)
  expect(parentRows[0]).toMatchObject({
    attendeeId: String(parent.attendeeId),
    familyRole: "parent",
    familyGroupId: String(familyGroupId),
    familyLabel: "Parent Anchored Family",
    familyParentAttendeeId: String(parent.attendeeId),
    familyState: "unresolved",
    eligibleChildCount: 2,
    separateMemberCount: 0,
  })
  expect(parentRows[0]?.eligibleChildren).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attendeeId: String(childOne.attendeeId),
        familyRole: "child",
        requiresBed: false,
        familyState: "waiting-for-parent-room",
      }),
      expect.objectContaining({
        attendeeId: String(childTwo.attendeeId),
        familyRole: "child",
        requiresBed: false,
        familyState: "waiting-for-parent-room",
      }),
    ])
  )
  expect(
    board.unassignedAttendees.map((row: { attendeeId: string }) => row.attendeeId)
  ).not.toEqual(
    expect.arrayContaining([
      String(childOne.attendeeId),
      String(childTwo.attendeeId),
    ])
  )
  expect(board.familyFollowUps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attendeeId: String(childOne.attendeeId),
        state: "Waiting for parent room",
        message: "Place the parent to assign this child to the same room.",
      }),
      expect.objectContaining({
        attendeeId: String(childTwo.attendeeId),
        state: "Waiting for parent room",
      }),
    ])
  )
  expect(board.summary).toMatchObject({
    unassignedAttendeesCount: 1,
    familyFollowUpsCount: 2,
  })
})

test("board surfaces missing and malformed no-bed family links instead of guessing solo placement", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const noBedTicketId = await createNoBedTicket(t, seed.eventId)
  const missingLink = await createOrder(t, seed, {
    attendeeKey: "missing-family-link",
    name: "Missing Family Link",
    ticketTypeId: noBedTicketId,
  })
  const malformed = await createOrder(t, seed, {
    attendeeKey: "malformed-family-link",
    name: "Malformed Family Link",
    ticketTypeId: noBedTicketId,
  })
  await t.mutation(async (ctx) => {
    const groupId = await ctx.db.insert("attendeeFamilyGroups", {
      label: "Malformed Family",
      primaryAttendeeId: "not-an-attendee-id",
    })
    await ctx.db.insert("attendeeFamilyMembers", {
      familyGroupId: String(groupId),
      attendeeId: String(malformed.attendeeId),
    })
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(seed.eventId),
  })
  expect(board.unassignedAttendees).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ attendeeId: String(missingLink.attendeeId) }),
      expect.objectContaining({ attendeeId: String(malformed.attendeeId) }),
    ])
  )
  expect(board.familyFollowUps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        attendeeId: String(missingLink.attendeeId),
        state: "Needs family link",
        message:
          "Review attendee details and link a valid family parent before placing this no-bed attendee.",
      }),
      expect.objectContaining({
        attendeeId: String(malformed.attendeeId),
        state: "inconsistent",
      }),
    ])
  )
})

test("board reports unavailable or no-match compatibility without fabrication or writes", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("accommodationEventHotels", {
      eventId: seed.eventId as never,
      hotelId: String(seed.hotelId),
    })
  })
  const missingType = await createOrder(t, seed, {
    attendeeKey: "a-missing-type",
    name: "Missing Type",
  })
  const noMatch = await createOrder(t, seed, {
    attendeeKey: "a-no-match",
    name: "No Matching Room",
    allocatedRoomTypeId: String(seed.unavailableRoomTypeId),
  })

  const board = await loadBoard(t, seed.eventId)
  expect(
    board.unassignedAttendees.find(
      (attendee) => attendee.attendeeId === String(missingType.attendeeId)
    )?.compatibility
  ).toEqual({
    status: "unavailable",
    summary: "Compatibility unavailable: requested room type is not stored.",
  })
  expect(
    board.unassignedAttendees.find(
      (attendee) => attendee.attendeeId === String(noMatch.attendeeId)
    )?.compatibility
  ).toEqual({
    status: "no_match",
    summary: "No available room matches the requested room type.",
  })

  const placements = await t.mutation(async (ctx) =>
    Promise.all([
      ctx.db.get("orderAttendees", missingType.attendeeId),
      ctx.db.get("orderAttendees", noMatch.attendeeId),
    ])
  )
  expect(placements.map((attendee) => attendee?.assignedRoomId)).toEqual([
    undefined,
    undefined,
  ])
})

// ---------------------------------------------------------------------------
// Ordering: payment rank first, then allocation priority and stable ties
// ---------------------------------------------------------------------------

test("paid attendees sort before partial and unpaid regardless of allocationPriority", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  // Paid LOW must rank ahead of partial CRITICAL and unpaid CRITICAL.
  await createOrder(t, seed, {
    attendeeKey: "a-paid",
    name: "Paid Low",
    allocationPriority: "LOW",
    withPaymentMinor: ATTENDEE_DUE_MINOR,
  })
  await createOrder(t, seed, {
    attendeeKey: "b-partial",
    name: "Partial Critical",
    allocationPriority: "CRITICAL",
    withPaymentMinor: Math.floor(ATTENDEE_DUE_MINOR / 2),
  })
  await createOrder(t, seed, {
    attendeeKey: "c-unpaid",
    name: "Unpaid Critical",
    allocationPriority: "CRITICAL",
  })

  const board = await loadBoard(t, seed.eventId)
  expect(board.unassignedAttendees.map((row) => row.attendeeName)).toEqual([
    "Paid Low",
    "Partial Critical",
    "Unpaid Critical",
  ])
  expect(board.unassignedAttendees[0]?.paymentState).toBe("paid")
  expect(board.unassignedAttendees[1]?.paymentState).toBe("partial")
  expect(board.unassignedAttendees[2]?.paymentState).toBe("unpaid")
})

test("submission queue orders equal payment state by allocation priority", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  // Both unpaid: LOW must sort after CRITICAL on the server queue contract.
  await createOrder(t, seed, {
    attendeeKey: "q-low",
    name: "Queue Low",
    allocationPriority: "LOW",
  })
  await createOrder(t, seed, {
    attendeeKey: "q-critical",
    name: "Queue Critical",
    allocationPriority: "CRITICAL",
  })

  const board = await loadBoard(t, seed.eventId)
  const queueNames = board.submissionQueueRows.map((row) => row.attendeeName)
  expect(queueNames.indexOf("Queue Critical")).toBeLessThan(
    queueNames.indexOf("Queue Low")
  )
  const criticalRow = board.submissionQueueRows.find(
    (row) => row.attendeeName === "Queue Critical"
  )
  expect(criticalRow?.allocationPriority).toBe("CRITICAL")
})

// ---------------------------------------------------------------------------
// Assignment confirmation lock boundary
// ---------------------------------------------------------------------------

test("first assignment persists confirmedAt/configVersion/complete priceSnapshot atomically", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-lock",
    name: "Lock Attendee",
    bookingRef: "BK-PP-LOCK01",
    ageBandCode: "18_plus",
  })

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(order.attendeeId),
    roomId: String(seed.roomId),
    eventId: String(seed.eventId),
  })

  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(1)
  expect(rows[0].confirmedAt).toEqual(expect.any(Number))
  expect(rows[0].configVersion).toEqual(expect.any(Number))
  expect(rows[0].priceSnapshot).toEqual({
    baseRatePerNightMinor: RATE_PER_NIGHT_MINOR,
    totalNights: NIGHT_COUNT,
    coveredNights: 0,
    optionLines: [],
  })

  // The attendee is now placed in the room.
  const placed = await t.mutation(async (db) => {
    return await db.db.get("orderAttendees", order.attendeeId)
  })
  expect(placed?.assignedRoomId).toBe(String(seed.roomId))
})

test("a selection with no selected options confirms successfully through assignment", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-blankband",
    name: "Blank Band Attendee",
    bookingRef: "BK-PP-BLANK01",
  })

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(order.attendeeId),
    roomId: String(seed.roomId),
    eventId: String(seed.eventId),
  })

  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(1)
  expect(rows[0].confirmedAt).toEqual(expect.any(Number))
  expect(rows[0].priceSnapshot).toMatchObject({
    baseRatePerNightMinor: RATE_PER_NIGHT_MINOR,
    optionLines: [],
  })
})

test("repeat assignment of an already-confirmed order stays assignable and never re-confirms", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-first",
    name: "First Attendee",
    bookingRef: "BK-PP-REPEAT01",
    ageBandCode: "18_plus",
  })
  const secondAttendeeId = await addAttendeeToOrder(t, seed, order.orderId, {
    attendeeKey: "a-second",
    name: "Second Attendee",
    ageBandCode: "18_plus",
  })

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(order.attendeeId),
    roomId: String(seed.roomId),
    eventId: String(seed.eventId),
  })
  const confirmedAtAfterFirst = (
    await loadSelectionRows(t, String(order.orderId))
  )[0]?.confirmedAt

  // Same order, second attendee, different room: allowed, rows stay locked.
  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(secondAttendeeId),
    roomId: String(seed.secondRoomId),
    eventId: String(seed.eventId),
  })

  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.confirmedAt === confirmedAtAfterFirst)).toBe(
    true
  )
})

test("assignment fails closed on malformed confirmation state", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-malformed",
    name: "Malformed Attendee",
    bookingRef: "BK-PP-MALF01",
    ageBandCode: "18_plus",
  })

  // Corrupt the selection row: confirmedAt present but no complete snapshot.
  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(1)
  await t.mutation(async (db) => {
    await db.db.patch(
      "orderAccommodationSelections",
      rows[0]._id as Id<"orderAccommodationSelections">,
      {
        confirmedAt: 123456,
        configVersion: 1,
        priceSnapshot: undefined,
      }
    )
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow(/malformed accommodation confirmation state/)
})

test("assignment fails closed when only part of the selection set is confirmed", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-partial",
    name: "Partial Attendee",
    bookingRef: "BK-PP-PARTIAL01",
    ageBandCode: "18_plus",
  })
  const secondAttendeeId = await addAttendeeToOrder(t, seed, order.orderId, {
    attendeeKey: "a-partial-2",
    name: "Partial Attendee Two",
    ageBandCode: "18_plus",
  })

  // Confirm ONLY the first attendee's row (with a complete snapshot, so the
  // row is fully confirmed), leaving the second unconfirmed.
  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(2)
  const firstRow = rows.find(
    (row) => String(row.attendeeId) === String(order.attendeeId)
  )
  expect(firstRow).toBeDefined()
  await t.mutation(async (db) => {
    await db.db.patch(
      "orderAccommodationSelections",
      firstRow!._id as Id<"orderAccommodationSelections">,
      {
        confirmedAt: BASE_EVENT_AT,
        configVersion: BASE_EVENT_AT,
        priceSnapshot: {
          baseRatePerNightMinor: RATE_PER_NIGHT_MINOR,
          totalNights: NIGHT_COUNT,
          coveredNights: 0,
          optionLines: [],
        },
      }
    )
  })

  // Assigning either attendee must fail closed: a partially confirmed set can
  // never be assigned or silently completed.
  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow(/partially confirmed accommodation selections/)

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(secondAttendeeId),
      roomId: String(seed.secondRoomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow(/partially confirmed accommodation selections/)

  // No room was written for either attendee.
  const firstPlaced = await t.mutation(async (db) => {
    return await db.db.get("orderAttendees", order.attendeeId)
  })
  const secondPlaced = await t.mutation(async (db) => {
    return await db.db.get("orderAttendees", secondAttendeeId)
  })
  expect(firstPlaced?.assignedRoomId).toBeUndefined()
  expect(secondPlaced?.assignedRoomId).toBeUndefined()
})

test("assignment rejects non-positive confirmedAt and configVersion", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-nonpositive",
    name: "Non-Positive Attendee",
    bookingRef: "BK-PP-NONPOS01",
    ageBandCode: "18_plus",
  })

  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(1)
  // Isolate the metadata check: provide a complete price snapshot with
  // non-positive confirmedAt/configVersion. The row must still be rejected
  // as malformed (matching the finance loader's > 0 requirement).
  await t.mutation(async (db) => {
    await db.db.patch(
      "orderAccommodationSelections",
      rows[0]._id as Id<"orderAccommodationSelections">,
      {
        confirmedAt: 0,
        configVersion: 0,
        priceSnapshot: {
          baseRatePerNightMinor: RATE_PER_NIGHT_MINOR,
          totalNights: NIGHT_COUNT,
          coveredNights: 0,
          optionLines: [],
        },
      }
    )
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).rejects.toThrow(/malformed accommodation confirmation state/)
})

test("legacy order with no accommodation selection rows still assigns", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-legacy",
    name: "Legacy Attendee",
    bookingRef: "BK-PP-LEGACY01",
    includeAccommodationSelection: false,
    allocatedRoomTypeId: String(seed.roomTypeId),
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(seed.roomId),
      eventId: String(seed.eventId),
    })
  ).resolves.toEqual({ ok: true })

  const placed = await t.mutation(async (db) => {
    return await db.db.get("orderAttendees", order.attendeeId)
  })
  expect(placed?.assignedRoomId).toBe(String(seed.roomId))
})

test("assignment confirmation locks the buyer configuration: permalink edits are rejected", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-locked",
    name: "Locked Attendee",
    bookingRef: "BK-PP-EDITEDIT01",
    bookerEmail: "booker@example.com",
    ageBandCode: "18_plus",
  })

  // First assignment confirms the order's accommodation selections.
  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(order.attendeeId),
    roomId: String(seed.roomId),
    eventId: String(seed.eventId),
  })

  // A buyer edit attempt against the same booking is rejected server-side by
  // the persisted confirmedAt guard, even with a valid signed envelope.
  const selections = [
    {
      attendeeKey: "a-locked",
      categoryId: seed.categoryStandardId,
      occupancy: "shared" as const,
      optionSelections: [],
    },
  ]
  const idempotencyKey = `edit-idem-${Math.random().toString(36).slice(2)}`
  const requestSignature = await mintEditRequestSignature({
    bookingRef: order.bookingRef,
    bookerEmail: "booker@example.com",
    idempotencyKey,
    selections,
    secret: TEST_TRACK_PAYMENT_SECRET,
  })

  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef: order.bookingRef,
      bookerEmail: "booker@example.com",
      requestSignature,
      idempotencyKey,
      selections,
    })
  ).rejects.toThrow(/locked because the organizer has confirmed this configuration/)
})

// ---------------------------------------------------------------------------
// Canonical agreement: the board projection uses the same loader as finance
// ---------------------------------------------------------------------------

test("board payment state agrees with the canonical amount-due loader", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-agree",
    name: "Agree Attendee",
    bookingRef: "BK-PP-AGREE01",
    withPaymentMinor: ATTENDEE_DUE_MINOR,
  })

  const canonical = await t.query(async (ctx) => {
    const loaderCtx = ctx as unknown as Parameters<
      typeof loadOrderAmountDueBreakdowns
    >[0]
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: order.orderId as never },
    ])
    return breakdowns.get(String(order.orderId))?.amountDueMinor ?? null
  })
  expect(canonical).toBe(ATTENDEE_DUE_MINOR)

  const board = await loadBoard(t, seed.eventId)
  const row = board.unassignedAttendees.find(
    (attendee) => attendee.attendeeName === "Agree Attendee"
  )
  expect(row?.amountDueMinor).toBe(canonical)
  expect(row?.paymentState).toBe("paid")
})
