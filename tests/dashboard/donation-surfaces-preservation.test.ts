import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Phase 61 plan 61-05 — the D-05 carry-forward register + the cross-host
 * invariants the restructure introduced.
 *
 * D-05 is a PRESERVATION contract, not a redesign. The restructure moved the
 * record's host, removed the list panel and added an order entry; each is a
 * chance to silently drop a locked behaviour that was verified live at v7.0's
 * close. This suite makes the contract executable:
 *
 *   1. THE REGISTER — one entry per D-05 item, each naming the pin file that
 *      discriminates it and the exact code anchors inside that pin. A deleted
 *      or renamed pin is an ENOENT failure here; the register cannot silently
 *      shrink.
 *   2. SINGLE WRITERS — the allocation editor stays the ONLY preview/allocate
 *      writer and the delete dialog the ONLY delete writer. A fork (D-02's
 *      entry point, or a future host) fails this.
 *   3. CROSS-HOST OBLIGATIONS — both donation hosts report DDEL-02 and mount
 *      both dialogs; the list keeps the relocated allocation band; every mount
 *      site namespaces its key; the four raw key forms from 61-01 never return.
 *   4. KNOWN COUNT — neither host arms a delete dialog with an unknown
 *      allocation count.
 *   5. NO CLIENT MONEY ARITHMETIC — on the surfaces the 59 audit does not
 *      sweep for itself.
 *
 * COMMENT STRIPPING. Every register assertion reads the COMMENT-STRIPPED pin
 * text: a commented-out assertion must not satisfy its anchor (the milestone's
 * recorded failure mode — a doc comment satisfied a raw scan while the wiring
 * was dead). The transform only removes comment text; the anchors are code
 * fragments chosen so a comment cannot fabricate them.
 *
 * SCOPE NOTE (honest). The register proves each pin still EXISTS as the
 * assertion it was; it does not re-run the pin. Behavioural regression on a
 * current host is caught by the pin suite itself, and the plan's probe (b)
 * demonstrates that discrimination. The register's unique value is failing
 * when a restructure deletes or renames a pin away.
 */

const ROOT = resolve(import.meta.dirname, "../..")

const ALLOCATION_DIALOG_PATH =
  "components/dashboard/finance/donation-allocation-dialog.tsx"
const DELETE_DIALOG_PATH =
  "components/dashboard/finance/donation-delete-dialog.tsx"
const WORKSPACE_PATH = "components/dashboard/finance/donations-workspace.tsx"
const SURFACE_PATH = "components/dashboard/finance/donation-detail-surface.tsx"
const RECORD_PATH = "components/dashboard/finance/donation-record-panel.tsx"
const ORDER_SURFACE_PATH =
  "components/dashboard/orders/order-detail-surface.tsx"
const CHOOSER_PATH =
  "components/dashboard/orders/panels/allocate-donation-to-order.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

