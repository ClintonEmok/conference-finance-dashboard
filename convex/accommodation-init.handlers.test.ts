/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

// The production-deployment guard requires a detectable deployment URL and
// an exact deployment-slug match, so every success-path call stubs the
// detected URL and passes an exactly-matching allowed deployment URL.
const TEST_DEPLOYMENT_URL = "https://test-preview.convex.site"
process.env.CONVEX_SITE_URL = TEST_DEPLOYMENT_URL
const productionGuard = {
  authorize: true,
  allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
}

function fresh() {
  return convexTest(schema, modules)
}

/**
 * Mirrors the pre-v6 dev deployment on `acoustic-tiger-876` before the seed
 * reconciliation ran: a legacy `superior_upgrade` catalog option, an event
 * option referencing it, a cot event option still carrying the removed
 * `eligibilityAgeBandCode`, and a fully-configured sample event (stay, rates,
 * resources) that the seed must leave untouched.
 */
async function seedLegacyFixture(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<{
  eventId: Id<"events">
  cotOptionId: Id<"accommodationOptions">
  configId: Id<"eventAccommodationConfig">
  rateId: Id<"eventAccommodationRates">
  resourceId: Id<"eventAccommodationResources">
}> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "legacy-event",
      title: "Legacy Event",
      startsAt: 1_750_000_000_000,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: 1_750_000_000_000,
    })
  })

  const standardCategoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 0,
    })
  })

  const superiorUpgradeOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "superior_upgrade",
      label: "Superior upgrade",
      description: "Legacy pre-v6 option",
      kind: "upgrade",
      unit: "per_night",
    })
  })
  const cotOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "cot",
      label: "Cot",
      description: "Legacy description referencing the removed under-3 age band",
      kind: "addon",
      unit: "per_night",
    })
  })

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Standard Single",
      defaultCapacity: 1,
      count: 95,
      description: "Single bed in a standard room.",
      categoryId: standardCategoryId as never,
    })
  })

  const configId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: 1_749_823_200_000,
      baseCheckOutAt: 1_750_000_000_000,
      allowExtendedStayBefore: true,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      defaultCategoryId: standardCategoryId as never,
      breakfastIncluded: true,
      nightCount: 1,
      updatedAt: 1_750_000_000_000,
    })
  })

  // Two event options: one referencing the obsolete superior_upgrade, one cot
  // carrying the removed eligibilityAgeBandCode.
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: superiorUpgradeOptionId as never,
      enabled: true,
      priceMinor: 1000,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: cotOptionId as never,
      enabled: true,
      priceMinor: 1000,
      eligibilityAgeBandCode: "under_3",
    })
  })

  const rateId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: standardCategoryId as never,
      occupancy: "single",
      pricePerPersonMinor: 9000,
    })
  })

  const resourceId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationResources", {
      eventId: eventId as never,
      kind: "room",
      roomTypeId: (
        await ctx.db
          .query("accommodationRoomTypes")
          .withIndex("label", (q) => q.eq("label", "Standard Single"))
          .first()
      )!._id,
      count: 95,
    })
  })

  return {
    eventId,
    cotOptionId,
    configId,
    rateId,
    resourceId,
  }
}

