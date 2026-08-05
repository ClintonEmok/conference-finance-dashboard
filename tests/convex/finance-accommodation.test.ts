/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "@/convex/_generated/api"
import schema from "@/convex/schema"
import { loadOrderAmountDueBreakdowns } from "@/convex/finance"
import { buildAccommodationPriceSnapshot } from "@/lib/domain/finance/accommodation-amounts"

const modules = import.meta.glob("../../convex/**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

type SeedContext = {
  eventId: string
  categoryStandardId: string
  categorySuperiorId: string
  ticketIncludedId: string
  ticketNotIncludedId: string
  attendeeIncludedId: string
  attendeeNotIncludedId: string
}

const BASE_EVENT_AT = 1_750_000_000_000

async function seedEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "finance-conference",
      title: "Finance Conference",
      startsAt: BASE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_EVENT_AT,
    })
  })

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

  const ticketIncludedId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Ticket with accommodation",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      updatedAt: BASE_EVENT_AT,
    })
  })
  const ticketNotIncludedId = await t.mutation(async (ctx) => {
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

  // Event config: base 2-night window, breakfast included.
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: BASE_EVENT_AT - 2 * 24 * 60 * 60 * 1000,
      baseCheckOutAt: BASE_EVENT_AT,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      defaultCategoryId: categoryStandardId as never,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: BASE_EVENT_AT,
    })
  })

  // Rates: standard/shared €30, superior/shared €45 per person per night.
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      pricePerPersonMinor: 3000,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: categorySuperiorId as never,
      occupancy: "shared",
      pricePerPersonMinor: 4500,
    })
  })

  // Options: superior upgrade €15/night, cot €5/night (enabled).
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: upgradeOptionId as never,
      enabled: true,
      priceMinor: 1500,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationOptions", {
      eventId: eventId as never,
      optionId: cotOptionId as never,
      enabled: true,
      priceMinor: 500,
      eligibilityAgeBandCode: "under_3",
    })
  })

  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-TEST01",
      bookerName: "Jane Doe",
      bookerEmail: "jane@example.com",
      submittedAt: BASE_EVENT_AT,
    })
  })

  const attendeeIncludedId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "attendee-included",
      name: "Jane Doe",
      gender: "female",
      sortOrder: 0,
    })
  })
  const attendeeNotIncludedId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "attendee-not-included",
      name: "John Doe",
      gender: "male",
      sortOrder: 1,
    })
  })

  // One ticket per attendee (quantity 1 per Phase 42 contract).
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeIncludedId as never,
      ticketTypeId: ticketIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeNotIncludedId as never,
      ticketTypeId: ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 1,
    })
  })

  return {
    eventId: String(eventId),
    categoryStandardId: String(categoryStandardId),
    categorySuperiorId: String(categorySuperiorId),
    ticketIncludedId: String(ticketIncludedId),
    ticketNotIncludedId: String(ticketNotIncludedId),
    attendeeIncludedId: String(attendeeIncludedId),
    attendeeNotIncludedId: String(attendeeNotIncludedId),
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
    if (!breakdown) {
      return null
    }
    return {
      amountDueMinor: breakdown.amountDueMinor,
      amountDueByAttendeeId: Object.fromEntries(breakdown.amountDueByAttendeeId),
      accommodationLines: breakdown.accommodationLines,
    }
  })
}

// ---------------------------------------------------------------------------
// Legacy orders: no accommodation selections → €0 contribution, ticket-only
// total, no receipt lines, unchanged behavior.
// ---------------------------------------------------------------------------

test("legacy order with no selections keeps its ticket-only total and no lines", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)
  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-LEGACY",
      bookerName: "Legacy Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "legacy-attendee",
      name: "Legacy Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })

  const breakdown = await loadOrderAmountDue(t, String(order))
  expect(breakdown?.amountDueMinor).toBe(2000)
  expect(
    breakdown?.amountDueByAttendeeId[String(attendeeId)]
  ).toBe(2000)
  expect(breakdown?.accommodationLines).toEqual([])

  const booking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-20260411-LEGACY",
  })
  expect(booking?.totalAmountMinor).toBe(2000)
  expect(booking?.accommodationLines).toEqual([])
})

