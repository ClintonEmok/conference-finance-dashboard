/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"

import { internal } from "./_generated/api"
import schema from "./schema"
import type { DataModel, Id, TableNames } from "./_generated/dataModel"

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

function fresh(): TestConvexForDataModel<DataModel> {
  return convexTest(schema, modules)
}

async function insert<T extends TableNames>(
  t: TestConvexForDataModel<DataModel>,
  table: T,
  row: Record<string, unknown>
): Promise<Id<T>> {
  return await t.mutation(async (ctx) => {
    return (await ctx.db.insert(
      table,
      row as never
    )) as Id<T>
  })
}

type CorrectionFixture = {
  eventId: Id<"events">
  orderA: Id<"orders">
  orderB: Id<"orders">
  orderC: Id<"orders">
  orderD: Id<"orders">
  orderE: Id<"orders">
  orderF: Id<"orders">
  orderG: Id<"orders">
  orderH: Id<"orders">
  orderI: Id<"orders">
}

async function seedCorrectionFixture(
  t: TestConvexForDataModel<DataModel>
): Promise<CorrectionFixture> {
  const now = Date.now()

  const eventId = await insert(t, "events", {
    slug: "divine-redesign",
    title: "Divine Conference",
    startsAt: now,
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    isPublished: true,
    isSignupOpen: true,
    accommodationEnabled: false,
    primarySourceKind: "integration",
    primarySourceProvider: "ticket_tailor",
    updatedAt: now,
  })
  const otherEventId = await insert(t, "events", {
    slug: "other-event",
    title: "Other Event",
    startsAt: now,
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    isPublished: true,
    isSignupOpen: true,
    accommodationEnabled: false,
    primarySourceKind: "internal",
    updatedAt: now,
  })

  const ticketTypeId = await insert(t, "ticketTypes", {
    eventId,
    label: "18+",
    priceMinor: 25000,
    isActive: true,
    visibility: "public",
    availabilityState: "selectable",
    updatedAt: now,
  })

  const order = (
    event: Id<"events">,
    ref: string,
    overrides: Record<string, unknown> = {}
  ) =>
    insert(t, "orders", {
      eventId: event,
      source: "integration",
      bookingRef: ref,
      ...overrides,
    })

  const extension = (
    orderId: Id<"orders">,
    providerOrderId: string,
    normalizedStatus: string
  ) =>
    insert(t, "ticketTailorOrders", {
      providerOrderId,
      providerEventId: "tt_event",
      orderId,
      normalizedStatus,
      rawPayload: { provider: "ticket_tailor" },
    })

  const payment = (
    orderId: Id<"orders"> | undefined,
    payerName: string,
    status: string
  ) =>
    insert(t, "payments", {
      source: "tikkie",
      payerName,
      amountMinor: 25000,
      paidAt: now,
      orderId: orderId ? String(orderId) : undefined,
      status,
    })

  const orderA = await order(eventId, "A", {
    bookerName: "Alice",
    status: "paid",
    totalAmountMinor: 25000,
  })
  const orderB = await order(eventId, "B", {
    bookerName: "Bob",
    status: "paid",
    totalAmountMinor: 25000,
  })
  const orderC = await order(eventId, "C", {
    bookerName: "Carol",
    status: "paid",
    totalAmountMinor: 25000,
  })
  const orderD = await order(eventId, "D", {
    bookerName: "Dave",
    status: "pending",
    totalAmountMinor: 25000,
  })
  const orderE = await order(eventId, "E", {
    bookerName: "Eve",
    status: "pending",
    totalAmountMinor: 25000,
  })
  const orderF = await order(eventId, "F", {
    bookerName: "Frank",
    status: "paid",
    totalAmountMinor: 25000,
  })
  const orderG = await order(eventId, "G", {
    bookerName: "Grace",
    status: "pending",
    totalAmountMinor: 25000,
  })
  const orderH = await order(eventId, "H", {
    bookerName: "Heidi",
    status: "refunded",
    totalAmountMinor: 25000,
  })
  const orderI = await order(otherEventId, "I", {
    bookerName: "Ivan",
    status: "paid",
    totalAmountMinor: 25000,
  })

  await extension(orderA, "ttA", "paid")
  await extension(orderB, "ttB", "paid")
  await extension(orderC, "ttC", "paid")
  await extension(orderD, "ttD", "paid")
  await extension(orderE, "ttE", "paid")
  await extension(orderG, "ttG", "pending")
  await extension(orderH, "ttH", "refunded")
  await extension(orderI, "ttI", "paid")
  // orderF intentionally has no Ticket Tailor extension

  // Ambiguous rows with a canonical orderId never prove an order.
  await payment(orderA, "Alice", "ambiguous")
  await payment(orderB, "Bob", "auto_matched")
  await payment(orderC, "Carol", "manual_assignment")
  await payment(orderE, "Eve", "auto_matched")
  await payment(orderF, "Frank", "auto_matched")
  await payment(undefined, "Donor", "donation")

  // Attendee + ticket selection for orderA so the canonical amount due
  // resolves to 25000 (€250 ticket).
  const attendeeId = await insert(t, "orderAttendees", {
    orderId: orderA,
    attendeeKey: "attendee-1",
    name: "Alice",
    email: "alice@example.com",
    gender: "female",
    location: "",
    dietaryRestrictions: "",
    roommatePreference: "",
    roommateAvoid: "",
    sortOrder: 0,
  })
  await insert(t, "orderTicketSelections", {
    orderId: orderA,
    attendeeId,
    ticketTypeId,
    quantity: 1,
    sortOrder: 0,
  })

  return {
    eventId,
    orderA,
    orderB,
    orderC,
    orderD,
    orderE,
    orderF,
    orderG,
    orderH,
    orderI,
  }
}

