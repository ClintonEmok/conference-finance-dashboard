/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import { loadOrderAmountDueBreakdowns } from "./finance"
import type { Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

const nonAdminIdentity = {
  subject: "user_buyer",
  name: "Buyer",
  email: "buyer@example.com",
}

const BASE_EVENT_AT = 1_750_000_000_000

async function createEvent(
  t: TestConvexForDataModel<GenericDataModel>,
  startsAt = BASE_EVENT_AT
) {
  return await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: `admin-event-${startsAt}`,
      title: "Admin Event",
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

type SeedContext = {
  eventId: Id<"events">
  categoryStandardId: Id<"accommodationCategories">
  categorySuperiorId: Id<"accommodationCategories">
  upgradeOptionId: Id<"accommodationOptions">
  cotOptionId: Id<"accommodationOptions">
  orderId: Id<"orders">
  attendeeId: Id<"orderAttendees">
}

/**
 * Seeds a fully configured event with one order that has one unconfirmed
 * accommodation selection (standard/shared, 2 nights, no options selected).
 * The ticket does not include accommodation, so the snapshot prices every
 * night against the configured rate.
 */
async function seedConfiguredEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await createEvent(t)

  const categoryStandardId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    })
  })
  const categorySuperiorId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "superior",
      label: "Superior",
      sortOrder: 2,
    })
  })
  const upgradeOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "superior_upgrade",
      label: "Superior Upgrade",
      kind: "upgrade",
      unit: "per_night",
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
    return await ctx.db.insert("accommodationAgeBands", {
      code: "under_3",
      label: "Under 3",
      minAge: 0,
      maxAge: 3,
      sortOrder: 1,
    })
  })

  // Stay config: two nights before the event.
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * 24 * 60 * 60 * 1000,
    baseCheckOutAt: BASE_EVENT_AT,
    breakfastIncluded: true,
  })
  // Rates: standard/shared €30, superior/shared €45 per person per night.
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 3000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categorySuperiorId,
    occupancy: "shared",
    pricePerPersonMinor: 4500,
  })
  // Options: superior upgrade €15/night, cot €5/night, both enabled.
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: upgradeOptionId,
    enabled: true,
    priceMinor: 1500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
    eligibilityAgeBandCode: "under_3",
  })

  const ticketTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Ticket only",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-ADMIN-CONF01",
      bookerName: "Admin Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "admin-a",
      name: "Admin Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ticketTypeId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    })
  })

  return {
    eventId: eventId as Id<"events">,
    categoryStandardId: categoryStandardId as Id<"accommodationCategories">,
    categorySuperiorId: categorySuperiorId as Id<"accommodationCategories">,
    upgradeOptionId: upgradeOptionId as Id<"accommodationOptions">,
    cotOptionId: cotOptionId as Id<"accommodationOptions">,
    orderId: orderId as Id<"orders">,
    attendeeId: attendeeId as Id<"orderAttendees">,
  }
}

async function loadOrderAmountDue(
  t: TestConvexForDataModel<GenericDataModel>,
  orderId: string
) {
  return await t.query(async (ctx) => {
    const loaderCtx =
      ctx as unknown as Parameters<typeof loadOrderAmountDueBreakdowns>[0]
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: orderId as never },
    ])
    const breakdown = breakdowns.get(orderId)
    if (!breakdown) return null
    return {
      amountDueMinor: breakdown.amountDueMinor,
      accommodationLines: breakdown.accommodationLines,
    }
  })
}

// ---------------------------------------------------------------------------
// Authentication: the admin read and the confirmation mutation both require
// an identity; no order id is ever accepted from an anonymous caller.
// ---------------------------------------------------------------------------

test("admin config read rejects unauthenticated callers", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-ANON-ORDER",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const anonymous = fresh()
  await expect(
    anonymous.query(api.accommodation.getEventAccommodationConfig, {
      eventId,
    })
  ).rejects.toThrow("Unauthorized")
  await expect(
    anonymous.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
      orderId,
    })
  ).rejects.toThrow("Unauthorized")
})

// ---------------------------------------------------------------------------
// Authorization: the Phase 41 admin surfaces require an administrator, not
// just any authenticated identity. The check is token/email-identity based
// server-side — a client-supplied user ID is never accepted.
// ---------------------------------------------------------------------------

