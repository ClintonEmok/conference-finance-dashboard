import { useQuery } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id, Doc } from "@/convex/_generated/dataModel"

export function useHotelRooms(hotelId: string | undefined) {
  return useQuery(api.accommodation.getRooms, hotelId ? { hotelId } : "skip")
}

export function useHotelRoomsWithDetails(hotelId: string | undefined) {
  const rooms = useHotelRooms(hotelId)
  const roomTypes = useQuery(api.accommodation.getRoomTypes)

  if (!rooms || !roomTypes) return undefined

  return rooms.map((room: Doc<"accommodationRooms">) => ({
    ...room,
    roomType: roomTypes.find(
      (rt: Doc<"accommodationRoomTypes">) => rt._id === room.roomTypeId
    ),
  }))
}