async function snapshotState(
  t: TestConvexForDataModel<DataModel>
): Promise<{
  orderStatusById: Record<string, string | null>
  extensions: Array<{
    orderId: string
    normalizedStatus: string | null
  }>
  payments: Array<{
    id: string
    orderId: string | null
    status: string | null
    amountMinor: number
  }>
}> {
  const orderStatusById = await t.query(async (ctx) => {
    const rows = await ctx.db.query("orders").take(50)
    return Object.fromEntries(
      rows.map((row) => [String(row._id), row.status ?? null])
    )
  })

  const extensions = await t.query(async (ctx) => {
    const rows = await ctx.db.query("ticketTailorOrders").take(50)
    return rows
      .map((row) => ({
        orderId: String(row.orderId),
        normalizedStatus: row.normalizedStatus ?? null,
      }))
      .sort((a, b) => a.orderId.localeCompare(b.orderId))
  })

  const payments = await t.query(async (ctx) => {
    const rows = await ctx.db.query("payments").take(50)
    return rows
      .map((row) => ({
        id: String(row._id),
        orderId: row.orderId ?? null,
        status: row.status ?? null,
        amountMinor: row.amountMinor,
      }))
      .sort((a, b) => (a.orderId ?? "").localeCompare(b.orderId ?? ""))
  })

  return { orderStatusById, extensions, payments }
}

// ---------------------------------------------------------------------------
// Guards: the correction fails closed before any event/order/payment read,
// and cloud/site equivalence passes the guard.
// ---------------------------------------------------------------------------

test("guards: authorize false, missing detection, missing allowlist, malformed and mismatched slugs fail closed before any read; cloud/site equivalence passes", async () => {
  const t = fresh()
  const ref = internal.correctUnprovenPaidOrders.correctUnprovenPaidOrders

  await expect(
    t.mutation(ref, {
      authorize: false,
      allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
    })
  ).rejects.toThrow("AUTHORIZATION_REQUIRED")

  const previousSiteUrl = process.env.CONVEX_SITE_URL
  delete process.env.CONVEX_SITE_URL
  try {
    await expect(
      t.mutation(ref, {
        authorize: true,
        allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
      })
    ).rejects.toThrow("DEPLOYMENT_UNKNOWN")
  } finally {
    process.env.CONVEX_SITE_URL = previousSiteUrl
  }

  await expect(
    t.mutation(ref, { authorize: true })
  ).rejects.toThrow("ALLOWLIST_UNAVAILABLE")

  await expect(
    t.mutation(ref, {
      authorize: true,
      allowedDeploymentUrl: "https://evil.example.com",
    })
  ).rejects.toThrow("INVALID_DEPLOYMENT_URL")

  await expect(
    t.mutation(ref, {
      authorize: true,
      allowedDeploymentUrl: "https://other-deploy.convex.site",
    })
  ).rejects.toThrow("WRONG_DEPLOYMENT")

  // `.convex.cloud` (with trailing slash) and `.convex.site` are the same
  // deployment slug: the guard passes and the empty DB reports the event.
  await expect(
    t.mutation(ref, {
      authorize: true,
      allowedDeploymentUrl: "https://test-preview.convex.cloud/",
    })
  ).rejects.toThrow("Event with slug")
})

// ---------------------------------------------------------------------------
// Report: read-only, per-status counts, and only zero-proof paid candidates
// ---------------------------------------------------------------------------

