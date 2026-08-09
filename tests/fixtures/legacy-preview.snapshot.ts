/**
 * Deterministic, sanitized fixture mirroring the PRODUCTION data audit for
 * the `divine-redesign` event (Phase 47 / LEG-01/02/03).
 *
 * Audited shape:
 * - 2 hotels, 84 rooms, 160 slots
 * - 51 orders / 116 attendees, partitioned into:
 *   - 38 orders / 72 attendees with ZERO accommodation selections
 *   - 13 orders / 44 attendees carrying pending legacy `orderAssignments`
 * - Legacy room types (the Double/Single the audit observed) have NO
 *   categoryId — the backfill must resolve the included category through the
 *   event's Standard category, never through the room type category field.
 *
 * The generator is pure and PII-free by construction (Preview Attendee N /
 * previewN@example.org / etc.) and produces the same shape as a Convex
 * export so it can drive the backfill tests and the sanitized preview seed.
 */

export const LEGACY_AUDIT_COUNTS = {
  hotels: 2,
  rooms: 84,
  slots: 160,
  orders: 51,
  attendees: 116,
  noSelectionOrders: 38,
  noSelectionAttendees: 72,
  legacyAssignmentOrders: 13,
  legacyAssignmentAttendees: 44,
} as const

export const LEGACY_EVENT_SLUG = "divine-redesign"
export const LEGACY_BASE_CHECK_IN_AT = 1_750_000_000_000
export const LEGACY_DAY_MS = 24 * 60 * 60 * 1000

export type PreviewSnapshot = Record<string, Array<Record<string, unknown>>>

