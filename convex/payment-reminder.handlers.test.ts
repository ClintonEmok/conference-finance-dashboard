/// <reference types="vite/client" />

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

function fresh() {
  return convexTest(schema, modules)
}

async function createEvent(
  t: TestConvexForDataModel<GenericDataModel>,
  slug = "payment-event"
) {
  return t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug,
      title: "Payment Event",
      startsAt: Date.now(),
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: Date.now(),
    })
  )
}

async function createTicketType(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: Awaited<ReturnType<typeof createEvent>>,
  priceMinor = 1_000
) {
  return t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId,
      label: "Conference ticket",
      priceMinor,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: Date.now(),
    })
  )
}

async function createOrder(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: Awaited<ReturnType<typeof createEvent>>,
  ticketTypeId: Awaited<ReturnType<typeof createTicketType>>,
  input: { email: string; bookingRef: string; bookerName?: string }
) {
  return t.mutation(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: input.bookingRef,
      bookerName: input.bookerName ?? "Booker",
      bookerEmail: input.email,
      submittedAt: Date.now(),
      currency: "EUR",
      totalAmountMinor: 1_000,
      status: "pending",
    })
    const attendeeId = await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: `attendee-${input.bookingRef}`,
      name: input.bookerName ?? "Booker",
      gender: "unknown",
      sortOrder: 0,
    })
    await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId,
      quantity: 1,
      sortOrder: 0,
    })
    return orderId
  })
}

test("manual reminders queue only selected eligible IDs and skip a fully paid selection", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const ticketTypeId = await createTicketType(t, eventId)
  const eligibleOrderId = await createOrder(t, eventId, ticketTypeId, {
    email: " eligible@example.com ",
    bookingRef: "  BK-ELIGIBLE  ",
  })
  const paidOrderId = await createOrder(t, eventId, ticketTypeId, {
    email: "paid@example.com",
    bookingRef: "BK-PAID",
  })

  await t.mutation(async (ctx) => {
    await ctx.db.insert("payments", {
      source: "bank_transfer",
      payerName: "Paid Booker",
      amountMinor: 1_000,
      paidAt: Date.now(),
      eventId,
      orderId: String(paidOrderId),
      status: "auto_matched",
    })
  })

  const preview = await t.query(
    api.paymentReminders.previewPaymentReminderAudience,
    {
      eventId,
    }
  )
  expect(preview.total).toBe(1)
  expect(
    (preview.recipients as Array<{ orderId: string }>).map(
      (recipient) => recipient.orderId
    )
  ).toEqual([
    String(eligibleOrderId),
  ])

  const result = await t.mutation(
    api.paymentReminders.scheduleManualPaymentReminders,
    {
      eventId,
      selection: {
        mode: "explicit",
        orderIds: [eligibleOrderId, paidOrderId],
      },
      authorize: true,
    }
  )

  expect(result.totalRecipients).toBe(1)
  expect(result.skipped).toBe(1)
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("paymentReminderDeliveries")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", result.campaignId))
      .collect()
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    orderId: eligibleOrderId,
    recipient: "eligible@example.com",
    bookingRef: "BK-ELIGIBLE",
    status: "queued",
    kind: "unpaid",
  })
})

test("manual reminders resolve an all-matching audience before checking balances", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t)
  const ticketTypeId = await createTicketType(t, eventId)
  await createOrder(t, eventId, ticketTypeId, {
    email: "eligible@example.com",
    bookingRef: "BK-ELIGIBLE",
  })

  const result = await t.mutation(
    api.paymentReminders.scheduleManualPaymentReminders,
    {
      eventId,
      selection: { mode: "allMatching" },
      authorize: true,
    }
  )

  expect(result.totalRecipients).toBe(1)
  expect(result.skipped).toBe(0)
})

test("manual selection cannot cross event boundaries", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const selectedEventId = await createEvent(t, "selected-event")
  const otherEventId = await createEvent(t, "other-event")
  const ticketTypeId = await createTicketType(t, otherEventId)
  const orderId = await createOrder(t, otherEventId, ticketTypeId, {
    email: "other@example.com",
    bookingRef: "BK-OTHER",
  })

  await expect(
    t.mutation(api.paymentReminders.scheduleManualPaymentReminders, {
      eventId: selectedEventId,
      selection: { mode: "explicit", orderIds: [orderId] },
      authorize: true,
    })
  ).rejects.toThrow("unknown, stale, or ineligible")
})

