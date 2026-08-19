import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchTikkiePaymentsForLink } from "@/convex/autoSync"

describe("Tikkie polling", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the checkpoint window and consumes every API page", async () => {
    const requests: URL[] = []
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input))
      requests.push(url)
      const pageNumber = Number(url.searchParams.get("pageNumber"))

      return {
        ok: true,
        json: async () =>
          pageNumber === 0
            ? {
                payments: [{ paymentToken: "payment-1" }],
                totalElementCount: 2,
              }
            : {
                payments: [{ paymentToken: "payment-2" }],
                totalElementCount: 2,
              },
      } as Response
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchTikkiePaymentsForLink({
      paymentRequestToken: "request-1",
      providerLastCheckedAt: Date.now() - 10 * 60 * 1000,
    })

    expect(result.payments).toHaveLength(2)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.searchParams.get("pageNumber")).toBe("0")
    expect(requests[1]?.searchParams.get("pageNumber")).toBe("1")
    expect(requests[0]?.searchParams.get("pageSize")).toBe("50")
    expect(requests[0]?.searchParams.get("fromDateTime")).toBeTruthy()
    expect(requests[0]?.searchParams.get("toDateTime")).toBeTruthy()
  })

  it("does a full paginated read when no checkpoint exists", async () => {
    const requests: URL[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input))
        requests.push(url)
        return {
          ok: true,
          json: async () => ({
            payments: [{ paymentToken: "payment-1" }],
            totalElementCount: 1,
          }),
        } as Response
      })
    )

    const result = await fetchTikkiePaymentsForLink({
      paymentRequestToken: "request-2",
    })

    expect(result.payments).toHaveLength(1)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.searchParams.has("fromDateTime")).toBe(false)
  })
})
