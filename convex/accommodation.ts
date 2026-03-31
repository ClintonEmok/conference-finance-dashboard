import { internalMutation, query, mutation } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { requireIdentity } from "./auth"

type DocTables = {
  accommodationHotels: Doc<"accommodationHotels">
  accommodationRoomTypes: Doc<"accommodationRoomTypes">
  accommodationRooms: Doc<"accommodationRooms">
  orderAttendees: Doc<"orderAttendees">
  ticketTailorAttendees: Doc<"ticketTailorAttendees">
}

function normalizeDocId<TableName extends keyof DocTables>(
  ctx: {
    db: {
      normalizeId: <T extends keyof DocTables>(
        tableName: T,
        id: string
      ) => Id<T> | null
    }
  },
  tableName: TableName,
  id: string,
  errorMessage: string
) {
  const normalizedId = ctx.db.normalizeId(tableName, id)

  if (!normalizedId) {
    throw new Error(errorMessage)
  }

  return normalizedId
}

async function getAccommodationHotelByStringId(ctx: any, hotelId: string) {
  const normalizedHotelId = ctx.db.normalizeId("accommodationHotels", hotelId)
  return normalizedHotelId
    ? await ctx.db.get("accommodationHotels", normalizedHotelId)
    : null
}

async function getAccommodationRoomByStringId(ctx: any, roomId: string) {
  const normalizedRoomId = ctx.db.normalizeId("accommodationRooms", roomId)
  return normalizedRoomId
    ? await ctx.db.get("accommodationRooms", normalizedRoomId)
    : null
}

async function getAccommodationRoomTypeByStringId(
  ctx: any,
  roomTypeId: string
) {
  const normalizedRoomTypeId = ctx.db.normalizeId(
    "accommodationRoomTypes",
    roomTypeId
  )
  return normalizedRoomTypeId
    ? await ctx.db.get("accommodationRoomTypes", normalizedRoomTypeId)
    : null
}

async function getAttendeeByStringId(ctx: any, attendeeId: string) {
  const normalizedAttendeeId = ctx.db.normalizeId("orderAttendees", attendeeId)
  return normalizedAttendeeId
    ? await ctx.db.get("orderAttendees", normalizedAttendeeId)
    : null
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function getAttendeeLocation(customAnswers: unknown): string | null {
  if (!customAnswers || typeof customAnswers !== "object") {
    return null
  }

  const location = (customAnswers as { location?: unknown }).location
  return typeof location === "string" ? normalizeOptionalString(location) : null
}

function hasPriorityAttendee(
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null | undefined
): boolean {
  return allocationPriority === "CRITICAL" || allocationPriority === "HIGH"
}

/**
 * Normalizes lowercase gender values (from core orderAttendees.gender) to uppercase display values.
 * Core table stores lowercase ("male"|"female"|"mixed"|"unknown"), TT extension stores uppercase ("MALE"|"FEMALE"|"MIXED"|"UNKNOWN").
 */
function normalizeGender(
  gender: "male" | "female" | "mixed" | "unknown"
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" {
  const mapping: Record<string, "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"> = {
    male: "MALE",
    female: "FEMALE",
    mixed: "MIXED",
    unknown: "UNKNOWN",
  }
  return mapping[gender] ?? "UNKNOWN"
}

function allocationPriorityRank(
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null | undefined
): number {
  const ranks: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
  }
  return ranks[priority ?? "NORMAL"] ?? 2
}

export function attendeeMatchesSignalFilters(input: {
  attendee: {
    customAnswers?: unknown
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }
  attendeeFamilyGroupId: string | null
  filters: {
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    familyGroupId?: string
    location?: string
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    hasPriority?: boolean
  }
}): boolean {
  if (
    input.filters.genderType &&
    input.attendee.genderType !== input.filters.genderType
  ) {
    return false
  }

  if (
    input.filters.familyGroupId &&
    input.attendeeFamilyGroupId !== input.filters.familyGroupId
  ) {
    return false
  }

  const normalizedLocationFilter = normalizeOptionalString(
    input.filters.location
  )
  if (normalizedLocationFilter) {
    const attendeeLocation = getAttendeeLocation(input.attendee.customAnswers)
    if (
      !attendeeLocation ||
      attendeeLocation.toLowerCase() !== normalizedLocationFilter.toLowerCase()
    ) {
      return false
    }
  }

  if (
    input.filters.allocationPriority &&
    input.attendee.allocationPriority !== input.filters.allocationPriority
  ) {
    return false
  }

  if (
    input.filters.hasPriority !== undefined &&
    hasPriorityAttendee(input.attendee.allocationPriority ?? null) !==
      input.filters.hasPriority
  ) {
    return false
  }

  return true
}

export function hasFamilySignal(input: {
  attendeeId: string
  providerOrderId: string
  attendeeFamilyGroupId: string | null
  attendeeCountByOrderId: Map<string, number>
}): boolean {
  if (input.attendeeFamilyGroupId) {
    return true
  }

  return (input.attendeeCountByOrderId.get(input.providerOrderId) ?? 0) > 1
}

export const recalculateRoomOccupancy = internalMutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)

    if (!room) {
      throw new Error("Room not found")
    }

    // Bounded: one room has limited occupants
    const occupants = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(100)

    await ctx.db.patch("accommodationRooms", roomId, {
      occupiedBeds: occupants.length,
    })

    return { ok: true, occupiedBeds: occupants.length }
  },
})

