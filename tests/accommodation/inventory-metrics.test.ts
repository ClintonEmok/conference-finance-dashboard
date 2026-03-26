import { describe, expect, it } from "vitest"

import {
  groupInventoryRoomsByRoomType,
  sanitizeRoomMetrics,
} from "@/lib/dashboard/accommodation/inventory-metrics"

describe("inventory room metrics", () => {
  it("falls back to a finite available-beds value when the payload is malformed", () => {
    expect(
      sanitizeRoomMetrics({
        capacity: 4,
        occupiedBeds: 1,
        availableBeds: Number.NaN,
      })
    ).toEqual({
      capacity: 4,
      occupiedBeds: 1,
      availableBeds: 3,
    })

    expect(
      sanitizeRoomMetrics({
        capacity: null,
        occupiedBeds: undefined,
        availableBeds: null,
      })
    ).toEqual({
      capacity: 0,
      occupiedBeds: 0,
      availableBeds: 0,
    })
  })

  it("keeps grouped room-block totals finite when availableBeds is undefined, null, or NaN", () => {
    const blocks = groupInventoryRoomsByRoomType([
      {
        capacity: 4,
        occupiedBeds: 2,
        availableBeds: undefined,
        roomType: { id: "rt_deluxe", label: "Deluxe" },
      },
      {
        capacity: 2,
        occupiedBeds: 1,
        availableBeds: null,
        roomType: { id: "rt_deluxe", label: "Deluxe" },
      },
      {
        capacity: 3,
        occupiedBeds: 1,
        availableBeds: Number.NaN,
        roomType: { id: "rt_deluxe", label: "Deluxe" },
      },
    ])

    expect(blocks).toEqual([
      {
        roomTypeId: "rt_deluxe",
        roomTypeLabel: "Deluxe",
        quantity: 3,
        totalBeds: 9,
        occupiedBeds: 4,
        availableBeds: 5,
      },
    ])
    expect(Number.isFinite(blocks[0]?.availableBeds)).toBe(true)
  })
})