test("authenticated non-admin callers are rejected from every admin surface", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  const upgradeOptionId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "superior_upgrade",
    label: "Superior Upgrade",
    kind: "upgrade",
    unit: "per_night",
  })
  await t.mutation(api.accommodation.createAccommodationAgeBand, {
    code: "under_3",
    label: "Under 3",
    minAge: 0,
    maxAge: 3,
    sortOrder: 1,
  })
  const roomTypeId = await t.mutation(api.accommodation.createRoomType, {
    label: "Twin",
    defaultCapacity: 2,
  })
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-NONADMIN-ORDER",
      bookerName: "Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "nonadmin-a",
      name: "Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      categoryId: categoryId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    })
  })

  const caller = fresh().withIdentity(nonAdminIdentity)
  // Reads are blocked.
  await expect(
    caller.query(api.accommodation.getEventAccommodationConfig, { eventId })
  ).rejects.toThrow("Admin access required")
  await expect(
    caller.query(api.accommodation.getAccommodationCatalog, {})
  ).rejects.toThrow("Admin access required")
  // Event-scoped pricing/config writes are blocked.
  await expect(
    caller.mutation(api.accommodation.upsertEventAccommodationConfig, { eventId })
  ).rejects.toThrow("Admin access required")
  await expect(
    caller.mutation(api.accommodation.upsertEventAccommodationRate, {
      eventId,
      categoryId,
      occupancy: "shared",
      pricePerPersonMinor: 3000,
    })
  ).rejects.toThrow("Admin access required")
  await expect(
    caller.mutation(api.accommodation.upsertEventAccommodationOption, {
      eventId,
      optionId: upgradeOptionId,
      enabled: true,
      priceMinor: 1500,
    })
  ).rejects.toThrow("Admin access required")
  await expect(
    caller.mutation(api.accommodation.upsertEventAccommodationResource, {
      eventId,
      kind: "room",
      roomTypeId,
      count: 3,
    })
  ).rejects.toThrow("Admin access required")
  await expect(
    caller.mutation(api.accommodation.upsertEventAccommodationAgePricing, {
      eventId,
      ageBandCode: "under_3",
      rateType: "percent",
      value: 50,
    })
  ).rejects.toThrow("Admin access required")
  // Global catalog edits are blocked.
  await expect(
    caller.mutation(api.accommodation.updateAccommodationCategory, {
      categoryId,
      label: "Hijacked",
    })
  ).rejects.toThrow("Admin access required")
  // Confirming any order by ID is blocked for a non-admin.
  await expect(
    caller.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
      orderId,
    })
  ).rejects.toThrow("Admin access required")
})

test("an admin confirming an order resolves that order's own event configuration", async () => {
  const t = fresh().withIdentity(adminIdentity)
  // Two fully configured events, each with its own order/selection. The
  // confirmation mutation accepts only an order ID, so the event is always
  // resolved server-side from the order — an admin acting on a different
  // event's context can never cross-apply pricing.
  const ctxA = await seedConfiguredEvent(t)
  const ctxB = await seedConfiguredEvent(t)

  // Read event B's config using event B's ID returns event B's data.
  const responseB = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId: ctxB.eventId,
  })
  expect(responseB.event.eventId).toBe(ctxB.eventId)
  expect(responseB.event.eventId).not.toBe(ctxA.eventId)

  // Confirming event B's order prices from event B's config version and rates.
  const versionB = (await t.query(
    api.accommodation.getEventAccommodationConfig,
    { eventId: ctxB.eventId }
  )).config?.updatedAt
  const result = await t.mutation(
    api.accommodation.confirmAccommodationOrderConfiguration,
    { orderId: ctxB.orderId }
  )
  expect(result.configVersion).toBe(versionB)
  expect(result.orderId).toBe(ctxB.orderId)

  // Event A's order is untouched.
  const responseA = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId: ctxA.eventId,
  })
  expect(responseA.pendingOrderCount).toBe(1)
})

// ---------------------------------------------------------------------------
// Pending impact: truthful, server-derived count and bounded list.
// ---------------------------------------------------------------------------

test("empty pending state reports zero pending orders before Phase 42", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const response = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(response.pendingOrderCount).toBe(0)
  expect(response.pendingOrders).toEqual([])
  expect(response.hasAccommodationSelections).toBe(false)
})

