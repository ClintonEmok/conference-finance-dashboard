import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import type { AttendeeDraft } from "./state"

export type AssignmentBoardAttendee = {
  attendeeId: string
  name: string
}

export type AllocationSummaryOccupant = {
  attendeeKey: string
  name: string
  ticketLabel: string
  gender: string
  location: string
}

export type AllocationSummaryRoom = {
  roomLabel: string
  roomTypeLabel: string
  occupants: AllocationSummaryOccupant[]
  unfilledBeds: number
}

export type AllocationSummaryUnassignedAttendee = {
  attendeeKey: string
  name: string
  ticketLabel: string
}

export type AllocationSummary = {
  totalAttendees: number
  totalRooms: number
  rooms: AllocationSummaryRoom[]
  unassignedAttendees: AllocationSummaryUnassignedAttendee[]
}

export type AssignmentBoardSlot = {
  slotId: string
  roomLabel: string
  roomTypeLabel: string
  assignable: boolean
  attendeeId: string | null
}

export type AssignmentBoard = {
  attendees: AssignmentBoardAttendee[]
  slots: AssignmentBoardSlot[]
  assignments: Record<string, string>
}

export function getAssignableSlotTargets(
  catalogEvent: PublicSignupCatalogEvent
) {
  return catalogEvent.accommodation.slots.filter(
    (slot) => slot.assignable === true
  )
}

export function buildAssignmentBoard(
  attendees: AssignmentBoardAttendee[],
  slots: Array<{
    slotId: string
    roomLabel: string
    roomTypeLabel: string
    assignable: boolean
  }>,
  assignments: Record<string, string>
): AssignmentBoard {
  const normalizedAssignments: Record<string, string> = {}
  const usedSlots = new Set<string>()
  const validAttendeeIds = new Set(
    attendees.map((attendee) => attendee.attendeeId)
  )
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]))

  for (const [attendeeId, slotId] of Object.entries(assignments)) {
    if (!validAttendeeIds.has(attendeeId)) {
      continue
    }

    if (!slotById.has(slotId)) {
      continue
    }

    if (usedSlots.has(slotId)) {
      continue
    }

    normalizedAssignments[attendeeId] = slotId
    usedSlots.add(slotId)
  }

  const attendeeBySlot = new Map<string, string>()

  for (const [attendeeId, slotId] of Object.entries(normalizedAssignments)) {
    attendeeBySlot.set(slotId, attendeeId)
  }

  const normalizedSlots: AssignmentBoardSlot[] = slots
    .map((slot) => ({
      slotId: slot.slotId,
      roomLabel: slot.roomLabel,
      roomTypeLabel: slot.roomTypeLabel,
      assignable: slot.assignable,
      attendeeId: attendeeBySlot.get(slot.slotId) ?? null,
    }))
    .sort((a, b) =>
      `${a.roomLabel}:${a.roomTypeLabel}:${a.slotId}`.localeCompare(
        `${b.roomLabel}:${b.roomTypeLabel}:${b.slotId}`
      )
    )

  return {
    attendees: [...attendees],
    slots: normalizedSlots,
    assignments: normalizedAssignments,
  }
}

export function summarizeUnfilledBeds(board: AssignmentBoard) {
  const assignableSlots = board.slots.filter((slot) => slot.assignable)
  const totalBeds = assignableSlots.length
  const filledBeds = assignableSlots.filter(
    (slot) => slot.attendeeId !== null
  ).length

  return {
    totalBeds,
    filledBeds,
    unfilledBeds: Math.max(0, totalBeds - filledBeds),
  }
}

export function canDropAttendeeIntoSlot(
  attendeeId: string,
  slotId: string,
  board: AssignmentBoard
) {
  const targetSlot = board.slots.find((slot) => slot.slotId === slotId)

  if (!targetSlot || !targetSlot.assignable) {
    return false
  }

  // Allow drop even if target slot is occupied (swap will be handled)
  // Only block if the attendee is already in this exact slot
  if (targetSlot.attendeeId === attendeeId) {
    return false
  }

  return true
}

