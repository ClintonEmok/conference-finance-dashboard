import { describe, expect, it } from "vitest"

import {
  deriveAllocationPaymentBreakdowns,
  deriveAllocationPaymentState,
} from "@/lib/domain/finance/allocation-payment-state"

function dueMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries)
}

describe("allocation payment-state - tri-state classification", () => {
  it("treats a zero-due attendee as paid even with no payment", () => {
    expect(deriveAllocationPaymentState(0, 0)).toBe("paid")
    expect(deriveAllocationPaymentState(null, 0)).toBe("paid")
    expect(deriveAllocationPaymentState(undefined, 0)).toBe("paid")
  })

  it("classifies an attendee with paid >= due as paid", () => {
    expect(deriveAllocationPaymentState(1000, 1000)).toBe("paid")
    expect(deriveAllocationPaymentState(1000, 5000)).toBe("paid")
  })

  it("classifies a positive payment below due as partial", () => {
    expect(deriveAllocationPaymentState(1000, 500)).toBe("partial")
  })

  it("classifies a zero payment against positive due as unpaid", () => {
    expect(deriveAllocationPaymentState(1000, 0)).toBe("unpaid")
    expect(deriveAllocationPaymentState(1000, null)).toBe("unpaid")
  })

  it("clamps invalid/negative inputs through the minor-unit conventions", () => {
    // Negative due normalizes to zero, so the attendee is paid.
    expect(deriveAllocationPaymentState(-100, 0)).toBe("paid")
    // Negative paid normalizes to zero, so a positive due is unpaid.
    expect(deriveAllocationPaymentState(1000, -5)).toBe("unpaid")
    // Non-finite paid normalizes to zero.
    expect(deriveAllocationPaymentState(1000, Number.NaN)).toBe("unpaid")
  })

  it("never reads order status: classification only depends on due/paid minor units", () => {
    // A pending provider order with a recorded payment classifies as paid —
    // the canonical matched balance, not orders.status, is the authority.
    expect(deriveAllocationPaymentState(8000, 8000)).toBe("paid")
  })
})

describe("allocation payment-state - weighted payment allocation", () => {
  it("returns an entry for every attendee in the due map", () => {
    const result = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([
        ["a-1", 1000],
        ["a-2", 2000],
      ]),
      paidTotalMinor: 1500,
    })

    expect(result.size).toBe(2)
    expect(result.get("a-1")).toEqual({
      attendeeId: "a-1",
      amountDueMinor: 1000,
      paidAmountMinor: 500,
      paymentState: "partial",
    })
    expect(result.get("a-2")).toEqual({
      attendeeId: "a-2",
      amountDueMinor: 2000,
      paidAmountMinor: 1000,
      paymentState: "partial",
    })
  })

  it("allocates the matched order payment total by due weight, summing exactly", () => {
    const result = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([
        ["a-1", 1000],
        ["a-2", 1000],
        ["a-3", 1000],
      ]),
      paidTotalMinor: 1000,
    })

    const allocatedTotal = [...result.values()].reduce(
      (sum, breakdown) => sum + breakdown.paidAmountMinor,
      0
    )
    expect(allocatedTotal).toBe(1000)
    // Largest-remainder tie-breaking distributes one whole unit deterministically.
    const paidIds = [...result.values()]
      .filter((breakdown) => breakdown.paidAmountMinor === 1)
      .map((breakdown) => breakdown.attendeeId)
    expect(paidIds).toEqual(["a-1"])
  })

  it("keeps zero-due attendees paid and unallocated from an overpayment total", () => {
    const result = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([
        ["a-free", 0],
        ["a-paying", 2000],
      ]),
      paidTotalMinor: 5000,
    })

    expect(result.get("a-free")).toEqual({
      attendeeId: "a-free",
      amountDueMinor: 0,
      paidAmountMinor: 0,
      paymentState: "paid",
    })
    expect(result.get("a-paying")).toEqual({
      attendeeId: "a-paying",
      amountDueMinor: 2000,
      paidAmountMinor: 5000,
      paymentState: "paid",
    })
  })

  it("omits attendees absent from the due map", () => {
    const result = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([["a-1", 1000]]),
      paidTotalMinor: 500,
    })

    expect(result.has("a-missing")).toBe(false)
    expect(result.size).toBe(1)
  })

  it("normalizes a missing paid total to zero and classifies all as unpaid or paid-by-zero-due", () => {
    const result = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([
        ["a-1", 1000],
        ["a-2", 0],
      ]),
      paidTotalMinor: null,
    })

    expect(result.get("a-1")?.paidAmountMinor).toBe(0)
    expect(result.get("a-1")?.paymentState).toBe("unpaid")
    expect(result.get("a-2")?.paymentState).toBe("paid")
  })

  it("handles an empty due map and a zero paid total deterministically", () => {
    const empty = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([]),
      paidTotalMinor: 0,
    })
    expect(empty.size).toBe(0)

    const zeroPaid = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([["a-1", 1000]]),
      paidTotalMinor: 0,
    })
    expect(zeroPaid.get("a-1")?.paymentState).toBe("unpaid")
  })

  it("produces a full tri-state mix when partial payment is allocated", () => {
    const result = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: dueMap([
        ["a-paid", 1000],
        ["a-partial", 2000],
        ["a-unpaid", 3000],
      ]),
      paidTotalMinor: 2000,
    })

    expect(result.get("a-paid")?.paymentState).toBe("paid")
    expect(result.get("a-partial")?.paymentState).toBe("partial")
    expect(result.get("a-unpaid")?.paymentState).toBe("unpaid")
  })
})
