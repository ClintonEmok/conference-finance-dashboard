/**
 * Phase 57 plan 02 — the pure deletion refusal matrix and the frozen result.
 *
 * This suite exists to catch three regressions:
 *   1. a refusal class losing its code or becoming indistinguishable from a
 *      sibling — case 4 pins that a Tikkie row never reports the generic guard
 *      code, and case 7 pins the eight-code block and the export surface;
 *   2. a re-ordered predicate silently changing which code a row that violates
 *      several rules reports — the order-pinning cases (6) fail if the source
 *      guard moves ahead of the standalone / cross-event predicates;
 *   3. a frozen result drifting from Phase 55's arithmetic or from the
 *      ledger's serialization shape — the identity is asserted on every case,
 *      the degenerate over-recorded input catches a local `amount − Σ`, and
 *      case 10 catches a `{ ...row }` spread carrying live-row properties into
 *      the snapshot.
 *
 * No Convex and no mocks: the classifier is pure precisely so every refusal
 * class is provable here rather than behind a handler. All figures are exact
 * integer minor units (the house convention).
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import * as donationDeletion from "../../lib/domain/finance/donation-deletion"
import {
  DONATION_DELETE_ERROR_CODES,
  buildDonationDeletionResult,
  classifyDonationDeletability,
  throwDonationDeletionError,
  type DonationDeletionResultRow,
  type DonationDeletabilityPayment,
} from "../../lib/domain/finance/donation-deletion"
import {
  deriveAllocationRemainingMinor,
  sumRecordedAllocationMinor,
} from "../../lib/domain/finance/donation-allocation"

const EVENT_ID = "events_e1"

/** The otherwise-deletable shape every refusal case overrides. */
const deletablePayment = {
  donationKind: "standalone" as const,
  orderId: undefined,
  status: "donation" as const,
  eventId: EVENT_ID,
  source: "cash",
}

function row(
  attendeeId: string,
  orderId: string,
  amountMinor: number,
  scope: DonationDeletionResultRow["scope"]
): DonationDeletionResultRow {
  return { attendeeId, orderId, amountMinor, scope }
}

/** Classifies and narrows to the refusal arm; throws if it was deletable. */
function refusalFor(
  payment: DonationDeletabilityPayment,
  eventId: string = EVENT_ID
): { deletable: false; code: string; detail: string } {
  const verdict = classifyDonationDeletability(payment, { eventId })
  if (verdict.deletable) {
    throw new Error(
      "expected a refusal but the donation classified as deletable"
    )
  }
  return verdict
}

/** One representative per DDEL-03 refusal class. */
const REFUSAL_CLASS_CASES: Array<[string, DonationDeletabilityPayment]> = [
  [
    "non-standalone",
    {
      ...deletablePayment,
      donationKind: "overpayment",
      orderId: "order_provider_alias_1",
    },
  ],
  ["cross-event", { ...deletablePayment, eventId: "events_other" }],
  ["tikkie-sourced", { ...deletablePayment, source: "tikkie" }],
  ["generic source guard", { ...deletablePayment, source: "card" }],
]

