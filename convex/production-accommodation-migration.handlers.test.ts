/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import {
  buildLegacyPreviewSnapshot,
  LEGACY_AUDIT_COUNTS,
  LEGACY_BASE_CHECK_IN_AT,
  LEGACY_DAY_MS,
  LEGACY_EVENT_SLUG,
} from "../tests/fixtures/legacy-preview.snapshot"

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

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

// ---------------------------------------------------------------------------
// Seeding: insert the sanitized fixture snapshot with logical-ID remapping,
// then apply the production-shape migration fixture (anchors, entry tickets,
// Single Room ticket, legacy hotel names).
// ---------------------------------------------------------------------------

const SEED_ORDER: Array<{ table: string; refs: string[] }> = [
  { table: "events", refs: [] },
  { table: "accommodationCategories", refs: [] },
  { table: "accommodationOptions", refs: [] },
  { table: "accommodationRoomTypes", refs: ["categoryId"] },
  { table: "accommodationHotels", refs: [] },
  { table: "accommodationEventHotels", refs: ["eventId", "hotelId"] },
  { table: "accommodationRooms", refs: ["hotelId", "roomTypeId"] },
  { table: "accommodationSlots", refs: ["eventId", "hotelId", "roomId"] },
  {
    table: "eventAccommodationConfig",
    refs: ["eventId", "defaultCategoryId"],
  },
  { table: "eventAccommodationRates", refs: ["eventId", "categoryId"] },
  {
    table: "eventAccommodationOptions",
    refs: ["eventId", "optionId"],
  },
  {
    table: "eventAccommodationResources",
    refs: ["eventId", "roomTypeId"],
  },
  { table: "ticketTypes", refs: ["eventId", "roomTypeId"] },
  { table: "orders", refs: ["eventId"] },
  { table: "orderAttendees", refs: ["orderId"] },
  {
    table: "orderTicketSelections",
    refs: ["orderId", "attendeeId", "ticketTypeId"],
  },
  {
    table: "orderAssignments",
    refs: ["orderId", "attendeeId", "slotId"],
  },
  {
    table: "orderAccommodationSelections",
    refs: ["orderId", "attendeeId", "categoryId"],
  },
]

async function seedLegacyPreview(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<Map<string, string>> {
  const snapshot = buildLegacyPreviewSnapshot()
  const idMap = new Map<string, string>()
  for (const { table, refs } of SEED_ORDER) {
    for (const row of snapshot[table] ?? []) {
      const logicalId = String(row._id)
      const insertRow: Record<string, unknown> = { ...row }
      delete insertRow._id
      for (const ref of refs) {
        const value = insertRow[ref]
        if (typeof value === "string" && idMap.has(value)) {
          insertRow[ref] = idMap.get(value)
        }
      }
      const realId = await t.mutation(async (ctx) => {
        return await ctx.db.insert(
          table as Parameters<typeof ctx.db.insert>[0],
          insertRow as never
        )
      })
      idMap.set(logicalId, String(realId))
    }
  }
  return idMap
}

/**
 * The production-shaped migration fixture: the audited legacy shape plus the
 * two room anchors, the five entry tickets (four age-band tickets in
 * deterministic order plus the Single Room ticket), and the two legacy hotels
 * renamed to their production identities. With `keepAssignments: false` every
 * legacy assignment is removed so Step 3's preflight is clear.
 */
async function seedMigrationFixture(
  t: TestConvexForDataModel<GenericDataModel>,
  options: { keepAssignments?: boolean } = {}
): Promise<Map<string, string>> {
  const idMap = await seedLegacyPreview(t)

  await t.mutation(async (ctx) => {
    await ctx.db.patch(
      "accommodationHotels",
      idMap.get("hotel_koningshof") as never,
      { name: "Holiday Inn Express" }
    )
    await ctx.db.patch(
      "accommodationHotels",
      idMap.get("hotel_heidepark") as never,
      { name: "Ibis Styles Almere" }
    )
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
  idMap.set("rt_double_anchor", String(doubleAnchorId))
  idMap.set("rt_single_anchor", String(singleAnchorId))

  const entryLabels = ["0-2 Entry", "3-11 Entry", "12-17 Entry", "18+ Entry"]
  const snapshotTicketIds = [
    "ticket_standard_shared",
    "ticket_standard_single",
    "ticket_legacy_shared",
    "ticket_legacy_single",
  ]
  await t.mutation(async (ctx) => {
    for (let index = 0; index < snapshotTicketIds.length; index += 1) {
      await ctx.db.patch(
        "ticketTypes",
        idMap.get(snapshotTicketIds[index]) as never,
        {
          label: entryLabels[index],
          sortOrder: index,
        }
      )
    }
  })
  const singleRoomTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: idMap.get("evt_divine_redesign") as never,
      label: "Single Room",
      priceMinor: 35000,
      isActive: true,
      visibility: "public" as const,
      availabilityState: "selectable" as const,
      sortOrder: 4,
      updatedAt: LEGACY_BASE_CHECK_IN_AT,
    })
  })
  idMap.set("ticket_single_room", String(singleRoomTicketId))

  if (options.keepAssignments === false) {
    await t.mutation(async (ctx) => {
      const rows = await ctx.db.query("orderAssignments").take(2000)
      for (const row of rows) {
        await ctx.db.delete(
          "orderAssignments",
          (row as { _id: Id<"orderAssignments"> })._id
        )
      }
    })
  }

  return idMap
}

