import { describe, it, expect } from "vitest"

/**
 * Tests for the payment matching algorithm used in Convex mutations.
 * The matching logic is replicated here as pure functions to verify behavior
 * without requiring Convex runtime context.
 */

// --- Matching helpers (mirrors Convex logic) ---

function normalizeForMatch(name: string): string {
  return name.toLowerCase().trim()
}

function matchByName(
  payerName: string,
  buyerName: string | null | undefined
): boolean {
  if (!buyerName) return false
  return normalizeForMatch(payerName) === normalizeForMatch(buyerName)
}

function matchByAttendeeName(
  payerName: string,
  attendeeNames: string[]
): boolean {
  const normalized = normalizeForMatch(payerName)
  return attendeeNames.some((name) => normalizeForMatch(name) === normalized)
}

function matchPayment(
  payment: { payerName: string; amountMinor: number },
  order: {
    _id: string
    buyerName: string | null
    totalAmountMinor: number | null
  },
  attendeeNames: string[]
): boolean {
  // First: exact buyer name match
  if (matchByName(payment.payerName, order.buyerName)) {
    return true
  }

  // Fallback: attendee name match WITH exact amount
  if (
    matchByAttendeeName(payment.payerName, attendeeNames) &&
    order.totalAmountMinor != null &&
    order.totalAmountMinor === payment.amountMinor
  ) {
    return true
  }

  return false
}

// --- Test data ---

const makeOrder = (
  overrides: Partial<{
    _id: string
    buyerName: string | null
    totalAmountMinor: number | null
  }> = {}
) => ({
  _id: "order_1",
  buyerName: "Jane Doe",
  totalAmountMinor: 10000,
  ...overrides,
})

const makePayment = (
  overrides: Partial<{ payerName: string; amountMinor: number }> = {}
) => ({
  payerName: "Jane Doe",
  amountMinor: 10000,
  ...overrides,
})

// --- Tests ---

describe("payment matching - booker name", () => {
  it("matches when buyer name equals payer name exactly", () => {
    const order = makeOrder({ buyerName: "Jane Doe" })
    const payment = makePayment({ payerName: "Jane Doe" })

    expect(matchPayment(payment, order, [])).toBe(true)
  })

  it("matches case-insensitively", () => {
    const order = makeOrder({ buyerName: "Jane Doe" })
    const payment = makePayment({ payerName: "jane doe" })

    expect(matchPayment(payment, order, [])).toBe(true)
  })

  it("trims whitespace before matching", () => {
    const order = makeOrder({ buyerName: "  Jane Doe  " })
    const payment = makePayment({ payerName: "Jane Doe" })

    expect(matchPayment(payment, order, [])).toBe(true)
  })

  it("does not match when buyer name differs", () => {
    const order = makeOrder({ buyerName: "Jane Doe" })
    const payment = makePayment({ payerName: "John Smith" })

    expect(matchPayment(payment, order, [])).toBe(false)
  })

  it("does not match when buyer name is null", () => {
    const order = makeOrder({ buyerName: null })
    const payment = makePayment({ payerName: "Jane Doe" })

    expect(matchPayment(payment, order, [])).toBe(false)
  })
})

describe("payment matching - attendee name fallback", () => {
  it("matches by attendee name when booker name does not match", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "John Smith",
      amountMinor: 10000,
    })

    expect(matchPayment(payment, order, ["John Smith", "Bob Wilson"])).toBe(
      true
    )
  })

  it("requires exact amount match for attendee fallback", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "John Smith",
      amountMinor: 5000,
    })

    expect(matchPayment(payment, order, ["John Smith"])).toBe(false)
  })

  it("matches first matching attendee", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "Bob Wilson",
      amountMinor: 10000,
    })

    expect(
      matchPayment(payment, order, ["John Smith", "Bob Wilson", "Alice Brown"])
    ).toBe(true)
  })

  it("does not match attendees when booker already matches", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "Jane Doe",
      amountMinor: 10000,
    })

    // Booker matches - should match regardless of attendees
    expect(matchPayment(payment, order, ["Someone Else"])).toBe(true)
  })

  it("handles case-insensitive attendee matching", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "john smith",
      amountMinor: 10000,
    })

    expect(matchPayment(payment, order, ["JOHN SMITH"])).toBe(true)
  })

  it("returns false when neither booker nor attendees match", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "Unknown Person",
      amountMinor: 10000,
    })

    expect(matchPayment(payment, order, ["John Smith", "Bob Wilson"])).toBe(
      false
    )
  })

  it("returns false with empty attendee list and non-matching booker", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "Unknown Person",
      amountMinor: 10000,
    })

    expect(matchPayment(payment, order, [])).toBe(false)
  })
})

describe("payment matching - amount requirements", () => {
  it("booker match does not require amount check (matched by name alone)", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })
    const payment = makePayment({
      payerName: "Jane Doe",
      amountMinor: 5000,
    })

    // Booker name match: amount not checked in current logic
    expect(matchPayment(payment, order, [])).toBe(true)
  })

  it("attendee fallback requires exact amount match", () => {
    const order = makeOrder({
      buyerName: "Jane Doe",
      totalAmountMinor: 10000,
    })

    // Same amount - should match
    expect(
      matchPayment(
        makePayment({ payerName: "John Smith", amountMinor: 10000 }),
        order,
        ["John Smith"]
      )
    ).toBe(true)

    // Different amount - should NOT match
    expect(
      matchPayment(
        makePayment({ payerName: "John Smith", amountMinor: 9999 }),
        order,
        ["John Smith"]
      )
    ).toBe(false)
  })
})
