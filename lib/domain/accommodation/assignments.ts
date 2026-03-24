import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

type RoomAvailability = "all" | "empty" | "available" | "full"

type RoomAllocationBoardRoom = RoomAllocationBoard["rooms"][number]
type RoomAllocationBoardAttendee =
  RoomAllocationBoard["unassignedAttendees"][number]
type RoomAllocationBoardSummary = RoomAllocationBoard["summary"]

export type RoomAllocationBoardFilters = {
  eventId?: string | null
  search?: string | null
  hotelId?: string | null
  roomTypeId?: string | null
  availability?: RoomAvailability
  // Signal-aware filters
  genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  familyGroupId?: string | null
  location?: string | null
  allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
  hasPriority?: boolean | null
}

export type RoomAllocationBoard = {
  generatedAt: string
  filters: {
    eventId: string | null
    search: string | null
    hotelId: string | null
    roomTypeId: string | null
    availability: RoomAvailability
    // Signal-aware filters
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    familyGroupId: string | null
    location: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    hasPriority: boolean | null
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  hotels: Array<{
    id: string
    name: string
    assignedEventIds: string[]
  }>
  roomTypes: Array<{
    id: string
    label: string
    defaultCapacity: number
  }>
  rooms: Array<{
    id: string
    label: string
    capacity: number
    occupiedBeds: number
    availableBeds: number
    availability: "empty" | "available" | "full"
    notes: string | null
    hotel: {
      id: string
      name: string
      city: string | null
    }
    roomType: {
      id: string
      label: string
      defaultCapacity: number
    }
    occupants: Array<{
      attendeeId: string
      attendeeName: string | null
      attendeeEmail: string | null
      providerOrderId: string
      providerEventId: string
      eventName: string | null
      ticketTypeLabel: string | null
    }>
  }>
  unassignedAttendees: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    ticketTypeLabel: string | null
    matchingRoomCount: number
    // Signal fields for UI display
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    remarks: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    familyGroupId: string | null
  }>
  summary: {
    totalRooms: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
    unassignedAttendees: number
  }
}

