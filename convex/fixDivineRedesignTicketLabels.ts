import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"

/**
 * Corrective production migration for the `divine-redesign` age-band ticket
 * labels/prices.
 *
 * The original Step 0 renamed the four entry tickets by sort/creation order,
 * but production's synced ticket rows were NOT created in ascending age
 * order — so the age bands were scrambled (e.g. the 18+ €250 ticket was
 * relabeled "under 3" at €0). This migration restores the correct
 * label/price per ticket by the stable production ticket ID.
 *
 * Correct mapping (original price preserved, age-band label updated):
 * - `nx77hvbf98...` (was 18+ €250)     -> "18+"     €25000
 * - `nx72nax96...` (was 13-17 €150)    -> "12-17"   €15000
 * - `nx71p86qk...` (was 5-12 €125)     -> "3-11"    €12500
 * - `nx78qhye...` (was 0-4 €0)         -> "under 3" €0
 * - `nx7arwae19...` (Single Room €350) -> unchanged (included for safety)
 *
 * Safety: guarded by `authorize: true` + exact production deployment slug.
 * Idempotent: a ticket already at the target label/price is left untouched.
 * Does NOT touch selections, orders, accommodation, or inventory.
 */
export default internalMutation({
  args: {
    /** Explicit production write-authorization marker (required). */
    authorize: v.boolean(),
    /** Allowed production deployment URL for the deployment guard. */
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    ticketsChecked: v.number(),
    ticketsFixed: v.number(),
  }),
  handler: async (ctx, args) => {
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "divine-redesign ticket label correction",
    })

    const FIXES = [
      {
        ticketTypeId: "nx77hvbf98kes7ye01pkc40zv9841nmc",
        label: "18+",
        priceMinor: 25000,
      },
      {
        ticketTypeId: "nx72nax96t9v6m7q9rvmgk22bd84114q",
        label: "12-17",
        priceMinor: 15000,
      },
      {
        ticketTypeId: "nx71p86qkh3atzkfny53q9h725840veh",
        label: "3-11",
        priceMinor: 12500,
      },
      {
        ticketTypeId: "nx78qhyeqtvveksccnt0868b15840qq2",
        label: "under 3",
        priceMinor: 0,
      },
      {
        ticketTypeId: "nx7arwae19zy67v96jejef9jsh8407tf",
        label: "Single Room",
        priceMinor: 35000,
      },
    ]

    let ticketsFixed = 0
    for (const fix of FIXES) {
      const ticket = await ctx.db.get(
        "ticketTypes",
        fix.ticketTypeId as never
      )
      if (!ticket) {
        throw new Error(
          `Ticket '${fix.ticketTypeId}' not found; refusing to continue so a renamed deployment never silently skips a correction.`
        )
      }
      const needsLabel = ticket.label !== fix.label
      const needsPrice = ticket.priceMinor !== fix.priceMinor
      if (needsLabel || needsPrice) {
        await ctx.db.patch("ticketTypes", ticket._id, {
          label: fix.label,
          priceMinor: fix.priceMinor,
        })
        ticketsFixed += 1
      }
    }

    return { ticketsChecked: FIXES.length, ticketsFixed }
  },
})
