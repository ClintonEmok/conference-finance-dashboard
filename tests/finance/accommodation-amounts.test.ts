import { describe, expect, it } from "vitest"

import {
  buildAccommodationPriceSnapshot,
  deriveAccommodationAmount,
  type AccommodationPriceSnapshot,
} from "@/lib/domain/finance/accommodation-amounts"

const BASE_SELECTION = {
  attendeeId: "attendee_1",
  categoryCode: "standard",
  occupancy: "shared",
  upgradeSelected: false,
  cotSelected: false,
  ageBandCode: "18_plus",
  nightCount: 2,
}

const BASE_PRICING = {
  baseRatePerNightMinor: 3000, // €30/night
  superiorUpgradePriceMinor: 1500, // €15/night
  cotPriceMinor: 500, // €5/night
  ticketAccommodationIncluded: false,
  eventBaseNights: 2,
}

describe("accommodation amounts - locked pricing formula", () => {
  it("charges every night at the base rate when the ticket does not include accommodation", () => {
    const result = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: BASE_PRICING,
    })

    expect(result.totalMinor).toBe(6000) // 2 nights × €30
    expect(result.lines).toEqual([
      {
        kind: "accommodation",
        label: "Accommodation",
        nights: 2,
        ratePerNightMinor: 3000,
        chargeMinor: 6000,
      },
    ])
  })

  it("covers the base nights when the ticket includes accommodation and charges only extra nights", () => {
    const result = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, nightCount: 3 },
      pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
    })

    expect(result.totalMinor).toBe(3000) // (3 − 2) nights × €30
    expect(result.lines).toEqual([
      {
        kind: "accommodation",
        label: "Accommodation",
        nights: 1,
        ratePerNightMinor: 3000,
        chargeMinor: 3000,
      },
    ])
  })

  it("charges nothing for a stay shorter than the covered nights", () => {
    const result = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, nightCount: 1 },
      pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
    })

    expect(result.totalMinor).toBe(0)
    expect(result.lines).toEqual([])
  })

  it("adds the superior-upgrade charge on top of the standard base rate", () => {
    const result = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, upgradeSelected: true },
      pricing: BASE_PRICING,
    })

    expect(result.totalMinor).toBe(9000) // base 6000 + upgrade 2 × €15
    expect(result.lines).toEqual([
      {
        kind: "accommodation",
        label: "Accommodation",
        nights: 2,
        ratePerNightMinor: 3000,
        chargeMinor: 6000,
      },
      {
        kind: "superior_upgrade",
        label: "Superior upgrade",
        nights: 2,
        ratePerNightMinor: 1500,
        chargeMinor: 3000,
      },
    ])
  })

  it("never double-charges the superior rate when the selected rate already is superior", () => {
    const result = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        categoryCode: "superior",
        upgradeSelected: true,
      },
      pricing: BASE_PRICING,
    })

    expect(result.totalMinor).toBe(6000) // only the superior base rate
    expect(result.lines).toEqual([
      {
        kind: "accommodation",
        label: "Accommodation",
        nights: 2,
        ratePerNightMinor: 3000,
        chargeMinor: 6000,
      },
    ])
  })

  it("charges the cot only when selected and the attendee is under 3", () => {
    const withCot = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, cotSelected: true, ageBandCode: "under_3" },
      pricing: BASE_PRICING,
    })

    expect(withCot.totalMinor).toBe(7000) // base 6000 + cot 2 × €5
    expect(withCot.lines).toHaveLength(2)
    expect(withCot.lines[1]).toMatchObject({
      kind: "cot",
      label: "Cot",
      nights: 2,
      ratePerNightMinor: 500,
      chargeMinor: 1000,
    })

    const ineligibleBand = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, cotSelected: true, ageBandCode: "3_11" },
      pricing: BASE_PRICING,
    })

    expect(ineligibleBand.totalMinor).toBe(6000)
    expect(ineligibleBand.lines.some((line) => line.kind === "cot")).toBe(false)
  })

  it("supports explicit €0 base, upgrade and cot rates", () => {
    const result = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, upgradeSelected: true, cotSelected: true, ageBandCode: "under_3" },
      pricing: {
        baseRatePerNightMinor: 0,
        superiorUpgradePriceMinor: 0,
        cotPriceMinor: 0,
        ticketAccommodationIncluded: false,
        eventBaseNights: 2,
      },
    })

    expect(result.totalMinor).toBe(0)
    expect(result.lines).toEqual([])
  })

  it("contributes €0 when config, rate or selection data is missing", () => {
    const missingEverything = deriveAccommodationAmount({
      selection: { attendeeId: "attendee_1" },
      pricing: {},
    })
    expect(missingEverything.totalMinor).toBe(0)
    expect(missingEverything.lines).toEqual([])

    const missingRate = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: { ...BASE_PRICING, baseRatePerNightMinor: undefined },
    })
    expect(missingRate.totalMinor).toBe(0)
    expect(missingRate.lines).toEqual([])

    const missingNights = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, nightCount: undefined },
      pricing: BASE_PRICING,
    })
    expect(missingNights.totalMinor).toBe(0)
    expect(missingNights.lines).toEqual([])
  })

  it("normalizes malformed, negative and fractional inputs to safe values", () => {
    const result = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        nightCount: -2,
        upgradeSelected: true,
        cotSelected: true,
        ageBandCode: "under_3",
      },
      pricing: {
        baseRatePerNightMinor: -5000,
        superiorUpgradePriceMinor: 15.5,
        cotPriceMinor: Number.NaN,
        ticketAccommodationIncluded: false,
        eventBaseNights: 1.5,
      },
    })

    // base -5000 → 0; upgrade 15.5 → 15 × 0 nights = 0; cot NaN → 0
    expect(result.totalMinor).toBe(0)
  })

  it("accumulates per-attendee contributions", () => {
    const first = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: BASE_PRICING,
    })
    const second = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, attendeeId: "attendee_2", nightCount: 1 },
      pricing: BASE_PRICING,
    })

    expect(first.totalMinor + second.totalMinor).toBe(9000)
  })

  it("keeps a confirmed snapshot fixed when live config values change", () => {
    const snapshot: AccommodationPriceSnapshot =
      buildAccommodationPriceSnapshot({
        selection: { ...BASE_SELECTION, nightCount: 3 },
        pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
      })

    expect(snapshot).toEqual({
      baseRatePerNightMinor: 3000,
      upgradeRatePerNightMinor: 1500,
      cotRatePerNightMinor: 500,
      totalNights: 3,
      coveredNights: 2,
    })

    const confirmed = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: {
        // Live config changed after confirmation: rate doubled, nights changed.
        baseRatePerNightMinor: 6000,
        superiorUpgradePriceMinor: 3000,
        cotPriceMinor: 1000,
        ticketAccommodationIncluded: false,
        eventBaseNights: 1,
      },
      snapshot,
    })

    expect(confirmed.totalMinor).toBe(3000) // (3 − 2) × €30 snapshot rate
    expect(confirmed.lines[0]).toMatchObject({
      nights: 1,
      ratePerNightMinor: 3000,
      chargeMinor: 3000,
    })
  })

  it("builds a snapshot with the exact resolved rates and nights", () => {
    const snapshot = buildAccommodationPriceSnapshot({
      selection: { ...BASE_SELECTION, nightCount: 4 },
      pricing: {
        ...BASE_PRICING,
        ticketAccommodationIncluded: true,
        baseRatePerNightMinor: 2500,
      },
    })

    expect(snapshot).toEqual({
      baseRatePerNightMinor: 2500,
      upgradeRatePerNightMinor: 1500,
      cotRatePerNightMinor: 500,
      totalNights: 4,
      coveredNights: 2,
    })
  })
})
