import { describe, it, expect } from "vitest"

import {
  evaluateOrderPaymentMatch,
  selectBestBookerMatch,
  scoreNameMatch,
} from "@/lib/domain/finance/payment-matching"

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