// ---------------------------------------------------------------------------
// Guards: every migration fails closed before the event lookup on an empty
// database, and cloud/site equivalence passes the guard.
// ---------------------------------------------------------------------------

const MUTATION_REFS = [
  ["applySimplified", internal.applySimplifiedDivineConferenceAccommodation.default],
  ["backfill", internal.backfillLegacyAccommodationPreferences.default],
  ["applyKoningshof", internal.applyKoningshofAccommodationInventory.default],
] as const

test("guards: authorize:false, missing detection, missing allowlist, malformed and mismatched slugs fail closed before any read; cloud/site equivalence passes", async () => {
  const t = fresh()

  for (const [name, mutationRef] of MUTATION_REFS) {
    // Explicitly denied authorization -> rejected before any database read.
    await expect(
      t.mutation(mutationRef, {
        authorize: false,
        allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
      })
    ).rejects.toThrow("AUTHORIZATION_REQUIRED")

    // Detected deployment identity unavailable -> fail closed (no reads/writes;
    // the empty DB would otherwise report 'event not found').
    const previousSiteUrl = process.env.CONVEX_SITE_URL
    delete process.env.CONVEX_SITE_URL
    try {
      await expect(
        t.mutation(mutationRef, {
          authorize: true,
          allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
        })
      ).rejects.toThrow("DEPLOYMENT_UNKNOWN")
    } finally {
      process.env.CONVEX_SITE_URL = previousSiteUrl
    }

    // No allowed deployment URL -> fail closed (no env fallback exists).
    await expect(
      t.mutation(mutationRef, { authorize: true })
    ).rejects.toThrow("ALLOWLIST_UNAVAILABLE")

    // Malformed allowed URL -> fail closed with the deterministic code.
    await expect(
      t.mutation(mutationRef, {
        authorize: true,
        allowedDeploymentUrl: "https://evil.example.com",
      })
    ).rejects.toThrow("INVALID_DEPLOYMENT_URL")

    // Valid but mismatched deployment slug -> fail closed.
    await expect(
      t.mutation(mutationRef, {
        authorize: true,
        allowedDeploymentUrl: "https://other-deploy.convex.site",
      })
    ).rejects.toThrow("WRONG_DEPLOYMENT")

    // `.convex.cloud` (with trailing slash) and `.convex.site` are the same
    // deployment slug: the guard passes and the empty DB reports the event.
    await expect(
      t.mutation(mutationRef, {
        authorize: true,
        allowedDeploymentUrl: "https://test-preview.convex.cloud/",
      })
    ).rejects.toThrow("Event with slug")
    expect(name).toBeTruthy()
  }
})

// ---------------------------------------------------------------------------
// Step 0/1: locked tickets + configuration/catalog, idempotent, no inventory
// ---------------------------------------------------------------------------