test("init seeds only the reusable catalog and reconciles stale pre-v6 data", async () => {
  const t = fresh()
  const fixture = await seedLegacyFixture(t)

  const result = await t.mutation(internal.init.default, {})

  // The catalog contains the seeded categories, the cot option, the
  // superior_upgrade option (retained — part of the simplified contract),
  // and room types.
  const catalogCategories = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationCategories").take(100)
  })
  expect(catalogCategories.map((c) => c.code).sort()).toEqual([
    "family",
    "standard",
    "superior",
  ])

  const catalogOptions = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationOptions").take(100)
  })
  expect(catalogOptions.map((o) => o.code).sort()).toEqual([
    "cot",
    "superior_upgrade",
  ])
  expect(catalogOptions[0].description).not.toMatch(/age band|under 3/i)
  const retainedSuperiorUpgrade = catalogOptions.find(
    (o) => o.code === "superior_upgrade"
  )
  expect(retainedSuperiorUpgrade?.kind).toBe("upgrade")
  expect(retainedSuperiorUpgrade?.unit).toBe("per_night")

  const roomTypes = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationRoomTypes").take(200)
  })
  expect(roomTypes.length).toBe(10)

  // superior_upgrade is retained, never pruned: the legacy event option that
  // referenced it stays enabled (the seed does not delete it), and no
  // catalog row is removed.
  expect(result.removedSuperiorUpgradeCatalog).toBe(0)
  expect(result.removedSuperiorUpgradeEventOptions).toBe(0)
  const eventOptions = await t.mutation(async (ctx) => {
    return await ctx.db.query("eventAccommodationOptions").take(100)
  })
  expect(
    eventOptions.map((o) => String(o.optionId)).sort()
  ).toEqual(
    [String(fixture.cotOptionId), String(retainedSuperiorUpgrade!._id)].sort()
  )

  // eligibilityAgeBandCode is cleared from the surviving cot event option.
  expect(result.clearedEligibilityAgeBand).toBe(1)
  const cotEventOption = eventOptions.find(
    (o) => String(o.optionId) === String(fixture.cotOptionId)
  ) as unknown as Record<string, unknown>
  expect(cotEventOption.eligibilityAgeBandCode).toBeUndefined()

  // The existing event config, rates, and resources are untouched.
  const config = await t.mutation(async (ctx) => {
    return await ctx.db.get("eventAccommodationConfig", fixture.configId)
  })
  expect(config).toMatchObject({
    eventId: fixture.eventId,
    nightCount: 1,
    baseCheckInAt: 1_749_823_200_000,
    baseCheckOutAt: 1_750_000_000_000,
  })
  const rate = await t.mutation(async (ctx) => {
    return await ctx.db.get("eventAccommodationRates", fixture.rateId)
  })
  expect(rate).toMatchObject({ pricePerPersonMinor: 9000, occupancy: "single" })
  const resource = await t.mutation(async (ctx) => {
    return await ctx.db.get("eventAccommodationResources", fixture.resourceId)
  })
  expect(resource).toMatchObject({ count: 95, kind: "room" })
})

test("re-running init is idempotent", async () => {
  const t = fresh()
  await seedLegacyFixture(t)

  const first = await t.mutation(internal.init.default, {})
  const second = await t.mutation(internal.init.default, {})

  // No stale rows exist to remove on the second pass; catalog is stable and
  // superior_upgrade is retained on both passes.
  expect(second.removedSuperiorUpgradeCatalog).toBe(0)
  expect(second.removedSuperiorUpgradeEventOptions).toBe(0)
  expect(second.clearedEligibilityAgeBand).toBe(0)
  expect(second.categories).toBe(first.categories)
  expect(second.options).toBe(first.options)
  expect(second.roomTypes).toBe(first.roomTypes)

  const catalogOptions = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationOptions").take(100)
  })
  expect(catalogOptions.map((o) => o.code).sort()).toEqual([
    "cot",
    "superior_upgrade",
  ])
  expect(catalogOptions).toHaveLength(2)
})

