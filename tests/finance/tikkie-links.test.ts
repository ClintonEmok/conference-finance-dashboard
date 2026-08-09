import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
  convexQuery: vi.fn(),
}))

vi.mock("@/lib/integrations/tikkie/client", () => ({
  createPaymentRequest: vi.fn(),
  getPaymentRequest: vi.fn(),
  getPaymentRequestPayments: vi.fn(),
}))

import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"
import { createPaymentRequest } from "@/lib/integrations/tikkie/client"
import {
  createTikkiePaymentLink,
  listTikkiePaymentLinksByOrder,
} from "@/lib/domain/finance/tikkie-links"

function baseLink(overrides: Partial<Parameters<typeof listTikkiePaymentLinksByOrder>[0]> = {}) {
  return {
    providerOrderId: "ORD-1",
    providerEventId: "event_1",
    amountMinor: 1200,
    description: "Order ORD-1",
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    referenceId: null,
    ...overrides,
  }
}

describe("tikkie-links domain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("prefers canonical order ids when listing links", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce({
        _id: "order_1",
        providerOrderId: "ORD-1",
      })
      .mockResolvedValueOnce([
        {
          _id: "link_1",
          providerOrderId: "ORD-1",
          providerEventId: "event_1",
          orderId: "order_1",
          paymentRequestToken: "token_1",
          paymentRequestUrl: "https://example.com/link",
          status: "created",
          statusSource: "create",
          providerStatus: "OPEN",
          amountMinor: 1200,
          description: "Order ORD-1",
          expiryDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          referenceId: null,
          providerPayload: null,
          providerLastCheckedAt: null,
          statusUpdatedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ])

    const result = await listTikkiePaymentLinksByOrder({
      orderId: "order_1",
      providerOrderId: "ORD-IGNORED",
    })

    expect(result.orderId).toBe("order_1")
    expect(result.providerOrderId).toBe("ORD-1")
    expect(result.count).toBe(1)
    expect(convexQuery).toHaveBeenNthCalledWith(1, api.orders.getOrderById, {
      orderId: "order_1",
    })
    expect(convexQuery).toHaveBeenNthCalledWith(2, api.tikkie.getPaymentLinks, {
      orderId: "order_1",
    })
    expect(
      vi
        .mocked(convexQuery)
        .mock.calls.some((call) => call[0] === api.orders.getOrderByProviderId)
    ).toBe(false)
  })

  it("falls back to provider order ids when no canonical order id is given", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          _id: "order_legacy",
          providerOrderId: "ORD-LEGACY",
        },
      ])
      .mockResolvedValueOnce([])

    const result = await listTikkiePaymentLinksByOrder({
      providerOrderId: "ORD-LEGACY",
    })

    expect(result.orderId).toBe("order_legacy")
    expect(result.providerOrderId).toBe("ORD-LEGACY")
    expect(result.count).toBe(0)
    expect(convexQuery).toHaveBeenNthCalledWith(1, api.orders.getOrderByProviderId, {
      providerOrderId: "ORD-LEGACY",
    })
    expect(convexQuery).toHaveBeenNthCalledWith(2, api.tikkie.getPaymentLinks, {
      orderId: "order_legacy",
    })
  })

  it("creates links from canonical order ids when available", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce({
        _id: "order_1",
        providerOrderId: "ORD-1",
        providerEventId: "event_1",
      })
      .mockResolvedValueOnce([])

    vi.mocked(createPaymentRequest).mockResolvedValue({
      status: "OPEN",
      paymentRequestToken: "token_1",
      url: "https://example.com/link",
    } as never)

    vi.mocked(convexMutation).mockResolvedValue("link_1")

    const result = await createTikkiePaymentLink({
      orderId: "order_1",
      providerOrderId: "ORD-IGNORED",
      providerEventId: "event_1",
      amountMinor: 1200,
      description: "Order ORD-1",
      expiryDate: baseLink().expiryDate,
      referenceId: null,
    })

    expect(result.created).toBe(true)
    expect(convexQuery).toHaveBeenNthCalledWith(1, api.orders.getOrderById, {
      orderId: "order_1",
    })
    // The provider request must use the flexible zero amount, never the
    // client-supplied or canonical total.
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ amountInCents: 0 })
    )
    expect(convexMutation).toHaveBeenCalledWith(api.tikkie.createPaymentLink, {
      providerOrderId: "ORD-1",
      providerEventId: "event_1",
      orderId: "order_1",
      paymentRequestToken: "token_1",
      paymentRequestUrl: "https://example.com/link",
      providerStatus: "OPEN",
      amountMinor: 0,
      description: "Order ORD-1",
      expiryDate: expect.any(Number),
      referenceId: undefined,
      providerPayload: expect.objectContaining({
        status: "OPEN",
        paymentRequestToken: "token_1",
      }),
    })
    // The returned link retains the flexible zero amount.
    expect(result.link.amountMinor).toBe(0)
  })

  it("accepts amountMinor 0 and keeps 0 on the provider request, mutation and returned link", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce({
        _id: "order_1",
        providerOrderId: "ORD-1",
        providerEventId: "event_1",
      })
      .mockResolvedValueOnce([])

    vi.mocked(createPaymentRequest).mockResolvedValue({
      status: "OPEN",
      paymentRequestToken: "token_1",
      url: "https://example.com/link",
    } as never)

    vi.mocked(convexMutation).mockResolvedValue("link_1")

    const result = await createTikkiePaymentLink({
      orderId: "order_1",
      providerOrderId: "ORD-1",
      providerEventId: "event_1",
      amountMinor: 0,
      description: "Order ORD-1",
      expiryDate: baseLink().expiryDate,
      referenceId: null,
    })

    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ amountInCents: 0 })
    )
    expect(convexMutation).toHaveBeenCalledWith(
      api.tikkie.createPaymentLink,
      expect.objectContaining({ amountMinor: 0 })
    )
    expect(result.link.amountMinor).toBe(0)
    expect(result.created).toBe(true)
  })

  it("never lets the client-supplied total determine the created link amount", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce({
        _id: "order_1",
        providerOrderId: "ORD-1",
        providerEventId: "event_1",
      })
      .mockResolvedValueOnce([])

    vi.mocked(createPaymentRequest).mockResolvedValue({
      status: "OPEN",
      paymentRequestToken: "token_1",
      url: "https://example.com/link",
    } as never)

    vi.mocked(convexMutation).mockResolvedValue("link_1")

    // A large client-supplied amount is validated as a non-negative integer
    // but the flexible zero is what reaches the provider and the mutation.
    await createTikkiePaymentLink({
      orderId: "order_1",
      providerOrderId: "ORD-1",
      providerEventId: "event_1",
      amountMinor: 999999,
      description: "Order ORD-1",
      expiryDate: baseLink().expiryDate,
      referenceId: null,
    })

    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ amountInCents: 0 })
    )
    expect(convexMutation).toHaveBeenCalledWith(
      api.tikkie.createPaymentLink,
      expect.objectContaining({ amountMinor: 0 })
    )
  })

  it("rejects negative amounts even though zero is the flexible link amount", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce({
      _id: "order_1",
      providerOrderId: "ORD-1",
      providerEventId: "event_1",
    })

    await expect(
      createTikkiePaymentLink({
        orderId: "order_1",
        providerOrderId: "ORD-1",
        providerEventId: "event_1",
        amountMinor: -100,
        description: "Order ORD-1",
        expiryDate: baseLink().expiryDate,
        referenceId: null,
      })
    ).rejects.toThrow(/non-negative integer/)
    expect(createPaymentRequest).not.toHaveBeenCalled()
  })
})