export const getRoomAllocationBoard = query({
  args: {
    eventId: v.optional(v.string()),
    hotelId: v.optional(v.string()),
    roomTypeId: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    familyGroupId: v.optional(v.string()),
    location: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    hasPriority: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const eventId = args.eventId

    // Get provider event IDs for this canonical event via eventSources
    let providerEventIds: string[] = []
    let eventSourceMap = new Map<string, string>() // providerEventId -> canonical eventId

    if (eventId) {
      const eventSources = await ctx.db
        .query("eventSources")
        .withIndex("by_eventId", (q) =>
          q.eq("eventId", eventId as Id<"events">)
        )
        .take(50)

      for (const source of eventSources) {
        providerEventIds.push(source.externalEventId)
        eventSourceMap.set(source.externalEventId, eventId)
      }

      // Also check if there's a direct provider event ID match (backward compat)
      const providerEvent = await ctx.db
        .query("ticketTailorEvents")
        .withIndex("providerEventId", (q) => q.eq("providerEventId", eventId))
        .first()

      if (providerEvent && !providerEventIds.includes(eventId)) {
        providerEventIds.push(eventId)
        eventSourceMap.set(eventId, eventId)
      }
    }

    const scopedHotelIds = eventId
      ? (
          await ctx.db
            .query("accommodationEventHotels")
            .withIndex("eventId_hotelId", (q) => q.eq("eventId", eventId))
            .take(200)
        ).map((eh) => eh.hotelId)
      : null

    const [
      events,
      canonicalEvents,
      hotels,
      roomTypes,
      rooms,
      allAttendees,
      familyMembers,
      accommodationSlotDocs,
      allOrders,
    ] = await Promise.all([
      ctx.db.query("ticketTailorEvents").take(200),
      ctx.db.query("events").take(200),
      ctx.db.query("accommodationHotels").take(200),
      ctx.db.query("accommodationRoomTypes").take(100),
      ctx.db.query("accommodationRooms").take(500),
      ctx.db.query("ticketTailorAttendees").take(2000),
      ctx.db.query("attendeeFamilyMembers").take(2000),
      ctx.db.query("accommodationSlots").take(1000),
      eventId
        ? ctx.db
            .query("orders")
            .withIndex("by_eventId", (q) =>
              q.eq("eventId", eventId as Id<"events">)
            )
            .take(500)
        : ctx.db.query("orders").take(500),
    ])

    const normalizedLocationFilter = normalizeOptionalString(args.location)

    const attendeeFamilyGroupByAttendeeId = new Map<string, string>()
    for (const familyMember of familyMembers) {
      if (!attendeeFamilyGroupByAttendeeId.has(familyMember.attendeeId)) {
        attendeeFamilyGroupByAttendeeId.set(
          familyMember.attendeeId,
          familyMember.familyGroupId
        )
      }
    }

    const attendeeCountByOrderId = new Map<string, number>()
    for (const attendee of allAttendees) {
      attendeeCountByOrderId.set(
        attendee.providerOrderId,
        (attendeeCountByOrderId.get(attendee.providerOrderId) ?? 0) + 1
      )
    }

    const filteredRooms = rooms.filter((room) => {
      if (scopedHotelIds && !scopedHotelIds.includes(room.hotelId as string))
        return false
      if (args.hotelId && room.hotelId !== args.hotelId) return false
      if (args.roomTypeId && room.roomTypeId !== args.roomTypeId) return false
      return true
    })

    const unassignedAttendees = allAttendees.filter((a) => {
      if (a.assignedRoomId) return false
      if (eventId && !providerEventIds.includes(a.providerEventId)) return false
      const attendeeFamilyGroupId =
        attendeeFamilyGroupByAttendeeId.get(a._id) ?? null

      return attendeeMatchesSignalFilters({
        attendee: a,
        attendeeFamilyGroupId,
        filters: {
          genderType: args.genderType,
          familyGroupId: args.familyGroupId,
          location: normalizedLocationFilter ?? undefined,
          allocationPriority: args.allocationPriority,
          hasPriority: args.hasPriority,
        },
      })
    })

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))

    // Build mapping from providerEventId to canonical event info
    // We use eventSources to bridge provider IDs to canonical events
    const canonicalEventByProviderId = new Map<
      string,
      (typeof canonicalEvents)[number]
    >()
    for (const event of canonicalEvents) {
      // Find event sources for this canonical event
      const sources = await ctx.db
        .query("eventSources")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(10)
      for (const source of sources) {
        canonicalEventByProviderId.set(source.externalEventId, event)
      }
      // Also check if event's slug matches any providerEventId (direct mapping)
      const providerEvent = events.find((e) => e.providerEventId === event.slug)
      if (providerEvent) {
        canonicalEventByProviderId.set(providerEvent.providerEventId, event)
      }
    }

    // Legacy map for TT events (for backward compat)
    const ttEventMap = new Map(events.map((e) => [e.providerEventId, e]))

    const attendeesByRoom: Record<string, typeof allAttendees> = {}
    for (const attendee of allAttendees) {
      if (attendee.assignedRoomId) {
        if (!attendeesByRoom[attendee.assignedRoomId]) {
          attendeesByRoom[attendee.assignedRoomId] = []
        }
        attendeesByRoom[attendee.assignedRoomId].push(attendee)
      }
    }

    const mappedRooms = filteredRooms.map((room) => {
      const hotel = hotelMap.get(room.hotelId as string)
      const roomType = roomTypeMap.get(room.roomTypeId as string)
      const occupants = (attendeesByRoom[room._id] ?? []).map((a) => {
        const canonicalEvent = canonicalEventByProviderId.get(a.providerEventId)
        const ttEvent = ttEventMap.get(a.providerEventId)
        return {
          attendeeId: a._id,
          attendeeName: a.name ?? null,
          attendeeEmail: a.email ?? null,
          providerOrderId: a.providerOrderId,
          providerEventId: a.providerEventId,
          eventId: canonicalEvent?._id ?? null,
          eventName: canonicalEvent?.title ?? ttEvent?.name ?? null,
          ticketTypeLabel: a.ticketTypeLabel ?? null,
        }
      })
      const occupiedBeds = occupants.length
      const availableBeds = Math.max(0, room.capacity - occupiedBeds)
      const availability =
        occupiedBeds === 0
          ? "empty"
          : occupiedBeds >= room.capacity
            ? "full"
            : "available"

      return {
        id: room._id,
        label: room.label,
        capacity: room.capacity,
        occupiedBeds,
        availableBeds,
        availability,
        notes: room.notes ?? null,
        hotel: hotel
          ? { id: hotel._id, name: hotel.name, city: hotel.city ?? null }
          : undefined,
        roomType: roomType
          ? {
              id: roomType._id,
              label: roomType.label,
              defaultCapacity: roomType.defaultCapacity,
            }
          : undefined,
        occupants,
      }
    })

    const mappedUnassignedAttendees = unassignedAttendees.map((a) => {
      const canonicalEvent = canonicalEventByProviderId.get(a.providerEventId)
      const ttEvent = ttEventMap.get(a.providerEventId)
      const customAnswers =
        a.customAnswers && typeof a.customAnswers === "object"
          ? (a.customAnswers as { location?: string; remarks?: string })
          : undefined
      const attendeeFamilyGroupId =
        attendeeFamilyGroupByAttendeeId.get(a._id) ?? null
      return {
        attendeeId: a._id,
        attendeeName: a.name ?? null,
        attendeeEmail: a.email ?? null,
        providerOrderId: a.providerOrderId,
        providerEventId: a.providerEventId,
        eventId: canonicalEvent?._id ?? null,
        eventName: canonicalEvent?.title ?? ttEvent?.name ?? null,
        ticketTypeLabel: a.ticketTypeLabel ?? null,
        genderType: a.genderType ?? null,
        allocationPriority: a.allocationPriority ?? null,
        location: getAttendeeLocation(customAnswers),
        remarks: customAnswers?.remarks ?? null,
        hasFamily: hasFamilySignal({
          attendeeId: a._id,
          providerOrderId: a.providerOrderId,
          attendeeFamilyGroupId,
          attendeeCountByOrderId,
        }),
      }
    })

    // --- Canonical submission queue rows ---
    const submissionIds = allOrders.map((s) => s._id)

    const [orderAttendeesList, orderAssignmentsList] = submissionIds.length
      ? await Promise.all([
          Promise.all(
            submissionIds.map((sid) =>
              ctx.db
                .query("orderAttendees")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", sid as Id<"orders">)
                )
                .take(100)
            )
          ).then((results) => results.flat()),
          Promise.all(
            submissionIds.map((sid) =>
              ctx.db
                .query("orderAssignments")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", sid as Id<"orders">)
                )
                .take(100)
            )
          ).then((results) => results.flat()),
        ])
      : [[], []]

    const orderById = new Map(allOrders.map((s) => [s._id as string, s]))

    const slotById = new Map(
      accommodationSlotDocs.map((s) => [s._id as string, s])
    )

    const assignmentByAttendeeId = new Map<
      string,
      (typeof orderAssignmentsList)[number]
    >()
    for (const assignment of orderAssignmentsList) {
      assignmentByAttendeeId.set(assignment.attendeeId as string, assignment)
    }

    const submissionQueueRows = orderAttendeesList.map((attendee) => {
      const order = orderById.get(attendee.orderId as string)
      const assignment = assignmentByAttendeeId.get(attendee._id as string)

      let unresolved = false
      let unresolvedReason: string | null = null

      if (!assignment) {
        unresolved = true
        unresolvedReason = "no_assignment_record"
      } else if (assignment.assignmentIntent === "skip") {
        unresolved = true
        unresolvedReason = "skipped_intent"
      } else if (assignment.assignmentIntent === "assign") {
        const slot = slotById.get(assignment.slotId as string)
        if (!slot || !slot.isAssignable) {
          unresolved = true
          unresolvedReason = "slot_not_assignable"
        }
      }

      const genderType = normalizeGender(attendee.gender)

      return {
        attendeeId: `internal-${order?._id ?? "unknown"}-${attendee.attendeeKey}`,
        attendeeName: attendee.name,
        attendeeEmail: attendee.email ?? null,
        source: "internal" as const,
        submissionId: order?._id ?? null,
        bookingRef: order?.bookingRef ?? null,
        submissionNotes: order?.notes ?? null,
        assignmentIntent: assignment?.assignmentIntent ?? null,
        slotId: assignment?.slotId ?? null,
        roommatePreference: attendee.roommatePreference || null,
        roommateAvoid: attendee.roommateAvoid || null,
        dietaryRestrictions: attendee.dietaryRestrictions || null,
        bookerName: order?.bookerName ?? null,
        genderType,
        location: attendee.location || null,
        unresolved,
        unresolvedReason,
        submittedAt: order?.submittedAt ?? null,
        sortOrder: attendee.sortOrder,
      }
    })

    const assignedSlotHotelIds = new Set<string>()
    for (const row of submissionQueueRows) {
      if (row.slotId) {
        const slot = slotById.get(row.slotId as string)
        if (slot) {
          assignedSlotHotelIds.add(slot.hotelId as string)
        }
      }
    }

    const missingSlotHotelIds = [...assignedSlotHotelIds].filter(
      (id) => !hotelMap.has(id)
    )
    if (missingSlotHotelIds.length > 0) {
      const extraHotels = await Promise.all(
        missingSlotHotelIds.map((id) =>
          ctx.db.get("accommodationHotels", id as Id<"accommodationHotels">)
        )
      )
      for (const hotel of extraHotels) {
        if (hotel) {
          hotelMap.set(hotel._id as string, hotel)
        }
      }
    }

    // Sort: unresolved first, then submittedAt, then attendeeId
    submissionQueueRows.sort((a, b) => {
      if (a.unresolved !== b.unresolved) return a.unresolved ? -1 : 1
      const aTime = a.submittedAt ?? 0
      const bTime = b.submittedAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return a.attendeeId.localeCompare(b.attendeeId)
    })

    const eventHotels = await ctx.db.query("accommodationEventHotels").take(200)
    const eventHotelsByEvent: Record<string, string[]> = {}
    for (const eh of eventHotels) {
      if (!eventHotelsByEvent[eh.eventId]) {
        eventHotelsByEvent[eh.eventId] = []
      }
      eventHotelsByEvent[eh.eventId].push(eh.hotelId)
    }

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        eventId: eventId ?? null,
        search: null,
        hotelId: args.hotelId ?? null,
        roomTypeId: args.roomTypeId ?? null,
        availability: "all" as const,
        genderType: args.genderType ?? null,
        familyGroupId: args.familyGroupId ?? null,
        location: normalizedLocationFilter,
        allocationPriority: args.allocationPriority ?? null,
        hasPriority: args.hasPriority ?? null,
      },
      availableEvents: canonicalEvents
        .filter((e) => e.accommodationEnabled)
        .map((e) => ({
          eventId: e._id,
          slug: e.slug,
          name: e.title,
          startsAt: e.startsAt,
        })),
      hotels: hotels
        .filter(
          (h) => !scopedHotelIds || scopedHotelIds.includes(h._id as string)
        )
        .map((h) => ({
          id: h._id,
          name: h.name,
          assignedEventIds: eventHotelsByEvent[h._id] ?? [],
        })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt._id,
        label: rt.label,
        defaultCapacity: rt.defaultCapacity,
      })),
      rooms: mappedRooms,
      unassignedAttendees: mappedUnassignedAttendees,
      submissionQueueRows,
      summary: {
        totalRooms: mappedRooms.length,
        emptyRooms: mappedRooms.filter((r) => r.availability === "empty")
          .length,
        availableRooms: mappedRooms.filter(
          (r) => r.availability === "available"
        ).length,
        fullRooms: mappedRooms.filter((r) => r.availability === "full").length,
        totalBeds: mappedRooms.reduce((sum, r) => sum + r.capacity, 0),
        occupiedBeds: mappedRooms.reduce((sum, r) => sum + r.occupiedBeds, 0),
        availableBeds: mappedRooms.reduce((sum, r) => sum + r.availableBeds, 0),
        unassignedAttendeesCount: mappedUnassignedAttendees.length,
      },
    }
  },
})

