import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"

import { loadOrderAmountDueBreakdowns } from "./finance"
import { isOrderAppliedPayment } from "../lib/domain/finance/amounts"
import {
  loadPublicSignupAccommodationContext,
  resolvePublicSignupSelection,
  resolveIncludedStayCategory,
  resolveNightBeforeDisplayRates,
  resolveTicketCategoryById,
  type PublicSignupAccommodationContext,
} from "./signupCatalog"
import {
  signupAccommodationOccupancyValidator,
  signupAccommodationOptionSelectionValidator,
} from "../lib/types/signup"
import {
  digestAccommodationSelections,
  digestEditEnvelope,
  normalizeBookerEmail,
  normalizeBookingRefForEdit,
  verifyEditRequestSignature,
  verifyTrackPaymentEditToken,
} from "../lib/domain/track-payment/edit-token"

function normalizeBookingRef(bookingRef: string): string {
  return bookingRef.trim().toUpperCase()
}

function computeProgress(
  totalPaidMinor: number,
  totalDueMinor: number
): number {
  if (totalDueMinor <= 0) return 100
  return Math.min(100, Math.round((totalPaidMinor / totalDueMinor) * 100))
}

/**
 * Every applied payment row for an order, read through bounded async
 * iteration. A fixed `.take(100)` would silently undercount paid totals,
 * progress, remaining balance and the overpayment delta for orders with more
 * than 100 payments (CR-06).
 */
async function loadAppliedPaymentRowsForOrder(
  ctx: QueryCtx | MutationCtx,
  orderId: Id<"orders">
): Promise<Array<Doc<"payments">>> {
  const rows: Array<Doc<"payments">> = []
  for await (const payment of ctx.db
    .query("payments")
    .withIndex("orderId", (q) => q.eq("orderId", String(orderId)))) {
    rows.push(payment)
  }
  return rows.filter((payment) => isOrderAppliedPayment(payment))
}

type TrackPaymentProjection = {
  bookingRef: string
  event: { slug: string; title: string; startsAt: number }
  order: {
    buyerName: string | null
    buyerPhone: string | null
    submittedAt: number | null
    orderedAt: number | null
    totalAmountMinor: number | null
    amountDueMinor: number
    status: string | null
  }
  payment: {
    totalDueMinor: number
    totalPaidMinor: number
    remainingMinor: number
    progressPercent: number
    overpaymentDeltaMinor: number
    paymentCount: number
    paymentStatus: "unpaid" | "partial" | "paid" | "overpaid"
  }
  tikkieUrl: string | null
  tikkieAmountMinor: number | null
  tikkieDescription: string | null
}

/**
 * Typed tracking projection shared by the booking-reference query and the
 * email-or-reference query (WR-02). Reads only the order, its event, its
 * full applied payment set (CR-06), and the latest order/event Tikkie link —
 * never the ownership email.
 */
async function loadTrackingByOrder(
  ctx: QueryCtx,
  order: Doc<"orders">
): Promise<TrackPaymentProjection | null> {
  if (!order.eventId) {
    return null
  }

  const event = await ctx.db.get(order.eventId)
  if (!event) {
    return null
  }

  const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, [
    { _id: order._id },
  ])
  const amountDueBreakdown = amountDueBreakdownsByOrderId.get(String(order._id))

  const matchedPayments = await loadAppliedPaymentRowsForOrder(ctx, order._id)

  const totalPaidMinor = matchedPayments.reduce(
    (sum, payment) => sum + payment.amountMinor,
    0
  )

  const totalDueMinor =
    amountDueBreakdown?.amountDueMinor ?? order.totalAmountMinor ?? 0
  const remainingMinor = Math.max(0, totalDueMinor - totalPaidMinor)
  const overpaymentDeltaMinor = Math.max(0, totalPaidMinor - totalDueMinor)
  const paymentStatus: "unpaid" | "partial" | "paid" | "overpaid" =
    totalPaidMinor === 0
      ? "unpaid"
      : totalPaidMinor < totalDueMinor
        ? "partial"
        : totalPaidMinor === totalDueMinor
          ? "paid"
          : "overpaid"

  const orderLinks = await ctx.db
    .query("tikkiePaymentLinks")
    .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
    .take(20)

  const latestOrderLink = orderLinks
    .filter((link) => link.linkType === "order")
    .sort((a, b) => {
      const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
      if (timeDiff !== 0) return timeDiff
      return b._id.localeCompare(a._id)
    })[0]

  const eventLinks = await ctx.db
    .query("tikkiePaymentLinks")
    .withIndex("eventId", (q) => q.eq("eventId", String(order.eventId)))
    .take(20)

  const latestEventLink = eventLinks
    .filter((link) => link.linkType === "event")
    .sort((a, b) => {
      const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
      if (timeDiff !== 0) return timeDiff
      return b._id.localeCompare(a._id)
    })[0]

  const selectedLink = latestOrderLink ?? latestEventLink ?? null

  return {
    bookingRef: order.bookingRef ?? "",
    event: {
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
    },
    order: {
      buyerName: order.bookerName ?? null,
      buyerPhone: order.bookerPhone ?? null,
      submittedAt: order.submittedAt ?? null,
      orderedAt: order.orderedAt ?? null,
      totalAmountMinor: order.totalAmountMinor ?? null,
      amountDueMinor: totalDueMinor,
      status: order.status ?? null,
    },
    payment: {
      totalDueMinor,
      totalPaidMinor,
      remainingMinor,
      progressPercent: computeProgress(totalPaidMinor, totalDueMinor),
      overpaymentDeltaMinor,
      paymentCount: matchedPayments.length,
      paymentStatus,
    },
    tikkieUrl: selectedLink?.paymentRequestUrl ?? null,
    tikkieAmountMinor: selectedLink?.amountMinor ?? null,
    tikkieDescription: selectedLink?.description ?? null,
  }
}

