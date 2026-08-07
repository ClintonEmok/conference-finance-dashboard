/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

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

test("applySimplifiedDivineConferenceAccommodation is idempotent and leaves admin inventory intact", async () => {
  const t = fresh()

  // A divine-like event: standard + superior categories with rates, a cot
  // option, and a configured stay. No superior_upgrade event option yet and
  // no defaultCategoryId — exactly the state the migration must converge.
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "divine-conference",
      title: "Divine Conference",
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
  await t.mutation(async (ctx) => {
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

  const first = await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    {}
  )
  expect(first).toMatchObject({
    slug: "divine-conference",
    defaultCategoryId: String(standardCategoryId),
    configUpdated: 1,
    superiorUpgrade: {
      catalogOptionCreated: 1,
      optionEnabled: 1,
      optionPriceUpdated: 0,
      priceMinor: 1000,
    },
  })

  // The migration converged: exactly one enabled superior_upgrade row at 1000
  // minor units and the config defaults to Standard.
  const eventOptions = await t.mutation(async (ctx) => {
    return await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .take(100)
  })
  const catalogOptions = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationOptions").take(100)
  })
  const superiorUpgradeOption = catalogOptions.find(
    (o) => o.code === "superior_upgrade"
  )
  expect(superiorUpgradeOption).toBeDefined()
  const upgradeEventRow = eventOptions.find(
    (row) =>
      String((row as unknown as { optionId: unknown }).optionId) ===
      String(superiorUpgradeOption!._id)
  )
  expect(upgradeEventRow?.enabled).toBe(true)
  expect(upgradeEventRow?.priceMinor).toBe(1000)

  const config = await t.mutation(async (ctx) => {
    return await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .unique()
  })
  expect(config?.defaultCategoryId).toBe(standardCategoryId)

  // Re-running produces no duplicate option/config rows and no changed money.
  const second = await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    {}
  )
  expect(second.configUpdated).toBe(0)
  expect(second.superiorUpgrade.catalogOptionCreated).toBe(0)
  expect(second.superiorUpgrade.optionEnabled).toBe(0)
  expect(second.superiorUpgrade.optionPriceUpdated).toBe(0)

  const eventOptionsAfter = await t.mutation(async (ctx) => {
    return await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .take(100)
  })
  expect(eventOptionsAfter).toHaveLength(eventOptions.length)
  const upgradeRowsAfter = eventOptionsAfter.filter(
    (row) =>
      String((row as unknown as { optionId: unknown }).optionId) ===
      String(superiorUpgradeOption!._id)
  )
  expect(upgradeRowsAfter).toHaveLength(1)
  expect(upgradeRowsAfter[0]?.priceMinor).toBe(1000)

  // The migration never touches admin room/category/rate inventory or orders.
  const rates = await t.mutation(async (ctx) => {
    return await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .take(100)
  })
  expect(rates.map((r) => r.pricePerPersonMinor).sort()).toEqual([6000, 9000])
  const orders = await t.mutation(async (ctx) => {
    return await ctx.db.query("orders").take(10)
  })
  expect(orders).toHaveLength(0)
})
