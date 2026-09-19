import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string) {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("event Finance destructive CRUD boundaries", () => {
  it("renders deletion only from the event-owned payment surface", () => {
    const surface = readSource(
      "components/dashboard/finance/legacy-payments-surface.tsx"
    )
    const hook = readSource("lib/convex/hooks/payments.ts")

    expect(surface).toContain("useDeletePayment")
    expect(surface).toContain("payment.eventId === event._id")
    expect(surface).toContain('payment.status === "unassigned"')
    expect(surface).toContain(
      '(payment.source === "cash" || payment.source === "bank_transfer")'
    )
    expect(surface).toContain("payment.orderId === undefined")
    expect(surface).toContain("DialogTitle")
    expect(surface).not.toContain("window.confirm")
    expect(surface).toContain("eventId: event._id")
    expect(hook).toContain("api.payments.deletePayment")
  })

  it("keeps global assignment rows and deprecated root payment routes out of deletion", () => {
    const surface = readSource(
      "components/dashboard/finance/legacy-payments-surface.tsx"
    )
    const rootPage = readSource("app/dashboard/payments/page.tsx")

    expect(surface).toContain("useUnassignedPayments")
    expect(surface).not.toContain("components/payments/payment-list")
    expect(rootPage).toContain("notFound()")
  })
})
