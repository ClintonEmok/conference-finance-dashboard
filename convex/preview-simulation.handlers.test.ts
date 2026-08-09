/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import {
  LEGACY_AUDIT_COUNTS,
  LEGACY_EVENT_SLUG,
} from "../tests/fixtures/legacy-preview.snapshot"
import { loadOrderAmountDueBreakdowns } from "./finance"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

type CountableTable =
  | "events"
  | "orders"
  | "orderAttendees"
  | "orderAccommodationSelections"
  | "orderAssignments"
  | "orderTicketSelections"
  | "accommodationRooms"
  | "accommodationSlots"
  | "accommodationHotels"

async function countRows(
  t: TestConvexForDataModel<GenericDataModel>,
  table: CountableTable
): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    switch (table) {
      case "events":
        for await (const _row of ctx.db.query("events")) count += 1
        break
      case "orders":
        for await (const _row of ctx.db.query("orders")) count += 1
        break
      case "orderAttendees":
        for await (const _row of ctx.db.query("orderAttendees")) count += 1
        break
      case "orderAccommodationSelections":
        for await (const _row of ctx.db.query("orderAccommodationSelections"))
          count += 1
        break
      case "orderAssignments":
        for await (const _row of ctx.db.query("orderAssignments")) count += 1
        break
      case "orderTicketSelections":
        for await (const _row of ctx.db.query("orderTicketSelections"))
          count += 1
        break
      case "accommodationRooms":
        for await (const _row of ctx.db.query("accommodationRooms")) count += 1
        break
      case "accommodationSlots":
        for await (const _row of ctx.db.query("accommodationSlots")) count += 1
        break
      case "accommodationHotels":
        for await (const _row of ctx.db.query("accommodationHotels")) count += 1
        break
    }
    return count
  })
}

test("RUN-01 tracer: a single sanitized legacy order seeds, backfills, and prices canonically", async () => {
  const t = fresh().withIdentity(adminIdentity)

  const seeded = await t.mutation(internal.seedPreviewSimulation.default, {
    scope: "tracer",
    preview: true,
  })
  expect(seeded.slug).toBe(LEGACY_EVENT_SLUG)
  expect(seeded.insertedByTable.orders).toBe(1)

  // One order, one attendee, no selections yet.
  const orderRows = await t.query(async (ctx) => {
    const rows: string[] = []
    for await (const order of ctx.db.query("orders")) {
      rows.push(String(order.bookingRef ?? order._id))
    }
    return rows
  })
  expect(orderRows).toEqual(["BK-PREVIEW-1038"])
  expect(await countRows(t, "orderAttendees")).toBe(1)
  expect(await countRows(t, "orderAccommodationSelections")).toBe(0)

  // Deferred Phase 47 backfill runs against the seeded preview.
  const backfill = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    { slug: LEGACY_EVENT_SLUG, preview: true }
  )
  expect(backfill.ordersResolved).toBe(1)
  expect(backfill.attendeesHandled).toBe(1)
  expect(await countRows(t, "orderAccommodationSelections")).toBe(1)

  const orderId = await t.query(async (ctx) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", "BK-PREVIEW-1038"))
      .first()
    return order?._id ?? null
  })
  expect(orderId).toBeTruthy()
  const amountDue = await t.query(async (ctx) => {
    const breakdowns = await loadOrderAmountDueBreakdowns(
      ctx as never,
      [{ _id: orderId as never }]
    )
    return breakdowns.get(String(orderId))?.amountDueMinor ?? null
  })
  expect(amountDue).toBeGreaterThan(0)
})

