import { describe, expect, it } from "vitest"

import { buildReconciliationFollowUpHref } from "@/lib/domain/finance/reconciliation-follow-up"

describe("buildReconciliationFollowUpHref", () => {
  it("builds attendee detail href first when attendee id is available", () => {
    const href = buildReconciliationFollowUpHref({
      attendeeId: " attendee-1 ",
      providerOrderId: " order-123 ",
      providerEventId: " event-9 ",
    })

    const url = new URL(href, "https://example.com")

    expect(url.pathname).toBe("/dashboard/attendees/attendee-1")
    expect(url.searchParams.get("source")).toBe("reconciliation")
    expect(url.searchParams.get("orderId")).toBe("order-123")
    expect(url.searchParams.get("eventId")).toBe("event-9")
    expect(url.searchParams.get("search")).toBe("order-123")
  })

  it("falls back to the attendee list filter href when attendee id is missing", () => {
    const href = buildReconciliationFollowUpHref({
      attendeeId: "   ",
      providerOrderId: "order-123",
      providerEventId: "event-9",
    })

    const url = new URL(href, "https://example.com")

    expect(url.pathname).toBe("/dashboard/attendees")
    expect(url.searchParams.get("search")).toBe("order-123")
    expect(url.searchParams.get("eventId")).toBe("event-9")
    expect(url.searchParams.get("source")).toBe("reconciliation")
    expect(url.searchParams.get("orderId")).toBe("order-123")
  })
})
