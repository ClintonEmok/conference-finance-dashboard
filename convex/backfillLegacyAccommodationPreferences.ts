import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"

/**
 * LEG-01 guarded, operator-run first-preference backfill for the
 * `divine-redesign` production event (Step 2 of the accommodation cutover).
 * Run with:
 *
 *   npx convex run backfillLegacyAccommodationPreferences \
 *     --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
 *
 * Behavior:
 * - Locates the event by slug and resolves the event's Standard category and
 *   stay config directly (never through a pricing/rate lookup).
 * - For every order that has ZERO `orderAccommodationSelections` rows, creates
 *   exactly one included-Standard preference per ticketed attendee with
 *   ticket-derived occupancy (capacity-1 room types are `single`, everything
 *   else `shared`), the event config's check-in/check-out timestamps and base
 *   night count, and no night-before / options.
 * - An order that already has any selection row is skipped as a unit
 *   (idempotent re-run). An order with any unresolvable attendee (no ticket
 *   selection, missing ticket/room type) is rejected as a unit — zero partial
 *   inserts — and reported under `unresolved`.
 * - For every legacy event assignment still pending (no status or `pending`),
 *   patches the status to `converted` while retaining the slot reference and
 *   audit fields, so converted assignments no longer appear as pending buyer
 *   suggestions. Re-running sees existing preferences and converted statuses
 *   as no-ops.
 * - Never touches confirmed rows, other events, payments, order totals, or
 *   Tikkie links.
 *
 * Safety (shared production-deployment guard):
 * - Requires `authorize: true` AND an exactly-matching, explicitly allowed
 *   production deployment URL (`allowedDeploymentUrl`), compared to the
 *   detected `CONVEX_SITE_URL` as a deployment slug (`.convex.cloud` and
 *   `.convex.site` are the same identity) — no prefix/suffix matching, no
 *   selector or environment fallback. The guard fails closed BEFORE any
 *   database read or write.
 * - This mutation is the `costly` write: Convex has no delete-undone path for
 *   the inserted selection rows. Rehearse on the sanitized preview first.
 */

const SELECTION_BATCH = 500
const ORDER_BATCH = 500

const DEFAULT_SLUG = "divine-redesign"

type ResolvedPreference = {
  attendeeId: Id<"orderAttendees">
  occupancy: "single" | "shared"
}

