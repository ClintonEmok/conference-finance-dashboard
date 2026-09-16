/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import type { Doc, Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000
const adminIdentity = { name: "Admin", tokenIdentifier: "admin" }

type TestConvex = TestConvexForDataModel<GenericDataModel>

function fresh() {
  return convexTest(schema, modules)
}

async function seedEvent(
  client: TestConvex,
  slug = "donation-link-event"
): Promise<Id<"events">> {
  return await client.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug,
      title: "Donation Link Event",
      startsAt: BASE_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: BASE_AT,
    })
  )
}

async function createEventLink(
  client: TestConvex,
  eventId: Id<"events">,
  purpose: "payment" | "donation",
  token: string,
  url: string
): Promise<Id<"tikkiePaymentLinks">> {
  return await client.mutation(api.tikkie.createEventPaymentLink, {
    eventId: String(eventId),
    providerEventId: `provider-${token}`,
    paymentRequestToken: token,
    paymentRequestUrl: url,
    providerStatus: "OPEN",
    amountMinor: 0,
    description: `${purpose} link`,
    expiryDate: BASE_AT + 30 * DAY_MS,
    purpose,
  })
}

async function seedEventWithLinks(client: TestConvex) {
  const eventId = await seedEvent(client)
  const paymentLinkId = await createEventLink(
    client,
    eventId,
    "payment",
    "payment-link-token",
    "https://example.test/payment-link"
  )
  const donationLinkId = await createEventLink(
    client,
    eventId,
    "donation",
    "donation-link-token",
    "https://example.test/donation-link"
  )
  return { eventId, paymentLinkId, donationLinkId }
}

test("(a) a purpose-less legacy link still resolves as the payment link while the donation link stays hidden", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const { eventId, paymentLinkId, donationLinkId } = await seedEventWithLinks(t)

  const paymentLink = await t.query(async (ctx) =>
    ctx.db.get("tikkiePaymentLinks", paymentLinkId)
  )
  const donationLink = await t.query(async (ctx) =>
    ctx.db.get("tikkiePaymentLinks", donationLinkId)
  )
  expect(paymentLink?.purpose).toBe("payment")
  expect(donationLink?.purpose).toBe("donation")

  await t.mutation(async (ctx) =>
    ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "",
      providerEventId: "provider-legacy",
      orderId: undefined,
      eventId: String(eventId),
      linkType: "event",
      paymentRequestToken: "legacy-link-token",
      paymentRequestUrl: "https://example.test/legacy-payment-link",
      status: "created",
      statusSource: "create",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Legacy payment link",
      expiryDate: BASE_AT + 30 * DAY_MS,
      statusUpdatedAt: BASE_AT,
    })
  )

  const successLink = await t.query(api.tikkie.getEventPaymentLinkForSuccess, {
    eventId,
  })
  expect(successLink?.paymentUrl).toBe("https://example.test/legacy-payment-link")
  expect(successLink?.paymentUrl).not.toBe("https://example.test/donation-link")

  const paymentRead = await t.query(api.tikkie.getEventPaymentLink, {
    eventId: String(eventId),
  })
  expect(paymentRead?.paymentRequestUrl).toBe(
    "https://example.test/legacy-payment-link"
  )
  expect(paymentRead?.paymentRequestUrl).not.toBe(
    "https://example.test/donation-link"
  )

  const donationRead = await t.query(api.tikkie.getEventDonationLink, {
    eventId,
  })
  expect(donationRead).toEqual({
    paymentUrl: "https://example.test/donation-link",
    amountMinor: 0,
    description: "donation link",
    createdAt: expect.any(Number),
  })

  const emptyEventId = await seedEvent(t, "donation-link-empty-event")
  expect(
    await t.query(api.tikkie.getEventDonationLink, { eventId: emptyEventId })
  ).toBeNull()
})

