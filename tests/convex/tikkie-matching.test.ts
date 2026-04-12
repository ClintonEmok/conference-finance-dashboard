import { describe, it, expect } from "vitest"

import {
  evaluateOrderPaymentMatch,
  scoreNameMatch,
} from "@/lib/domain/finance/payment-matching"

describe("payment matching - name scoring", () => {
  it("matches exact names case-insensitively", () => {
    expect(scoreNameMatch("Jane Doe", "jane doe")).toBe(100)
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
})
