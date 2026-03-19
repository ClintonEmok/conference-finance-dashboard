import { prisma } from "@/lib/prisma"

export type AccommodationInventory = {
  hotels: Array<{
    id: string
    name: string
    city: string | null
    notes: string | null
    roomCount: number
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
  label: string
  capacity: number
  notes?: string | null
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

function normalizeCapacity(value: number, fieldName: "defaultCapacity" | "capacity") {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid '${fieldName}'. Expected a positive integer.`)
  }

  if (value > 20) {
    throw new Error(`Invalid '${fieldName}'. Maximum supported value is 20.`)
  }

  return value
}

export async function listAccommodationInventory(): Promise<AccommodationInventory> {
  const [hotels, roomTypes, rooms] = await Promise.all([
    prisma.accommodationHotel.findMany({
      orderBy: [{ name: "asc" }],
      include: {
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
    hotels: hotels.map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      city: hotel.city ?? null,
      notes: hotel.notes ?? null,
      roomCount: hotel._count.rooms,
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
      notes: room.notes ?? null,
      hotel: room.hotel,
      roomType: room.roomType,
    })),
  }
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
  const label = normalizeRequiredString(input.label, "label")
  const capacity = normalizeCapacity(input.capacity, "capacity")
  const notes = normalizeOptionalString(input.notes)

  const [hotel, roomType] = await Promise.all([
    prisma.accommodationHotel.findUnique({ where: { id: hotelId }, select: { id: true } }),
    prisma.accommodationRoomType.findUnique({ where: { id: roomTypeId }, select: { id: true } }),
  ])

  if (!hotel) {
    throw new Error("Invalid 'hotelId'. Hotel not found.")
  }

  if (!roomType) {
    throw new Error("Invalid 'roomTypeId'. Room type not found.")
  }

  try {
    return await prisma.accommodationRoom.create({
      data: {
        hotelId,
        roomTypeId,
        label,
        capacity,
        notes,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      throw new Error("Invalid 'label'. Room label must be unique within the selected hotel.")
    }

    throw error
  }
}
