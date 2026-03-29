import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"

export type AssignmentBoardAttendee = {
  attendeeId: string
  name: string
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

  if (targetSlot.attendeeId && targetSlot.attendeeId !== attendeeId) {
    return false
  }

  const existingSlotForAttendee = Object.entries(board.assignments).find(
    ([assignedAttendeeId]) => assignedAttendeeId === attendeeId
  )

  if (existingSlotForAttendee && existingSlotForAttendee[1] !== slotId) {
    return false
  }

  return true
}
