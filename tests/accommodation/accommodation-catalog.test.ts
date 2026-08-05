import { describe, expect, it } from "vitest"

import schema from "@/convex/schema"
import {
  DAY_MS,
  EVENT_OPTION_DEFAULT_PRICE_MINOR,
  LOCKED_AGE_BAND_BOUNDS,
  deriveActiveCategoryIds,
  deriveInitialStayWindow,
  deriveNightCount,
  deriveResourceSellableBeds,
  isAccommodationIncluded,
  isCotEligibilityValid,
  isValidAgeBandBounds,
  isValidAgeBandRange,
  resolveEventOptionPriceMinor,
} from "@/convex/accommodation"

type TableDef = {
  validator: { fields: Record<string, unknown> }
  " indexes"(): Array<{ indexDescriptor: string; fields: string[] }>
}

function table(name: string): TableDef {
  const tables = schema.tables as unknown as Record<string, TableDef>
  const def = tables[name]
  if (!def) {
    throw new Error(`Schema table "${name}" is missing`)
  }
  return def
}

function indexNames(def: TableDef): string[] {
  return def[" indexes"]().map((index) => index.indexDescriptor)
}

describe("deriveNightCount", () => {
  it("derives one night for the initial one-night-before-event window", () => {
    expect(deriveNightCount(0, DAY_MS)).toBe(1)
  })

  it("derives the exact night count for multi-night windows", () => {
    expect(deriveNightCount(0, 3 * DAY_MS)).toBe(3)
  })

  it("rounds partial-day stays to whole nights", () => {
    expect(deriveNightCount(0, DAY_MS + 6 * 60 * 60 * 1000)).toBe(1)
    expect(deriveNightCount(0, 2 * DAY_MS + 6 * 60 * 60 * 1000)).toBe(2)
  })

  it("rejects invalid and non-positive ranges", () => {
    expect(() => deriveNightCount(1000, 1000)).toThrow(
      "check-out must be after check-in"
    )
    expect(() => deriveNightCount(1000, 999)).toThrow(
      "check-out must be after check-in"
    )
    expect(() => deriveNightCount(Number.NaN, 2000)).toThrow(
      "timestamps must be finite"
    )
  })
})

describe("deriveInitialStayWindow", () => {
  it("initializes the locked one-night-before-event window", () => {
    const startsAt = 1_750_000_000_000
    const window = deriveInitialStayWindow(startsAt)
    expect(window.baseCheckInAt).toBe(startsAt - DAY_MS)
    expect(window.baseCheckOutAt).toBe(startsAt)
    expect(deriveNightCount(window.baseCheckInAt, window.baseCheckOutAt)).toBe(1)
  })

  it("rejects a non-finite event start time", () => {
    expect(() => deriveInitialStayWindow(Number.NaN)).toThrow(
      "Invalid event start time"
    )
  })
})

describe("deriveResourceSellableBeds", () => {
  it("derives sellable beds as room count × room type defaultCapacity", () => {
    expect(
      deriveResourceSellableBeds({
        count: 3,
        kind: "room",
        roomTypeDefaultCapacity: 2,
      })
    ).toBe(6)
  })

  it("counts cot resources one bed per item without a room type", () => {
    expect(
      deriveResourceSellableBeds({
        count: 5,
        kind: "cot",
        roomTypeDefaultCapacity: null,
      })
    ).toBe(5)
    expect(deriveResourceSellableBeds({ count: 4, kind: "cot" })).toBe(4)
  })

  it("throws for room resources without a linked room type capacity", () => {
    expect(() =>
      deriveResourceSellableBeds({ count: 3, kind: "room" })
    ).toThrow(/linked room type/)
    expect(() =>
      deriveResourceSellableBeds({
        count: 3,
        kind: "room",
        roomTypeDefaultCapacity: null,
      })
    ).toThrow(/linked room type/)
  })
})