// ---------------------------------------------------------------------------
// Live-config orders: unconfirmed selections price from the current event
// configuration and re-price when a rate is edited.
// ---------------------------------------------------------------------------

test("live-config order re-prices when the event rate changes", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-LIVE01",
      bookerName: "Live Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "live-a",
      name: "Live Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: true,
      cotSelected: false,
      nightCount: 3,
    })
  })

  const before = await loadOrderAmountDue(t, String(order))
  // ticket 2000 + base 3×3000 (no covered nights) + upgrade 3×1500 = 15500
  expect(before?.amountDueMinor).toBe(15500)
  expect(before?.accommodationLines).toHaveLength(2)
  expect(before?.accommodationLines[0]).toMatchObject({
    kind: "accommodation",
    label: "Accommodation",
    nights: 3,
    ratePerNightMinor: 3000,
    chargeMinor: 9000,
  })
  expect(before?.accommodationLines[1]).toMatchObject({
    kind: "superior_upgrade",
    label: "Superior upgrade",
    nights: 3,
    ratePerNightMinor: 1500,
    chargeMinor: 4500,
  })

  // Admin edits the standard rate from €30 to €40.
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
      await db.db.patch("eventAccommodationRates", rate._id, {
        pricePerPersonMinor: 4000,
      })
    }
  })

  const after = await loadOrderAmountDue(t, String(order))
  // ticket 2000 + base 3×4000 + upgrade 3×1500 = 18500
  expect(after?.amountDueMinor).toBe(18500)
  expect(after?.accommodationLines[0]?.ratePerNightMinor).toBe(4000)

  // Booking lookup and public tracking agree on the live canonical total.
  const booking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-20260411-LIVE01",
  })
  expect(booking?.totalAmountMinor).toBe(18500)
  expect(booking?.accommodationLines).toHaveLength(2)
  expect(booking?.accommodationLines[0]?.chargeMinor).toBe(12000)

  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-20260411-LIVE01",
  })
  expect(tracking?.payment.totalDueMinor).toBe(18500)
  expect(tracking?.order.amountDueMinor).toBe(18500)
})

// ---------------------------------------------------------------------------
// Confirmed orders: snapshot + configVersion keep the total fixed after the
// same rate edit; the loader fails closed on confirmed-without-snapshot.
// ---------------------------------------------------------------------------

test("confirmed order stays fixed after a rate edit using its snapshot", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  // Build the same accommodation selection against the current config and
  // persist the pure module's snapshot (what Phase 44 will do atomically).
  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: ctx.attendeeNotIncludedId,
      categoryCode: "standard",
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      superiorUpgradePriceMinor: 1500,
      cotPriceMinor: 500,
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })
  expect(snapshot).toEqual({
    baseRatePerNightMinor: 3000,
    upgradeRatePerNightMinor: 1500,
    cotRatePerNightMinor: 500,
    totalNights: 2,
    coveredNights: 0,
    categoryIsSuperior: false,
    upgradeSelected: false,
    cotSelected: false,
    ageBandCode: "18_plus",
    cotEligibilityAgeBandCode: null,
  })

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-CONF01",
      bookerName: "Confirmed Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "conf-a",
      name: "Confirmed Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: snapshot,
    })
  })

  const before = await loadOrderAmountDue(t, String(order))
  // ticket 2000 + snapshot base 2×3000 = 8000
  expect(before?.amountDueMinor).toBe(8000)

  // Same rate edit as the live test: standard €30 → €40.
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
      await db.db.patch("eventAccommodationRates", rate._id, {
        pricePerPersonMinor: 4000,
      })
    }
  })

  // The confirmed order keeps its snapshot total — never re-priced.
  const after = await loadOrderAmountDue(t, String(order))
  expect(after?.amountDueMinor).toBe(8000)
  expect(after?.accommodationLines[0]?.ratePerNightMinor).toBe(3000)

  // Booking lookup and public tracking expose the same fixed total.
  const booking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-20260411-CONF01",
  })
  expect(booking?.totalAmountMinor).toBe(8000)
  expect(booking?.accommodationLines).toHaveLength(1)
  expect(booking?.accommodationLines[0]?.ratePerNightMinor).toBe(3000)

  const tracking = await t.query(api.publicTracking.getByBookingRef, {
    bookingRef: "BK-20260411-CONF01",
  })
  expect(tracking?.payment.totalDueMinor).toBe(8000)
})