test("send-time context skips removed Ticket Tailor orders", async () => {
  const t = fresh()
  const { eventId, orderId, deliveryId } = await t.mutation(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "removed-event",
      title: "Removed Event",
      startsAt: Date.now(),
      timezone: "UTC",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: false,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: Date.now(),
    })
    const orderId = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-REMOVED",
      bookerName: "Removed Booker",
      bookerEmail: "removed@example.com",
      status: "pending",
    })
    await ctx.db.insert("ticketTailorOrders", {
      providerOrderId: "tt-removed",
      providerEventId: "tt-event",
      orderId,
      removedAt: Date.now(),
      rawPayload: {},
    })
    const deliveryId = await ctx.db.insert("paymentReminderDeliveries", {
      eventId,
      orderId,
      campaignId: "manual:removed",
      kind: "unpaid",
      period: "manual:removed",
      recipient: "removed@example.com",
      bookerName: "Removed Booker",
      bookingRef: "BK-REMOVED",
      currency: "EUR",
      amountDueMinor: 1_000,
      paidAmountMinor: 0,
      outstandingAmountMinor: 1_000,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    })
    return { eventId, orderId, deliveryId }
  })

  const context = await t.query(internal.paymentReminders.getDeliveryContext, {
    deliveryId,
  })
  expect(context).toMatchObject({
    delivery: { eventId, orderId },
    order: null,
    event: null,
  })
})

test("send-time context rejects whitespace-only recipients and references", async () => {
  const t = fresh()
  const deliveryId = await t.mutation(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "blank-contact-event",
      title: "Blank Contact Event",
      startsAt: Date.now(),
      timezone: "UTC",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: false,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: Date.now(),
    })
    const orderId = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "   ",
      bookerName: "Blank Booker",
      bookerEmail: "   ",
      status: "pending",
    })
    return ctx.db.insert("paymentReminderDeliveries", {
      eventId,
      orderId,
      campaignId: "manual:blank",
      kind: "unpaid",
      period: "manual:blank",
      recipient: "blank@example.com",
      bookerName: "Blank Booker",
      bookingRef: "BK-BLANK",
      currency: "EUR",
      amountDueMinor: 1_000,
      paidAmountMinor: 0,
      outstandingAmountMinor: 1_000,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    })
  })

  const context = await t.query(internal.paymentReminders.getDeliveryContext, {
    deliveryId,
  })
  expect(context?.order).toBeNull()
})

test("automatic ticks are idempotent for an event/order/kind/period", async () => {
  const t = fresh()
  const eventId = await createEvent(t, "automatic-event")
  const ticketTypeId = await createTicketType(t, eventId)
  const orderId = await createOrder(t, eventId, ticketTypeId, {
    email: "automatic@example.com",
    bookingRef: "BK-AUTOMATIC",
  })

  await t.mutation(async (ctx) => {
    await ctx.db.insert("eventPaymentReminderSettings", {
      eventId,
      enabled: true,
      automaticEnabled: true,
      dueAt: Date.now() + 60 * 60 * 1000,
      timezone: "UTC",
      cadenceMinutes: 60,
      repeatPolicy: "oncePerPeriod",
      updatedAt: Date.now(),
    })
  })

  await t.mutation(internal.paymentReminders.automaticTick, {})
  await t.mutation(internal.paymentReminders.automaticTick, {})

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("paymentReminderDeliveries")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ orderId, kind: "unpaid", status: "queued" })
})

test("delivery history is authenticated and exposes every delivery state", async () => {
  const seed = fresh()
  const eventId = await createEvent(seed, "history-event")
  await seed.mutation(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-HISTORY",
      bookerName: "History Booker",
      bookerEmail: "history@example.com",
      status: "pending",
    })
    for (const status of ["queued", "sent", "failed", "skipped"] as const) {
      await ctx.db.insert("paymentReminderDeliveries", {
        eventId,
        orderId,
        campaignId: `history:${status}`,
        kind: "unpaid",
        period: `history:${status}`,
        recipient: "history@example.com",
        bookerName: "History Booker",
        bookingRef: "BK-HISTORY",
        currency: "EUR",
        amountDueMinor: 1_000,
        paidAmountMinor: 0,
        outstandingAmountMinor: 1_000,
        status,
        attempts: status === "queued" ? 0 : 1,
        error:
          status === "failed" || status === "skipped"
            ? `${status} reason`
            : undefined,
        createdAt: Date.now(),
      })
    }
  })

  const authenticated = seed.withIdentity(adminIdentity)
  const history = await authenticated.query(
    api.paymentReminders.getReminderDeliveryHistory,
    {
      eventId,
    }
  )
  expect(history.map((row: { status: string }) => row.status).sort()).toEqual([
    "failed",
    "queued",
    "sent",
    "skipped",
  ])
  await expect(
    fresh().query(api.paymentReminders.getReminderDeliveryHistory, { eventId })
  ).rejects.toThrow("Unauthorized")
})