test("(b) a donation-link payment inserts as a standalone donation and is never reclassified", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const { eventId } = await seedEventWithLinks(t)

  const donationArgs = {
    sourceId: "donation-token-1",
    eventId: String(eventId),
    purpose: "donation" as const,
    payerName: "Jane Donor",
    amountMinor: 2500,
    paidAt: BASE_AT,
  }

  const first = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    donationArgs
  )
  expect(first.inserted).toBe(true)

  const before = await t.query(async (ctx) =>
    ctx.db.get("payments", first.id)
  )
  expect(before?.source).toBe("tikkie")
  expect(before?.status).toBe("donation")
  expect(before?.donationKind).toBe("standalone")
  expect(before?.eventId).toBe(eventId)
  expect(before?.orderId).toBeUndefined()
  expect(Object.keys(before ?? {})).not.toContain("orderId")

  const second = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    donationArgs
  )
  const afterRepeat = await t.query(async (ctx) =>
    ctx.db.get("payments", first.id)
  )
  expect(second).toEqual({ id: first.id, inserted: false, updated: false })
  expect(afterRepeat).toEqual(before)

  const third = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    { ...donationArgs, purpose: "payment" }
  )
  const afterReclassifyAttempt = await t.query(async (ctx) =>
    ctx.db.get("payments", first.id)
  )
  expect(third).toEqual({ id: first.id, inserted: false, updated: false })
  expect(afterReclassifyAttempt).toEqual(before)

  const publicFirst = await t.mutation(api.payments.upsertTikkiePayment, {
    sourceId: "donation-public-1",
    eventId: String(eventId),
    purpose: "donation",
    payerName: "Jane Donor",
    amountMinor: 2500,
    paidAt: BASE_AT,
  })
  const publicRow = await t.query(async (ctx) =>
    ctx.db.get("payments", publicFirst.id)
  )
  expect(publicRow?.source).toBe("tikkie")
  expect(publicRow?.status).toBe("donation")
  expect(publicRow?.donationKind).toBe("standalone")
  expect(publicRow?.eventId).toBe(eventId)
  expect(publicRow?.orderId).toBeUndefined()

  await expect(
    t.mutation(api.payments.upsertTikkiePayment, {
      sourceId: "donation-missing-event-public",
      payerName: "Jane Donor",
      amountMinor: 2500,
      paidAt: BASE_AT,
      purpose: "donation",
    })
  ).rejects.toThrow(/Donation payments require a resolvable event id/)

  await expect(
    t.mutation(internal.payments.internalUpsertTikkiePayment, {
      sourceId: "donation-missing-event-internal",
      payerName: "Jane Donor",
      amountMinor: 2500,
      paidAt: BASE_AT,
      purpose: "donation",
    })
  ).rejects.toThrow(/Donation payments require a resolvable event id/)

  const missedPublic = await t.query(async (ctx) =>
    ctx.db
      .query("payments")
      .withIndex("source_sourceId", (q) =>
        q.eq("source", "tikkie").eq("sourceId", "donation-missing-event-public")
      )
      .first()
  )
  const missedInternal = await t.query(async (ctx) =>
    ctx.db
      .query("payments")
      .withIndex("source_sourceId", (q) =>
        q
          .eq("source", "tikkie")
          .eq("sourceId", "donation-missing-event-internal")
      )
      .first()
  )
  expect(missedPublic).toBeNull()
  expect(missedInternal).toBeNull()
})

test("(c) a Tikkie standalone donation is returned by getStandaloneDonations", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const { eventId } = await seedEventWithLinks(t)

  const donation = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    {
      sourceId: "donation-token-1",
      eventId: String(eventId),
      purpose: "donation",
      payerName: "Jane Donor",
      amountMinor: 2500,
      paidAt: BASE_AT,
    }
  )

  const page = await t.query(api.payments.getStandaloneDonations, {
    eventId,
    paginationOpts: { numItems: 50, cursor: null },
  })

  expect(page.page).toHaveLength(1)
  expect(page.page[0]).toMatchObject({
    _id: donation.id,
    source: "tikkie",
    status: "donation",
    donationKind: "standalone",
    eventId,
    amountMinor: 2500,
  })
})

