import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

/**
 * Removes block and line comments before a presence scan. Without this, a doc
 * comment naming the mutation satisfies a pin even when the wiring is gone
 * (the decoy-comment probe); a label guard must never be satisfiable by a
 * comment.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*$/gm, "")
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
    expect(surface).toContain("setIsEditingOrder(false)")
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

  it("wires attendee removal through the event-scoped DELETE route", () => {
    const panel = readSource(
      "components/dashboard/orders/panels/attendees-panel.tsx"
    )
    const editor = readSource("components/dashboard/attendee-order-editor.tsx")

    expect(panel).toContain("/api/dashboard/attendees/")
    expect(panel).toContain('method: "DELETE"')
    expect(panel).toContain("body: JSON.stringify({ eventId })")
    expect(panel).toContain("attendees.length > 1")
    expect(editor).toContain('method: "DELETE"')
    expect(editor).toContain("body: JSON.stringify({ eventId: attendee.eventId })")
    expect(editor).toContain("canRemove")
    expect(editor).toContain("canRemove = false")
    expect(editor).toContain('role="alert"')
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

  it("lets the reactive order query refresh after attendee edits instead of hard reloading", () => {
    const surface = readSource(
      "components/dashboard/orders/order-detail-surface.tsx"
    )
    expect(surface).toContain("onSaved={() => undefined}")
    expect(surface).not.toContain("window.location.reload")
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

  it("labels dynamic segments for humans — never an identifier or a raw slug (D-08)", () => {
    const raw = readSource("components/dashboard/nav-breadcrumbs.tsx")
    const breadcrumbs = stripComments(raw)

    // Dynamic segments resolve to plain descriptors...
    expect(breadcrumbs).toContain('label = "Attendee detail"')
    expect(breadcrumbs).toContain('label = "Order detail"')
    expect(breadcrumbs).toContain('label = "Donation detail"')
    expect(breadcrumbs).toContain('label = "Room detail"')
    // ...the event segment prefers the event title already carried by the
    // shell's provider (no new read), and the static `new` route stays a label.
    expect(breadcrumbs).toContain("useOptionalEventDashboard")
    expect(breadcrumbs).toContain("eventDashboard?.event.title")
    expect(breadcrumbs).toContain('segment !== "new"')
    // The raw bytes must contain no identifier-label derivation at all: the
    // truncating helper is gone, no label interpolates the segment, and the
    // slug is never uppercased.
    expect(raw).not.toContain("shortId")
    expect(raw).not.toMatch(/\$\{segment\}/)
    expect(raw).not.toMatch(/segment\.toUpperCase\(\)/)
  })

  it("removes the slug chip from the event shell header but keeps its links (D-08)", () => {
    const raw = readSource("app/dashboard/events/[slug]/layout.tsx")
    const layout = stripComments(raw)

    // No label position renders the slug any more...
    expect(raw).not.toMatch(/>\s*\/\{event\.slug\}/)
    // ...while the useful header affordances remain.
    expect(layout).toContain("Public page")
    expect(layout).toContain("/events/${event.slug}")
    expect(layout).toContain("Go to home")
  })

  it("keeps ticket-change, option-clear, move, and merge confirmations blocking dialogs", () => {
    const editor = readSource("components/dashboard/attendee-order-editor.tsx")
    expect(editor).toContain("kind: \"ticket-change\"")
    expect(editor).toContain("kind: \"clear-option\"")
    expect(editor).toContain("kind: \"move\"")
    expect(editor).not.toContain("window.confirm")
  })
})

describe("order summary reads as human labels (D-08 correction)", () => {
  const panelSource = () =>
    readSource("components/dashboard/orders/panels/order-summary-panel.tsx")

  it("headlines the booking reference and drops the raw order id", () => {
    const raw = panelSource()
    const panel = stripComments(raw)

    // The prominent heading is the human identifier, with a neutral fallback...
    expect(panel).toContain('order.bookingRef ?? "No booking reference"')
    // ...the raw id is neither rendered nor part of the panel's contract.
    expect(raw).not.toContain("{order.id}")
    expect(panel).not.toMatch(/\bid: string\b/)
  })

  it("drops the slug badge but keeps the back link on the slug", () => {
    const raw = panelSource()
    const panel = stripComments(raw)

    expect(raw).not.toMatch(/\{slug\}\s*<\/Badge>/)
    expect(panel).toContain("/dashboard/events/${slug}/orders")
  })

  it("drops the raw path line and keeps the event title as the description", () => {
    const raw = panelSource()
    const panel = stripComments(raw)

    expect(raw).not.toContain("/dashboard/events/{slug}/orders/{order.id}")
    expect(panel).toMatch(
      /<CardDescription[^>]*>\s*\{eventTitle\}\s*<\/CardDescription>/
    )
  })

  it("keeps the meaningful status badge", () => {
    const panel = stripComments(panelSource())

    expect(panel).toContain(
      "statusBadgeVariant(order.normalizedStatus ?? null)"
    )
    expect(panel).toContain('order.normalizedStatus ?? "pending"')
  })
})