function normalizeRequiredString(value: string, fieldName: string) {
  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  return normalized
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeAvailability(value: string | null | undefined) {
  if (!value) {
    return "all" as const
  }

  if (
    value === "all" ||
    value === "empty" ||
    value === "available" ||
    value === "full"
  ) {
    return value
  }

  throw new Error(
    "Invalid 'availability'. Expected one of: all, empty, available, full."
  )
}

function normalizeGenderType(value: string | null | undefined) {
  if (!value) {
    return null
  }

  if (
    value === "MALE" ||
    value === "FEMALE" ||
    value === "MIXED" ||
    value === "UNKNOWN"
  ) {
    return value
  }

  return null
}

function normalizeAllocationPriority(value: string | null | undefined) {
  if (!value) {
    return null
  }

  if (
    value === "CRITICAL" ||
    value === "HIGH" ||
    value === "NORMAL" ||
    value === "LOW"
  ) {
    return value
  }

  return null
}

function normalizeBoolean(value: string | boolean | null | undefined) {
  if (value === true) {
    return true
  }

  if (value === false) {
    return false
  }

  if (!value || value === "null" || value === "undefined") {
    return null
  }

  if (value === "true") {
    return true
  }

  if (value === "false") {
    return false
  }

  return null
}

function deriveAvailability(occupiedBeds: number, capacity: number) {
  if (occupiedBeds <= 0) {
    return "empty" as const
  }

  if (occupiedBeds >= capacity) {
    return "full" as const
  }

  return "available" as const
}

function matchesSearch(
  value: string | null | undefined,
  search: string | null
) {
  if (!search) {
    return true
  }

  return (value ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase())
}

function attendeeMatchesSearch(
  attendee: {
    attendeeName: string | null
    attendeeEmail: string | null
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    ticketTypeLabel: string | null
  },
  search: string | null
) {
  if (!search) {
    return true
  }

  return [
    attendee.attendeeName,
    attendee.attendeeEmail,
    attendee.providerOrderId,
    attendee.providerEventId,
    attendee.eventName,
    attendee.ticketTypeLabel,
  ].some((value) => matchesSearch(value, search))
}

export async function getRoomAllocationBoard(
  filters: RoomAllocationBoardFilters = {}
): Promise<RoomAllocationBoard> {
  const eventId = normalizeOptionalString(filters.eventId)
  const search = normalizeOptionalString(filters.search)
  const hotelId = normalizeOptionalString(filters.hotelId)
  const roomTypeId = normalizeOptionalString(filters.roomTypeId)
  const availability = normalizeAvailability(filters.availability)

  // Signal-aware filter parsing
  const genderType = normalizeGenderType(filters.genderType ?? undefined)
  const familyGroupId = normalizeOptionalString(filters.familyGroupId)
  const location = normalizeOptionalString(filters.location)
  const allocationPriority = normalizeAllocationPriority(
    filters.allocationPriority ?? undefined
  )
  const hasPriority = normalizeBoolean(filters.hasPriority ?? undefined)

  const availableEvents = await prisma.ticketTailorEvent.findMany({
    orderBy: [{ startsAt: "asc" }, { name: "asc" }],
    select: {
      providerEventId: true,
      name: true,
      accommodationHotels: {
        select: {
          hotelId: true,
        },
      },
    },
  })

  const selectedEventHotelIds =
    availableEvents
      .find((event) => event.providerEventId === eventId)
      ?.accommodationHotels.map((link) => link.hotelId) ?? []

  const scopedHotelIds =
    eventId && selectedEventHotelIds.length > 0 ? selectedEventHotelIds : null

  const [hotels, roomTypes, rooms, unassignedAttendees] = await Promise.all([
    prisma.accommodationHotel.findMany({
      where: scopedHotelIds ? { id: { in: scopedHotelIds } } : undefined,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        eventLinks: {
          select: {
            event: {
              select: {
                providerEventId: true,
              },
            },
          },
        },
      },
    }),
    prisma.accommodationRoomType.findMany({
      orderBy: [{ label: "asc" }],
      select: {
        id: true,
        label: true,
        defaultCapacity: true,
      },
    }),
    prisma.accommodationRoom.findMany({
      where: {
        ...(scopedHotelIds ? { hotelId: { in: scopedHotelIds } } : {}),
        ...(hotelId ? { hotelId } : {}),
        ...(roomTypeId ? { roomTypeId } : {}),
      },
      orderBy: [{ hotel: { name: "asc" } }, { label: "asc" }],
      include: {
        hotel: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
        roomType: {
          select: {
            id: true,
            label: true,
            defaultCapacity: true,
          },
        },
        attendees: {
          where: {
            ...(eventId ? { providerEventId: eventId } : {}),
          },
          orderBy: [{ name: "asc" }, { email: "asc" }, { createdAt: "asc" }],
          include: {
            event: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.ticketTailorAttendee.findMany({
      where: {
        assignedRoomId: null,
        ...(eventId ? { providerEventId: eventId } : {}),
        // Signal-aware filters
        ...(genderType ? { genderType } : {}),
        ...(allocationPriority
          ? { allocationPriority }
          : hasPriority
            ? {
                allocationPriority: { in: ["CRITICAL", "HIGH"] },
              }
            : {}),
      },
      orderBy: [
        // Prioritize high-priority attendees first
        { allocationPriority: "asc" },
        { name: "asc" },
        { email: "asc" },
        { createdAt: "asc" },
      ],
      include: {
        event: {
          select: {
            name: true,
          },
        },
        familyGroupMember: {
          select: {
            familyGroupId: true,
          },
        },
      },
    }),
  ])

  const mappedRooms: RoomAllocationBoard["rooms"] = rooms
    .map((room): RoomAllocationBoardRoom & { matchesSearch: boolean } => {
      const occupants = room.attendees.map((attendee) => ({
        attendeeId: attendee.id,
        attendeeName: attendee.name ?? null,
        attendeeEmail: attendee.email ?? null,
        providerOrderId: attendee.providerOrderId,
        providerEventId: attendee.providerEventId,
        eventName: attendee.event?.name ?? null,
        ticketTypeLabel: attendee.ticketTypeLabel ?? null,
      }))
      const searchedOccupants = search
        ? occupants.filter((occupant) =>
            attendeeMatchesSearch(occupant, search)
          )
        : occupants
      const occupiedBeds = occupants.length
      const availableBeds = Math.max(0, room.capacity - occupiedBeds)
      const roomAvailability = deriveAvailability(occupiedBeds, room.capacity)

      return {
        id: room.id,
        label: room.label,
        capacity: room.capacity,
        occupiedBeds,
        availableBeds,
        availability: roomAvailability,
        notes: room.notes ?? null,
        hotel: room.hotel,
        roomType: room.roomType,
        occupants: searchedOccupants,
        matchesSearch:
          !search ||
          matchesSearch(room.label, search) ||
          matchesSearch(room.hotel.name, search) ||
          matchesSearch(room.hotel.city, search) ||
          matchesSearch(room.roomType.label, search) ||
          searchedOccupants.length > 0,
      }
    })
    .filter((room) => room.matchesSearch)
    .filter(
      (room) => availability === "all" || room.availability === availability
    )
    .map((room) => ({
      id: room.id,
      label: room.label,
      capacity: room.capacity,
      occupiedBeds: room.occupiedBeds,
      availableBeds: room.availableBeds,
      availability: room.availability,
      notes: room.notes,
      hotel: room.hotel,
      roomType: room.roomType,
      occupants: room.occupants,
    }))

  const candidateRooms = mappedRooms.filter((room) => room.availableBeds > 0)

  const filteredUnassignedAttendees: RoomAllocationBoard["unassignedAttendees"] =
    unassignedAttendees
      .map((attendee): RoomAllocationBoardAttendee | null => {
        // Extract location from customAnswers JSON
        const customAnswers = attendee.customAnswers as
          | { location?: string; remarks?: string }
          | null
          | undefined
        const attendeeLocation = customAnswers?.location ?? null
        const attendeeRemarks = customAnswers?.remarks ?? null

        // Filter by location if specified
        const locationMatch =
          !location ||
          (attendeeLocation &&
            attendeeLocation.toLowerCase().includes(location.toLowerCase()))

        if (!locationMatch) {
          return null
        }

        // Get family group info if available
        const familyGroupId = attendee.familyGroupMember?.familyGroupId ?? null

        const result: RoomAllocationBoardAttendee = {
          attendeeId: attendee.id,
          attendeeName: attendee.name ?? null,
          attendeeEmail: attendee.email ?? null,
          providerOrderId: attendee.providerOrderId,
          providerEventId: attendee.providerEventId,
          eventName: attendee.event?.name ?? null,
          ticketTypeLabel: attendee.ticketTypeLabel ?? null,
          matchingRoomCount: candidateRooms.length,
          // Signal fields for UI display
          genderType: attendee.genderType ?? null,
          location: attendeeLocation,
          remarks: attendeeRemarks,
          allocationPriority: attendee.allocationPriority ?? null,
          familyGroupId,
        }

        return result
      })
      .filter(
        (attendee): attendee is RoomAllocationBoardAttendee => attendee !== null
      )
      .filter((attendee) => attendeeMatchesSearch(attendee, search))
      .filter((attendee) =>
        availability === "full"
          ? false
          : attendee.matchingRoomCount > 0 || availability === "all"
      )
      .filter((attendee) => attendeeMatchesSearch(attendee, search))
      .filter((attendee) =>
        availability === "full"
          ? false
          : attendee.matchingRoomCount > 0 || availability === "all"
      )

  const summary = mappedRooms.reduce<RoomAllocationBoardSummary>(
    (counts, room) => {
      counts.totalRooms += 1
      if (room.availability === "empty") {
        counts.emptyRooms += 1
      }
      if (room.availability === "available") {
        counts.availableRooms += 1
      }
      if (room.availability === "full") {
        counts.fullRooms += 1
      }
      return counts
    },
    {
      totalRooms: 0,
      emptyRooms: 0,
      availableRooms: 0,
      fullRooms: 0,
      unassignedAttendees: filteredUnassignedAttendees.length,
    }
  )

  summary.unassignedAttendees = filteredUnassignedAttendees.length

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      eventId,
      search,
      hotelId,
      roomTypeId,
      availability,
      genderType,
      familyGroupId,
      location,
      allocationPriority,
      hasPriority,
    },
    availableEvents,
    hotels: hotels.map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      assignedEventIds: hotel.eventLinks.map(
        (link) => link.event.providerEventId
      ),
    })),
    roomTypes,
    rooms: mappedRooms,
    unassignedAttendees: filteredUnassignedAttendees,
    summary,
  }
}

