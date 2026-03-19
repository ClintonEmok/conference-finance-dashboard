import { prisma } from "@/lib/prisma"

export type AccommodationInventory = {
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  hotels: Array<{
    id: string
    name: string
    city: string | null
    notes: string | null
    roomCount: number
    assignedEventIds: string[]
  }>
  roomTypes: Array<{
    id: string
    label: string
    defaultCapacity: number
    notes: string | null
    roomCount: number
  }>
  rooms: Array<{
    id: string
    label: string
    capacity: number
    occupiedBeds: number
    notes: string | null
    hotel: {
      id: string
      name: string
    }
    roomType: {
      id: string
      label: string
      defaultCapacity: number
    }
  }>
  summary: {
    totalRooms: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
    unassignedAttendees: number
  }
}

export type CreateHotelInput = {
  name: string
  city?: string | null
  notes?: string | null
}

export type CreateRoomTypeInput = {
  label: string
  defaultCapacity: number
  notes?: string | null
}

export type CreateRoomInput = {
  hotelId: string
  roomTypeId: string
  quantity: number
  labels?: string[]
  notes?: string | null
}

export type EventHotelScopeInput = {
  eventId: string
  hotelId: string
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

function normalizeManualLabels(values: string[] | undefined) {
  if (!values || values.length === 0) {
    return []
  }

  const labels = values
    .map((value) => value.trim())
    .filter(Boolean)

  const uniqueLabels = new Set(labels)

  if (uniqueLabels.size !== labels.length) {
    throw new Error("Invalid 'labels'. Manual room labels must be unique.")
  }

  return labels
}

function normalizeCapacity(value: number, fieldName: "defaultCapacity" | "capacity" | "quantity") {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid '${fieldName}'. Expected a positive integer.`)
  }

  if (value > 20) {
    throw new Error(`Invalid '${fieldName}'. Maximum supported value is 20.`)
  }

  return value
}

export async function listAccommodationInventory(): Promise<AccommodationInventory> {
  const [availableEvents, hotels, roomTypes, rooms] = await Promise.all([
    prisma.ticketTailorEvent.findMany({
      orderBy: [{ startsAt: "asc" }, { name: "asc" }],
      select: {
        providerEventId: true,
        name: true,
      },
    }),
    prisma.accommodationHotel.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        eventLinks: {
          select: {
            event: {
              select: {
                providerEventId: true,
              },
            },
          },
        },
        _count: {
          select: {
            rooms: true,
          },
        },
      },
    }),
    prisma.accommodationRoomType.findMany({
      orderBy: [{ label: "asc" }],
      include: {
        _count: {
          select: {
            rooms: true,
          },
        },
      },
    }),
    prisma.accommodationRoom.findMany({
      orderBy: [{ hotel: { name: "asc" } }, { label: "asc" }],
      include: {
        hotel: {
          select: {
            id: true,
            name: true,
          },
        },
        roomType: {
          select: {
            id: true,
            label: true,
            defaultCapacity: true,
          },
        },
      },
    }),
  ])

  return {
    availableEvents,
    hotels: hotels.map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      city: hotel.city ?? null,
      notes: hotel.notes ?? null,
      roomCount: hotel._count.rooms,
      assignedEventIds: hotel.eventLinks.map((link) => link.event.providerEventId),
    })),
    roomTypes: roomTypes.map((roomType) => ({
      id: roomType.id,
      label: roomType.label,
      defaultCapacity: roomType.defaultCapacity,
      notes: roomType.notes ?? null,
      roomCount: roomType._count.rooms,
    })),
    rooms: rooms.map((room) => ({
      id: room.id,
      label: room.label,
      capacity: room.capacity,
      occupiedBeds: room.occupiedBeds,
      availableBeds: Math.max(0, room.capacity - room.occupiedBeds),
      availability:
        room.occupiedBeds <= 0
          ? ("empty" as const)
          : room.occupiedBeds >= room.capacity
            ? ("full" as const)
            : ("available" as const),
      notes: room.notes ?? null,
      hotel: room.hotel,
      roomType: room.roomType,
    })),
    summary: {
      totalRooms: rooms.length,
      emptyRooms: rooms.filter((room) => room.occupiedBeds === 0).length,
      availableRooms: rooms.filter((room) => room.occupiedBeds < room.capacity).length,
      fullRooms: rooms.filter((room) => room.occupiedBeds >= room.capacity).length,
      unassignedAttendees: 0,
    },
  }
}

export async function attachHotelToEvent(input: EventHotelScopeInput) {
  const eventId = normalizeRequiredString(input.eventId, "eventId")
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")

  const [event, hotel] = await Promise.all([
    prisma.ticketTailorEvent.findUnique({
      where: { providerEventId: eventId },
      select: { id: true },
    }),
    prisma.accommodationHotel.findUnique({
      where: { id: hotelId },
      select: { id: true },
    }),
  ])

  if (!event) {
    throw new Error("Invalid 'eventId'. Event not found.")
  }

  if (!hotel) {
    throw new Error("Invalid 'hotelId'. Hotel not found.")
  }

  try {
    return await prisma.accommodationEventHotel.upsert({
      where: {
        eventId_hotelId: {
          eventId: event.id,
          hotelId: hotel.id,
        },
      },
      update: {},
      create: {
        eventId: event.id,
        hotelId: hotel.id,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new Error("Invalid assignment. Hotel is already linked to this event.")
    }

    throw error
  }
}

export async function detachHotelFromEvent(input: EventHotelScopeInput) {
  const eventId = normalizeRequiredString(input.eventId, "eventId")
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")

  const event = await prisma.ticketTailorEvent.findUnique({
    where: { providerEventId: eventId },
    select: { id: true },
  })

  if (!event) {
    throw new Error("Invalid 'eventId'. Event not found.")
  }

  const link = await prisma.accommodationEventHotel.findFirst({
    where: {
      eventId: event.id,
      hotelId,
    },
    select: { id: true },
  })

  if (!link) {
    throw new Error("Invalid assignment. Hotel is not linked to this event.")
  }

  await prisma.accommodationEventHotel.delete({
    where: {
      id: link.id,
    },
  })

  return { ok: true }
}

export async function createHotel(input: CreateHotelInput) {
  const name = normalizeRequiredString(input.name, "name")
  const city = normalizeOptionalString(input.city)
  const notes = normalizeOptionalString(input.notes)

  try {
    return await prisma.accommodationHotel.create({
      data: {
        name,
        city,
        notes,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new Error("Invalid 'name'. Hotel name must be unique.")
    }

    throw error
  }
}

export async function createRoomType(input: CreateRoomTypeInput) {
  const label = normalizeRequiredString(input.label, "label")
  const defaultCapacity = normalizeCapacity(input.defaultCapacity, "defaultCapacity")
  const notes = normalizeOptionalString(input.notes)

  try {
    return await prisma.accommodationRoomType.create({
      data: {
        label,
        defaultCapacity,
        notes,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new Error("Invalid 'label'. Room type label must be unique.")
    }

    throw error
  }
}

export async function createRoom(input: CreateRoomInput) {
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")
  const roomTypeId = normalizeRequiredString(input.roomTypeId, "roomTypeId")
  const labels = normalizeManualLabels(input.labels)
  const quantity = normalizeCapacity(labels.length > 0 ? labels.length : input.quantity, "quantity")
  const notes = normalizeOptionalString(input.notes)

  const [hotel, roomType] = await Promise.all([
    prisma.accommodationHotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true } }),
    prisma.accommodationRoomType.findUnique({ where: { id: roomTypeId }, select: { id: true, label: true, defaultCapacity: true } }),
  ])

  if (!hotel) {
    throw new Error("Invalid 'hotelId'. Hotel not found.")
  }

  if (!roomType) {
    throw new Error("Invalid 'roomTypeId'. Room type not found.")
  }

  const hotelCode = hotel.name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join("")
    .slice(0, 6) || "HTL"
  const roomTypeCode = roomType.label
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join("")
    .slice(0, 6) || "RM"

  try {
    return await prisma.$transaction(async (tx) => {
      const existingRoomCount = await tx.accommodationRoom.count({
        where: { hotelId },
      })

      const createdRooms = []

      for (let index = 0; index < quantity; index += 1) {
        const label =
          labels[index] ?? `${hotelCode}-${roomTypeCode}-${String(existingRoomCount + index + 1).padStart(3, "0")}`
        const room = await tx.accommodationRoom.create({
          data: {
            hotelId,
            roomTypeId,
            label,
            capacity: roomType.defaultCapacity,
            notes,
          },
        })

        createdRooms.push(room)
      }

      return createdRooms
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new Error("Failed to create room block. Generated room labels conflicted within the selected hotel.")
    }

    throw error
  }
}

export async function updateRoomLabel(input: { roomId: string; label: string }) {
  const roomId = normalizeRequiredString(input.roomId, "roomId")
  const label = normalizeRequiredString(input.label, "label")

  const room = await prisma.accommodationRoom.findUnique({
    where: { id: roomId },
    select: { id: true, hotelId: true },
  })

  if (!room) {
    throw new Error("Invalid 'roomId'. Room not found.")
  }

  try {
    return await prisma.accommodationRoom.update({
      where: { id: roomId },
      data: { label },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new Error("Invalid 'label'. Room label must be unique within the selected hotel.")
    }

    throw error
  }
}
