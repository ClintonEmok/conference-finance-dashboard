import { api } from "@/lib/convex/api"
import { convexQuery, convexMutation } from "@/lib/convex/server"

export type AccommodationInventory = {
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  hotels: Array<{
    id: string
    name: string
    city: string | null
    address: string | null
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
  address?: string | null
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

  const labels = values.map((value) => value.trim()).filter(Boolean)

  const uniqueLabels = new Set(labels)

  if (uniqueLabels.size !== labels.length) {
    throw new Error("Invalid 'labels'. Manual room labels must be unique.")
  }

  return labels
}

function normalizeCapacity(
  value: number,
  fieldName: "defaultCapacity" | "capacity" | "quantity"
) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid '${fieldName}'. Expected a positive integer.`)
  }

  if (value > 20) {
    throw new Error(`Invalid '${fieldName}'. Maximum supported value is 20.`)
  }

  return value
}

export async function listAccommodationInventory(): Promise<AccommodationInventory> {
  return await convexQuery(api.accommodation.listAccommodationInventory, {})
}

export async function attachHotelToEvent(input: EventHotelScopeInput) {
  const eventId = normalizeRequiredString(input.eventId, "eventId")
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")

  return await convexMutation(
    api.accommodation.attachHotelToEventByProviderId,
    {
      eventProviderEventId: eventId,
      hotelId,
    }
  )
}

export async function detachHotelFromEvent(input: EventHotelScopeInput) {
  const eventId = normalizeRequiredString(input.eventId, "eventId")
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")

  return await convexMutation(
    api.accommodation.detachHotelFromEventByProviderId,
    {
      eventProviderEventId: eventId,
      hotelId,
    }
  )
}

export async function createHotel(input: CreateHotelInput) {
  const name = normalizeRequiredString(input.name, "name")
  const city = normalizeOptionalString(input.city)
  const address = normalizeOptionalString(input.address)
  const notes = normalizeOptionalString(input.notes)

  return await convexMutation(api.accommodation.createHotel, {
    name,
    city: city ?? undefined,
    address: address ?? undefined,
    notes: notes ?? undefined,
  })
}

export async function createRoomType(input: CreateRoomTypeInput) {
  const label = normalizeRequiredString(input.label, "label")
  const defaultCapacity = normalizeCapacity(
    input.defaultCapacity,
    "defaultCapacity"
  )
  const notes = normalizeOptionalString(input.notes)

  return await convexMutation(api.accommodation.createRoomType, {
    label,
    defaultCapacity,
    notes: notes ?? undefined,
  })
}

export async function createRoom(input: CreateRoomInput) {
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")
  const roomTypeId = normalizeRequiredString(input.roomTypeId, "roomTypeId")
  const labels = normalizeManualLabels(input.labels)
  const quantity = normalizeCapacity(
    labels.length > 0 ? labels.length : input.quantity,
    "quantity"
  )
  const notes = normalizeOptionalString(input.notes)

  const createdIds = await convexMutation(api.accommodation.createRooms, {
    hotelId,
    roomTypeId,
    quantity,
    labels: labels.length > 0 ? labels : undefined,
    notes: notes ?? undefined,
  })

  return createdIds
}

export async function updateRoomLabel(input: {
  roomId: string
  label: string
}) {
  const roomId = normalizeRequiredString(input.roomId, "roomId")
  const label = normalizeRequiredString(input.label, "label")

  return await convexMutation(api.accommodation.updateRoomLabel, {
    roomId,
    label,
  })
}

export async function updateHotel(input: {
  hotelId: string
  name?: string
  city?: string | null
  address?: string | null
  notes?: string | null
}) {
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")

  return await convexMutation(api.accommodation.updateHotel, {
    hotelId,
    name: input.name,
    city:
      input.city !== undefined
        ? (normalizeOptionalString(input.city) ?? undefined)
        : undefined,
    address:
      input.address !== undefined
        ? (normalizeOptionalString(input.address) ?? undefined)
        : undefined,
    notes:
      input.notes !== undefined
        ? (normalizeOptionalString(input.notes) ?? undefined)
        : undefined,
  })
}

export async function deleteHotel(input: { hotelId: string }) {
  const hotelId = normalizeRequiredString(input.hotelId, "hotelId")

  return await convexMutation(api.accommodation.deleteHotel, {
    hotelId,
  })
}

export async function updateRoomType(input: {
  roomTypeId: string
  label?: string
  defaultCapacity?: number
  notes?: string | null
}) {
  const roomTypeId = normalizeRequiredString(input.roomTypeId, "roomTypeId")

  return await convexMutation(api.accommodation.updateRoomType, {
    roomTypeId,
    label: input.label,
    defaultCapacity: input.defaultCapacity,
    notes:
      input.notes !== undefined
        ? (normalizeOptionalString(input.notes) ?? undefined)
        : undefined,
  })
}

export async function deleteRoomType(input: { roomTypeId: string }) {
  const roomTypeId = normalizeRequiredString(input.roomTypeId, "roomTypeId")

  return await convexMutation(api.accommodation.deleteRoomType, {
    roomTypeId,
  })
}

export async function deleteRoom(input: { roomId: string }) {
  const roomId = normalizeRequiredString(input.roomId, "roomId")

  return await convexMutation(api.accommodation.deleteRoom, {
    roomId,
  })
}

export async function getHotelById(hotelId: string) {
  return await convexQuery(api.accommodation.getHotelById, { hotelId })
}

export async function getRoomTypeById(roomTypeId: string) {
  return await convexQuery(api.accommodation.getRoomTypeById, { roomTypeId })
}

export async function getRoomById(roomId: string) {
  return await convexQuery(api.accommodation.getRoomById, { roomId })
}

export async function getEventByProviderId(providerEventId: string) {
  return await convexQuery(api.accommodation.getEventByProviderId, {
    providerEventId,
  })
}
