"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

export function useHotels() {
  return useQuery(api.accommodation.getHotels)
}

export function useHotelById(hotelId: string) {
  return useQuery(api.accommodation.getHotelById, { hotelId })
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
  return useQuery(api.accommodation.getRoomTypes)
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