export function buildAllocationSummary(
  board: AssignmentBoard,
  attendees: AttendeeDraft[],
  slots: Array<{
    slotId: string
    roomLabel: string
    roomTypeLabel: string
    assignable: boolean
  }>
): AllocationSummary {
  const attendeeByKey = new Map(attendees.map((a) => [a.attendeeKey, a]))
  const assignedAttendeeKeys = new Set<string>()
  const roomsMap = new Map<string, AllocationSummaryRoom>()

  // Group slots by room label
  const slotsByRoom = new Map<string, typeof slots>()
  for (const slot of slots) {
    if (!slotsByRoom.has(slot.roomLabel)) {
      slotsByRoom.set(slot.roomLabel, [])
    }
    slotsByRoom.get(slot.roomLabel)!.push(slot)
  }

  // Process each room
  for (const [roomLabel, roomSlots] of slotsByRoom) {
    const assignableSlots = roomSlots.filter((slot) => slot.assignable)
    const roomTypeLabel = roomSlots[0]?.roomTypeLabel ?? ""
    const occupants: AllocationSummaryOccupant[] = []

    for (const slot of assignableSlots) {
      const assignedAttendeeId = board.assignments[slot.slotId]
      if (assignedAttendeeId) {
        const attendee = attendeeByKey.get(assignedAttendeeId)
        if (attendee) {
          assignedAttendeeKeys.add(assignedAttendeeId)
          occupants.push({
            attendeeKey: attendee.attendeeKey,
            name: attendee.name || `Attendee ${attendee.attendeeKey}`,
            ticketLabel: attendee.ticketLabel,
            gender: attendee.gender,
            location: attendee.location,
          })
        }
      }
    }

    const filledBeds = occupants.length
    const totalBeds = assignableSlots.length
    const unfilledBeds = Math.max(0, totalBeds - filledBeds)

    roomsMap.set(roomLabel, {
      roomLabel,
      roomTypeLabel,
      occupants,
      unfilledBeds,
    })
  }

  // Find unassigned attendees
  const unassignedAttendees: AllocationSummaryUnassignedAttendee[] = []
  for (const attendee of attendees) {
    if (!assignedAttendeeKeys.has(attendee.attendeeKey)) {
      unassignedAttendees.push({
        attendeeKey: attendee.attendeeKey,
        name: attendee.name || `Attendee ${attendee.attendeeKey}`,
        ticketLabel: attendee.ticketLabel,
      })
    }
  }

  const rooms = Array.from(roomsMap.values()).filter(
    (room) => room.occupants.length > 0 || room.unfilledBeds > 0
  )

  return {
    totalAttendees: attendees.length,
    totalRooms: rooms.length,
    rooms,
    unassignedAttendees,
  }
}

export function swapAttendeesInSlots(
  attendeeId: string,
  targetSlotId: string,
  board: AssignmentBoard
): Record<string, string> | null {
  const targetSlot = board.slots.find((slot) => slot.slotId === targetSlotId)
  if (!targetSlot || !targetSlot.assignable) return null

  const currentOccupantId = targetSlot.attendeeId
  const currentSlotForDraggingAttendee = Object.entries(board.assignments).find(
    ([assignedAttendeeId]) => assignedAttendeeId === attendeeId
  )
  const currentSlotIdForDraggingAttendee =
    currentSlotForDraggingAttendee?.[1] ?? null

  const nextAssignments = { ...board.assignments }

  // Assign dragging attendee to target slot
  nextAssignments[attendeeId] = targetSlotId

  // If target had an occupant, move them to dragging attendee's previous slot
  if (currentOccupantId && currentSlotIdForDraggingAttendee) {
    nextAssignments[currentOccupantId] = currentSlotIdForDraggingAttendee
  } else if (currentOccupantId) {
    // Target occupant becomes unassigned (remove from assignments)
    delete nextAssignments[currentOccupantId]
  }

  return nextAssignments
}

export type RoomTypeGroup = {
  roomTypeLabel: string
  slots: AssignmentBoardSlot[]
  totalBeds: number
  filledBeds: number
}

export function groupSlotsByRoomType(board: AssignmentBoard): RoomTypeGroup[] {
  const groups = new Map<string, RoomTypeGroup>()

  for (const slot of board.slots) {
    if (!slot.assignable) continue

    if (!groups.has(slot.roomTypeLabel)) {
      groups.set(slot.roomTypeLabel, {
        roomTypeLabel: slot.roomTypeLabel,
        slots: [],
        totalBeds: 0,
        filledBeds: 0,
      })
    }

    const group = groups.get(slot.roomTypeLabel)!
    group.slots.push(slot)
    group.totalBeds += 1
    if (slot.attendeeId) {
      group.filledBeds += 1
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.roomTypeLabel.localeCompare(b.roomTypeLabel)
  )
}

export type RoomPreview = {
  roomLabel: string
  roomTypeLabel: string
  occupants: Array<{
    attendeeId: string
    name: string
    isDragging?: boolean
  }>
  remainingBeds: number
}

export function buildRoomPreview(
  board: AssignmentBoard,
  attendees: Array<{ attendeeId: string; name: string }>
): RoomPreview[] {
  const rooms = new Map<string, RoomPreview>()
  const attendeeNames = new Map(attendees.map((a) => [a.attendeeId, a.name]))

  for (const slot of board.slots) {
    if (!rooms.has(slot.roomLabel)) {
      rooms.set(slot.roomLabel, {
        roomLabel: slot.roomLabel,
        roomTypeLabel: slot.roomTypeLabel,
        occupants: [],
        remainingBeds: 0,
      })
    }

    const room = rooms.get(slot.roomLabel)!
    if (slot.attendeeId) {
      room.occupants.push({
        attendeeId: slot.attendeeId,
        name:
          attendeeNames.get(slot.attendeeId) || `Attendee ${slot.attendeeId}`,
      })
    } else {
      room.remainingBeds += 1
    }
  }

  return Array.from(rooms.values()).sort((a, b) =>
    a.roomLabel.localeCompare(b.roomLabel)
  )
}
