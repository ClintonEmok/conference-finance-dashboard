"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "convex/functions/_generated/api"

export function useHotels() {
  return useQuery(api.accommodation.getHotels)
}

export function useHotelById(hotelId: string) {
  return useQuery(api.accommodation.getHotelById, { hotelId: hotelId as any })
}

export function useEventHotels(eventId: string) {
  return useQuery(api.accommodation.getEventHotels, { eventId })
}

export function useRooms(args?: { hotelId?: string; roomTypeId?: string }) {
  return useQuery(api.accommodation.getRooms, args ?? {})
}

export function useRoomById(roomId: string) {
  return useQuery(api.accommodation.getRoomById, { roomId: roomId as any })
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
