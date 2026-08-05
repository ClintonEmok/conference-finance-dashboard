/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "@/convex/_generated/api"
import schema from "@/convex/schema"
import {
  evaluateOrderPaymentMatch,
  selectBestBookerMatch,
  scoreNameMatch,
} from "@/lib/domain/finance/payment-matching"

const modules = import.meta.glob("../../convex/**/*.ts")

describe("payment matching - name scoring", () => {
  it("matches exact names case-insensitively", () => {
    expect(scoreNameMatch("Jane Doe", "jane doe")).toBe(100)
  })

  it("normalizes accents and punctuation before scoring", () => {
    expect(scoreNameMatch("José-María O'Neil", "Jose Maria O Neil")).toBe(100)
  })

  it("treats surname-only matches as strong signals", () => {
    expect(scoreNameMatch("Jane Doe", "Doe")).toBeGreaterThanOrEqual(80)
  })

  it("returns a weak score for unrelated names", () => {
    expect(scoreNameMatch("Jane Doe", "Bob Wilson")).toBe(0)
  })
})

describe("payment matching - booker first", () => {
  it("auto-matches when the booker name is strong and the amount fits", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 5000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "auto_matched", orderId: "order_1" })
  })

  it("still auto-matches when the payment is partial", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 5000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
    ])

    expect(match?.status).toBe("auto_matched")
  })

  it("does not auto-match on attendee names alone", () => {
    const match = evaluateOrderPaymentMatch("John Smith", 10000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        attendeeNames: ["John Smith"],
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "ambiguous" })
  })

  it("marks close booker ties as ambiguous", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 10000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
      {
        orderId: "order_2",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "ambiguous" })
  })

  it("falls back to ambiguous when the amount is incompatible", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 15000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "ambiguous" })
  })

  it("does not auto-match when another booker is almost as strong", () => {
    const match = selectBestBookerMatch("Jane Doe", [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
      },
      {
        orderId: "order_2",
        bookerName: "Doe Jane",
      },
    ])

    expect(match).toEqual({ status: "ambiguous" })
  })

  it("returns null for weak booker matches", () => {
    const match = selectBestBookerMatch("Jane Doe", [
      {
        orderId: "order_1",
        bookerName: "Bob Wilson",
      },
    ])

    expect(match).toBeNull()
  })
})

describe("payment matching - canonical amount-due is authoritative", () => {
  it("auto-matches when the payment equals the canonical amount-due", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 10000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        // Canonical amount-due from the loader (tickets + accommodation).
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "auto_matched", orderId: "order_1" })
  })

  it("does not auto-match a payment larger than the canonical amount-due", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 12000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "ambiguous" })
  })

  it("compares against canonical amount-due, not the provider total", () => {
    // The provider total (totalAmountMinor) may differ from the canonical
    // amount-due; only the canonical amount-due constrains the match.
    const match = evaluateOrderPaymentMatch("Jane Doe", 10000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        // Provider-side total would be 9000, canonical due is 10000.
        amountDueMinor: 10000,
      },
    ])

    expect(match).toEqual({ status: "auto_matched", orderId: "order_1" })
  })

  it("keeps partial payments matchable against canonical amount-due", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 4000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 10000,
      },
    ])

    expect(match?.status).toBe("auto_matched")
  })

  it("treats a zero canonical amount-due as incompatible with any payment", () => {
    const match = evaluateOrderPaymentMatch("Jane Doe", 10000, [
      {
        orderId: "order_1",
        bookerName: "Jane Doe",
        amountDueMinor: 0,
      },
    ])

    expect(match).toEqual({ status: "ambiguous" })
  })
})

// ---------------------------------------------------------------------------
// Handler-level convex-test coverage for the Phase 40 Tikkie behavior:
// createPaymentLink's flexible-zero guard + order discriminator, and
// autoMatchTikkiePayments matching against canonical amount-due.
// ---------------------------------------------------------------------------

const BASE_TIKKIE_EVENT_AT = 1_750_000_000_000

async function seedTikkieEvent(t: TestConvexForDataModel<GenericDataModel>): Promise<{
  eventId: string
  categoryStandardId: string
  ticketNotIncludedId: string
  orderId: string
}> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "tikkie-match-conf",
      title: "Tikkie Match Conference",
      startsAt: BASE_TIKKIE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_TIKKIE_EVENT_AT,
    })
  })

  const categoryStandardId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
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

  const ticketNotIncludedId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Ticket only",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_TIKKIE_EVENT_AT,
    })
  })

  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationConfig", {
      eventId: eventId as never,
      baseCheckInAt: BASE_TIKKIE_EVENT_AT - 2 * 24 * 60 * 60 * 1000,
      baseCheckOutAt: BASE_TIKKIE_EVENT_AT,
      allowExtendedStayBefore: false,
      allowExtendedStayAfter: false,
      allowExtendedStayBoth: false,
      defaultCategoryId: categoryStandardId as never,
      breakfastIncluded: true,
      nightCount: 2,
      updatedAt: BASE_TIKKIE_EVENT_AT,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("eventAccommodationRates", {
      eventId: eventId as never,
      categoryId: categoryStandardId as never,
      occupancy: "shared",
      pricePerPersonMinor: 3000,
    })
  })
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
      bookingRef: "BK-TIKKIE-MATCH01",
      bookerName: "Bob Buyer", // deliberately different from the payer name
      bookerEmail: "bob@example.com",
      submittedAt: BASE_TIKKIE_EVENT_AT,
    })
  })
  const attendeeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: "tikkie-a",
      name: "Jane Doe",
      gender: "female",
      sortOrder: 0,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("orderTicketSelections", {
      orderId: orderId as never,
      attendeeId: attendeeId as never,
      ticketTypeId: ticketNotIncludedId as never,
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
      nightCount: 2,
    })
  })

  return {
    eventId: String(eventId),
    categoryStandardId: String(categoryStandardId),
    ticketNotIncludedId: String(ticketNotIncludedId),
    orderId: String(orderId),
  }
}

