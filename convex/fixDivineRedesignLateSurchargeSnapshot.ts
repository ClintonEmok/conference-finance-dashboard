import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"

/**
 * Corrective production migration removing a late surcharge that was already
 * snapshotted onto one `divine-redesign` order.
 *
 * Why a migration is needed: the late surcharge is frozen into
 * `orderTicketSelections.ticketPriceSnapshot` at submission time, and order
 * balances read that snapshot (`convex/finance.ts`). Moving a ticket type's
 * `lateSurchargeEffectiveAt` forward therefore does NOT retroactively change
 * an order that was already priced — it only affects future submissions.
 *
 * Order `BK-20260927-YXWJ9O` (2 × 18+) was submitted on 27 Sep 2026, while the
 * old surcharge window (from 26 Sep 2026 08:42) was active, so each selection
 * froze `basePriceMinor: 25000 + surchargeMinor: 7500 = 32500`. The customer
 * paid €500 (the un-surcharged total), so this migration restores the two
 * frozen snapshots to the base price and clears the surcharge.
 *
 * Safety: guarded by `authorize: true` + the exact production deployment slug.
 * Idempotent: a selection already at the base price with no surcharge is left
 * untouched. Scope: touches ONLY the two orderTicketSelections rows below; no
 * attendee, payment, accommodation, or ticket-type row is modified.
 */
export default internalMutation({
  args: {
    /** Explicit production write-authorization marker (required). */
    authorize: v.boolean(),
    /** Allowed production deployment URL for the deployment guard. */
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    selectionsChecked: v.number(),
    selectionsCorrected: v.number(),
  }),
  handler: async (ctx, args) => {
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "divine-redesign late surcharge snapshot correction",
    })

    const ORDER_ID = "nn70v7260kqmb1bkgq8ee561sd8f6eat"
    const ORDER_BOOKING_REF = "BK-20260927-YXWJ9O"

    const order = await ctx.db.get("orders", ORDER_ID as never)
    if (!order) {
      throw new Error(
        `Order '${ORDER_ID}' not found; refusing to continue so a renamed deployment never silently skips the correction.`
      )
    }
    if (order.bookingRef !== ORDER_BOOKING_REF) {
      throw new Error(
        `Order '${ORDER_ID}' has booking ref '${order.bookingRef}', expected '${ORDER_BOOKING_REF}'.`
      )
    }

    const TARGET_SELECTION_IDS = [
      "nh70dp862v2qr7mm5yxfpxseq18f6v7n",
      "nh73rxan2c2jnrq20vehwqtyw58f7t66",
    ]

    let selectionsCorrected = 0
    for (const selectionId of TARGET_SELECTION_IDS) {
      const selection = await ctx.db.get(
        "orderTicketSelections",
        selectionId as never
      )
      if (!selection) {
        throw new Error(
          `Selection '${selectionId}' not found; refusing to continue so a renamed deployment never silently skips the correction.`
        )
      }
      if (String(selection.orderId) !== ORDER_ID) {
        throw new Error(
          `Selection '${selectionId}' does not belong to order '${ORDER_ID}'.`
        )
      }
      const snapshot = selection.ticketPriceSnapshot
      if (!snapshot) {
        throw new Error(
          `Selection '${selectionId}' has no price snapshot; refusing to guess a price.`
        )
      }

      const basePriceMinor = snapshot.basePriceMinor
      if (snapshot.surchargeMinor === 0 && snapshot.unitPriceMinor === basePriceMinor) {
        continue
      }

      // Keep the original pricing instant for the record, drop the surcharge
      // and its effective-at marker, and restore the base unit price.
      await ctx.db.patch("orderTicketSelections", selection._id, {
        ticketPriceSnapshot: {
          basePriceMinor,
          surchargeMinor: 0,
          unitPriceMinor: basePriceMinor,
          pricedAt: snapshot.pricedAt,
        },
      })
      selectionsCorrected += 1
    }

    return {
      selectionsChecked: TARGET_SELECTION_IDS.length,
      selectionsCorrected,
    }
  },
})
