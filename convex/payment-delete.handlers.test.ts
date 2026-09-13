/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

const adminIdentity = {
  tokenIdentifier: "admin:payment-delete",
  name: "Admin",
  email: "admin@example.com",
}

async function seedPaymentFixtures(t: ReturnType<typeof convexTest>) {
  const eventId = await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug: "payment-delete-event",
      title: "Payment Delete Event",
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
      slug: "payment-delete-other-event",
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

  const insertPayment = async (input: {
    source: "tikkie" | "bank_transfer" | "cash"
    eventId?: typeof eventId
    orderId?: string
    status?: "auto_matched" | "manual_assignment" | "ambiguous" | "unassigned" | "donation"
    donationKind?: "overpayment" | "standalone"
  }) =>
    t.mutation(async (ctx) =>
      ctx.db.insert("payments", {
        source: input.source,
        eventId: input.eventId,
        orderId: input.orderId,
        payerName: "Payment Buyer",
        amountMinor: 2500,
        paidAt: 1_750_000_000_000,
        status: input.status ?? "unassigned",
        donationKind: input.donationKind,
      })
    )

  return {
    eventId,
    otherEventId,
    eligibleId: await insertPayment({ source: "cash", eventId }),
    bankId: await insertPayment({ source: "bank_transfer", eventId }),
    eventlessId: await insertPayment({ source: "cash" }),
    crossEventId: await insertPayment({ source: "cash", eventId: otherEventId }),
    tikkieId: await insertPayment({ source: "tikkie", eventId }),
    assignedId: await insertPayment({
      source: "cash",
      eventId,
      orderId: "orders_assigned",
      status: "manual_assignment",
    }),
    ambiguousId: await insertPayment({ source: "cash", eventId, status: "ambiguous" }),
    donationId: await insertPayment({
      source: "cash",
      eventId,
      status: "donation",
      donationKind: "standalone",
    }),
  }
}

test("deletePayment requires auth and deletes only eligible event-owned manual rows", async () => {
  const seeded = convexTest(schema, modules)
  const fixtures = await seedPaymentFixtures(seeded)
  const authed = seeded.withIdentity(adminIdentity)
  const anonymous = convexTest(schema, modules)

  await expect(
    anonymous.mutation(api.payments.deletePayment, {
      paymentId: fixtures.eligibleId,
      eventId: fixtures.eventId,
    })
  ).rejects.toThrow("Unauthorized")

  await expect(
    authed.mutation(api.payments.deletePayment, {
      paymentId: fixtures.eligibleId,
      eventId: fixtures.eventId,
    })
  ).resolves.toBe(fixtures.eligibleId)

  await expect(
    seeded.query(async (ctx) => ctx.db.get("payments", fixtures.eligibleId))
  ).resolves.toBeNull()

  await expect(
    authed.mutation(api.payments.deletePayment, {
      paymentId: fixtures.bankId,
      eventId: fixtures.eventId,
    })
  ).resolves.toBe(fixtures.bankId)
})

test("deletePayment fails closed for eventless, cross-event, assigned, ambiguous, donation, and Tikkie rows", async () => {
  const seeded = convexTest(schema, modules)
  const fixtures = await seedPaymentFixtures(seeded)
  const authed = seeded.withIdentity(adminIdentity)

  const guarded = [
    [fixtures.eventlessId, fixtures.eventId],
    [fixtures.crossEventId, fixtures.eventId],
    [fixtures.tikkieId, fixtures.eventId],
    [fixtures.assignedId, fixtures.eventId],
    [fixtures.ambiguousId, fixtures.eventId],
    [fixtures.donationId, fixtures.eventId],
  ] as const

  for (const [paymentId, eventId] of guarded) {
    await expect(
      authed.mutation(api.payments.deletePayment, { paymentId, eventId })
    ).rejects.toThrow()
    await expect(
      seeded.query(async (ctx) => ctx.db.get("payments", paymentId))
    ).resolves.not.toBeNull()
  }
})
