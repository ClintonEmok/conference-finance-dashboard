type RoomMetricInput = {
  capacity: number | null | undefined
  occupiedBeds: number | null | undefined
  availableBeds: number | null | undefined
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
  occupiedBeds: number
  availableBeds: number
}

export type InventoryRoomTypeBlock = {
  roomTypeId: string
  roomTypeLabel: string
  quantity: number
  totalBeds: number
  occupiedBeds: number
  availableBeds: number
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
  const occupiedBeds = sanitizeFiniteInteger(room.occupiedBeds)
  const availableBeds =
    typeof room.availableBeds === "number" &&
    Number.isFinite(room.availableBeds)
      ? sanitizeFiniteInteger(room.availableBeds)
      : Math.max(0, capacity - occupiedBeds)

  return {
    capacity,
    occupiedBeds,
    availableBeds,
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
        occupiedBeds: 0,
        availableBeds: 0,
      }

      current.quantity += 1
      current.totalBeds += sanitized.capacity
      current.occupiedBeds += sanitized.occupiedBeds
      current.availableBeds += sanitized.availableBeds
      groups[room.roomType.id] = current

      return groups
    }, {})
  )
}