export const getByBookingRef = query({
  args: {
    bookingRef: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      bookingRef: v.string(),
      event: v.object({
        slug: v.string(),
        title: v.string(),
        startsAt: v.number(),
      }),
      order: v.object({
        buyerName: v.union(v.string(), v.null()),
        buyerPhone: v.union(v.string(), v.null()),
        submittedAt: v.union(v.number(), v.null()),
        orderedAt: v.union(v.number(), v.null()),
        totalAmountMinor: v.union(v.number(), v.null()),
        amountDueMinor: v.union(v.number(), v.null()),
        status: v.union(v.string(), v.null()),
      }),
      payment: v.object({
        totalDueMinor: v.number(),
        totalPaidMinor: v.number(),
        remainingMinor: v.number(),
        progressPercent: v.number(),
        overpaymentDeltaMinor: v.number(),
        paymentCount: v.number(),
        paymentStatus: v.union(
          v.literal("unpaid"),
          v.literal("partial"),
          v.literal("paid"),
          v.literal("overpaid")
        ),
      }),
      tikkieUrl: v.union(v.string(), v.null()),
      tikkieAmountMinor: v.union(v.number(), v.null()),
      tikkieDescription: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const bookingRef = normalizeBookingRef(args.bookingRef)

    const order = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
      .first()

    if (!order || !order.eventId) {
      return null
    }

    return await loadTrackingByOrder(ctx, order)
  },
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const getByEmailOrBookingRef = query({
  args: {
    emailOrBookingRef: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      bookingRef: v.string(),
      event: v.object({
        slug: v.string(),
        title: v.string(),
        startsAt: v.number(),
      }),
      order: v.object({
        buyerName: v.union(v.string(), v.null()),
        buyerPhone: v.union(v.string(), v.null()),
        submittedAt: v.union(v.number(), v.null()),
        orderedAt: v.union(v.number(), v.null()),
        totalAmountMinor: v.union(v.number(), v.null()),
        amountDueMinor: v.union(v.number(), v.null()),
        status: v.union(v.string(), v.null()),
      }),
      payment: v.object({
        totalDueMinor: v.number(),
        totalPaidMinor: v.number(),
        remainingMinor: v.number(),
        progressPercent: v.number(),
        overpaymentDeltaMinor: v.number(),
        paymentCount: v.number(),
        paymentStatus: v.union(
          v.literal("unpaid"),
          v.literal("partial"),
          v.literal("paid"),
          v.literal("overpaid")
        ),
      }),
      tikkieUrl: v.union(v.string(), v.null()),
      tikkieAmountMinor: v.union(v.number(), v.null()),
      tikkieDescription: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const input = args.emailOrBookingRef.trim()

    // First try booking ref
    const bookingRef = normalizeBookingRef(input)
    const orderByRef = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
      .first()

    if (orderByRef) {
      return await loadTrackingByOrder(ctx, orderByRef)
    }

    // Try email lookup
    const normalizedEmail = normalizeEmail(input)
    const ordersByEmail = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("bookerEmail", normalizedEmail))
      .take(20)

    // If multiple orders found, prefer the most recent one by submittedAt
    if (ordersByEmail.length > 0) {
      const sorted = ordersByEmail.sort((a, b) => {
        const aTime = a.submittedAt ?? a._creationTime ?? 0
        const bTime = b.submittedAt ?? b._creationTime ?? 0
        return bTime - aTime
      })
      return await loadTrackingByOrder(ctx, sorted[0])
    }

    return null
  },
})

// ---------------------------------------------------------------------------
// Phase 43: durable permalink accommodation edit contract
//
// The permalink is the application's first public write. Two surfaces guard
// it: the Next.js API route (rate limit + honeypot + request signing) and
// this Convex contract, which remains independently secure against direct
// invocation. The mutation re-checks ownership, verifies the route-issued
// request signature, validates every preference through the Phase 42 shared
// resolver, enforces the confirmedAt lock, and prices canonically before and
// after the atomic replace. It never accepts a client amount, date, night
// count, room, slot, payment or snapshot, and never patches order totals,
// payments, assignments or Tikkie links.
// ---------------------------------------------------------------------------

const editCategoryCodeValidator = v.union(
  v.literal("standard"),
  v.literal("superior"),
  v.literal("family")
)
const editOccupancyValidator = signupAccommodationOccupancyValidator

const editChoiceRateValidator = v.object({
  occupancy: editOccupancyValidator,
  pricePerPersonMinor: v.number(),
})

const editChoiceCategoryValidator = v.object({
  categoryId: v.id("accommodationCategories"),
  code: editCategoryCodeValidator,
  label: v.string(),
  rates: v.array(editChoiceRateValidator),
})

const editChoiceOptionValidator = v.object({
  optionKey: v.string(),
  label: v.string(),
  priceMinor: v.number(),
})

const editAccommodationConfigValidator = v.object({
  baseCheckInAt: v.number(),
  baseCheckOutAt: v.number(),
  nightCount: v.number(),
  breakfastIncluded: v.boolean(),
})

const editSelectionValidator = v.object({
  attendeeKey: v.string(),
  categoryId: v.optional(v.id("accommodationCategories")),
  occupancy: v.optional(editOccupancyValidator),
  optionSelections: v.array(signupAccommodationOptionSelectionValidator),
  nightBeforeLevel: v.optional(
    v.union(v.literal("standard"), v.literal("superior"))
  ),
})

/**
 * Event-configured choice sets derived exclusively from the same rows the
 * quote, submission and canonical loader use. No room, slot, hotel, bed,
 * inventory or physical placement data is ever exposed to the public edit
 * surface.
 */
function buildEditChoices(
  context: PublicSignupAccommodationContext
): {
  eligible: boolean
  config: {
    baseCheckInAt: number
    baseCheckOutAt: number
    nightCount: number
    breakfastIncluded: boolean
  } | null
  activeCategories: Array<{
    categoryId: Id<"accommodationCategories">
    code: "standard" | "superior" | "family"
    label: string
    rates: Array<{
      occupancy: "single" | "shared" | "family"
      pricePerPersonMinor: number
    }>
  }>
  options: Array<{
    optionKey: string
    label: string
    priceMinor: number
  }>
  nightBefore: {
    standard: { single: number; shared: number }
    superior: { single: number; shared: number }
  } | null
} {
  const hasConfiguredChoices = context.hasConfiguredAccommodation

  const activeCategories = hasConfiguredChoices
    ? Array.from(context.activeCategoryIds).map((categoryId) => {
        const category = context.categoryById.get(categoryId)
        const rates = Array.from(context.ratesByKey.entries())
          .filter(([key]) => key.startsWith(`${categoryId}:`))
          .map(([key, pricePerPersonMinor]) => ({
            occupancy: key.split(":")[1] as "single" | "shared" | "family",
            pricePerPersonMinor,
          }))
        return {
          categoryId: categoryId as Id<"accommodationCategories">,
          code: (category?.code ?? "standard") as
            | "standard"
            | "superior"
            | "family",
          label: category?.label ?? "Unknown category",
          rates,
        }
      })
    : []

  const options: Array<{
    optionKey: string
    label: string
    priceMinor: number
  }> = []
  if (hasConfiguredChoices) {
    for (const [optionKey, option] of context.optionsByKey) {
      options.push({
        optionKey,
        label: option.label,
        priceMinor: option.priceMinor,
      })
    }
    options.sort((left, right) => left.label.localeCompare(right.label))
  }

  return {
    eligible: hasConfiguredChoices,
    // The track-payment edit contract keeps its original four-field config
    // shape: the extended-stay flags are a buyer-facing catalog concern and
    // are deliberately not propagated to this legacy edit surface.
    config: hasConfiguredChoices && context.config
      ? {
          baseCheckInAt: context.config.baseCheckInAt,
          baseCheckOutAt: context.config.baseCheckOutAt,
          nightCount: context.config.nightCount,
          breakfastIncluded: context.config.breakfastIncluded,
        }
      : null,
    activeCategories,
    options,
    // Server-resolved night-before display rates (copy only) so the manage
    // editor renders the same independent choice as the signup surface.
    nightBefore: hasConfiguredChoices
      ? resolveNightBeforeDisplayRates(
          context,
          resolveIncludedStayCategory(context)?.categoryId ?? null
        )
      : null,
  }
}

function throwEditError(code: string, message: string): never {
  throw new Error(`${code}: ${message}`)
}

/**
 * Every `orderAccommodationSelections` row for an order, read through bounded
 * async iteration. A fixed `.take()` would silently truncate orders with more
 * rows than the cap and make a truncated collection the authoritative
 * replacement set or confirmedAt lock scan (CR-05). This mirrors the canonical
 * finance loader's pattern for the same table.
 */
async function loadAccommodationSelectionsForOrder(
  ctx: QueryCtx | MutationCtx,
  orderId: Id<"orders">
): Promise<Array<Doc<"orderAccommodationSelections">>> {
  const rows: Array<Doc<"orderAccommodationSelections">> = []
  for await (const row of ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    rows.push(row)
  }
  return rows
}

async function loadPaidTotalForOrder(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<number> {
  const matchedPayments = await loadAppliedPaymentRowsForOrder(ctx, orderId)
  return matchedPayments.reduce((sum, payment) => sum + payment.amountMinor, 0)
}

function buildEditResult(
  bookingRef: string,
  status: "applied" | "unchanged" | "replayed",
  amountDueMinor: number,
  totalPaidMinor: number
) {
  const remainingMinor = Math.max(0, amountDueMinor - totalPaidMinor)
  const progressPercent =
    amountDueMinor <= 0
      ? 100
      : Math.min(100, Math.round((totalPaidMinor / amountDueMinor) * 100))
  const overpaymentDeltaMinor = Math.max(0, totalPaidMinor - amountDueMinor)
  return {
    bookingRef,
    status,
    amountDueMinor,
    totalPaidMinor,
    remainingMinor,
    progressPercent,
    overpaymentDeltaMinor,
  }
}

/**
 * Bounded, public, read-only projection for the durable permalink. Returns
 * the event's configured edit choices, the order's current options-only
 * selections, and whether any selection is confirmed (locked). Never returns
 * the edit token, request signature, payment link secrets, or raw ownership
 * credentials.
 */
export const getTrackPaymentEditContext = query({
  args: {
    bookingRef: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      bookingRef: v.string(),
      event: v.object({
        slug: v.string(),
        title: v.string(),
        startsAt: v.number(),
        currency: v.string(),
      }),
      locked: v.boolean(),
      hasSelections: v.boolean(),
      selections: v.array(
        v.object({
          attendeeKey: v.string(),
          attendeeName: v.string(),
          ticketLabel: v.string(),
          ticketCategoryId: v.optional(v.id("accommodationCategories")),
          categoryId: v.optional(v.id("accommodationCategories")),
          occupancy: v.optional(editOccupancyValidator),
          optionSelections: v.array(signupAccommodationOptionSelectionValidator),
          nightBeforeLevel: v.optional(
            v.union(v.literal("standard"), v.literal("superior"))
          ),
          confirmed: v.boolean(),
        })
      ),
      accommodation: v.object({
        eligible: v.boolean(),
        config: v.union(editAccommodationConfigValidator, v.null()),
        activeCategories: v.array(editChoiceCategoryValidator),
        options: v.array(editChoiceOptionValidator),
        nightBefore: v.union(
          v.null(),
          v.object({
            standard: v.object({ single: v.number(), shared: v.number() }),
            superior: v.object({ single: v.number(), shared: v.number() }),
          })
        ),
      }),
    })
  ),
  handler: async (ctx, args) => {
    const bookingRef = normalizeBookingRefForEdit(args.bookingRef)

    const order = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
      .first()

    if (!order || !order.eventId) {
      return null
    }

    const event = await ctx.db.get(order.eventId)
    if (!event) {
      return null
    }

    const [attendeeRows, ticketSelectionRows, selectionRows, optionSelectionRows, context] =
      await Promise.all([
        ctx.db
          .query("orderAttendees")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .take(500),
        ctx.db
          .query("orderTicketSelections")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .take(500),
        loadAccommodationSelectionsForOrder(ctx, order._id),
        ctx.db
          .query("orderAccommodationOptionSelections")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .take(500),
        loadPublicSignupAccommodationContext(ctx, order.eventId),
      ])

    const optionSelectionsBySelectionId = new Map<
      string,
      Array<{ optionKey: string; quantity: number; nights: number }>
    >()
    for (const optionRow of optionSelectionRows) {
      const selectionId = String(optionRow.selectionId)
      const existing =
        optionSelectionsBySelectionId.get(selectionId) ?? []
      existing.push({
        optionKey: optionRow.optionKey,
        quantity: optionRow.quantity,
        nights: optionRow.nights,
      })
      optionSelectionsBySelectionId.set(selectionId, existing)
    }

    const attendeeById = new Map(
      attendeeRows.map((attendee) => [String(attendee._id), attendee])
    )
    const ticketByAttendeeId = new Map<string, Id<"ticketTypes">>()
    for (const selection of ticketSelectionRows) {
      ticketByAttendeeId.set(String(selection.attendeeId), selection.ticketTypeId)
    }
    const ticketTypeIds = new Set(ticketSelectionRows.map((row) => row.ticketTypeId))
    const ticketDocs = await Promise.all(
      Array.from(ticketTypeIds).map((ticketTypeId) =>
        ctx.db.get("ticketTypes", ticketTypeId)
      )
    )
    const ticketById = new Map<string, Doc<"ticketTypes">>()
    const ticketLabelById = new Map<string, string>()
    for (const ticket of ticketDocs) {
      if (ticket) {
        ticketById.set(String(ticket._id), ticket)
        ticketLabelById.set(String(ticket._id), ticket.label)
      }
    }
    // Ticket entitlement (ticketTypes.roomTypeId → room type → category) so
    // the editor can offer only the category a constrained ticket allows.
    const ticketCategoryById = await resolveTicketCategoryById(ctx, ticketById)

    const locked = selectionRows.some(
      (row) => row.confirmedAt !== undefined && row.confirmedAt !== null
    )

    return {
      bookingRef,
      event: {
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        currency: event.currency,
      },
      locked,
      hasSelections: selectionRows.length > 0,
      selections: selectionRows.map((row) => {
        const attendee = attendeeById.get(String(row.attendeeId))
        const ticketTypeId = ticketByAttendeeId.get(String(row.attendeeId))
        const ticketEntitlement = ticketTypeId
          ? ticketCategoryById.get(String(ticketTypeId))
          : undefined
        return {
          attendeeKey: attendee?.attendeeKey ?? String(row.attendeeId),
          attendeeName: attendee?.name ?? "Attendee",
          ticketLabel: ticketTypeId
            ? (ticketLabelById.get(String(ticketTypeId)) ?? "Ticket")
            : "Ticket",
          // undefined = unconstrained ticket (any active category); a
          // resolved category restricts the offered choices.
          ticketCategoryId:
            ticketEntitlement === null || ticketEntitlement === undefined
              ? undefined
              : (ticketEntitlement.categoryId as Id<"accommodationCategories">),
          categoryId: row.categoryId ?? undefined,
          occupancy: row.occupancy ?? undefined,
          nightBeforeLevel: row.nightBeforeLevel ?? undefined,
          optionSelections: (optionSelectionsBySelectionId.get(String(row._id)) ?? [])
            .sort((left, right) => left.optionKey.localeCompare(right.optionKey))
            .map((optionSelection) => ({
              optionKey: optionSelection.optionKey,
              quantity: optionSelection.quantity,
              nights: optionSelection.nights,
            })),
          confirmed:
            row.confirmedAt !== undefined && row.confirmedAt !== null,
        }
      }),
      accommodation: buildEditChoices(context),
    }
  },
})

