import { convexQuery, convexMutation } from "@/lib/convex/server"

type RoomAvailability = "all" | "empty" | "available" | "full"

export type RoomAllocationBoardFilters = {
  eventId?: string | null
  search?: string | null
  hotelId?: string | null
  roomTypeId?: string | null
  availability?: RoomAvailability
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
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    location: string | null
    remarks: string | null
    hasFamily: boolean
  }>
  summary: {
    totalRooms: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
    totalBeds: number
    occupiedBeds: number
    availableBeds: number
    unassignedAttendeesCount: number
  }
}

export type AllocationProposal = {
  generatedAt: string
  eventId: string | null
  suggestions: Array<{
    attendeeId: string
    attendeeName: string | null
    roomId: string
    roomLabel: string
    hotelName: string
    reason: string
    priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }>
  unplacedAttendees: Array<{
    attendeeId: string
    attendeeName: string | null
    reason: string
    priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }>
  summary: {
    totalSuggested: number
    totalUnplaced: number
    familyGroupsKeptTogether: number
  }
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeAvailability(
  value: string | null | undefined
): RoomAvailability {
  const allowed: RoomAvailability[] = ["all", "empty", "available", "full"]
  if (!value || !allowed.includes(value as RoomAvailability)) {
    return "all"
  }
  return value as RoomAvailability
}

function normalizeGenderType(
  value: string | null | undefined
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null {
  const allowed = ["MALE", "FEMALE", "MIXED", "UNKNOWN"] as const
  if (!value || !allowed.includes(value as (typeof allowed)[number])) {
    return null
  }
  return value as (typeof allowed)[number]
}

function normalizeAllocationPriority(
  value: string | null | undefined
): "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null {
  const allowed = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const
  if (!value || !allowed.includes(value as (typeof allowed)[number])) {
    return null
  }
  return value as (typeof allowed)[number]
}

function normalizeBoolean(value: boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  return value
}

function matchesSearch(value: string | null, search: string): boolean {
  if (!value || !search) return false
  return value.toLowerCase().includes(search.toLowerCase())
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
  search: string
): boolean {
  const searchLower = search.toLowerCase()
  return [
    attendee.attendeeName,
    attendee.attendeeEmail,
    attendee.providerOrderId,
    attendee.providerEventId,
    attendee.eventName,
    attendee.ticketTypeLabel,
  ].some((value) => matchesSearch(value, searchLower))
}

export async function getRoomAllocationBoard(
  filters: RoomAllocationBoardFilters = {}
): Promise<RoomAllocationBoard> {
  const eventId = normalizeOptionalString(filters.eventId)
  const search = normalizeOptionalString(filters.search)
  const hotelId = normalizeOptionalString(filters.hotelId)
  const roomTypeId = normalizeOptionalString(filters.roomTypeId)
  const availability = normalizeAvailability(filters.availability)
  const genderType = normalizeGenderType(filters.genderType ?? undefined)
  const allocationPriority = normalizeAllocationPriority(
    filters.allocationPriority ?? undefined
  )
  const hasPriority = normalizeBoolean(filters.hasPriority ?? undefined)

  const result = await convexQuery<
    Record<string, unknown>,
    RoomAllocationBoard
  >("accommodation:getRoomAllocationBoard", {
    eventId: eventId ?? undefined,
    hotelId: hotelId ?? undefined,
    roomTypeId: roomTypeId ?? undefined,
    genderType: genderType ?? undefined,
    allocationPriority: allocationPriority ?? undefined,
    hasPriority: hasPriority ?? undefined,
  })

  let mappedRooms = result.rooms
  if (search) {
    mappedRooms = result.rooms
      .map((room) => {
        const occupants = search
          ? room.occupants.filter((occupant: (typeof room.occupants)[number]) =>
              attendeeMatchesSearch(occupant, search)
            )
          : room.occupants
        const doesMatchSearch =
          !search ||
          matchesSearch(room.label, search) ||
          matchesSearch(room.hotel.name, search) ||
          matchesSearch(room.hotel.city, search) ||
          matchesSearch(room.roomType.label, search) ||
          occupants.length > 0
        return { ...room, occupants, doesMatchSearch }
      })
      .filter((room: { doesMatchSearch: boolean }) => room.doesMatchSearch)
      .map(
        ({
          doesMatchSearch,
          ...room
        }: {
          doesMatchSearch: boolean
          [key: string]: unknown
        }) => room as (typeof result.rooms)[number]
      )
  }

  if (availability !== "all") {
    mappedRooms = mappedRooms.filter(
      (room: (typeof result.rooms)[number]) =>
        room.availability === availability
    )
  }

  return {
    ...result,
    filters: {
      ...result.filters,
      search,
    },
    rooms: mappedRooms,
  }
}

export async function assignAttendeeToRoom(input: {
  attendeeId: string
  roomId: string
}) {
  return await convexMutation("accommodation:assignAttendeeToRoom", {
    attendeeId: input.attendeeId,
    roomId: input.roomId,
  })
}

export async function unassignAttendeeFromRoom(attendeeIdValue: string) {
  const attendeeId = normalizeOptionalString(attendeeIdValue) ?? ""

  return await convexMutation("accommodation:unassignAttendeeFromRoom", {
    attendeeId,
  })
}

export async function generateAllocationProposal(input: {
  eventId?: string | null
}): Promise<AllocationProposal> {
  const eventId = normalizeOptionalString(input.eventId)

  const board = await getRoomAllocationBoard({ eventId })

  const suggestions: AllocationProposal["suggestions"] = []
  const unplacedAttendees: AllocationProposal["unplacedAttendees"] = []

  const availableRooms = board.rooms
    .filter((r) => r.availableBeds > 0)
    .sort((a, b) => {
      if (a.availability === "available" && b.availability === "empty")
        return -1
      if (a.availability === "empty" && b.availability === "available") return 1
      return a.label.localeCompare(b.label)
    })

  const sortedAttendees = [...board.unassignedAttendees].sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
    const aOrder = priorityOrder[a.allocationPriority ?? "NORMAL"]
    const bOrder = priorityOrder[b.allocationPriority ?? "NORMAL"]
    if (aOrder !== bOrder) return aOrder - bOrder
    return (a.attendeeName ?? "").localeCompare(b.attendeeName ?? "")
  })

  for (const attendee of sortedAttendees) {
    const priority = attendee.allocationPriority ?? "NORMAL"

    const compatibleRooms = availableRooms.filter((room) => {
      if (room.availableBeds <= 0) return false
      return true
    })

    if (compatibleRooms.length > 0) {
      const bestRoom = compatibleRooms[0]
      suggestions.push({
        attendeeId: attendee.attendeeId,
        attendeeName: attendee.attendeeName,
        roomId: bestRoom.id,
        roomLabel: bestRoom.label,
        hotelName: bestRoom.hotel.name,
        reason: `Available room with ${bestRoom.availableBeds} beds`,
        priority,
      })
    } else {
      unplacedAttendees.push({
        attendeeId: attendee.attendeeId,
        attendeeName: attendee.attendeeName,
        reason: "No compatible rooms available",
        priority,
      })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    eventId,
    suggestions,
    unplacedAttendees,
    summary: {
      totalSuggested: suggestions.length,
      totalUnplaced: unplacedAttendees.length,
      familyGroupsKeptTogether: 0,
    },
  }
}
