import { describe, expect, it, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import LegacyOrderDetailPage from "@/app/dashboard/events/[slug]/orders/[orderId]/page"

/**
 * Route-level regression coverage for the standalone event-scoped Orders
 * workspace (quick task 260811-28n). The canonical surface lives at
 * `/dashboard/events/{slug}/orders`: the list workspace is rendered directly
 * and `?orderId=` selects the detail surface through the query intent. The
 * event `[orderId]` route lands there with order intent preserved. Finance
 * exposes only Payments/Donations/Reconciliation, and root-level event
 * surfaces are disabled in favor of event-scoped routes.
 *
 * Next's `redirect` boundary is mocked so no Next server is required: the
 * server pages are invoked directly with promise-shaped params/searchParams
 * exactly as the App Router would provide them. Client bridge components are
 * asserted at source level (they resolve events through Convex hooks).
 */

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("canonical event Orders workspace routes", () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it("renders the standalone Orders workspace from the canonical list route", () => {
    const page = readSource("app/dashboard/events/[slug]/orders/page.tsx")
    expect(page).toContain('"use client"')
    expect(page).toContain("<OrdersWorkspace")
    expect(page).not.toContain("financeHref")
    expect(page).not.toContain("redirect(")
  })

  it("the Orders workspace selects list versus detail from the order intent", () => {
    const workspace = readSource(
      "components/dashboard/orders/orders-workspace.tsx"
    )
    expect(workspace).toContain("OrdersWorkspace")
    expect(workspace).toContain("parseOrdersIntent")
    expect(workspace).toContain("<OrdersSurface")
    expect(workspace).toContain("<OrderDetailSurface")
    expect(workspace).toContain("ordersHref(slug)")
  })

  it("the relocated list/detail surfaces keep their export names and canonical links", () => {
    const list = readSource("components/dashboard/orders/orders-surface.tsx")
    expect(list).toContain("export function OrdersSurface")
    expect(list).toContain("/dashboard/events/${slug}/orders")
    expect(list).toContain("/api/dashboard/orders")

    const detail = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(detail).toContain("export function OrderDetailSurface")
    expect(detail).toContain("/dashboard/events/${slug}/orders")
    expect(detail).toContain("/api/dashboard/orders/")
  })

  it("the legacy finance surface paths remain usable as thin wrappers", () => {
    const legacyList = readSource(
      "components/dashboard/finance/legacy-orders-surface.tsx"
    )
    expect(legacyList).toContain("export default OrdersSurface")
    expect(legacyList).toContain('from "../orders/orders-surface"')

    const legacyDetail = readSource(
      "components/dashboard/finance/legacy-order-detail-surface.tsx"
    )
    expect(legacyDetail).toContain("export default OrderDetailSurface")
    expect(legacyDetail).toContain('from "../orders/order-detail-surface"')
  })

  it("redirects the event detail deep link to the canonical query intent", async () => {
    await LegacyOrderDetailPage({
      params: Promise.resolve({ slug: "retreat", orderId: "order_42" }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/dashboard/events/retreat/orders?orderId=order_42"
    )
  })

  it("encodes the event slug and order id in the compatibility redirect", async () => {
    await LegacyOrderDetailPage({
      params: Promise.resolve({ slug: "spring retreat", orderId: "order/7" }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/dashboard/events/spring%20retreat/orders?orderId=order%2F7"
    )
  })
})

describe("root-level event routes", () => {
  it("disables root-level Orders and Manage Orders pages", () => {
    expect(readSource("app/dashboard/orders/page.tsx")).toContain("notFound()")
    expect(readSource("app/dashboard/orders/[orderId]/page.tsx")).toContain("notFound()")
    expect(readSource("app/dashboard/manage-orders/page.tsx")).toContain("notFound()")
    expect(readSource("app/dashboard/manage-orders/[orderId]/page.tsx")).toContain("notFound()")
  })
})

describe("Finance no longer owns Orders", () => {
  it("removes the Orders tab and FinanceOrdersTab usage from Finance", () => {
    const finance = readSource(
      "components/dashboard/finance/finance-workspace.tsx"
    )
    expect(finance).not.toContain("FinanceOrdersTab")
    expect(finance).not.toContain('value: "orders"')
    expect(finance).not.toContain('financeHref(slug, "orders")')
    expect(finance).toContain("ordersHref(slug)")
    expect(finance).toContain('label: "Payments"')
    expect(finance).toContain('label: "Donations"')
    expect(finance).toContain('label: "Reconciliation"')
  })

  it("deletes the obsolete Finance orders tab file", () => {
    expect(() =>
      readSource("components/dashboard/finance/orders-tab.tsx")
    ).toThrow()
  })
})

describe("sidebar ownership", () => {
  it("adds an Orders sidebar item at the event Orders workspace", () => {
    const layout = readSource("app/dashboard/events/[slug]/layout.tsx")
    expect(layout).toContain('label: "Orders"')
    expect(layout).toContain("ListOrdered")
    expect(layout).toContain("`/dashboard/events/${slug}/orders`")
    expect(layout).toContain('label === "Orders"')
    expect(layout).toContain("pathname.startsWith(`${eventRoot}/orders/`)")
  })

  it("replaces the Finance item with the three dedicated money items (AE-4)", () => {
    const layout = readSource("app/dashboard/events/[slug]/layout.tsx")

    // The Finance section-active special case is gone: with three items that
    // predicate would light all three at once.
    expect(layout).not.toContain('label === "Finance"')
    expect(layout).not.toContain('["finance", "payments", "donation", "reconciliation"]')
    expect(layout).not.toContain('label: "Finance"')

    for (const token of [
      'label: "Payments"',
      'label: "Donations"',
      'label: "Reconciliation"',
      "icon: Wallet",
      "icon: HandCoins",
      "icon: Scale",
    ])
      expect(layout, token).toContain(token)

    for (const token of [
      "paymentsHref(slug)",
      "donationsHref(slug)",
      "reconciliationHref(slug)",
    ])
      expect(layout, token).toContain(token)

    // CreditCard is freed, not reused — a fourth card glyph would make the
    // three money items indistinguishable in the collapsed rail.
    expect(layout).not.toContain("CreditCard")

    // The generic final branch resolves each label to its own path.
    expect(layout).toContain("label.toLowerCase()")
  })

  it("orders the three money items between Tickets and Orders, each with its own href", () => {
    const layout = readSource("app/dashboard/events/[slug]/layout.tsx")
    const ordered = [
      'label: "Tickets"',
      'label: "Payments"',
      "icon: Wallet",
      "paymentsHref(slug)",
      'label: "Donations"',
      "icon: HandCoins",
      "donationsHref(slug)",
      'label: "Reconciliation"',
      "icon: Scale",
      "reconciliationHref(slug)",
      'label: "Orders"',
    ].map((token) => ({ token, index: layout.indexOf(token) }))

    for (const { token, index } of ordered)
      expect(index, token).toBeGreaterThan(-1)
    for (let i = 1; i < ordered.length; i += 1)
      expect(
        ordered[i].index,
        `${ordered[i].token} after ${ordered[i - 1].token}`
      ).toBeGreaterThan(ordered[i - 1].index)
  })

  it("adds no descriptor, count or badge to the three money items", () => {
    const layout = readSource("app/dashboard/events/[slug]/layout.tsx")
    const start = layout.lastIndexOf("{", layout.indexOf('label: "Payments"'))
    const end = layout.indexOf('label: "Orders"')
    const moneyBlock = layout.slice(start, end)

    // Exactly three item literals, and each carries ONLY label/icon/href — a
    // descriptor line, a count or a badge would fail the literal regexes.
    expect(moneyBlock.match(/label: "/g)).toHaveLength(3)
    expect(moneyBlock.match(/icon: /g)).toHaveLength(3)
    expect(moneyBlock.match(/href: /g)).toHaveLength(3)
    expect(moneyBlock).not.toContain("show:")
    expect(moneyBlock).not.toMatch(/count|badge|descriptor/i)
    expect(moneyBlock).toMatch(
      /\{\s*label: "Payments",\s*icon: Wallet,\s*href: paymentsHref\(slug\),\s*\}/
    )
    expect(moneyBlock).toMatch(
      /\{\s*label: "Donations",\s*icon: HandCoins,\s*href: donationsHref\(slug\),\s*\}/
    )
    expect(moneyBlock).toMatch(
      /\{\s*label: "Reconciliation",\s*icon: Scale,\s*href: reconciliationHref\(slug\),\s*\}/
    )

    // The descriptor block still belongs to Allocation alone.
    expect(layout).toContain('item.label === "Allocation" ?')
  })
})
