/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import { mintEditRequestSignature } from "../lib/domain/track-payment/edit-token"
import {
  buildLegacyPreviewSnapshot,
  LEGACY_AUDIT_COUNTS,
  LEGACY_BASE_CHECK_IN_AT,
  LEGACY_DAY_MS,
  LEGACY_EVENT_SLUG,
  type PreviewSnapshot,
} from "../tests/fixtures/legacy-preview.snapshot"

// The edit-token request signature uses the shared signing secret.
const TEST_SECRET = "test-legacy-readiness-secret"
process.env.SIGNUP_SUBMISSION_SECRET = TEST_SECRET

// The deployment guard now requires a detectable deployment URL and an exact
// match, so every success-path call stubs the detected URL and passes an
// exactly-matching allowed deployment URL.
const TEST_DEPLOYMENT_URL = "https://test-preview.convex.site"
process.env.CONVEX_SITE_URL = TEST_DEPLOYMENT_URL
const previewGuard = { preview: true, allowedDeploymentUrl: TEST_DEPLOYMENT_URL }

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

// ---------------------------------------------------------------------------
// Seeding: insert the sanitized fixture snapshot with logical-ID remapping.
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
  t: TestConvexForDataModel<GenericDataModel>,
  snapshot: PreviewSnapshot
): Promise<Map<string, string>> {
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

async function loadAmountDue(
  t: TestConvexForDataModel<GenericDataModel>,
  orderId: string
): Promise<number | null> {
  return t.query(async (ctx) => {
    const loaderCtx =
      ctx as unknown as Parameters<typeof loadOrderAmountDueBreakdowns>[0]
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: orderId as never },
    ])
    return breakdowns.get(String(orderId))?.amountDueMinor ?? null
  })
}

function countSelections(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("orderAccommodationSelections")) {
      count += 1
    }
    return count
  })
}

