import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { listStandaloneDonations } from "@/lib/domain/finance/standalone-donations"

describe("listStandaloneDonations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes event and date bounds and follows pagination", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce({
        page: [
          {
            _id: "donation_1",
            _creationTime: 1,
            source: "cash" as const,
            payerName: "Supporter",
            amountMinor: 500,
            paidAt: 1774000000000,
            eventId: "event-1" as Id<"events">,
          },
        ],
        isDone: false,
        continueCursor: "next",
      } as never)
      .mockResolvedValueOnce({
        page: [],
        isDone: true,
        continueCursor: "",
      } as never)

    const result = await listStandaloneDonations({
      eventId: "event-1" as Id<"events">,
      from: 1773000000000,
      to: 1775000000000,
    })

    expect(result).toHaveLength(1)
    expect(convexQuery).toHaveBeenNthCalledWith(
      1,
      api.payments.getStandaloneDonations,
      {
        eventId: "event-1",
        from: 1773000000000,
        to: 1775000000000,
        paginationOpts: { numItems: 100, cursor: null },
      }
    )
    expect(convexQuery).toHaveBeenNthCalledWith(
      2,
      api.payments.getStandaloneDonations,
      {
        eventId: "event-1",
        from: 1773000000000,
        to: 1775000000000,
        paginationOpts: { numItems: 100, cursor: "next" },
      }
    )
  })
})