test("pending orders count distinct orders with unconfirmed selection rows only", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
  })

  // Order A: two unconfirmed selection rows -> counts once as pending.
  const orderA = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-PENDING-A",
      bookerName: "Pending A",
      submittedAt: BASE_EVENT_AT,
    })
  })
  for (let i = 0; i < 2; i++) {
    await t.mutation(async (ctx) => {
      const attendeeId = await ctx.db.insert("orderAttendees", {
        orderId: orderA as never,
        attendeeKey: `pending-a-${i}`,
        name: `Attendee ${i}`,
        gender: "unknown",
        sortOrder: i,
      })
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderA as never,
        attendeeId: attendeeId as never,
        categoryId: categoryId as never,
        occupancy: "shared",
        upgradeSelected: false,
        cotSelected: false,
        nightCount: 2,
      })
    })
  }

  // Order B: fully confirmed row -> not pending.
  const orderB = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-CONFIRMED-B",
      bookerName: "Confirmed B",
      submittedAt: BASE_EVENT_AT,
    })
  })
  await t.mutation(async (ctx) => {
    const attendeeId = await ctx.db.insert("orderAttendees", {
      orderId: orderB as never,
      attendeeKey: "confirmed-b",
      name: "Confirmed B",
      gender: "unknown",
      sortOrder: 0,
    })
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: orderB as never,
      attendeeId: attendeeId as never,
      categoryId: categoryId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
    })
  })

  // Order C: no selection rows at all -> not pending.
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-NOSELECT-C",
      bookerName: "No Select C",
      submittedAt: BASE_EVENT_AT,
    })
  })

  const response = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  expect(response.pendingOrderCount).toBe(1)
  expect(response.pendingOrders).toHaveLength(1)
  expect(response.pendingOrders[0]).toMatchObject({
    bookingRef: "BK-PENDING-A",
    bookerName: "Pending A",
    selectionCount: 2,
  })
  // Selection rows exist for this event, so the pre-signup empty copy is off.
  expect(response.hasAccommodationSelections).toBe(true)
})

test("pending order count stays exact beyond the first 200 orders", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })

  // 205 distinct pending orders — past the old `.take(200)` cutoff. Each
  // order carries one unconfirmed selection row.
  const PENDING_BEYOND_CUTOFF = 205
  for (let i = 0; i < PENDING_BEYOND_CUTOFF; i++) {
    await t.mutation(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        eventId: eventId as never,
        source: "internal",
        bookingRef: `BK-BULK-${i}`,
        bookerName: `Bulk Buyer ${i}`,
        submittedAt: BASE_EVENT_AT + i,
      })
      const attendeeId = await ctx.db.insert("orderAttendees", {
        orderId: orderId as never,
        attendeeKey: `bulk-${i}`,
        name: `Bulk Buyer ${i}`,
        gender: "unknown",
        sortOrder: 0,
      })
      return await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: categoryId as never,
        occupancy: "shared",
        upgradeSelected: false,
        cotSelected: false,
        nightCount: 2,
      })
    })
  }

  const response = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })
  // The exact count reports every pending order — none are hidden past the
  // display cutoff — while the returned list stays bounded for the UI.
  expect(response.pendingOrderCount).toBe(PENDING_BEYOND_CUTOFF)
  expect(response.pendingOrders.length).toBeLessThan(PENDING_BEYOND_CUTOFF)
  expect(response.pendingOrders.length).toBeGreaterThan(0)
  expect(response.hasAccommodationSelections).toBe(true)
})

// ---------------------------------------------------------------------------
// Version boundary: every event-scoped pricing write advances the single
// eventAccommodationConfig.updatedAt; catalog label edits do not.
// ---------------------------------------------------------------------------

