import { describe, expect, test } from "vitest"

import {
  resolveTicketPriceSnapshot,
  type TicketPriceConfig,
} from "@/lib/domain/finance/ticket-pricing"
import {
  epochToEventLocalDateTime,
  eventLocalDateTimeToEpoch,
} from "@/lib/time/event-timezone"

const CUTOFF = Date.UTC(2026, 5, 1, 12, 0, 0)

describe("resolveTicketPriceSnapshot", () => {
  test("keeps the base price before the effective instant", () => {
    const snapshot = resolveTicketPriceSnapshot(
      {
        priceMinor: 2_000,
        lateSurchargeMinor: 350,
        lateSurchargeEffectiveAt: CUTOFF,
      },
      CUTOFF - 1
    )

    expect(snapshot).toEqual({
      basePriceMinor: 2_000,
      surchargeMinor: 0,
      unitPriceMinor: 2_000,
      pricedAt: CUTOFF - 1,
    })
  })

  test("applies the surcharge exactly at and after the cutoff", () => {
    const config: TicketPriceConfig = {
      priceMinor: 2_000,
      lateSurchargeMinor: 350,
      lateSurchargeEffectiveAt: CUTOFF,
    }

    expect(resolveTicketPriceSnapshot(config, CUTOFF)).toEqual({
      basePriceMinor: 2_000,
      surchargeMinor: 350,
      unitPriceMinor: 2_350,
      pricedAt: CUTOFF,
      lateSurchargeEffectiveAt: CUTOFF,
    })
    expect(resolveTicketPriceSnapshot(config, CUTOFF + 60_000).unitPriceMinor).toBe(
      2_350
    )
  })

  test("resolves each ticket independently and multiplies integer minor units", () => {
    const standard = resolveTicketPriceSnapshot(
      {
        priceMinor: 1_000,
        lateSurchargeMinor: 100,
        lateSurchargeEffectiveAt: CUTOFF,
      },
      CUTOFF
    )
    const premium = resolveTicketPriceSnapshot(
      {
        priceMinor: 1_500,
        lateSurchargeMinor: 450,
        lateSurchargeEffectiveAt: CUTOFF,
      },
      CUTOFF
    )

    expect(standard.unitPriceMinor * 3).toBe(3_300)
    expect(premium.unitPriceMinor * 2).toBe(3_900)
    expect(standard).not.toEqual(premium)
  })

  test("treats zero and malformed persisted configuration as no surcharge", () => {
    expect(
      resolveTicketPriceSnapshot(
        {
          priceMinor: 2_000,
          lateSurchargeMinor: 0,
          lateSurchargeEffectiveAt: CUTOFF,
        },
        CUTOFF + 1
      )
    ).toMatchObject({
      basePriceMinor: 2_000,
      surchargeMinor: 0,
      unitPriceMinor: 2_000,
    })

    expect(
      resolveTicketPriceSnapshot(
        {
          priceMinor: -5.9,
          lateSurchargeMinor: Number.NaN,
          lateSurchargeEffectiveAt: Number.NaN,
        },
        CUTOFF
      )
    ).toEqual({
      basePriceMinor: 0,
      surchargeMinor: 0,
      unitPriceMinor: 0,
      pricedAt: CUTOFF,
    })
  })
})

describe("event timezone datetime-local conversion", () => {
  test("converts and formats wall-clock values without using the host timezone", () => {
    const epoch = eventLocalDateTimeToEpoch(
      "2026-01-15T09:30",
      "Europe/Amsterdam"
    )

    expect(epoch).toBe(Date.UTC(2026, 0, 15, 8, 30))
    expect(epochToEventLocalDateTime(epoch!, "Europe/Amsterdam")).toBe(
      "2026-01-15T09:30"
    )
  })

  test("handles DST offsets and rejects an impossible spring-forward time", () => {
    expect(
      eventLocalDateTimeToEpoch("2026-03-29T01:30", "Europe/Amsterdam")
    ).toBe(Date.UTC(2026, 2, 29, 0, 30))
    expect(
      eventLocalDateTimeToEpoch("2026-03-29T03:30", "Europe/Amsterdam")
    ).toBe(Date.UTC(2026, 2, 29, 1, 30))
    expect(
      eventLocalDateTimeToEpoch("2026-03-29T02:30", "Europe/Amsterdam")
    ).toBeNull()
  })

  test("rejects malformed dates and invalid event timezones", () => {
    expect(
      eventLocalDateTimeToEpoch("2026-02-30T10:00", "Europe/Amsterdam")
    ).toBeNull()
    expect(
      eventLocalDateTimeToEpoch("not-a-date", "Europe/Amsterdam")
    ).toBeNull()
    expect(
      eventLocalDateTimeToEpoch("2026-01-15T10:00", "Not/AZone")
    ).toBeNull()
    expect(epochToEventLocalDateTime(Number.NaN, "UTC")).toBeNull()
  })
})
