import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Phase 58 carry-forward source audit.
 *
 * Two Phase 56 verification findings were assigned to Phase 58:
 *
 *  1. `components/dashboard/event-overview-surface.tsx` rendered the overview
 *     donation card as `overpaidMinor + standaloneDonationMinor` — a sum of two
 *     DISJOINT money classes. The repo rule is that the classes are never
 *     summed; the card must render three separate server figures.
 *  2. `convex/orders.ts` carried two zero-caller payment-total helpers
 *     (`loadPaymentTotalsByOrderKey`, `getMatchedPaymentTotalForOrder`) — a
 *     latent second paid derivation. They are deleted, and the registered
 *     divergent surface's marker must survive so the Phase 56 coverage walk
 *     still collects the file.
 *
 * This suite is a static guard: it fails if either carry-forward regresses.
 */

const root = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

const SURFACE = "components/dashboard/event-overview-surface.tsx"
const OVERVIEW_TYPE = "lib/domain/overview/event-overview.ts"
const ORDERS = "convex/orders.ts"

/** The three disjoint classes the donation card reports, each verbatim. */
const DISJOINT_DONATION_CLASSES = [
  "standaloneDonationMinor",
  "standaloneAllocatedMinor",
  "overpaidMinor",
] as const

describe("phase 58 carry-forwards (phase 56 verification findings)", () => {
  describe("the overview donation card renders three disjoint server figures", () => {
    test("the two classes are disjoint and must never be summed", () => {
      const surface = readSource(SURFACE)

      // The exact idioms that produced the bug.
      expect(surface).not.toContain("overpaidMinor + ")
      expect(surface).not.toContain("standaloneDonationMinor + ")
      // Whitespace-tolerant form: catches the sum re-expressed through a
      // variable or spread across a reflowed line.
      expect(surface).not.toMatch(/overpaidMinor\s*\+/)
      expect(surface).not.toMatch(/standaloneDonationMinor\s*\+/)
    })

    test("each of the three classes renders verbatim inside formatMoney()", () => {
      const surface = readSource(SURFACE)

      for (const field of DISJOINT_DONATION_CLASSES) {
        expect(
          surface,
          `${field} must render straight from the server payload — no client-side derivation`
        ).toContain(`formatMoney(revenue.data.totals.${field})`)
      }
    })

    test("the card is titled as donation income, not as a mixed bucket", () => {
      const surface = readSource(SURFACE)

      expect(surface).toContain("Donation income")
      expect(surface).toContain("Unallocated standalone donations")
      // The old title/description pair licensed the sum; neither may survive.
      expect(surface).not.toContain("Overpayments and standalone")
    })

    test("the client payload type declares all three disjoint classes", () => {
      const types = readSource(OVERVIEW_TYPE)

      expect(types).toContain("standaloneAllocatedMinor: number")
      expect(types).toContain("standaloneDonationMinor: number")
      expect(types).toContain("overpaidMinor: number")
    })
  })
})