/**
 * Removes block and line comments before a symbol scan. Without this, a
 * commented-out assertion satisfies a presence anchor (the recorded failure
 * mode), and an anchor naming a forbidden form in a comment would false-fail a
 * presence scan. The line-comment clause requires `(^|\s)` before `//`, so
 * `https://` inside a string literal is untouched.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*$/gm, "")
}

const strippedCache = new Map<string, string>()

/** Read a file and strip its comments. A missing file throws (never a skip). */
function strippedSource(relativePath: string): string {
  const cached = strippedCache.get(relativePath)
  if (cached !== undefined) return cached
  const stripped = stripComments(readSource(relativePath))
  strippedCache.set(relativePath, stripped)
  return stripped
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

type D05Pin = { pinFile: string; anchors: readonly string[] }

/**
 * The D-05 register: item → the pin file that discriminates it → the exact
 * code anchors inside that pin. Every anchor is a fragment of the pin's own
 * assertion expression, never text that could live only in a comment.
 *
 * `additionalPins` carries items whose contract is split across two suites —
 * both are read, and both must keep their anchors.
 */
const D05_ITEMS: ReadonlyArray<{
  id: string
  pinFile: string
  anchors: readonly string[]
  additionalPins?: readonly D05Pin[]
}> = [
  {
    id: "writable-now-leads-on-effective-capacity",
    pinFile: "tests/dashboard/donation-allocation-dialog.test.ts",
    anchors: [
      String.raw`/label="Writable now"[\s\S]{0,120}valueMinor=\{row\.effectiveCapacityMinor\}/`,
       String.raw`/label="Writable now"[\s\S]{0,200}tone="primary"/`,
      String.raw`/label="Will allocate"[\s\S]{0,120}valueMinor=\{row\.amountMinor\}/`,
    ],
  },
  {
    id: "scope-balance-demoted-last-never-bounds-an-input",
    pinFile: "tests/dashboard/donation-allocation-dialog.test.ts",
    anchors: [
      String.raw`/label="Scope balance"[\s\S]{0,60}tone="primary"/`,
      String.raw`/Writable now[\s\S]{0,60}ceilingMinor/`,
      String.raw`/Up to[\s\S]{0,60}effectiveCapacityMinor/`,
      String.raw`/Up to[\s\S]{0,60}ceilingMinor/`,
      "Limited by the order's shared remaining capacity.",
    ],
  },
  {
    id: "record-scope-balance-before-writable-now",
    pinFile: "tests/dashboard/donation-detail-surface.test.ts",
    anchors: [
      'record.indexOf("Scope balance</TableHead>")',
      'record.indexOf("Writable now</TableHead>")',
       "formatMoney(row.scopeOutstandingMinor, currency)",
       "formatMoney(row.effectiveCapacityMinor, currency)",
      "expect(writableCellIndex).toBeGreaterThan(-1)",
      "expect(scopeCellIndex).toBeLessThan(writableCellIndex)",
    ],
  },
  {
    id: "scope-as-intent-both-scopes-reachable",
    pinFile: "tests/dashboard/donation-allocation-dialog.test.ts",
    anchors: [
      String.raw`/const SCOPE_CHOICES = Object\.keys\(\s*ALLOCATION_SCOPE_INTENT_LABELS\s*\) as AllocationScope\[\](?=\n)/`,
      "expect(dialog.match(SCOPE_OPTION_SITE) ?? []).toHaveLength(2)",
      String.raw`/SCOPE_CHOICES\s*\.\s*(?!map\()\w+/`,
      String.raw`/SCOPE_CHOICES\s*\[/`,
      String.raw`/\[\s*\]\s*\.map\(/`,
      'aria-label="Scope for all selected"',
      "const scopes = Object.keys(ALLOCATION_SCOPE_INTENT_LABELS)",
      'expect(scopes).toEqual(["whole_order", "event_charges"])',
      "expect(scopes[0]).toBe(DEFAULT_ALLOCATION_SCOPE)",
    ],
  },
  {
    id: "attendee-picker-renders-no-money",
    pinFile: "tests/dashboard/donation-allocation-dialog.test.ts",
    anchors: [
      'expect(picker).not.toContain("formatMoney")',
      "expect(picker).not.toMatch(/[A-Za-z]Minor/)",
    ],
  },
  {
    id: "honest-per-target-skip-reasons",
    pinFile: "tests/dashboard/donation-allocation-request.test.ts",
    anchors: [
      "allocationSkipMessage({",
      "Maria: no Event charges balance left — nothing will be allocated.",
      "Tom: no Whole order balance left — nothing will be allocated.",
      "Tom: the donation ran out before this target.",
      'skipReason: "zero_scope_balance"',
      'skipReason: "no_funds_remaining"',
    ],
    additionalPins: [
      {
        pinFile: "tests/finance/donation-allocation.test.ts",
        anchors: [
          'expect(plan.breakdown[1].skipReason).toBe("no_funds_remaining")',
          'expect(cleared.skipReason).toBe("zero_scope_balance")',
        ],
      },
    ],
  },
  {
    id: "equal-split-redistributes-and-reports-remainder",
    pinFile: "tests/finance/donation-allocation.test.ts",
    anchors: [
      "redistributes a capped target's surplus across the remaining targets over multiple rounds",
      "expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([10, 45, 45])",
      "expect(plan.remainderMinor).toBe(1)",
      'expect(plan.remainderRecipientAttendeeIds).toEqual(["t-1"])',
      "expect(plan.breakdown[0].extraMinorUnits).toBe(1)",
    ],
    additionalPins: [
      {
        pinFile: "tests/dashboard/donation-allocation-dialog.test.ts",
        anchors: [
          String.raw`/Rounding remainder:[\s\S]{0,80}formatMoney\(quote\.remainderMinor, currency\)/`,
          'expect(dialog).toContain("Rounding remainder")',
          String.raw`/\+\{row\.extraMinorUnits\}\s*minor unit/`,
        ],
      },
    ],
  },
  {
    id: "tikkie-allocate-enabled-delete-disabled",
    pinFile: "tests/dashboard/donations-workspace.test.ts",
    anchors: [
      'const allocateAction = actionSlice("Allocate")',
      'expect(allocateAction).not.toContain("disabled")',
      String.raw`/disabled=\{deleteDescription !== null\}/`,
      'source === "tikkie"',
    ],
  },
  {
    id: "ddel-01-confirmation-names-amount-and-count",
    pinFile: "tests/dashboard/donation-deletion-copy.test.ts",
    anchors: [
      "buildDonationDeletionConfirmation({",
      'expect(copy).toContain("€125.00")',
      'expect(copy).toContain("2 allocations")',
      'expect(singular).toContain("1 allocation and restores")',
      'expect(zero).not.toContain("0 allocations")',
    ],
    additionalPins: [
      {
        pinFile: "tests/dashboard/donation-deletion-dialog.test.ts",
        anchors: [
          'expect(source).toContain("buildDonationDeletionConfirmation")',
          'expect(source).toContain("allocationCount")',
        ],
      },
    ],
  },
  {
    id: "ddel-02-success-band-reports-the-reversal",
    pinFile: "tests/dashboard/donation-deletion-copy.test.ts",
    anchors: [
      "expect(buildDonationDeletionSuccess({ allocationCount: 0 })).toBe(",
      '"Donation deleted. No allocations were reversed."',
      '"Donation deleted. 1 allocation reversed and attendee balances restored."',
      '"Donation deleted. 2 allocations reversed and attendee balances restored."',
    ],
    additionalPins: [
      {
        pinFile: "tests/dashboard/donations-workspace.test.ts",
        anchors: [
          'expect(workspace).toContain("buildDonationDeletionSuccess")',
          "expect(workspace).toContain('role=\"status\"')",
        ],
      },
      {
        pinFile: "tests/dashboard/donation-detail-surface.test.ts",
        anchors: [
          'expect(surface).toContain("buildDonationDeletionSuccess")',
          'expect(surface).toMatch(/role="status"/)',
        ],
      },
    ],
  },
  {
    id: "orphaned-removal-mutation-wired-d06",
    pinFile: "tests/dashboard/donation-allocation-removal.test.ts",
    anchors: [
      '"api.donations.removeDonationAllocation"',
      "const REMOVAL_DIALOG =",
      "expect(qualified).toEqual([REMOVAL_DIALOG])",
      "expect(bare).toEqual([REMOVAL_DIALOG])",
      "expect(allocateCallers).toEqual([ALLOCATION_DIALOG_PATH])",
      "expect(previewCallers).toEqual([ALLOCATION_DIALOG_PATH])",
      'expect(source).not.toContain("api.donations.allocateDonation")',
    ],
  },
  {
    id: "order-detail-reconciles-with-donation-credit-d07",
    pinFile: "tests/orders/order-detail-reconciliation.test.ts",
    anchors: [
      'expect(surfaceCode).toContain("getOrderAllocationLedger")',
      'expect(surfaceCode).toContain("balances?.paidAmountMinor")',
      'expect(surfaceCode).toContain("allocations={allocationRows}")',
      'expect(panelCode).toContain("allocations: OrderAllocationRow[]")',
      'expect(panelCode).toContain("allocations.map(")',
      '"Donation allocation"',
      'expect(surface).not.toContain("assignPaymentToOrder")',
      'expect(panel).not.toContain("assignPaymentToOrder")',
    ],
    additionalPins: [
      {
        pinFile: "tests/finance/phase59-allocation-money-audit.test.ts",
        anchors: [
          "const LIVE_ORDER_COMPONENTS = [ORDER_DETAIL_SURFACE, ORDERS_SURFACE] as const",
          "case 9 — the live order components derive no paid figure from a payments list",
          "case 10 — no pinned legacy re-export hides an unaudited live component",
          "const REEXPORT_TARGETS: Record<string, string> = {",
          "reduces a payments list — a local payments reduce on the order surface is the D-07 second owner (the defect the re-export pin hid)",
        ],
      },
    ],
  },
  {
    id: "effective-capacity-numeric-boundary-locked",
    pinFile: "convex/donation-allocation-acceptance.handlers.test.ts",
    anchors: [
      "€50.00 fits, €50.01 refuses with the ORDER code",
      "expect(mariaRow.effectiveCapacityMinor).toBe(5_000)",
      "expect(shortRow.amountMinor).toBe(3_000)",
      "expect(shortRow.effectiveCapacityMinor).toBe(5_000)",
      "expect(distributedRow.effectiveCapacityMinor).toBe(5_000)",
    ],
  },
]

describe("the D-05 carry-forward register (comment-stripped pin text)", () => {
  it("is complete: every item names a pin file and at least one code anchor", () => {
    // The count is pinned so the register itself cannot silently shrink.
    expect(D05_ITEMS).toHaveLength(13)
    const ids = D05_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of D05_ITEMS) {
      expect(item.pinFile, `${item.id} must name a pin file`).toBeTruthy()
      expect(
        item.anchors.length,
        `${item.id} must carry at least one anchor`
      ).toBeGreaterThan(0)
      for (const pin of item.additionalPins ?? []) {
        expect(pin.anchors.length).toBeGreaterThan(0)
      }
    }
  })

  for (const item of D05_ITEMS) {
    it(`keeps ${item.id} pinned`, () => {
      const pins: D05Pin[] = [
        { pinFile: item.pinFile, anchors: item.anchors },
        ...(item.additionalPins ?? []),
      ]
      for (const pin of pins) {
        // An ENOENT throws here: a deleted or renamed pin fails the register.
        const source = strippedSource(pin.pinFile)
        for (const anchor of pin.anchors) {
          expect(
            source,
            `${pin.pinFile} no longer carries the anchor: ${anchor}`
          ).toContain(anchor)
        }
      }
    })
  }
})

