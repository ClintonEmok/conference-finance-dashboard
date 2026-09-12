import { describe, expect, it } from "vitest"
import { automaticPeriod, classifyPaymentReminder } from "./payment-reminders"

describe("payment reminder policy", () => {
  it("classifies unpaid, partial, paid, overpaid and invalid balances", () => {
    expect(classifyPaymentReminder({ amountDueMinor: 1000, paidAmountMinor: 0, now: 1 })?.kind).toBe("unpaid")
    expect(classifyPaymentReminder({ amountDueMinor: 1000, paidAmountMinor: 500, now: 1 })?.kind).toBe("partial")
    expect(classifyPaymentReminder({ amountDueMinor: 1000, paidAmountMinor: 1000, now: 1 })).toBeNull()
    expect(classifyPaymentReminder({ amountDueMinor: 1000, paidAmountMinor: 2000, now: 1 })).toBeNull()
    expect(classifyPaymentReminder({ amountDueMinor: Number.NaN, paidAmountMinor: 0 })).toBeNull()
  })
  it("uses an inclusive due boundary and deterministic periods", () => {
    expect(classifyPaymentReminder({ amountDueMinor: 1000, paidAmountMinor: 0, dueAt: 100, now: 100 })?.kind).toBe("overdue")
    expect(automaticPeriod(120_000, 1, "oncePerPeriod")).toBe("2")
    expect(automaticPeriod(120_000, 1, "onceEver")).toBe("ever")
  })
})