/**
 * Atomic replace-style accommodation edit for the public permalink.
 *
 * Guards (each before any write):
 * 1. A valid route-issued request signature over the exact normalized
 *    envelope (booking ref, ownership fields, idempotency key, honeypot
 *    marker, complete selections) — direct invocation fails closed.
 * 2. Ownership: normalized booker-email match OR an HMAC edit token bound to
 *    the booking ref and booker email; re-checked here, never trusted from
 *    the route or the UI.
 * 3. The order must have selection rows and none may be confirmed; any
 *    confirmed/malformed/missing row rejects the whole request atomically.
 * 4. The replacement set must match the existing selection rows exactly and
 *    every preference must resolve through the Phase 42 shared server
 *    resolver (ticket entitlement, active categories, rates, options, age
 *    bands, cot eligibility).
 *
 * A replacement identical to the current selections is a true no-op (no row
 * or audit writes). An already-used idempotency key returns its stored
 * result without repeating writes — the complete canonical response is
 * persisted on the audit row at apply time, so a replay never recomputes
 * money from mutable payment state (CR-08). Applied edits persist
 * server-resolved stay timestamps/night count, insert one append-only audit
 * row with server-derived amount-due before/after and the frozen response,
 * and never touch orders.totalAmountMinor, payments, orderAssignments, or
 * Tikkie links (flexible-zero links are never
 * regenerated/superseded/expired).
 */