test("Step 0/1 converges the locked tickets/categories/room types/rates/config/options and re-run creates no duplicates", async () => {
  const t = fresh()
  const idMap = await seedMigrationFixture(t)

  const first = await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )
  expect(first).toMatchObject({
    slug: LEGACY_EVENT_SLUG,
    entryTicketsRenamed: 4,
    entryTicketsPriced: 4,
    ticketsAnchored: 5,
    ticketsIncluded: 1,
    singleRoomTicketPriced: 0,
    categoriesCreated: 1,
    categoriesUpdated: 2,
    roomTypesCreated: 10,
    roomTypesUpdated: 0,
    anchorsPatched: 2,
    ratesCreated: 0,
    ratesUpdated: 0,
    configCreated: 0,
    configUpdated: 0,
    catalogOptionsCreated: 1,
    eventOptionsEnabled: 1,
    eventOptionPricesUpdated: 0,
  })

  const doubleAnchorId = idMap.get("rt_double_anchor")
  const singleAnchorId = idMap.get("rt_single_anchor")

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
    doubleAnchorId,
    doubleAnchorId,
    doubleAnchorId,
    doubleAnchorId,
    singleAnchorId,
  ])
  for (const ticket of tickets) {
    expect(ticket.accommodationIncluded).toBe(true)
  }

  const standardCategoryId = idMap.get("cat_standard")
  const categories = await t.query(async (ctx) => {
    const rows = await ctx.db.query("accommodationCategories").take(20)
    return rows
      .map((row) => ({
        code: row.code,
        label: row.label,
        sortOrder: row.sortOrder,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  })
  expect(categories.map((row) => row.code)).toEqual([
    "standard",
    "superior",
    "family",
  ])
  expect(categories.map((row) => row.label)).toEqual([
    "Standard",
    "Superior",
    "Family",
  ])

  const roomTypes = await t.query(async (ctx) => {
    const rows = await ctx.db.query("accommodationRoomTypes").take(100)
    const locked = rows.filter(
      (row) =>
        !["Double Room", "Single Room"].includes(row.label) &&
        !row.label.startsWith("Preview")
    )
    return locked
      .map((row) => ({
        label: row.label,
        defaultCapacity: row.defaultCapacity,
        count: row.count,
        categoryId: String(row.categoryId ?? ""),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })
  expect(roomTypes).toHaveLength(10)
  expect(
    roomTypes.reduce((sum, row) => sum + (row.count ?? 0), 0)
  ).toBe(374)
  const categoryCodeByRoomLabel: Record<
    string,
    "standard" | "superior" | "family"
  > = {
    "Standard Single": "standard",
    "Standard Double King": "standard",
    "Standard Double Queen": "standard",
    "Standard Double Twin": "standard",
    "Standard Twin (separate beds)": "standard",
    "Superior Single": "superior",
    "Superior Double King": "superior",
    "Superior Double Twin": "superior",
    "Family Room Double King": "family",
    "Family Room Double Twin": "family",
  }
  const categoryIdByCode = new Map(
    await t.query(async (ctx) => {
      const rows = await ctx.db.query("accommodationCategories").take(20)
      return rows.map((row) => [row.code, String(row._id)] as const)
    })
  )
  for (const row of roomTypes) {
    expect(row.categoryId).toBe(
      categoryIdByCode.get(categoryCodeByRoomLabel[row.label])
    )
  }
  const anchors = await t.query(async (ctx) => {
    const rows = await ctx.db.query("accommodationRoomTypes").take(100)
    return rows.filter((row) =>
      ["Double Room", "Single Room"].includes(row.label)
    )
  })
  expect(anchors.map((row) => row.label).sort()).toEqual([
    "Double Room",
    "Single Room",
  ])
  for (const anchor of anchors) {
    expect(String(anchor.categoryId ?? "")).toBe(standardCategoryId)
  }

  const rates = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", idMap.get("evt_divine_redesign") as never)
      )
      .take(50)
    return rows
      .map((row) => ({
        occupancy: row.occupancy,
        pricePerPersonMinor: row.pricePerPersonMinor,
        categoryId: String(row.categoryId ?? ""),
      }))
      .sort((a, b) =>
        `${a.categoryId}:${a.occupancy}`.localeCompare(
          `${b.categoryId}:${b.occupancy}`
        )
      )
  })
  expect(rates).toHaveLength(4)
  const byKey = new Map(
    rates.map((row) => [`${row.categoryId}:${row.occupancy}`, row])
  )
  expect(
    byKey.get(`${idMap.get("cat_standard")}:single`)?.pricePerPersonMinor
  ).toBe(9000)
  expect(
    byKey.get(`${idMap.get("cat_standard")}:shared`)?.pricePerPersonMinor
  ).toBe(6000)
  expect(
    byKey.get(`${idMap.get("cat_superior")}:single`)?.pricePerPersonMinor
  ).toBe(10000)
  expect(
    byKey.get(`${idMap.get("cat_superior")}:shared`)?.pricePerPersonMinor
  ).toBe(7000)

  const config = await t.query(async (ctx) => {
    return await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", idMap.get("evt_divine_redesign") as never)
      )
      .unique()
  })
  expect(config).toMatchObject({
    baseCheckInAt: LEGACY_BASE_CHECK_IN_AT,
    baseCheckOutAt: LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS,
    allowExtendedStayBefore: false,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
    defaultCategoryId: standardCategoryId,
    breakfastIncluded: true,
    nightCount: 2,
  })

  const eventOptions = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", idMap.get("evt_divine_redesign") as never)
      )
      .take(50)
    const catalog = await ctx.db.query("accommodationOptions").take(50)
    const labelByOptionId = new Map(
      catalog.map((row) => [String(row._id), row.code])
    )
    return rows.map((row) => ({
      code: labelByOptionId.get(String(row.optionId)),
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

  // Step 0/1 never touches inventory (resources, hotels, rooms, slots).
  const resourceCount = await t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("eventAccommodationResources")) {
      count += 1
    }
    return count
  })
  expect(resourceCount).toBe(2)
  const hotelCount = await t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("accommodationHotels")) {
      count += 1
    }
    return count
  })
  expect(hotelCount).toBe(2)
  const roomCount = await t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("accommodationRooms")) {
      count += 1
    }
    return count
  })
  expect(roomCount).toBe(84)

  // Re-run is a full no-op.
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
})