describe("resolveEventOptionPriceMinor", () => {
  it("defaults omitted upgrade/cot prices to €10 (1000 minor units)", () => {
    expect(resolveEventOptionPriceMinor(undefined)).toBe(
      EVENT_OPTION_DEFAULT_PRICE_MINOR
    )
    expect(resolveEventOptionPriceMinor(null)).toBe(
      EVENT_OPTION_DEFAULT_PRICE_MINOR
    )
  })

  it("preserves explicit €0 and other supplied prices", () => {
    expect(resolveEventOptionPriceMinor(0)).toBe(0)
    expect(resolveEventOptionPriceMinor(1500)).toBe(1500)
  })
})

describe("deriveActiveCategoryIds", () => {
  it("derives distinct category ids from rate rows, preserving order", () => {
    expect(
      deriveActiveCategoryIds([
        { categoryId: "cat-a" },
        { categoryId: "cat-b" },
        { categoryId: "cat-a" },
        { categoryId: "cat-c" },
      ])
    ).toEqual(["cat-a", "cat-b", "cat-c"])
  })

  it("returns an empty list when no rate rows exist", () => {
    expect(deriveActiveCategoryIds([])).toEqual([])
  })
})

describe("isAccommodationIncluded", () => {
  it("treats absent accommodationIncluded as false", () => {
    expect(isAccommodationIncluded({})).toBe(false)
    expect(isAccommodationIncluded({ accommodationIncluded: null })).toBe(false)
    expect(isAccommodationIncluded({ accommodationIncluded: false })).toBe(false)
  })

  it("returns true only for an explicit true flag", () => {
    expect(isAccommodationIncluded({ accommodationIncluded: true })).toBe(true)
  })
})

describe("isCotEligibilityValid", () => {
  it("enforces under_3 eligibility for the cot option", () => {
    expect(
      isCotEligibilityValid({
        optionCode: "cot",
        eligibilityAgeBandCode: "under_3",
      })
    ).toBe(true)
    expect(
      isCotEligibilityValid({
        optionCode: "cot",
        eligibilityAgeBandCode: "3_11",
      })
    ).toBe(false)
    expect(
      isCotEligibilityValid({ optionCode: "cot", eligibilityAgeBandCode: null })
    ).toBe(false)
  })

  it("rejects age-band eligibility on non-cot options", () => {
    expect(
      isCotEligibilityValid({
        optionCode: "superior_upgrade",
        eligibilityAgeBandCode: "under_3",
      })
    ).toBe(false)
    expect(
      isCotEligibilityValid({
        optionCode: "superior_upgrade",
        eligibilityAgeBandCode: null,
      })
    ).toBe(true)
  })
})

describe("isValidAgeBandRange", () => {
  it("accepts the locked age-band boundaries", () => {
    expect(isValidAgeBandRange(0, 3)).toBe(true)
    expect(isValidAgeBandRange(3, 11)).toBe(true)
    expect(isValidAgeBandRange(12, 17)).toBe(true)
    expect(isValidAgeBandRange(18, null)).toBe(true)
    expect(isValidAgeBandRange(18, undefined)).toBe(true)
  })

  it("rejects negative ages, inverted bounds, and non-integers", () => {
    expect(isValidAgeBandRange(-1, 3)).toBe(false)
    expect(isValidAgeBandRange(5, 3)).toBe(false)
    expect(isValidAgeBandRange(1.5, 3)).toBe(false)
    expect(isValidAgeBandRange(0, 3.5)).toBe(false)
  })
})

describe("isValidAgeBandBounds", () => {
  it("accepts the exact locked tuple for every band code", () => {
    for (const [code, { minAge, maxAge }] of Object.entries(
      LOCKED_AGE_BAND_BOUNDS
    )) {
      expect(isValidAgeBandBounds(code, minAge, maxAge)).toBe(true)
    }
    expect(isValidAgeBandBounds("18_plus", 18, undefined)).toBe(true)
  })

  it("rejects a code whose numeric bounds do not match its locked tuple", () => {
    // under_3 with an adult minAge must not pass even though it is a valid
    // generic range — cot eligibility is derived from the code alone.
    expect(isValidAgeBandBounds("under_3", 18, 3)).toBe(false)
    expect(isValidAgeBandBounds("under_3", 0, 5)).toBe(false)
    expect(isValidAgeBandBounds("3_11", 0, 3)).toBe(false)
    expect(isValidAgeBandBounds("12_17", 12, 18)).toBe(false)
    // 18+ may not carry a finite maximum.
    expect(isValidAgeBandBounds("18_plus", 18, 21)).toBe(false)
    // Unknown codes are rejected outright.
    expect(isValidAgeBandBounds("unknown", 0, 3)).toBe(false)
  })
})