describe("the allocation editor is the ONLY writer (single-writer invariant)", () => {
  const files = [...walkSourceFiles("app"), ...walkSourceFiles("components")]

  it("walks the whole app/ + components/ tree (non-vacuity)", () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files).toContain(ALLOCATION_DIALOG_PATH)
    expect(files).toContain(DELETE_DIALOG_PATH)
    expect(files).toContain(CHOOSER_PATH)
    expect(files).toContain(WORKSPACE_PATH)
    expect(files).toContain(SURFACE_PATH)
  })

  it("has exactly ONE preview writer and ONE allocate writer — the editor", () => {
    const previewWriters = files.filter((file) =>
      strippedSource(file).includes("api.donations.previewDonationAllocation")
    )
    const allocateWriters = files.filter((file) =>
      strippedSource(file).includes("api.donations.allocateDonation")
    )
    expect(previewWriters).toEqual([ALLOCATION_DIALOG_PATH])
    expect(allocateWriters).toEqual([ALLOCATION_DIALOG_PATH])
  })

  it("has exactly ONE delete writer — the delete dialog", () => {
    const deleteWriters = files.filter((file) =>
      strippedSource(file).includes("api.donationDeletion.deleteDonation")
    )
    expect(deleteWriters).toEqual([DELETE_DIALOG_PATH])
  })

  it("keeps the order chooser a reader, never a writer", () => {
    const chooser = strippedSource(CHOOSER_PATH)
    expect(chooser).toContain("api.donations.getEventDonationIncome")
    expect(chooser).not.toContain("api.donations.allocateDonation")
    expect(chooser).not.toContain("api.donations.previewDonationAllocation")
    expect(chooser).not.toContain("useMutation")
  })
})

