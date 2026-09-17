import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * AE-3 — the legacy redirect mapping after the Phase 58 inversion.
 *
 * `/finance` is a redirect-only shell (it renders nothing) and the singular
 * `/donation` is a legacy shim landing on the plural `/donations` page. Next's
 * `redirect` boundary is mocked so no Next server is required: the server
 * components are invoked directly with promise-shaped params/searchParams
 * exactly as the App Router would provide them.
 *
 * Load-bearing invariants proven here:
 * - every AE-3 mapping resolves through `financeTabHref` to a real page;
 * - every param except `tab` survives verbatim, including repeated params;
 * - `tab` is NEVER forwarded (a stray `?tab=` must not reappear downstream);
 * - the singular hop forwards outward and cannot loop;
 * - `redirect()` is called exactly once per request.
 */

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

import FinanceRedirectPage from "@/app/dashboard/events/[slug]/finance/page"
import LegacyDonationPage from "@/app/dashboard/events/[slug]/donation/page"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const SHELL = "app/dashboard/events/[slug]/finance/page.tsx"
const SINGULAR = "app/dashboard/events/[slug]/donation/page.tsx"

type RedirectablePage = (props: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) => Promise<unknown>

async function captureRedirect(
  page: RedirectablePage,
  slug: string,
  searchParams?: Record<string, string | string[] | undefined>
) {
  mocks.redirect.mockReset()
  await page({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(searchParams ?? {}),
  })
  expect(mocks.redirect).toHaveBeenCalledTimes(1)
  return String(mocks.redirect.mock.calls[0]?.[0])
}

describe("AE-3 the /finance legacy redirect mapping", () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it("maps each known tab to its dedicated page with the intent preserved", async () => {
    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "payments",
        orderId: "order_42",
      })
    ).resolves.toBe("/dashboard/events/retreat/payments?orderId=order_42")

    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "donations",
        donationId: "pay_9",
      })
    ).resolves.toBe("/dashboard/events/retreat/donations?donationId=pay_9")

    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "reconciliation",
        orderId: "order_42",
      })
    ).resolves.toBe("/dashboard/events/retreat/reconciliation?orderId=order_42")
  })

  it("resolves a missing or unknown tab to payments without inventing params", async () => {
    await expect(captureRedirect(FinanceRedirectPage, "retreat")).resolves.toBe(
      "/dashboard/events/retreat/payments"
    )
    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", { tab: "bogus" })
    ).resolves.toBe("/dashboard/events/retreat/payments")
    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", { tab: "orders" })
    ).resolves.toBe("/dashboard/events/retreat/payments")
  })

  it("delegates encoding to URLSearchParams for the slug and the values", async () => {
    await expect(
      captureRedirect(FinanceRedirectPage, "spring retreat", {
        tab: "donations",
        orderId: "order/7",
      })
    ).resolves.toBe(
      "/dashboard/events/spring%20retreat/donations?orderId=order%2F7"
    )
  })

  it("forwards repeated params one value at a time", async () => {
    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "payments",
        foo: ["a", "b"],
      })
    ).resolves.toBe("/dashboard/events/retreat/payments?foo=a&foo=b")
  })

  it("forwards unknown params rather than dropping them", async () => {
    await expect(
      captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "reconciliation",
        futureFilter: "x",
      })
    ).resolves.toBe(
      "/dashboard/events/retreat/reconciliation?futureFilter=x"
    )
  })

  it("drops the tab param from every target and never emits `tab=`", async () => {
    const targets = [
      await captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "payments",
        orderId: "order_42",
      }),
      await captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "donations",
        orderId: "order_42",
        donationId: "pay_9",
      }),
      await captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "reconciliation",
        tabCount: "2",
      }),
      await captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "bogus",
        attendeeId: "att_1",
      }),
      await captureRedirect(FinanceRedirectPage, "retreat", {
        tab: "donations",
        foo: ["a", "b"],
      }),
    ]

    for (const target of targets) {
      expect(target).not.toContain("tab=")
    }
    expect(targets[1]).toBe(
      "/dashboard/events/retreat/donations?orderId=order_42&donationId=pay_9"
    )
    expect(targets[2]).toBe(
      "/dashboard/events/retreat/reconciliation?tabCount=2"
    )
    expect(targets[3]).toBe(
      "/dashboard/events/retreat/payments?attendeeId=att_1"
    )
    expect(targets[4]).toBe("/dashboard/events/retreat/donations?foo=a&foo=b")
  })

  it("never redirects into the redirect shell itself", async () => {
    for (const tab of ["payments", "donations", "reconciliation", "bogus"]) {
      const target = await captureRedirect(FinanceRedirectPage, "retreat", {
        tab,
      })
      expect(target).not.toContain("/finance")
      expect(target).not.toMatch(/\?/)
    }
  })
})