export function buildLegacyPreviewSnapshot(): PreviewSnapshot {
  const eventId = "evt_divine_redesign"
  const categoryStandardId = "cat_standard"
  const categorySuperiorId = "cat_superior"
  const roomTypeStandard = "rt_standard"
  const roomTypeStandardSingle = "rt_standard_single"
  const roomTypeSuperior = "rt_superior"
  const roomTypeLegacyDouble = "rt_legacy_double"
  const roomTypeLegacySingle = "rt_legacy_single"
  const hotelOne = "hotel_koningshof"
  const hotelTwo = "hotel_heidepark"

  const rooms: Array<Record<string, unknown>> = []
  const slots: Array<Record<string, unknown>> = []
  const hotelRooms = [hotelOne, hotelTwo]
  for (let hotelIndex = 0; hotelIndex < 2; hotelIndex += 1) {
    for (let roomIndex = 0; roomIndex < 42; roomIndex += 1) {
      const roomId = `room_h${hotelIndex + 1}_${roomIndex + 1}`
      const roomTypeId =
        roomIndex % 3 === 0 ? roomTypeStandard : roomTypeLegacyDouble
      rooms.push({
        _id: roomId,
        hotelId: hotelRooms[hotelIndex],
        roomTypeId,
        label: `Preview Room ${rooms.length + 1}`,
        capacity: roomTypeId === roomTypeStandard ? 2 : 2,
      })
    }
  }
  for (let slotIndex = 0; slotIndex < 160; slotIndex += 1) {
    const hotelIndex = slotIndex % 84 < 42 ? 0 : 1
    const roomId = `room_h${hotelIndex + 1}_${(slotIndex % 42) + 1}`
    slots.push({
      _id: `slot_s${slotIndex + 1}`,
      eventId,
      hotelId: hotelRooms[hotelIndex],
      roomId,
      slotLabel: `Preview Slot ${slotIndex + 1}`,
      genderPolicy: "mixed",
      isAssignable: true,
      updatedAt: LEGACY_BASE_CHECK_IN_AT,
    })
  }

  // Partition attendees: 38 no-selection orders / 72 attendees; 13
  // legacy-assignment orders / 44 attendees.
  const noSelectionOrderCounts = distribute(72, 38)
  const legacyOrderCounts = distribute(44, 13)

  const orders: Array<Record<string, unknown>> = []
  const attendees: Array<Record<string, unknown>> = []
  const ticketSelections: Array<Record<string, unknown>> = []
  const assignments: Array<Record<string, unknown>> = []
  const selections: Array<Record<string, unknown>> = []

  let attendeeOrdinal = 0

  const buildOrder = (
    orderIndex: number,
    attendeeCount: number,
    hasLegacyAssignments: boolean
  ): { orderId: string; attendeeIds: string[] } => {
    const orderId = `order_${String(orderIndex).padStart(2, "0")}`
    orders.push({
      _id: orderId,
      eventId,
      bookingRef: `BK-PREVIEW-${String(1000 + orderIndex)}`,
      bookerName: `Preview Book ${orderIndex}`,
      bookerEmail: `preview${orderIndex}@example.org`,
      bookerPhone: "+3100000000",
      status: "paid",
      totalAmountMinor: 30000,
    })
    const attendeeIds: string[] = []
    for (let attendeeOffset = 0; attendeeOffset < attendeeCount; attendeeOffset += 1) {
      attendeeOrdinal += 1
      const attendeeId = `attendee_${String(attendeeOrdinal).padStart(3, "0")}`
      attendeeIds.push(attendeeId)
      const isSingle = attendeeOrdinal % 7 === 0
      attendees.push({
        _id: attendeeId,
        orderId,
        attendeeKey: `attendee-${attendeeOrdinal}`,
        name: `Preview Attendee ${attendeeOrdinal}`,
        email: `preview${attendeeOrdinal}@example.org`,
        gender: "female",
        sortOrder: attendeeOffset,
      })
      // No-selection orders use the category'd Standard tickets (fully
      // editable through the manage-booking path). Legacy-assignment orders
      // use the category-less legacy tickets and already carry a first
      // preference, so the backfill skips them as already-handled.
      const ticketTypeId = hasLegacyAssignments
        ? isSingle
          ? "ticket_legacy_single"
          : "ticket_legacy_shared"
        : "ticket_standard_shared"
      ticketSelections.push({
        _id: `ts_${attendeeOrdinal}`,
        orderId,
        attendeeId,
        ticketTypeId,
        quantity: 1,
        sortOrder: 0,
      })
      if (hasLegacyAssignments) {
        assignments.push({
          _id: `assignment_${attendeeOrdinal}`,
          orderId,
          attendeeId,
          slotId: `slot_s${(attendeeOrdinal % 160) + 1}`,
          assignmentIntent: "assign",
          sortOrder: attendeeOffset,
        })
        selections.push({
          _id: `selection_${attendeeOrdinal}`,
          orderId,
          attendeeId,
          categoryId: categoryStandardId,
          occupancy: isSingle ? "single" : "shared",
          checkInAt: LEGACY_BASE_CHECK_IN_AT,
          checkOutAt: LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS,
          nightCount: 2,
        })
      }
    }
    return { orderId, attendeeIds }
  }

  noSelectionOrderCounts.forEach((count, index) => {
    buildOrder(index + 1, count, false)
  })
  legacyOrderCounts.forEach((count, index) => {
    buildOrder(index + 39, count, true)
  })

  return {
    events: [
      {
        _id: eventId,
        slug: LEGACY_EVENT_SLUG,
        title: "Divine Conference (Preview)",
        startsAt: LEGACY_BASE_CHECK_IN_AT,
        timezone: "Europe/Amsterdam",
        currency: "EUR",
        isPublished: true,
        isSignupOpen: true,
        accommodationEnabled: true,
        primarySourceKind: "internal",
        updatedAt: LEGACY_BASE_CHECK_IN_AT,
      },
    ],
    accommodationCategories: [
      { _id: categoryStandardId, code: "standard", label: "Standard", sortOrder: 1 },
      { _id: categorySuperiorId, code: "superior", label: "Superior", sortOrder: 2 },
    ],
    accommodationOptions: [
      {
        _id: "option_superior_upgrade",
        code: "superior_upgrade",
        label: "Superior upgrade",
        description: "Upgrade the included stay to Superior rooms.",
        kind: "upgrade",
        unit: "per_night",
      },
    ],
    eventAccommodationOptions: [
      {
        _id: "evo_superior_upgrade",
        eventId,
        optionId: "option_superior_upgrade",
        enabled: true,
        priceMinor: 1000,
      },
    ],
    eventAccommodationResources: [
      {
        _id: "resource_standard_rooms",
        eventId,
        kind: "room",
        roomTypeId: roomTypeStandard,
        count: 28,
      },
      {
        _id: "resource_legacy_rooms",
        eventId,
        kind: "room",
        roomTypeId: roomTypeLegacyDouble,
        count: 56,
      },
    ],
    accommodationRoomTypes: [
      {
        _id: roomTypeStandard,
        label: "Preview Standard Double",
        defaultCapacity: 2,
        categoryId: categoryStandardId,
      },
      {
        _id: roomTypeStandardSingle,
        label: "Preview Standard Single",
        defaultCapacity: 1,
        categoryId: categoryStandardId,
      },
      {
        _id: roomTypeSuperior,
        label: "Preview Superior Double",
        defaultCapacity: 2,
        categoryId: categorySuperiorId,
      },
      { _id: roomTypeLegacyDouble, label: "Preview Double", defaultCapacity: 2 },
      { _id: roomTypeLegacySingle, label: "Preview Single", defaultCapacity: 1 },
    ],
    accommodationHotels: [
      { _id: hotelOne, name: "Preview Hotel One", city: "Preview City 1" },
      { _id: hotelTwo, name: "Preview Hotel Two", city: "Preview City 2" },
    ],
    accommodationEventHotels: [
      { _id: "evh_1", eventId, hotelId: hotelOne },
      { _id: "evh_2", eventId, hotelId: hotelTwo },
    ],
    accommodationRooms: rooms,
    accommodationSlots: slots,
    eventAccommodationConfig: [
      {
        _id: "cfg_divine_redesign",
        eventId,
        baseCheckInAt: LEGACY_BASE_CHECK_IN_AT,
        baseCheckOutAt: LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS,
        allowExtendedStayBefore: false,
        allowExtendedStayAfter: false,
        allowExtendedStayBoth: false,
        defaultCategoryId: categoryStandardId,
        breakfastIncluded: true,
        nightCount: 2,
        updatedAt: LEGACY_BASE_CHECK_IN_AT,
      },
    ],
    eventAccommodationRates: [
      { _id: "rate_std_single", eventId, categoryId: categoryStandardId, occupancy: "single", pricePerPersonMinor: 9000 },
      { _id: "rate_std_shared", eventId, categoryId: categoryStandardId, occupancy: "shared", pricePerPersonMinor: 6000 },
      { _id: "rate_sup_single", eventId, categoryId: categorySuperiorId, occupancy: "single", pricePerPersonMinor: 10000 },
      { _id: "rate_sup_shared", eventId, categoryId: categorySuperiorId, occupancy: "shared", pricePerPersonMinor: 7000 },
    ],
    ticketTypes: [
      { _id: "ticket_standard_shared", eventId, label: "Standard Shared Ticket", priceMinor: 20000, isActive: true, visibility: "public", availabilityState: "selectable", roomTypeId: roomTypeStandard, accommodationIncluded: true, updatedAt: LEGACY_BASE_CHECK_IN_AT },
      { _id: "ticket_standard_single", eventId, label: "Standard Single Ticket", priceMinor: 24000, isActive: true, visibility: "public", availabilityState: "selectable", roomTypeId: roomTypeStandardSingle, accommodationIncluded: true, updatedAt: LEGACY_BASE_CHECK_IN_AT },
      { _id: "ticket_legacy_shared", eventId, label: "Legacy Shared Ticket", priceMinor: 20000, isActive: true, visibility: "public", availabilityState: "selectable", roomTypeId: roomTypeLegacyDouble, accommodationIncluded: true, updatedAt: LEGACY_BASE_CHECK_IN_AT },
      { _id: "ticket_legacy_single", eventId, label: "Legacy Single Ticket", priceMinor: 22000, isActive: true, visibility: "public", availabilityState: "selectable", roomTypeId: roomTypeLegacySingle, accommodationIncluded: true, updatedAt: LEGACY_BASE_CHECK_IN_AT },
    ],
    orders,
    orderAttendees: attendees,
    orderTicketSelections: ticketSelections,
    orderAssignments: assignments,
    orderAccommodationSelections: selections,
  }
}

/**
 * Split `total` into `bucketCount` positive integers (last bucket absorbs the
 * remainder), deterministically. Mirrors the audited 72-over-38 and
 * 44-over-13 distributions.
 */
function distribute(total: number, bucketCount: number): number[] {
  const base = Math.floor(total / bucketCount)
  const remainder = total - base * bucketCount
  const counts: number[] = []
  for (let index = 0; index < bucketCount; index += 1) {
    counts.push(index < remainder ? base + 1 : base)
  }
  return counts
}