describe("classifyDonationDeletability", () => {
  // Plan case 1 — the deletable class.
  it("accepts a cash or bank_transfer standalone donation for the matching event", () => {
    expect(
      classifyDonationDeletability(deletablePayment, { eventId: EVENT_ID })
    ).toEqual({ deletable: true })
    expect(
      classifyDonationDeletability(
        { ...deletablePayment, source: "bank_transfer" },
        { eventId: EVENT_ID }
      )
    ).toEqual({ deletable: true })
  })

  // Plan case 2 — every non-standalone shape.
  const nonStandaloneCases: Array<[string, DonationDeletabilityPayment]> = [
    [
      "an overpayment carrying an order link",
      {
        ...deletablePayment,
        donationKind: "overpayment",
        orderId: "order_provider_alias_1",
      },
    ],
    [
      "a standalone-kind row whose status is not donation",
      { ...deletablePayment, status: "unassigned" },
    ],
    ["an ambiguous row", { ...deletablePayment, status: "ambiguous" }],
    [
      "a donation-shaped row carrying an order alias string",
      { ...deletablePayment, orderId: "order_alias_42" },
    ],
    [
      "a never-classified row",
      { ...deletablePayment, donationKind: undefined },
    ],
  ]

  it("refuses every non-standalone shape with DONATION_DELETE_NOT_STANDALONE", () => {
    for (const [name, payment] of nonStandaloneCases) {
      const refusal = refusalFor(payment)
      expect(refusal.code, name).toBe(
        DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_STANDALONE
      )
      expect(refusal.detail.length, name).toBeGreaterThan(0)
    }
  })

  // Plan case 3 — cross-event, including the eventless row.
  const crossEventCases: Array<[string, DonationDeletabilityPayment]> = [
    [
      "another event's donation",
      { ...deletablePayment, eventId: "events_other" },
    ],
    ["an eventless donation", { ...deletablePayment, eventId: undefined }],
  ]

  it("refuses a cross-event or eventless donation with DONATION_DELETE_CROSS_EVENT", () => {
    for (const [name, payment] of crossEventCases) {
      const refusal = refusalFor(payment)
      expect(refusal.code, name).toBe(
        DONATION_DELETE_ERROR_CODES.DONATION_DELETE_CROSS_EVENT
      )
      expect(refusal.detail.length, name).toBeGreaterThan(0)
    }
  })

  // Plan case 4 — Tikkie has its OWN code, never the generic guard's.
  it("refuses a Tikkie-sourced donation with its own code, never the generic guard", () => {
    const refusal = refusalFor({ ...deletablePayment, source: "tikkie" })

    expect(refusal.code).toBe(
      DONATION_DELETE_ERROR_CODES.DONATION_DELETE_TIKKIE_SOURCED
    )
    expect(refusal.code).not.toBe(
      DONATION_DELETE_ERROR_CODES.DONATION_DELETE_PAYMENT_GUARD
    )
    expect(refusal.detail.length).toBeGreaterThan(0)
  })

  // Plan case 5 — a fourth source is refused by default, not silently deletable.
  it("refuses a source outside the live union with the fail-closed guard", () => {
    const refusal = refusalFor({ ...deletablePayment, source: "card" })

    expect(refusal.code).toBe(
      DONATION_DELETE_ERROR_CODES.DONATION_DELETE_PAYMENT_GUARD
    )
    expect(refusal.detail.length).toBeGreaterThan(0)
  })

  // Plan case 6 — the fixed predicate order. These fail if the source check
  // moves ahead of the standalone or cross-event predicates.
  it("pins the predicate order: standalone, then cross-event, then source", () => {
    expect(
      refusalFor({
        ...deletablePayment,
        source: "tikkie",
        donationKind: "overpayment",
        orderId: "order_alias_1",
      }).code
    ).toBe(DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_STANDALONE)
    expect(
      refusalFor({
        ...deletablePayment,
        source: "tikkie",
        status: "unassigned",
      }).code
    ).toBe(DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_STANDALONE)
    expect(
      refusalFor({
        ...deletablePayment,
        source: "tikkie",
        eventId: "events_other",
      }).code
    ).toBe(DONATION_DELETE_ERROR_CODES.DONATION_DELETE_CROSS_EVENT)
    expect(
      refusalFor({
        ...deletablePayment,
        source: "card",
        eventId: "events_other",
      }).code
    ).toBe(DONATION_DELETE_ERROR_CODES.DONATION_DELETE_CROSS_EVENT)
  })

  // The distinct-code requirement: the four classes discriminate without
  // parsing message text.
  it("carries four distinct refusal codes", () => {
    const refusalCodes = new Set(
      REFUSAL_CLASS_CASES.map(([, payment]) => refusalFor(payment).code)
    )

    expect(refusalCodes.size).toBe(4)
    expect([...refusalCodes].sort()).toEqual([
      "DONATION_DELETE_CROSS_EVENT",
      "DONATION_DELETE_NOT_STANDALONE",
      "DONATION_DELETE_PAYMENT_GUARD",
      "DONATION_DELETE_TIKKIE_SOURCED",
    ])
  })
})

