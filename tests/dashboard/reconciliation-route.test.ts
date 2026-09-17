import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The reconciliation route's structural guard. Phase 58 does not redesign the
 * reconciliation surface — it MOVES it to its own route. The page contract is
 * pinned from source because the platform cannot type-check the frame's props,
 * and the surface's shape is pinned because a later wave must not quietly
 * redesign it.
 *
 * Byte-stability acceptance: `git diff --exit-code --
 * components/dashboard/finance/legacy-reconciliation-surface.tsx` must be empty
 * for the whole phase. The string pins below exist so an edit inside this plan
 * fails fast; the git check is the plan-level gate.
 */

const ROOT = resolve(import.meta.dirname, "../..")
const PAGE_PATH = "app/dashboard/events/[slug]/reconciliation/page.tsx"
const SURFACE_PATH = "components/dashboard/finance/legacy-reconciliation-surface.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("reconciliation route contract", () => {
  const page = readSource(PAGE_PATH)

  it("is the real client page, not the redirect shim", () => {
    expect(page).toContain('"use client"')
    expect(page).toContain("useParams")
    expect(page).not.toContain("redirect(")
    expect(page).not.toContain("financeHref")
    expect(page).not.toContain("formatMoney")
  })

  it("renders the reconciliation surface inside the workspace frame", () => {
    expect(page).toContain("<WorkspaceFrame")
    expect(page).toContain('title="Reconciliation"')
    expect(page).toContain("eventLabel={event.title}")
    expect(page).toContain('workspaceLabel="Reconciliation"')
    expect(page).toContain('workspaceId="reconciliation"')
    expect(page).toContain("@/components/dashboard/finance/legacy-reconciliation-surface")
    expect(page).toContain("<EventReconciliationPage")
    expect(page).toContain("slug={slug}")
    expect(page).toContain("event={event}")
  })

  it("passes no tabs, description, actions or summary — the surface owns its chrome", () => {
    expect(page).not.toContain("tabs=")
    expect(page).not.toContain("description=")
    expect(page).not.toContain("actions=")
    expect(page).not.toContain("summary=")
  })

  it("does not re-wire the surface's data", () => {
    expect(page).not.toContain("reconciliation={")
    expect(page).not.toContain("unassignedPayments={")
  })
})

describe("reconciliation surface byte stability", () => {
  const surface = readSource(SURFACE_PATH)

  it("keeps the moved surface's entry point and logging hooks", () => {
    expect(surface).toContain("export default function EventReconciliationPage")
    expect(surface).toContain("useLogReconciliationPayment")
  })

  it("keeps the narrow and long-text browser backstops", () => {
    expect(surface).toContain("max-w-[calc(100vw-1rem)]")
    expect(surface).toContain("overflow-y-auto")
  })
})
