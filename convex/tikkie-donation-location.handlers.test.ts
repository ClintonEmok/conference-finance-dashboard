/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const adminIdentity = { name: "Admin", tokenIdentifier: "admin" }
type TestConvex = TestConvexForDataModel<GenericDataModel>

async function seedEvent(t: TestConvex) {
  return await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "donation-location-event",
      title: "Donation Location Event",
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
}

async function createLink(
  t: TestConvex,
  eventId: string,
  purpose: "payment" | "donation",
  donationLocationLabel?: string
) {
  return await t.mutation(api.tikkie.createEventPaymentLink, {
    eventId,
    providerEventId: `${purpose}-provider`,
    paymentRequestToken: `${purpose}-token`,
    paymentRequestUrl: `https://example.test/${purpose}`,
    providerStatus: "OPEN",
    amountMinor: 0,
    description: `${purpose} link`,
    expiryDate: 1_800_000_000_000,
    purpose,
    donationLocationLabel,
  })
}

test("donation location labels require auth and follow the donation lifecycle", async () => {
  const t = convexTest(schema, modules)
  const eventId = await seedEvent(t)
  const donationLinkId = await createLink(
    t.withIdentity(adminIdentity),
    String(eventId),
    "donation",
    "  Welcome desk  "
  )

  await expect(
    t.mutation(api.tikkie.setDonationLocationLabel, {
      linkId: donationLinkId,
      label: "unauthenticated",
    })
  ).rejects.toThrow()

  const created = await t.query(async (ctx) =>
    ctx.db.get("tikkiePaymentLinks", donationLinkId)
  )
  expect(created?.donationLocationLabel).toBe("Welcome desk")

  const authed = t.withIdentity(adminIdentity)
  await authed.mutation(api.tikkie.setDonationLocationLabel, {
    linkId: donationLinkId,
    label: "  Main hall  ",
  })
  expect(
    (await authed.query(async (ctx) =>
      ctx.db.get("tikkiePaymentLinks", donationLinkId)
    ))?.donationLocationLabel
  ).toBe("Main hall")

  await authed.mutation(api.tikkie.setDonationLocationLabel, {
    linkId: donationLinkId,
  })
  expect(
    (await authed.query(async (ctx) =>
      ctx.db.get("tikkiePaymentLinks", donationLinkId)
    ))?.donationLocationLabel
  ).toBeUndefined()
})

test("payment links reject labels before insert and existing rows stay inert", async () => {
  const t = convexTest(schema, modules).withIdentity(adminIdentity)
  const eventId = await seedEvent(t)

  await expect(
    createLink(t, String(eventId), "payment", "Not a donation")
  ).rejects.toThrow(/require a donation link/)
  expect(
    await t.query(async (ctx) =>
      ctx.db
        .query("tikkiePaymentLinks")
        .withIndex("paymentRequestToken", (q) => q.eq("paymentRequestToken", "payment-token"))
        .first()
    )
  ).toBeNull()

  const paymentLinkId = await createLink(t, String(eventId), "payment")
  await expect(
    t.mutation(api.tikkie.setDonationLocationLabel, {
      linkId: paymentLinkId,
      label: "wrong purpose",
    })
  ).rejects.toThrow(/require a donation link/)
  expect(
    (await t.query(async (ctx) =>
      ctx.db.get("tikkiePaymentLinks", paymentLinkId)
    ))?.donationLocationLabel
  ).toBeUndefined()
})

test("canonical upserts retain and enrich their originating link id without reclassification", async () => {
  const t = convexTest(schema, modules).withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  const donationLinkId = await createLink(t, String(eventId), "donation")
  const paymentLinkId = await createLink(t, String(eventId), "payment")

  const donation = await t.mutation(api.payments.upsertTikkiePayment, {
    sourceId: "location-donation-token",
    eventId: String(eventId),
    purpose: "donation",
    tikkiePaymentLinkId: donationLinkId,
    payerName: "Donor",
    amountMinor: 2500,
    paidAt: 1_750_000_000_000,
  })
  const payment = await t.mutation(
    internal.payments.internalUpsertTikkiePayment,
    {
      sourceId: "location-payment-token",
      eventId: String(eventId),
      purpose: "payment",
      tikkiePaymentLinkId: paymentLinkId,
      payerName: "Payer",
      amountMinor: 5000,
      paidAt: 1_750_000_000_000,
    }
  )

  expect(
    await t.query(async (ctx) => ctx.db.get("payments", donation.id))
  ).toMatchObject({
    tikkiePaymentLinkId: donationLinkId,
    status: "donation",
    donationKind: "standalone",
  })
  expect(
    await t.query(async (ctx) => ctx.db.get("payments", payment.id))
  ).toMatchObject({
    tikkiePaymentLinkId: paymentLinkId,
    status: "unassigned",
  })

  const enriched = await t.mutation(api.payments.upsertTikkiePayment, {
    sourceId: "legacy-location-token",
    eventId: String(eventId),
    purpose: "donation",
    payerName: "Legacy donor",
    amountMinor: 1000,
    paidAt: 1_750_000_000_000,
  })
  await t.mutation(api.payments.upsertTikkiePayment, {
    sourceId: "legacy-location-token",
    eventId: String(eventId),
    purpose: "payment",
    tikkiePaymentLinkId: donationLinkId,
    payerName: "Legacy donor",
    amountMinor: 1000,
    paidAt: 1_750_000_000_000,
  })
  expect(
    await t.query(async (ctx) => ctx.db.get("payments", enriched.id))
  ).toMatchObject({
    tikkiePaymentLinkId: donationLinkId,
    status: "donation",
    donationKind: "standalone",
  })
  expect(
    await t.query(async (ctx) =>
      ctx.db
        .query("payments")
        .withIndex("source_sourceId", (q) =>
          q.eq("source", "tikkie").eq("sourceId", "legacy-location-token")
        )
        .take(10)
    )
  ).toHaveLength(1)
})
