import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("OrderDetailSurface panel decomposition", () => {
  it("keeps the public OrderDetailSurface export and its props contract", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).toContain("export function OrderDetailSurface")
    expect(surface).toMatch(/slug: string/)
    expect(surface).toMatch(/orderId: string/)
    expect(surface).toMatch(/event: EventDashboardEvent/)
  })

  it("keeps the ?orderId= workspace intent in OrdersWorkspace", () => {
    const workspace = readSource(
      "components/dashboard/orders/orders-workspace.tsx"
    )
    expect(workspace).toContain("parseOrdersIntent")
    expect(workspace).toContain("<OrderDetailSurface")
    expect(workspace).toContain("<OrdersSurface")
    expect(workspace).toContain("ordersHref(slug)")
  })

  it("decomposes the surface into the named panels", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).toContain("<OrderSummaryPanel")
    expect(surface).toContain("<OrderActionsPanel")
    expect(surface).toContain("<OrderDetailsPanel")
    expect(surface).toContain("<AttendeesPanel")
    expect(surface).toContain("<PaymentsPanel")
    expect(surface).toContain("<MergeOrderDialog")
  })

  it("removes the hydration-gated inline attendee table and its gate", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).not.toContain("areAttendeeDetailsHydrated")
    expect(surface).not.toContain("attendeeEditDrafts")
    expect(surface).not.toContain("attendeeDetailSnapshots")
    expect(surface).not.toContain("saveAttendeeDetails")
  })

  it("keeps the order editing, resend, delete, and unassign behaviors", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).toContain("/api/dashboard/orders/")
    expect(surface).toContain("resendOrderConfirmation")
    expect(surface).toContain("unassignPayment")
    expect(surface).toContain("<AssignPaymentSheet")
    expect(surface).toContain("window.location.reload")
  })

  it("retains the required action labels in the extracted panels", () => {
    const actions = readSource(
      "components/dashboard/orders/panels/order-actions-panel.tsx"
    )
    expect(actions).toContain("Send email")
    expect(actions).toContain("Merge order")
    expect(actions).toContain("Delete Order")
    const merge = readSource(
      "components/dashboard/orders/panels/merge-order-dialog.tsx"
    )
    expect(merge).toContain("Merge into another order")
    expect(merge).toContain("/api/dashboard/orders/")
    expect(merge).toContain("sourceOrderIds")
    expect(merge).toContain("targetOrderId")
  })

  it("mounts the shared AttendeeOrderEditor from the attendees panel", () => {
    const panel = readSource(
      "components/dashboard/orders/panels/attendees-panel.tsx"
    )
    expect(panel).toContain("AttendeeOrderEditor")
    expect(panel).toContain("getTrackPaymentEditContext")
    expect(panel).toContain("/dashboard/events/${slug}/attendees/")
  })

  it("wires the Merge order action from the actions panel to the dialog", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).toContain("onOpenMergeDialog")
    expect(surface).toContain("isMergeDialogOpen")
    expect(surface).toContain("setIsMergeDialogOpen(true)")

    const actions = readSource(
      "components/dashboard/orders/panels/order-actions-panel.tsx"
    )
    expect(actions).toContain("onOpenMergeDialog")
  })
})

describe("order attendee navigation graph", () => {
  it("links order attendee rows to the event attendee detail", () => {
    const panel = readSource(
      "components/dashboard/orders/panels/attendees-panel.tsx"
    )
    expect(panel).toContain(
      "/dashboard/events/${slug}/attendees/${attendee.id}"
    )
  })

  it("keeps the event-scoped order surface link from the event attendee list", () => {
    const page = readSource("app/dashboard/events/[slug]/attendees/page.tsx")
    expect(page).toContain(
      "/dashboard/events/${slug}/attendees/${attendee._id}"
    )
    expect(page).toContain("/dashboard/events/${slug}/orders/${attendee.orderId}")
  })

  it("links the global attendee list rows to attendee detail", () => {
    const page = readSource("app/dashboard/attendees/page.tsx")
    expect(page).toContain("/dashboard/attendees/${row.attendeeId}")
    expect(page).toContain("eventId=")
    expect(page).toContain("source=")
  })

  it("makes the order surface refresh from the editor instead of client arithmetic", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).toContain("onSaved={() => window.location.reload()}")
  })
})

describe("breadcrumbs and confirmation markers", () => {
  it("labels attendee and order detail segments without breaking the generic route map", () => {
    const breadcrumbs = readSource("components/dashboard/nav-breadcrumbs.tsx")
    expect(breadcrumbs).toContain('attendees: "Attendees"')
    expect(breadcrumbs).toContain('orders: "Orders"')
    expect(breadcrumbs).toContain('previousSegment === "attendees"')
    expect(breadcrumbs).toContain("Attendee ")
    expect(breadcrumbs).toContain("Order ")
    expect(breadcrumbs).toContain("routeMap[segment]")
  })

  it("keeps ticket-change, option-clear, move, and merge confirmations blocking dialogs", () => {
    const editor = readSource("components/dashboard/attendee-order-editor.tsx")
    expect(editor).toContain("kind: \"ticket-change\"")
    expect(editor).toContain("kind: \"clear-option\"")
    expect(editor).toContain("kind: \"move\"")
    expect(editor).not.toContain("window.confirm")
  })
})
