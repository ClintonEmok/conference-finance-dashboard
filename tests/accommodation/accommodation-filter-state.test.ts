import { describe, expect, it } from "vitest"

import {
  appendSignalFiltersToQuery,
  getRoomPageForRoomId,
  normalizeAllocationFilters,
  normalizeSignalFilters,
  readAllocationFiltersFromSearchParams,
  readSignalFiltersFromSearchParams,
  syncAllocationFiltersToSearchParams,
  shouldRenderFamilyBadge,
  syncSignalFiltersToSearchParams,
} from "@/app/dashboard/accommodation/filter-state"

describe("accommodation filter state", () => {
  it("normalizes signal filter values from search params", () => {
    const params = new URLSearchParams({
      genderType: "MALE",
      allocationPriority: "CRITICAL",
      hasPriority: "true",
      location: " Amsterdam ",
      familyGroupId: " family-42 ",
    })

    expect(readSignalFiltersFromSearchParams(params)).toEqual({
      genderType: "MALE",
      allocationPriority: "CRITICAL",
      hasPriority: true,
      location: "Amsterdam",
      familyGroupId: "family-42",
    })
  })

  it("serializes signal filters into URL state and clears absent values", () => {
    const params = new URLSearchParams({
      genderType: "FEMALE",
      allocationPriority: "HIGH",
      hasPriority: "true",
      location: "Rotterdam",
      familyGroupId: "family-1",
    })

    syncSignalFiltersToSearchParams(
      params,
      normalizeSignalFilters({
        genderType: null,
        allocationPriority: "LOW",
        hasPriority: false,
        location: "",
        familyGroupId: null,
      })
    )

    expect(params.get("genderType")).toBeNull()
    expect(params.get("allocationPriority")).toBe("LOW")
    expect(params.get("hasPriority")).toBe("false")
    expect(params.get("location")).toBeNull()
    expect(params.get("familyGroupId")).toBeNull()
  })

  it("builds board request query with signal filters retained", () => {
    const query = new URLSearchParams({ eventId: "evt-1" })

    appendSignalFiltersToQuery(
      query,
      normalizeSignalFilters({
        genderType: "UNKNOWN",
        allocationPriority: "NORMAL",
        hasPriority: true,
        location: "Utrecht",
        familyGroupId: "family-9",
      })
    )

    expect(query.toString()).toContain("eventId=evt-1")
    expect(query.toString()).toContain("genderType=UNKNOWN")
    expect(query.toString()).toContain("allocationPriority=NORMAL")
    expect(query.toString()).toContain("hasPriority=true")
    expect(query.toString()).toContain("location=Utrecht")
    expect(query.toString()).toContain("familyGroupId=family-9")
  })

  it("renders family badge strictly from hasFamily contract", () => {
    expect(shouldRenderFamilyBadge({ hasFamily: true })).toBe(true)
    expect(shouldRenderFamilyBadge({ hasFamily: false })).toBe(false)
  })

  it("reads and normalizes the complete allocation filter state", () => {
    expect(
      readAllocationFiltersFromSearchParams(
        new URLSearchParams({
          hotelId: " hotel-1 ",
          roomTypeId: " room-type-1 ",
          genderType: "MALE",
          familyGroupId: " family-1 ",
          location: " Amsterdam ",
          allocationPriority: "HIGH",
          hasPriority: "false",
        })
      )
    ).toEqual({
      hotelId: "hotel-1",
      roomTypeId: "room-type-1",
      genderType: "MALE",
      familyGroupId: "family-1",
      location: "Amsterdam",
      allocationPriority: "HIGH",
      hasPriority: false,
    })

    expect(
      normalizeAllocationFilters({
        hotelId: " ",
        roomTypeId: "room-type-1",
        genderType: "invalid",
        allocationPriority: "invalid",
        hasPriority: null,
      })
    ).toEqual({
      hotelId: null,
      roomTypeId: "room-type-1",
      genderType: null,
      familyGroupId: null,
      location: null,
      allocationPriority: null,
      hasPriority: null,
    })
  })

  it("serializes allocation filters while preserving tab and room intent", () => {
    const params = new URLSearchParams({
      tab: "allocation",
      roomId: "room-9",
      hotelId: "hotel-old",
      location: "Old town",
    })

    syncAllocationFiltersToSearchParams(
      params,
      normalizeAllocationFilters({
        hotelId: "hotel-new",
        roomTypeId: "room-type-2",
        genderType: "FEMALE",
        familyGroupId: null,
        location: "Rotterdam",
        allocationPriority: "LOW",
        hasPriority: true,
      })
    )

    expect(params.get("tab")).toBe("allocation")
    expect(params.get("roomId")).toBe("room-9")
    expect(params.get("hotelId")).toBe("hotel-new")
    expect(params.get("roomTypeId")).toBe("room-type-2")
    expect(params.get("genderType")).toBe("FEMALE")
    expect(params.get("familyGroupId")).toBeNull()
    expect(params.get("location")).toBe("Rotterdam")
    expect(params.get("allocationPriority")).toBe("LOW")
    expect(params.get("hasPriority")).toBe("true")
  })

  it("returns the one-based page containing a room intent", () => {
    const roomIds = ["room-1", "room-2", "room-3", "room-4", "room-5"]
    expect(getRoomPageForRoomId(roomIds, "room-1", 2)).toBe(1)
    expect(getRoomPageForRoomId(roomIds, "room-5", 2)).toBe(3)
    expect(getRoomPageForRoomId(roomIds, "missing", 2)).toBeNull()
    expect(getRoomPageForRoomId(roomIds, "room-1", 0)).toBeNull()
  })
})
