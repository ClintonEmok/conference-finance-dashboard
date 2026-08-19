/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

test("internal Tikkie upsert skips a no-op provider refresh", async () => {
  const t = convexTest(schema, modules)
  const args = {
    sourceId: "payment-1",
    payerName: "Jane Doe",
    payerAccountNumber: "NL00TEST",
    amountMinor: 2500,
    paidAt: 1_750_000_000_000,
    providerPayload: {
      paymentToken: "payment-1",
      counterPartyName: "Jane Doe",
      amountInCents: 2500,
    },
  }

  const first = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    args
  )
  const before = await t.query(async (ctx) => ctx.db.get("payments", first.id))

  const second = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    args
  )
  const after = await t.query(async (ctx) => ctx.db.get("payments", first.id))

  expect(first).toEqual({ id: first.id, inserted: true, updated: false })
  expect(second).toEqual({ id: first.id, inserted: false, updated: false })
  expect(after).toEqual(before)
})

test("Tikkie link sync returns active event links without scanning order links", async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()

  const insertLink = async (
    linkType: "event" | "order",
    status: "created" | "paid" | "expired",
    expiryDate: number
  ) =>
    t.mutation(async (ctx) =>
      ctx.db.insert("tikkiePaymentLinks", {
        providerOrderId: "provider-order",
        providerEventId: "provider-event",
        orderId: linkType === "order" ? "order-1" : undefined,
        eventId: "event-1",
        linkType,
        paymentRequestToken: `${linkType}-${status}-${expiryDate}`,
        paymentRequestUrl: "https://example.test/pay",
        status,
        statusSource: "poll",
        providerStatus: status,
        amountMinor: 0,
        description: "Conference payment",
        expiryDate,
        statusUpdatedAt: now,
      })
    )

  await insertLink("event", "created", now + 60_000)
  await insertLink("event", "expired", now - 60_000)
  await insertLink("order", "created", now + 60_000)

  const links = await t.query(internal.sync.internalGetTikkiePaymentLinks, {})

  expect(links).toHaveLength(1)
  expect(links[0]).toMatchObject({ linkType: "event", status: "created" })
})

test("unassigned payment sync is paginated", async () => {
  const t = convexTest(schema, modules)

  for (const sourceId of ["payment-1", "payment-2"]) {
    await t.mutation(async (ctx) =>
      ctx.db.insert("payments", {
        source: "tikkie",
        sourceId,
        payerName: sourceId,
        amountMinor: 1000,
        paidAt: 1_750_000_000_000,
        status: "unassigned",
      })
    )
  }

  const firstPage = await t.query(
    internal.sync.internalGetUnassignedPayments,
    { paginationOpts: { numItems: 1, cursor: null } }
  )
  const secondPage = await t.query(
    internal.sync.internalGetUnassignedPayments,
    {
      paginationOpts: {
        numItems: 1,
        cursor: firstPage.continueCursor,
      },
    }
  )

  expect(firstPage.page).toHaveLength(1)
  expect(firstPage.isDone).toBe(false)
  expect(secondPage.page).toHaveLength(1)
  expect(secondPage.isDone).toBe(true)
})

test("paid-order sync can defer canonical amount-due loading", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "deferred-due-event",
      title: "Deferred Due Event",
      startsAt: 1_750_000_000_000,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: 1_750_000_000_000,
    })
  )
  const orderId = await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      bookerName: "Jane Doe",
      totalAmountMinor: 2500,
      status: "pending",
      source: "internal",
    })
  )

  const metadata = await t.query(internal.sync.internalGetPaidOrders, {
    eventIds: [eventId],
    includeAmountDue: false,
  })
  const dueRows = await t.query(internal.sync.internalGetAmountDueByOrderIds, {
    orderIds: [orderId],
  })

  expect(metadata).toMatchObject([
    { _id: orderId, amountDueMinor: null, totalAmountMinor: 2500 },
  ])
  expect(dueRows).toEqual([{ _id: orderId, amountDueMinor: 0 }])
})

test("provider-order payment assignments stay visible under the canonical order", async () => {
  const t = convexTest(schema, modules)
  const authed = t.withIdentity({ name: "Admin", tokenIdentifier: "admin" })
  const eventId = await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "provider-order-alias-event",
      title: "Provider Order Alias Event",
      startsAt: 1_750_000_000_000,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: 1_750_000_000_000,
    })
  )
  const ticketTypeId = await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId,
      label: "Standard",
      priceMinor: 5000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: 1_750_000_000_000,
    })
  )
  const orderId = await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "integration",
      providerOrderId: "provider-order-42",
      bookingRef: "BK-ALIAS-42",
      bookerName: "Order Buyer",
      bookerEmail: "buyer@example.com",
      totalAmountMinor: 5000,
      status: "pending",
    })
  )
  const attendeeId = await t.mutation(async (ctx) =>
    ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "alias-attendee",
      name: "Order Buyer",
      gender: "unknown",
      sortOrder: 0,
    })
  )
  await t.mutation(async (ctx) =>
    ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId,
      quantity: 1,
      sortOrder: 0,
    })
  )
  await t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "tikkie",
      sourceId: "provider-payment-42",
      eventId,
      orderId: "provider-order-42",
      payerName: "Order Buyer",
      amountMinor: 5000,
      paidAt: 1_750_000_000_000,
      status: "auto_matched",
      matchedBy: "legacy-sync",
      matchedAt: 1_750_000_000_000,
    })
  )

  const ledger = await authed.query(api.orders.getOrdersWithFilters, {
    eventId,
    page: 1,
    pageSize: 25,
  })
  const row = ledger.orders.find((candidate) => candidate.orderId === orderId)
  expect(row).toMatchObject({
    orderId,
    providerOrderId: "provider-order-42",
    amountDueMinor: 5000,
    matchedAmountMinor: 5000,
    outstandingAmountMinor: 0,
  })
  expect(ledger.totals).toMatchObject({
    amountDueMinor: 5000,
    matchedAmountMinor: 5000,
    outstandingAmountMinor: 0,
  })

  const reconciliation = await authed.query(
    api.orders.getOrdersForReconciliation,
    { eventId, from: 0, to: 1_800_000_000_000 }
  )
  expect(reconciliation).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        orderId,
        providerOrderId: "provider-order-42",
        matchedAmountMinor: 5000,
      }),
    ])
  )

  const summary = await authed.query(api.payments.getPaymentSummary, {
    orderId: String(orderId),
  })
  expect(summary).toMatchObject({
    totalPaid: 5000,
    orderTotal: 5000,
    remaining: 0,
    paymentCount: 1,
  })
})