async function syncRoomOccupancy(tx: Prisma.TransactionClient, roomId: string) {
  const occupiedBeds = await tx.ticketTailorAttendee.count({
    where: {
      assignedRoomId: roomId,
    },
  })

  await tx.accommodationRoom.update({
    where: {
      id: roomId,
    },
    data: {
      occupiedBeds,
    },
  })
}

export async function assignAttendeeToRoom(input: {
  attendeeId: string
  roomId: string
}) {
  const attendeeId = normalizeRequiredString(input.attendeeId, "attendeeId")
  const roomId = normalizeRequiredString(input.roomId, "roomId")

  return prisma.$transaction(async (tx) => {
    const attendee = await tx.ticketTailorAttendee.findUnique({
      where: {
        id: attendeeId,
      },
      select: {
        id: true,
        assignedRoomId: true,
        providerEventId: true,
        eventId: true,
      },
    })

    if (!attendee) {
      throw new Error("Invalid 'attendeeId'. Attendee not found.")
    }

    const room = await tx.accommodationRoom.findUnique({
      where: {
        id: roomId,
      },
      select: {
        id: true,
        capacity: true,
        hotelId: true,
      },
    })

    if (!room) {
      throw new Error("Invalid 'roomId'. Room not found.")
    }

    if (attendee.assignedRoomId === room.id) {
      throw new Error(
        "Invalid assignment. Attendee is already assigned to this room."
      )
    }

    const eventHotelLinks = await tx.accommodationEventHotel.findMany({
      where: {
        eventId: attendee.eventId,
      },
      select: {
        hotelId: true,
      },
    })

    if (
      eventHotelLinks.length > 0 &&
      !eventHotelLinks.some((link) => link.hotelId === room.hotelId)
    ) {
      throw new Error(
        "Invalid assignment. Selected room hotel is not enabled for this event."
      )
    }

    const occupiedBeds = await tx.ticketTailorAttendee.count({
      where: {
        assignedRoomId: room.id,
      },
    })

    if (occupiedBeds >= room.capacity) {
      throw new Error("Invalid assignment. Selected room is already full.")
    }

    await tx.ticketTailorAttendee.update({
      where: {
        id: attendee.id,
      },
      data: {
        assignedRoomId: room.id,
      },
    })

    await syncRoomOccupancy(tx, room.id)

    if (attendee.assignedRoomId) {
      await syncRoomOccupancy(tx, attendee.assignedRoomId)
    }

    return tx.ticketTailorAttendee.findUnique({
      where: {
        id: attendee.id,
      },
      include: {
        assignedRoom: {
          include: {
            hotel: {
              select: {
                name: true,
              },
            },
            roomType: {
              select: {
                label: true,
              },
            },
          },
        },
      },
    })
  })
}

export async function unassignAttendeeFromRoom(attendeeIdValue: string) {
  const attendeeId = normalizeRequiredString(attendeeIdValue, "attendeeId")

  return prisma.$transaction(async (tx) => {
    const attendee = await tx.ticketTailorAttendee.findUnique({
      where: {
        id: attendeeId,
      },
      select: {
        id: true,
        assignedRoomId: true,
      },
    })

    if (!attendee) {
      throw new Error("Invalid 'attendeeId'. Attendee not found.")
    }

    if (!attendee.assignedRoomId) {
      throw new Error(
        "Invalid unassignment. Attendee is not assigned to a room."
      )
    }

    await tx.ticketTailorAttendee.update({
      where: {
        id: attendee.id,
      },
      data: {
        assignedRoomId: null,
      },
    })

    await syncRoomOccupancy(tx, attendee.assignedRoomId)

    return tx.ticketTailorAttendee.findUnique({
      where: {
        id: attendee.id,
      },
      select: {
        id: true,
        assignedRoomId: true,
      },
    })
  })
}