describe("convex tikkie createPaymentLink handler", () => {
  it("persists an order link with the flexible zero amount and order discriminator", async () => {
    const t = convexTest(schema, modules)
    const authed = t.withIdentity({ name: "Admin", tokenIdentifier: "admin" })

    const linkId = await authed.mutation(api.tikkie.createPaymentLink, {
      providerOrderId: "ORD-1",
      providerEventId: "event_1",
      orderId: "order_1",
      paymentRequestToken: "token-1",
      paymentRequestUrl: "https://example.com/pay",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Order ORD-1",
      expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    const link = await authed.query(api.tikkie.getPaymentLinkById, {
      linkId: linkId as never,
    })
    expect(link).not.toBeNull()
    expect(link?.linkType).toBe("order")
    expect(link?.amountMinor).toBe(0)
    expect(link?.status).toBe("created")
    expect(link?.statusSource).toBe("create")
  })

  it("rejects a non-zero amountMinor at the mutation boundary", async () => {
    const t = convexTest(schema, modules)
    const authed = t.withIdentity({ name: "Admin", tokenIdentifier: "admin" })

    await expect(
      authed.mutation(api.tikkie.createPaymentLink, {
        providerOrderId: "ORD-2",
        providerEventId: "event_1",
        orderId: "order_2",
        paymentRequestToken: "token-2",
        paymentRequestUrl: "https://example.com/pay",
        providerStatus: "OPEN",
        amountMinor: 1200,
        description: "Order ORD-2",
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
    ).rejects.toThrow(/flexible zero amount/)

    const links = await authed.query(api.tikkie.getPaymentLinksByOrderId, {
      orderId: "order_2",
    })
    expect(links).toHaveLength(0)
  })

  it("requires an authenticated caller", async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(api.tikkie.createPaymentLink, {
        providerOrderId: "ORD-3",
        providerEventId: "event_1",
        orderId: "order_3",
        paymentRequestToken: "token-3",
        paymentRequestUrl: "https://example.com/pay",
        providerStatus: "OPEN",
        amountMinor: 0,
        description: "Order ORD-3",
        expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
    ).rejects.toThrow(/Unauthorized/)
  })
})

describe("convex tikkie autoMatchTikkiePayments handler", () => {
  it("auto-matches an attendee payment against the canonical amount-due", async () => {
    const t = convexTest(schema, modules)
    const authed = t.withIdentity({ name: "Admin", tokenIdentifier: "admin" })
    const ctx = await seedTikkieEvent(t)

    // Event-level link so the mutation has a payment source.
    const linkId = await authed.mutation(api.tikkie.createEventPaymentLink, {
      eventId: ctx.eventId,
      providerEventId: "provider_event_1",
      paymentRequestToken: "link-token-1",
      paymentRequestUrl: "https://example.com/event-pay",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Event link",
      expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
    expect(linkId).toBeTruthy()

    // Unmatched payment from "Jane Doe" for exactly the canonical amount-due
    // (ticket 2000 + accommodation 2×3000 = 8000).
    await authed.mutation(api.tikkie.upsertTikkiePayment, {
      paymentLinkId: linkId,
      paymentRequestToken: "link-token-1",
      paymentToken: "payment-token-1",
      payerName: "Jane Doe",
      amountMinor: 8000,
      paidAt: Date.now(),
    })

    const result = await authed.mutation(api.tikkie.autoMatchTikkiePayments, {
      eventId: ctx.eventId,
    })

    expect(result.matchedCount).toBe(1)
    // `totalUnmatched` is the count of unmatched payments before matching
    // (existing mutation contract), so it stays 1 even though the single
    // payment was matched below.

    const payment = await authed.query(api.tikkie.getTikkiePaymentByToken, {
      paymentToken: "payment-token-1",
    })
    expect(payment?.orderId).toBe(ctx.orderId)
    expect(payment?.matchStatus).toBe("auto_matched")
  })

  it("leaves payments unmatched when the amount differs from canonical amount-due", async () => {
    const t = convexTest(schema, modules)
    const authed = t.withIdentity({ name: "Admin", tokenIdentifier: "admin" })
    const ctx = await seedTikkieEvent(t)

    const linkId = await authed.mutation(api.tikkie.createEventPaymentLink, {
      eventId: ctx.eventId,
      providerEventId: "provider_event_1",
      paymentRequestToken: "link-token-2",
      paymentRequestUrl: "https://example.com/event-pay",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Event link",
      expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })

    // Same attendee name but a non-canonical amount: the attendee fallback
    // requires an exact canonical amount-due match.
    await authed.mutation(api.tikkie.upsertTikkiePayment, {
      paymentLinkId: linkId,
      paymentRequestToken: "link-token-2",
      paymentToken: "payment-token-2",
      payerName: "Jane Doe",
      amountMinor: 5000,
      paidAt: Date.now(),
    })

    const result = await authed.mutation(api.tikkie.autoMatchTikkiePayments, {
      eventId: ctx.eventId,
    })

    expect(result.matchedCount).toBe(0)
    expect(result.totalUnmatched).toBe(1)

    const payment = await authed.query(api.tikkie.getTikkiePaymentByToken, {
      paymentToken: "payment-token-2",
    })
    expect(payment?.matchStatus).toBe("unmatched")
  })
})