describe("Phase 39 schema contract", () => {
  it("defines every required catalog, config, and selection table", () => {
    for (const name of [
      "accommodationCategories",
      "accommodationOptions",
      "accommodationAgeBands",
      "eventAccommodationConfig",
      "eventAccommodationRates",
      "eventAccommodationOptions",
      "eventAccommodationResources",
      "eventAccommodationAgePricing",
      "orderAccommodationSelections",
    ]) {
      expect(() => table(name)).not.toThrow()
    }
  })

  it("models breakfast at the event level, never per rate", () => {
    const configFields = table("eventAccommodationConfig").validator.fields
    const rateFields = table("eventAccommodationRates").validator.fields

    expect(configFields.breakfastIncluded).toBeDefined()
    expect(rateFields.breakfastIncluded).toBeUndefined()
  })

  it("derives active categories from rate rows with no stored activation list or flag", () => {
    const configFields = table("eventAccommodationConfig").validator.fields
    expect(configFields.activeCategories).toBeUndefined()
    expect(configFields.isActive).toBeUndefined()

    expect(deriveActiveCategoryIds).toBeTypeOf("function")
  })

  it("stores full per-person-per-night rates, not upgrade deltas", () => {
    const rateFields = table("eventAccommodationRates").validator.fields
    expect(rateFields.pricePerPersonMinor).toBeDefined()
    expect(rateFields.upgradeDeltaMinor).toBeUndefined()
  })

  it("adds optional room-type and ticket-type catalog fields without breaking legacy rows", () => {
    const roomTypeFields = table("accommodationRoomTypes").validator.fields
    expect(roomTypeFields.count).toBeDefined()
    expect(roomTypeFields.description).toBeDefined()
    expect(roomTypeFields.categoryId).toBeDefined()

    const ticketTypeFields = table("ticketTypes").validator.fields
    expect(ticketTypeFields.accommodationIncluded).toBeDefined()
  })

  it("keeps order selections free of price snapshots and slot/assignment reuse", () => {
    const selectionFields = table("orderAccommodationSelections").validator.fields
    expect(selectionFields.orderId).toBeDefined()
    expect(selectionFields.attendeeId).toBeDefined()
    expect(selectionFields.upgradeSelected).toBeDefined()
    expect(selectionFields.cotSelected).toBeDefined()
    expect(selectionFields.nightCount).toBeDefined()

    expect(selectionFields.priceMinor).toBeUndefined()
    expect(selectionFields.pricePerPersonMinor).toBeUndefined()
    expect(selectionFields.slotId).toBeUndefined()
    expect(selectionFields.assignedRoomId).toBeUndefined()
  })

  it("defines by_eventId lookup and upsert-identity indexes on event-scoped tables", () => {
    expect(indexNames(table("eventAccommodationConfig"))).toContain(
      "by_eventId"
    )
    expect(indexNames(table("eventAccommodationRates"))).toEqual(
      expect.arrayContaining([
        "by_eventId",
        "by_eventId_and_categoryId",
        "by_eventId_and_categoryId_and_occupancy",
      ])
    )
    expect(indexNames(table("eventAccommodationOptions"))).toEqual(
      expect.arrayContaining([
        "by_eventId",
        "by_eventId_and_optionId",
        "by_eventId_and_enabled",
      ])
    )
    expect(indexNames(table("eventAccommodationResources"))).toEqual(
      expect.arrayContaining(["by_eventId", "by_eventId_and_kind"])
    )
    expect(indexNames(table("eventAccommodationAgePricing"))).toEqual(
      expect.arrayContaining([
        "by_eventId",
        "by_eventId_and_ageBandCode",
      ])
    )
    expect(indexNames(table("orderAccommodationSelections"))).toEqual(
      expect.arrayContaining(["by_orderId", "by_attendeeId"])
    )
  })
})
