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

export function useLinkHotelToEvent() {
  return useMutation(api.accommodation.linkHotelToEvent)
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