export default internalMutation({
  args: {
    /** Event slug to backfill; defaults to the production divine-redesign. */
    slug: v.optional(v.string()),
    /** Explicit production write-authorization marker (required). */
    authorize: v.boolean(),
    /** Allowed production deployment URL for the deployment guard. */
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.string(),
    slug: v.string(),
    ordersScanned: v.number(),
    ordersAlreadyHandled: v.number(),
    ordersResolved: v.number(),
    attendeesHandled: v.number(),
    ordersUnresolved: v.number(),
    unresolved: v.array(
      v.object({ orderId: v.string(), reason: v.string() })
    ),
    assignmentsConverted: v.number(),
  }),
  handler: async (ctx, args) => {
    // Production-deployment guard: shared fail-closed check runs BEFORE any
    // database read/write. Requires `authorize: true` and an exactly-matching,
    // explicitly allowed production deployment URL against the detected
    // CONVEX_SITE_URL (deployment-slug equality).
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "preference backfill",
    })

    const slug = args.slug?.trim() || DEFAULT_SLUG

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()
    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    // The event's included Standard category and stay config are resolved
    // directly: the config's default category when it is Standard, otherwise
    // the catalog Standard category. Fails closed when either is missing.
    const configRow = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .unique()
    if (!configRow) {
      throw new Error(
        "CONFIG_REQUIRED: The event has no accommodation config; refusing to fabricate preferences."
      )
    }
    let standardCategoryId: Id<"accommodationCategories"> | null = null
    if (configRow.defaultCategoryId) {
      const defaultCategory = await ctx.db.get(
        "accommodationCategories",
        configRow.defaultCategoryId
      )
      if (defaultCategory?.code === "standard") {
        standardCategoryId = defaultCategory._id
      }
    }
    if (!standardCategoryId) {
      const standardCategory = await ctx.db
        .query("accommodationCategories")
        .withIndex("by_code", (q) => q.eq("code", "standard"))
        .first()
      standardCategoryId = standardCategory?._id ?? null
    }
    if (!standardCategoryId) {
      throw new Error(
        "CONFIG_REQUIRED: No Standard accommodation category is configured for this event."
      )
    }

    const orders: Array<Doc<"orders">> = []
    for await (const order of ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))) {
      orders.push(order)
    }

    let ordersAlreadyHandled = 0
    let ordersResolved = 0
    let attendeesHandled = 0
    const unresolved: Array<{ orderId: string; reason: string }> = []

    for (const order of orders) {
      const [attendeeRows, ticketSelectionRows, selectionRows] =
        await Promise.all([
          ctx.db
            .query("orderAttendees")
            .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
            .take(SELECTION_BATCH),
          ctx.db
            .query("orderTicketSelections")
            .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
            .take(SELECTION_BATCH),
          ctx.db
            .query("orderAccommodationSelections")
            .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
            .take(SELECTION_BATCH),
        ])

      if (selectionRows.length > 0) {
        ordersAlreadyHandled += 1
        continue
      }

      const ticketSelectionByAttendeeId = new Map<string, Doc<"orderTicketSelections">>()
      for (const row of ticketSelectionRows) {
        ticketSelectionByAttendeeId.set(String(row.attendeeId), row)
      }

      // Resolve every attendee's preference before inserting anything, so a
      // single unresolvable attendee fails the whole order closed.
      const resolvedPerAttendee: Array<ResolvedPreference> = []
      let orderFailureReason: string | null = null

      for (const attendee of attendeeRows) {
        const ticketSelection = ticketSelectionByAttendeeId.get(String(attendee._id))
        if (!ticketSelection) {
          orderFailureReason = `attendee '${attendee.name}' has no ticket selection`
          break
        }
        const ticket = await ctx.db.get("ticketTypes", ticketSelection.ticketTypeId)
        if (!ticket) {
          orderFailureReason = `attendee '${attendee.name}' has an unresolvable ticket`
          break
        }
        let occupancy: "single" | "shared"
        if (ticket.roomTypeId) {
          const roomType = await ctx.db.get(
            "accommodationRoomTypes",
            ticket.roomTypeId
          )
          if (!roomType) {
            orderFailureReason = `attendee '${attendee.name}' ticket room type is unresolvable`
            break
          }
          // Occupancy derives from the physical room type's capacity (single
          // for 1, shared otherwise), matching the shared ticket resolver.
          occupancy = roomType.defaultCapacity === 1 ? "single" : "shared"
        } else {
          // Unconstrained ticket: the audited population is shared Double
          // Room occupancy, so shared is the conservative default.
          occupancy = "shared"
        }
        resolvedPerAttendee.push({ attendeeId: attendee._id, occupancy })
      }

      if (orderFailureReason) {
        unresolved.push({ orderId: String(order._id), reason: orderFailureReason })
        continue
      }

      for (const preference of resolvedPerAttendee) {
        await ctx.db.insert("orderAccommodationSelections", {
          orderId: order._id,
          attendeeId: preference.attendeeId,
          // The server-resolved included-stay Standard category, never a
          // legacy room type's (absent) categoryId.
          categoryId: standardCategoryId,
          occupancy: preference.occupancy,
          checkInAt: configRow.baseCheckInAt,
          checkOutAt: configRow.baseCheckOutAt,
          nightCount: configRow.nightCount,
        })
        attendeesHandled += 1
      }
      ordersResolved += 1
    }

    // Convert every still-active legacy assignment to `converted` (idempotent),
    // retaining its slot reference and audit fields so the converted rows no
    // longer surface as pending buyer suggestions. Any status other than
    // `converted` (undefined, pending, confirmed, declined) is retired: every
    // legacy attendee now has a backfilled preference, and the legacy slots
    // are removed with the old inventory.
    let assignmentsConverted = 0
    for (const order of orders) {
      const assignmentRows = await ctx.db
        .query("orderAssignments")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(ORDER_BATCH)
      for (const assignment of assignmentRows) {
        if (assignment.status === "converted") {
          continue
        }
        await ctx.db.patch("orderAssignments", assignment._id, {
          status: "converted",
        })
        assignmentsConverted += 1
      }
    }

    return {
      eventId: String(event._id),
      slug,
      ordersScanned: orders.length,
      ordersAlreadyHandled,
      ordersResolved,
      attendeesHandled,
      ordersUnresolved: unresolved.length,
      unresolved,
      assignmentsConverted,
    }
  },
})