// ---------------------------------------------------------------------------
// Step 2: zero-selection-only preferences, capacity occupancy, conversion,
// idempotency, and unresolved-order safety
// ---------------------------------------------------------------------------

test("Step 2 creates one Standard preference per zero-selection attendee, converts legacy assignments, and re-run is a no-op", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedMigrationFixture(t)

  await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )

  const first = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    productionGuard
  )
  expect(first).toMatchObject({
    slug: LEGACY_EVENT_SLUG,
    ordersScanned: LEGACY_AUDIT_COUNTS.orders,
    ordersAlreadyHandled: LEGACY_AUDIT_COUNTS.legacyAssignmentOrders,
    ordersResolved: LEGACY_AUDIT_COUNTS.noSelectionOrders,
    attendeesHandled: LEGACY_AUDIT_COUNTS.noSelectionAttendees,
    ordersUnresolved: 0,
    assignmentsConverted: LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees,
  })

  // Every preference (backfilled + legacy) is included Standard with the
  // config dates/night count.
  const selections = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationSelections")) {
      rows.push(row)
    }
    return rows
  })
  expect(selections).toHaveLength(LEGACY_AUDIT_COUNTS.attendees)
  const standardCategoryId = idMap.get("cat_standard")
  for (const row of selections) {
    expect(String(row.categoryId)).toBe(standardCategoryId)
    expect(["single", "shared"]).toContain(row.occupancy)
    expect(row.checkInAt).toBe(LEGACY_BASE_CHECK_IN_AT)
    expect(row.checkOutAt).toBe(LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS)
    expect(row.nightCount).toBe(2)
  }

  // Every legacy assignment is retained with status converted.
  const converted = await t.query(async (ctx) => {
    let count = 0
    for await (const row of ctx.db.query("orderAssignments")) {
      if (row.status === "converted") {
        count += 1
      }
    }
    return count
  })
  expect(converted).toBe(LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees)
  const pending = await t.query(async (ctx) => {
    let count = 0
    for await (const row of ctx.db.query("orderAssignments")) {
      if (row.status === undefined || row.status === "pending") {
        count += 1
      }
    }
    return count
  })
  expect(pending).toBe(0)

  // Converted assignments no longer surface as pending buyer suggestions.
  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(idMap.get("evt_divine_redesign")),
  })
  expect(board.buyerSuggestions ?? []).toHaveLength(0)

  // Idempotent re-run.
  const second = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    productionGuard
  )
  expect(second.ordersResolved).toBe(0)
  expect(second.attendeesHandled).toBe(0)
  expect(second.assignmentsConverted).toBe(0)
  expect(second.ordersAlreadyHandled).toBe(LEGACY_AUDIT_COUNTS.orders)
  expect(second.ordersUnresolved).toBe(0)
})