export const updateAccommodation = mutation({
  args: {
    bookingRef: v.string(),
    bookerEmail: v.optional(v.string()),
    editToken: v.optional(v.string()),
    requestSignature: v.string(),
    idempotencyKey: v.string(),
    selections: v.array(editSelectionValidator),
  },
  returns: v.object({
    bookingRef: v.string(),
    status: v.union(
      v.literal("applied"),
      v.literal("unchanged"),
      v.literal("replayed")
    ),
    amountDueMinor: v.number(),
    totalPaidMinor: v.number(),
    remainingMinor: v.number(),
    progressPercent: v.number(),
    overpaymentDeltaMinor: v.number(),
  }),
  handler: async (ctx, args) => {
    const bookingRef = normalizeBookingRefForEdit(args.bookingRef)
    const bookerEmail = args.bookerEmail
      ? normalizeBookerEmail(args.bookerEmail)
      : null
    const idempotencyKey = args.idempotencyKey.trim()
    if (!idempotencyKey) {
      throwEditError("EDIT_INVALID", "An idempotency key is required.")
    }
    if (args.selections.length === 0) {
      throwEditError(
        "EDIT_INVALID",
        "A complete accommodation preference replacement is required."
      )
    }

    // Route-issued request signature: recomputed from the mutation's own
    // validated arguments so a captured signature cannot be replayed against
    // a different envelope, and a direct call without a signature fails
    // before any database read of editable detail.
    const requestSignatureValid = await verifyEditRequestSignature(
      args.requestSignature,
      {
        bookingRef,
        bookerEmail,
        editToken: args.editToken ?? null,
        idempotencyKey,
        selections: args.selections,
      }
    )
    if (!requestSignatureValid) {
      throwEditError(
        "SIGNATURE_REQUIRED",
        "A valid server-issued request signature is required before editing."
      )
    }

    const order = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
      .first()
    if (!order || !order.eventId) {
      throwEditError("EDIT_NOT_FOUND", "Booking not found.")
    }

    // Ownership is re-checked here, before any editable detail is loaded, so
    // a failed ownership check never reveals editability or selection data.
    let ownershipMethod: "email" | "token" | null = null
    const normalizedOrderEmail = order.bookerEmail
      ? normalizeBookerEmail(order.bookerEmail)
      : null
    if (bookerEmail && normalizedOrderEmail && bookerEmail === normalizedOrderEmail) {
      ownershipMethod = "email"
    } else if (args.editToken) {
      const tokenValid = await verifyTrackPaymentEditToken(args.editToken, {
        bookingRef,
        bookerEmail: normalizedOrderEmail ?? bookerEmail ?? "",
      })
      if (tokenValid) {
        ownershipMethod = "token"
      }
    }
    if (!ownershipMethod) {
      throwEditError(
        "EDIT_OWNERSHIP",
        "Ownership of this booking could not be verified."
      )
    }

    const event = await ctx.db.get(order.eventId)
    if (!event) {
      throwEditError("EDIT_NOT_FOUND", "Booking not found.")
    }

    // Request digest bound to the exact normalized envelope. Computed BEFORE
    // any mutable-state guard so the replay lookup never depends on the
    // current selection/configuration state (CR-03): a retry after the
    // organizer confirms, removes a choice, or changes configuration still
    // returns the stored replay result instead of a stale guard failure.
    const requestDigest = await digestEditEnvelope({
      bookingRef,
      bookerEmail,
      editToken: args.editToken ?? null,
      idempotencyKey,
      selections: args.selections,
    })

    // Idempotency (CR-03/CR-04): an already-used key returns its stored
    // result only when the retry carries the EXACT same envelope digest. A
    // reuse of the key with a different payload is an idempotency conflict —
    // the caller must mint a fresh key — never a misleading "replayed" for a
    // replacement that was not applied.
    const replayAuditRow = await ctx.db
      .query("orderAccommodationEditAudits")
      .withIndex("by_orderId_and_idempotencyKey", (q) =>
        q.eq("orderId", order._id).eq("idempotencyKey", idempotencyKey)
      )
      .first()
    if (replayAuditRow) {
      if (replayAuditRow.requestDigest !== requestDigest) {
        throwEditError(
          "EDIT_IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used for a different edit. Retry with a fresh key."
        )
      }
      // CR-08: return the COMPLETE canonical response persisted when the edit
      // was applied — never recompute money from the current payment rows,
      // which can drift (a payment posted or reclassified between attempts)
      // and would break the idempotent-replay contract that the retry returns
      // the exact originally stored server result.
      return {
        bookingRef,
        status: "replayed" as const,
        amountDueMinor: replayAuditRow.amountDueAfterMinor,
        totalPaidMinor: replayAuditRow.totalPaidMinor,
        remainingMinor: replayAuditRow.remainingMinor,
        progressPercent: replayAuditRow.progressPercent,
        overpaymentDeltaMinor: replayAuditRow.overpaymentDeltaMinor,
      }
    }

    const selectionRows = await loadAccommodationSelectionsForOrder(
      ctx,
      order._id
    )

    // Missing rows and the confirmedAt lock reject the whole request
    // atomically before any write.
    if (selectionRows.length === 0) {
      throwEditError(
        "EDIT_CONFLICT",
        "This booking has no accommodation preferences to edit."
      )
    }
    for (const row of selectionRows) {
      if (row.confirmedAt !== undefined && row.confirmedAt !== null) {
        throwEditError(
          "EDIT_CONFIRMED",
          "Accommodation preferences are locked because the organizer has confirmed this configuration."
        )
      }
    }

    const [attendeeRows, ticketSelectionRows] = await Promise.all([
      ctx.db
        .query("orderAttendees")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(500),
      ctx.db
        .query("orderTicketSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(500),
    ])
    const attendeeById = new Map(
      attendeeRows.map((attendee) => [String(attendee._id), attendee])
    )
    const attendeeKeyById = new Map<string, string>()
    for (const attendee of attendeeRows) {
      attendeeKeyById.set(String(attendee._id), attendee.attendeeKey)
    }
    const ticketByAttendeeId = new Map<string, Id<"ticketTypes">>()
    for (const selection of ticketSelectionRows) {
      ticketByAttendeeId.set(String(selection.attendeeId), selection.ticketTypeId)
    }
    const rowByAttendeeKey = new Map<string, (typeof selectionRows)[number]>()
    const existingAttendeeKeys = new Set<string>()
    for (const row of selectionRows) {
      const attendeeKey =
        attendeeKeyById.get(String(row.attendeeId)) ?? String(row.attendeeId)
      existingAttendeeKeys.add(attendeeKey)
      rowByAttendeeKey.set(attendeeKey, row)
    }

    // Cardinality contract: the replacement must contain exactly one
    // preference for every existing selection row.
    const incomingAttendeeKeys = new Set<string>()
    for (const preference of args.selections) {
      const attendeeKey = preference.attendeeKey.trim()
      if (!attendeeKey) {
        throwEditError("EDIT_INVALID", "An attendee key is required.")
      }
      if (incomingAttendeeKeys.has(attendeeKey)) {
        throwEditError(
          "EDIT_INVALID",
          `Duplicate attendee key '${attendeeKey}' in the replacement.`
        )
      }
      incomingAttendeeKeys.add(attendeeKey)
    }
    if (
      incomingAttendeeKeys.size !== existingAttendeeKeys.size ||
      !Array.from(existingAttendeeKeys).every((key) =>
        incomingAttendeeKeys.has(key)
      )
    ) {
      throwEditError(
        "EDIT_CONFLICT",
        "The replacement must contain exactly one preference for every existing attendee."
      )
    }

    // Resolve ticket entitlement and every preference through the Phase 42
    // shared resolver so quote, signup, and permalink can never disagree.
    const ticketTypeIds = new Set(ticketSelectionRows.map((row) => row.ticketTypeId))
    const ticketDocs = await Promise.all(
      Array.from(ticketTypeIds).map((ticketTypeId) =>
        ctx.db.get("ticketTypes", ticketTypeId)
      )
    )
    const ticketById = new Map<string, Doc<"ticketTypes">>()
    for (const ticket of ticketDocs) {
      if (ticket) {
        ticketById.set(String(ticket._id), ticket)
      }
    }
    const ticketCategoryById = await resolveTicketCategoryById(ctx, ticketById)
    const context = await loadPublicSignupAccommodationContext(ctx, order.eventId)

    const resolvedByAttendeeKey = new Map<
      string,
      {
        categoryId: string
        occupancy: "single" | "shared" | "family"
        nightCount: number | null
        nightBeforeLevel: "standard" | "superior" | null
        optionSelections: Array<{
          optionKey: string
          quantity: number
          nights: number
        }>
      }
    >()
    for (const preference of args.selections) {
      const attendeeKey = preference.attendeeKey.trim()
      const row = rowByAttendeeKey.get(attendeeKey)
      if (!row) {
        throwEditError(
          "EDIT_CONFLICT",
          `Attendee '${attendeeKey}' has no existing accommodation preference.`
        )
      }
      const ticketTypeId = ticketByAttendeeId.get(String(row.attendeeId))
      const ticket = ticketTypeId ? ticketById.get(String(ticketTypeId)) : null
      if (!ticket) {
        throwEditError(
          "EDIT_CONFLICT",
          `Attendee '${attendeeKey}' has no resolvable ticket selection.`
        )
      }
      const ticketEntitlement = ticketCategoryById.get(String(ticketTypeId))
      if (ticketEntitlement === null) {
        throwEditError(
          "EDIT_CONFLICT",
          "The selected ticket's room type is no longer available."
        )
      }
      const ticketCategoryId = ticketEntitlement?.categoryId ?? null

      let resolved: ReturnType<typeof resolvePublicSignupSelection>
      try {
        resolved = resolvePublicSignupSelection({
          context,
          selection: {
            categoryId: preference.categoryId
              ? String(preference.categoryId)
              : null,
            occupancy: preference.occupancy ?? null,
            optionSelections: preference.optionSelections,
            nightBeforeLevel: preference.nightBeforeLevel ?? null,
            nights: undefined,
          },
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Invalid accommodation selection"
        throwEditError(
          "EDIT_INVALID",
          message.replace(/^QUOTE_INVALID:\s*/, "")
        )
      }

      if (!resolved.categoryId || !resolved.occupancy) {
        throwEditError(
          "EDIT_INVALID",
          "An occupancy is required when the event offers configured accommodation."
        )
      }

      resolvedByAttendeeKey.set(attendeeKey, {
        categoryId: String(resolved.categoryId),
        occupancy: resolved.occupancy,
        nightCount: resolved.nightCount ?? null,
        nightBeforeLevel: resolved.nightBeforeLevel,
        optionSelections: resolved.options,
      })
    }

    const beforeOptionRows: Array<Doc<"orderAccommodationOptionSelections">> = []
    for await (const optionRow of ctx.db
      .query("orderAccommodationOptionSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
      beforeOptionRows.push(optionRow)
    }
    const beforeOptionSelectionsBySelectionId = new Map<
      string,
      Array<{ optionKey: string; quantity: number; nights: number }>
    >()
    for (const optionRow of beforeOptionRows) {
      const selectionId = String(optionRow.selectionId)
      const existing =
        beforeOptionSelectionsBySelectionId.get(selectionId) ?? []
      existing.push({
        optionKey: optionRow.optionKey,
        quantity: optionRow.quantity,
        nights: optionRow.nights,
      })
      beforeOptionSelectionsBySelectionId.set(selectionId, existing)
    }

    const beforeSelectionDigest = await digestAccommodationSelections(
      selectionRows.map((row) => ({
        attendeeKey:
          attendeeKeyById.get(String(row.attendeeId)) ?? String(row.attendeeId),
        categoryId: row.categoryId ? String(row.categoryId) : null,
        occupancy: row.occupancy ?? null,
        nightBeforeLevel: row.nightBeforeLevel ?? null,
        optionSelections:
          beforeOptionSelectionsBySelectionId.get(String(row._id)) ?? [],
      }))
    )
    const afterSelectionDigest = await digestAccommodationSelections(
      Array.from(resolvedByAttendeeKey.entries()).map(
        ([attendeeKey, resolved]) => ({
          attendeeKey,
          categoryId: resolved.categoryId,
          occupancy: resolved.occupancy,
          nightBeforeLevel: resolved.nightBeforeLevel,
          optionSelections: resolved.optionSelections,
        })
      )
    )

    // A replacement identical to the current preferences is a true no-op:
    // no selection or audit writes, and the canonical amount is returned.
    if (beforeSelectionDigest === afterSelectionDigest) {
      const breakdown = await loadOrderAmountDueBreakdowns(ctx, [
        { _id: order._id },
      ])
      const amountDue = breakdown.get(String(order._id))?.amountDueMinor ?? 0
      const totalPaid = await loadPaidTotalForOrder(ctx, order._id)
      return buildEditResult(bookingRef, "unchanged", amountDue, totalPaid)
    }

    const beforeBreakdown = await loadOrderAmountDueBreakdowns(ctx, [
      { _id: order._id },
    ])
    const amountDueBefore =
      beforeBreakdown.get(String(order._id))?.amountDueMinor ?? 0

    // Patch every unconfirmed selection with the server-resolved preference
    // and the current event configuration's stay timestamps/night count, and
    // atomically replace the generic option child rows (delete-then-insert
    // under the same base selection). No order total, payment, assignment, or
    // Tikkie link is touched.
    for (const row of selectionRows) {
      const attendeeKey =
        attendeeKeyById.get(String(row.attendeeId)) ?? String(row.attendeeId)
      const resolved = resolvedByAttendeeKey.get(attendeeKey)
      if (!resolved) {
        throwEditError(
          "EDIT_CONFLICT",
          `Attendee '${attendeeKey}' could not be resolved for replacement.`
        )
      }
      await ctx.db.patch("orderAccommodationSelections", row._id, {
        // The server-resolved included-stay category is persisted for admin
        // allocation; the buyer never supplied it.
        categoryId: resolved.categoryId as Id<"accommodationCategories">,
        occupancy: resolved.occupancy,
        checkInAt: context.config?.baseCheckInAt,
        checkOutAt: context.config?.baseCheckOutAt,
        // The derived total nights (base, or base + 1 with a night-before)
        // plus the independent night-before level are persisted so the
        // canonical loader re-derives the same lines as the quote.
        nightCount: resolved.nightCount ?? context.config?.nightCount,
        nightBeforeLevel: resolved.nightBeforeLevel ?? undefined,
      })
      for await (const optionRow of ctx.db
        .query("orderAccommodationOptionSelections")
        .withIndex("by_selectionId", (q) => q.eq("selectionId", row._id))) {
        await ctx.db.delete("orderAccommodationOptionSelections", optionRow._id)
      }
      for (const [sortOrder, optionSelection] of resolved.optionSelections.entries()) {
        await ctx.db.insert("orderAccommodationOptionSelections", {
          orderId: order._id,
          attendeeId: row.attendeeId,
          selectionId: row._id,
          optionKey: optionSelection.optionKey,
          quantity: optionSelection.quantity,
          nights: optionSelection.nights,
          sortOrder,
        })
      }
    }

    const afterBreakdown = await loadOrderAmountDueBreakdowns(ctx, [
      { _id: order._id },
    ])
    const amountDueAfter =
      afterBreakdown.get(String(order._id))?.amountDueMinor ?? 0

    const totalPaid = await loadPaidTotalForOrder(ctx, order._id)
    const result = buildEditResult(bookingRef, "applied", amountDueAfter, totalPaid)

    // One immutable, server-valued audit row per applied edit. The COMPLETE
    // canonical response is persisted (CR-08) so an idempotent replay of the
    // same key returns the exact originally stored money result — the
    // derived fields are frozen here and never recomputed from mutable
    // payment state on replay.
    await ctx.db.insert("orderAccommodationEditAudits", {
      orderId: order._id,
      idempotencyKey,
      requestDigest,
      ownershipMethod,
      beforeSelectionDigest,
      afterSelectionDigest,
      amountDueBeforeMinor: amountDueBefore,
      amountDueAfterMinor: amountDueAfter,
      totalPaidMinor: result.totalPaidMinor,
      remainingMinor: result.remainingMinor,
      progressPercent: result.progressPercent,
      overpaymentDeltaMinor: result.overpaymentDeltaMinor,
    })

    return result
  },
})
