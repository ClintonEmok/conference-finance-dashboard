import { describe, expect, it } from "vitest"

import {
  appendSignalFiltersToQuery,
  normalizeSignalFilters,
  readSignalFiltersFromSearchParams,
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
})