export const getHotels = query({
  args: {},
  handler: async (ctx) => {
    // Bounded: small number of hotels
    return await ctx.db.query("accommodationHotels").take(200)
  },
})

export const getRoomTypesWithCount = query({
  args: {},
  handler: async (ctx) => {
    // Bounded: small config tables
    const roomTypes = await ctx.db.query("accommodationRoomTypes").take(100)
    const rooms = await ctx.db.query("accommodationRooms").take(500)

    const roomsByType = rooms.reduce(
      (acc, room) => {
        if (!acc[room.roomTypeId]) acc[room.roomTypeId] = []
        acc[room.roomTypeId].push(room)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    return roomTypes.map((rt) => ({
      ...rt,
      roomCount: roomsByType[rt._id]?.length ?? 0,
    }))
  },
})

export const getRoomsWithDetails = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: config tables capped for inventory view
    const [rooms, hotels, roomTypes, attendees] = await Promise.all([
      ctx.db.query("accommodationRooms").take(500),
      ctx.db.query("accommodationHotels").take(200),
      ctx.db.query("accommodationRoomTypes").take(100),
      ctx.db.query("ticketTailorAttendees").take(2000),
    ])

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))

    const occupancyByRoom = new Map<string, number>()
    for (const attendee of attendees) {
      if (attendee.assignedRoomId) {
        occupancyByRoom.set(
          attendee.assignedRoomId,
          (occupancyByRoom.get(attendee.assignedRoomId) ?? 0) + 1
        )
      }
    }

    return rooms.map((room) => ({
      id: room._id,
      label: room.label,
      capacity: room.capacity,
      occupiedBeds: occupancyByRoom.get(room._id) ?? 0,
      notes: room.notes,
      hotel: hotelMap.get(room.hotelId as string),
      roomType: roomTypeMap.get(room.roomTypeId as string),
    }))
  },
})

