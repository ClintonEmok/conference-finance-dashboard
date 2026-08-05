import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
  return {}
})

import {
  buildStakeholderReport,
} from "@/lib/domain/finance/stakeholder-report"
import {
  createOrReuseReportShareForEvent,
  lookupReportShareByToken,
  revokeReportShareByToken,
} from "@/convex/reportShares"

function makeShareDoc(overrides: Partial<{ revokedAt: number | undefined }> = {}) {
  return {
    _id: "share_1",
    _creationTime: 1,
    eventId: "event_1",
    token: "report_token_1",
    createdAt: 1000,
    revokedAt: undefined,
    createdByUserId: "user_1",
    ...overrides,
  } as const
}

function makeCtx(options: {
  tokenShare?: ReturnType<typeof makeShareDoc> | null
  eventShares?: Array<ReturnType<typeof makeShareDoc>>
}) {
  const state = {
    tokenShare: options.tokenShare ?? null,
    eventShares: options.eventShares ?? [],
  }

  const insert = vi.fn(async (_table: string, value: Record<string, unknown>) => {
    const created = {
      _id: `share_${state.eventShares.length + 2}`,
      _creationTime: 2,
      eventId: value.eventId,
      token: value.token,
      createdAt: value.createdAt,
      createdByUserId: value.createdByUserId,
    }
    state.eventShares = [created as ReturnType<typeof makeShareDoc>, ...state.eventShares]
    state.tokenShare = created as ReturnType<typeof makeShareDoc>
    return created._id
  })

  const patch = vi.fn(async (_id: string, value: Record<string, unknown>) => {
    if (state.tokenShare) {
      Object.assign(state.tokenShare, value)
    }
  })

  const query = vi.fn((_table: string) => ({
    withIndex(indexName: string) {
      if (indexName === "token") {
        return {
          first: async () => state.tokenShare,
          take: async () => (state.tokenShare ? [state.tokenShare] : []),
        }
      }

      if (indexName === "by_eventId") {
        return {
          take: async () => state.eventShares,
          first: async () => state.eventShares[0] ?? null,
        }
      }

      throw new Error(`Unexpected index ${indexName}`)
    },
  }))

  return {
    auth: {
      getUserIdentity: vi.fn(async () => ({ tokenIdentifier: "user_1" })),
    },
    db: {
      query,
      insert,
      patch,
      get: vi.fn(async () => null),
    },
  }
}

describe("shareable reporting link", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds aggregate slices without exposing raw rows", () => {
    const report = buildStakeholderReport({
      generatedAt: "2026-04-25T17:00:00.000Z",
      event: {
        id: "event_1",
        slug: "conference-2026",
        title: "Conference 2026",
        startsAt: 1745606400000,
        currency: "EUR",
      },
      rows: [
        {
          location: "Nairobi",
          genderType: "MALE",
          ticketTypeLabel: "Standard",
          amountDueMinor: 2000,
          paidAmountMinor: 2000,
          createdAt: "2026-04-24T10:00:00.000Z",
        },
        {
          location: "Nairobi",
          genderType: "FEMALE",
          ticketTypeLabel: "VIP",
          amountDueMinor: 1000,
          paidAmountMinor: 500,
          createdAt: "2026-04-25T11:00:00.000Z",
        },
        {
          location: null,
          genderType: null,
          ticketTypeLabel: null,
          amountDueMinor: 500,
          paidAmountMinor: 750,
          createdAt: "2026-04-25T12:00:00.000Z",
        },
      ],
    })

    expect(report.totals).toEqual({
      rows: 3,
      amountDueMinor: 3500,
      paidMinor: 3000,
      outstandingMinor: 500,
      overpaidMinor: 250,
    })
    expect(report.slices.byLocation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Nairobi", count: 2, amountDueMinor: 3000 }),
        expect.objectContaining({ label: "Unknown location", count: 1, amountDueMinor: 500 }),
      ])
    )
    expect(report.slices.byGender).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Male", count: 1 }),
        expect.objectContaining({ label: "Female", count: 1 }),
        expect.objectContaining({ label: "Unspecified", count: 1 }),
      ])
    )
    expect(report.slices.byTicketType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Standard", count: 1 }),
        expect.objectContaining({ label: "VIP", count: 1 }),
        expect.objectContaining({ label: "Unspecified ticket", count: 1 }),
      ])
    )
    expect(report.slices.byBalanceState).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "settled", count: 1 }),
        expect.objectContaining({ state: "outstanding", count: 1 }),
        expect.objectContaining({ state: "overpaid", count: 1 }),
      ])
    )

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain("Alice")
    expect(serialized).not.toContain("ORD-")
  })

  it("fails closed for revoked tokens", async () => {
    const revokedShare = makeShareDoc({ revokedAt: 1745606400000 })
    const ctx = makeCtx({ tokenShare: revokedShare, eventShares: [revokedShare] })

    await expect(
      lookupReportShareByToken(ctx as never, revokedShare.token)
    ).resolves.toBeNull()
  })

  it("reuses an active share instead of minting a new token", async () => {
    const activeShare = makeShareDoc()
    const ctx = makeCtx({ tokenShare: activeShare, eventShares: [activeShare] })

    const result = await createOrReuseReportShareForEvent(
      ctx as never,
      activeShare.eventId as never
    )

    expect(result).toMatchObject({
      eventId: activeShare.eventId,
      token: activeShare.token,
      path: "/reports/report_token_1",
      reused: true,
    })
    expect(ctx.db.insert).not.toHaveBeenCalled()
  })

  it("revokes a token and prevents future lookups", async () => {
    const activeShare = makeShareDoc()
    const ctx = makeCtx({ tokenShare: activeShare, eventShares: [activeShare] })

    await expect(revokeReportShareByToken(ctx as never, activeShare.token)).resolves.toBe(true)
    await expect(lookupReportShareByToken(ctx as never, activeShare.token)).resolves.toBeNull()
    expect(ctx.db.patch).toHaveBeenCalled()
  })
})
