import { describe, expect, it } from "vitest"
import {
  accommodationHref,
  defaultAccommodationTab,
  defaultFinanceTab,
  financeHref,
  parseAccommodationTab,
  parseFinanceTab,
  readWorkspaceIntent,
} from "./workspace-routes"

describe("workspace route contracts", () => {
  it("normalizes missing and invalid tabs", () => {
    expect(parseFinanceTab()).toBe(defaultFinanceTab)
    expect(parseFinanceTab("?tab=unknown")).toBe(defaultFinanceTab)
    expect(parseAccommodationTab("tab=allocation")).toBe("allocation")
    expect(parseAccommodationTab("tab=nope")).toBe(defaultAccommodationTab)
  })

  it("preserves the slug and encoded intent", () => {
    expect(financeHref("spring retreat", "reconciliation")).toBe(
      "/dashboard/events/spring%20retreat/finance?tab=reconciliation"
    )
    expect(financeHref("event/one", "orders", { orderId: "order/42" })).toBe(
      "/dashboard/events/event%2Fone/finance?tab=orders&orderId=order%2F42"
    )
    expect(accommodationHref("event", "allocation", { roomId: "room/7" })).toContain(
      "roomId=room%2F7"
    )
    expect(readWorkspaceIntent("orderId=o1&roomId=r1")).toEqual({ orderId: "o1", roomId: "r1" })
  })
})
