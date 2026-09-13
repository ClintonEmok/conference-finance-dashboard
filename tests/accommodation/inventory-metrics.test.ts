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
        occupantCount: 3,
        occupiedBeds: 1,
        availableBeds: Number.NaN,
        foreignOccupantCount: 1,
        occupancyIncomplete: true,
      })
    ).toEqual({
      capacity: 4,
      occupantCount: 3,
      occupiedBeds: 1,
      availableBeds: 3,
      foreignOccupantCount: 1,
      occupancyIncomplete: true,
    })

    expect(
      sanitizeRoomMetrics({
        capacity: null,
        occupantCount: undefined,
        occupiedBeds: undefined,
        availableBeds: null,
      })
    ).toEqual({
      capacity: 0,
      occupantCount: 0,
      occupiedBeds: 0,
      availableBeds: 0,
      foreignOccupantCount: 0,
      occupancyIncomplete: false,
    })
  })

  it("keeps grouped room-block totals finite when availableBeds is undefined, null, or NaN", () => {
    const blocks = groupInventoryRoomsByRoomType([
      {
        capacity: 4,
        occupantCount: 3,
        occupiedBeds: 2,
        availableBeds: undefined,
        foreignOccupantCount: 1,
        occupancyIncomplete: true,
        roomType: { id: "rt_deluxe", label: "Deluxe" },
      },
      {
        capacity: 2,
        occupantCount: 1,
        occupiedBeds: 1,
        availableBeds: null,
        roomType: { id: "rt_deluxe", label: "Deluxe" },
      },
      {
        capacity: 3,
        occupantCount: 2,
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
        totalOccupants: 6,
        occupiedBeds: 4,
        availableBeds: 5,
        foreignOccupants: 1,
        occupancyIncomplete: true,
      },
    ])
    expect(Number.isFinite(blocks[0]?.availableBeds)).toBe(true)
  })

  it("clamps impossible available-bed values without replacing server occupancy metrics", () => {
    expect(
      sanitizeRoomMetrics({
        capacity: 2,
        occupantCount: 5,
        occupiedBeds: 4,
        availableBeds: 9,
      })
    ).toMatchObject({
      capacity: 2,
      occupantCount: 5,
      occupiedBeds: 4,
      availableBeds: 2,
    })
  })
})
