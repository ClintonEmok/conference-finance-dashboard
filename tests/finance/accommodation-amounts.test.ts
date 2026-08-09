import { describe, expect, it } from "vitest"

import {
  buildAccommodationPriceSnapshot,
  deriveAccommodationAmount,
  deriveOptionChargeMinor,
  isCompleteAccommodationPriceSnapshot,
  type AccommodationPriceSnapshot,
} from "@/lib/domain/finance/accommodation-amounts"

const BASE_SELECTION = {
  attendeeId: "attendee_1",
  categoryCode: "standard",
  occupancy: "shared",
  nightCount: 2,
}

const BASE_PRICING = {
  baseRatePerNightMinor: 3000, // €30/night
  options: [
    { optionKey: "cot", label: "Cot", pricePerUnitMinor: 500, unit: "per_night" as const }, // €5/unit/night
    { optionKey: "parking", label: "Parking pass", pricePerUnitMinor: 2000, unit: "per_night" as const }, // €20/unit/night
  ],
  ticketAccommodationIncluded: false,
  eventBaseNights: 2,
}

const COT_SELECTION = {
  attendeeId: "attendee_1",
  categoryCode: "standard",
  occupancy: "shared",
  nightCount: 2,
  optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
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

  it("prices night-before occupancy independently from the main-stay occupancy", () => {
    const result = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        occupancy: "single",
        nightCount: 3,
        nightBeforeLevel: "standard",
        nightBeforeOccupancy: "shared",
      },
      pricing: {
        ...BASE_PRICING,
        baseRatePerNightMinor: 4000,
        nightBeforeRatePerNightMinor: 3000,
        ticketAccommodationIncluded: true,
      },
    })

    expect(result.totalMinor).toBe(3000)
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

  it("charges exactly max(0, selectedTotalNights - coveredBaseNights) for an extended stay", () => {
    // Included ticket + event base 2: the extended-stay choice is expressed
    // as total nights, and only the charged nights beyond the covered base
    // are priced (one extra night and two extra nights).
    const oneExtra = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, nightCount: 3 },
      pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
    })
    expect(oneExtra.totalMinor).toBe(3000) // max(0, 3 − 2) × €30
    expect(oneExtra.lines[0]).toMatchObject({ nights: 1, chargeMinor: 3000 })

    const twoExtra = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, nightCount: 4 },
      pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
    })
    expect(twoExtra.totalMinor).toBe(6000) // max(0, 4 − 2) × €30
    expect(twoExtra.lines[0]).toMatchObject({ nights: 2, chargeMinor: 6000 })

    // Selecting exactly the covered base contributes €0 with no line.
    const baseOnly = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
    })
    expect(baseOnly.totalMinor).toBe(0) // max(0, 2 − 2) × €30
    expect(baseOnly.lines).toEqual([])
  })

  it("charges nothing for a stay shorter than the covered nights", () => {
    const result = deriveAccommodationAmount({
      selection: { ...BASE_SELECTION, nightCount: 1 },
      pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
    })

    expect(result.totalMinor).toBe(0)
    expect(result.lines).toEqual([])
  })

  it("prices a per-night option by unit × quantity × nights", () => {
    const result = deriveAccommodationAmount({
      selection: COT_SELECTION,
      pricing: BASE_PRICING,
    })

    expect(result.totalMinor).toBe(7000) // base 6000 + cot 2 × 1 × €5
    expect(result.lines).toEqual([
      {
        kind: "accommodation",
        label: "Accommodation",
        nights: 2,
        ratePerNightMinor: 3000,
        chargeMinor: 6000,
      },
      {
        kind: "option",
        optionKey: "cot",
        label: "Cot",
        nights: 2,
        quantity: 1,
        ratePerNightMinor: 500,
        chargeMinor: 1000,
      },
    ])
  })

  it("prices a per-person option by price × quantity, ignoring nights", () => {
    const result = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        optionSelections: [
          { optionKey: "welcome_dinner", quantity: 2, nights: 2 },
        ],
      },
      pricing: {
        ...BASE_PRICING,
        options: [
          {
            optionKey: "welcome_dinner",
            label: "Welcome dinner",
            pricePerUnitMinor: 2500,
            unit: "per_person",
          },
        ],
      },
    })

    // base 2 × €30 = 6000 + welcome dinner 2 × €25 = 5000 (nights are NOT
    // multiplied for a per-person option — charging nights would overcharge).
    expect(result.totalMinor).toBe(11000)
    expect(result.lines).toContainEqual({
      kind: "option",
      optionKey: "welcome_dinner",
      label: "Welcome dinner",
      nights: 2,
      quantity: 2,
      ratePerNightMinor: 2500,
      chargeMinor: 5000,
    })
  })

  it("builds a snapshot for a per-person option with the exact charge", () => {
    const snapshot = buildAccommodationPriceSnapshot({
      selection: {
        ...BASE_SELECTION,
        optionSelections: [
          { optionKey: "welcome_dinner", quantity: 2, nights: 2 },
        ],
      },
      pricing: {
        ...BASE_PRICING,
        options: [
          {
            optionKey: "welcome_dinner",
            label: "Welcome dinner",
            pricePerUnitMinor: 2500,
            unit: "per_person",
          },
        ],
      },
    })

    expect(snapshot.optionLines).toEqual([
      {
        optionKey: "welcome_dinner",
        label: "Welcome dinner",
        pricePerUnitMinor: 2500,
        quantity: 2,
        nights: 2,
        chargeMinor: 5000,
      },
    ])
  })

  it("fails closed on an unknown or absent option unit instead of guessing per_night", () => {
    expect(() =>
      deriveOptionChargeMinor({
        pricePerUnitMinor: 500,
        quantity: 1,
        nights: 2,
        unit: "per_week" as never,
      })
    ).toThrow(/unknown unit/)

    expect(() =>
      deriveOptionChargeMinor({
        pricePerUnitMinor: 500,
        quantity: 1,
        nights: 2,
        unit: undefined as never,
      })
    ).toThrow(/unknown unit/)

    // Resolution of a selected option whose pricing entry carries an invalid
    // unit also fails closed (the live and snapshot paths both resolve through
    // `resolveSelectedOptions`).
    expect(() =>
      deriveAccommodationAmount({
        selection: COT_SELECTION,
        pricing: {
          ...BASE_PRICING,
          options: [
            {
              optionKey: "cot",
              label: "Cot",
              pricePerUnitMinor: 500,
              unit: "per_week" as never,
            },
          ],
        },
      })
    ).toThrow(/unknown unit/)
  })

  it("prices multiple units and multiple options independently", () => {
    const result = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        optionSelections: [
          { optionKey: "cot", quantity: 2, nights: 3 },
          { optionKey: "parking", quantity: 1, nights: 2 },
        ],
      },
      pricing: BASE_PRICING,
    })

    expect(result.totalMinor).toBe(
      6000 + // base 2 × €30
        3000 + // cot 2 units × 3 nights × €5
        4000 // parking 1 × 2 nights × €20
    )
    expect(result.lines.map((line) => line.optionKey)).toEqual([
      undefined,
      "cot",
      "parking",
    ])
  })

  it("ignores an option that is no longer enabled in the live event config", () => {
    const result = deriveAccommodationAmount({
      selection: COT_SELECTION,
      pricing: {
        ...BASE_PRICING,
        options: [{ optionKey: "parking", label: "Parking pass", pricePerUnitMinor: 2000, unit: "per_night" }],
      },
    })

    expect(result.totalMinor).toBe(6000)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].kind).toBe("accommodation")
  })

  it("supports explicit €0 base and option rates", () => {
    const result = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
      },
      pricing: {
        baseRatePerNightMinor: 0,
        options: [{ optionKey: "cot", label: "Cot", pricePerUnitMinor: 0, unit: "per_night" }],
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
        optionSelections: [
          { optionKey: "cot", quantity: -1, nights: 2 },
          { optionKey: "parking", quantity: 1.5, nights: 1.5 },
        ],
      },
      pricing: {
        baseRatePerNightMinor: -5000,
        options: [
          { optionKey: "cot", label: "Cot", pricePerUnitMinor: Number.NaN, unit: "per_night" },
          { optionKey: "parking", label: "Parking pass", pricePerUnitMinor: 2000, unit: "per_night" },
        ],
        ticketAccommodationIncluded: false,
        eventBaseNights: 1.5,
      },
    })

    // base -5000 → 0; cot NaN → 0; parking quantity 1.5 → 1 × nights 1.5 → 1 × 2000 = 2000
    expect(result.totalMinor).toBe(2000)
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
        selection: {
          ...BASE_SELECTION,
          nightCount: 3,
          optionSelections: [{ optionKey: "cot", quantity: 1, nights: 3 }],
        },
        pricing: { ...BASE_PRICING, ticketAccommodationIncluded: true },
      })

    expect(snapshot).toEqual({
      baseRatePerNightMinor: 3000,
      totalNights: 3,
      coveredNights: 2,
      optionLines: [
        {
          optionKey: "cot",
          label: "Cot",
          pricePerUnitMinor: 500,
          quantity: 1,
          nights: 3,
          chargeMinor: 1500,
        },
      ],
    })

    const confirmed = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: {
        // Live config changed after confirmation: rate doubled, nights changed.
        baseRatePerNightMinor: 6000,
        options: [
          { optionKey: "cot", label: "Cot", pricePerUnitMinor: 1000, unit: "per_night" },
        ],
        ticketAccommodationIncluded: false,
        eventBaseNights: 1,
      },
      snapshot,
    })

    expect(confirmed.totalMinor).toBe(4500) // (3 − 2) × €30 + cot 3 × €5
    expect(confirmed.lines[0]).toMatchObject({
      nights: 1,
      ratePerNightMinor: 3000,
      chargeMinor: 3000,
    })
    expect(confirmed.lines[1]).toMatchObject({
      optionKey: "cot",
      nights: 3,
      quantity: 1,
      ratePerNightMinor: 500,
      chargeMinor: 1500,
    })
  })

  it("builds a snapshot with the exact resolved rates and nights", () => {
    const snapshot = buildAccommodationPriceSnapshot({
      selection: {
        ...BASE_SELECTION,
        nightCount: 4,
        optionSelections: [{ optionKey: "parking", quantity: 1, nights: 4 }],
      },
      pricing: {
        ...BASE_PRICING,
        ticketAccommodationIncluded: true,
        baseRatePerNightMinor: 2500,
      },
    })

    expect(snapshot).toEqual({
      baseRatePerNightMinor: 2500,
      totalNights: 4,
      coveredNights: 2,
      optionLines: [
        {
          optionKey: "parking",
          label: "Parking pass",
          pricePerUnitMinor: 2000,
          quantity: 1,
          nights: 4,
          chargeMinor: 8000,
        },
      ],
    })
  })

  it("keeps a confirmed snapshot fixed when live selection flags change", () => {
    const snapshot: AccommodationPriceSnapshot =
      buildAccommodationPriceSnapshot({
        selection: COT_SELECTION,
        pricing: BASE_PRICING,
      })

    expect(snapshot).toEqual({
      baseRatePerNightMinor: 3000,
      totalNights: 2,
      coveredNights: 0,
      optionLines: [
        {
          optionKey: "cot",
          label: "Cot",
          pricePerUnitMinor: 500,
          quantity: 1,
          nights: 2,
          chargeMinor: 1000,
        },
      ],
    })

    // The live selection is edited after confirmation: cot removed, category
    // changed. None of this may change the confirmed amount.
    const confirmed = deriveAccommodationAmount({
      selection: {
        ...BASE_SELECTION,
        categoryCode: "superior",
        optionSelections: [],
      },
      pricing: BASE_PRICING,
      snapshot,
    })

    expect(confirmed.totalMinor).toBe(7000) // base 6000 + cot 1000, unchanged
    expect(confirmed.lines.map((line) => line.kind)).toEqual([
      "accommodation",
      "option",
    ])
  })

  it("returns the persisted snapshot untouched for a confirmed row", () => {
    const snapshot: AccommodationPriceSnapshot =
      buildAccommodationPriceSnapshot({
        selection: { ...BASE_SELECTION, nightCount: 4 },
        pricing: BASE_PRICING,
      })

    const confirmed = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: {
        // Live config changed after confirmation; it must not leak into the
        // returned snapshot.
        baseRatePerNightMinor: 9999,
        options: [
          { optionKey: "cot", label: "Cot", pricePerUnitMinor: 9999, unit: "per_night" },
        ],
        ticketAccommodationIncluded: false,
        eventBaseNights: 9,
      },
      snapshot,
    })

    expect(confirmed.snapshot).toBe(snapshot)
    expect(confirmed.snapshot).toEqual(snapshot)
  })

  it("rejects an incomplete persisted snapshot as not complete", () => {
    const complete = buildAccommodationPriceSnapshot({
      selection: BASE_SELECTION,
      pricing: BASE_PRICING,
    })
    expect(isCompleteAccommodationPriceSnapshot(complete)).toBe(true)

    expect(isCompleteAccommodationPriceSnapshot(null)).toBe(false)
    expect(isCompleteAccommodationPriceSnapshot({})).toBe(false)

    const incompleteOptionLines = {
      baseRatePerNightMinor: 3000,
      totalNights: 2,
      coveredNights: 0,
      optionLines: [
        {
          optionKey: "cot",
          // missing label / price / quantity / nights / charge
        },
      ],
    }
    expect(isCompleteAccommodationPriceSnapshot(incompleteOptionLines)).toBe(false)
  })

  it("accepts a legacy v5 boolean snapshot as complete and prices it via the legacy branch", () => {
    const legacySnapshot = {
      baseRatePerNightMinor: 3000,
      upgradeRatePerNightMinor: 1500,
      cotRatePerNightMinor: 500,
      totalNights: 2,
      coveredNights: 0,
      categoryIsSuperior: false,
      upgradeSelected: true,
      cotSelected: true,
    }
    expect(isCompleteAccommodationPriceSnapshot(legacySnapshot)).toBe(true)

    const confirmed = deriveAccommodationAmount({
      selection: BASE_SELECTION,
      pricing: BASE_PRICING,
      snapshot: legacySnapshot as AccommodationPriceSnapshot,
    })

    // base 6000 + upgrade 2 × €15 + cot 2 × €5
    expect(confirmed.totalMinor).toBe(10000)
  })
})
