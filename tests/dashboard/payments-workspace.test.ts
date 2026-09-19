import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The payments route's structural guard. Phase 58 MOVES the payments surface
 * out of the retired tab host onto its own route — it repoints the surface's
 * reconciliation links and removes the inner header the page frame now owns; it
 * does not restyle it. The page contract is pinned from source because the
 * platform cannot type-check the frame's props, and the moved surface's
 * behaviour bands are pinned because they are explicitly out of scope.
 *
 * Plan-level acceptance: `git grep -n "financeHref" --
 * components/dashboard/finance/legacy-payments-surface.tsx
 * "app/dashboard/events/[slug]/payments"` is empty at plan end. The string pins
 * below exist so an edit inside this plan fails fast; the grep is the
 * plan-level gate.
 */

const ROOT = resolve(import.meta.dirname, "../..")
const PAGE_PATH = "app/dashboard/events/[slug]/payments/page.tsx"
const WORKSPACE_PATH = "components/dashboard/finance/payments-workspace.tsx"
const SURFACE_PATH = "components/dashboard/finance/legacy-payments-surface.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("payments route contract", () => {
  const page = readSource(PAGE_PATH)

  it("is the real client page, not the redirect shim", () => {
    expect(page).toContain('"use client"')
    expect(page).toContain("useParams")
    expect(page).toContain("<PaymentsWorkspace")
    expect(page).toMatch(/<PaymentsWorkspace\b/)
    expect(page).not.toContain("redirect(")
    expect(page).not.toContain("financeHref")
  })
})

describe("payments workspace composition", () => {
  const workspace = readSource(WORKSPACE_PATH)

  it("renders the frame without a tab host", () => {
    expect(workspace).toContain("WorkspaceFrame")
    expect(workspace).toContain('title="Payments"')
    expect(workspace).toContain('workspaceLabel="Payments"')
    expect(workspace).toContain('workspaceId="payments"')
    expect(workspace).toContain('description="Payments linked to this event, plus unassigned payments."')
    expect(workspace).not.toContain("tabs=")
  })

  it("feeds the attention queue from the canonical hrefs", () => {
    expect(workspace).toContain("buildFinanceAttentionItems")
    expect(workspace).toContain("WorkspaceAttentionQueue")
    expect(workspace).toContain("reconciliationHref(slug)")
    expect(workspace).toContain("paymentsHref(slug)")
    expect(workspace).toContain("api.orders.getOrdersForReconciliation")
    expect(workspace).toContain("api.payments.getUnassignedPayments")
    expect(workspace).toContain("Match a payment")
  })

  it("does not carry over the retired host's client-side money", () => {
    expect(workspace).not.toContain("formatMoney")
    expect(workspace).not.toContain(".reduce(")
    expect(workspace).not.toContain("deriveBalanceAmounts")
    expect(workspace).not.toContain("FinanceSummaryCards")
    expect(workspace).not.toContain("financeHref")
    expect(workspace).not.toContain("WorkspaceTabs")
  })

  it("keeps the workspace entry point intact", () => {
    // A bare `toContain` treats the old name as a prefix of a rename
    // (`PaymentsWorkspaceMutated`); the signature with its opening paren is the
    // boundary that makes an entry-point edit fail fast.
    expect(workspace).toMatch(/export function PaymentsWorkspace\s*\(/)
  })
})

describe("moved payments surface", () => {
  const surface = readSource(SURFACE_PATH)

  it("uses the canonical reconciliation href and keeps no finance href", () => {
    expect(surface).not.toContain("financeHref")
    expect(surface).toContain("reconciliationHref(slug)")
    expect(surface).not.toContain("/dashboard/events/${slug}/reconciliation")
  })

  it("no longer duplicates the frame's title, description or action", () => {
    expect(surface).not.toContain("Payments linked to this event, plus unassigned payments.")
  })

  it("preserves the existing mark-donation and delete-payment behaviour", () => {
    expect(surface).toContain("useDeletePayment")
    expect(surface).toContain("DialogTitle")
    expect(surface).not.toContain("window.confirm")
    expect(surface).toContain("useMarkPaymentAsDonation")
    expect(surface).toContain("Mark donation")
    expect(surface).toContain("Match order")
    expect(surface).toContain('role="alert"')
    expect(surface).toContain('aria-live="polite"')
  })

  it("keeps the surface entry point intact", () => {
    // Same boundary rationale as the workspace entry point above.
    expect(surface).toMatch(/export default function EventPaymentsPage\s*\(/)
  })
})