export const listAccommodationInventory = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: config tables capped for inventory view
    const [canonicalEvents, hotels, roomTypes, rooms, attendees] =
      await Promise.all([
        ctx.db.query("events").take(200),
        ctx.db.query("accommodationHotels").take(200),
        ctx.db.query("accommodationRoomTypes").take(100),
        ctx.db.query("accommodationRooms").take(500),
        ctx.db.query("ticketTailorAttendees").take(2000),
      ])

    const eventHotels = await ctx.db.query("accommodationEventHotels").take(200)

    const eventHotelsByHotel = eventHotels.reduce(
      (acc, eh) => {
        if (!acc[eh.hotelId]) acc[eh.hotelId] = []
        acc[eh.hotelId].push(eh.eventId)
        return acc
      },
      {} as Record<string, string[]>
    )

    const roomsByHotel = rooms.reduce(
      (acc, room) => {
        if (!acc[room.hotelId]) acc[room.hotelId] = []
        acc[room.hotelId].push(room)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    const roomsByType = roomTypes.reduce(
      (acc, rt) => {
        acc[rt._id] = rooms.filter((r) => r.roomTypeId === rt._id)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))
    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))

    const occupancyByRoom = new Map<string, number>()
    for (const attendee of attendees) {
      if (attendee.assignedRoomId) {
        occupancyByRoom.set(
          attendee.assignedRoomId,
          (occupancyByRoom.get(attendee.assignedRoomId) ?? 0) + 1
        )
      }
    }

    return {
      availableEvents: canonicalEvents
        .filter((e) => e.accommodationEnabled)
        .map((e) => ({
          eventId: e._id,
          slug: e.slug,
          name: e.title,
          startsAt: e.startsAt,
        })),
      hotels: hotels.map((hotel) => ({
        id: hotel._id,
        name: hotel.name,
        city: hotel.city ?? null,
        notes: hotel.notes ?? null,
        roomCount: roomsByHotel[hotel._id]?.length ?? 0,
        assignedEventIds: eventHotelsByHotel[hotel._id] ?? [],
      })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt._id,
        label: rt.label,
        defaultCapacity: rt.defaultCapacity,
        notes: rt.notes ?? null,
        roomCount: roomsByType[rt._id]?.length ?? 0,
      })),
      rooms: rooms.map((room) => {
        const hotel = hotelMap.get(room.hotelId as string)
        const roomType = roomTypeMap.get(room.roomTypeId as string)
        const occupied = occupancyByRoom.get(room._id) ?? 0
        return {
          id: room._id,
          label: room.label,
          capacity: room.capacity,
          occupiedBeds: occupied,
          notes: room.notes,
          hotel: hotel ? { id: hotel._id, name: hotel.name } : undefined,
          roomType: roomType
            ? {
                id: roomType._id,
                label: roomType.label,
                defaultCapacity: roomType.defaultCapacity,
              }
            : undefined,
        }
      }),
      summary: {
        totalRooms: rooms.length,
        emptyRooms: rooms.filter((r) => (occupancyByRoom.get(r._id) ?? 0) === 0)
          .length,
        availableRooms: rooms.filter(
          (r) => (occupancyByRoom.get(r._id) ?? 0) < r.capacity
        ).length,
        fullRooms: rooms.filter(
          (r) => (occupancyByRoom.get(r._id) ?? 0) >= r.capacity
        ).length,
        unassignedAttendees: 0,
      },
    }
  },
})

