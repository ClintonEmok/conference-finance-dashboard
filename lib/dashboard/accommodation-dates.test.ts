import { describe, expect, it } from "vitest"

import {
  fromDateInputValue,
  toDateInputValue,
} from "./accommodation-dates"

describe("accommodation stay-date conversion (event timezone)", () => {
  it("formats the calendar date in the event timezone, not the browser's", () => {
    // 00:30 UTC on 2026-06-15 is still June 14 in New York (20:30 EDT).
    expect(
      toDateInputValue(Date.UTC(2026, 5, 15, 0, 30, 0), "UTC")
    ).toBe("2026-06-15")
    expect(
      toDateInputValue(Date.UTC(2026, 5, 15, 0, 30, 0), "America/New_York")
    ).toBe("2026-06-14")
    expect(
      toDateInputValue(Date.UTC(2026, 5, 15, 12, 0, 0), "America/New_York")
    ).toBe("2026-06-15")
    // 23:30 UTC on 2025-12-31 is already 2026-01-01 in Amsterdam (00:30 CET).
    expect(
      toDateInputValue(Date.UTC(2025, 11, 31, 23, 30, 0), "Europe/Amsterdam")
    ).toBe("2026-01-01")
  })

  it("round-trips dates across UTC midnight in several timezones", () => {
    const epochs = [
      Date.UTC(2026, 0, 15, 11, 45, 0),
      Date.UTC(2026, 5, 15, 23, 30, 0),
      Date.UTC(2026, 8, 1, 1, 0, 0),
    ]
    for (const timeZone of [
      "UTC",
      "America/New_York",
      "Europe/Amsterdam",
      "Asia/Tokyo",
    ]) {
      for (const epoch of epochs) {
        const input = toDateInputValue(epoch, timeZone)
        const rebuilt = fromDateInputValue(input, epoch, timeZone)
        expect(toDateInputValue(rebuilt ?? 0, timeZone)).toBe(input)
      }
    }
  })

  it("stays stable across a DST spring-forward boundary", () => {
    // America/New_York springs forward 2026-03-08 02:00 EST -> 03:00 EDT.
    expect(
      toDateInputValue(Date.UTC(2026, 2, 8, 6, 59, 0), "America/New_York")
    ).toBe("2026-03-08")
    expect(
      toDateInputValue(Date.UTC(2026, 2, 8, 7, 0, 0), "America/New_York")
    ).toBe("2026-03-08")
    expect(
      toDateInputValue(Date.UTC(2026, 2, 7, 23, 30, 0), "America/New_York")
    ).toBe("2026-03-07")

    // Europe/Amsterdam springs forward 2026-03-29 02:00 CET -> 03:00 CEST.
    expect(
      toDateInputValue(Date.UTC(2026, 2, 29, 0, 30, 0), "Europe/Amsterdam")
    ).toBe("2026-03-29")
    expect(
      toDateInputValue(Date.UTC(2026, 2, 28, 22, 30, 0), "Europe/Amsterdam")
    ).toBe("2026-03-28")
  })

  it("round-trips a date that falls on a DST transition day", () => {
    const epoch = Date.UTC(2026, 2, 8, 12, 0, 0) // after NY spring-forward
    const input = toDateInputValue(epoch, "America/New_York")
    expect(input).toBe("2026-03-08")
    const rebuilt = fromDateInputValue(input, epoch, "America/New_York")
    expect(toDateInputValue(rebuilt ?? 0, "America/New_York")).toBe(input)
  })

  it("rejects malformed or out-of-range date input values", () => {
    const fallback = Date.UTC(2026, 5, 15, 12, 0, 0)
    expect(fromDateInputValue("not-a-date", fallback, "UTC")).toBeNull()
    expect(fromDateInputValue("2026-6-5x", fallback, "UTC")).toBeNull()
    expect(fromDateInputValue("2026-13-01", fallback, "UTC")).toBeNull()
    expect(fromDateInputValue("2026-02-30", fallback, "UTC")).toBeNull()
  })

  it("falls back to UTC for an invalid stored timezone", () => {
    expect(toDateInputValue(Date.UTC(2026, 5, 15, 12, 0, 0), "")).toBe(
      "2026-06-15"
    )
    const fallback = Date.UTC(2026, 5, 15, 12, 0, 0)
    expect(
      fromDateInputValue("2026-06-15", fallback, "Not/AZone")
    ).not.toBeNull()
  })
})