test("Step 2 derives single occupancy from a capacity-1 room type", async () => {
  const t = fresh()
  const idMap = await seedMigrationFixture(t)

  await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )

  // Add one no-selection order on a capacity-1 ticket. The migration
  // re-anchors entry tickets to the Double Room anchor, so create a fresh
  // capacity-1 room type + ticket for this order.
  const singleRoomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Migration Single",
      defaultCapacity: 1,
    })
  })
  const singleTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: idMap.get("evt_divine_redesign") as never,
      label: "Migration Single Ticket",
      priceMinor: 24000,
      isActive: true,
      visibility: "public" as const,
      availabilityState: "selectable" as const,
      roomTypeId: singleRoomTypeId,
      sortOrder: 10,
      updatedAt: LEGACY_BASE_CHECK_IN_AT,
    })
  })
  const eventId = idMap.get("evt_divine_redesign")
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-MIGRATE-SINGLE",
      bookerName: "Migration Booker",
      bookerEmail: "migration-single@example.org",
      status: "paid",
      totalAmountMinor: 24000,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "migration-single-1",
      name: "Migration Attendee Single",
      email: "migration-single@example.org",
      gender: "female",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId: singleTicketId,
      quantity: 1,
      sortOrder: 0,
    })
  })

  const result = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    productionGuard
  )
  expect(result.attendeesHandled).toBe(
    LEGACY_AUDIT_COUNTS.noSelectionAttendees + 1
  )
  const row = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
      .first()
  })
  expect(row).toMatchObject({ occupancy: "single", nightCount: 2 })
})

test("Step 2 fails an order closed as a unit when a ticket is unresolvable (zero partial writes)", async () => {
  const t = fresh()
  const idMap = await seedMigrationFixture(t)

  await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )

  const eventId = idMap.get("evt_divine_redesign")
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-MIGRATE-DANGLING",
      bookerName: "Migration Booker",
      bookerEmail: "migration-dangling@example.org",
      status: "paid",
      totalAmountMinor: 0,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "migration-dangling-1",
      name: "Migration Attendee Dangling",
      email: "migration-dangling@example.org",
      gender: "female",
      sortOrder: 0,
    })
  })
  const danglingTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Dangling Ticket",
      priceMinor: 100,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: LEGACY_BASE_CHECK_IN_AT,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId: danglingTicketId,
      quantity: 1,
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.delete("ticketTypes", danglingTicketId)
  })

  const result = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    productionGuard
  )
  expect(result.ordersUnresolved).toBe(1)
  expect(result.unresolved[0].orderId).toBe(String(orderId))
  const rows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .take(10)
  })
  expect(rows).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Step 3: locked Koningshof inventory replacement + fail-closed old-slot
// reference protection
// ---------------------------------------------------------------------------

