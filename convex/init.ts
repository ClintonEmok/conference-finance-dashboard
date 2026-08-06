import { internalMutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"

type CategorySeed = {
  code: "standard" | "superior" | "family"
  label: string
  description: string
  sortOrder: number
}

type OptionSeed = {
  code: string
  label: string
  description: string
  kind: "addon" | "upgrade" | "eligibility"
  unit: "per_night" | "per_person"
}

type RoomTypeSeed = {
  label: string
  defaultCapacity: number
  count: number
  description: string
  categoryCode: "standard" | "superior" | "family"
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
      "Superior rooms with upgraded comfort and amenities. Chosen directly as a room category.",
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
    code: "cot",
    label: "Cot",
    description:
      "Add a cot for a child, charged per night. Choose how many cots and how many nights.",
    kind: "addon",
    unit: "per_night",
  },
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

export default internalMutation({
  handler: async (ctx) => {
    const [categoryRows, optionRows, roomTypeRows] = await Promise.all([
      ctx.db.query("accommodationCategories").take(100),
      ctx.db.query("accommodationOptions").take(100),
      ctx.db.query("accommodationRoomTypes").take(200),
    ])

    const existingCategoryByCode = new Map(
      categoryRows.map((row) => [row.code, row])
    )
    const existingOptionByCode = new Map(optionRows.map((row) => [row.code, row]))
    const existingRoomTypeByLabel = new Map(
      roomTypeRows.map((row) => [row.label, row])
    )

    // 1. Reusable catalog: categories.
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

    // 2. Reusable catalog: options. The only seeded option is the cot. The
    //    obsolete `superior_upgrade` option is removed below (v6: superior is
    //    a rate category, not an option).
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

    // 3. Reusable catalog: room types (the physical inventory foundation).
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

    // 4. Reconciliation of data from the pre-v6 model. This seed does not
    //    configure any event's accommodation (accommodation is optional and
    //    event-owned). Re-running the seed removes rows that the v6 prune made
    //    obsolete, so a deployment that previously ran the old seed converges
    //    to the clean catalog:
    //    - `superior_upgrade` catalog option and any event options referencing
    //      it (v6: superior is a rate category, never an option).
    //    - the legacy `eligibilityAgeBandCode` field on event options (the
    //      age-band model was removed).
    //    Existing orders, selections, snapshots, payments, assignments, and the
    //    existing event's stay/rates/resources are never touched.
    let removedSuperiorUpgradeCatalog = 0
    let removedSuperiorUpgradeEventOptions = 0
    let clearedEligibilityAgeBand = 0

    const superiorUpgradeOptionId = optionRows.find(
      (option) => option.code === "superior_upgrade"
    )?._id

    // Read the full event-option set once; event options are few per event and
    // the whole set is small enough for bounded iteration.
    const eventOptionRows: Array<{
      _id: Id<"eventAccommodationOptions">
      optionId: Id<"accommodationOptions">
    }> = []
    for await (const row of ctx.db.query("eventAccommodationOptions")) {
      eventOptionRows.push({
        _id: row._id,
        optionId: row.optionId,
      })
    }

    // Remove event options referencing the obsolete option first (child
    // references before the catalog row).
    for (const eventOption of eventOptionRows) {
      if (
        superiorUpgradeOptionId !== undefined &&
        String(eventOption.optionId) === String(superiorUpgradeOptionId)
      ) {
        await ctx.db.delete("eventAccommodationOptions", eventOption._id)
        removedSuperiorUpgradeEventOptions += 1
      }
    }

    if (superiorUpgradeOptionId !== undefined) {
      await ctx.db.delete("accommodationOptions", superiorUpgradeOptionId)
      removedSuperiorUpgradeCatalog += 1
    }

    for await (const eventOption of ctx.db.query("eventAccommodationOptions")) {
      const legacy = eventOption as unknown as Record<string, unknown>
      if (
        legacy.eligibilityAgeBandCode !== undefined &&
        legacy.eligibilityAgeBandCode !== null
      ) {
        await ctx.db.patch("eventAccommodationOptions", eventOption._id, {
          eligibilityAgeBandCode: undefined,
        })
        clearedEligibilityAgeBand += 1
      }
    }

    return {
      categories: CATEGORIES.length,
      options: OPTIONS.length,
      roomTypes: ROOM_TYPES.length,
      removedSuperiorUpgradeCatalog,
      removedSuperiorUpgradeEventOptions,
      clearedEligibilityAgeBand,
    }
  },
})
