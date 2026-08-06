/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

async function createEvent(
  t: TestConvexForDataModel<GenericDataModel>,
  startsAt = 1_750_000_000_000
) {
  return await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: `event-${startsAt}`,
      title: "Test Event",
      startsAt,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: startsAt,
    })
  })
}

// ---------------------------------------------------------------------------
// Authentication (CR-01): every Phase 39 read and write requires an identity.
// ---------------------------------------------------------------------------

test("catalog and config reads reject unauthenticated callers", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const anonymous = fresh()
  await expect(
    anonymous.query(api.accommodation.getAccommodationCatalog)
  ).rejects.toThrow("Unauthorized")
  await expect(
    anonymous.query(api.accommodation.getEventAccommodationConfig, {
      eventId,
    })
  ).rejects.toThrow("Unauthorized")
})

test("pre-existing admin inventory reads reject unauthenticated callers", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const anonymous = fresh()
  await expect(anonymous.query(api.accommodation.getHotels)).rejects.toThrow(
    "Unauthorized"
  )
  await expect(anonymous.query(api.accommodation.getRoomTypes)).rejects.toThrow(
    "Unauthorized"
  )
  await expect(
    anonymous.query(api.accommodation.getSlotsForEvent, { eventId })
  ).rejects.toThrow("Unauthorized")
})

test("catalog writes reject unauthenticated callers", async () => {
  const t = fresh()
  await expect(
    t.mutation(api.accommodation.createAccommodationCategory, {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    })
  ).rejects.toThrow("Unauthorized")
})

test("authenticated callers can read the empty catalog", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const catalog = await t.query(api.accommodation.getAccommodationCatalog)
  expect(catalog.categories).toEqual([])
  expect(catalog.options).toEqual([])
})

// ---------------------------------------------------------------------------
// Catalog mutations: typed FKs, locked semantics, bounds validation.
// ---------------------------------------------------------------------------

test("category create persists rows and rejects duplicate codes", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const id = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  expect(id).toBeTruthy()
  await expect(
    t.mutation(api.accommodation.createAccommodationCategory, {
      code: "standard",
      label: "Standard Again",
      sortOrder: 2,
    })
  ).rejects.toThrow(/already exists/)
})

test("option create persists arbitrary codes with their kind/unit", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const cotId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "cot",
    label: "Cot",
    kind: "addon",
    unit: "per_night",
  })
  expect(cotId).toBeTruthy()
})

test("room type create rejects negative and fractional defaultCapacity", async () => {
  const t = fresh().withIdentity(adminIdentity)
  await expect(
    t.mutation(api.accommodation.createRoomType, {
      label: "Bad",
      defaultCapacity: 2.5,
    })
  ).rejects.toThrow(/positive integer/)
  await expect(
    t.mutation(api.accommodation.createRoomType, {
      label: "Bad",
      defaultCapacity: -1,
    })
  ).rejects.toThrow(/positive integer/)
  const id = await t.mutation(api.accommodation.createRoomType, {
    label: "Twin",
    defaultCapacity: 2,
  })
  expect(id).toBeTruthy()
})

// ---------------------------------------------------------------------------
// Event config: default window, check-out validation, extended-stay flags.
// ---------------------------------------------------------------------------

test("config upsert defaults to the one-night-before-event window", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t, 1_750_000_000_000)
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
  })
  const { config } = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(config?.nightCount).toBe(1)
  expect(config?.baseCheckOutAt).toBe(1_750_000_000_000)
  expect(config?.baseCheckInAt).toBe(1_750_000_000_000 - 24 * 60 * 60 * 1000)
  expect(config?.breakfastIncluded).toBe(false)
})

test("config upsert rejects a stay window that ends at or before check-in", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationConfig, {
      eventId,
      baseCheckInAt: 1_000,
      baseCheckOutAt: 1_000,
    })
  ).rejects.toThrow(/check-out must be after check-in/)
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationConfig, {
      eventId,
      baseCheckInAt: 1_000,
      baseCheckOutAt: 999,
    })
  ).rejects.toThrow(/check-out must be after check-in/)
})

test("config upsert normalizes extended-stay flags", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    allowExtendedStayBoth: true,
    allowExtendedStayBefore: false,
    allowExtendedStayAfter: false,
  })
  const { config } = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(config?.allowExtendedStayBoth).toBe(true)
  expect(config?.allowExtendedStayBefore).toBe(true)
  expect(config?.allowExtendedStayAfter).toBe(true)
})

test("config is a singleton: repeated upserts keep one row", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    breakfastIncluded: false,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    breakfastIncluded: true,
  })
  const { config } = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(config?.breakfastIncluded).toBe(true)
  // Two upserts must not create a duplicate singleton row: the read uses
  // .unique() and would throw if one existed.
  expect(config?.eventId).toBe(eventId)
})

// ---------------------------------------------------------------------------
// Rates: integer minor units, typed category FK, upsert identity, scoping.
// ---------------------------------------------------------------------------

test("rate upsert rejects fractional minor-unit prices", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationRate, {
      eventId,
      categoryId,
      occupancy: "single",
      pricePerPersonMinor: 9000.5,
    })
  ).rejects.toThrow(/non-negative number/)
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationRate, {
      eventId,
      categoryId,
      occupancy: "single",
      pricePerPersonMinor: -1,
    })
  ).rejects.toThrow(/non-negative number/)
})

test("rate upsert rejects unknown category ids", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  // A well-formed id that no longer exists must hit the handler-level
  // category existence check.
  const deletedCategoryId = await t.mutation(
    api.accommodation.createAccommodationCategory,
    {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    }
  )
  await t.mutation(async (ctx) => {
    await ctx.db.delete("accommodationCategories", deletedCategoryId)
  })
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationRate, {
      eventId,
      categoryId: deletedCategoryId,
      occupancy: "single",
      pricePerPersonMinor: 9000,
    })
  ).rejects.toThrow("Category not found")
})

