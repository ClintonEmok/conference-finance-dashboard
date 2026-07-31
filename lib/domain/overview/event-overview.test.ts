import { describe, expect, it } from "vitest"

import {
  createEventOverviewScope,
  projectEventOverview,
  type OverviewInputs,
} from "./event-overview"

const event = {
  id: "event-1",
  slug: "spring-conference",
  title: "Spring Conference",
  startsAt: Date.parse("2026-07-01T09:00:00.000Z"),
  accommodationEnabled: true,
}

function domain<T>(data: T) {
  return { status: "ready" as const, data }
}

function input(overrides: Partial<OverviewInputs> = {}): OverviewInputs {
  const scope = createEventOverviewScope(event, new Date("2026-07-30T12:00:00.000Z"))
  return {
    event,
    scope,
    revenue: domain({
      totals: { orderValueMinor: 12345, paidMinor: 9000, refundedMinor: 100, netMinor: 8900, standaloneDonationMinor: 400 },
      statusCounts: { paid: 2, refunded: 0, cancelled: 0, pending: 1 },
    }),
    orders: domain({ page: { totalRows: 3 }, totals: { amountDueMinor: 12345, matchedAmountMinor: 9000, outstandingAmountMinor: 3345 } }),
    attendees: domain({ page: { totalRows: 5 } }),
    reconciliation: domain({ totals: { rows: 1, outstandingMinor: 3345 } }),
    accommodation: domain({ summary: { hotelsLinked: 1, totalSlots: 10, assignableSlots: 8, submissionsCount: 2, unassignedAttendeesCount: 0 } }),
    ...overrides,
  }
}

describe("event overview projection", () => {
  it("keeps the selected event and explicit event-start scope", () => {
    const result = projectEventOverview(input())
    expect(result.scope).toMatchObject({ eventId: "event-1", eventSlug: "spring-conference" })
    expect(result.scope?.from).toBe("2026-07-01T09:00:00.000Z")
    expect(result.metrics.every((metric) => metric.href.includes("/spring-conference/"))).toBe(true)
  })

  it("preserves canonical money values without presentation arithmetic", () => {
    const result = projectEventOverview(input())
    expect(result.metrics.find((metric) => metric.key === "money")?.values).toEqual({
      orderValueMinor: 12345,
      paidMinor: 9000,
      outstandingMinor: 3345,
    })
  })

  it("preserves a confirmed canonical outstanding zero", () => {
    const result = projectEventOverview(input({
      reconciliation: domain({ totals: { rows: 0, outstandingMinor: 0 } }),
    }))
    const money = result.metrics.find((metric) => metric.key === "money")
    expect(money?.state).toEqual({ status: "ready" })
    expect(money?.values?.outstandingMinor).toBe(0)
  })

  it("keeps money unavailable when a ready domain has no payload", () => {
    const result = projectEventOverview(input({
      reconciliation: { status: "ready" },
    }))
    const money = result.metrics.find((metric) => metric.key === "money")
    expect(money?.state).toEqual({ status: "unavailable", message: "Reconciliation totals are unavailable." })
    expect(money?.values).toBeNull()
  })

  it.each([
    ["loading", { status: "loading" as const }],
    ["error", { status: "error" as const, message: "Reconciliation failed." }],
    ["unavailable", { status: "unavailable" as const, message: "No reconciliation response." }],
    ["empty", { status: "empty" as const }],
  ])("does not fabricate outstanding money while reconciliation is %s", (_label, reconciliation) => {
    const result = projectEventOverview(input({ reconciliation }))
    const money = result.metrics.find((metric) => metric.key === "money")
    expect(money?.values).toBeNull()
    expect(money?.state).toEqual(reconciliation)
  })

  it("maps supported exceptions to one slug-scoped destination each", () => {
    const result = projectEventOverview(input())
    expect(result.exceptions.map((exception) => [exception.key, exception.href])).toEqual([
      ["reconciliation", "/dashboard/events/spring-conference/reconciliation"],
      ["pending-orders", "/dashboard/events/spring-conference/orders"],
    ])
  })

  it("distinguishes accommodation setup, allocation, and no issue states", () => {
    const setup = projectEventOverview(input({ accommodation: domain({ summary: { hotelsLinked: 0, totalSlots: 0, assignableSlots: 0, submissionsCount: 0, unassignedAttendeesCount: 0 } }) }))
    expect(setup.exceptions[0]?.key).toBe("reconciliation")
    expect(setup.exceptions.at(-1)).toMatchObject({ key: "accommodation-setup", href: "/dashboard/events/spring-conference/settings" })

    const allocation = projectEventOverview(input({ accommodation: domain({ summary: { hotelsLinked: 1, totalSlots: 10, assignableSlots: 8, submissionsCount: 2, unassignedAttendeesCount: 2 } }) }))
    expect(allocation.exceptions.at(-1)).toMatchObject({ key: "unassigned-attendees", href: "/dashboard/events/spring-conference/accommodation/allocation" })

    const clear = projectEventOverview(input({ revenue: domain({ totals: { orderValueMinor: 12345, paidMinor: 9000, refundedMinor: 100, netMinor: 8900, standaloneDonationMinor: 400 }, statusCounts: { paid: 2, refunded: 0, cancelled: 0, pending: 0 } }), reconciliation: domain({ totals: { rows: 0, outstandingMinor: 0 } }) }))
    expect(clear.exceptions).toEqual([])
  })

  it("keeps empty, disabled, and unresolved states honest", () => {
    const empty = projectEventOverview(input({
      revenue: { status: "empty" },
      orders: { status: "empty" },
      attendees: { status: "empty" },
      reconciliation: { status: "empty" },
      accommodation: { status: "empty" },
    }))
    expect(empty.metrics.find((metric) => metric.key === "orders")?.values).toBeNull()
    expect(empty.metrics.find((metric) => metric.key === "orders")?.state.status).toBe("empty")

    const disabled = projectEventOverview(input({ event: { ...event, accommodationEnabled: false } }))
    expect(disabled.metrics.find((metric) => metric.key === "accommodation")?.state.status).toBe("disabled")
    expect(disabled.exceptions.at(-1)).toMatchObject({ key: "accommodation-disabled", href: "/dashboard/events/spring-conference/settings" })

    expect(createEventOverviewScope({ ...event, startsAt: null }, new Date())).toBeNull()
  })

  it("keeps accommodation loading and failures distinct from setup", () => {
    const loading = projectEventOverview(input({ accommodation: { status: "loading" } }))
    expect(loading.metrics.find((metric) => metric.key === "accommodation")?.state.status).toBe("loading")
    expect(loading.exceptions.some((exception) => exception.key === "accommodation-setup")).toBe(false)

    const failed = projectEventOverview(input({ accommodation: { status: "error", message: "Accommodation query failed." } }))
    expect(failed.metrics.find((metric) => metric.key === "accommodation")?.state).toEqual({ status: "error", message: "Accommodation query failed." })
    expect(failed.exceptions.some((exception) => exception.key === "accommodation-setup")).toBe(false)
  })
})
