/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { internal } from "./_generated/api"
import schema from "./schema"
import {
  evaluateOrderPaymentMatch,
  type OrderPaymentMatchCandidate,
} from "../lib/domain/finance/payment-matching"

const modules = import.meta.glob("./**/*.ts")

const candidate = (orderId: string, account: string): OrderPaymentMatchCandidate => ({
  orderId,
  bookerName: "Jane Doe",
  amountDueMinor: 10_000,
  payerAccountNumbers: [account],
})

describe("Tikkie matching optimization", () => {
  it("uses a unique account hint only to break a strong-booker tie", () => {
    expect(
      evaluateOrderPaymentMatch("Jane Doe", 10_000, [
        candidate("order-a", "NL00 A"),
        candidate("order-b", "NL00 B"),
      ], "nl00-b")
    ).toEqual({ status: "auto_matched", orderId: "order-b" })
  })

  it("keeps shared accounts ambiguous", () => {
    expect(
      evaluateOrderPaymentMatch("Jane Doe", 10_000, [
        candidate("order-a", "NL00 A"),
        candidate("order-b", "NL00 A"),
      ], "NL00-A")
    ).toEqual({ status: "ambiguous" })
  })

  it("does not let an account create a match or bypass name and amount rules", () => {
    expect(
      evaluateOrderPaymentMatch("Someone Else", 10_000, [candidate("order-a", "NL00-A")], "NL00-A")
    ).toBeNull()
    expect(
      evaluateOrderPaymentMatch("Jane Doe", 10_001, [candidate("order-a", "NL00-A")], "NL00-A")
    ).toEqual({ status: "ambiguous" })
  })

  it("preserves partial-payment matching and overpayment safety", () => {
    expect(
      evaluateOrderPaymentMatch("Jane Doe", 4_000, [candidate("order-a", "NL00-A")])
    ).toEqual({ status: "auto_matched", orderId: "order-a" })
    expect(
      evaluateOrderPaymentMatch("Jane Doe", 10_001, [candidate("order-a", "NL00-A")])
    ).toEqual({ status: "ambiguous" })
  })

  it("persists event/account data and only returns that event's unassigned Tikkie rows", async () => {
    const t = convexTest(schema, modules)
    const [eventA, eventB] = await Promise.all([
      t.mutation(async (ctx) =>
        ctx.db.insert("events", {
          slug: "optimization-a",
          title: "A",
          startsAt: 1,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: false,
          primarySourceKind: "internal",
          updatedAt: 1,
        })
      ),
      t.mutation(async (ctx) =>
        ctx.db.insert("events", {
          slug: "optimization-b",
          title: "B",
          startsAt: 1,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: false,
          primarySourceKind: "internal",
          updatedAt: 1,
        })
      ),
    ])

    await t.mutation(internal.payments.internalUpsertTikkiePayment, {
      sourceId: "payment-a",
      eventId: eventA,
      payerName: "Jane Doe",
      payerAccountNumber: "NL00-A",
      amountMinor: 10_000,
      paidAt: 1,
    })
    await t.mutation(internal.payments.internalUpsertTikkiePayment, {
      sourceId: "payment-b",
      eventId: eventB,
      payerName: "Jane Doe",
      payerAccountNumber: "NL00-B",
      amountMinor: 10_000,
      paidAt: 1,
    })

    const rows = await t.query(internal.sync.internalGetUnassignedPayments, {
      eventIds: [eventA],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      eventId: eventA,
      payerAccountNumber: "NL00-A",
    })
  })
})
