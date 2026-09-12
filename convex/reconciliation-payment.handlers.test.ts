/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

async function fixture() {
  const t = convexTest(schema, modules)
  const eventId = await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "reconciliation-event",
      title: "Reconciliation Event",
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
  const otherEventId = await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "other-reconciliation-event",
      title: "Other Event",
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
      priceMinor: 5_000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: 1_750_000_000_000,
    })
  )
  const orderId = await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookerName: "  Canonical Buyer  ",
      totalAmountMinor: 5_000,
      status: "pending",
    })
  )
  const attendeeId = await t.mutation(async (ctx) =>
    ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "buyer",
      name: "Canonical Buyer",
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
  const otherOrderId = await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId: otherEventId,
      source: "internal",
      totalAmountMinor: 5_000,
      status: "pending",
    })
  )

  return { t, eventId, otherEventId, orderId, otherOrderId }
}

async function paymentCount(t: ReturnType<typeof convexTest>) {
  return t.query(async (ctx) => (await ctx.db.query("payments").take(100)).length)
}

test("logs cash and bank transfer payments with canonical manual assignment data", async () => {
  const { t, eventId, orderId } = await fixture()
  const authed = t.withIdentity({ name: "Operator", tokenIdentifier: "operator-1" })
  const before = Date.now()

  const cashId = await authed.mutation(api.payments.logReconciliationPayment, {
    eventId,
    orderId,
    source: "cash",
    payerName: "  Canonical Buyer  ",
    amountMinor: 1_250,
    payerAccountNumber: "   ",
    reference: " bank-ref-1 ",
    notes: "  cash desk  ",
  })
  const after = Date.now()
  const cash = await t.query(async (ctx) => ctx.db.get("payments", cashId))

  expect(cash).toMatchObject({
    eventId,
    orderId: String(orderId),
    source: "cash",
    payerName: "Canonical Buyer",
    amountMinor: 1_250,
    status: "manual_assignment",
    matchedBy: "operator-1",
    reference: "bank-ref-1",
    notes: "cash desk",
  })
  expect(cash?.payerAccountNumber).toBeUndefined()
  expect(cash?.matchedAt).toBeGreaterThanOrEqual(before)
  expect(cash?.matchedAt).toBeLessThanOrEqual(after)
  expect(cash?.paidAt).toBeGreaterThanOrEqual(before)
  expect(cash?.paidAt).toBeLessThanOrEqual(after)

  const bankId = await authed.mutation(api.payments.logReconciliationPayment, {
    eventId,
    orderId,
    source: "bank_transfer",
    payerName: "Second Buyer",
    amountMinor: 500,
    paidAt: 1_750_000_000_123,
  })
  expect(await t.query(async (ctx) => ctx.db.get("payments", bankId))).toMatchObject({
    source: "bank_transfer",
    paidAt: 1_750_000_000_123,
    status: "manual_assignment",
  })
})

test("rejects unauthenticated, cross-event, invalid, and non-outstanding writes", async () => {
  const { t, eventId, orderId, otherOrderId } = await fixture()
  const args = {
    eventId,
    orderId,
    source: "cash" as const,
    payerName: "Buyer",
    amountMinor: 100,
  }
  await expect(t.mutation(api.payments.logReconciliationPayment, args)).rejects.toThrow("Unauthorized")

  const authed = t.withIdentity({ name: "Operator", tokenIdentifier: "operator-2" })
  await expect(authed.mutation(api.payments.logReconciliationPayment, { ...args, orderId: otherOrderId })).rejects.toThrow("does not belong")
  await expect(authed.mutation(api.payments.logReconciliationPayment, { ...args, amountMinor: 0 })).rejects.toThrow("positive integer")
  await expect(authed.mutation(api.payments.logReconciliationPayment, { ...args, amountMinor: 1.5 })).rejects.toThrow("positive integer")
  await expect(authed.mutation(api.payments.logReconciliationPayment, { ...args, payerName: "   " })).rejects.toThrow("Payer name")
  await expect(authed.mutation(api.payments.logReconciliationPayment, { ...args, paidAt: 0 })).rejects.toThrow("valid timestamp")
  await expect(authed.mutation(api.payments.logReconciliationPayment, { ...args, source: "tikkie" as never })).rejects.toThrow()
  expect(await paymentCount(t)).toBe(0)

  const paidId = await t.mutation(async (ctx) => ctx.db.insert("payments", {
    eventId,
    orderId: String(orderId),
    source: "cash",
    payerName: "Prior payment",
    amountMinor: 5_000,
    paidAt: 1_750_000_000_000,
    status: "manual_assignment",
  }))
  expect(paidId).toBeDefined()
  await expect(authed.mutation(api.payments.logReconciliationPayment, args)).rejects.toThrow("no longer outstanding")
  expect(await paymentCount(t)).toBe(1)
})

test("reactive canonical queries expose matched, applied, outstanding, and payment summary projections", async () => {
  const { t, eventId, orderId } = await fixture()
  const authed = t.withIdentity({ name: "Operator", tokenIdentifier: "operator-3" })
  const before = await authed.query(api.orders.getOrdersForReconciliation, { eventId })
  expect(before[0]).toMatchObject({ amountDueMinor: 5_000, appliedAmountMinor: 0, outstandingAmountMinor: 5_000 })

  await authed.mutation(api.payments.logReconciliationPayment, {
    eventId,
    orderId,
    source: "cash",
    payerName: "Buyer",
    amountMinor: 2_000,
  })

  const after = await authed.query(api.orders.getOrdersForReconciliation, { eventId })
  expect(after[0]).toMatchObject({ matchedAmountMinor: 2_000, appliedAmountMinor: 2_000, donationAmountMinor: 0, outstandingAmountMinor: 3_000 })
  expect(await authed.query(api.payments.getPayments, { eventId })).toHaveLength(1)
  expect(await authed.query(api.payments.getPaymentSummary, { orderId: String(orderId) })).toMatchObject({ totalPaid: 2_000, remaining: 3_000 })
})