export const getHotelById = query({
  args: { hotelId: v.string() },
  handler: async (ctx, args) => {
    return await getAccommodationHotelByStringId(ctx, args.hotelId)
  },
})

export const getRooms = query({
  args: {
    hotelId: v.optional(v.string()),
    roomTypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.hotelId) {
      // Bounded: one hotel has limited rooms
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId!))
        .take(200)
      return rooms
    }
    // Bounded: capped for inventory view
    return await ctx.db.query("accommodationRooms").take(500)
  },
})

export const getRoomById = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    return await getAccommodationRoomByStringId(ctx, args.roomId)
  },
})

export const getRoomTypes = query({
  args: {},
  handler: async (ctx) => {
    // Bounded: small config table
    return await ctx.db.query("accommodationRoomTypes").take(200)
  },
})

export const getRoomTypeById = query({
  args: { roomTypeId: v.string() },
  handler: async (ctx, args) => {
    return await getAccommodationRoomTypeByStringId(ctx, args.roomTypeId)
  },
})

export const createHotel = mutation({
  args: {
    name: v.string(),
    city: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationHotels", args)
    return id
  },
})

export const createRoom = mutation({
  args: {
    hotelId: v.string(),
    roomTypeId: v.string(),
    label: v.string(),
    capacity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationRooms", {
      ...args,
    })
    return id
  },
})

