import { internalMutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

const DAY_MS = 24 * 60 * 60 * 1000

type CategorySeed = {
  code: "standard" | "superior" | "family"
  label: string
  description: string
  sortOrder: number
}

type OptionSeed = {
  code: "superior_upgrade" | "cot"
  label: string
  description: string
  kind: "addon" | "upgrade" | "eligibility"
  unit: "per_night" | "per_person"
}

type AgeBandSeed = {
  code: "under_3" | "3_11" | "12_17" | "18_plus"
  label: string
  minAge: number
  maxAge: number | null
  sortOrder: number
}

type RoomTypeSeed = {
  label: string
  defaultCapacity: number
  count: number
  description: string
  categoryCode: "standard" | "superior" | "family"
}

type RateSeed = {
  categoryCode: "standard" | "superior"
  occupancy: "single" | "shared"
  pricePerPersonMinor: number
}

const CATEGORIES: CategorySeed[] = [
  {
    code: "standard",
    label: "Standard",
    description:
      "Standard rooms with the essential amenities. Choose single occupancy for a room to yourself, or shared to share with another attendee.",
    sortOrder: 0,
  },
  {
    code: "superior",
    label: "Superior",
    description:
      "Superior rooms with upgraded comfort and amenities. Available as a paid upgrade from Standard, or chosen directly.",
    sortOrder: 1,
  },
  {
    code: "family",
    label: "Family",
    description:
      "Family rooms with three beds for families or groups staying together. Pricing to be configured per event.",
    sortOrder: 2,
  },
]

const OPTIONS: OptionSeed[] = [
  {
    code: "superior_upgrade",
    label: "Superior upgrade",
    description:
      "Upgrade from a Standard room to a Superior room for the whole stay, charged per person per night.",
    kind: "upgrade",
    unit: "per_night",
  },
  {
    code: "cot",
    label: "Cot",
    description:
      "Add a cot for a child under 3 years old, charged per night. Only available for the under-3 age band.",
    kind: "addon",
    unit: "per_night",
  },
]

const AGE_BANDS: AgeBandSeed[] = [
  { code: "under_3", label: "Under 3", minAge: 0, maxAge: 3, sortOrder: 0 },
  { code: "3_11", label: "3 to 11", minAge: 3, maxAge: 11, sortOrder: 1 },
  { code: "12_17", label: "12 to 17", minAge: 12, maxAge: 17, sortOrder: 2 },
  { code: "18_plus", label: "18 and over", minAge: 18, maxAge: null, sortOrder: 3 },
]

const ROOM_TYPES: RoomTypeSeed[] = [
  {
    label: "Standard Single",
    defaultCapacity: 1,
    count: 95,
    description: "Single bed in a standard room. One attendee per room.",
    categoryCode: "standard",
  },
  {
    label: "Standard Double King",
    defaultCapacity: 2,
    count: 61,
    description:
      "One king-size bed in a standard room. Shared by two attendees (e.g. a couple).",
    categoryCode: "standard",
  },
  {
    label: "Standard Double Queen",
    defaultCapacity: 2,
    count: 29,
    description:
      "One queen-size bed (160 cm) in a standard room. Shared by two attendees.",
    categoryCode: "standard",
  },
  {
    label: "Standard Double Twin",
    defaultCapacity: 2,
    count: 60,
    description:
      "Two twin beds placed together in a standard room. Shared by two attendees.",
    categoryCode: "standard",
  },
  {
    label: "Standard Twin (separate beds)",
    defaultCapacity: 2,
    count: 21,
    description:
      "Two twin beds in separate positions in a standard room. Shared by two attendees who prefer separate beds.",
    categoryCode: "standard",
  },
  {
    label: "Superior Single",
    defaultCapacity: 1,
    count: 15,
    description: "Single bed in a superior room. One attendee per room.",
    categoryCode: "superior",
  },
  {
    label: "Superior Double King",
    defaultCapacity: 2,
    count: 33,
    description:
      "One king-size bed in a superior room. Shared by two attendees.",
    categoryCode: "superior",
  },
  {
    label: "Superior Double Twin",
    defaultCapacity: 2,
    count: 50,
    description:
      "Two twin beds in a superior room. Shared by two attendees.",
    categoryCode: "superior",
  },
  {
    label: "Family Room Double King",
    defaultCapacity: 3,
    count: 4,
    description:
      "Three beds in a family room (one king plus an extra bed). Fits a family or group of three.",
    categoryCode: "family",
  },
  {
    label: "Family Room Double Twin",
    defaultCapacity: 3,
    count: 6,
    description:
      "Three beds in a larger family room (twin plus extra bed). Fits a family or group of three.",
    categoryCode: "family",
  },
]

const RATES: RateSeed[] = [
  {
    categoryCode: "standard",
    occupancy: "single",
    pricePerPersonMinor: 9000,
  },
  {
    categoryCode: "standard",
    occupancy: "shared",
    pricePerPersonMinor: 6000,
  },
  {
    categoryCode: "superior",
    occupancy: "single",
    pricePerPersonMinor: 10000,
  },
  {
    categoryCode: "superior",
    occupancy: "shared",
    pricePerPersonMinor: 7000,
  },
]

export default internalMutation({
  handler: async (ctx) => {
    const [categoryRows, optionRows, ageBandRows, roomTypeRows, eventRows] =
      await Promise.all([
        ctx.db.query("accommodationCategories").take(100),
        ctx.db.query("accommodationOptions").take(100),
        ctx.db.query("accommodationAgeBands").take(100),
        ctx.db.query("accommodationRoomTypes").take(200),
        ctx.db.query("events").take(100),
      ])

    const existingCategoryByCode = new Map(
      categoryRows.map((row) => [row.code, row])
    )
    const existingOptionByCode = new Map(optionRows.map((row) => [row.code, row]))
    const existingAgeBandByCode = new Map(ageBandRows.map((row) => [row.code, row]))
    const existingRoomTypeByLabel = new Map(
      roomTypeRows.map((row) => [row.label, row])
    )

    // 1. Categories
    const categoryIdByCode = new Map<string, Id<"accommodationCategories">>()
    for (const category of CATEGORIES) {
      const existing = existingCategoryByCode.get(category.code)
      const insert = {
        code: category.code,
        label: category.label,
        description: category.description,
        sortOrder: category.sortOrder,
      }
      if (existing) {
        await ctx.db.patch(existing._id, insert)
        categoryIdByCode.set(category.code, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationCategories", insert)
        categoryIdByCode.set(category.code, id)
      }
    }

    // 2. Options
    const optionIdByCode = new Map<string, Id<"accommodationOptions">>()
    for (const option of OPTIONS) {
      const existing = existingOptionByCode.get(option.code)
      const insert = {
        code: option.code,
        label: option.label,
        description: option.description,
        kind: option.kind,
        unit: option.unit,
      }
      if (existing) {
        await ctx.db.patch(existing._id, insert)
        optionIdByCode.set(option.code, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationOptions", insert)
        optionIdByCode.set(option.code, id)
      }
    }

    // 3. Age bands
    const ageBandIdByCode = new Map<string, Id<"accommodationAgeBands">>()
    for (const band of AGE_BANDS) {
      const existing = existingAgeBandByCode.get(band.code)
      const insert = {
        code: band.code,
        label: band.label,
        minAge: band.minAge,
        maxAge: band.maxAge ?? undefined,
        sortOrder: band.sortOrder,
      }
      if (existing) {
        await ctx.db.patch(existing._id, insert)
        ageBandIdByCode.set(band.code, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationAgeBands", insert)
        ageBandIdByCode.set(band.code, id)
      }
    }

    // 4. Room types
    const roomTypeIdByLabel = new Map<string, Id<"accommodationRoomTypes">>()
    for (const roomType of ROOM_TYPES) {
      const categoryId = categoryIdByCode.get(roomType.categoryCode)
      if (!categoryId) {
        throw new Error(
          `Missing category for room type ${roomType.label}`
        )
      }
      const existing = existingRoomTypeByLabel.get(roomType.label)
      const insert = {
        label: roomType.label,
        defaultCapacity: roomType.defaultCapacity,
        count: roomType.count,
        description: roomType.description,
        categoryId,
      }
      if (existing) {
        await ctx.db.patch(existing._id, insert)
        roomTypeIdByLabel.set(roomType.label, existing._id)
      } else {
        const id = await ctx.db.insert("accommodationRoomTypes", insert)
        roomTypeIdByLabel.set(roomType.label, id)
      }
    }

    // 5. Per-event configuration for every accommodation-enabled event
    let configuredEvents = 0
    for (const event of eventRows) {
      if (!event.accommodationEnabled) {
        continue
      }
      const standardId = categoryIdByCode.get("standard")!
      const superiorId = categoryIdByCode.get("superior")!
      const upgradeOptionId = optionIdByCode.get("superior_upgrade")!
      const cotOptionId = optionIdByCode.get("cot")!

      // 5a. Event accommodation config: one night before the event, extended
      // stays allowed before only. nightCount is derived server-side.
      const existingConfig = await ctx.db
        .query("eventAccommodationConfig")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .unique()
      const configPayload = {
        eventId: event._id,
        baseCheckInAt: event.startsAt - DAY_MS,
        baseCheckOutAt: event.startsAt,
        allowExtendedStayBefore: true,
        allowExtendedStayAfter: false,
        allowExtendedStayBoth: false,
        defaultCategoryId: standardId,
        breakfastIncluded: true,
        nightCount: 1,
        updatedAt: Date.now(),
      }
      if (existingConfig) {
        await ctx.db.patch(existingConfig._id, configPayload)
      } else {
        await ctx.db.insert("eventAccommodationConfig", configPayload)
      }

      // 5b. Rates: full per-person-per-night prices for standard/superior ×
      // single/shared. Family rates are intentionally omitted (undefined yet).
      for (const rate of RATES) {
        const categoryId =
          rate.categoryCode === "superior" ? superiorId : standardId
        const existingRate = await ctx.db
          .query("eventAccommodationRates")
          .withIndex("by_eventId_and_categoryId_and_occupancy", (q) =>
            q
              .eq("eventId", event._id)
              .eq("categoryId", categoryId)
              .eq("occupancy", rate.occupancy)
          )
          .first()
        const ratePayload = {
          eventId: event._id,
          categoryId,
          occupancy: rate.occupancy,
          pricePerPersonMinor: rate.pricePerPersonMinor,
        }
        if (existingRate) {
          await ctx.db.patch(existingRate._id, ratePayload)
        } else {
          await ctx.db.insert("eventAccommodationRates", ratePayload)
        }
      }

      // 5c. Event options: superior upgrade (€10/night default) and cot
      // (€10/night, under-3 only).
      const upgradeExisting = await ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId_and_optionId", (q) =>
          q.eq("eventId", event._id).eq("optionId", upgradeOptionId)
        )
        .first()
      const upgradePayload = {
        eventId: event._id,
        optionId: upgradeOptionId,
        enabled: true,
        priceMinor: 1000,
        eligibilityAgeBandCode: undefined,
        notes: "Standard to Superior, per person per night.",
      }
      if (upgradeExisting) {
        await ctx.db.patch(upgradeExisting._id, upgradePayload)
      } else {
        await ctx.db.insert("eventAccommodationOptions", upgradePayload)
      }

      const cotExisting = await ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId_and_optionId", (q) =>
          q.eq("eventId", event._id).eq("optionId", cotOptionId)
        )
        .first()
      const cotPayload = {
        eventId: event._id,
        optionId: cotOptionId,
        enabled: true,
        priceMinor: 1000,
        eligibilityAgeBandCode: "under_3" as const,
        notes: "Per night, children under 3 only.",
      }
      if (cotExisting) {
        await ctx.db.patch(cotExisting._id, cotPayload)
      } else {
        await ctx.db.insert("eventAccommodationOptions", cotPayload)
      }

      // 5d. Resources: physical room counts + cot count.
      for (const roomType of ROOM_TYPES) {
        const roomTypeId = roomTypeIdByLabel.get(roomType.label)!
        const existingResource = await ctx.db
          .query("eventAccommodationResources")
          .withIndex("by_eventId_and_kind_and_roomTypeId", (q) =>
            q
              .eq("eventId", event._id)
              .eq("kind", "room")
              .eq("roomTypeId", roomTypeId)
          )
          .first()
        const resourcePayload = {
          eventId: event._id,
          kind: "room" as const,
          roomTypeId,
          count: roomType.count,
        }
        if (existingResource) {
          await ctx.db.patch(existingResource._id, resourcePayload)
        } else {
          await ctx.db.insert("eventAccommodationResources", resourcePayload)
        }
      }

      const existingCotResource = await ctx.db
        .query("eventAccommodationResources")
        .withIndex("by_eventId_and_kind_and_roomTypeId", (q) =>
          q
            .eq("eventId", event._id)
            .eq("kind", "cot")
            .eq("roomTypeId", undefined)
        )
        .first()
      const cotResourcePayload = {
        eventId: event._id,
        kind: "cot" as const,
        roomTypeId: undefined,
        count: 10,
      }
      if (existingCotResource) {
        await ctx.db.patch(existingCotResource._id, cotResourcePayload)
      } else {
        await ctx.db.insert("eventAccommodationResources", cotResourcePayload)
      }

      // 5e. Age pricing: seedable rows, left as free/full placeholders.
      for (const band of AGE_BANDS) {
        const existingAgePricing = await ctx.db
          .query("eventAccommodationAgePricing")
          .withIndex("by_eventId_and_ageBandCode", (q) =>
            q.eq("eventId", event._id).eq("ageBandCode", band.code)
          )
          .first()
        const agePricingPayload = {
          eventId: event._id,
          ageBandCode: band.code,
          rateType: "full" as const,
          value: 0,
          sortOrder: band.sortOrder,
        }
        if (existingAgePricing) {
          await ctx.db.patch(existingAgePricing._id, agePricingPayload)
        } else {
          await ctx.db.insert("eventAccommodationAgePricing", agePricingPayload)
        }
      }

      configuredEvents += 1
    }

    return {
      categories: CATEGORIES.length,
      options: OPTIONS.length,
      ageBands: AGE_BANDS.length,
      roomTypes: ROOM_TYPES.length,
      eventsConfigured: configuredEvents,
    }
  },
})