async function runStep3UntilDoneOrBlocked(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<{ done: boolean; blocked: string | null }> {
  while (true) {
    try {
      const result = await t.mutation(
        internal.applyKoningshofAccommodationInventory.default,
        productionGuard
      )
      if (result.done) {
        return { done: true, blocked: null }
      }
    } catch (error) {
      return {
        done: false,
        blocked: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

async function countRows(
  t: TestConvexForDataModel<GenericDataModel>,
  table:
    | "accommodationHotels"
    | "accommodationRooms"
    | "accommodationSlots"
    | "accommodationEventHotels"
    | "eventAccommodationResources"
): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    switch (table) {
      case "accommodationHotels":
        for await (const _row of ctx.db.query("accommodationHotels"))
          count += 1
        break
      case "accommodationRooms":
        for await (const _row of ctx.db.query("accommodationRooms"))
          count += 1
        break
      case "accommodationSlots":
        for await (const _row of ctx.db.query("accommodationSlots"))
          count += 1
        break
      case "accommodationEventHotels":
        for await (const _row of ctx.db.query("accommodationEventHotels"))
          count += 1
        break
      case "eventAccommodationResources":
        for await (const _row of ctx.db.query("eventAccommodationResources"))
          count += 1
        break
    }
    return count
  })
}

test("Step 3 creates the exact locked Koningshof inventory and removes old inventory; re-run is stable", async () => {
  const t = fresh()
  const idMap = await seedMigrationFixture(t, { keepAssignments: false })

  await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )

  const { done } = await runStep3UntilDoneOrBlocked(t)
  expect(done).toBe(true)

  // Only the Koningshof hotel remains; old inventory is gone.
  expect(await countRows(t, "accommodationHotels")).toBe(1)
  expect(await countRows(t, "accommodationRooms")).toBe(374)
  expect(await countRows(t, "accommodationSlots")).toBe(648)
  expect(await countRows(t, "accommodationEventHotels")).toBe(1)
  expect(await countRows(t, "eventAccommodationResources")).toBe(11)

  const koningshof = await t.query(async (ctx) => {
    return await ctx.db
      .query("accommodationHotels")
      .withIndex("name", (q) =>
        q.eq("name", "NH Eindhoven Conference Centre Koningshof")
      )
      .first()
  })
  expect(koningshof).toMatchObject({
    city: "Veldhoven",
    address: "Locht 117, 5504 RM Veldhoven, Netherlands",
  })

  // Slots are mixed + assignable with deterministic labels.
  const slotLabels = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("accommodationSlots")) {
      rows.push(row)
    }
    return rows
  })
  for (const slot of slotLabels) {
    expect(slot.genderPolicy).toBe("mixed")
    expect(slot.isAssignable).toBe(true)
    expect(slot.slotLabel.startsWith("Koningshof ")).toBe(true)
  }
  expect(new Set(slotLabels.map((slot) => slot.slotLabel)).size).toBe(648)

  // A re-run after cleanup creates/duplicates/deletes nothing.
  const rerun = await t.mutation(
    internal.applyKoningshofAccommodationInventory.default,
    productionGuard
  )
  expect(rerun.done).toBe(true)
  expect(rerun.hotelCreated).toBe(0)
  expect(rerun.hotelUpdated).toBe(0)
  expect(rerun.eventHotelLinked).toBe(0)
  expect(rerun.resourcesCreated).toBe(0)
  expect(rerun.resourcesUpdated).toBe(0)
  expect(rerun.staleResourcesRemoved).toBe(0)
  expect(rerun.roomsCreated).toBe(0)
  expect(rerun.slotsCreated).toBe(0)
  expect(rerun.oldSlotsDeleted).toBe(0)
  expect(rerun.oldRoomsDeleted).toBe(0)
  expect(rerun.oldLinksDeleted).toBe(0)
  expect(rerun.oldHotelsDeleted).toBe(0)
})

test("Step 3 fails closed before deleting old inventory while any assignment references an old slot", async () => {
  const t = fresh()
  const idMap = await seedMigrationFixture(t)

  await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )

  const { blocked } = await runStep3UntilDoneOrBlocked(t)
  expect(blocked).toContain("OLD_SLOT_REFERENCED")
  expect(blocked).toContain("Blocking assignment IDs")

  // Old inventory is left fully intact alongside the newly materialized
  // Koningshof hotel (3 hotels, 84 old + 374 new rooms, 160 old + 648 new
  // slots).
  expect(await countRows(t, "accommodationHotels")).toBe(3)
  expect(await countRows(t, "accommodationRooms")).toBe(458)
  expect(await countRows(t, "accommodationSlots")).toBe(808)

  // The complete new Koningshof inventory was materialized and persisted.
  const koningshofRooms = await t.query(async (ctx) => {
    const hotel = await ctx.db
      .query("accommodationHotels")
      .withIndex("name", (q) =>
        q.eq("name", "NH Eindhoven Conference Centre Koningshof")
      )
      .first()
    if (!hotel) return 0
    const rows = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", hotel._id))
      .take(2000)
    return rows.length
  })
  expect(koningshofRooms).toBe(374)
})

