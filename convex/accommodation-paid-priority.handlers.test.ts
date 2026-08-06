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
}

/**
 * Seeds an internal event with a fully configured accommodation catalog
 * (standard/shared €30/night, 2 nights), one ticket type, and two empty
 * capacity-2 rooms. The hotel is intentionally NOT linked to the event so the
 * direct room-assignment mutations skip the event-hotel gate, while the
 * accommodation board still scopes internal orders and their attendees.
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
    optionId: upgradeOptionId,
    enabled: true,
    priceMinor: 1500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
    eligibilityAgeBandCode: "under_3",
  })
  await t.mutation(api.accommodation.upsertEventAccommodationAgePricing, {
    eventId,
    ageBandCode: "18_plus",
    rateType: "full",
    value: 0,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationAgePricing, {
    eventId,
    ageBandCode: "under_3",
    rateType: "free",
    value: 0,
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
  const roomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Shared Twin",
      defaultCapacity: 2,
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
    bookingRef?: string
    bookerEmail?: string
    orderStatus?: "paid" | "refunded" | "cancelled" | "pending"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
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
      bookerName: "Booker",
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
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      ticketTypeId: seed.ticketTypeId as never,
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
        upgradeSelected: false,
        cotSelected: false,
        ...(input.ageBandCode !== undefined && input.ageBandCode !== null
          ? { ageBandCode: input.ageBandCode }
          : {}),
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
      upgradeSelected: false,
      cotSelected: false,
      ...(input.ageBandCode !== undefined && input.ageBandCode !== null
        ? { ageBandCode: input.ageBandCode }
        : {}),
      nightCount: NIGHT_COUNT,
    })
  })
  return attendeeId as Id<"orderAttendees">
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
      allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
      paymentState: "paid" | "partial" | "unpaid" | null
      amountDueMinor: number | null
      paidAmountMinor: number | null
    }>
    submissionQueueRows: Array<{
      attendeeId: string
      attendeeName: string | null
      allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
      paymentState: "paid" | "partial" | "unpaid" | null
      amountDueMinor: number | null
      paidAmountMinor: number | null
    }>
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
  })

  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(1)
  expect(rows[0].confirmedAt).toEqual(expect.any(Number))
  expect(rows[0].configVersion).toEqual(expect.any(Number))
  expect(rows[0].priceSnapshot).toEqual({
    baseRatePerNightMinor: RATE_PER_NIGHT_MINOR,
    upgradeRatePerNightMinor: 1500,
    cotRatePerNightMinor: 500,
    totalNights: NIGHT_COUNT,
    coveredNights: 0,
    categoryIsSuperior: false,
    upgradeSelected: false,
    cotSelected: false,
    ageBandCode: "18_plus",
    cotEligibilityAgeBandCode: "under_3",
  })

  // The attendee is now placed in the room.
  const placed = await t.mutation(async (db) => {
    return await db.db.get("orderAttendees", order.attendeeId)
  })
  expect(placed?.assignedRoomId).toBe(String(seed.roomId))
})

test("optional age band with no cot confirms successfully through assignment", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await seedPaidPriorityEvent(t)
  const order = await createOrder(t, seed, {
    attendeeKey: "a-blankband",
    name: "Blank Band Attendee",
    bookingRef: "BK-PP-BLANK01",
    // ageBandCode intentionally undefined: Phase 42 optional band, no cot.
  })

  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(order.attendeeId),
    roomId: String(seed.roomId),
  })

  const rows = await loadSelectionRows(t, String(order.orderId))
  expect(rows).toHaveLength(1)
  expect(rows[0].confirmedAt).toEqual(expect.any(Number))
  const snapshot = rows[0].priceSnapshot as
    | { ageBandCode?: string; cotSelected?: boolean }
    | null
  expect(snapshot?.ageBandCode).toBe("")
  expect(snapshot?.cotSelected).toBe(false)
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
  })
  const confirmedAtAfterFirst = (
    await loadSelectionRows(t, String(order.orderId))
  )[0]?.confirmedAt

  // Same order, second attendee, different room: allowed, rows stay locked.
  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(secondAttendeeId),
    roomId: String(seed.secondRoomId),
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
          upgradeRatePerNightMinor: 1500,
          cotRatePerNightMinor: 500,
          totalNights: NIGHT_COUNT,
          coveredNights: 0,
          categoryIsSuperior: false,
          upgradeSelected: false,
          cotSelected: false,
          ageBandCode: "18_plus",
          cotEligibilityAgeBandCode: "under_3",
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
    })
  ).rejects.toThrow(/partially confirmed accommodation selections/)

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(secondAttendeeId),
      roomId: String(seed.secondRoomId),
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
          upgradeRatePerNightMinor: 1500,
          cotRatePerNightMinor: 500,
          totalNights: NIGHT_COUNT,
          coveredNights: 0,
          categoryIsSuperior: false,
          upgradeSelected: false,
          cotSelected: false,
          ageBandCode: "18_plus",
          cotEligibilityAgeBandCode: "under_3",
        },
      }
    )
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(seed.roomId),
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
  })

  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(order.attendeeId),
      roomId: String(seed.roomId),
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
  })

  // A buyer edit attempt against the same booking is rejected server-side by
  // the persisted confirmedAt guard, even with a valid signed envelope.
  const selections = [
    {
      attendeeKey: "a-locked",
      categoryId: seed.categoryStandardId,
      occupancy: "shared" as const,
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus" as const,
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
