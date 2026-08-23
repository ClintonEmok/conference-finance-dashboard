import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("POST /api/dashboard/orders/[orderId]/merge route", () => {
  it("accepts the array-based sourceOrderIds contract", () => {
    const route = readSource(
      "app/api/dashboard/orders/[orderId]/merge/route.ts"
    )
    expect(route).toContain("sourceOrderIds")
    expect(route).toContain("api.orders.mergeOrders")
  })

  it("preserves backward compatibility by using URL orderId when sourceOrderIds is omitted", () => {
    const route = readSource(
      "app/api/dashboard/orders/[orderId]/merge/route.ts"
    )
    expect(route).toContain("routeOrderId")
    expect(route).toContain("sourceOrderIds = [routeOrderId]")
  })

  it("normalizes and validates every source order ID", () => {
    const route = readSource(
      "app/api/dashboard/orders/[orderId]/merge/route.ts"
    )
    expect(route).toContain("normalizedSourceIds")
    expect(route).toContain("sourceOrderIds must contain at least one non-empty string")
  })

  it("returns structured 400 errors for guardrail violations", () => {
    const route = readSource(
      "app/api/dashboard/orders/[orderId]/merge/route.ts"
    )
    expect(route).toContain("badRequest")
    expect(route).toContain("BAD_REQUEST")
    expect(route).toContain("targetOrderId is required")
  })

  it("requires authentication via requireApiUser", () => {
    const route = readSource(
      "app/api/dashboard/orders/[orderId]/merge/route.ts"
    )
    expect(route).toContain("requireApiUser")
    expect(route).toContain("NextResponse")
  })

  it("forwards the merge error messages from the mutation", () => {
    const route = readSource(
      "app/api/dashboard/orders/[orderId]/merge/route.ts"
    )
    expect(route).toContain('message.startsWith("Source")')
    expect(route).toContain('message.startsWith("Target")')
    expect(route).toContain('message.startsWith("At least")')
    expect(route).toContain('message.startsWith("Duplicate")')
    expect(route).toContain('message.startsWith("A source")')
    expect(route).toContain('message.startsWith("Booking reference")')
  })
})

describe("MergeOrderDialog contract", () => {
  it("sends sourceOrderIds array in the POST body", () => {
    const dialog = readSource(
      "components/dashboard/orders/panels/merge-order-dialog.tsx"
    )
    expect(dialog).toContain("sourceOrderIds: [orderId]")
    expect(dialog).toContain("targetOrderId")
  })

  it("navigates to the target order after successful merge", () => {
    const dialog = readSource(
      "components/dashboard/orders/panels/merge-order-dialog.tsx"
    )
    expect(dialog).toContain("window.location.assign")
    expect(dialog).toContain("orders/")
  })

  it("describes the whole-order scope including accommodations and aliases", () => {
    const dialog = readSource(
      "components/dashboard/orders/panels/merge-order-dialog.tsx"
    )
    expect(dialog).toContain("booking-reference aliases")
    expect(dialog).toContain("accommodation rows")
  })
})

describe("OrderActionsPanel merge action", () => {
  it("includes the Merge order button with onOpenMergeDialog callback", () => {
    const actions = readSource(
      "components/dashboard/orders/panels/order-actions-panel.tsx"
    )
    expect(actions).toContain("Merge order")
    expect(actions).toContain("onOpenMergeDialog")
  })

  it("does not conflate Merge with the attendee Move action", () => {
    const editor = readSource("components/dashboard/attendee-order-editor.tsx")
    expect(editor).toContain("kind: \"move\"")
    // Merge and Move are separate flows
    const actions = readSource(
      "components/dashboard/orders/panels/order-actions-panel.tsx"
    )
    expect(actions).not.toContain("moveAttendee")
  })
})