export const createRooms = mutation({
  args: {
    hotelId: v.string(),
    roomTypeId: v.string(),
    quantity: v.number(),
    labels: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    autoGenerateSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const hotel = await getAccommodationHotelByStringId(ctx, args.hotelId)
    const roomType = await getAccommodationRoomTypeByStringId(
      ctx,
      args.roomTypeId
    )

    if (!hotel) throw new Error("Hotel not found")
    if (!roomType) throw new Error("Room type not found")

    const hotelCode =
      hotel.name
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part: string) => part.slice(0, 2).toUpperCase())
        .join("")
        .slice(0, 6) || "HTL"

    const roomTypeCode =
      roomType.label
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part: string) => part.slice(0, 2).toUpperCase())
        .join("")
        .slice(0, 6) || "RM"

    const existingRooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId))
      .take(200)

    const existingCount = existingRooms.length
    const createdIds: string[] = []

    for (let index = 0; index < args.quantity; index += 1) {
      const label =
        args.labels?.[index] ??
        `${hotelCode}-${roomTypeCode}-${String(existingCount + index + 1).padStart(3, "0")}`

      const id = await ctx.db.insert("accommodationRooms", {
        hotelId: args.hotelId,
        roomTypeId: args.roomTypeId,
        label,
        capacity: roomType.defaultCapacity,
        notes: args.notes,
      })
      createdIds.push(id)
    }

    // Auto-generate slots for linked events
    const shouldGenerateSlots = args.autoGenerateSlots !== false
    if (shouldGenerateSlots) {
      // Find all events linked to this hotel
      const linkedEvents = await ctx.db
        .query("accommodationEventHotels")
        .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
        .take(50)

      // Generate slots for each new room in each linked event
      for (const link of linkedEvents) {
        const eventId = link.eventId as Id<"events">

        for (const roomId of createdIds) {
          const room = await ctx.db.get(
            "accommodationRooms",
            roomId as Id<"accommodationRooms">
          )
          if (!room) continue

          const existingSlots = await ctx.db
            .query("accommodationSlots")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .filter((q) =>
              q.eq(q.field("roomId"), roomId as Id<"accommodationRooms">)
            )
            .take(100)

          const startIndex = existingSlots.length
          const capacity = room.capacity

          for (let i = 0; i < capacity; i++) {
            const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

            await ctx.db.insert("accommodationSlots", {
              eventId,
              hotelId: args.hotelId as Id<"accommodationHotels">,
              roomId: roomId as Id<"accommodationRooms">,
              slotLabel,
              genderPolicy: "mixed",
              isAssignable: true,
              updatedAt: Date.now(),
            })
          }
        }
      }
    }

    return createdIds
  },
})

export const createRoomType = mutation({
  args: {
    label: v.string(),
    defaultCapacity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationRoomTypes", args)
    return id
  },
})

export const assignRoomToAttendee = mutation({
  args: {
    attendeeId: v.string(),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee) throw new Error("Attendee not found")

    const eventHotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", room.hotelId as string))
      .take(20)

    if (eventHotelLinks.length > 0) {
      // Look up the canonical event for this attendee via their order
      const order = await ctx.db.get("orders", attendee.orderId)
      const eventId = order?.eventId

      if (eventId) {
        const eventHasHotel = eventHotelLinks.some(
          (eh) => eh.eventId === eventId
        )
        if (!eventHasHotel) {
          throw new Error("Room hotel is not enabled for this event")
        }
      }
    }

    const occupiedCount = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (occupiedCount.length >= room.capacity) {
      throw new Error("Room is already full")
    }

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: args.roomId,
    })

    return args.attendeeId
  },
})

export const assignAttendeeToRoom = mutation({
  args: {
    attendeeId: v.string(),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee) throw new Error("Attendee not found")

    if (attendee.assignedRoomId === args.roomId) {
      throw new Error("Attendee already assigned to this room")
    }

    const eventHotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", room.hotelId as string))
      .take(20)

    if (eventHotelLinks.length > 0) {
      // Look up the canonical event for this attendee via their order
      const order = await ctx.db.get("orders", attendee.orderId)
      const eventId = order?.eventId

      if (eventId) {
        const eventHasHotel = eventHotelLinks.some(
          (eh) => eh.eventId === eventId
        )
        if (!eventHasHotel) {
          throw new Error("Room hotel is not enabled for this event")
        }
      }
    }

    const occupiedCount = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (occupiedCount.length >= room.capacity) {
      throw new Error("Room is already full")
    }

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: args.roomId,
    })

    return { ok: true }
  },
})

export const unassignRoomFromAttendee = mutation({
  args: {
    attendeeId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found or not assigned to any room"
    )
    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee || !attendee.assignedRoomId) return { ok: true }

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: undefined,
    })

    return { ok: true }
  },
})

export const unassignAttendeeFromRoom = mutation({
  args: {
    attendeeId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found or not assigned to any room"
    )
    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee || !attendee.assignedRoomId) {
      throw new Error("Attendee not found or not assigned to any room")
    }

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: undefined,
    })

    return { ok: true }
  },
})

export const getEventHotels = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    // Bounded: one event links to limited hotels
    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) => q.eq("eventId", args.eventId))
      .take(50)

    const hotels = await Promise.all(
      eventHotels.map((eh) => getAccommodationHotelByStringId(ctx, eh.hotelId))
    )

    return hotels.filter(Boolean)
  },
})

/**
 * Link a hotel to an event with optional automatic slot generation.
 * Supports both canonical eventId and eventProviderEventId for flexibility.
 */