test("report exposes per-canonical-status counts and only zero-proof paid candidates as ordersToFlip", async () => {
  const t = fresh()
  const fixture = await seedCorrectionFixture(t)

  const report = await t.query(
    internal.correctUnprovenPaidOrders.reconcileUnprovenPaidOrdersReport,
    {}
  )

  expect(report.eventId).toBe(String(fixture.eventId))
  expect(report.slug).toBe("divine-redesign")
  // All event orders are scanned (A..H; I belongs to the other event).
  expect(report.ordersScanned).toBe(8)
  // All event orders by canonical status: paid A/B/C/F, pending D/E/G,
  // refunded H (I belongs to the other event).
  expect(report.byCanonicalStatus).toEqual({
    paid: 4,
    pending: 3,
    refunded: 1,
    cancelled: 0,
  })
  expect(report.ordersToFlip).toHaveLength(1)
  expect(report.ordersToFlip[0]).toMatchObject({
    orderId: String(fixture.orderA),
    buyerName: "Alice",
    amountDueMinor: 25000,
  })
})

test("report returns an empty well-typed report when the slug has no event", async () => {
  const t = fresh()

  const report = await t.query(
    internal.correctUnprovenPaidOrders.reconcileUnprovenPaidOrdersReport,
    { slug: "no-such-event" }
  )

  expect(report).toEqual({
    eventId: undefined,
    slug: "no-such-event",
    ordersScanned: 0,
    byCanonicalStatus: { paid: 0, pending: 0, refunded: 0, cancelled: 0 },
    ordersToFlip: [],
  })
})

// ---------------------------------------------------------------------------
// Mutation: flips only the zero-proof paid row; never touches payment or
// extension rows; genuinely-paid/partial/pending/unrelated rows stay intact.
// ---------------------------------------------------------------------------

test("mutation flips only the zero-proof paid order and never creates, patches, or deletes payment or extension rows", async () => {
  const t = fresh()
  const fixture = await seedCorrectionFixture(t)

  const before = await snapshotState(t)

  const result = await t.mutation(
    internal.correctUnprovenPaidOrders.correctUnprovenPaidOrders,
    productionGuard
  )
  expect(result).toEqual({
    ordersScanned: 8,
    flipped: 1,
    alreadyPending: 4,
    skippedWithProof: 3,
  })

  const after = await snapshotState(t)

  // Only the zero-proof paid order flipped.
  expect(after.orderStatusById[String(fixture.orderA)]).toBe("pending")
  expect(after.orderStatusById[String(fixture.orderB)]).toBe("paid")
  expect(after.orderStatusById[String(fixture.orderC)]).toBe("paid")
  expect(after.orderStatusById[String(fixture.orderD)]).toBe("pending")
  expect(after.orderStatusById[String(fixture.orderE)]).toBe("pending")
  expect(after.orderStatusById[String(fixture.orderF)]).toBe("paid")
  expect(after.orderStatusById[String(fixture.orderG)]).toBe("pending")
  expect(after.orderStatusById[String(fixture.orderH)]).toBe("refunded")
  expect(after.orderStatusById[String(fixture.orderI)]).toBe("paid")

  // Historical extension rows are untouched (still auditable).
  expect(after.extensions).toEqual(before.extensions)

  // Payment rows are untouched in count and contents.
  expect(after.payments).toHaveLength(before.payments.length)
  expect(after.payments).toEqual(before.payments)
})

test("second authorized run is a no-op and counts the flipped row as already pending", async () => {
  const t = fresh()
  await seedCorrectionFixture(t)

  const ref = internal.correctUnprovenPaidOrders.correctUnprovenPaidOrders

  const first = await t.mutation(ref, productionGuard)
  expect(first).toEqual({
    ordersScanned: 8,
    flipped: 1,
    alreadyPending: 4,
    skippedWithProof: 3,
  })

  const second = await t.mutation(ref, productionGuard)
  expect(second).toEqual({
    ordersScanned: 8,
    flipped: 0,
    alreadyPending: 5,
    skippedWithProof: 3,
  })
})

test("mutation accepts an explicit slug and never touches another event", async () => {
  const t = fresh()
  const fixture = await seedCorrectionFixture(t)

  const result = await t.mutation(
    internal.correctUnprovenPaidOrders.correctUnprovenPaidOrders,
    { ...productionGuard, slug: "divine-redesign" }
  )
  expect(result.flipped).toBe(1)

  const otherEventOrder = await t.query(async (ctx) => {
    return await ctx.db.get("orders", fixture.orderI)
  })
  expect(otherEventOrder?.status).toBe("paid")
})
