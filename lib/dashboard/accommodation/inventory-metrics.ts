type RoomMetricInput = {
  capacity: number | null | undefined
  occupantCount?: number | null | undefined
  occupiedBeds: number | null | undefined
  availableBeds: number | null | undefined
  foreignOccupantCount?: number | null | undefined
  occupancyIncomplete?: boolean | null | undefined
}

type RoomTypeInput = {
  id: string
  label: string
}

type InventoryRoomInput = RoomMetricInput & {
  roomType: RoomTypeInput
}

export type SanitizedRoomMetrics = {
  capacity: number
  occupantCount: number
  occupiedBeds: number
  availableBeds: number
  foreignOccupantCount: number
  occupancyIncomplete: boolean
}

export type InventoryRoomTypeBlock = {
  roomTypeId: string
  roomTypeLabel: string
  quantity: number
  totalBeds: number
  totalOccupants: number
  occupiedBeds: number
  availableBeds: number
  foreignOccupants: number
  occupancyIncomplete: boolean
}

function sanitizeFiniteInteger(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.trunc(value))
}

export function sanitizeRoomMetrics(
  room: RoomMetricInput
): SanitizedRoomMetrics {
  const capacity = sanitizeFiniteInteger(room.capacity)
  const occupantCount = sanitizeFiniteInteger(room.occupantCount)
  const occupiedBeds = sanitizeFiniteInteger(room.occupiedBeds)
  const availableBedValue =
    typeof room.availableBeds === "number" &&
    Number.isFinite(room.availableBeds)
      ? sanitizeFiniteInteger(room.availableBeds)
      : Math.max(0, capacity - occupiedBeds)
  const availableBeds = Math.min(capacity, availableBedValue)
  const foreignOccupantCount = sanitizeFiniteInteger(room.foreignOccupantCount)

  return {
    capacity,
    occupantCount,
    occupiedBeds,
    availableBeds,
    foreignOccupantCount,
    occupancyIncomplete: room.occupancyIncomplete === true,
  }
}

export function normalizeInventoryRoom<T extends RoomMetricInput>(room: T) {
  return {
    ...room,
    ...sanitizeRoomMetrics(room),
  }
}

export function groupInventoryRoomsByRoomType<T extends InventoryRoomInput>(
  rooms: T[]
): InventoryRoomTypeBlock[] {
  return Object.values(
    rooms.reduce<Record<string, InventoryRoomTypeBlock>>((groups, room) => {
      const sanitized = sanitizeRoomMetrics(room)
      const current = groups[room.roomType.id] ?? {
        roomTypeId: room.roomType.id,
        roomTypeLabel: room.roomType.label,
        quantity: 0,
        totalBeds: 0,
        totalOccupants: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        foreignOccupants: 0,
        occupancyIncomplete: false,
      }

      current.quantity += 1
      current.totalBeds += sanitized.capacity
      current.totalOccupants += sanitized.occupantCount
      current.occupiedBeds += sanitized.occupiedBeds
      current.availableBeds += sanitized.availableBeds
      current.foreignOccupants += sanitized.foreignOccupantCount
      current.occupancyIncomplete ||= sanitized.occupancyIncomplete
      groups[room.roomType.id] = current

      return groups
    }, {})
  )
}