export const linkHotelToEvent = mutation({
  args: {
    eventId: v.optional(v.string()),
    eventProviderEventId: v.optional(v.string()),
    hotelId: v.id("accommodationHotels"),
    autoGenerateSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Resolve eventId from either direct ID or provider event ID
    let canonicalEventId: string

    if (args.eventId) {
      canonicalEventId = args.eventId
    } else if (args.eventProviderEventId) {
      // Look up canonical event via eventSources
      const eventSource = await ctx.db
        .query("eventSources")
        .withIndex("by_provider_and_externalEventId", (q) =>
          q
            .eq("provider", "tickettailor")
            .eq("externalEventId", args.eventProviderEventId as string)
        )
        .first()

      if (eventSource) {
        canonicalEventId = eventSource.eventId as string
      } else {
        // Fallback: try to find by direct ID match (slug)
        const event = await ctx.db
          .query("events")
          .withIndex("by_slug", (q) =>
            q.eq("slug", args.eventProviderEventId as string)
          )
          .first()

        if (!event) {
          throw new Error("Event not found")
        }
        canonicalEventId = event._id as string
      }
    } else {
      throw new Error("Either eventId or eventProviderEventId must be provided")
    }

    // Verify event exists
    const event = await ctx.db.get("events", canonicalEventId as Id<"events">)
    if (!event) {
      throw new Error("Event not found")
    }

    // Verify hotel exists
    const hotel = await ctx.db.get("accommodationHotels", args.hotelId)
    if (!hotel) {
      throw new Error("Hotel not found")
    }

    // Check for existing link
    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId as string)
      )
      .first()

    if (existing) {
      return {
        linkId: existing._id,
        eventId: canonicalEventId,
        hotelId: args.hotelId,
        slotsGenerated: 0,
        alreadyLinked: true,
      }
    }

    // Create the link
    const linkId = await ctx.db.insert("accommodationEventHotels", {
      eventId: canonicalEventId,
      hotelId: args.hotelId as string,
    })

    // Auto-generate slots if requested (default: true)
    let slotsGenerated = 0
    const shouldGenerateSlots = args.autoGenerateSlots !== false

    if (shouldGenerateSlots) {
      // Get all rooms for this hotel
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) =>
          q.eq("hotelId", args.hotelId as string)
        )
        .take(100)

      // Generate slots for each room
      for (const room of rooms) {
        const existingSlots = await ctx.db
          .query("accommodationSlots")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", canonicalEventId as Id<"events">)
          )
          .filter((q) => q.eq(q.field("roomId"), room._id))
          .take(100)

        const startIndex = existingSlots.length
        const capacity = room.capacity

        for (let i = 0; i < capacity; i++) {
          const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

          await ctx.db.insert("accommodationSlots", {
            eventId: canonicalEventId as Id<"events">,
            hotelId: args.hotelId,
            roomId: room._id,
            slotLabel,
            genderPolicy: "mixed", // Default to mixed, can be changed later
            isAssignable: true,
            updatedAt: Date.now(),
          })
          slotsGenerated++
        }
      }
    }

    return {
      linkId,
      eventId: canonicalEventId,
      hotelId: args.hotelId,
      slotsGenerated,
      alreadyLinked: false,
    }
  },
})

export const unlinkHotelFromEvent = mutation({
  args: {
    eventId: v.string(),
    hotelId: v.id("accommodationHotels"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", args.eventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})

export const updateHotel = mutation({
  args: {
    hotelId: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { hotelId, ...data } = args
    const normalizedHotelId = normalizeDocId(
      ctx,
      "accommodationHotels",
      hotelId,
      "Hotel not found"
    )
    await ctx.db.patch("accommodationHotels", normalizedHotelId, data)
    return await ctx.db.get("accommodationHotels", normalizedHotelId)
  },
})

export const deleteHotel = mutation({
  args: { hotelId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const hotelId = normalizeDocId(
      ctx,
      "accommodationHotels",
      args.hotelId,
      "Hotel not found"
    )

    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId))
      .take(200)

    for (const room of rooms) {
      const assignedAttendee = await ctx.db
        .query("orderAttendees")
        .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", room._id))
        .first()

      if (assignedAttendee) {
        throw new Error("Cannot delete hotel with assigned attendees")
      }
    }

    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
      .take(50)

    for (const room of rooms) {
      await ctx.db.delete("accommodationRooms", room._id)
    }

    for (const eventHotel of eventHotels) {
      await ctx.db.delete("accommodationEventHotels", eventHotel._id)
    }

    await ctx.db.delete("accommodationHotels", hotelId)
    return { ok: true }
  },
})

export const updateRoomLabel = mutation({
  args: {
    roomId: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    await ctx.db.patch("accommodationRooms", roomId, {
      label: args.label,
    })
    return await ctx.db.get("accommodationRooms", roomId)
  },
})

export const deleteRoom = mutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (attendees.length > 0) {
      throw new Error("Cannot delete room with assigned attendees")
    }

    await ctx.db.delete("accommodationRooms", roomId)
    return { ok: true }
  },
})

export const updateRoomType = mutation({
  args: {
    roomTypeId: v.string(),
    label: v.optional(v.string()),
    defaultCapacity: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { roomTypeId, ...data } = args
    const normalizedRoomTypeId = normalizeDocId(
      ctx,
      "accommodationRoomTypes",
      roomTypeId,
      "Room type not found"
    )
    await ctx.db.patch("accommodationRoomTypes", normalizedRoomTypeId, data)
    return await ctx.db.get("accommodationRoomTypes", normalizedRoomTypeId)
  },
})