test("loader fails closed when a confirmed selection lacks a priceSnapshot", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-BADSNAP",
      bookerName: "Broken Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "bad-snap",
      name: "Broken Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: undefined,
    })
  })

  await expect(loadOrderAmountDue(t, String(order))).rejects.toThrow(
    /confirmed.*missing a complete priceSnapshot/
  )
})

test("loader fails closed when confirmedAt is a malformed epoch timestamp", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-EPOCH",
      bookerName: "Epoch Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "epoch-a",
      name: "Epoch Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: ctx.attendeeNotIncludedId,
      categoryCode: "standard",
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      superiorUpgradePriceMinor: 1500,
      cotPriceMinor: 500,
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
      // Epoch `confirmedAt` must still count as confirmed (field presence) —
      // never silently re-priced as a live row.
      confirmedAt: 0,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: snapshot,
    })
  })

  await expect(loadOrderAmountDue(t, String(order))).rejects.toThrow(
    /confirmed.*missing a complete priceSnapshot/
  )
})

test("loader fails closed when a confirmed row lacks configVersion", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-NOCFGVER",
      bookerName: "No Config Version Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "nocfg-a",
      name: "No Config Version Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: ctx.attendeeNotIncludedId,
      categoryCode: "standard",
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      superiorUpgradePriceMinor: 1500,
      cotPriceMinor: 500,
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: undefined,
      priceSnapshot: snapshot,
    })
  })

  await expect(loadOrderAmountDue(t, String(order))).rejects.toThrow(
    /confirmed.*missing a complete priceSnapshot/
  )
})

test("confirmed row prices from its snapshot even when event config is missing", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: ctx.attendeeNotIncludedId,
      categoryCode: "standard",
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      superiorUpgradePriceMinor: 1500,
      cotPriceMinor: 500,
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-NOCFG01",
      bookerName: "No Config Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "nocfg-conf",
      name: "No Config Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: snapshot,
    })
  })

  // Remove the event accommodation config entirely: a confirmed row must still
  // be priced from its snapshot instead of silently degrading to €0.
  await t.mutation(async (db) => {
    const config = await db.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", ctx.eventId as never))
      .first()
    if (config) {
      await db.db.delete("eventAccommodationConfig", config._id)
    }
  })

  const breakdown = await loadOrderAmountDue(t, String(order))
  // ticket 2000 + snapshot base 2×3000 = 8000 — unchanged by config removal.
  expect(breakdown?.amountDueMinor).toBe(8000)
  expect(breakdown?.accommodationLines[0]?.ratePerNightMinor).toBe(3000)
})

// ---------------------------------------------------------------------------
// Booking lookup exposes canonical total + optional lines for live orders.
// ---------------------------------------------------------------------------