test("rate, option, resource and age-pricing writes advance the config version", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  const upgradeOptionId = await t.mutation(api.accommodation.createAccommodationOption, {
    code: "superior_upgrade",
    label: "Superior Upgrade",
    kind: "upgrade",
    unit: "per_night",
  })
  await t.mutation(api.accommodation.createAccommodationAgeBand, {
    code: "under_3",
    label: "Under 3",
    minAge: 0,
    maxAge: 3,
    sortOrder: 1,
  })
  const roomTypeId = await t.mutation(api.accommodation.createRoomType, {
    label: "Twin",
    defaultCapacity: 2,
  })

  const readVersion = async () => {
    const response = await t.query(api.accommodation.getEventAccommodationConfig, {
      eventId,
    })
    return response.config?.updatedAt ?? null
  }

  // Saving a rate before any config exists initializes the singleton config.
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId,
    occupancy: "single",
    pricePerPersonMinor: 9000,
  })
  const afterRate = await readVersion()
  expect(afterRate).not.toBeNull()

  // A later stay-config save (config upsert) advances the version too.
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    breakfastIncluded: true,
  })
  const afterConfig = await readVersion()
  expect(afterConfig).not.toBe(afterRate)

  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: upgradeOptionId,
    enabled: true,
    priceMinor: 1500,
  })
  const afterOption = await readVersion()
  expect(afterOption).not.toBe(afterConfig)

  await t.mutation(api.accommodation.upsertEventAccommodationResource, {
    eventId,
    kind: "room",
    roomTypeId,
    count: 3,
  })
  const afterResource = await readVersion()
  expect(afterResource).not.toBe(afterOption)

  await t.mutation(api.accommodation.upsertEventAccommodationAgePricing, {
    eventId,
    ageBandCode: "under_3",
    rateType: "percent",
    value: 50,
  })
  const afterAgePricing = await readVersion()
  expect(afterAgePricing).not.toBe(afterResource)
})

test("catalog label edits do not advance the config version", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const categoryId = await t.mutation(api.accommodation.createAccommodationCategory, {
    code: "standard",
    label: "Standard",
    sortOrder: 1,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
  })
  const before = (await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })).config?.updatedAt

  await t.mutation(api.accommodation.updateAccommodationCategory, {
    categoryId,
    description: "A nicer standard description",
  })

  const after = (await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId,
  })).config?.updatedAt
  expect(after).toBe(before)
})

// ---------------------------------------------------------------------------
// No eager repricing: a rate save never rewrites orders or selection rows.
// ---------------------------------------------------------------------------

test("a rate save leaves order selection rows untouched", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const ctx = await seedConfiguredEvent(t)

  const selectionBefore = await t.mutation(async (db) => {
    const rows = await db.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", ctx.orderId as never)
      )
      .take(10)
    return rows.map((row) => ({
      confirmedAt: row.confirmedAt ?? null,
      configVersion: row.configVersion ?? null,
      priceSnapshot: row.priceSnapshot ?? null,
      upgradeSelected: row.upgradeSelected,
    }))
  })

  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: ctx.eventId,
    categoryId: ctx.categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 4000,
  })

  const selectionAfter = await t.mutation(async (db) => {
    const rows = await db.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", ctx.orderId as never)
      )
      .take(10)
    return rows.map((row) => ({
      confirmedAt: row.confirmedAt ?? null,
      configVersion: row.configVersion ?? null,
      priceSnapshot: row.priceSnapshot ?? null,
      upgradeSelected: row.upgradeSelected,
    }))
  })

  expect(selectionAfter).toEqual(selectionBefore)
  // Explicit €0 prices are preserved by the upsert path.
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: ctx.eventId,
    categoryId: ctx.categorySuperiorId,
    occupancy: "shared",
    pricePerPersonMinor: 0,
  })
  const { rates } = (await t.query(
    api.accommodation.getEventAccommodationConfig,
    { eventId: ctx.eventId }
  )) as {
    rates: Array<{
      pricePerPersonMinor: number
      categoryCode: string | null
      occupancy: string
    }>
  }
  expect(rates.find((rate) => rate.occupancy === "shared")?.pricePerPersonMinor).toBe(4000)
  const superiorRate = rates.find((rate) => rate.categoryCode === "superior")
  expect(superiorRate?.pricePerPersonMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// Confirmation: one snapshot boundary per selection, server-resolved, and the
// canonical amount stays fixed after a later rate edit.
// ---------------------------------------------------------------------------

test("confirmation persists a complete snapshot boundary on every selection", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const ctx = await seedConfiguredEvent(t)

  const configVersion = (await t.query(
    api.accommodation.getEventAccommodationConfig,
    { eventId: ctx.eventId }
  )).config?.updatedAt

  const result = await t.mutation(
    api.accommodation.confirmAccommodationOrderConfiguration,
    { orderId: ctx.orderId }
  )
  expect(result.configVersion).toBe(configVersion)
  expect(result.confirmedSelectionCount).toBe(1)
  expect(result.orderId).toBe(ctx.orderId)

  const rows = await t.mutation(async (db) => {
    return await db.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", ctx.orderId as never)
      )
      .take(10)
  })
  expect(rows).toHaveLength(1)
  expect(rows[0].confirmedAt).toEqual(expect.any(Number))
  expect(rows[0].configVersion).toBe(configVersion)
  expect(rows[0].priceSnapshot).toEqual({
    baseRatePerNightMinor: 3000,
    upgradeRatePerNightMinor: 1500,
    cotRatePerNightMinor: 500,
    totalNights: 2,
    coveredNights: 0,
    categoryIsSuperior: false,
    upgradeSelected: false,
    cotSelected: false,
    ageBandCode: "18_plus",
  })

  // The order is no longer pending after confirmation.
  const response = await t.query(api.accommodation.getEventAccommodationConfig, {
    eventId: ctx.eventId,
  })
  expect(response.pendingOrderCount).toBe(0)
})