export const deleteRoomType = mutation({
  args: { roomTypeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one room type has limited rooms
    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("roomTypeId", (q) => q.eq("roomTypeId", args.roomTypeId))
      .take(200)

    if (rooms.length > 0) {
      throw new Error("Cannot delete room type with existing rooms")
    }

    const roomTypeId = normalizeDocId(
      ctx,
      "accommodationRoomTypes",
      args.roomTypeId,
      "Room type not found"
    )
    await ctx.db.delete("accommodationRoomTypes", roomTypeId)
    return { ok: true }
  },
})

export const getEventByProviderId = query({
  args: { providerEventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .first()
    return event
  },
})

/**
 * @deprecated Use linkHotelToEvent instead. This mutation will be removed in a future release.
 * The linkHotelToEvent mutation now supports eventProviderEventId and includes auto-slot generation.
 */
export const attachHotelToEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    console.warn(
      "[DEPRECATED] attachHotelToEventByProviderId is deprecated. Use linkHotelToEvent with autoGenerateSlots option."
    )
    await requireIdentity(ctx)

    // Look up canonical event via eventSources
    const eventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "tickettailor")
          .eq("externalEventId", args.eventProviderEventId)
      )
      .first()

    let canonicalEventId: string

    if (eventSource) {
      canonicalEventId = eventSource.eventId as string
    } else {
      // Fallback: try to find by direct ID match
      const event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.eventProviderEventId))
        .first()

      if (!event) {
        throw new Error("Event not found")
      }
      canonicalEventId = event._id as string
    }

    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert("accommodationEventHotels", {
      eventId: canonicalEventId,
      hotelId: args.hotelId,
    })
  },
})

export const detachHotelFromEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Look up canonical event via eventSources
    const eventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "tickettailor")
          .eq("externalEventId", args.eventProviderEventId)
      )
      .first()

    let canonicalEventId: string

    if (eventSource) {
      canonicalEventId = eventSource.eventId as string
    } else {
      // Fallback: try to find by direct ID match
      const event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.eventProviderEventId))
        .first()

      if (!event) {
        // No event found, nothing to detach
        return { ok: true }
      }
      canonicalEventId = event._id as string
    }

    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})

export const generateSlotsForRoom = mutation({
  args: {
    eventId: v.id("events"),
    roomId: v.id("accommodationRooms"),
    genderPolicy: v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("mixed")
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const room = await ctx.db.get("accommodationRooms", args.roomId)
    if (!room) {
      throw new Error("Room not found")
    }

    const hotel = await ctx.db.get(
      "accommodationHotels",
      room.hotelId as Id<"accommodationHotels">
    )
    if (!hotel) {
      throw new Error("Hotel not found")
    }

    const existingSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("roomId"), args.roomId))
      .take(100)

    const startIndex = existingSlots.length
    const capacity = room.capacity
    const createdIds: Id<"accommodationSlots">[] = []

    for (let i = 0; i < capacity; i++) {
      const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

      const id = await ctx.db.insert("accommodationSlots", {
        eventId: args.eventId,
        hotelId: room.hotelId as Id<"accommodationHotels">,
        roomId: args.roomId,
        slotLabel,
        genderPolicy: args.genderPolicy,
        isAssignable: true,
        updatedAt: Date.now(),
      })
      createdIds.push(id)
    }

    return {
      createdCount: createdIds.length,
      slotIds: createdIds,
      roomLabel: room.label,
      capacity,
    }
  },
})

export const getSlotsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const slots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const roomIds = [...new Set(slots.map((s) => s.roomId))]
    const hotelIds = [...new Set(slots.map((s) => s.hotelId))]

    const rooms = await Promise.all(
      roomIds.map((id) => ctx.db.get("accommodationRooms", id))
    )
    const hotels = await Promise.all(
      hotelIds.map((id) => ctx.db.get("accommodationHotels", id))
    )

    const roomById = new Map(rooms.filter(Boolean).map((r) => [r!._id, r!]))
    const hotelById = new Map(hotels.filter(Boolean).map((h) => [h!._id, h!]))

    return slots.map((slot) => ({
      id: slot._id,
      slotLabel: slot.slotLabel,
      genderPolicy: slot.genderPolicy,
      isAssignable: slot.isAssignable,
      ineligibilityReason: slot.ineligibilityReason,
      room: roomById.get(slot.roomId)
        ? {
            id: roomById.get(slot.roomId)!._id,
            label: roomById.get(slot.roomId)!.label,
            capacity: roomById.get(slot.roomId)!.capacity,
          }
        : null,
      hotel: hotelById.get(slot.hotelId)
        ? {
            id: hotelById.get(slot.hotelId)!._id,
            name: hotelById.get(slot.hotelId)!.name,
          }
        : null,
    }))
  },
})

export const getAccommodationSummaryForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", args.eventId as unknown as string)
      )
      .take(50)

    const slots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const assignableSlots = slots.filter((s) => s.isAssignable)

    return {
      eventSlug: event.slug,
      eventTitle: event.title,
      hotelsLinked: eventHotels.length,
      totalSlots: slots.length,
      assignableSlots: assignableSlots.length,
      submissionsCount: orders.length,
    }
  },
})
