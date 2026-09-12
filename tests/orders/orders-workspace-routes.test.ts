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
  })

  it("separates Orders from Finance section-active matching", () => {
    const layout = readSource("app/dashboard/events/[slug]/layout.tsx")
    expect(layout).toContain('label === "Orders"')
    expect(layout).toContain("pathname.startsWith(`${eventRoot}/orders/`)")
    // Finance matches only its own workspace plus the legacy payment paths.
    const financeBranch = layout.match(
      /label === "Finance"[\s\S]*?reconciliation"\]/
    )
    expect(financeBranch).not.toBeNull()
    expect(financeBranch![0]).not.toContain('"orders"')
  })
})