describe("AE-3 the singular /donation hop", () => {
  beforeEach(() => {
    mocks.redirect.mockReset()
  })

  it("lands on the plural page with the intent preserved", async () => {
    await expect(
      captureRedirect(LegacyDonationPage, "retreat", { donationId: "pay_9" })
    ).resolves.toBe("/dashboard/events/retreat/donations?donationId=pay_9")
  })

  it("lands on the plural page with no query when there is no intent", async () => {
    await expect(captureRedirect(LegacyDonationPage, "retreat")).resolves.toBe(
      "/dashboard/events/retreat/donations"
    )
  })

  it("drops a tab param and forwards every other param", async () => {
    await expect(
      captureRedirect(LegacyDonationPage, "retreat", {
        tab: "donations",
        donationId: "pay_9",
        foo: ["a", "b"],
      })
    ).resolves.toBe(
      "/dashboard/events/retreat/donations?donationId=pay_9&foo=a&foo=b"
    )
  })

  it("redirects outward — the target is never the request's own route", async () => {
    const target = await captureRedirect(LegacyDonationPage, "retreat", {
      donationId: "pay_9",
    })
    const targetPath = new URL(target, "https://example.test").pathname

    expect(targetPath).toBe("/dashboard/events/retreat/donations")
    expect(targetPath).not.toBe("/dashboard/events/retreat/donation")
    expect(targetPath.endsWith("/donation")).toBe(false)
    expect(target).not.toContain("tab=")
  })
})

describe("the redirect shell source contract", () => {
  it("renders nothing, keeps no client boundary and no retired host", () => {
    const shell = readSource(SHELL)

    expect(shell).toContain("redirect(")
    expect(shell).toMatch(/export default async function FinanceRedirectPage\s*\(/)
    expect(shell).toContain("financeTabHref(")
    expect(shell).toContain("parseFinanceTab(")
    expect(shell).toContain("URLSearchParams")
    expect(shell).not.toContain("FinanceWorkspace")
    expect(shell).not.toContain('"use client"')
    expect(shell).not.toContain("financeHref(")
    expect(shell).not.toContain("useParams")
    expect(shell).not.toContain("useSearchParams")
  })

  it("builds no destination path and no query string by concatenation", () => {
    const shell = readSource(SHELL)

    expect(shell).not.toContain("/dashboard/events/")
    expect(shell).toMatch(/financeTabHref\(\s*slug,\s*parseFinanceTab\(/)
    // Exactly one drop-guard, and no producer of a `tab` param.
    expect(shell.match(/key === "tab"/g)).toHaveLength(1)
    expect(shell).not.toMatch(/set\(\s*"tab"|append\(\s*"tab"/)
    // Renders nothing: no JSX return, no element markup, no styling hooks.
    expect(shell).not.toMatch(/return\s*\(/)
    expect(shell).not.toMatch(/\/>/)
    expect(shell).not.toContain("</")
    expect(shell).not.toContain("className")
  })

  it("the singular shim forwards outward and produces no tab param", () => {
    const singular = readSource(SINGULAR)

    expect(singular).toMatch(/export default async function LegacyDonationPage\s*\(/)
    expect(singular).toContain("donationsHref(slug)")
    expect(singular).not.toContain("financeHref(")
    expect(singular).not.toContain("financeTabHref(")
    expect(singular).not.toContain("/dashboard/events/")
    expect(singular.match(/key === "tab"/g)).toHaveLength(1)
    // The file legitimately contains the param-name comparison `key === "tab"`
    // (the guard that drops the param), so this regex — not a whole-file
    // containment check for the word tab — is the ONLY tab assertion here.
    expect(singular).not.toMatch(/set\("tab"|append\("tab"/)
  })

  it("is inert when invoked with no searchParams at all", async () => {
    mocks.redirect.mockReset()
    await FinanceRedirectPage({
      params: Promise.resolve({ slug: "retreat" }),
    })
    expect(mocks.redirect).toHaveBeenCalledTimes(1)
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/dashboard/events/retreat/payments"
    )
  })
})