// ---------------------------------------------------------------------------
// Verification query: locked post-migration counts + stable re-runs
// ---------------------------------------------------------------------------

test("the verification query reports the locked post-migration counts and re-running all three exports increases no stable-key count", async () => {
  const t = fresh()
  const idMap = await seedMigrationFixture(t)

  await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )
  await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    productionGuard
  )
  // The operator clears the converted audit rows (still referencing old
  // slots) before Step 3 may delete the old inventory.
  await t.mutation(async (ctx) => {
    for await (const row of ctx.db.query("orderAssignments")) {
      await ctx.db.delete("orderAssignments", row._id)
    }
  })
  const { done } = await runStep3UntilDoneOrBlocked(t)
  expect(done).toBe(true)

  const report = await t.query(
    internal.verifyDivineRedesignAccommodationMigration.default,
    {}
  )
  expect(report.eventId).toBe(String(idMap.get("evt_divine_redesign")))
  expect(report.slug).toBe(LEGACY_EVENT_SLUG)
  expect(report.tickets.count).toBe(5)
  expect(report.tickets.byLabel["under 3"]).toMatchObject({
    priceMinor: 0,
    roomAnchor: "Double Room",
    accommodationIncluded: true,
  })
  expect(report.tickets.byLabel["3-11"]).toMatchObject({
    priceMinor: 12500,
    roomAnchor: "Double Room",
    accommodationIncluded: true,
  })
  expect(report.tickets.byLabel["12-17"]).toMatchObject({
    priceMinor: 15000,
    roomAnchor: "Double Room",
    accommodationIncluded: true,
  })
  expect(report.tickets.byLabel["18+"]).toMatchObject({
    priceMinor: 25000,
    roomAnchor: "Double Room",
    accommodationIncluded: true,
  })
  expect(report.tickets.byLabel["Single Room"]).toMatchObject({
    priceMinor: 35000,
    roomAnchor: "Single Room",
    accommodationIncluded: true,
  })
  expect(report.categories).toBe(3)
  expect(report.roomTypes).toBe(17)
  expect(report.roomResources).toBe(10)
  expect(report.cotResources).toBe(1)
  expect(report.rates).toBe(4)
  expect(report.eventOptions).toBe(2)
  expect(report.config).toMatchObject({
    baseCheckInAt: LEGACY_BASE_CHECK_IN_AT,
    baseCheckOutAt: LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS,
    nightCount: 2,
    breakfastIncluded: true,
    defaultCategoryCode: "standard",
  })
  expect(report.preferences).toBe(LEGACY_AUDIT_COUNTS.attendees)
  expect(report.convertedAssignments).toBe(0)
  expect(report.linkedHotels).toBe(1)
  expect(report.rooms).toBe(374)
  expect(report.slots).toBe(648)
  expect(report.oldHotels).toBe(0)

  // Re-running all three mutation exports is stable.
  const rerun01 = await t.mutation(
    internal.applySimplifiedDivineConferenceAccommodation.default,
    productionGuard
  )
  expect(rerun01).toMatchObject({
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
  const rerun02 = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    productionGuard
  )
  expect(rerun02.ordersResolved).toBe(0)
  expect(rerun02.attendeesHandled).toBe(0)
  expect(rerun02.assignmentsConverted).toBe(0)
  expect(rerun02.ordersUnresolved).toBe(0)
  const rerun03 = await t.mutation(
    internal.applyKoningshofAccommodationInventory.default,
    productionGuard
  )
  expect(rerun03.done).toBe(true)
  expect(rerun03.roomsCreated).toBe(0)
  expect(rerun03.slotsCreated).toBe(0)
  expect(rerun03.staleResourcesRemoved).toBe(0)
  expect(rerun03.oldSlotsDeleted).toBe(0)
  expect(rerun03.oldRoomsDeleted).toBe(0)
  expect(rerun03.oldLinksDeleted).toBe(0)
  expect(rerun03.oldHotelsDeleted).toBe(0)

  const reportAfter = await t.query(
    internal.verifyDivineRedesignAccommodationMigration.default,
    {}
  )
  expect(reportAfter).toEqual(report)
})
