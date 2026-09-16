import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Static guard for the Phase 55.1 purpose plumbing on the live domain chain.
 *
 * The behavioural cron suite (convex/donation-ingestion.handlers.test.ts)
 * drives the real autoSync action. The dashboard/API domain chain
 * (syncTikkiePayments -> runTikkieSync) is driven by Next routes and is not
 * reachable from convex-test, so this suite pins its forwarding statically:
 * it fails if a live writer stops resolving the stored link purpose into the
 * canonical upsert, or starts comparing purpose in a payment-only direction.
 */

const root = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

function regionAfter(source: string, anchor: string, length: number): string {
  const index = source.indexOf(anchor)
  expect(index, `${anchor} must appear in the source`).toBeGreaterThanOrEqual(0)
  return source.slice(index, index + length)
}

function regionAround(
  source: string,
  anchor: string,
  before: number,
  after: number
): string {
  const index = source.indexOf(anchor)
  expect(index, `${anchor} must appear in the source`).toBeGreaterThanOrEqual(0)
  return source.slice(Math.max(0, index - before), index + after)
}

const LIVE_WRITERS = [
  "convex/autoSync.ts",
  "lib/domain/finance/payments.ts",
  "lib/domain/finance/tikkie-sync.ts",
  "lib/domain/finance/tikkie-event-payments.ts",
] as const

describe("Tikkie donation-link purpose parity (Phase 55.1)", () => {
  test("the cron action resolves the link purpose and forwards it with the event id", () => {
    const source = readSource("convex/autoSync.ts")

    expect(source).toMatch(
      /import\s*\{[^}]*\bresolveTikkieLinkPurpose\b[^}]*\}\s*from\s*"\.\.\/lib\/domain\/finance\/tikkie-link-purpose"/
    )

    const upsertCall = regionAfter(source, "internalUpsertTikkiePayment", 700)
    expect(upsertCall).toContain(
      "purpose: resolveTikkieLinkPurpose(link.purpose)"
    )
    expect(upsertCall).toContain("eventId: link.eventId")
  })

  test("the domain sync chain forwards the event id and resolved purpose to syncTikkiePayments", () => {
    const source = readSource("lib/domain/finance/tikkie-sync.ts")

    expect(source).toMatch(
      /import\s*\{[^}]*\bresolveTikkieLinkPurpose\b[^}]*\}\s*from\s*"\.\/tikkie-link-purpose"/
    )

    const syncCall = regionAfter(source, "syncTikkiePayments(", 200)
    expect(syncCall).toContain("eventId: link.eventId")
    expect(syncCall).toContain("purpose: resolveTikkieLinkPurpose(link.purpose)")
  })

  test("the domain upsert call site resolves the purpose before writing", () => {
    const source = readSource("lib/domain/finance/payments.ts")

    expect(source).toMatch(
      /import\s*\{[^}]*\bresolveTikkieLinkPurpose\b[^}]*\}\s*from\s*"\.\/tikkie-link-purpose"/
    )

    const upsertCall = regionAfter(
      source,
      "api.payments.upsertTikkiePayment",
      500
    )
    expect(upsertCall).toContain(
      "purpose: resolveTikkieLinkPurpose(options.purpose)"
    )
    expect(upsertCall).toContain("eventId: options.eventId")
  })

  test("the legacy event-payment mirror guards auto-match against donation links", () => {
    const source = readSource("lib/domain/finance/tikkie-event-payments.ts")

    const matchCall = regionAround(
      source,
      "api.tikkie.autoMatchTikkiePayments",
      200,
      200
    )
    expect(matchCall).toContain(
      'resolveTikkieLinkPurpose(link.purpose) === "donation"'
    )
  })

  test("no live writer compares the stored purpose in a payment-only direction", () => {
    for (const file of LIVE_WRITERS) {
      expect(readSource(file), file).not.toMatch(
        /purpose\s*===\s*"payment"/
      )
    }
  })
})