test("booking lookup exposes canonical accommodation lines for a live order", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-LIVE02",
      bookerName: "Lines Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "lines-a",
      name: "Lines Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: true,
      ageBandCode: "under_3",
      nightCount: 2,
    })
  })

  const breakdown = await loadOrderAmountDue(t, String(order))
  // ticket 2000 + base 2×3000 + cot 2×500 = 9000
  expect(breakdown?.amountDueMinor).toBe(9000)
  expect(breakdown?.accommodationLines.map((line) => line.kind)).toEqual([
    "accommodation",
    "cot",
  ])

  const booking = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: "BK-20260411-LIVE02",
  })
  expect(booking?.totalAmountMinor).toBe(9000)
  expect(booking?.accommodationLines).toHaveLength(2)
  expect(booking?.accommodationLines[1]).toMatchObject({
    label: "Cot",
    nights: 2,
    ratePerNightMinor: 500,
    chargeMinor: 1000,
  })
})

// ---------------------------------------------------------------------------
// Multi-order loader: child rows are grouped per order and catalog references
// are resolved once through a bounded cache, so a multi-order consumer keeps
// a bounded read shape while every order derives its own total.
// ---------------------------------------------------------------------------

test("multi-order loader derives each order's total from grouped child rows", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const firstOrderId = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-MULTI01",
      bookerName: "First Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const firstAttendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: firstOrderId as never,
      attendeeKey: "multi-a",
      name: "First Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: firstOrderId as never,
      attendeeId: firstAttendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: firstOrderId as never,
      attendeeId: firstAttendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      nightCount: 2,
    })
  })

  const secondOrderId = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-MULTI02",
      bookerName: "Second Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const secondAttendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: secondOrderId as never,
      attendeeKey: "multi-b",
      name: "Second Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: secondOrderId as never,
      attendeeId: secondAttendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: secondOrderId as never,
      attendeeId: secondAttendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: true,
      cotSelected: false,
      nightCount: 2,
    })
  })

  const breakdowns = await t.query(async (db) => {
    const loaderCtx =
      db as unknown as Parameters<typeof loadOrderAmountDueBreakdowns>[0]
    const loaded = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: firstOrderId as never },
      { _id: secondOrderId as never },
    ])
    return Object.fromEntries(
      Array.from(loaded.entries()).map(([key, value]) => [
        key,
        {
          amountDueMinor: value.amountDueMinor,
          amountDueByAttendeeId: Object.fromEntries(
            value.amountDueByAttendeeId
          ),
          accommodationLines: value.accommodationLines,
        },
      ])
    )
  })

  // Order 1: ticket 2000 + base 2×3000 = 8000
  expect(breakdowns?.[String(firstOrderId)]?.amountDueMinor).toBe(8000)
  expect(
    breakdowns?.[String(firstOrderId)]?.amountDueByAttendeeId[
      String(firstAttendeeId)
    ]
  ).toBe(8000)
  expect(
    breakdowns?.[String(firstOrderId)]?.accommodationLines
  ).toHaveLength(1)

  // Order 2: ticket 2000 + base 2×3000 + upgrade 2×1500 = 11000
  expect(breakdowns?.[String(secondOrderId)]?.amountDueMinor).toBe(11000)
  expect(
    breakdowns?.[String(secondOrderId)]?.amountDueByAttendeeId[
      String(secondAttendeeId)
    ]
  ).toBe(11000)
  expect(
    breakdowns?.[String(secondOrderId)]?.accommodationLines
  ).toHaveLength(2)
})

// ---------------------------------------------------------------------------
// Read boundary: orders with more than 100 selections must be fully priced —
// the loader reads all child rows through bounded async iteration instead of
// silently truncating at a fixed `.take(100)`.
// ---------------------------------------------------------------------------