describe("DONATION_DELETE_ERROR_CODES", () => {
  // Plan case 7 — the code block, the thrower and the export surface.
  it("keeps every key equal to its string literal", () => {
    const entries = Object.entries(DONATION_DELETE_ERROR_CODES)

    expect(entries.length).toBe(8)
    for (const [key, value] of entries) {
      expect(value, key).toBe(key)
    }
    expect(new Set(entries.map(([, value]) => value)).size).toBe(8)
  })

  it("throws with the code as an assertable message prefix", () => {
    for (const code of Object.values(DONATION_DELETE_ERROR_CODES)) {
      let message = ""
      try {
        throwDonationDeletionError(code, "why it was refused")
      } catch (error) {
        // The thrown value is an `Error`, so `String(error)` would yield
        // "Error" — the code prefix lives on `.message`, which is why the
        // split is taken from the Error's message (repo `rejectionCode`
        // convention, `convex/donation-allocation.handlers.test.ts:3091`).
        message = (error as Error).message
      }

      expect(message.split(":")[0]).toBe(code)
      expect(message).toBe(`${code}: why it was refused`)
    }

    let bareMessage = ""
    try {
      throwDonationDeletionError(
        DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_FOUND
      )
    } catch (error) {
      bareMessage = (error as Error).message
    }

    expect(bareMessage).toBe("DONATION_DELETE_NOT_FOUND")
  })

  it("exposes exactly the four sanctioned runtime exports", () => {
    expect(Object.keys(donationDeletion).sort()).toEqual([
      "DONATION_DELETE_ERROR_CODES",
      "buildDonationDeletionResult",
      "classifyDonationDeletability",
      "throwDonationDeletionError",
    ])
  })
})

