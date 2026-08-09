import { v } from "convex/values"
import { internalMutation, type MutationCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import {
  loadPublicSignupAccommodationContext,
  resolveIncludedStayCategory,
  resolvePublicSignupSelection,
} from "./signupCatalog"

/**
 * LEG-01 idempotent, operator-run first-preference backfill for the
 * `divine-redesign` production event. Run with:
 *
 *   npx convex run backfillLegacyAccommodationPreferences \
 *     --args '{"slug":"divine-redesign","preview":true,"allowedDeploymentUrl":"dev:acoustic-tiger-876"}'
 *
 * Behavior:
 * - Locates the event by slug and loads the shared accommodation context.
 * - For every order that has ZERO `orderAccommodationSelections` rows, creates
 *   exactly one included-Standard preference per ticketed attendee with
 *   ticket-derived occupancy (single/shared), the event config's stay
 *   timestamps and base night count, and no night-before / options.
 * - An order that already has any selection row is skipped as a unit
 *   (idempotent re-run). An order with any unresolvable attendee (no ticket
 *   selection, missing ticket/room type, unresolvable rate) is rejected as a
 *   unit — zero partial inserts — and reported under `unresolved`.
 * - Never touches confirmed rows, other events, payments, assignments, order
 *   totals, or Tikkie links.
 *
 * Safety (LEG-03):
 * - Requires `preview: true` AND, when the deployment URL is detectable
 *   (`CONVEX_SITE_URL`), it must match the allowed preview deployment URL —
 *   otherwise the call is rejected BEFORE any database read or write. A
 *   production deployment URL therefore fails closed.
 * - The category is always the event's included Standard category resolved
 *   server-side — never a legacy room type's (absent) categoryId.
 * - This mutation is the `costly` write: Convex has no delete-undone path for
 *   the inserted selection rows. Run it ONLY against the sanitized dev
 *   preview, never production.
 */

const SELECTION_BATCH = 500
const ORDER_BATCH = 500

export default internalMutation({
  args: {
    /** Event slug to backfill; defaults to the production divine-redesign. */
    slug: v.optional(v.string()),
    /** Explicit preview-only authorization marker (required). */
    preview: v.boolean(),
    /** Allowed preview deployment URL/selector for the deployment guard. */
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
  }),
  handler: async (ctx, args) => {
    const slug = args.slug?.trim() || "divine-redesign"

    // Deployment guard: fail closed before any database read when the
    // preview marker is absent or the detectable deployment is not the
    // allowed preview.
    if (args.preview !== true) {
      throw new Error(
        "PREVIEW_REQUIRED: This backfill is preview-only and requires `preview: true`."
      )
    }
    const siteUrl = process.env.CONVEX_SITE_URL?.trim() ?? null
    if (siteUrl) {
      const allowed =
        args.allowedDeploymentUrl?.trim() ||
        process.env.PREVIEW_DEPLOYMENT_URL?.trim() ||
        null
      const matches =
        allowed !== null &&
        (siteUrl === allowed ||
          siteUrl.endsWith(allowed) ||
          allowed.endsWith(siteUrl))
      if (!matches) {
        throw new Error(
          `WRONG_DEPLOYMENT: Detected deployment '${siteUrl}' does not match the allowed preview deployment. Backfill aborted before any read or write.`
        )
      }
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()
    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    const context = await loadPublicSignupAccommodationContext(ctx, event._id)
    if (!context.hasConfiguredAccommodation) {
      throw new Error(
        "CONFIG_REQUIRED: The event does not offer configured accommodation; refusing to fabricate preferences."
      )
    }
    const included = resolveIncludedStayCategory(context)
    if (!included) {
      throw new Error(
        "CONFIG_REQUIRED: No included accommodation category is configured for this event."
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
      const resolvedPerAttendee: Array<{
        attendeeId: Id<"orderAttendees">
        occupancy: "single" | "shared"
        nightCount: number | null
      }> = []
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
        let resolved: ReturnType<typeof resolvePublicSignupSelection>
        try {
          resolved = resolvePublicSignupSelection({
            context,
            selection: { occupancy, optionSelections: [] },
          })
        } catch (error) {
          orderFailureReason = `attendee '${attendee.name}': ${
            error instanceof Error ? error.message.replace(/^QUOTE_INVALID:\s*/, "") : "unresolvable selection"
          }`
          break
        }
        if (!resolved.categoryId || !resolved.occupancy) {
          orderFailureReason = `attendee '${attendee.name}' could not be resolved to an included preference`
          break
        }
        resolvedPerAttendee.push({
          attendeeId: attendee._id,
          occupancy: resolved.occupancy,
          nightCount: resolved.nightCount,
        })
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
          categoryId: included.categoryId as Id<"accommodationCategories">,
          occupancy: preference.occupancy,
          checkInAt: context.config?.baseCheckInAt,
          checkOutAt: context.config?.baseCheckOutAt,
          nightCount: preference.nightCount ?? undefined,
        })
        attendeesHandled += 1
      }
      ordersResolved += 1
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
    }
  },
})
