/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest"
import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

process.env.TIKKIE_API_KEY = "test-key"
process.env.TIKKIE_APP_TOKEN = "test-token"

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

afterEach(() => {
  vi.unstubAllGlobals()
})

test("the cron pull classifies a donation-link payment as a standalone donation and leaves a payment-link payment unassigned", async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()

  const eventId = await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "donation-ingestion-event",
      title: "Donation Ingestion Event",
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

  await t.mutation(async (ctx) =>
    ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "",
      providerEventId: "provider-donation-link",
      orderId: undefined,
      eventId: String(eventId),
      linkType: "event",
      paymentRequestToken: "donation-request-token",
      paymentRequestUrl: "https://example.test/donation",
      status: "created",
      statusSource: "create",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Donation link",
      expiryDate: now + 30 * DAY_MS,
      statusUpdatedAt: now,
      purpose: "donation",
    })
  )

  await t.mutation(async (ctx) =>
    ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "",
      providerEventId: "provider-payment-link",
      orderId: undefined,
      eventId: String(eventId),
      linkType: "event",
      paymentRequestToken: "payment-request-token",
      paymentRequestUrl: "https://example.test/payment",
      status: "created",
      statusSource: "create",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Payment link",
      expiryDate: now + 30 * DAY_MS,
      statusUpdatedAt: now,
      purpose: "payment",
    })
  )

  const paymentsByToken: Record<string, unknown[]> = {
    "donation-request-token": [
      {
        paymentToken: "donation-payment-1",
        counterPartyName: "Jane Donor",
        amountInCents: 2500,
        createdDateTime: "2026-01-15T10:00:00.000Z",
      },
    ],
    "payment-request-token": [
      {
        paymentToken: "payment-1",
        counterPartyName: "John Payer",
        amountInCents: 5000,
        createdDateTime: "2026-01-15T11:00:00.000Z",
      },
    ],
  }

  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input))
    const token = url.pathname.split("/")[2]
    const payments = paymentsByToken[token] ?? []

    return {
      ok: true,
      json: async () => ({
        payments,
        totalElementCount: payments.length,
      }),
    } as Response
  })
  vi.stubGlobal("fetch", fetchMock)

  await t.action(internal.autoSync.autoSyncTikkiePayments, {})

  expect(fetchMock).toHaveBeenCalledTimes(2)

  const payments = await t.query(async (ctx) =>
    ctx.db.query("payments").collect()
  )
  expect(payments).toHaveLength(2)

  const donationRow = payments.find(
    (payment) => payment.sourceId === "donation-payment-1"
  )
  expect(donationRow).toMatchObject({
    source: "tikkie",
    status: "donation",
    donationKind: "standalone",
    eventId,
  })
  expect(donationRow?.orderId).toBeUndefined()

  const paymentRow = payments.find(
    (payment) => payment.sourceId === "payment-1"
  )
  expect(paymentRow).toMatchObject({
    source: "tikkie",
    status: "unassigned",
    eventId,
  })
  expect(paymentRow?.orderId).toBeUndefined()

  // Gap 1 (D-03): the row the real cron action just classified is visible in
  // the event donation-income read. One identity-authed query, no new fixture.
  const income = await t
    .withIdentity({
      tokenIdentifier: "test:ingestion-admin",
      name: "Admin",
      email: "admin@example.com",
    })
    .query(api.donations.getEventDonationIncome, { eventId })

  expect(income.donations).toHaveLength(1)
  expect(income.donations[0]).toMatchObject({
    donationId: donationRow?._id,
    source: "tikkie",
    donationAmountMinor: 2_500,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 2_500,
    allocationCount: 0,
  })
  expect(income.totals).toEqual({
    donationCount: 1,
    donationsMinor: 2_500,
    allocatedMinor: 0,
    unallocatedRemainderMinor: 2_500,
  })

  // The unassigned payment-link row is not donation income.
  expect(
    income.donations.every((row) => row.donationId !== paymentRow?._id)
  ).toBe(true)
})
