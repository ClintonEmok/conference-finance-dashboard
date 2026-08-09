import { describe, expect, it } from "vitest"

import {
  buildAccommodationAttentionItems,
  buildFinanceAttentionItems,
  type AttentionQueryState,
} from "@/lib/dashboard/workspace-attention"

const links = {
  reconciliation: "/events/demo/finance?tab=reconciliation",
  payments: "/events/demo/finance?tab=payments",
}

function ready<T>(data: T): AttentionQueryState<T> {
  return { status: "ready", data }
}

describe("workspace attention derivation", () => {
  it("keeps finance pending and error states explicit", () => {
    expect(
      buildFinanceAttentionItems(
        {
          reconciliation: { status: "pending" },
          unassignedPayments: ready([]),
        },
        links
      )
    ).toMatchObject({ status: "pending", items: [] })

    expect(
      buildFinanceAttentionItems(
        {
          reconciliation: { status: "error", message: "Reconciliation failed" },
          unassignedPayments: ready([]),
        },
        links
      )
    ).toMatchObject({ status: "error", message: "Reconciliation failed", items: [] })
  })

  it("counts only positive canonical outstanding balances", () => {
    const result = buildFinanceAttentionItems(
      {
        reconciliation: ready([
          { outstandingAmountMinor: 1250 },
          { outstandingAmountMinor: 0 },
          { outstandingAmountMinor: -100 },
        ]),
        unassignedPayments: ready([{}, {}]),
      },
      links
    )

    expect(result.status).toBe("ready")
    expect(result.items).toEqual([
      expect.objectContaining({ id: "reconciliation", count: 1 }),
      expect.objectContaining({ id: "payments", count: 2, label: "Global unmatched payments" }),
    ])
  })

  it("returns an honest ready empty state for finance", () => {
    expect(
      buildFinanceAttentionItems(
        {
          reconciliation: ready([]),
          unassignedPayments: ready([]),
        },
        links
      )
    ).toEqual({ status: "ready", items: [] })
  })

  it("keeps accommodation pending and error states explicit", () => {
    const board = { hotels: [], rooms: [], summary: { unassignedAttendeesCount: 0 } }

    expect(
      buildAccommodationAttentionItems(
        { enabled: true, board: { status: "pending" } },
        { allocation: "/allocation", hotels: "/hotels" }
      )
    ).toMatchObject({ status: "pending", items: [] })

    expect(
      buildAccommodationAttentionItems(
        { enabled: true, board: { status: "error", message: "Board failed" } },
        { allocation: "/allocation", hotels: "/hotels" }
      )
    ).toMatchObject({ status: "error", message: "Board failed", items: [] })

    expect(
      buildAccommodationAttentionItems(
        { enabled: false, board: ready(board) },
        { allocation: "/allocation", hotels: "/hotels" }
      )
    ).toEqual({ status: "ready", items: [] })
  })

  it("shows no allocation attention on the Upgrades & Options tab", () => {
    // The upgrades-options read-plan mode never mounts the board query, so
    // the attention summary must be an honest empty ready state rather than
    // a board pending/error state unrelated to configuration.
    expect(
      buildAccommodationAttentionItems(
        {
          enabled: true,
          board: { status: "error", message: "Board failed" },
          mode: "upgrades-options",
        },
        { allocation: "/allocation", hotels: "/hotels" }
      )
    ).toEqual({ status: "ready", items: [] })
  })

  it("reports setup and placement exceptions from the board payload", () => {
    const result = buildAccommodationAttentionItems(
      {
        enabled: true,
        board: ready({
          hotels: [{ id: "hotel-1" }],
          rooms: [{ id: "room-1" }],
          summary: { unassignedAttendeesCount: 3 },
        }),
      },
      { allocation: "/allocation", hotels: "/hotels" }
    )

    expect(result.items).toEqual([
      expect.objectContaining({ id: "allocation", count: 3 }),
    ])
  })

  it("reports setup when hotels or usable room inventory is absent", () => {
    const result = buildAccommodationAttentionItems(
      {
        enabled: true,
        board: ready({ hotels: [], rooms: [], summary: { unassignedAttendeesCount: 0 } }),
      },
      { allocation: "/allocation", hotels: "/hotels" }
    )

    expect(result.items).toEqual([
      expect.objectContaining({ id: "hotels", count: 1 }),
    ])
  })

  it("returns no unresolved exceptions for usable inventory with no waiting attendees", () => {
    expect(
      buildAccommodationAttentionItems(
        {
          enabled: true,
          board: ready({
            hotels: [{ id: "hotel-1" }],
            rooms: [{ id: "room-1" }],
            summary: { unassignedAttendeesCount: 0 },
          }),
        },
        { allocation: "/allocation", hotels: "/hotels" }
      )
    ).toEqual({ status: "ready", items: [] })
  })
})