test("RUN-01 full: the sanitized preview mirrors the audited shape with correct partitions", async () => {
  const t = fresh().withIdentity(adminIdentity)

  await t.mutation(internal.seedPreviewSimulation.default, {
    scope: "full",
    preview: true,
  })

  expect(await countRows(t, "events")).toBe(1)
  expect(await countRows(t, "orders")).toBe(LEGACY_AUDIT_COUNTS.orders)
  expect(await countRows(t, "orderAttendees")).toBe(
    LEGACY_AUDIT_COUNTS.attendees
  )
  expect(await countRows(t, "accommodationRooms")).toBe(
    LEGACY_AUDIT_COUNTS.rooms
  )
  expect(await countRows(t, "accommodationSlots")).toBe(
    LEGACY_AUDIT_COUNTS.slots
  )
  expect(await countRows(t, "accommodationHotels")).toBe(
    LEGACY_AUDIT_COUNTS.hotels
  )
  expect(await countRows(t, "orderAssignments")).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees
  )
  expect(await countRows(t, "orderAccommodationSelections")).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees
  )

  // Exactly 38 orders / 72 attendees without selections before the backfill.
  const { ordersWithoutSelections, attendeesWithoutSelections } =
    await t.query(async (ctx) => {
      let ordersWithout = 0
      let attendeesWithout = 0
      for await (const order of ctx.db.query("orders")) {
        let attendeeCount = 0
        let orderHasSelection = false
        for await (const attendee of ctx.db
          .query("orderAttendees")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
          attendeeCount += 1
          const selection = await ctx.db
            .query("orderAccommodationSelections")
            .withIndex("by_attendeeId", (q) =>
              q.eq("attendeeId", attendee._id)
            )
            .first()
          if (selection) {
            orderHasSelection = true
          } else {
            attendeesWithout += 1
          }
        }
        if (attendeeCount > 0 && !orderHasSelection) {
          ordersWithout += 1
        }
      }
      return { ordersWithoutSelections: ordersWithout, attendeesWithoutSelections: attendeesWithout }
    })
  expect(ordersWithoutSelections).toBe(LEGACY_AUDIT_COUNTS.noSelectionOrders)
  expect(attendeesWithoutSelections).toBe(
    LEGACY_AUDIT_COUNTS.noSelectionAttendees
  )
})

test("RUN-01 expansion + idempotency: a tracer seed expands to full and a re-run is a no-op", async () => {
  const t = fresh().withIdentity(adminIdentity)

  await t.mutation(internal.seedPreviewSimulation.default, {
    scope: "tracer",
    preview: true,
  })
  expect(await countRows(t, "orders")).toBe(1)

  const expanded = await t.mutation(internal.seedPreviewSimulation.default, {
    scope: "full",
    preview: true,
  })
  expect(expanded.alreadySeeded).toBe(false)
  expect(await countRows(t, "orders")).toBe(LEGACY_AUDIT_COUNTS.orders)

  const rerun = await t.mutation(internal.seedPreviewSimulation.default, {
    scope: "full",
    preview: true,
  })
  expect(rerun.alreadySeeded).toBe(true)
  expect(await countRows(t, "orders")).toBe(LEGACY_AUDIT_COUNTS.orders)
  expect(await countRows(t, "orderAttendees")).toBe(
    LEGACY_AUDIT_COUNTS.attendees
  )
})

test("RUN-01 guards: the seed rejects without preview authorization and against a production deployment", async () => {
  const t = fresh().withIdentity(adminIdentity)

  await expect(
    t.mutation(internal.seedPreviewSimulation.default, {
      scope: "full",
      preview: false,
    })
  ).rejects.toThrow("PREVIEW_REQUIRED")

  const previousSiteUrl = process.env.CONVEX_SITE_URL
  process.env.CONVEX_SITE_URL = "https://grateful-pelican-605.convex.cloud"
  try {
    await expect(
      t.mutation(internal.seedPreviewSimulation.default, {
        scope: "full",
        preview: true,
        allowedDeploymentUrl: "dev:acoustic-tiger-876",
      })
    ).rejects.toThrow("WRONG_DEPLOYMENT")
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.CONVEX_SITE_URL
    } else {
      process.env.CONVEX_SITE_URL = previousSiteUrl
    }
  }
  expect(await countRows(t, "orders")).toBe(0)
})

test("RUN-01: the deferred full backfill runs idempotently on the seeded preview and surfaces 44 board suggestions", async () => {
  const t = fresh().withIdentity(adminIdentity)
  await t.mutation(internal.seedPreviewSimulation.default, {
    scope: "full",
    preview: true,
  })

  const first = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    { slug: LEGACY_EVENT_SLUG, preview: true }
  )
  expect(first.ordersResolved).toBe(LEGACY_AUDIT_COUNTS.noSelectionOrders)
  expect(first.attendeesHandled).toBe(
    LEGACY_AUDIT_COUNTS.noSelectionAttendees
  )
  expect(first.ordersAlreadyHandled).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentOrders
  )
  expect(first.ordersUnresolved).toBe(0)

  const second = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    { slug: LEGACY_EVENT_SLUG, preview: true }
  )
  expect(second.ordersResolved).toBe(0)
  expect(second.attendeesHandled).toBe(0)
  expect(second.ordersAlreadyHandled).toBe(LEGACY_AUDIT_COUNTS.orders)
  expect(await countRows(t, "orderAccommodationSelections")).toBe(
    LEGACY_AUDIT_COUNTS.attendees
  )

  const eventId = await t.query(async (ctx) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", LEGACY_EVENT_SLUG))
      .first()
    return event?._id ?? null
  })
  expect(eventId).toBeTruthy()
  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(eventId),
  })
  expect(board.buyerSuggestions ?? []).toHaveLength(
    LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees
  )
})
