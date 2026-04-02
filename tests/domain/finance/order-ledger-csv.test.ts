import { describe, expect, it, vi } from "vitest"

// Set env before module evaluation so order-ledger.ts doesn't capture undefined
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})

import { buildOrderLedgerCsv } from "@/lib/domain/finance/order-ledger"
import type { OrderLedgerRow } from "@/lib/domain/finance/order-ledger"

function makeRow(overrides: Partial<OrderLedgerRow> = {}): OrderLedgerRow {
  return {
    providerOrderId: "ord_001",
    providerEventId: "evt_001",
    eventName: "Test Conference",
    normalizedStatus: "paid",
    totalAmountMinor: 5000,
    currency: "EUR",
    orderedAt: "2024-03-01T10:00:00.000Z",
    buyerName: "Ada Lovelace",
    buyerEmail: "ada@example.com",
    ...overrides,
  }
}

describe("buildOrderLedgerCsv", () => {
  it("produces a header row as the first line", () => {
    const csv = buildOrderLedgerCsv([])

    const lines = csv.split("\n").filter(Boolean)
    expect(lines[0]).toBe(
      "providerOrderId,providerEventId,eventName,normalizedStatus,totalAmountMinor,currency,orderedAt,buyerName,buyerEmail"
    )
  })

  it("returns only the header row when given an empty array", () => {
    const csv = buildOrderLedgerCsv([])

    const lines = csv.split("\n").filter(Boolean)
    expect(lines).toHaveLength(1)
  })

  it("serialises a single row with all fields present", () => {
    const row = makeRow()
    const csv = buildOrderLedgerCsv([row])

    const lines = csv.split("\n").filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe(
      "ord_001,evt_001,Test Conference,paid,5000,EUR,2024-03-01T10:00:00.000Z,Ada Lovelace,ada@example.com"
    )
  })

  it("serialises multiple rows correctly", () => {
    const rows = [
      makeRow({ providerOrderId: "ord_001" }),
      makeRow({ providerOrderId: "ord_002", normalizedStatus: "refunded" }),
    ]
    const csv = buildOrderLedgerCsv(rows)

    const lines = csv.split("\n").filter(Boolean)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("ord_001")
    expect(lines[2]).toContain("ord_002")
    expect(lines[2]).toContain("refunded")
  })

  it("wraps cell values containing commas in double-quotes", () => {
    const row = makeRow({ eventName: "Conference, 2024" })
    const csv = buildOrderLedgerCsv([row])

    const dataLine = csv.split("\n")[1]
    expect(dataLine).toContain('"Conference, 2024"')
  })

  it("wraps cell values containing double-quotes and escapes them", () => {
    const row = makeRow({ buyerName: 'She said "hello"' })
    const csv = buildOrderLedgerCsv([row])

    const dataLine = csv.split("\n")[1]
    expect(dataLine).toContain('"She said ""hello"""')
  })

  it("wraps cell values containing newlines in double-quotes", () => {
    const row = makeRow({ eventName: "Line1\nLine2" })
    const csv = buildOrderLedgerCsv([row])

    // The whole CSV will contain the escaped cell; we check the full output rather than
    // splitting on newlines (which would break the quoted cell content)
    expect(csv).toContain('"Line1\nLine2"')
  })

  it("renders null values as empty strings", () => {
    const row = makeRow({ eventName: null, buyerName: null, buyerEmail: null })
    const csv = buildOrderLedgerCsv([row])

    const dataLine = csv.split("\n")[1]
    // eventName is the 3rd column; null → empty string so two consecutive commas
    expect(dataLine).toContain("evt_001,,paid")
  })

  it("ends with a trailing newline", () => {
    const csv = buildOrderLedgerCsv([makeRow()])

    expect(csv.endsWith("\n")).toBe(true)
  })
})
