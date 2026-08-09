import { describe, expect, it } from "vitest"

import {
  getDashboardQueryData,
  getDashboardQueryStateMetadata,
  isReadyDashboardQueryState,
  type DashboardQueryState,
  type DashboardQueryStatus,
} from "@/lib/dashboard/query-state"

describe("dashboard query state", () => {
  const statuses: DashboardQueryStatus[] = [
    "loading",
    "error",
    "empty",
    "unavailable",
    "disabled",
    "unconfigured",
    "ready",
  ]

  it("provides distinct safe metadata for every presentation state", () => {
    const messages = statuses.map((status) =>
      getDashboardQueryStateMetadata(status).message
    )

    expect(new Set(messages).size).toBe(statuses.length)
    expect(getDashboardQueryStateMetadata("error").message).toContain("Try again")
    expect(getDashboardQueryStateMetadata("unavailable").message).toContain(
      "unavailable"
    )
    expect(getDashboardQueryStateMetadata("disabled").message).toContain(
      "disabled"
    )
    expect(getDashboardQueryStateMetadata("unconfigured").message).toContain(
      "setup"
    )
  })

  it("keeps domain-specific messages while retaining the state", () => {
    expect(
      getDashboardQueryStateMetadata(
        "unavailable",
        "Choose an event date before loading money totals."
      )
    ).toMatchObject({
      status: "unavailable",
      message: "Choose an event date before loading money totals.",
    })
  })

  it("never exposes loading, errors, or unavailable data as ready content", () => {
    const unresolvedStates: DashboardQueryState<number>[] = [
      { status: "loading" },
      { status: "error", message: "request failed" },
      { status: "empty" },
      { status: "unavailable" },
      { status: "disabled" },
      { status: "unconfigured" },
    ]

    for (const state of unresolvedStates) {
      expect(isReadyDashboardQueryState(state)).toBe(false)
      expect(getDashboardQueryData(state)).toBeUndefined()
    }
  })

  it("only returns content when ready data is explicitly supplied", () => {
    const ready: DashboardQueryState<{ count: number }> = {
      status: "ready",
      data: { count: 0 },
    }

    expect(isReadyDashboardQueryState(ready)).toBe(true)
    expect(getDashboardQueryData(ready)).toEqual({ count: 0 })
  })
})
