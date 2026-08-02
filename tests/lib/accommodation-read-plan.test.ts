import { describe, expect, it } from "vitest"

import { createAccommodationReadPlan } from "@/lib/dashboard/accommodation-read-plan"

const noFilters = {
  hotelId: null,
  roomTypeId: null,
  genderType: null,
  familyGroupId: null,
  location: null,
  allocationPriority: null,
  hasPriority: null,
} as const

describe("accommodation read plan", () => {
  it("does not issue operational reads for disabled events", () => {
    expect(
      createAccommodationReadPlan({
        enabled: false,
        activeTab: "allocation",
        filters: noFilters,
      })
    ).toMatchObject({
      mode: "disabled",
      readAttentionBoard: false,
      readDetailBoard: false,
    })
  })

  it("keeps Hotels attention-only and does not mount allocation detail reads", () => {
    expect(
      createAccommodationReadPlan({
        enabled: true,
        activeTab: "hotels",
        filters: noFilters,
      })
    ).toMatchObject({
      mode: "hotels",
      readAttentionBoard: true,
      readDetailBoard: false,
      reuseParentBoard: false,
    })
  })

  it("reuses the shared board for the default Allocation tab", () => {
    expect(
      createAccommodationReadPlan({
        enabled: true,
        activeTab: "allocation",
        filters: noFilters,
      })
    ).toMatchObject({
      mode: "allocation-default",
      readAttentionBoard: true,
      readDetailBoard: false,
      reuseParentBoard: true,
    })
  })

  it("requires a distinct detail read for filter or room intent", () => {
    expect(
      createAccommodationReadPlan({
        enabled: true,
        activeTab: "allocation",
        filters: { ...noFilters, location: "Amsterdam" },
      }).mode
    ).toBe("allocation-filtered")
    expect(
      createAccommodationReadPlan({
        enabled: true,
        activeTab: "allocation",
        filters: noFilters,
        roomId: "room-42",
      })
    ).toMatchObject({ readDetailBoard: true, reuseParentBoard: false })
  })
})