describe("cross-host obligations after the move", () => {
  it("both donation hosts report the deletion reversal", () => {
    for (const path of [WORKSPACE_PATH, SURFACE_PATH]) {
      const source = strippedSource(path)
      expect(source, `${path} must report DDEL-02`).toContain(
        "buildDonationDeletionSuccess"
      )
      expect(source, `${path} must announce with role=status`).toContain(
        'role="status"'
      )
    }
  })

  it("the list keeps the relocated allocation-confirmation band", () => {
    // The record panel that used to render this band left the list (61-03);
    // a successful allocation launched from the list must still confirm there.
    const workspace = strippedSource(WORKSPACE_PATH)
    expect(workspace).toContain("allocationSuccess")
    expect(workspace).toContain(
       "formatMoney(allocationSuccess.allocatedTotalMinor, event.currency)"
    )
     expect(workspace).toContain("formatMoney(allocationSuccess.leftoverMinor, event.currency)")
  })

  it("both donation hosts mount both dialogs", () => {
    for (const path of [WORKSPACE_PATH, SURFACE_PATH]) {
      const source = strippedSource(path)
      expect(source).toContain("<DonationAllocationDialog")
      expect(source).toContain("<DonationDeleteDialog")
    }
  })
})

/**
 * Every mount site of the donation panel/dialogs, and the exact count each
 * file must carry. The count is the non-vacuity pin: a scan that silently
 * matched zero mounts cannot go green.
 */
