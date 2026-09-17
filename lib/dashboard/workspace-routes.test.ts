import { describe, expect, it } from "vitest"
import {
  accommodationHref,
  communicationsHref,
  defaultCommunicationsView,
  defaultAccommodationTab,
  defaultFinanceTab,
  defaultOrdersTab,
  donationsHref,
  financeHref,
  financeTabHref,
  financeTabPaths,
  financeTabs,
  legacyAccommodationHref,
  legacyFinanceHref,
  ordersHref,
  parseAccommodationTab,
  parseCommunicationsView,
  parseFinanceTab,
  parseOrdersIntent,
  parseOrdersTab,
  paymentsHref,
  readWorkspaceIntent,
  reconciliationHref,
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

  it("defaults invalid accommodation intent and encodes event and room identifiers", () => {
    expect(parseAccommodationTab("?tab=invalid")).toBe("hotels")
    expect(accommodationHref("spring retreat", "hotels")).toBe(
      "/dashboard/events/spring%20retreat/accommodation?tab=hotels"
    )
    expect(
      accommodationHref("event/one", "allocation", { roomId: "room/7" })
    ).toBe(
      "/dashboard/events/event%2Fone/accommodation/allocation?roomId=room%2F7"
    )
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
    expect(
      accommodationHref("event", "allocation", { roomId: "room/7" })
    ).toContain("roomId=room%2F7")
    expect(readWorkspaceIntent("orderId=o1&roomId=r1")).toEqual({
      orderId: "o1",
      roomId: "r1",
    })
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
    ).toBe("/dashboard/events/event/accommodation/allocation?roomId=room%2F9")
  })

  it("builds the canonical event Communications URL", () => {
    expect(communicationsHref("event")).toBe(
      "/dashboard/events/event/communications"
    )
    expect(communicationsHref("spring retreat")).toBe(
      "/dashboard/events/spring%20retreat/communications"
    )
  })

  it("keeps communications surfaces addressable as dedicated views", () => {
    expect(parseCommunicationsView()).toBe(defaultCommunicationsView)
    expect(parseCommunicationsView("?view=reminders")).toBe("reminders")
    expect(parseCommunicationsView("?view=templates")).toBe("templates")
    expect(parseCommunicationsView("?view=unknown")).toBe(
      defaultCommunicationsView
    )
    expect(communicationsHref("event", "history")).toBe(
      "/dashboard/events/event/communications?view=history"
    )
  })
})

describe("dedicated payments & donations route contracts (phase 58)", () => {
  it("builds the canonical dedicated hrefs with no intent", () => {
    expect(paymentsHref("event")).toBe("/dashboard/events/event/payments")
    expect(donationsHref("event")).toBe("/dashboard/events/event/donations")
    expect(reconciliationHref("event")).toBe(
      "/dashboard/events/event/reconciliation"
    )
  })

  it("encodes the slug and every defined intent param", () => {
    expect(paymentsHref("spring retreat", { orderId: "order/42" })).toBe(
      "/dashboard/events/spring%20retreat/payments?orderId=order%2F42"
    )
    expect(donationsHref("event", { donationId: "pay_9" })).toBe(
      "/dashboard/events/event/donations?donationId=pay_9"
    )
    expect(reconciliationHref("event/one", { orderId: "order/7" })).toBe(
      "/dashboard/events/event%2Fone/reconciliation?orderId=order%2F7"
    )
    expect(
      donationsHref("event", { attendeeId: "att_1", orderId: "o_1" })
    ).toBe("/dashboard/events/event/donations?attendeeId=att_1&orderId=o_1")
    expect(paymentsHref("event", { orderId: undefined })).toBe(
      "/dashboard/events/event/payments"
    )
  })

  it("never carries a tab param on any canonical money href", () => {
    const hrefs = [
      paymentsHref("event"),
      donationsHref("event"),
      reconciliationHref("event"),
      paymentsHref("event", { orderId: "o_1" }),
      donationsHref("event", { donationId: "d_1" }),
      reconciliationHref("event", { attendeeId: "a_1" }),
    ]
    for (const href of hrefs) expect(href).not.toContain("tab=")
  })

  it("maps every legacy finance tab onto its dedicated href from one table", () => {
    expect(financeTabPaths).toEqual({
      payments: "payments",
      donations: "donations",
      reconciliation: "reconciliation",
    })
    expect(financeTabHref("event", "payments")).toBe(paymentsHref("event"))
    expect(financeTabHref("event", "donations")).toBe(donationsHref("event"))
    expect(financeTabHref("event", "reconciliation")).toBe(
      reconciliationHref("event")
    )
    for (const tab of financeTabs) {
      expect(financeTabHref("event", tab)).not.toContain("tab=")
    }
  })

  it("keeps the legacy finance href building the ?tab= URL", () => {
    expect(financeHref("event", "donations")).toBe(
      "/dashboard/events/event/finance?tab=donations"
    )
  })
})
