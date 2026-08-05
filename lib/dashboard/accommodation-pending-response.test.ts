import { describe, expect, it } from "vitest"
import { hasCompletePendingResponse } from "./accommodation-pending-response"

const validPendingOrder = {
  orderId: "order_1",
  bookingRef: "BK-1",
  bookerName: "Buyer",
  selectionCount: 2,
}

describe("hasCompletePendingResponse", () => {
  it("accepts a complete, well-formed response", () => {
    expect(
      hasCompletePendingResponse({
        pendingOrderCount: 1,
        pendingOrders: [validPendingOrder],
        hasAccommodationSelections: true,
      })
    ).toBe(true)
  })

  it("accepts null bookingRef and bookerName rows", () => {
    expect(
      hasCompletePendingResponse({
        pendingOrderCount: 1,
        pendingOrders: [
          { ...validPendingOrder, bookingRef: null, bookerName: null },
        ],
        hasAccommodationSelections: true,
      })
    ).toBe(true)
  })

  it("accepts an empty pending list with zero count", () => {
    expect(
      hasCompletePendingResponse({
        pendingOrderCount: 0,
        pendingOrders: [],
        hasAccommodationSelections: false,
      })
    ).toBe(true)
  })

  it("rejects a missing top-level field (no-fake-zero rule)", () => {
    expect(
      hasCompletePendingResponse({
        pendingOrders: [],
        hasAccommodationSelections: false,
      })
    ).toBe(false)
    expect(
      hasCompletePendingResponse({
        pendingOrderCount: 0,
        hasAccommodationSelections: false,
      })
    ).toBe(false)
    expect(
      hasCompletePendingResponse({
        pendingOrderCount: 0,
        pendingOrders: [],
      })
    ).toBe(false)
  })

  it("rejects non-integer, negative, and NaN counts", () => {
    for (const bad of [1.5, -1, NaN, Infinity, "1", null]) {
      expect(
        hasCompletePendingResponse({
          pendingOrderCount: bad,
          pendingOrders: [],
          hasAccommodationSelections: false,
        })
      ).toBe(false)
    }
  })

  it("rejects a malformed row inside the pending list", () => {
    const base = {
      pendingOrderCount: 1,
      pendingOrders: [validPendingOrder],
      hasAccommodationSelections: true,
    }
    expect(
      hasCompletePendingResponse({
        ...base,
        pendingOrders: [{ ...validPendingOrder, selectionCount: -1 }],
      })
    ).toBe(false)
    expect(
      hasCompletePendingResponse({
        ...base,
        pendingOrders: [{ ...validPendingOrder, selectionCount: 1.5 }],
      })
    ).toBe(false)
    expect(
      hasCompletePendingResponse({
        ...base,
        pendingOrders: [{ ...validPendingOrder, orderId: null }],
      })
    ).toBe(false)
    expect(
      hasCompletePendingResponse({
        ...base,
        pendingOrders: [{ ...validPendingOrder, bookingRef: 5 }],
      })
    ).toBe(false)
    expect(hasCompletePendingResponse({ ...base, pendingOrders: ["nope"] })).toBe(
      false
    )
    expect(hasCompletePendingResponse({ ...base, pendingOrders: [null] })).toBe(
      false
    )
  })

  it("rejects non-object and null payloads", () => {
    for (const bad of [null, undefined, "string", 42, true]) {
      expect(hasCompletePendingResponse(bad)).toBe(false)
    }
  })
})