test("applySimplifiedDivineConferenceAccommodation converges the locked tickets/config/catalog idempotently and leaves admin inventory intact", async () => {
  const t = fresh()

  // A divine-redesign-like event in the pre-migration state: five entry
  // tickets, the two room anchors, standard + superior categories, a cot
  // option, a stay config, and Standard rates — but no superior rates, no
  // family category, and no superior_upgrade event option yet. Exactly the
  // state the migration must converge.
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "divine-redesign",
      title: "Divine Redesign",
      startsAt: 1_750_000_000_000,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: 1_750_000_000_000,
    })
  })
  const standardCategoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 0,
    })
  })
  const superiorCategoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "superior",
      label: "Superior",
      sortOrder: 1,
    })
  })
  const cotOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "cot",
      label: "Cot",
      kind: "addon",
      unit: "per_night",
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: 1_749_823_200_000,
      baseCheckOutAt: 1_750_000_000_000,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: 1_750_000_000_000,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: standardCategoryId as never,
      occupancy: "shared",
      pricePerPersonMinor: 6000,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: standardCategoryId as never,
      occupancy: "single",
      pricePerPersonMinor: 9000,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: cotOptionId as never,
      enabled: true,
      priceMinor: 1000,
    })
  })
  const doubleAnchorId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Double Room",
      defaultCapacity: 2,
    })
  })
  const singleAnchorId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Single Room",
      defaultCapacity: 1,
    })
  })
  const entryTicketLabels = ["0-2 Entry", "3-11 Entry", "12-17 Entry", "18+ Entry"]
  const entryTicketPrices = [1000, 10000, 14000, 24000]
  for (let index = 0; index < 4; index += 1) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("ticketTypes", {
        eventId: eventId as never,
        label: entryTicketLabels[index],
        priceMinor: entryTicketPrices[index],
        isActive: true,
        visibility: "public" as const,
        availabilityState: "selectable" as const,
        sortOrder: index,
        updatedAt: 1_750_000_000_000,
      })
    })
  }
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Single Room",
      priceMinor: 34000,
      isActive: true,
      visibility: "public" as const,
      availabilityState: "selectable" as const,
      sortOrder: 4,
      updatedAt: 1_750_000_000_000,
    })
  })

  const first = await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )
  expect(first).toMatchObject({
    slug: "divine-redesign",
    entryTicketsRenamed: 4,
    entryTicketsPriced: 4,
    ticketsAnchored: 5,
    ticketsIncluded: 5,
    singleRoomTicketPriced: 1,
    categoriesCreated: 1,
    categoriesUpdated: 2,
    roomTypesCreated: 10,
    roomTypesUpdated: 0,
    anchorsPatched: 2,
    ratesCreated: 2,
    ratesUpdated: 0,
    configCreated: 0,
    configUpdated: 1,
    catalogOptionsCreated: 1,
    eventOptionsEnabled: 1,
    eventOptionPricesUpdated: 0,
  })

  // Tickets converged: under 3 / 3-11 / 12-17 / 18+ at €0/€125/€150/€250,
  // Single Room kept at €350, all anchored with accommodation included.
  const tickets = await t.query(async (ctx) => {
    const rows = await ctx.db.query("ticketTypes").take(50)
    return rows
      .map((row) => ({
        label: row.label,
        priceMinor: row.priceMinor,
        roomTypeId: String(row.roomTypeId ?? ""),
        accommodationIncluded: row.accommodationIncluded,
        sortOrder: row.sortOrder ?? row._creationTime,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  })
  expect(tickets).toHaveLength(5)
  expect(tickets.map((row) => row.label)).toEqual([
    "under 3",
    "3-11",
    "12-17",
    "18+",
    "Single Room",
  ])
  expect(tickets.map((row) => row.priceMinor)).toEqual([
    0, 12500, 15000, 25000, 35000,
  ])
  expect(tickets.map((row) => row.roomTypeId)).toEqual([
    String(doubleAnchorId),
    String(doubleAnchorId),
    String(doubleAnchorId),
    String(doubleAnchorId),
    String(singleAnchorId),
  ])
  for (const ticket of tickets) {
    expect(ticket.accommodationIncluded).toBe(true)
  }

  // Rates converged to the two Standard + two Superior per-person/night rows.
  const rates = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .take(100)
    return rows
      .map((row) => ({
        occupancy: row.occupancy,
        pricePerPersonMinor: row.pricePerPersonMinor,
      }))
      .sort((a, b) =>
        a.occupancy === b.occupancy
          ? a.pricePerPersonMinor - b.pricePerPersonMinor
          : a.occupancy.localeCompare(b.occupancy)
      )
  })
  expect(rates).toEqual([
    { occupancy: "shared", pricePerPersonMinor: 6000 },
    { occupancy: "shared", pricePerPersonMinor: 7000 },
    { occupancy: "single", pricePerPersonMinor: 9000 },
    { occupancy: "single", pricePerPersonMinor: 10000 },
  ])

  // The config defaults to the Standard category with the locked stay.
  const config = await t.query(async (ctx) => {
    return await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .unique()
  })
  expect(config).toMatchObject({
    baseCheckInAt: 1_750_000_000_000,
    baseCheckOutAt: 1_750_000_000_000 + 2 * 24 * 60 * 60 * 1000,
    allowExtendedStayBefore: false,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
    defaultCategoryId: standardCategoryId,
    breakfastIncluded: true,
    nightCount: 2,
  })

  // Both catalog options exist and both event options are enabled at €10.
  const eventOptions = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .take(100)
    const catalog = await ctx.db.query("accommodationOptions").take(100)
    const codeByOptionId = new Map(
      catalog.map((row) => [String(row._id), row.code])
    )
    return rows.map((row) => ({
      code: codeByOptionId.get(String(row.optionId)),
      enabled: row.enabled,
      priceMinor: row.priceMinor,
    }))
  })
  expect(eventOptions).toHaveLength(2)
  const optionByCode = new Map(
    eventOptions.map((row) => [row.code, row])
  )
  expect(optionByCode.get("superior_upgrade")).toMatchObject({
    enabled: true,
    priceMinor: 1000,
  })
  expect(optionByCode.get("cot")).toMatchObject({
    enabled: true,
    priceMinor: 1000,
  })

  // Admin inventory (resources, hotels, rooms, slots) is never touched.
  const inventoryCounts = await t.query(async (ctx) => {
    let resources = 0
    let hotels = 0
    let rooms = 0
    let slots = 0
    for await (const _row of ctx.db.query("eventAccommodationResources"))
      resources += 1
    for await (const _row of ctx.db.query("accommodationHotels")) hotels += 1
    for await (const _row of ctx.db.query("accommodationRooms")) rooms += 1
    for await (const _row of ctx.db.query("accommodationSlots")) slots += 1
    return { resources, hotels, rooms, slots }
  })
  expect(inventoryCounts).toEqual({
    resources: 0,
    hotels: 0,
    rooms: 0,
    slots: 0,
  })

  // Re-running produces no duplicate option/config/ticket/rate rows and no
  // changed money.
  const second = await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )
  expect(second).toMatchObject({
    entryTicketsRenamed: 0,
    entryTicketsPriced: 0,
    ticketsAnchored: 0,
    ticketsIncluded: 0,
    singleRoomTicketPriced: 0,
    categoriesCreated: 0,
    categoriesUpdated: 0,
    roomTypesCreated: 0,
    roomTypesUpdated: 0,
    anchorsPatched: 0,
    ratesCreated: 0,
    ratesUpdated: 0,
    configCreated: 0,
    configUpdated: 0,
    catalogOptionsCreated: 0,
    eventOptionsEnabled: 0,
    eventOptionPricesUpdated: 0,
  })
  const ticketsAfter = await t.query(async (ctx) => {
    return (await ctx.db.query("ticketTypes").take(50)).length
  })
  expect(ticketsAfter).toBe(5)
  expect(superiorCategoryId).toBeTruthy()
})

