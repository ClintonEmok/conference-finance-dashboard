import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * D-06's wiring guard (Phase 61, plan 61-07) — the structural half of the
 * orphaned-mutation closure.
 *
 * The v7.0 integration audit flagged `removeDonationAllocation` as an ORPHANED
 * mutation: complete, proven and replay-safe, with ZERO UI callers. This plan
 * wires it to the detail route's per-row Remove action. The failure modes this
 * suite exists to catch are the ones a text-less review would miss:
 *
 *   1. A SECOND call site appears (a fork, or removal reimplemented).
 *   2. Removal is expressed as a SET-REPLACE through `allocateDonation` — a
 *      different ledger operation with different audit rows.
 *   3. The panel gains the mutation and skips the confirmation gate.
 *   4. The dialog loses its confirmation discipline or regenerates its key per
 *      attempt (defeating the server's replay-before-guards ordering).
 *   5. The host loses the freed-amount band or the reload-token bump (a silent
 *      removal with stale figures).
 *   6. The list grows a removal affordance it must not host.
 *
 * CONTRACT WITH 61-05's D-05 REGISTER: the register binds its orphan-closure
 * row to the literal `api.donations.removeDonationAllocation` and the constant
 * `REMOVAL_DIALOG` in THIS file. Do not rename either without updating
 * `tests/dashboard/donation-surfaces-preservation.test.ts`.
 */

const ROOT = resolve(import.meta.dirname, "../..")

const REMOVAL_DIALOG =
  "components/dashboard/finance/donation-allocation-removal-dialog.tsx"
const REMOVAL_COPY = "lib/dashboard/donation-allocation-removal-copy.ts"
const PANEL_PATH = "components/dashboard/finance/donation-record-panel.tsx"
const SURFACE_PATH = "components/dashboard/finance/donation-detail-surface.tsx"
const WORKSPACE_PATH = "components/dashboard/finance/donations-workspace.tsx"
const ALLOCATION_DIALOG_PATH =
  "components/dashboard/finance/donation-allocation-dialog.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

function walkSourceFiles(relativeRoot: string): string[] {
  const out: string[] = []
  const visit = (relativeDir: string) => {
    for (const entry of readdirSync(resolve(ROOT, relativeDir), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDir}/${entry.name}`
      if (entry.isDirectory()) visit(relativePath)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push(relativePath)
      }
    }
  }
  visit(relativeRoot)
  return out.sort()
}

/**
 * Removes block and line comments before a symbol scan. Without this, a doc
 * comment naming the mutation satisfies the single-caller pin even when the
 * call site has been swapped away (the M1 probe proved exactly that), and a
 * wiring guard must never be satisfiable by a comment.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*$/gm, "")
}

// Read every pinned file up front: a rename is an ENOENT failure here, never a
// silently skipped assertion.
const dialog = readSource(REMOVAL_DIALOG)
const copyModule = readSource(REMOVAL_COPY)
const panel = readSource(PANEL_PATH)
const surface = readSource(SURFACE_PATH)
const workspace = readSource(WORKSPACE_PATH)

describe("the removal path is the ONE existing mutation — no fork, no set-replace", () => {
  it("pins the constant 61-05's register anchors on", () => {
    expect(REMOVAL_DIALOG).toBe(
      "components/dashboard/finance/donation-allocation-removal-dialog.tsx"
    )
  })

  it("has exactly one UI reference to removeDonationAllocation — the removal dialog", () => {
    const files = [...walkSourceFiles("app"), ...walkSourceFiles("components")]
    // Non-vacuity: the walk must reach the files this scan is about.
    expect(files).toContain(REMOVAL_DIALOG)
    expect(files).toContain(PANEL_PATH)
    expect(files).toContain(SURFACE_PATH)
    expect(files.length).toBeGreaterThan(100)

    const qualified = files.filter((file) =>
      stripComments(readSource(file)).includes(
        "api.donations.removeDonationAllocation"
      )
    )
    expect(qualified).toEqual([REMOVAL_DIALOG])

    // The BARE symbol form: an aliased/destructured call site
    // (`const remove = api.donations.removeDonationAllocation`) evades the
    // qualified scan, so the unqualified token is covered too.
    const bare = files.filter((file) =>
      stripComments(readSource(file)).includes("removeDonationAllocation")
    )
    expect(bare).toEqual([REMOVAL_DIALOG])

    // A computed member access could evade both text scans.
    const computed = files.filter((file) =>
      stripComments(readSource(file)).includes("api.donations[")
    )
    expect(computed).toEqual([])
  })

  it("has exactly one allocation submit path, unchanged (no second writer grew)", () => {
    const files = [...walkSourceFiles("app"), ...walkSourceFiles("components")]

    const allocateCallers = files.filter((file) =>
      readSource(file).includes("api.donations.allocateDonation")
    )
    expect(allocateCallers).toEqual([ALLOCATION_DIALOG_PATH])

    const previewCallers = files.filter((file) =>
      readSource(file).includes("api.donations.previewDonationAllocation")
    )
    expect(previewCallers).toEqual([ALLOCATION_DIALOG_PATH])
  })

  it("never expresses removal as a set-replace through the allocation mutations", () => {
    for (const source of [dialog, panel, surface]) {
      expect(source).not.toContain("api.donations.allocateDonation")
      expect(source).not.toContain("api.donations.previewDonationAllocation")
      expect(source).not.toContain("allocateDonationToAttendee")
    }
  })
})

describe("the removal dialog source contract", () => {
  it("uses only the house dialog primitive, never window.confirm", () => {
    expect(dialog).toContain('from "@/components/ui/dialog"')
    expect(dialog).toContain("DialogDescription")
    expect(dialog).toContain("DialogFooter")
    expect(dialog).not.toContain("window.confirm")
  })

  it("renders the light confirmation naming the target and the recorded amount", () => {
    expect(dialog).toContain("buildAllocationRemovalConfirmation(")
    expect(dialog).toContain("amountMinor")
    expect(dialog).toContain("attendeeName")
    expect(dialog).toContain("allocationRemovalRefusalCopy(")
  })

  it("keeps the mutation behind the single confirm handler", () => {
    // The dialog IS the confirmation gate: one mutation call site, reached only
    // from the one onClick bound to the destructive submit button.
    expect((dialog.match(/removeAllocation\(/g) ?? []).length).toBe(1)
    expect((dialog.match(/handleRemove\b/g) ?? []).length).toBe(2)
    expect(dialog).toContain("onClick={() => void handleRemove()}")
    expect(
      dialog.indexOf("onClick={() => void handleRemove()}")
    ).toBeGreaterThan(dialog.indexOf('variant="destructive"'))
    // Nothing submits on mount/open: the operator's click is the only trigger.
    expect(dialog).not.toContain("useEffect")
  })

  it("submits through the destructive button with the house affordances", () => {
    expect(dialog).toContain('variant="destructive"')
    expect(dialog).toContain("Keep allocation")
    expect(dialog).toContain("Remove allocation")
    expect(dialog).toContain("aria-busy")
    expect(dialog).toContain("showCloseButton")
    expect(dialog).toContain('role="alert"')
  })

  it("mints the key once at open and regenerates it only after success", () => {
    expect(dialog).toContain("nextAllocationRemovalKey")
    expect(dialog).toContain("idempotencyKey: keyState.key")
    // Exactly two call sites: the open-time mint and the success regeneration.
    // Neither a retry (the catch path) nor a re-render can regenerate the key.
    expect((dialog.match(/nextAllocationRemovalKey\(/g) ?? []).length).toBe(2)
    expect(dialog).toMatch(/succeeded: true/)
    // Minting lives in the pure lib, never in the component.
    expect(dialog).not.toContain("randomUUID")
  })

  it("computes no money of its own", () => {
    expect(dialog).not.toMatch(/formatMoney\(/)
    expect(dialog).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(dialog).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
    expect(dialog).not.toContain("Math.")
    expect(dialog).not.toContain("reduce(")
    expect(dialog).not.toContain("toFixed(")
  })

  it("is backed by the pure contract, which owns the strings and the key policy", () => {
    expect(copyModule).toContain("formatMoney")
    expect(copyModule).toContain(":remove:")
    expect(copyModule).toContain("mintAllocationRemovalKey")
    expect(copyModule).toContain("nextAllocationRemovalKey")
    expect(copyModule).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(copyModule).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
  })
})

describe("the record panel wires the per-row Remove action", () => {
  it("arms the host through the required onRemoveAllocation seam", () => {
    expect(panel).toContain("onRemoveAllocation")
    // The handler passes the RECORDED amount, never the applied figure.
    const start = panel.indexOf("onRemoveAllocation({")
    expect(start).toBeGreaterThan(-1)
    const end = panel.indexOf("})", start)
    expect(end).toBeGreaterThan(start)
    const arm = panel.slice(start, end)
    expect(arm).toContain("attendeeId: row.attendeeId")
    expect(arm).toContain("orderId: row.orderId")
    expect(arm).toContain("amountMinor: row.amountMinor")
    expect(arm).not.toContain("appliedMinor")
  })

  it("holds no mutation — the panel only arms the confirmation", () => {
    expect(panel).not.toContain("useMutation")
    expect(panel).not.toContain("removeDonationAllocation")
    expect(panel).not.toContain("allocateDonation")
  })

  it("renders a Remove affordance per history row and keeps the indexed row key", () => {
    expect(panel).toContain("Actions</TableHead>")
    expect(panel).toContain("Remove")
    // The 61-01 anchor survives: `${orderId}:${attendeeId}:${index}`.
    expect(panel).toMatch(
      /key=\{\s*`\$\{row\.orderId\}:\$\{row\.attendeeId\}:\$\{index\}`\s*\}/
    )
    expect(panel).toMatch(/visibleRows\.map\(\(row, index\) =>/)
  })
})

describe("the detail host mounts the removal dialog and reports the freed amount", () => {
  it("mounts the dialog with the removal- namespaced key and the target props", () => {
    expect(surface).toContain("<DonationAllocationRemovalDialog")
    expect(surface).toMatch(/key=\{`removal-\$\{removalTarget\.attendeeId\}`\}/)
    expect(surface).toContain("attendeeId={removalTarget.attendeeId}")
    expect(surface).toMatch(/amountMinor=\{removalTarget\.amountMinor\}/)
    expect(surface).toMatch(/attendeeName=\{removalAttendeeName\}/)
    expect(surface).toContain("onRemoveAllocation")
  })

  it("resolves the target attendee name from the order, with a raw-id fallback", () => {
    expect(surface).toContain("api.orders.getOrderWithAttendees")
    expect(surface).toMatch(
      /removalTarget === null \? "skip" : \{ orderId: removalTarget\.orderId \}/
    )
    expect(surface).toMatch(/String\(removalTarget\.attendeeId\)/)
  })

  it("reports the freed amount in a role=status band and refreshes the record", () => {
    expect(surface).toContain("buildAllocationRemovalSuccess(")
    expect(surface).toMatch(
      /buildAllocationRemovalSuccess\(\{\s*amountMinor: removalSuccess\.amountMinor,?\s*\}\)/
    )
    expect(surface).toMatch(/role="status"/)

    // The onRemoved window carries the freed-amount state AND the reload-token
    // bump: without the bump the panel would show stale Allocated/Remaining
    // figures (a silent removal).
    const start = surface.indexOf("onRemoved={")
    expect(start).toBeGreaterThan(-1)
    const end = surface.indexOf("/>", start)
    expect(end).toBeGreaterThan(start)
    const removedWindow = surface.slice(start, end)
    expect(removedWindow).toMatch(/setRemovalSuccess\(/)
    expect(removedWindow).toMatch(/set[A-Za-z]*ReloadToken\(/)
  })

  it("holds no mutation — the dialog is the one call site", () => {
    expect(surface).not.toContain("removeDonationAllocation")
    expect(surface).not.toContain("useMutation")
  })
})

describe("the list does not grow a removal affordance", () => {
  it("keeps the workspace free of the removal dialog and the mutation", () => {
    expect(workspace).not.toContain("removeDonationAllocation")
    expect(workspace).not.toContain("DonationAllocationRemovalDialog")
  })
})