test("rate upsert patches the keyed row instead of duplicating", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  const args = {
    eventId,
    categoryId,
    occupancy: "single" as const,
  }
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    ...args,
    pricePerPersonMinor: 9000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    ...args,
    pricePerPersonMinor: 8500,
  })
  const { rates } = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(rates).toHaveLength(1)
  expect(rates[0].pricePerPersonMinor).toBe(8500)
  expect(rates[0].categoryCode).toBe("standard")
  expect(rates[0].categoryLabel).toBe("Standard")
})

// ---------------------------------------------------------------------------
// Event options: €10 default, explicit €0, cot eligibility through handler.
// ---------------------------------------------------------------------------

test("event option upsert defaults omitted prices to €10 and keeps explicit €0", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const cotId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "cot",
    label: "Cot",
    kind: "addon",
    unit: "per_night",
  })
  const parkingId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "parking",
    label: "Parking pass",
    kind: "addon",
    unit: "per_night",
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotId,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: parkingId,
    priceMinor: 0,
  })
  const { options } = (await t.query(
    api.accommodation.getEventAccommodationConfig,
    { eventId }
  )) as {
    options: Array<{
      optionId: string
      priceMinor: number
      optionCode: string | null
    }>
  }
  const byOptionId = new Map(options.map((option) => [option.optionId, option]))
  expect(byOptionId.get(cotId)?.priceMinor).toBe(1000)
  expect(byOptionId.get(parkingId)?.priceMinor).toBe(0)
  expect(byOptionId.get(cotId)?.optionCode).toBe("cot")
})

test("event option upsert rejects fractional prices", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const cotId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "cot",
    label: "Cot",
    kind: "addon",
    unit: "per_night",
  })
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationOption, {
      eventId,
      optionId: cotId,
      priceMinor: 1000.5,
    })
  ).rejects.toThrow(/non-negative number/)
})

test("event option upsert persists enable/price/notes and preserves on update", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const cotId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "cot",
    label: "Cot",
    kind: "addon",
    unit: "per_night",
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotId,
    enabled: true,
    priceMinor: 700,
    notes: "Per night, per cot.",
  })
  const preserved = await t.mutation(
    api.accommodation.upsertEventAccommodationOption,
    {
      eventId,
      optionId: cotId,
      enabled: true,
    }
  )
  expect(preserved.priceMinor).toBe(700)
})

// ---------------------------------------------------------------------------
// Resources: kind-specific room type requirements and derived sellable beds.
// ---------------------------------------------------------------------------

test("resource upsert requires a room type for rooms and forbids it for cots", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const roomTypeId = await t.mutation(api.accommodation.createRoomType, {
    label: "Twin",
    defaultCapacity: 2,
  })
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationResource, {
      eventId,
      kind: "room",
      count: 3,
    })
  ).rejects.toThrow("Room resources require a room type")
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationResource, {
      eventId,
      kind: "cot",
      roomTypeId,
      count: 5,
    })
  ).rejects.toThrow("Cot resources cannot reference a room type")
  // A well-formed id that no longer exists must hit the handler-level
  // room-type existence check.
  const deletedRoomTypeId = await t.mutation(api.accommodation.createRoomType, {
    label: "Deleted",
    defaultCapacity: 2,
  })
  await t.mutation(async (ctx) => {
    await ctx.db.delete("accommodationRoomTypes", deletedRoomTypeId)
  })
  await expect(
    t.mutation(api.accommodation.upsertEventAccommodationResource, {
      eventId,
      kind: "room",
      roomTypeId: deletedRoomTypeId,
      count: 3,
    })
  ).rejects.toThrow("Room type not found")
})

test("resource upserts are idempotent per (kind, roomTypeId)", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const roomTypeId = await t.mutation(api.accommodation.createRoomType, {
    label: "Twin",
    defaultCapacity: 2,
  })
  const args = {
    eventId,
    kind: "room" as const,
    roomTypeId,
  }
  await t.mutation(api.accommodation.upsertEventAccommodationResource, {
    ...args,
    count: 3,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationResource, {
    ...args,
    count: 4,
  })
  const { resources } = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(resources).toHaveLength(1)
  expect(resources[0].count).toBe(4)
  // Derived availability: 4 rooms × 2 capacity, fetched by the room type id
  // so the join can never silently truncate.
  expect(resources[0].sellableBeds).toBe(8)
  expect(resources[0].roomTypeLabel).toBe("Twin")
})

test("cot resources derive one sellable bed per item", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  await t.mutation(api.accommodation.upsertEventAccommodationResource, {
    eventId,
    kind: "cot",
    count: 5,
  })
  const { resources } = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(resources).toHaveLength(1)
  expect(resources[0].sellableBeds).toBe(5)
  expect(resources[0].roomTypeLabel).toBe(null)
})

// ---------------------------------------------------------------------------
// Event scoping: configuration for one event never leaks into another.
// ---------------------------------------------------------------------------

test("event config is scoped per event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventA = await createEvent(t, 1_750_000_000_000)
  const eventB = await createEvent(t, 1_760_000_000_000)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId: eventA,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: eventA,
    categoryId,
    occupancy: "single",
    pricePerPersonMinor: 9000,
  })
  const configB = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId: eventB,
  })
  expect(configB.config).toBeNull()
  expect(configB.rates).toEqual([])
  expect(configB.activeCategories).toEqual([])
})
