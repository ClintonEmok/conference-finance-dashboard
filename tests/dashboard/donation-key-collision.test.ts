import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The sibling-key uniqueness guard (Phase 61, plan 61-01).
 *
 * DEFECT: the donations workspace rendered the record panel and both dialogs as
 * children of ONE list, all keyed on the bare donation id. Opening the Allocate
 * dialog for the selected donation therefore produced two siblings with the
 * same key, and React's reconciliation duplicated (and left stale copies of)
 * the record panel. Reproduced live on `divine-redesign`, 2026-09-18; the
 * console reported verbatim:
 * "Encountered two children with the same key, `kd70mc1d7nxx7kv3h95f6kzyr18em6ye`.
 * Keys should be unique so that components maintain their identity across
 * updates. Non-unique keys may cause children to be duplicated and/or omitted —
 * the behavior is unsupported and could change in a future version."
 * Panel count grew 1 → 2 → 3 → 4 across Select/Allocate/CANCEL cycles and a
 * reload cleared it.
 *
 * React requires unique keys among siblings. The panel and the two dialogs
 * survive 61-03's restructure, so the keys must stay namespaced by ELEMENT:
 * `record-`, `allocation-`, `deletion-`. The allocation-history rows keyed
 * `${orderId}:${attendeeId}` collided whenever one donation holds two
 * allocations to the same target; the rendered ordinal (`:${index}`) makes them
 * unique per rendered row.
 *
 * The absence pins read the raw source text (comments included): a doc comment
 * naming a retired key is exactly how a text scan gets satisfied falsely.
 * The presence pins are deliberately anchored to the real `key={...}` sites in
 * the files that render them, never to a bare token that a comment could carry.
 */

const ROOT = resolve(import.meta.dirname, "../..")
const WORKSPACE_PATH = "components/dashboard/finance/donations-workspace.tsx"
const RECORD_PATH = "components/dashboard/finance/donation-record-panel.tsx"
const DELETE_DIALOG_PATH =
  "components/dashboard/finance/donation-delete-dialog.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const workspace = readSource(WORKSPACE_PATH)
const record = readSource(RECORD_PATH)
const deleteDialog = readSource(DELETE_DIALOG_PATH)

describe("donation sibling keys — the accumulation defect cannot return", () => {
  it("keeps every bare donation-id key out of the workspace", () => {
    expect(workspace).not.toMatch(/key=\{\s*selectedRow\._id\s*\}/)
    expect(workspace).not.toMatch(/key=\{\s*allocationTarget\.donationId\s*\}/)
    expect(workspace).not.toMatch(/key=\{\s*deleteTarget\.donationId\s*\}/)
  })

  it("keeps the retired bare key out of the delete dialog (comments included)", () => {
    // The 58-09 doc comment used to name `key={deleteTarget.donationId}` — the
    // exact literal whose supersession this plan documents. A comment that
    // still names the retired key reassures the reader and satisfies a sloppy
    // scan at the same time, so the file must not contain it at all.
    expect(deleteDialog).not.toMatch(/key=\{\s*deleteTarget\.donationId\s*\}/)
  })

  it("keeps the un-indexed history composite out of the record panel", () => {
    // The regex only matches a key that ENDS at attendeeId: the indexed form
    // continues with `:${index}` and is therefore not matched.
    expect(record).not.toMatch(
      /key=\{\s*`\$\{row\.orderId\}:\$\{row\.attendeeId\}`\s*\}/
    )
  })

  it("keys the panel and both dialogs by element namespace", () => {
    expect(workspace).toMatch(/key=\{\s*`record-\$\{selectedRow\._id\}`\s*\}/)
    expect(workspace).toMatch(
      /key=\{\s*`allocation-\$\{allocationTarget\.donationId\}`\s*\}/
    )
    expect(workspace).toMatch(
      /key=\{\s*`deletion-\$\{deleteTarget\.donationId\}`\s*\}/
    )
  })

  it("keys the allocation-history rows with the rendered ordinal", () => {
    expect(record).toMatch(
      /key=\{\s*`\$\{row\.orderId\}:\$\{row\.attendeeId\}:\$\{index\}`\s*\}/
    )
    // The ordinal must actually be bound by the map — a key that references an
    // unbound `index` cannot compile, but the binding is the load-bearing half.
    expect(record).toMatch(/visibleRows\.map\(\(row, index\) =>/)
  })
})