test("confirmation rejects orders without selections, missing config, and repeats", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const ctx = await seedConfiguredEvent(t)

  // Repeat confirmation of the same order is rejected.
  await t.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
    orderId: ctx.orderId,
  })
  await expect(
    t.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
      orderId: ctx.orderId,
    })
  ).rejects.toThrow(/already has confirmed accommodation selections/)

  // An order with no selection rows is rejected.
  const emptyOrder = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-EMPTY-ORDER",
      bookerName: "Empty Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  await expect(
    t.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
      orderId: emptyOrder,
    })
  ).rejects.toThrow(/no accommodation selections/)

  // Missing event config fails closed before any row is touched.
  await t.mutation(async (db) => {
    const config = await db.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", ctx.eventId as never))
      .first()
    if (config) {
      await db.db.delete("eventAccommodationConfig", config._id)
    }
  })
  const unconfirmedOrder = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-NOCONFIG",
      bookerName: "No Config Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  await t.mutation(async (db) => {
    const attendeeId = await db.db.insert("orderAttendees", {
      orderId: unconfirmedOrder as never,
      attendeeKey: "nocfg-a",
      name: "No Config Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
    return await db.db.insert("orderAccommodationSelections", {
      orderId: unconfirmedOrder as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
    })
  })
  await expect(
    t.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
      orderId: unconfirmedOrder,
    })
  ).rejects.toThrow(/configuration is required/)
})

test("confirmation rejects selections that cannot be priced", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const ctx = await seedConfiguredEvent(t)

  // Remove the standard rate so the existing selection is unpriceable.
  await t.mutation(async (db) => {
    const rate = await db.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId_and_categoryId_and_occupancy", (q) =>
        q
          .eq("eventId", ctx.eventId as never)
          .eq("categoryId", ctx.categoryStandardId as never)
          .eq("occupancy", "shared")
      )
      .first()
    if (rate) {
      await db.db.delete("eventAccommodationRates", rate._id)
    }
  })
  await expect(
    t.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
      orderId: ctx.orderId,
    })
  ).rejects.toThrow(/No rate is configured/)
})

test("confirmed order keeps its canonical amount after a later rate edit", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const ctx = await seedConfiguredEvent(t)

  const before = await loadOrderAmountDue(t, ctx.orderId)
  // ticket 2000 + base 2×3000 = 8000
  expect(before?.amountDueMinor).toBe(8000)

  await t.mutation(api.accommodation.confirmAccommodationOrderConfiguration, {
    orderId: ctx.orderId,
  })

  // Admin edits the standard rate from €30 to €40 after confirmation.
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: ctx.eventId,
    categoryId: ctx.categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 4000,
  })

  // The confirmed order still prices from its snapshot: 8000, never 10000.
  const after = await loadOrderAmountDue(t, ctx.orderId)
  expect(after?.amountDueMinor).toBe(8000)
  expect(after?.accommodationLines).toHaveLength(1)
  expect(after?.accommodationLines[0]?.ratePerNightMinor).toBe(3000)
})