test("(d) a donation-link payment is never matched and its link is never scanned", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const { eventId, paymentLinkId, donationLinkId } = await seedEventWithLinks(t)

  const donation = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    {
      sourceId: "donation-token-1",
      eventId: String(eventId),
      purpose: "donation",
      payerName: "Jane Donor",
      amountMinor: 2500,
      paidAt: BASE_AT,
    }
  )

  const unassigned = await t.query(api.payments.getUnassignedPayments)
  expect(
    unassigned.some((payment: Doc<"payments">) => payment._id === donation.id)
  ).toBe(false)

  const internalUnassigned = await t.query(
    internal.sync.internalGetUnassignedPayments,
    {}
  )
  expect(
    internalUnassigned.some(
      (payment: Doc<"payments">) => payment._id === donation.id
    )
  ).toBe(false)

  const orderId = await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-DONATION-01",
      bookerName: "Jane Donor",
      totalAmountMinor: 2500,
      status: "pending",
    })
  )

  const donationMirrorId = await t.mutation(async (ctx) =>
    ctx.db.insert("tikkiePayments", {
      paymentLinkId: String(donationLinkId),
      paymentRequestToken: "donation-link-token",
      paymentToken: "donation-token-1",
      payerName: "Jane Donor",
      amountMinor: 2500,
      paidAt: BASE_AT,
      matchStatus: "unmatched",
    })
  )

  const firstRun = await t.mutation(api.tikkie.autoMatchTikkiePayments, {
    eventId,
  })
  expect(firstRun.matchedCount).toBe(0)

  const donationMirrorAfterFirst = await t.query(async (ctx) =>
    ctx.db.get("tikkiePayments", donationMirrorId)
  )
  expect(donationMirrorAfterFirst?.matchStatus).toBe("unmatched")
  expect(donationMirrorAfterFirst?.orderId).toBeUndefined()

  const donationAfterFirst = await t.query(async (ctx) =>
    ctx.db.get("payments", donation.id)
  )
  expect(donationAfterFirst?.orderId).toBeUndefined()

  const paymentMirrorId = await t.mutation(async (ctx) =>
    ctx.db.insert("tikkiePayments", {
      paymentLinkId: String(paymentLinkId),
      paymentRequestToken: "payment-link-token",
      paymentToken: "payment-token-1",
      payerName: "Jane Donor",
      amountMinor: 2500,
      paidAt: BASE_AT,
      matchStatus: "unmatched",
    })
  )

  const secondRun = await t.mutation(api.tikkie.autoMatchTikkiePayments, {
    eventId,
  })
  expect(secondRun.matchedCount).toBe(1)

  const paymentMirrorAfter = await t.query(async (ctx) =>
    ctx.db.get("tikkiePayments", paymentMirrorId)
  )
  expect(paymentMirrorAfter?.matchStatus).toBe("auto_matched")
  expect(paymentMirrorAfter?.orderId).toBe(String(orderId))

  const donationMirrorAfterSecond = await t.query(async (ctx) =>
    ctx.db.get("tikkiePayments", donationMirrorId)
  )
  expect(donationMirrorAfterSecond?.matchStatus).toBe("unmatched")
})

test("(e) public tracking never surfaces the donation link", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  const bookingRef = "BK-DONATE-TRACK-01"

  await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef,
      bookerName: "Jane Donor",
      totalAmountMinor: 2500,
      status: "pending",
    })
  )

  await createEventLink(
    t,
    eventId,
    "donation",
    "donation-link-token",
    "https://example.test/donation-link"
  )

  const trackingWithDonationOnly = await t.query(
    api.publicTracking.getByBookingRef,
    { bookingRef }
  )
  expect(trackingWithDonationOnly?.tikkieUrl).toBeNull()

  await createEventLink(
    t,
    eventId,
    "payment",
    "payment-link-token",
    "https://example.test/payment-link"
  )

  const trackingWithPaymentLink = await t.query(
    api.publicTracking.getByBookingRef,
    { bookingRef }
  )
  expect(trackingWithPaymentLink?.tikkieUrl).toBe(
    "https://example.test/payment-link"
  )
})
