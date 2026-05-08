import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
  convexQuery: vi.fn(),
}))

import { resolveBackfillTotalAmountMinor } from "@/convex/sync/orders"
import {
  assignPaymentToOrder,
  createBankTransferPayment,
} from "@/lib/domain/finance/payments"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"

describe("internal orders canonicalization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolves missing canonical totals from legacy provider payload", () => {
    const amount = resolveBackfillTotalAmountMinor({
      currentTotalAmountMinor: undefined,
      rawPayload: { total: "12.34" },
    })

    expect(amount).toBe(1234)
  })

  it("does not backfill totals when canonical amount already exists", () => {
    const amount = resolveBackfillTotalAmountMinor({
      currentTotalAmountMinor: 5000,
      rawPayload: { total: "12.34" },
    })

    expect(amount).toBeNull()
  })

  it("writes payments using canonical order ids from provider order inputs", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: "jt7canonicalorder" })
      .mockResolvedValueOnce({
        _id: "payment_1",
        source: "bank_transfer",
        payerName: "Alice",
        amountMinor: 1200,
        paidAt: Date.parse("2026-03-30T10:00:00.000Z"),
        orderId: "jt7canonicalorder",
      })

    vi.mocked(convexMutation).mockResolvedValueOnce("payment_1")

    await createBankTransferPayment(
      {
        orderId: "ORD-123",
        amountMinor: 1200,
        paidAt: "2026-03-30T10:00:00.000Z",
        payerName: "Alice",
      },
      "user_1"
    )

    expect(convexQuery).toHaveBeenNthCalledWith(
      1,
      api.orders.getOrderById,
      {
        orderId: "ORD-123",
      }
    )
    expect(convexQuery).toHaveBeenNthCalledWith(
      2,
      api.orders.getOrderByProviderId,
      {
        providerOrderId: "ORD-123",
      }
    )
    expect(convexMutation).toHaveBeenCalledWith(api.payments.createPayment, {
      source: "bank_transfer",
      orderId: "jt7canonicalorder",
      amountMinor: 1200,
      paidAt: Date.parse("2026-03-30T10:00:00.000Z"),
      payerName: "Alice",
      payerAccountNumber: undefined,
      reference: undefined,
      notes: undefined,
      matchedBy: "user_1",
    })
  })

  it("falls back to canonical order id lookup by order id and stores that id", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: "jt7canonicalfromlegacy" })
      .mockResolvedValueOnce({
        _id: "payment_2",
        source: "cash",
        payerName: "Bob",
        amountMinor: 900,
        paidAt: Date.parse("2026-03-31T10:00:00.000Z"),
        orderId: "jt7canonicalfromlegacy",
      })

    vi.mocked(convexMutation).mockResolvedValueOnce("payment_2")

    await assignPaymentToOrder(
      "payment_2",
      { orderId: "jt7legacyorder" },
      "user_2"
    )

    expect(convexQuery).toHaveBeenNthCalledWith(
      1,
      api.orders.getOrderById,
      {
        orderId: "jt7legacyorder",
      }
    )
    expect(convexQuery).toHaveBeenNthCalledWith(2, api.orders.getOrderByProviderId, {
      providerOrderId: "jt7legacyorder",
    })
    expect(convexMutation).toHaveBeenCalledWith(
      api.payments.assignPaymentToOrder,
      {
        paymentId: "payment_2",
        orderId: "jt7canonicalfromlegacy",
        status: "manual_assignment",
        matchedBy: "user_2",
      }
    )
  })
})