test("applyKoningshofAccommodationInventory creates the hotel link, exact resource caps, rooms, and slots idempotently", async () => {
  const t = fresh()
  const eventId = await t.mutation(async (ctx) =>
    await ctx.db.insert("events", {
      slug: "divine-redesign",
      title: "Divine Redesign",
      startsAt: 1_750_000_000_000,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: 1_750_000_000_000,
    })
  )

  const categoryIds = await t.mutation(async (ctx) => {
    const categories = await Promise.all(
      (["standard", "superior", "family"] as const).map((code, index) =>
        ctx.db.insert("accommodationCategories", {
          code,
          label: code,
          sortOrder: index,
        })
      )
    )
    return categories
  })
  const categoryByCode = new Map(
    (["standard", "superior", "family"] as const).map((code, index) => [
      code,
      categoryIds[index],
    ])
  )

  const roomResources = [
    ["Standard Single", 1, 95, "standard"],
    ["Standard Double King", 2, 61, "standard"],
    ["Standard Double Queen", 2, 29, "standard"],
    ["Standard Double Twin", 2, 60, "standard"],
    ["Standard Twin (separate beds)", 2, 21, "standard"],
    ["Superior Single", 1, 15, "superior"],
    ["Superior Double King", 2, 33, "superior"],
    ["Superior Double Twin", 2, 50, "superior"],
    ["Family Room Double King", 3, 4, "family"],
    ["Family Room Double Twin", 3, 6, "family"],
  ] as const

  await t.mutation(async (ctx) => {
    for (const [label, defaultCapacity, count, categoryCode] of roomResources) {
      await ctx.db.insert("accommodationRoomTypes", {
        label,
        defaultCapacity,
        count,
        categoryId: categoryByCode.get(categoryCode) as never,
      })
    }
  })

  // The migration is bounded/resumable: re-run the command until it reports
  // `done`. The first invocation covers the hotel/link/resources stage.
  const first = await t.mutation(
    internal.applyKoningshofAccommodationInventory.default,
    productionGuard
  )
  expect(first).toMatchObject({
    slug: "divine-redesign",
    hotelCreated: 1,
    eventHotelLinked: 1,
    resourcesCreated: 11,
  })
  let result = first
  while (!result.done) {
    result = await t.mutation(
      internal.applyKoningshofAccommodationInventory.default,
      productionGuard
    )
  }
  expect(result.done).toBe(true)

  const hotel = await t.mutation(async (ctx) =>
    await ctx.db
      .query("accommodationHotels")
      .withIndex("name", (q) =>
        q.eq("name", "NH Eindhoven Conference Centre Koningshof")
      )
      .first()
  )
  expect(hotel).toMatchObject({
    city: "Veldhoven",
    address: "Locht 117, 5504 RM Veldhoven, Netherlands",
  })

  const resources = await t.mutation(async (ctx) =>
    await ctx.db
      .query("eventAccommodationResources")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .take(100)
  )
  expect(resources).toHaveLength(11)
  expect(resources.filter((row) => row.kind === "cot")[0]?.count).toBe(10)
  expect(
    resources
      .filter((row) => row.kind === "room")
      .map((row) => row.count)
      .sort((a, b) => a - b)
  ).toEqual([4, 6, 15, 21, 29, 33, 50, 60, 61, 95])

  // Physical rooms and mixed/assignable slots from the resource counts.
  const roomCount = await t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("accommodationRooms")) count += 1
    return count
  })
  expect(roomCount).toBe(374)
  const slotCount = await t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("accommodationSlots")) count += 1
    return count
  })
  expect(slotCount).toBe(648)

  // A re-run after cleanup creates/duplicates/deletes nothing.
  const rerun = await t.mutation(
    internal.applyKoningshofAccommodationInventory.default,
    productionGuard
  )
  expect(rerun).toMatchObject({
    done: true,
    hotelCreated: 0,
    hotelUpdated: 0,
    eventHotelLinked: 0,
    resourcesCreated: 0,
    resourcesUpdated: 0,
    roomsCreated: 0,
    slotsCreated: 0,
    staleResourcesRemoved: 0,
    oldSlotsDeleted: 0,
    oldRoomsDeleted: 0,
    oldLinksDeleted: 0,
    oldHotelsDeleted: 0,
  })
})
