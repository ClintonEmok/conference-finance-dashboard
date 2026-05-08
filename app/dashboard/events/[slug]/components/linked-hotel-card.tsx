"use client"

import { useState } from "react"
import {
  Building2,
  MapPin,
  AlertTriangle,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useHotelRoomsWithDetails } from "./accommodation-hooks"
import type { Doc } from "@/convex/_generated/dataModel"

interface LinkedHotelCardProps {
  hotel: Doc<"accommodationHotels">
  onUnlink: (hotelId: string) => void
  onAddRooms: (hotelId: string) => void
  isUnlinking?: boolean
}

interface RoomWithDetails {
  _id: string
  capacity: number
  roomType?: {
    label?: string
  }
}

interface RoomTypeStats {
  count: number
  capacity: number
}

export function LinkedHotelCard({
  hotel,
  onUnlink,
  onAddRooms,
  isUnlinking,
}: LinkedHotelCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const roomsWithDetails = useHotelRoomsWithDetails(hotel._id) as
    | RoomWithDetails[]
    | undefined

  const totalRooms = roomsWithDetails?.length ?? 0
  const totalBeds =
    roomsWithDetails?.reduce(
      (sum: number, room: RoomWithDetails) => sum + (room.capacity || 0),
      0
    ) ?? 0
  const hasRooms = totalRooms > 0

  // Group rooms by type
  const roomsByType: Record<string, RoomTypeStats> = {}
  roomsWithDetails?.forEach((room: RoomWithDetails) => {
    const typeName = room.roomType?.label || "Unknown"
    if (!roomsByType[typeName]) {
      roomsByType[typeName] = { count: 0, capacity: 0 }
    }
    roomsByType[typeName].count++
    roomsByType[typeName].capacity += room.capacity || 0
  })

  return (
    <div className="rounded-lg border border-border/50 bg-card">
      <div className="flex items-start justify-between p-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <span className="font-medium">{hotel.name}</span>
            {hotel.city && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {hotel.city}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {hasRooms ? (
              <>
                <Badge variant="secondary" className="text-xs">
                  {totalRooms} {totalRooms === 1 ? "room" : "rooms"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {totalBeds} {totalBeds === 1 ? "bed" : "beds"}
                </Badge>
              </>
            ) : (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="mr-1 size-3" />
                Needs rooms
              </Badge>
            )}
          </div>

          {!hasRooms && (
            <p className="text-xs text-amber-600">
              This hotel has no rooms yet. Add rooms before attendees can be
              assigned.
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={!hasRooms}
          >
            {isExpanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddRooms(hotel._id)}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUnlink(hotel._id)}
            disabled={isUnlinking}
          >
            <X className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      {isExpanded && hasRooms && (
        <div className="border-t border-border/50 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Room Breakdown
          </p>
          <div className="space-y-1">
            {Object.entries(roomsByType).map(
              ([typeName, stats]: [string, RoomTypeStats]) => (
                <div
                  key={typeName}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{typeName}</span>
                  <span className="text-muted-foreground">
                    {stats.count} {stats.count === 1 ? "room" : "rooms"} •{" "}
                    {stats.capacity} beds
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
