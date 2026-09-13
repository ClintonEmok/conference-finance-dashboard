import { describe, expect, it } from "vitest"

import {
  resolvePlacementEligibility,
  resolveRequiresBed,
} from "../../convex/accommodationBedRequirement"

const noEvidence = {
  hasAccommodationSelection: false,
  hasAllocatedRoomType: false,
  hasAssignedRoom: false,
}

describe("bed requirement resolution", () => {
  it("treats explicit true as one bed", () => {
    expect(resolveRequiresBed({ requiresBed: true })).toBe(true)
  })

  it("treats explicit false as no bed", () => {
    expect(resolveRequiresBed({ requiresBed: false })).toBe(false)
  })

  it("defaults missing ticket metadata to one bed", () => {
    expect(resolveRequiresBed({})).toBe(true)
    expect(resolveRequiresBed(null)).toBe(true)
  })

  it("keeps a ticket-only attendee out of placement", () => {
    expect(
      resolvePlacementEligibility({
        ticket: { requiresBed: true, accommodationIncluded: false },
        evidence: noEvidence,
      })
    ).toMatchObject({ placementEligible: false, requiresBed: false, source: "ineligible" })
  })

  it("keeps an accommodation-bearing no-bed attendee eligible", () => {
    expect(
      resolvePlacementEligibility({
        ticket: { requiresBed: false, accommodationIncluded: true },
        evidence: noEvidence,
      })
    ).toMatchObject({ placementEligible: true, requiresBed: false, source: "ticket" })
  })

  it("uses selection evidence when the ticket entitlement is legacy or absent", () => {
    expect(
      resolvePlacementEligibility({
        ticket: null,
        evidence: { ...noEvidence, hasAccommodationSelection: true },
      })
    ).toMatchObject({ placementEligible: true, requiresBed: true, source: "legacy-fallback" })
  })

  it("preserves assigned-room legacy records as one-bed occupants", () => {
    expect(
      resolvePlacementEligibility({
        ticket: { accommodationIncluded: false },
        evidence: { ...noEvidence, hasAssignedRoom: true },
      })
    ).toMatchObject({ placementEligible: true, requiresBed: true, source: "legacy-fallback" })
  })
})