const MOUNT_SITES = [
  { file: WORKSPACE_PATH, tag: "<DonationAllocationDialog", expected: 1 },
  { file: WORKSPACE_PATH, tag: "<DonationDeleteDialog", expected: 1 },
  { file: SURFACE_PATH, tag: "<DonationRecordPanel", expected: 1 },
  { file: SURFACE_PATH, tag: "<DonationAllocationDialog", expected: 1 },
  { file: SURFACE_PATH, tag: "<DonationDeleteDialog", expected: 1 },
  { file: SURFACE_PATH, tag: "<DonationAllocationRemovalDialog", expected: 1 },
  { file: ORDER_SURFACE_PATH, tag: "<DonationAllocationDialog", expected: 1 },
] as const

/** `record-` / `allocation-` / `deletion-` / `removal-` — element namespaces. */
const KEY_NAMESPACE_PATTERN = /key=\{`(?:record|allocation|deletion|removal)-/

/**
 * The bounded window from a mount tag to its key. The key is always the first
 * prop on the next line (well under 100 chars); 200 is comfortably above the
 * observed formatting while staying far short of the next sibling mount (the
 * closest pair is ~600 chars apart), so a window can never borrow a later
 * mount's key.
 */
const MOUNT_KEY_WINDOW = 200

describe("every mount site namespaces its key (the accumulation class)", () => {
  it("has exactly the expected mount sites (non-vacuity)", () => {
    for (const site of MOUNT_SITES) {
      const source = strippedSource(site.file)
      let count = 0
      let from = 0
      while (source.indexOf(site.tag, from) !== -1) {
        count += 1
        from = source.indexOf(site.tag, from) + site.tag.length
      }
      expect(
        count,
        `${site.file} must mount ${site.tag} exactly ${site.expected} time(s)`
      ).toBe(site.expected)
    }
  })

  it("carries a namespaced key at every mount site", () => {
    for (const site of MOUNT_SITES) {
      const source = strippedSource(site.file)
      let from = 0
      let index = source.indexOf(site.tag, from)
      while (index !== -1) {
        const window = source.slice(index, index + MOUNT_KEY_WINDOW)
        expect(
          window,
          `${site.file}: ${site.tag} must keep its element-namespaced key`
        ).toMatch(KEY_NAMESPACE_PATTERN)
        from = index + site.tag.length
        index = source.indexOf(site.tag, from)
      }
    }
  })
})

describe("the four raw key forms from 61-01 never return", () => {
  // The three mount keys and the history-row composite, exactly as 61-01
  // recorded them before the `record-` / `allocation-` / `deletion-` / `:index`
  // namespacing.
  const RAW_KEY_FORMS = [
    "key={selectedRow._id}",
    "key={allocationTarget.donationId}",
    "key={deleteTarget.donationId}",
    "key={`${row.orderId}:${row.attendeeId}`}",
  ] as const

  it("scans the workspace, the detail surface and the record panel", () => {
    for (const file of [WORKSPACE_PATH, SURFACE_PATH, RECORD_PATH]) {
      const source = strippedSource(file)
      for (const raw of RAW_KEY_FORMS) {
        expect(
          source,
          `${file} contains the raw key form ${raw} — the 61-01 collision class`
        ).not.toContain(raw)
      }
    }
  })
})

describe("the delete dialog is never armed with an unknown allocation count", () => {
  const KNOWN_COUNT_HOSTS = [
    {
      path: WORKSPACE_PATH,
      gate: /if \(allocationCount === undefined\) return/,
    },
    {
      path: SURFACE_PATH,
      gate: /allocationCount === undefined[\s\S]{0,60}return <DonationNotFound slug=\{slug\} \/>/,
    },
  ] as const

  for (const host of KNOWN_COUNT_HOSTS) {
    it(`keeps ${host.path} on a known count`, () => {
      const source = strippedSource(host.path)
      // No coercion of the count to zero, anywhere in the host.
      expect(source).not.toMatch(/allocationCount[^\n]*\?\?\s*0/)
      // The host keeps the guard that makes the armed count known.
      expect(source).toMatch(host.gate)

      // The dialog receives the ARMED state value, never the raw tri-state.
      // (The mount is ~680 chars at its widest today; 1200 tolerates prop
      // additions while the lazy match still stops at the mount's own `/>`.)
      const mounts =
        source.match(/<DonationDeleteDialog[\s\S]{0,1200}?\/>/g) ?? []
      expect(mounts).toHaveLength(1)
      for (const mount of mounts) {
        expect(mount).toContain(
          "allocationCount={deleteTarget.allocationCount}"
        )
        expect(mount).not.toMatch(/allocationCount=\{[^}]*\?\?/)
      }
    })
  }
})

describe("no client money arithmetic on the new surfaces", () => {
  // The detail host joins the 59 audit's finance-dir sweep for locality; the
  // chooser and the order surface are the new/rewired surfaces the D-02/D-07
  // work added.
  const SURFACES = [SURFACE_PATH, CHOOSER_PATH, ORDER_SURFACE_PATH] as const

  it("contains no arithmetic idiom over a money figure", () => {
    for (const path of SURFACES) {
      const source = strippedSource(path)
      expect(source, `${path} must not compute`).not.toContain("Math.")
      expect(source, `${path} must not reduce`).not.toContain(".reduce(")
      expect(source, `${path} must not hand-roll currency`).not.toContain(
        ".toFixed("
      )
      expect(source).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
      expect(source).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
    }
  })
})

describe("unpinned render wiring the register depends on (source companions)", () => {
  it("the editor renders each skipped target through allocationSkipMessage", () => {
    // The honest-skip COPY is behaviourally pinned in the request suite. No
    // suite pins the editor's render wiring, so it is closed here directly —
    // a wiring presence pin, not a behavioural substitute.
    const dialog = strippedSource(ALLOCATION_DIALOG_PATH)
    expect(dialog).toContain("allocationSkipMessage({")
    expect(dialog).toContain("skipReason: row.skipReason!")
  })
})
