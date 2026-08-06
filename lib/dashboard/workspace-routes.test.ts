import { describe, expect, it } from "vitest"
import {
  accommodationHref,
  defaultAccommodationTab,
  defaultFinanceTab,
  financeHref,
  legacyAccommodationHref,
  legacyFinanceHref,
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

  it("parses the three accommodation tabs including Upgrades & Options", () => {
    expect(parseAccommodationTab("tab=hotels")).toBe("hotels")
    expect(parseAccommodationTab("tab=allocation")).toBe("allocation")
    expect(parseAccommodationTab("tab=upgrades-options")).toBe(
      "upgrades-options"
    )
    expect(accommodationHref("event", "upgrades-options")).toBe(
      "/dashboard/events/event/accommodation?tab=upgrades-options"
    )
    expect(accommodationHref("event")).toContain("tab=hotels")
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

  it("legacy redirect helpers keep the tab and intent so old deep links survive", () => {
    expect(legacyFinanceHref("event", "donations")).toBe(
      "/dashboard/events/event/finance?tab=donations"
    )
    // The v4.0 accommodation legacy link must keep resolving to the Phase 41
    // Upgrades & Options tab.
    expect(legacyAccommodationHref("event", "upgrades-options")).toBe(
      "/dashboard/events/event/accommodation?tab=upgrades-options"
    )
    expect(
      legacyAccommodationHref("event", "allocation", { roomId: "room/9" })
    ).toBe(
      "/dashboard/events/event/accommodation?tab=allocation&roomId=room%2F9"
    )
  })
})
