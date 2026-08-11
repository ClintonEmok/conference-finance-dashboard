import { describe, expect, it } from "vitest"
import {
  accommodationHref,
  defaultAccommodationTab,
  defaultFinanceTab,
  defaultOrdersTab,
  financeHref,
  financeTabs,
  legacyAccommodationHref,
  legacyFinanceHref,
  ordersHref,
  parseAccommodationTab,
  parseFinanceTab,
  parseOrdersIntent,
  parseOrdersTab,
  readWorkspaceIntent,
} from "./workspace-routes"

describe("workspace route contracts", () => {
  it("normalizes missing and invalid tabs", () => {
    expect(parseFinanceTab()).toBe(defaultFinanceTab)
    expect(parseFinanceTab("?tab=unknown")).toBe(defaultFinanceTab)
    expect(parseAccommodationTab("tab=allocation")).toBe("allocation")
    expect(parseAccommodationTab("tab=nope")).toBe(defaultAccommodationTab)
  })

  it("no longer treats Orders as a Finance tab", () => {
    expect(financeTabs).toEqual(["payments", "donations", "reconciliation"])
    expect(financeTabs).not.toContain("orders")
    expect(defaultFinanceTab).toBe("payments")
    expect(parseFinanceTab("?tab=orders")).toBe(defaultFinanceTab)
    expect(parseFinanceTab("?tab=payments")).toBe("payments")
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

  it("builds the canonical event Orders URLs with an encoded order intent and no Finance tab", () => {
    expect(ordersHref("event")).toBe("/dashboard/events/event/orders")
    expect(ordersHref("spring retreat")).toBe(
      "/dashboard/events/spring%20retreat/orders"
    )
    expect(ordersHref("event/one", { orderId: "order/42" })).toBe(
      "/dashboard/events/event%2Fone/orders?orderId=order%2F42"
    )
    expect(ordersHref("event", { orderId: "order_1" })).toBe(
      "/dashboard/events/event/orders?orderId=order_1"
    )
  })

  it("parses the Orders tab and order intent", () => {
    expect(parseOrdersTab()).toBe(defaultOrdersTab)
    expect(parseOrdersTab("?tab=orders")).toBe("orders")
    expect(parseOrdersTab("?tab=payments")).toBe(defaultOrdersTab)
    expect(parseOrdersIntent("orderId=o1&roomId=r1")).toEqual({
      orderId: "o1",
    })
    expect(parseOrdersIntent("?tab=orders")).toEqual({ orderId: undefined })
  })

  it("preserves the slug and encoded intent", () => {
    expect(financeHref("spring retreat", "reconciliation")).toBe(
      "/dashboard/events/spring%20retreat/finance?tab=reconciliation"
    )
    expect(financeHref("event/one", "payments", { orderId: "order/42" })).toBe(
      "/dashboard/events/event%2Fone/finance?tab=payments&orderId=order%2F42"
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
