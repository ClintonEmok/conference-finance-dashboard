import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { SUPERIOR_UPGRADE_OPTION_KEY } from "./signupCatalog"

/**
 * Idempotent CLI-runnable migration for the simplified accommodation
 * contract on the Divine Conference event (run with
 * `npx convex run applySimplifiedDivineConferenceAccommodation`).
 *
 * What it guarantees:
 * 1. The event's default included-stay category resolves to Standard (the
 *    eventAccommodationConfig.defaultCategoryId is set to the catalog
 *    category with code `standard` when one exists).
 * 2. The `superior_upgrade` catalog option is enabled for the event at 1000
 *    minor units (€10) per night, so the included-stay Superior upgrade
 *    add-on is purchasable through the shared server contract.
 *
 * What it never touches: admin room/category/rate inventory, order data,
 * selections, snapshots, payments, assignments, or any other event. Old
 * Superior rate rows remain untouched and are simply not used by the new
 * included-stay resolver (which prices Standard occupancy rates only).
 *
 * The event is located by slug (no hardcoded generated IDs) so the migration
 * is safe to re-run and to execute against any environment that mirrors the
 * divine-conference event. All steps are idempotent: re-running produces no
 * duplicate option/config rows and no changed money.
 */
export default internalMutation({
  args: {
    /** Event slug to migrate; defaults to the production divine conference. */
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = args.slug ?? "divine-conference"

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()
    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    // 1. Ensure the event's included-stay category defaults to Standard.
    let defaultCategoryId: string | null = null
    const standardCategory = await ctx.db
      .query("accommodationCategories")
      .withIndex("by_code", (q) => q.eq("code", "standard"))
      .first()
    if (standardCategory) {
      defaultCategoryId = String(standardCategory._id)
    }

    let configUpdated = 0
    const configRow = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .unique()
    if (configRow && defaultCategoryId) {
      if (configRow.defaultCategoryId !== standardCategory!._id) {
        await ctx.db.patch("eventAccommodationConfig", configRow._id, {
          defaultCategoryId: standardCategory!._id,
        })
        configUpdated = 1
      }
    }

    // 2. Enable/upsert the superior_upgrade catalog option at €10 per night.
    // The catalog definition is created if a deployment has not run the seed
    // (the seed itself also guarantees it); the event option is then
    // upserted idempotently.
    let catalogOptionCreated = 0
    let optionEnabled = 0
    let optionPriceUpdated = 0
    let catalogOption = await ctx.db
      .query("accommodationOptions")
      .withIndex("by_code", (q) => q.eq("code", SUPERIOR_UPGRADE_OPTION_KEY))
      .first()
    if (!catalogOption) {
      const createdId = await ctx.db.insert("accommodationOptions", {
        code: SUPERIOR_UPGRADE_OPTION_KEY,
        label: "Superior upgrade",
        description:
          "Upgrade the included stay to Superior rooms, charged per person per night for exactly the included base nights.",
        kind: "upgrade",
        unit: "per_night",
      })
      catalogOption = { _id: createdId } as NonNullable<
        typeof catalogOption
      >
      catalogOptionCreated = 1
    }
    if (catalogOption) {
      const eventOptionRow = await ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId_and_optionId", (q) =>
          q.eq("eventId", event._id).eq("optionId", catalogOption._id)
        )
        .first()
      if (!eventOptionRow) {
        await ctx.db.insert("eventAccommodationOptions", {
          eventId: event._id,
          optionId: catalogOption._id,
          enabled: true,
          priceMinor: 1000,
        })
        optionEnabled = 1
      } else {
        if (eventOptionRow.enabled !== true) {
          await ctx.db.patch("eventAccommodationOptions", eventOptionRow._id, {
            enabled: true,
          })
          optionEnabled = 1
        }
        if (eventOptionRow.priceMinor !== 1000) {
          await ctx.db.patch("eventAccommodationOptions", eventOptionRow._id, {
            priceMinor: 1000,
          })
          optionPriceUpdated = 1
        }
      }
    }

    return {
      eventId: String(event._id),
      slug,
      defaultCategoryId,
      configUpdated,
      superiorUpgrade: {
        catalogOptionCreated,
        optionEnabled,
        optionPriceUpdated,
        priceMinor: 1000,
      },
    }
  },
})
