import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import {
  buildDonationClassification,
  deriveBalanceAmounts,
  isOrderAppliedPayment,
} from "@/lib/domain/finance/amounts"
import { buildMatchedTotalsByOrderId } from "@/lib/domain/finance/matched-payments"

describe("donation accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("preserves linked donation provenance and keeps standalone donations unlinked", () => {
    expect(
      buildDonationClassification({
        orderId: "order_1",
        eventId: "event_1",
      })
    ).toEqual({
      orderId: "order_1",
      eventId: "event_1",
      donationKind: "overpayment",
      status: "donation",
    })

    expect(
      buildDonationClassification({
        eventId: "event_1",
      })
    ).toEqual({
      eventId: "event_1",
      donationKind: "standalone",
      status: "donation",
    })
  })

  it("uses only linked overpayment donations as order-applied payments", () => {
    expect(
      isOrderAppliedPayment({
        orderId: "order_1",
        status: "donation",
        donationKind: "overpayment",
      })
    ).toBe(true)
    expect(
      isOrderAppliedPayment({
        orderId: "order_1",
        status: "donation",
        donationKind: "standalone",
      })
    ).toBe(false)
    expect(
      isOrderAppliedPayment({
        status: "donation",
        donationKind: "overpayment",
      })
    ).toBe(false)
  })

  it("counts linked donation payments at full amount while excluding standalone donations", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce([
      {
        amountMinor: 1300,
        orderId: "order_1",
        status: "donation" as const,
        donationKind: "overpayment" as const,
      },
      {
        amountMinor: 1200,
        orderId: "provider-order-1",
        status: "donation" as const,
        donationKind: "overpayment" as const,
      },
      {
        amountMinor: 900,
        status: "donation" as const,
        donationKind: "standalone" as const,
      },
    ])
    vi.mocked(convexQuery)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: "order_1" })

    const totals = await buildMatchedTotalsByOrderId([
      { orderId: "order_1", providerOrderId: "provider-order-1" },
    ])

    expect(totals.get("order_1")).toBe(2500)
    expect(totals.size).toBe(1)
  })

  it("caps applied order payment and reports only the excess as donation", () => {
    expect(deriveBalanceAmounts(1000, 1300)).toMatchObject({
      amountDueMinor: 1000,
      paidAmountMinor: 1300,
      appliedAmountMinor: 1000,
      outstandingAmountMinor: 0,
      donationAmountMinor: 300,
    })
  })
})
