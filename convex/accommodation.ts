import { internalMutation, query, mutation } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { requireIdentity } from "./auth"

type DocTables = {
  accommodationHotels: Doc<"accommodationHotels">
  accommodationRoomTypes: Doc<"accommodationRoomTypes">
  accommodationRooms: Doc<"accommodationRooms">
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
  const normalizedAttendeeId = ctx.db.normalizeId(
    "ticketTailorAttendees",
    attendeeId
  )
  return normalizedAttendeeId
    ? await ctx.db.get("ticketTailorAttendees", normalizedAttendeeId)
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

    const occupants = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("assignedRoomId", (q) => q.eq("assignedRoomId", args.roomId))
      .collect()

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
    const eventId = args.eventId
    const scopedHotelIds = eventId
      ? (
          await ctx.db
            .query("accommodationEventHotels")
            .withIndex("eventId_hotelId", (q) => q.eq("eventId", eventId))
            .collect()
        ).map((eh) => eh.hotelId)
      : null

    const [events, hotels, roomTypes, rooms, allAttendees, familyMembers] =
      await Promise.all([
        ctx.db.query("ticketTailorEvents").collect(),
        ctx.db.query("accommodationHotels").collect(),
        ctx.db.query("accommodationRoomTypes").collect(),
        ctx.db.query("accommodationRooms").collect(),
        ctx.db.query("ticketTailorAttendees").collect(),
        ctx.db.query("attendeeFamilyMembers").collect(),
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
      if (eventId && a.providerEventId !== eventId) return false
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
    const eventMap = new Map(events.map((e) => [e.providerEventId, e]))

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
        const event = eventMap.get(a.providerEventId)
        return {
          attendeeId: a._id,
          attendeeName: a.name ?? null,
          attendeeEmail: a.email ?? null,
          providerOrderId: a.providerOrderId,
          providerEventId: a.providerEventId,
          eventName: event?.name ?? null,
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
      const event = eventMap.get(a.providerEventId)
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
        eventName: event?.name ?? null,
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

    const eventHotels = await ctx.db.query("accommodationEventHotels").collect()
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
      availableEvents: events.map((e) => ({
        providerEventId: e.providerEventId,
        name: e.name ?? null,
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
    return await ctx.db.query("accommodationHotels").collect()
  },
})

export const getRoomTypesWithCount = query({
  args: {},
  handler: async (ctx) => {
    const roomTypes = await ctx.db.query("accommodationRoomTypes").collect()
    const rooms = await ctx.db.query("accommodationRooms").collect()

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
    const rooms = await ctx.db.query("accommodationRooms").collect()
    const hotels = await ctx.db.query("accommodationHotels").collect()
    const roomTypes = await ctx.db.query("accommodationRoomTypes").collect()

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))

    return rooms.map((room) => ({
      id: room._id,
      label: room.label,
      capacity: room.capacity,
      occupiedBeds: room.occupiedBeds ?? 0,
      notes: room.notes,
      hotel: hotelMap.get(room.hotelId as string),
      roomType: roomTypeMap.get(room.roomTypeId as string),
    }))
  },
})

export const listAccommodationInventory = query({
  args: {},
  handler: async (ctx) => {
    const [availableEvents, hotels, roomTypes, rooms] = await Promise.all([
      ctx.db.query("ticketTailorEvents").collect(),
      ctx.db.query("accommodationHotels").collect(),
      ctx.db.query("accommodationRoomTypes").collect(),
      ctx.db.query("accommodationRooms").collect(),
    ])

    const eventHotels = await ctx.db.query("accommodationEventHotels").collect()

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

    return {
      availableEvents: availableEvents.map((e) => ({
        providerEventId: e.providerEventId,
        name: e.name,
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
        const occupied = room.occupiedBeds ?? 0
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
        emptyRooms: rooms.filter((r) => (r.occupiedBeds ?? 0) === 0).length,
        availableRooms: rooms.filter((r) => (r.occupiedBeds ?? 0) < r.capacity)
          .length,
        fullRooms: rooms.filter((r) => (r.occupiedBeds ?? 0) >= r.capacity)
          .length,
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
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId!))
        .collect()
      return rooms
    }
    return await ctx.db.query("accommodationRooms").collect()
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
    return await ctx.db.query("accommodationRoomTypes").collect()
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
      occupiedBeds: 0,
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
      .collect()

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
        occupiedBeds: 0,
      })
      createdIds.push(id)
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
      "ticketTailorAttendees",
      args.attendeeId,
      "Attendee not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendee = await ctx.db.get("ticketTailorAttendees", attendeeId)
    if (!attendee) throw new Error("Attendee not found")

    const eventHotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", room.hotelId as string))
      .collect()

    if (eventHotelLinks.length > 0) {
      const eventHasHotel = eventHotelLinks.some(
        (eh) => eh.eventId === attendee.providerEventId
      )
      if (!eventHasHotel) {
        throw new Error("Room hotel is not enabled for this event")
      }
    }

    const occupiedCount = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("assignedRoomId", (q) => q.eq("assignedRoomId", args.roomId))
      .collect()

    if (occupiedCount.length >= room.capacity) {
      throw new Error("Room is already full")
    }

    await ctx.db.patch("ticketTailorAttendees", attendeeId, {
      assignedRoomId: args.roomId,
    })

    await ctx.db.patch("accommodationRooms", roomId, {
      occupiedBeds: (room.occupiedBeds ?? 0) + 1,
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
      "ticketTailorAttendees",
      args.attendeeId,
      "Attendee not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendee = await ctx.db.get("ticketTailorAttendees", attendeeId)
    if (!attendee) throw new Error("Attendee not found")

    if (attendee.assignedRoomId === args.roomId) {
      throw new Error("Attendee already assigned to this room")
    }

    const eventHotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", room.hotelId as string))
      .collect()

    if (eventHotelLinks.length > 0) {
      const eventHasHotel = eventHotelLinks.some(
        (eh) => eh.eventId === attendee.providerEventId
      )
      if (!eventHasHotel) {
        throw new Error("Room hotel is not enabled for this event")
      }
    }

    const occupiedCount = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("assignedRoomId", (q) => q.eq("assignedRoomId", args.roomId))
      .collect()

    if (occupiedCount.length >= room.capacity) {
      throw new Error("Room is already full")
    }

    await ctx.db.patch("ticketTailorAttendees", attendeeId, {
      assignedRoomId: args.roomId,
    })

    await ctx.db.patch("accommodationRooms", roomId, {
      occupiedBeds: (room.occupiedBeds ?? 0) + 1,
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
      "ticketTailorAttendees",
      args.attendeeId,
      "Attendee not found or not assigned to any room"
    )
    const attendee = await ctx.db.get("ticketTailorAttendees", attendeeId)
    if (!attendee || !attendee.assignedRoomId) return { ok: true }

    const room = await getAccommodationRoomByStringId(
      ctx,
      attendee.assignedRoomId
    )
    if (room) {
      await ctx.db.patch("accommodationRooms", room._id, {
        occupiedBeds: Math.max(0, (room.occupiedBeds ?? 1) - 1),
      })
    }

    await ctx.db.patch("ticketTailorAttendees", attendeeId, {
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
      "ticketTailorAttendees",
      args.attendeeId,
      "Attendee not found or not assigned to any room"
    )
    const attendee = await ctx.db.get("ticketTailorAttendees", attendeeId)
    if (!attendee || !attendee.assignedRoomId) {
      throw new Error("Attendee not found or not assigned to any room")
    }

    const room = await getAccommodationRoomByStringId(
      ctx,
      attendee.assignedRoomId
    )
    if (room) {
      await ctx.db.patch("accommodationRooms", room._id, {
        occupiedBeds: Math.max(0, (room.occupiedBeds ?? 1) - 1),
      })
    }

    await ctx.db.patch("ticketTailorAttendees", attendeeId, {
      assignedRoomId: undefined,
    })

    return { ok: true }
  },
})

export const getEventHotels = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const hotels = await Promise.all(
      eventHotels.map((eh) => getAccommodationHotelByStringId(ctx, eh.hotelId))
    )

    return hotels.filter(Boolean)
  },
})

export const linkHotelToEvent = mutation({
  args: {
    eventId: v.string(),
    hotelId: v.id("accommodationHotels"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", args.eventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (existing) {
      return existing._id
    }

    const id = await ctx.db.insert("accommodationEventHotels", {
      eventId: args.eventId,
      hotelId: args.hotelId,
    })
    return id
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
      .collect()

    for (const room of rooms) {
      const assignedAttendee = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("assignedRoomId", (q) => q.eq("assignedRoomId", room._id))
        .first()

      if (assignedAttendee) {
        throw new Error("Cannot delete hotel with assigned attendees")
      }
    }

    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
      .collect()

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
      .query("ticketTailorAttendees")
      .withIndex("assignedRoomId", (q) => q.eq("assignedRoomId", args.roomId))
      .collect()

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
    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("roomTypeId", (q) => q.eq("roomTypeId", args.roomTypeId))
      .collect()

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

export const attachHotelToEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.eventProviderEventId)
      )
      .first()

    if (!event) {
      throw new Error("Event not found")
    }

    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", event.providerEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert("accommodationEventHotels", {
      eventId: event.providerEventId,
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
    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", args.eventProviderEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})
