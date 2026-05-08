import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
  convexQuery: vi.fn(),
}))

import {
  formatPaymentReference,
  PAYMENT_REFERENCE_PREFIX,
} from "@/lib/domain/finance/payments"

describe("payment reference formatting", () => {
  it("returns null for empty legacy values", () => {
    expect(formatPaymentReference(null)).toBeNull()
    expect(formatPaymentReference(undefined)).toBeNull()
    expect(formatPaymentReference("   ")).toBeNull()
  })

  it("adds the shared prefix to raw references", () => {
    expect(formatPaymentReference("order_1")).toBe(
      `${PAYMENT_REFERENCE_PREFIX}order_1`
    )
  })

  it("keeps already-prefixed references stable", () => {
    expect(formatPaymentReference(`${PAYMENT_REFERENCE_PREFIX}order_1`)).toBe(
      `${PAYMENT_REFERENCE_PREFIX}order_1`
    )
  })

  it("truncates references to the Tikkie-safe length", () => {
    const formatted = formatPaymentReference("x".repeat(100))

    expect(formatted).not.toBeNull()
    expect(formatted).toHaveLength(35)
    expect(formatted).toBe(`${PAYMENT_REFERENCE_PREFIX}${"x".repeat(27)}`)
  })
})