describe("buildDonationDeletionResult", () => {
  type FrozenCase = {
    name: string
    donationAmountMinor: number
    rows: DonationDeletionResultRow[]
    expectedReversedMinor: number
    expectedRemainingMinor: number
  }

  const zeroRows: FrozenCase = {
    name: "a zero-allocation donation reverses nothing",
    donationAmountMinor: 7_500,
    rows: [],
    expectedReversedMinor: 0,
    expectedRemainingMinor: 7_500,
  }

  const partialRows: FrozenCase = {
    name: "a partially allocated donation splits into reversed and remainder",
    donationAmountMinor: 25_000,
    rows: [row("orderAttendees_a", "orders_1", 10_000, "event_charges")],
    expectedReversedMinor: 10_000,
    expectedRemainingMinor: 15_000,
  }

  const fullRows: FrozenCase = {
    name: "a fully allocated donation leaves a zero remainder",
    donationAmountMinor: 10_000,
    rows: [
      row("orderAttendees_a", "orders_1", 6_000, "event_charges"),
      row("orderAttendees_b", "orders_1", 4_000, "whole_order"),
    ],
    expectedReversedMinor: 10_000,
    expectedRemainingMinor: 0,
  }

  const frozenCases: FrozenCase[] = [zeroRows, partialRows, fullRows]

  function freeze(testCase: FrozenCase) {
    return buildDonationDeletionResult({
      donationId: "payments_d1",
      donationAmountMinor: testCase.donationAmountMinor,
      rows: testCase.rows,
    })
  }

  // Plan case 8 — exactness on zero, partial and full allocations.
  it("freezes zero, partial and fully allocated donations exactly", () => {
    for (const testCase of frozenCases) {
      const result = freeze(testCase)

      expect(result.deleted, testCase.name).toBe(true)
      expect(result.donationId, testCase.name).toBe("payments_d1")
      expect(result.donationAmountMinor, testCase.name).toBe(
        testCase.donationAmountMinor
      )
      expect(result.reversedAllocationMinor, testCase.name).toBe(
        testCase.expectedReversedMinor
      )
      expect(result.remainingMinor, testCase.name).toBe(
        testCase.expectedRemainingMinor
      )
      expect(result.allocationCount, testCase.name).toBe(testCase.rows.length)
      expect(result.rows, testCase.name).toEqual(testCase.rows)

      // THE identity, exact integers, on EVERY writer-valid case: each minor
      // unit is on exactly one side of the reversal.
      expect(
        result.reversedAllocationMinor + result.remainingMinor,
        testCase.name
      ).toBe(testCase.donationAmountMinor)
    }

    expect(freeze(zeroRows).rows).toEqual([])
    expect(freeze(fullRows).remainingMinor).toBe(0)
  })

  // Plan case 9 — the Phase 55 owners, not a local reimplementation.
  it("cross-checks the frozen figures against the Phase 55 owners", () => {
    for (const testCase of frozenCases) {
      const result = freeze(testCase)
      const phase55 = deriveAllocationRemainingMinor({
        donationAmountMinor: testCase.donationAmountMinor,
        recordedRows: testCase.rows,
      })

      expect(result.remainingMinor, testCase.name).toBe(phase55.remainingMinor)
      expect(result.donationAmountMinor, testCase.name).toBe(
        phase55.donationAmountMinor
      )
      expect(result.reversedAllocationMinor, testCase.name).toBe(
        sumRecordedAllocationMinor(testCase.rows)
      )
    }

    // Discriminator: an over-recorded input (writer-unreachable, D-13/D-16)
    // must clamp at zero exactly as the Phase 55 owner does — a local
    // `amount − Σ` would report −400 here and fail.
    const degenerate = buildDonationDeletionResult({
      donationId: "payments_over",
      donationAmountMinor: 100,
      rows: [row("orderAttendees_a", "orders_1", 500, "event_charges")],
    })

    expect(degenerate.reversedAllocationMinor).toBe(500)
    expect(degenerate.remainingMinor).toBe(0)
    expect(
      deriveAllocationRemainingMinor({
        donationAmountMinor: 100,
        recordedRows: [{ amountMinor: 500 }],
      }).remainingMinor
    ).toBe(0)

    // The delegation is in the source too, so a future rewrite cannot quietly
    // swap the owner for local arithmetic that happens to agree on the cases.
    const source = readFileSync(
      resolve(process.cwd(), "lib/domain/finance/donation-deletion.ts"),
      "utf8"
    )

    expect(source).toContain("deriveAllocationRemainingMinor(")
    expect(source).toContain("sumRecordedAllocationMinor(")
    expect(source).not.toContain("donationAmountMinor -")
  })

  // Plan case 10 — order preservation and the four-field projection.
  it("preserves input order and projects exactly the four ledger fields", () => {
    // A WIDER object, exactly as 57-03 passes a `Doc<"donationAllocations">`
    // row: a variable, so TypeScript's excess-property check does not reject
    // it and only the builder's projection keeps the snapshot clean.
    const widerRow = {
      attendeeId: "orderAttendees_alpha",
      orderId: "orders_2",
      amountMinor: 2_500,
      scope: "whole_order" as const,
      donationId: "payments_d1",
      _id: "donationAllocations_row_2",
      _creationTime: 1_700_000_000_000,
    }

    expect(Object.keys(widerRow)).toEqual(
      expect.arrayContaining(["_id", "_creationTime", "donationId"])
    )

    // Deliberately NOT sorted by attendeeId: zeta arrives before alpha.
    const rows: DonationDeletionResultRow[] = [
      row("orderAttendees_zeta", "orders_1", 1_000, "event_charges"),
      widerRow,
    ]

    const result = buildDonationDeletionResult({
      donationId: "payments_d1",
      donationAmountMinor: 5_000,
      rows,
    })

    expect(result.rows.map((entry) => entry.attendeeId)).toEqual([
      "orderAttendees_zeta",
      "orderAttendees_alpha",
    ])

    for (const frozen of result.rows) {
      expect(Object.keys(frozen).sort()).toEqual([
        "amountMinor",
        "attendeeId",
        "orderId",
        "scope",
      ])
    }

    expect(result.rows[1]).toEqual({
      attendeeId: "orderAttendees_alpha",
      orderId: "orders_2",
      amountMinor: 2_500,
      scope: "whole_order",
    })
    // Projected, never spread or returned by reference.
    expect(result.rows[1]).not.toBe(widerRow)
    expect(result.rows).not.toBe(rows)
    expect(result.reversedAllocationMinor).toBe(3_500)
    expect(result.remainingMinor).toBe(1_500)
  })
})
