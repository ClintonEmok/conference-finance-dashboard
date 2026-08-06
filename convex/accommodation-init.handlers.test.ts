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

  // The catalog contains the seeded categories, the cot option, and room types.
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
  expect(catalogOptions.map((o) => o.code)).toEqual(["cot"])
  expect(catalogOptions[0].description).not.toMatch(/age band|under 3/i)

  const roomTypes = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationRoomTypes").take(200)
  })
  expect(roomTypes.length).toBe(10)

  // No superior_upgrade remains anywhere.
  expect(result.removedSuperiorUpgradeCatalog).toBe(1)
  expect(result.removedSuperiorUpgradeEventOptions).toBe(1)
  const eventOptions = await t.mutation(async (ctx) => {
    return await ctx.db.query("eventAccommodationOptions").take(100)
  })
  expect(eventOptions.map((o) => String(o.optionId))).toEqual([
    String(fixture.cotOptionId),
  ])

  // eligibilityAgeBandCode is cleared from the surviving cot event option.
  expect(result.clearedEligibilityAgeBand).toBe(1)
  const cotEventOption = eventOptions[0] as unknown as Record<string, unknown>
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

  // No new stale rows exist to remove on the second pass; catalog is stable.
  expect(second.removedSuperiorUpgradeCatalog).toBe(0)
  expect(second.removedSuperiorUpgradeEventOptions).toBe(0)
  expect(second.clearedEligibilityAgeBand).toBe(0)
  expect(second.categories).toBe(first.categories)
  expect(second.options).toBe(first.options)
  expect(second.roomTypes).toBe(first.roomTypes)

  const catalogOptions = await t.mutation(async (ctx) => {
    return await ctx.db.query("accommodationOptions").take(100)
  })
  expect(catalogOptions.map((o) => o.code)).toEqual(["cot"])
  expect(catalogOptions).toHaveLength(1)
})
