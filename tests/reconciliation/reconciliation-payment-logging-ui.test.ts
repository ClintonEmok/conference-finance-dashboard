import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect, test } from "vitest"

const root = resolve(import.meta.dirname, "../..")
const surface = readFileSync(resolve(root, "components/dashboard/finance/legacy-reconciliation-surface.tsx"), "utf8")
const workspace = readFileSync(resolve(root, "components/dashboard/finance/payments-workspace.tsx"), "utf8")

test("Log New preserves the selected order and exact field/copy contract", () => {
  for (const label of [
    "Order",
    "Amount ({event.currency})",
    "Payment source",
    "Payer name",
    "Payment date (optional)",
    "Bank reference (optional)",
    "Payer account details (optional)",
    "Notes (optional)",
    "Cash",
    "Bank transfer",
    "Log payment",
    "Logging payment…",
    "Payment logged.",
    "Leave blank to use the current date and time.",
    "Optional details are saved for reconciliation history.",
  ]) expect(surface).toContain(label)

  expect(surface).toContain("Link Existing")
  expect(surface).toContain("useLogReconciliationPayment")
  expect(surface).not.toContain("useCreatePayment")
  expect(surface).toContain("SheetDescription")
  expect(surface).toContain("aria-invalid")
  expect(surface).toContain("aria-describedby")
  expect(surface).toContain('role="alert"')
  expect(surface).toContain('aria-live="assertive"')
  expect(surface).toContain('aria-live="polite"')
  expect(surface).toContain("aria-busy")
  expect(surface).toContain("This order is no longer outstanding. Close this form and choose another outstanding order.")
  expect(surface).toContain('className="mt-2 px-4"')
})

test("Log New sends canonical ids and omits blank optional fields", () => {
  expect(surface).toContain("eventId: event._id")
  expect(surface).toContain('orderId: selectedOrderId as Id<"orders">')
  expect(surface).toContain("amountMinor")
  expect(surface).toContain("payerName: normalizedPayerName")
  expect(surface).toContain("optionalText(payerAccountNumber)")
  expect(surface).toContain("optionalText(reference)")
  expect(surface).toContain("optionalText(notes)")
  expect(surface).toContain("paidAt: Date.parse")
  expect(surface).not.toContain("window.location.reload")
  expect(surface).not.toContain("refetch(")
  expect(surface).not.toContain("deriveBalanceAmounts")
  expect(surface).not.toContain("clientUser")
})

/**
 * Forced expectation update (Phase 58, UI-SPEC G3) — NOT a product change.
 *
 * The assertion set moved from the retired tab host to the dedicated payments
 * workspace. The old `row.appliedAmountMinor` / `row.donationAmountMinor` /
 * `"Unavailable"` assertions belonged to the host's `FinanceSummaryCards`,
 * whose `reconciliation.data.reduce(...)` sum was a client-side money formula
 * the UI-SPEC forbids from returning; the new workspace renders the moved
 * surface plus the server-fed attention queue and computes no money at all.
 * The file's first two tests (the moved reconciliation surface) are untouched.
 */
test("The payments workspace consumes server projections and renders no client-side money", () => {
  expect(workspace).toMatch(/export function PaymentsWorkspace\s*\(/)
  expect(workspace).toContain("api.orders.getOrdersForReconciliation")
  expect(workspace).toContain("api.payments.getUnassignedPayments")
  expect(workspace).toContain("buildFinanceAttentionItems")
  expect(workspace).toContain("reconciliationHref(slug)")
  expect(workspace).toContain("paymentsHref(slug)")
  expect(workspace).not.toContain("deriveBalanceAmounts")
  expect(workspace).not.toContain("window.location.reload")
  expect(workspace).not.toContain("refetch(")
  expect(workspace).not.toContain("FinanceSummaryCards")
  expect(workspace).not.toContain(".reduce(")
})

test("narrow and long-text browser backstops remain explicitly deferred to Phase 50", () => {
  expect(surface).toContain("max-w-[calc(100vw-1rem)]")
  expect(surface).toContain("overflow-y-auto")
  expect(surface).toContain("break-words")
  expect(surface).toContain("min-w-0")
})
