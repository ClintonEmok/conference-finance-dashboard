"use client"

import { useQuery, useMutation, useQueries } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function useHotels() {
  return useQuery(api.accommodation.getHotels)
}

export function useHotelById(hotelId: string | undefined) {
  return useQuery(
    api.accommodation.getHotelById,
    hotelId ? { hotelId } : "skip"
  )
}

export function useEventHotels(eventId: string) {
  return useQuery(api.accommodation.getEventHotels, { eventId })
}

export function useRooms(args?: { hotelId?: string; roomTypeId?: string }) {
  return useQuery(api.accommodation.getRooms, args ?? {})
}

export function useRoomById(roomId: string) {
  return useQuery(api.accommodation.getRoomById, { roomId })
}

export function useRoomTypes() {
  const roomTypes = useQuery(api.accommodation.getRoomTypes)
  return roomTypes ?? []
}

export function useCreateHotel() {
  return useMutation(api.accommodation.createHotel)
}

export function useCreateRoom() {
  return useMutation(api.accommodation.createRoom)
}

export function useCreateRoomType() {
  return useMutation(api.accommodation.createRoomType)
}

export function useCreateRooms() {
  return useMutation(api.accommodation.createRooms)
}

/**
 * Link a hotel to an event with optional automatic slot generation.
 *
 * Args:
 *   - eventId?: string (canonical event ID)
 *   - eventProviderEventId?: string (Ticket Tailor event ID or slug)
 *   - hotelId: Id<"accommodationHotels">
 *   - autoGenerateSlots?: boolean (default: true)
 *
 * Returns: { linkId, eventId, hotelId, slotsGenerated, alreadyLinked }
 *
 * Note: Either eventId or eventProviderEventId must be provided.
 */
export function useLinkHotelToEvent() {
  return useMutation(api.accommodation.linkHotelToEvent)
}

/**
 * @deprecated Use useLinkHotelToEvent instead.
 * This hook will be removed in a future release.
 * The useLinkHotelToEvent hook now supports eventProviderEventId and includes auto-slot generation.
 */
export function useAttachHotelToEventByProviderId() {
  console.warn(
    "[DEPRECATED] useAttachHotelToEventByProviderId is deprecated. Use useLinkHotelToEvent with eventProviderEventId parameter."
  )
  return useMutation(api.accommodation.attachHotelToEventByProviderId)
}

export function useDetachHotelFromEventByProviderId() {
  return useMutation(api.accommodation.detachHotelFromEventByProviderId)
}

export function useAssignRoomToAttendee() {
  return useMutation(api.accommodation.assignRoomToAttendee)
}

export function useUnassignRoomFromAttendee() {
  return useMutation(api.accommodation.unassignRoomFromAttendee)
}

export function useUnlinkHotelFromEvent() {
  return useMutation(api.accommodation.unlinkHotelFromEvent)
}

export function useUpdateHotel() {
  return useMutation(api.accommodation.updateHotel)
}

export function useDeleteHotel() {
  return useMutation(api.accommodation.deleteHotel)
}

export function useDeleteRoomType() {
  return useMutation(api.accommodation.deleteRoomType)
}

export function useDeleteRoom() {
  return useMutation(api.accommodation.deleteRoom)
}

export function useUpdateRoomLabel() {
  return useMutation(api.accommodation.updateRoomLabel)
}

export function useUpdateRoomType() {
  return useMutation(api.accommodation.updateRoomType)
}

export function useUnassignAttendeeFromRoom() {
  return useMutation(api.accommodation.unassignAttendeeFromRoom)
}

export function useAssignAttendeeToRoom() {
  return useMutation(api.accommodation.assignAttendeeToRoom)
}

export function useGenerateSlotsForRoom() {
  return useMutation(api.accommodation.generateSlotsForRoom)
}

export function useRoomAllocationBoard(args?: {
  eventId?: string
  hotelId?: string
  roomTypeId?: string
  genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
  familyGroupId?: string
  location?: string
  allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  hasPriority?: boolean
}) {
  return useQuery(api.accommodation.getRoomAllocationBoard, args ?? {})
}

/** The Overview only needs the bounded allocation summary, not the board rows. */
export function useEventAllocationSummary(eventId: string | undefined) {
  const board = useQuery(
    api.accommodation.getRoomAllocationBoard,
    eventId ? { eventId } : "skip"
  )
  return board?.summary
}

export type OverviewAccommodationQuery<T> =
  | { status: "pending" }
  | { status: "success"; data: T }
  | { status: "error"; message: string }

function overviewQueryResult<T>(value: T | undefined | Error): OverviewAccommodationQuery<T> {
  if (value instanceof Error) return { status: "error", message: value.message || "Accommodation data could not be loaded." }
  if (value === undefined) return { status: "pending" }
  return { status: "success", data: value }
}

/** Overview-only wrappers retain Convex query errors instead of collapsing them into undefined. */
export function useEventAllocationSummaryForOverview(eventId: string | undefined) {
  const result = useQueries(eventId ? {
    allocation: { query: api.accommodation.getRoomAllocationBoard, args: { eventId } },
  } : {})
  const queryResult = overviewQueryResult(result.allocation)
  if (queryResult.status !== "success") return queryResult
  return { status: "success" as const, data: queryResult.data.summary }
}

export function useSlotsForEvent(eventId: Id<"events"> | undefined) {
  return useQuery(
    api.accommodation.getSlotsForEvent,
    eventId ? { eventId } : "skip"
  )
}

export function useAccommodationSummaryForEvent(
  eventId: Id<"events"> | undefined
) {
  return useQuery(
    api.accommodation.getAccommodationSummaryForEvent,
    eventId ? { eventId } : "skip"
  )
}

export function useAccommodationSummaryForEventForOverview(eventId: Id<"events"> | undefined) {
  const result = useQueries(eventId ? {
    summary: { query: api.accommodation.getAccommodationSummaryForEvent, args: { eventId } },
  } : {})
  return overviewQueryResult(result.summary)
}