function uniqueIdempotencyKey(): string {
  return `edit-idem-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------------------
// LEG-01: full-population first-preference backfill + idempotency
// ---------------------------------------------------------------------------

test("LEG-01: backfill creates exactly 72 first preferences (38 orders) and skips the 13 already-handled legacy orders", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  const first = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    { slug: LEGACY_EVENT_SLUG, ...previewGuard }
  )

  expect(first.eventId).toBeDefined()
  expect(first.ordersScanned).toBe(LEGACY_AUDIT_COUNTS.orders)
  expect(first.ordersAlreadyHandled).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentOrders
  )
  expect(first.ordersResolved).toBe(LEGACY_AUDIT_COUNTS.noSelectionOrders)
  expect(first.attendeesHandled).toBe(LEGACY_AUDIT_COUNTS.noSelectionAttendees)
  expect(first.ordersUnresolved).toBe(0)
  expect(await countSelections(t)).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees +
      LEGACY_AUDIT_COUNTS.noSelectionAttendees
  )

  // Every preference for a no-selection order is included Standard with
  // event-config dates/nights. Backfilled rows are shared (Double Room, per
  // the audit); the legacy orders' pre-existing rows may be single/shared.
  const standardCategoryId = idMap.get("cat_standard")
  const selections = await t.query(async (ctx) => {
    const rows = []
    for await (const row of ctx.db.query("orderAccommodationSelections")) {
      rows.push(row)
    }
    return rows
  })
  for (const row of selections) {
    expect(String(row.categoryId)).toBe(standardCategoryId)
    expect(["single", "shared"]).toContain(row.occupancy)
    expect(row.checkInAt).toBe(LEGACY_BASE_CHECK_IN_AT)
    expect(row.checkOutAt).toBe(LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS)
    expect(row.nightCount).toBe(2)
    expect(row.confirmedAt).toBeUndefined()
    expect(row.nightBeforeLevel).toBeUndefined()
  }

  // Canonical money is readable for a backfilled order.
  const backfilledOrderId = idMap.get("order_01")
  expect(await loadAmountDue(t, String(backfilledOrderId))).toBeGreaterThan(0)

  // Re-run is a full no-op.
  const second = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    { slug: LEGACY_EVENT_SLUG, ...previewGuard }
  )
  expect(second.ordersResolved).toBe(0)
  expect(second.attendeesHandled).toBe(0)
  expect(second.ordersAlreadyHandled).toBe(LEGACY_AUDIT_COUNTS.orders)
  expect(await countSelections(t)).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees +
      LEGACY_AUDIT_COUNTS.noSelectionAttendees
  )
  expect(await loadAmountDue(t, String(backfilledOrderId))).toBeGreaterThan(0)
})

test("LEG-01: the backfill derives single occupancy for a capacity-1 room type", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  // Add one no-selection order on the single ticket.
  const eventId = idMap.get("evt_divine_redesign")
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-SINGLE-0001",
      bookerName: "Preview Booker",
      bookerEmail: "preview-single@example.org",
      status: "paid",
      totalAmountMinor: 24000,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "single-1",
      name: "Preview Attendee Single",
      email: "preview-single@example.org",
      gender: "female",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId: idMap.get("ticket_standard_single") as never,
      quantity: 1,
      sortOrder: 0,
    })
  })

  const result = await t.mutation(
    internal.backfillLegacyAccommodationPreferences.default,
    { slug: LEGACY_EVENT_SLUG, ...previewGuard }
  )
  expect(result.attendeesHandled).toBe(LEGACY_AUDIT_COUNTS.noSelectionAttendees + 1)

  const row = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
      .first()
  })
  expect(row).toMatchObject({ occupancy: "single", nightCount: 2 })
})

// ---------------------------------------------------------------------------
// LEG-03: preview-only guard and deployment protection
// ---------------------------------------------------------------------------

test("LEG-03: the backfill guard fails closed on missing preview, unknown deployment, missing allowlist, suffix collisions, and production mismatches", async () => {
  const t = fresh().withIdentity(adminIdentity)

  // No preview marker -> rejected before any database interaction.
  await expect(
    t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
      slug: LEGACY_EVENT_SLUG,
      preview: false,
      allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
    })
  ).rejects.toThrow("PREVIEW_REQUIRED")

  // Detected deployment identity unavailable -> fail closed (no reads/writes;
  // the empty DB would otherwise report 'event not found', proving the guard
  // runs before any read/write).
  const previousSiteUrl = process.env.CONVEX_SITE_URL
  delete process.env.CONVEX_SITE_URL
  try {
    await expect(
      t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
        slug: LEGACY_EVENT_SLUG,
        preview: true,
        allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
      })
    ).rejects.toThrow("DEPLOYMENT_UNKNOWN")
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.CONVEX_SITE_URL
    } else {
      process.env.CONVEX_SITE_URL = previousSiteUrl
    }
  }
  expect(await countSelections(t)).toBe(0)

  // No allowed deployment URL configured -> fail closed (detected identity is
  // present but neither the argument nor PREVIEW_DEPLOYMENT_URL provides an
  // allowlist).
  const previousAllowedUrl = process.env.PREVIEW_DEPLOYMENT_URL
  process.env.CONVEX_SITE_URL = TEST_DEPLOYMENT_URL
  delete process.env.PREVIEW_DEPLOYMENT_URL
  try {
    await expect(
      t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
        slug: LEGACY_EVENT_SLUG,
        preview: true,
      })
    ).rejects.toThrow("ALLOWLIST_UNAVAILABLE")
  } finally {
    process.env.CONVEX_SITE_URL = previousSiteUrl
    if (previousAllowedUrl === undefined) {
      delete process.env.PREVIEW_DEPLOYMENT_URL
    } else {
      process.env.PREVIEW_DEPLOYMENT_URL = previousAllowedUrl
    }
  }
  expect(await countSelections(t)).toBe(0)

  // Suffix-colliding allowed URL must NOT match the detected deployment
  // (exact normalized equality only — no endsWith/prefix matching).
  process.env.CONVEX_SITE_URL = "https://acoustic-tiger-876.convex.site"
  try {
    await expect(
      t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
        slug: LEGACY_EVENT_SLUG,
        preview: true,
        allowedDeploymentUrl: "https://evil-convex.site",
      })
    ).rejects.toThrow("WRONG_DEPLOYMENT")
    // A bare suffix of the detected URL is also not an exact match.
    await expect(
      t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
        slug: LEGACY_EVENT_SLUG,
        preview: true,
        allowedDeploymentUrl: "convex.site",
      })
    ).rejects.toThrow("WRONG_DEPLOYMENT")
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.CONVEX_SITE_URL
    } else {
      process.env.CONVEX_SITE_URL = previousSiteUrl
    }
  }
  expect(await countSelections(t)).toBe(0)

  // Production-like deployment URL -> rejected (the dev selector resolves to
  // the preview site URL, which does not equal the production site URL).
  process.env.CONVEX_SITE_URL = "https://grateful-pelican-605.convex.cloud"
  try {
    await expect(
      t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
        slug: LEGACY_EVENT_SLUG,
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
  expect(await countSelections(t)).toBe(0)

  // Exact match passes the guard: on an empty DB the backfill proceeds to the
  // event lookup and reports the missing event (proving the guard did not
  // reject and no write occurred).
  process.env.CONVEX_SITE_URL = TEST_DEPLOYMENT_URL
  await expect(
    t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
      slug: LEGACY_EVENT_SLUG,
      ...previewGuard,
    })
  ).rejects.toThrow("Event with slug")
  expect(await countSelections(t)).toBe(0)
})

test("LEG-01: an order with a dangling ticket fails closed as a unit (zero partial inserts)", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  // Insert one extra order whose attendee's ticket does not exist.
  const eventId = idMap.get("evt_divine_redesign")
  const orderId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      eventId: eventId as never,
      source: "internal",
      bookingRef: "BK-DANGLING-0001",
      bookerName: "Preview Booker",
      bookerEmail: "preview-dangling@example.org",
      status: "paid",
      totalAmountMinor: 0,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "dangling-1",
      name: "Preview Attendee Dangling",
      email: "preview-dangling@example.org",
      gender: "female",
      sortOrder: 0,
    })
  })
  // Insert a real ticket row, point the selection at it, then DELETE the
  // ticket so the reference is dangling at backfill time (the ID validator
  // prevents inserting a pointer to a never-existing document).
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
    { slug: LEGACY_EVENT_SLUG, ...previewGuard }
  )

  // The dangling order is reported unresolved and nothing was inserted for it.
  expect(result.ordersUnresolved).toBe(1)
  expect(result.unresolved[0].orderId).toBe(String(orderId))
  const danglingSelection = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .take(10)
  })
  expect(danglingSelection).toHaveLength(0)
  expect(await countSelections(t)).toBe(
    LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees +
      LEGACY_AUDIT_COUNTS.noSelectionAttendees
  )
})

test("RMG-02: a pending group sharing a requested room that spans Standard and Superior is flagged on the board", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  const order39Id = String(idMap.get("order_39"))
  // Legacy order 39 has 4 attendees (ordinals 73-76). Put two of them into
  // the same requested slot so they form a buyer rooming group.
  const slotId = String(idMap.get("slot_s1"))
  const { memberIds } = await t.query(async (ctx) => {
    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", order39Id as never))
      .take(10)
    return { memberIds: attendees.slice(0, 2).map((a) => String(a._id)) }
  })
  expect(memberIds).toHaveLength(2)
  for (const attendeeId of memberIds) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAssignments", {
        orderId: order39Id as never,
        attendeeId: attendeeId as never,
        slotId: slotId as never,
        assignmentIntent: "assign",
        sortOrder: 0,
      })
    })
  }
  // Give the first member the Superior upgrade option; the second stays Standard.
  const firstSelectionId = await t.query(async (ctx) => {
    const selection = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", memberIds[0] as never))
      .first()
    return selection?._id ?? null
  })
  expect(firstSelectionId).toBeTruthy()
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationOptionSelections", {
      orderId: order39Id as never,
      attendeeId: memberIds[0] as never,
      selectionId: firstSelectionId as never,
      optionKey: "superior_upgrade",
      quantity: 1,
      nights: 2,
      sortOrder: 0,
    })
  })

  const board = (await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(idMap.get("evt_divine_redesign")),
  })) as unknown as {
    buyerSuggestions?: Array<{
      attendeeId: string
      mixedCategory?: boolean
    }>
    rooms: Array<{ id: string; mixedCategoryGroup?: boolean }>
  }

  const suggestionById = new Map(
    (board.buyerSuggestions ?? []).map((s) => [s.attendeeId, s])
  )
  expect(suggestionById.get(memberIds[0])?.mixedCategory).toBe(true)
  expect(suggestionById.get(memberIds[1])?.mixedCategory).toBe(true)

  const roomForSlot = board.rooms.find(
    (room) => room.id === idMap.get("room_h1_1")
  )
  expect(roomForSlot?.mixedCategoryGroup).toBe(true)
})

test("RMG-02: the manage-booking edit rejects a mixed Standard/Superior rooming group before any write", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  const order39Id = String(idMap.get("order_39"))
  const bookingRef = "BK-PREVIEW-1039"
  const bookerEmail = "preview39@example.org"
  const slotId = String(idMap.get("slot_s1"))

  const { memberIds, memberKeys } = await t.query(async (ctx) => {
    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", order39Id as never))
      .take(10)
    return {
      memberIds: attendees.slice(0, 2).map((a) => String(a._id)),
      memberKeys: attendees.slice(0, 2).map((a) => a.attendeeKey),
    }
  })
  for (const attendeeId of memberIds) {
    await t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAssignments", {
        orderId: order39Id as never,
        attendeeId: attendeeId as never,
        slotId: slotId as never,
        assignmentIntent: "assign",
        sortOrder: 0,
      })
    })
  }
  const firstSelectionId = await t.query(async (ctx) => {
    const selection = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", memberIds[0] as never))
      .first()
    return selection?._id ?? null
  })
  expect(firstSelectionId).toBeTruthy()
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationOptionSelections", {
      orderId: order39Id as never,
      attendeeId: memberIds[0] as never,
      selectionId: firstSelectionId as never,
      optionKey: "superior_upgrade",
      quantity: 1,
      nights: 2,
      sortOrder: 0,
    })
  })

  // All legacy order 39 attendees share the Standard category; only the first
  // has the Superior upgrade, so the group is mixed and the edit is rejected.
  const mixedSelections = memberKeys.map((key, index) => ({
    attendeeKey: key,
    occupancy: "shared" as const,
    optionSelections:
      index === 0
        ? [{ optionKey: "superior_upgrade", quantity: 1, nights: 2 }]
        : [],
  }))
  const keyOne = uniqueIdempotencyKey()
  const mixedSignature = await mintEditRequestSignature({
    bookingRef,
    bookerEmail,
    editToken: null,
    idempotencyKey: keyOne,
    selections: mixedSelections,
    secret: TEST_SECRET,
  })
  await expect(
    t.mutation(api.publicTracking.updateAccommodation, {
      bookingRef,
      bookerEmail,
      requestSignature: mixedSignature,
      idempotencyKey: keyOne,
      selections: mixedSelections,
    })
  ).rejects.toThrow("EDIT_CONFLICT")
  expect(await loadAmountDue(t, order39Id)).toBeGreaterThan(0)
})

test("RMG-03: event-resource inventory blocks an exhausted stay atomically and permits valid placements", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  // Cap the event at ONE room of the standard room type via resources.
  const standardRoomTypeId = String(idMap.get("rt_standard"))
  const eventId = String(idMap.get("evt_divine_redesign"))
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationResources", {
      eventId: eventId as never,
      kind: "room",
      roomTypeId: standardRoomTypeId as never,
      count: 1,
    })
  })

  // Two distinct rooms of the standard type: room_h1_1 and room_h1_4 (index 3
  // => roomIndex 3 % 3 === 0 => rt_standard).
  const firstRoomId = String(idMap.get("room_h1_1"))
  const secondRoomId = String(idMap.get("room_h1_4"))

  // Assign one attendee to the first room: consumes the only resource room.
  const attendeeId = await t.query(async (ctx) => {
    const attendee = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", String(idMap.get("order_01")) as never)
      )
      .first()
    return attendee?._id ?? null
  })
  expect(attendeeId).toBeTruthy()
  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(attendeeId),
    roomId: firstRoomId,
  })

  // A second attendee cannot open a second room of the exhausted type.
  const secondAttendeeId = await t.query(async (ctx) => {
    const attendee = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", String(idMap.get("order_02")) as never)
      )
      .first()
    return attendee?._id ?? null
  })
  expect(secondAttendeeId).toBeTruthy()
  await expect(
    t.mutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: String(secondAttendeeId),
      roomId: secondRoomId,
    })
  ).rejects.toThrow("No accommodation inventory remains")

  // Unassign releases the resource and the second placement now succeeds.
  await t.mutation(api.accommodation.unassignRoomFromAttendee, {
    attendeeId: String(attendeeId),
  })
  await t.mutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: String(secondAttendeeId),
    roomId: secondRoomId,
  })
  const assigned = await t.query(async (ctx) => {
    const attendee = await ctx.db.get("orderAttendees", secondAttendeeId as never)
    return attendee?.assignedRoomId ?? null
  })
  expect(String(assigned)).toBe(secondRoomId)
})

test("RMG-03: the board Confirm path enforces the event-resource inventory guard", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  // Cap the event at ONE room of the standard type.
  const standardRoomTypeId = String(idMap.get("rt_standard"))
  const eventId = String(idMap.get("evt_divine_redesign"))
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationResources", {
      eventId: eventId as never,
      kind: "room",
      roomTypeId: standardRoomTypeId as never,
      count: 1,
    })
  })

  const firstRoomId = String(idMap.get("room_h1_1"))
  const secondRoomId = String(idMap.get("room_h1_4"))
  const firstSlotId = String(idMap.get("slot_s1"))
  const secondSlotId = String(idMap.get("slot_s4"))
  const order39Id = String(idMap.get("order_39"))

  const { memberIds } = await t.query(async (ctx) => {
    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", order39Id as never))
      .take(10)
    return { memberIds: attendees.slice(0, 2).map((a) => String(a._id)) }
  })

  const createAssignment = async (
    attendeeId: string,
    slotId: string
  ): Promise<string> => {
    return t.mutation(async (ctx) => {
      return await ctx.db.insert("orderAssignments", {
        orderId: order39Id as never,
        attendeeId: attendeeId as never,
        slotId: slotId as never,
        assignmentIntent: "assign",
        sortOrder: 0,
      })
    })
  }

  const firstAssignmentId = await createAssignment(memberIds[0], firstSlotId)
  const firstConfirm = await t.mutation(
    api.accommodation.confirmBuyerAssignment,
    { assignmentId: firstAssignmentId as never }
  )
  expect(firstConfirm.success).toBe(true)
  expect(String(firstConfirm.assignment?.roomId ?? firstConfirm.roomId ?? "")).toBe(
    firstRoomId
  )

  // The second confirm would open a second room of the exhausted type.
  const secondAssignmentId = await createAssignment(memberIds[1], secondSlotId)
  await expect(
    t.mutation(api.accommodation.confirmBuyerAssignment, {
      assignmentId: secondAssignmentId as never,
    })
  ).rejects.toThrow("No accommodation inventory remains")
  const secondAssigned = await t.query(async (ctx) => {
    const attendee = await ctx.db.get(
      "orderAttendees",
      memberIds[1] as never
    )
    return attendee?.assignedRoomId ?? null
  })
  expect(String(secondAssigned ?? "")).not.toBe(secondRoomId)
})

// ---------------------------------------------------------------------------
// RMG-04: night-before reuses the main-stay assignment + mismatch indicator
// ---------------------------------------------------------------------------

async function seedRoomTypeRoom(
  t: TestConvexForDataModel<GenericDataModel>,
  idMap: Map<string, string>,
  label: string,
  capacity: number,
  categoryId?: string
): Promise<string> {
  const roomType = await t.mutation(async (ctx) => {
    const row: Record<string, unknown> = {
      label,
      defaultCapacity: capacity,
    }
    if (categoryId) {
      row.categoryId = categoryId as Id<"accommodationCategories">
    }
    return await ctx.db.insert("accommodationRoomTypes", row as never)
  })
  const hotelId = idMap.get("hotel_koningshof")
  const room = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRooms", {
      hotelId: hotelId as never,
      roomTypeId: roomType,
      label,
      capacity,
    })
  })
  return String(room)
}

async function assignAttendeeWithNightBefore(
  t: TestConvexForDataModel<GenericDataModel>,
  idMap: Map<string, string>,
  attendeeKey: string,
  roomId: string,
  nightBeforeLevel: "standard" | "superior",
  nightBeforeOccupancy: "single" | "shared"
): Promise<void> {
  const orderId = String(idMap.get("order_38"))
  const attendeeId = await t.query(async (ctx) => {
    const attendee = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId as never))
      .filter((q) => q.eq(q.field("attendeeKey"), attendeeKey))
      .first()
    return attendee?._id ?? null
  })
  if (!attendeeId) {
    throw new Error(`attendee '${attendeeKey}' not seeded`)
  }
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: orderId as never,
      attendeeId,
      categoryId: idMap.get("cat_standard") as never,
      occupancy: "shared",
      checkInAt: LEGACY_BASE_CHECK_IN_AT,
      checkOutAt: LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS,
      nightCount: 2,
      nightBeforeLevel,
      nightBeforeOccupancy,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.patch("orderAttendees", attendeeId as never, {
      assignedRoomId: roomId,
    })
  })
}

test("RMG-04: night-before mismatch flag is server-computed from the assigned room and fails safe to false", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  const eventId = String(idMap.get("evt_divine_redesign"))
  const standardRoomId = String(idMap.get("room_h1_1"))
  const singleRoomId = await seedRoomTypeRoom(
    t,
    idMap,
    "Single Room",
    1,
    String(idMap.get("cat_standard"))
  )

  // Attendee in order_38 (single attendee order, key "attendee-72" is order_38's).
  // Superior night-before on a Standard (capacity 2) room => category mismatch.
  await assignAttendeeWithNightBefore(
    t,
    idMap,
    "attendee-72",
    standardRoomId,
    "superior",
    "single"
  )

  // Add an attendee to a single-capacity room with a shared night-before => capacity mismatch.
  const { attendeeId } = await t.query(async (ctx) => {
    const attendee = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", String(idMap.get("order_37")) as never)
      )
      .first()
    return { attendeeId: attendee?._id }
  })
  if (!attendeeId) throw new Error("order_37 attendee missing")
  const order37Id = String(idMap.get("order_37"))
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAccommodationSelections", {
      orderId: order37Id as never,
      attendeeId,
      categoryId: idMap.get("cat_standard") as never,
      occupancy: "shared",
      checkInAt: LEGACY_BASE_CHECK_IN_AT,
      checkOutAt: LEGACY_BASE_CHECK_IN_AT + 2 * LEGACY_DAY_MS,
      nightCount: 2,
      nightBeforeLevel: "standard",
      nightBeforeOccupancy: "shared",
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: singleRoomId,
    })
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId,
  })

  const occupantById = new Map<string, boolean>()
  for (const room of board.rooms) {
    for (const occupant of room.occupants) {
      occupantById.set(occupant.attendeeId, occupant.nightBeforeMismatch)
    }
  }

  // Superior night-before in a Standard room => mismatch true.
  expect(
    occupantById.get(String(idMap.get("attendee_072")))
  ).toBe(true)
  // Shared night-before in a single-capacity room => mismatch true.
  expect(occupantById.get(String(attendeeId))).toBe(true)

  // No night-before selection attendees render no flag (fail-safe false).
  for (const value of occupantById.values()) {
    expect(value).toBeTypeOf("boolean")
  }
})

// ---------------------------------------------------------------------------
// LEG-02: legacy orderAssignments surface as board buyer rooming-group
// suggestions, and backfilled orders behave like normal orders
// ---------------------------------------------------------------------------

test("LEG-02: all 44 legacy assignments surface as grouped buyer suggestions on the board after the backfill", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  await t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
    slug: LEGACY_EVENT_SLUG,
    ...previewGuard,
  })

  const board = await t.query(api.accommodation.getRoomAllocationBoard, {
    eventId: String(idMap.get("evt_divine_redesign")),
  })

  const suggestions = board.buyerSuggestions ?? []
  expect(suggestions).toHaveLength(LEGACY_AUDIT_COUNTS.legacyAssignmentAttendees)

  // Every suggestion maps to a room + hotel and stays a buyer request.
  const seenRoomHotel = new Set<string>()
  for (const suggestion of suggestions) {
    expect(suggestion.assignmentIntent).toBe("assign")
    expect(suggestion.roomId).toBeTruthy()
    expect(suggestion.roomLabel).toBeTruthy()
    expect(suggestion.hotelName).toBeTruthy()
    seenRoomHotel.add(`${suggestion.hotelName}|${suggestion.roomId}`)
  }
  // Requests group into multiple rooms/hotels (not a single bucket).
  expect(seenRoomHotel.size).toBeGreaterThan(1)

  // Board summary still counts the backfilled population as assignable.
  const summary = board.summary
  expect(summary.totalRooms).toBe(LEGACY_AUDIT_COUNTS.rooms)
  expect(summary.availableBeds).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// LEG-01: a backfilled order is editable and re-prices canonically
// ---------------------------------------------------------------------------

test("LEG-01: a backfilled order passes through the manage-booking edit path and re-prices", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const idMap = await seedLegacyPreview(t, buildLegacyPreviewSnapshot())

  await t.mutation(internal.backfillLegacyAccommodationPreferences.default, {
    slug: LEGACY_EVENT_SLUG,
    ...previewGuard,
  })

  // Pick the last no-selection order (single attendee, shared ticket).
  const orderId = String(idMap.get("order_38"))
  const bookingRef = "BK-PREVIEW-1038"
  const bookerEmail = "preview38@example.org"

  const { attendeeKey, selectionId } = await t.query(async (ctx) => {
    const attendee = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId as never))
      .first()
    const selection = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId as never))
      .first()
    return {
      attendeeKey: attendee?.attendeeKey ?? "",
      selectionId: selection?._id ?? null,
    }
  })
  expect(selectionId).toBeTruthy()

  const idempotencyKey = uniqueIdempotencyKey()
  const requestSignature = await mintEditRequestSignature({
    bookingRef,
    bookerEmail,
    editToken: null,
    idempotencyKey,
    selections: [
      {
        attendeeKey,
        occupancy: "shared",
        optionSelections: [
          { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
        ],
      },
    ],
    secret: TEST_SECRET,
  })

  const before = await loadAmountDue(t, orderId)
  const result = await t.mutation(api.publicTracking.updateAccommodation, {
    bookingRef,
    bookerEmail,
    requestSignature,
    idempotencyKey,
    selections: [
      {
        attendeeKey,
        occupancy: "shared",
        optionSelections: [
          { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
        ],
      },
    ],
  })
  expect(result.status).toBe("applied")
  // 1 person × €10/night × 2 nights of Superior upgrade added to the amount due.
  const after = await loadAmountDue(t, orderId)
  expect(after).not.toBeNull()
  expect((after ?? 0) - (before ?? 0)).toBe(2000)
})