test("prices orders with more than 100 selections without truncation", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  const order = await t.mutation(async (db) => {
    const orderId = await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-BIG01",
      bookerName: "Big Buyer",
      submittedAt: BASE_EVENT_AT,
    })
    // 120 attendees, each with one ticket selection and one accommodation
    // selection — well past the old fixed 100-row read limit.
    for (let i = 0; i < 120; i++) {
      const attendeeId = await db.db.insert("orderAttendees", {
        orderId: orderId as never,
        attendeeKey: `big-${i}`,
        name: `Attendee ${i}`,
        gender: "unknown",
        sortOrder: i,
      })
      await db.db.insert("orderTicketSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        ticketTypeId: ctx.ticketNotIncludedId as never,
        quantity: 1,
        sortOrder: i,
      })
      await db.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        categoryId: ctx.categoryStandardId as never,
        occupancy: "shared",
        upgradeSelected: false,
        cotSelected: false,
        nightCount: 2,
      })
    }
    return orderId
  })

  const breakdown = await loadOrderAmountDue(t, String(order))
  // 120 × (ticket 2000 + base 2×3000) = 120 × 8000 = 960000
  expect(breakdown?.amountDueMinor).toBe(960000)
  expect(breakdown?.accommodationLines).toHaveLength(120)
})

// ---------------------------------------------------------------------------
// Confirmed immutability at the loader level: mutating the live selection
// flags/category of a confirmed row must never re-price it — the persisted
// snapshot is self-contained (CR-02 regression).
// ---------------------------------------------------------------------------

test("confirmed order is not re-priced when live selection flags are edited", async () => {
  const t = fresh()
  const ctx = await seedEvent(t)

  // Confirm with upgrade selected: ticket 2000 + base 2×3000 + upgrade 2×1500
  // = 11000.
  const snapshot = buildAccommodationPriceSnapshot({
    selection: {
      attendeeId: ctx.attendeeNotIncludedId,
      categoryCode: "standard",
      occupancy: "shared",
      upgradeSelected: true,
      cotSelected: false,
      ageBandCode: "18_plus",
      nightCount: 2,
    },
    pricing: {
      baseRatePerNightMinor: 3000,
      superiorUpgradePriceMinor: 1500,
      cotPriceMinor: 500,
      ticketAccommodationIncluded: false,
      eventBaseNights: 2,
    },
  })

  const order = await t.mutation(async (db) => {
    return await db.db.insert("orders", {
      eventId: ctx.eventId as never,
      source: "internal",
      bookingRef: "BK-20260411-MUTFLAG",
      bookerName: "Flag Buyer",
      submittedAt: BASE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (db) => {
    return await db.db.insert("orderAttendees", {
      orderId: order as never,
      attendeeKey: "flag-a",
      name: "Flag Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  })
  await t.mutation(async (db) => {
    return await db.db.insert("orderTicketSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ctx.ticketNotIncludedId as never,
      quantity: 1,
      sortOrder: 0,
    })
  })
  const selectionId = await t.mutation(async (db) => {
    return await db.db.insert("orderAccommodationSelections", {
      orderId: order as never,
      attendeeId: attendeeId as never,
      categoryId: ctx.categoryStandardId as never,
      occupancy: "shared",
      upgradeSelected: true,
      cotSelected: false,
      nightCount: 2,
      confirmedAt: BASE_EVENT_AT,
      configVersion: BASE_EVENT_AT,
      priceSnapshot: snapshot,
    })
  })

  const before = await loadOrderAmountDue(t, String(order))
  expect(before?.amountDueMinor).toBe(11000)

  // Live selection edited after confirmation: upgrade deselected, cot
  // selected, category moved to superior. The confirmed amount must stay
  // fixed at 11000 — never re-derived from the mutated flags.
  await t.mutation(async (db) => {
    return await db.db.patch(
      "orderAccommodationSelections",
      selectionId as never,
      {
        categoryId: ctx.categorySuperiorId as never,
        upgradeSelected: false,
        cotSelected: true,
        ageBandCode: "under_3",
      }
    )
  })

  const after = await loadOrderAmountDue(t, String(order))
  expect(after?.amountDueMinor).toBe(11000)
  expect(after?.accommodationLines.map((line) => line.kind)).toEqual([
    "accommodation",
    "superior_upgrade",
  ])
})
