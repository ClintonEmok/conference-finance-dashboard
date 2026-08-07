import { describe, expect, it, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import LegacyManagePage from "@/app/manage/page"
import LegacyManagePermalinkPage from "@/app/manage/[bookingRef]/page"
import LegacyTrackPaymentPage from "@/app/track-payment/page"
import LegacyTrackPaymentPermalinkPage from "@/app/track-payment/[bookingRef]/page"

/**
 * Route-level regression coverage for the manage-booking repoint (quick task
 * 260807-ka4). The canonical buyer-facing surface lives under `/booking`:
 * `/booking` is the search entry and `/booking/[bookingRef]/manage` is the
 * durable permalink. Both legacy families (`/manage` and `/track-payment`)
 * must redirect to the corresponding `/booking` targets while forwarding the
 * complete incoming query string, and the canonical wrappers must normalize
 * the reference, forward the edit token, and never introduce search markup.
 *
 * Next's `redirect` boundary is mocked so no Next server is required: the
 * page functions are invoked directly with promise-shaped params/searchParams
 * exactly as the App Router would provide them.
 */

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("legacy /manage page redirects", () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it("redirects the legacy root to /booking preserving the full query string", async () => {
    await LegacyManagePage({
      searchParams: Promise.resolve({ token: "abc123", utm_source: "email" }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/booking?token=abc123&utm_source=email"
    )
  })

  it("redirects the legacy root to /booking without a query when none is present", async () => {
    await LegacyManagePage({ searchParams: Promise.resolve({}) })
    expect(mocks.redirect).toHaveBeenCalledWith("/booking")
  })

  it("redirects a legacy permalink to /booking/[normalizedRef]/manage preserving the query string", async () => {
    await LegacyManagePermalinkPage({
      params: Promise.resolve({ bookingRef: "  bk-20260806-test01  " }),
      searchParams: Promise.resolve({ token: "abc123", extra: "1" }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/booking/BK-20260806-TEST01/manage?token=abc123&extra=1"
    )
  })

  it("redirects a legacy permalink with only a booking reference (no query)", async () => {
    await LegacyManagePermalinkPage({
      params: Promise.resolve({ bookingRef: "BK-20260806-TEST01" }),
      searchParams: Promise.resolve({}),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/booking/BK-20260806-TEST01/manage"
    )
  })
})

describe("legacy /track-payment page redirects", () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it("redirects the legacy root to /booking preserving the full query string", async () => {
    await LegacyTrackPaymentPage({
      searchParams: Promise.resolve({ token: "abc123", utm_source: "email" }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/booking?token=abc123&utm_source=email"
    )
  })

  it("redirects the legacy root to /booking without a query when none is present", async () => {
    await LegacyTrackPaymentPage({ searchParams: Promise.resolve({}) })
    expect(mocks.redirect).toHaveBeenCalledWith("/booking")
  })

  it("redirects a legacy permalink to /booking/[normalizedRef]/manage preserving the query string", async () => {
    await LegacyTrackPaymentPermalinkPage({
      params: Promise.resolve({ bookingRef: "  bk-20260806-test01  " }),
      searchParams: Promise.resolve({ token: "abc123", extra: "1" }),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/booking/BK-20260806-TEST01/manage?token=abc123&extra=1"
    )
  })

  it("redirects a legacy permalink with only a booking reference (no query)", async () => {
    await LegacyTrackPaymentPermalinkPage({
      params: Promise.resolve({ bookingRef: "BK-20260806-TEST01" }),
      searchParams: Promise.resolve({}),
    })
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/booking/BK-20260806-TEST01/manage"
    )
  })
})

describe("canonical /booking wrappers", () => {
  it("root search wrapper is a thin shared-view shell with no search markup", () => {
    const root = readSource("app/booking/page.tsx")
    expect(root).toContain("<TrackPaymentView />")
    expect(root).not.toContain("initialBookingRef")
    expect(root).not.toContain("initialEditToken")
    expect(root).not.toContain('aria-label="Booking reference"')
    expect(root).not.toContain("Track Booking")
  })

  it("permalink wrapper forwards the normalized reference and token without search markup", () => {
    const permalink = readSource("app/booking/[bookingRef]/manage/page.tsx")
    // The canonical permalink normalizes the reference exactly like the
    // tracking queries and forwards the optional edit token.
    expect(permalink).toContain("normalizeBookingRefForEdit")
    expect(permalink).toContain("initialBookingRef={bookingRef}")
    expect(permalink).toContain("initialEditToken={token}")
    expect(permalink).toContain("searchParams: Promise<{ token?: string }>")
    // Thin wrapper only: no search hero, no second shell, no query munging.
    expect(permalink).not.toContain("Track Booking")
    expect(permalink).not.toContain("Search another booking")
    expect(permalink).not.toContain('aria-label="Booking reference"')
  })
})
