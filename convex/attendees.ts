import { query, mutation } from "./_generated/server"
import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"
import { requireIdentity } from "./auth"
import { api } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { loadOrderAmountDueBreakdowns, loadOrderPaymentAttributions } from "./finance"
import {
  loadPublicSignupAccommodationContext,
  resolvePublicSignupSelection,
  resolveTicketCategoryById,
  type PublicSignupSelectionResolved,
} from "./signupCatalog"
import {
  buildSearchHaystack,
  collectSourceSearchPage,
  decodeSourceScanBoundary,
  encodeSourceScanBoundary,
  matchesNormalizedSearch,
  requireSearchNeedle,
  type SourceScanBoundary,
  type SourceSearchFetchedPage,
} from "./search"

type AttendeeResolveCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">

function isOrderMerged(order: Doc<"orders">) {
  return typeof order.mergedIntoOrderId === "string"
}

type TicketFinancials = {
  ticketTypeId: Id<"ticketTypes"> | null
  ticketTypeLabel: string | null
  amountDueMinor: number
}

function normalizeLowerGenderToUpper(
  gender: "male" | "female" | "mixed" | "unknown"
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" {
  switch (gender) {
    case "male":
      return "MALE"
    case "female":
      return "FEMALE"
    case "mixed":
      return "MIXED"
    case "unknown":
    default:
      return "UNKNOWN"
  }
}

function normalizeUpperGenderToLower(
  gender: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
): "male" | "female" | "mixed" | "unknown" {
  switch (gender) {
    case "MALE":
      return "male"
    case "FEMALE":
      return "female"
    case "MIXED":
      return "mixed"
    case "UNKNOWN":
    default:
      return "unknown"
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergeCustomAnswers(input: {
  canonicalAttendee?: {
    location?: string | null
    dietaryRestrictions?: string | null
    roommatePreference?: string | null
    roommateAvoid?: string | null
  } | null
  ticketTailorAttendee?: { customAnswers?: unknown } | null
}) {
  const customAnswers = isPlainObject(input.ticketTailorAttendee?.customAnswers)
    ? { ...input.ticketTailorAttendee!.customAnswers }
    : {}

  if (input.canonicalAttendee?.location && !("location" in customAnswers)) {
    customAnswers.location = input.canonicalAttendee.location
  }

  if (
    input.canonicalAttendee?.dietaryRestrictions &&
    !("dietary" in customAnswers)
  ) {
    customAnswers.dietary = input.canonicalAttendee.dietaryRestrictions
  }

  if (
    input.canonicalAttendee?.roommatePreference &&
    !("roommatePreference" in customAnswers)
  ) {
    customAnswers.roommatePreference =
      input.canonicalAttendee.roommatePreference
  }

  if (
    input.canonicalAttendee?.roommateAvoid &&
    !("roommateAvoid" in customAnswers)
  ) {
    customAnswers.roommateAvoid = input.canonicalAttendee.roommateAvoid
  }

  return Object.keys(customAnswers).length > 0 ? customAnswers : null
}

async function getTicketFinancialsForAttendee(
  ctx: AttendeeResolveCtx,
  orderId: Id<"orders">,
  attendeeId: string
) : Promise<TicketFinancials> {
  const selections = await ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(100)

  const selection = selections.find(
    (entry: { attendeeId?: unknown }) => String(entry.attendeeId) === attendeeId
  )

  if (!selection) {
    return {
      ticketTypeId: null,
      ticketTypeLabel: null,
      amountDueMinor: 0,
    }
  }

  const ticketType = await ctx.db.get(
    selection.ticketTypeId as Id<"ticketTypes">
  )

  return {
    ticketTypeId: selection.ticketTypeId,
    ticketTypeLabel: ticketType?.label ?? null,
    amountDueMinor:
      ticketType && Number.isFinite(ticketType.priceMinor)
        ? ticketType.priceMinor * selection.quantity
        : 0,
  }
}

async function resolveAttendeeRecordByStringId(
  ctx: AttendeeResolveCtx,
  attendeeId: string
) {
  const canonicalAttendeeId = ctx.db.normalizeId("orderAttendees", attendeeId)

  if (canonicalAttendeeId) {
    const canonicalAttendee = await ctx.db.get(
      "orderAttendees",
      canonicalAttendeeId
    )

    if (!canonicalAttendee) {
      return null
    }

    const order = await ctx.db.get("orders", canonicalAttendee.orderId)

    if (!order) {
      return null
    }

    const ticketTailorAttendee = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("attendeeId", (q) => q.eq("attendeeId", canonicalAttendeeId))
      .first()

    const ticketFinancials = await getTicketFinancialsForAttendee(
      ctx,
      canonicalAttendee.orderId,
      String(canonicalAttendeeId)
    )

    return {
      canonicalAttendee,
      ticketTailorAttendee,
      order,
      ticketFinancials: {
        ...ticketFinancials,
        ticketTypeLabel:
          ticketTailorAttendee?.ticketTypeLabel ??
          ticketFinancials.ticketTypeLabel,
      },
    }
  }

  const ticketTailorAttendeeId = ctx.db.normalizeId(
    "ticketTailorAttendees",
    attendeeId
  )

  if (!ticketTailorAttendeeId) {
    return null
  }

  const ticketTailorAttendee = await ctx.db.get(
    "ticketTailorAttendees",
    ticketTailorAttendeeId
  )

  if (!ticketTailorAttendee) {
    return null
  }

  const canonicalAttendee = ticketTailorAttendee.attendeeId
    ? await ctx.db.get("orderAttendees", ticketTailorAttendee.attendeeId)
    : null
  const order = await ctx.db.get("orders", ticketTailorAttendee.orderId)

  if (!order) {
    return null
  }

  const ticketFinancials = canonicalAttendee
    ? await getTicketFinancialsForAttendee(
        ctx,
        ticketTailorAttendee.orderId,
        String(canonicalAttendee._id)
      )
    : { ticketTypeId: null, ticketTypeLabel: null, amountDueMinor: 0 }

  return {
    canonicalAttendee,
    ticketTailorAttendee,
    order,
    ticketFinancials: {
      ...ticketFinancials,
      ticketTypeLabel:
        ticketTailorAttendee.ticketTypeLabel ??
        ticketFinancials.ticketTypeLabel,
    },
  }
}

function filterAttendees(
  attendees: Array<{
    assignedRoomId?: string
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }>,
  args: {
    assignedRoomId?: string
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }
) {
  return attendees.filter((attendee) => {
    if (args.assignedRoomId !== undefined) {
      const assignedRoomId = attendee.assignedRoomId ?? undefined
      if (assignedRoomId !== args.assignedRoomId) {
        return false
      }
    }

    if (args.genderType && attendee.genderType !== args.genderType) {
      return false
    }

    if (
      args.allocationPriority &&
      attendee.allocationPriority !== args.allocationPriority
    ) {
      return false
    }

    return true
  })
}

export const getAttendees = query({
  args: {
    eventId: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    assignedRoomId: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.orderId) {
      // Bounded: one order has a small number of attendees
      return await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("orderId", (q) => q.eq("orderId", args.orderId!))
        .take(100)
    }

    if (args.eventId) {
      const base = ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerEventOrder", (q) =>
          q.eq("providerEventId", args.eventId!)
        )

      if (args.paginationOpts) {
        return await base.paginate(args.paginationOpts)
      }

      // Backward-compatible: bounded fallback when no pagination requested
      const attendees = await base.take(500)
      return filterAttendees(attendees, args)
    }

    const base = ctx.db.query("ticketTailorAttendees")

    if (args.paginationOpts) {
      return await base.paginate(args.paginationOpts)
    }

    // Backward-compatible: bounded fallback
    const attendees = await base.take(500)
    return filterAttendees(attendees, args)
  },
})

export const getAttendeesWithTickets = query({
  args: {
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get orders (optionally filtered by eventId)
    const orders = args.eventId
      ? await ctx.db
          .query("orders")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", args.eventId as Id<"events">)
          )
          .collect()
      : await ctx.db.query("orders").collect()

    const orderMap = new Map(orders.map((o) => [o._id, o]))
    const orderIds = new Set(orders.map((o) => o._id))
    const amountDueByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)

    // Get all attendees for these orders
    const allAttendees = await ctx.db.query("orderAttendees").collect()
    const attendees = allAttendees.filter((a) => orderIds.has(a.orderId))

    // Get ticket selections for these orders (join by orderId)
    const allSelections = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("orderTicketSelections")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .collect()
      )
    )
    const selections = allSelections.flat()

    // Get ticket types
    const ticketTypeIds = Array.from(
      new Set(selections.map((s) => String(s.ticketTypeId)))
    )
    const ticketTypes = await Promise.all(
      ticketTypeIds.map((id) => ctx.db.get(id as Id<"ticketTypes">))
    )
    const ticketTypeMap = new Map(
      ticketTypes.filter(Boolean).map((tt) => [tt!._id, tt!.label])
    )

    // Build attendeeId -> ticketTypeLabel map
    const ticketLabelByAttendeeId = new Map<string, string>()
    for (const sel of selections) {
      const label = ticketTypeMap.get(sel.ticketTypeId)
      if (label) {
        ticketLabelByAttendeeId.set(String(sel.attendeeId), label)
      }
    }

    // Return attendees with ticketTypeLabel AND order data
    return attendees.map((a) => {
      const order = orderMap.get(a.orderId)
      const amountBreakdown = amountDueByOrderId.get(String(a.orderId))
      const amountDueMinor =
        amountBreakdown?.amountDueByAttendeeId.get(String(a._id)) ?? 0
      return {
        _id: a._id,
        orderId: a.orderId,
        name: a.name,
        email: a.email ?? null,
        gender: a.gender,
        location: a.location ?? null,
        assignedRoomId: a.assignedRoomId ?? null,
        allocationPriority: a.allocationPriority ?? null,
        priorityReason: a.priorityReason ?? null,
        ticketTypeLabel: ticketLabelByAttendeeId.get(String(a._id)) ?? null,
        amountDueMinor,
        // Order data embedded
        orderProviderOrderId: order?.providerOrderId ?? null,
        orderEventId: order?.eventId ?? null,
        orderStatus: order?.status ?? null,
        orderTotalAmountMinor: order?.totalAmountMinor ?? null,
        orderAmountDueMinor: amountBreakdown?.amountDueMinor ?? null,
        orderSubmittedAt: order?.submittedAt ?? null,
        orderOrderedAt: order?.orderedAt ?? null,
        allocatedRoomTypeId: a.allocatedRoomTypeId ?? null,
      }
    })
  },
})

const LEDGER_PAGE_MAX = 100
const LEDGER_CURSOR_PREFIX = "al:"
const EVENT_LEDGER_SOURCE_CURSOR_PREFIX = "ao:"
/** Hard candidate-scan budget per invocation, mirroring the orders search path. */
const ATTENDEE_SEARCH_SCAN_CAP = 2_000
/**
 * Keep event-source reads well below Convex's 4,096 index-range limit. The
 * ledger page is capped at 100 rows; current row and finance enrichment can
 * consume roughly 1,500 ranges in the worst distinct-order case, so this
 * source budget leaves a conservative margin for those reads.
 */
const EVENT_LEDGER_RANGE_BUDGET = 500
/** Keep same-timestamp boundary reads below Convex's document scan limit. */
const EVENT_LEDGER_CURSOR_MAX_IDS = 16_000

type LedgerCursor = {
  version: 2 | 3
  signature: string
  sourceCursor: string | null
  from?: number
  to?: number
}

type EventLedgerSourceCursor = {
  version: 1
  orderBoundary: SourceScanBoundary | null
  activeOrderId: string | null
  attendeeBoundary: SourceScanBoundary | null
}

function decodeLedgerCursor(cursor: string): LedgerCursor {
  try {
    const value = JSON.parse(decodeURIComponent(cursor.slice(LEDGER_CURSOR_PREFIX.length))) as LedgerCursor
    if (
      (value.version !== 2 && value.version !== 3) ||
      typeof value.signature !== "string" ||
      (value.sourceCursor !== null && typeof value.sourceCursor !== "string") ||
      (value.version === 3 &&
        (typeof value.from !== "number" ||
          !Number.isFinite(value.from) ||
          typeof value.to !== "number" ||
          !Number.isFinite(value.to)))
    ) {
      throw new Error()
    }
    return value
  } catch {
    throw new Error("Invalid attendee ledger continuation cursor.")
  }
}

function encodeLedgerCursor(value: LedgerCursor) {
  return `${LEDGER_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(value))}`
}

function isSourceBoundary(value: unknown): value is SourceScanBoundary {
  if (!value || typeof value !== "object") return false
  const candidate = value as { t?: unknown; ids?: unknown }
  return (
    typeof candidate.t === "number" &&
    Number.isFinite(candidate.t) &&
    Array.isArray(candidate.ids) &&
    candidate.ids.length <= EVENT_LEDGER_CURSOR_MAX_IDS &&
    candidate.ids.every((id) => typeof id === "string")
  )
}

function encodeEventLedgerSourceCursor(value: EventLedgerSourceCursor) {
  return `${EVENT_LEDGER_SOURCE_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify(value))}`
}

function decodeEventLedgerSourceCursor(cursor: string): EventLedgerSourceCursor {
  if (!cursor.startsWith(EVENT_LEDGER_SOURCE_CURSOR_PREFIX)) {
    throw new Error("Invalid attendee ledger continuation cursor.")
  }

  try {
    const parsed = JSON.parse(
      decodeURIComponent(cursor.slice(EVENT_LEDGER_SOURCE_CURSOR_PREFIX.length))
    ) as Partial<EventLedgerSourceCursor>

    if (
      parsed.version !== 1 ||
      (parsed.orderBoundary !== null && !isSourceBoundary(parsed.orderBoundary)) ||
      (parsed.attendeeBoundary !== null && !isSourceBoundary(parsed.attendeeBoundary)) ||
      (parsed.activeOrderId !== null && typeof parsed.activeOrderId !== "string") ||
      (parsed.activeOrderId === null) !== (parsed.attendeeBoundary === null)
    ) {
      throw new Error()
    }

    return {
      version: 1,
      orderBoundary: parsed.orderBoundary ?? null,
      activeOrderId: parsed.activeOrderId ?? null,
      attendeeBoundary: parsed.attendeeBoundary ?? null,
    }
  } catch {
    throw new Error("Invalid attendee ledger continuation cursor.")
  }
}

function advanceSourceBoundary(
  boundary: SourceScanBoundary | null,
  createdAt: number,
  id: string
): SourceScanBoundary {
  const carried = boundary?.t === createdAt ? boundary.ids : []
  const ids = Array.from(new Set([...carried, id]))
  if (ids.length > EVENT_LEDGER_CURSOR_MAX_IDS) {
    throw new Error("Attendee ledger cursor boundary is too large.")
  }
  return {
    t: createdAt,
    ids,
  }
}

/**
 * Bounded canonical attendee ledger search. Event-scoped reads start at the
 * order aggregate (`orders.by_eventId`) and load child attendees through
 * `orderId`; the copied `orderAttendees.eventId` is not a read dependency.
 * Global reads retain the legacy attendee-rooted source scan because they do
 * not have an event boundary to use as a parent query.
 */
export const getAttendeeLedgerPage = query({
  args: {
    eventId: v.optional(v.id("events")),
    search: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.number(),
    from: v.optional(v.union(v.number(), v.null())),
    to: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > LEDGER_PAGE_MAX) {
      throw new Error("Invalid attendee ledger page size.")
    }
    const needle = requireSearchNeedle(args.search)
    const dateMode = args.eventId && args.from == null && args.to == null ? "all-time" : "bounded"
    const now = Date.now()
    let from = args.eventId
      ? (args.from ?? 0)
      : (args.from ?? now - 29 * 24 * 60 * 60 * 1000)
    let to = args.to ?? now
    const cursorVersion = 3 as const
    const legacySignature = JSON.stringify({ v: 2, eventId: args.eventId ?? null, search: needle, from: args.from ?? null, to: args.to ?? null, dateMode })
    const buildSignature = (effectiveFrom: number, effectiveTo: number) =>
      JSON.stringify({ v: cursorVersion, eventId: args.eventId ?? null, search: needle, from: args.from ?? null, to: args.to ?? null, effectiveFrom, effectiveTo, dateMode })
    let signature = buildSignature(from, to)
    let sourceCursor: string | null = null
    if (args.cursor) {
      const decoded = decodeLedgerCursor(args.cursor)
      if (decoded.version === 2) {
        if (args.eventId || decoded.signature !== legacySignature) {
          throw new Error("Attendee ledger cursor does not match the request.")
        }
        signature = decoded.signature
      } else {
        from = decoded.from!
        to = decoded.to!
        signature = buildSignature(from, to)
        if (decoded.signature !== signature) {
          throw new Error("Attendee ledger cursor does not match the request.")
        }
      }
      sourceCursor = decoded.sourceCursor
    }
    if (from > to) throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")

    type LedgerCandidate = { attendee: Doc<"orderAttendees">; order: Doc<"orders"> | null }
    const orderCache = new Map<string, Doc<"orders"> | null>()
    let eventRangeReads = 0
    const reserveEventRange = () => {
      if (eventRangeReads >= EVENT_LEDGER_RANGE_BUDGET) return false
      eventRangeReads += 1
      return true
    }
    const fetchEventPage = async (
      cursor: string | null,
      limit: number
    ): Promise<SourceSearchFetchedPage<LedgerCandidate>> => {
      const state = cursor
        ? decodeEventLedgerSourceCursor(cursor)
        : {
            version: 1 as const,
            orderBoundary: null,
            activeOrderId: null,
            attendeeBoundary: null,
          }
      let orderBoundary = state.orderBoundary
      let activeOrderId = state.activeOrderId
      let attendeeBoundary = state.attendeeBoundary
      let scanCapped = false
      let pendingOrders: Doc<"orders">[] = []
      let pendingOrderIndex = 0
      const items: LedgerCandidate[] = []

      const nextOrder = async () => {
        for (;;) {
          if (pendingOrderIndex < pendingOrders.length) {
            const candidate = pendingOrders[pendingOrderIndex++]
            const orderBoundaryBefore = orderBoundary
            const nextBoundary = advanceSourceBoundary(
              orderBoundary,
              candidate._creationTime,
              String(candidate._id)
            )
            if (isOrderMerged(candidate)) {
              orderBoundary = nextBoundary
              continue
            }
            return { order: candidate, orderBoundaryBefore }
          }

          pendingOrders = []
          pendingOrderIndex = 0
          if (!reserveEventRange()) {
            scanCapped = true
            return null
          }

          const excluded = new Set(orderBoundary?.ids ?? [])
          const takeCount = Math.max(2, limit + excluded.size + 1)
          const query =
            orderBoundary === null
              ? ctx.db
                  .query("orders")
                  .withIndex("by_eventId", (q) =>
                    q.eq("eventId", args.eventId!)
                  )
                  .order("desc")
              : ctx.db
                  .query("orders")
                  .withIndex("by_eventId", (q) =>
                    q.eq("eventId", args.eventId!).lte(
                      "_creationTime",
                      orderBoundary!.t
                    )
                  )
                  .order("desc")
          const candidates = await query.take(takeCount)
          pendingOrders =
            orderBoundary === null
              ? candidates
              : candidates.filter(
                  (candidate) =>
                    !(
                      candidate._creationTime === orderBoundary!.t &&
                      excluded.has(String(candidate._id))
                    )
                )
          if (
            pendingOrders.length === 0 &&
            (candidates.length < takeCount || candidates.length === 0)
          ) {
            return null
          }
        }
      }

      while (items.length < limit) {
        let order: Doc<"orders"> | null = null
        let orderBoundaryBefore = orderBoundary

        if (activeOrderId) {
          const normalizedOrderId = ctx.db.normalizeId("orders", activeOrderId)
          if (!normalizedOrderId) {
            throw new Error("Invalid attendee ledger continuation cursor.")
          }
          if (!reserveEventRange()) {
            scanCapped = true
            break
          }
          order = await ctx.db.get("orders", normalizedOrderId)
          if (!order || String(order.eventId) !== String(args.eventId)) {
            throw new Error("Invalid attendee ledger continuation cursor.")
          }
        } else {
          const next = await nextOrder()
          if (!next) break
          order = next.order
          orderBoundaryBefore = next.orderBoundaryBefore
        }

        if (isOrderMerged(order)) {
          orderBoundary = advanceSourceBoundary(
            orderBoundaryBefore,
            order._creationTime,
            String(order._id)
          )
          activeOrderId = null
          attendeeBoundary = null
          continue
        }

        const remaining = limit - items.length
        const excluded = new Set(attendeeBoundary?.ids ?? [])
        const takeCount = Math.max(2, remaining + excluded.size + 1)
        const attendeeQuery =
          attendeeBoundary === null
            ? ctx.db
                .query("orderAttendees")
                .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
                .order("desc")
            : ctx.db
                .query("orderAttendees")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", order._id!).lte(
                    "_creationTime",
                    attendeeBoundary!.t
                  )
                )
                .order("desc")
        if (!reserveEventRange()) {
          scanCapped = true
          break
        }
        const candidates = await attendeeQuery.take(takeCount)
        const fresh =
          attendeeBoundary === null
            ? candidates
            : candidates.filter(
                (candidate) =>
                  !(
                    candidate._creationTime === attendeeBoundary!.t &&
                    excluded.has(String(candidate._id))
                  )
              )
        const hasMore = fresh.length > remaining
        const scanned = hasMore ? fresh.slice(0, remaining) : fresh
        items.push(...scanned.map((attendee) => ({ attendee, order })))

        if (hasMore && scanned.length > 0) {
          const last = scanned[scanned.length - 1]
          attendeeBoundary = advanceSourceBoundary(
            attendeeBoundary,
            last._creationTime,
            String(last._id)
          )
          activeOrderId = String(order._id)
          return {
            items,
            continueCursor: encodeEventLedgerSourceCursor({
              version: 1,
              orderBoundary: orderBoundaryBefore,
              activeOrderId,
              attendeeBoundary,
            }),
            isDone: false,
          }
        }

        orderBoundary = advanceSourceBoundary(
          orderBoundaryBefore,
          order._creationTime,
          String(order._id)
        )
        activeOrderId = null
        attendeeBoundary = null
      }

      const hasNextEventOrder = async (
        boundary: SourceScanBoundary | null,
        queuedOrders: Doc<"orders">[],
        queuedOrderIndex: number
      ) => {
        let scanBoundary = boundary
        const stopAtCheckedBoundary = () => {
          orderBoundary = scanBoundary
          scanCapped = true
          return true
        }

        for (const candidate of queuedOrders.slice(queuedOrderIndex)) {
          const nextBoundary = advanceSourceBoundary(
            scanBoundary,
            candidate._creationTime,
            String(candidate._id)
          )
          if (isOrderMerged(candidate)) {
            scanBoundary = nextBoundary
            continue
          }
          if (!reserveEventRange()) {
            return stopAtCheckedBoundary()
          }
          const attendee = await ctx.db
            .query("orderAttendees")
            .withIndex("by_orderId", (q) => q.eq("orderId", candidate._id))
            .first()
          scanBoundary = nextBoundary
          if (attendee) return true
        }

        for (;;) {
          if (!reserveEventRange()) {
            return stopAtCheckedBoundary()
          }
          const excluded = new Set(scanBoundary?.ids ?? [])
          const takeCount = Math.max(2, excluded.size + 1)
          const query =
            scanBoundary === null
              ? ctx.db
                  .query("orders")
                  .withIndex("by_eventId", (q) =>
                    q.eq("eventId", args.eventId!)
                  )
                  .order("desc")
              : ctx.db
                  .query("orders")
                  .withIndex("by_eventId", (q) =>
                    q.eq("eventId", args.eventId!).lte(
                      "_creationTime",
                      scanBoundary!.t
                    )
                  )
                  .order("desc")
          const candidates = await query.take(takeCount)
          const fresh =
            scanBoundary === null
              ? candidates
              : candidates.filter(
                  (candidate) =>
                    !(
                      candidate._creationTime === scanBoundary!.t &&
                      excluded.has(String(candidate._id))
                    )
                )

          for (const candidate of fresh) {
            const nextBoundary = advanceSourceBoundary(
              scanBoundary,
              candidate._creationTime,
              String(candidate._id)
            )
            if (isOrderMerged(candidate)) {
              scanBoundary = nextBoundary
              continue
            }
            if (!reserveEventRange()) {
              return stopAtCheckedBoundary()
            }
            const attendee = await ctx.db
              .query("orderAttendees")
              .withIndex("by_orderId", (q) => q.eq("orderId", candidate._id))
              .first()
            scanBoundary = nextBoundary
            if (attendee) return true
          }

          if (candidates.length < takeCount || candidates.length === 0) {
            return false
          }
        }

        return stopAtCheckedBoundary()
      }

      if (items.length >= limit) {
        const hasNext = await hasNextEventOrder(
          orderBoundary,
          pendingOrders,
          pendingOrderIndex
        )
        return {
          items,
          continueCursor: hasNext
            ? encodeEventLedgerSourceCursor({
                version: 1,
                orderBoundary,
                activeOrderId,
                attendeeBoundary,
              })
            : null,
          isDone: !hasNext,
          stopAfterPage: scanCapped,
        }
      }

      if (scanCapped) {
        return {
          items,
          continueCursor: encodeEventLedgerSourceCursor({
            version: 1,
            orderBoundary,
            activeOrderId,
            attendeeBoundary,
          }),
          isDone: false,
          stopAfterPage: true,
        }
      }

      return { items, continueCursor: null, isDone: true }
    }

    const fetchPage = async (
      cursor: string | null,
      limit: number
    ): Promise<SourceSearchFetchedPage<LedgerCandidate>> => {
      if (args.eventId) {
        return await fetchEventPage(cursor, limit)
      }

      // Convex allows only ONE paginated query per function execution, so the
      // global fallback scans with `.take()` and carries its own
      // `_creationTime` boundary cursor instead.
      const bound = decodeSourceScanBoundary(cursor)
      const excluded = new Set(bound?.ids ?? [])
      const takeCount = limit + excluded.size + 1
      const rows =
        bound === null
          ? await ctx.db.query("orderAttendees").order("desc").take(takeCount)
          : await ctx.db
              .query("orderAttendees")
              .order("desc")
              .filter((q) => q.lte(q.field("_creationTime"), bound.t))
              .take(takeCount)
      const fresh =
        bound === null
          ? rows
          : rows.filter(
              (row) =>
                !(
                  row._creationTime === bound.t &&
                  excluded.has(String(row._id))
                )
            )
      const hasMore = fresh.length > limit
      const scanned = hasMore ? fresh.slice(0, limit) : fresh
      const items: LedgerCandidate[] = []
      for (const attendee of scanned) {
        const key = String(attendee.orderId)
        let order: Doc<"orders"> | null
        if (orderCache.has(key)) {
          order = orderCache.get(key) ?? null
        } else {
          order = await ctx.db.get("orders", attendee.orderId)
          orderCache.set(key, order)
        }
        items.push({ attendee, order })
      }
      const last = scanned[scanned.length - 1]
      let continueCursor: string | null = null
      if (hasMore && last) {
        const t = last._creationTime
        const carried = bound !== null && bound.t === t ? bound.ids : []
        const atT = scanned
          .filter((row) => row._creationTime === t)
          .map((row) => String(row._id))
        continueCursor = encodeSourceScanBoundary(
          t,
          Array.from(new Set([...carried, ...atT]))
        )
      }
      return { items, continueCursor, isDone: !hasMore }
    }

    const matches = ({ attendee, order }: LedgerCandidate) => {
      if (!order) return false
      if (order.mergedIntoOrderId) return false
      if (args.eventId && order.eventId !== args.eventId) return false
      const orderTime = order.orderedAt ?? order.submittedAt ?? null
      if (orderTime && (orderTime < from || orderTime > to)) return false
      if (needle === "") return true
      return matchesNormalizedSearch(
        buildSearchHaystack([String(attendee._id), attendee.name, attendee.email, order.bookingRef]),
        needle
      )
    }

    const collected = await collectSourceSearchPage({ fetchPage, matches, pageSize: args.pageSize, cursor: sourceCursor, scanCap: ATTENDEE_SEARCH_SCAN_CAP })
    const hasNext = !collected.isDone

    const rows = []
    const orders = new Map<string, Doc<"orders">>()
    for (const { attendee, order } of collected.rows) {
      if (!order) continue
      orders.set(String(order._id), order)
      const selections = await ctx.db.query("orderTicketSelections").withIndex("by_orderId", q => q.eq("orderId", order._id)).take(100)
      const selection = selections.find(row => row.attendeeId === attendee._id)
      const ticket = selection ? await ctx.db.get("ticketTypes", selection.ticketTypeId) : null
      const member = await ctx.db.query("attendeeFamilyMembers").withIndex("attendeeId", q => q.eq("attendeeId", String(attendee._id))).first()
      const familyId = member ? ctx.db.normalizeId("attendeeFamilyGroups", member.familyGroupId) : null
      const family = familyId ? await ctx.db.get("attendeeFamilyGroups", familyId) : null
      const extension = await ctx.db.query("ticketTailorAttendees").withIndex("attendeeId", q => q.eq("attendeeId", attendee._id)).first()
      rows.push({
        _id: attendee._id, orderId: attendee.orderId, name: attendee.name, email: attendee.email ?? null,
        gender: attendee.gender, location: attendee.location ?? null, assignedRoomId: attendee.assignedRoomId ?? null,
        allocationPriority: attendee.allocationPriority ?? null, priorityReason: attendee.priorityReason ?? null,
        ticketTypeLabel: ticket?.label ?? null, bookingRef: order.bookingRef ?? null,
        familyGroupId: family?._id ?? null, familyGroupLabel: family?.label ?? null,
        familyPrimaryAttendeeId: family?.primaryAttendeeId ?? null, familyRelationship: member?.relationship ?? null,
        providerAttendeeId: extension?.providerAttendeeId ?? null, providerIssuedTicketId: extension?.providerIssuedTicketId ?? null,
        providerOrderId: order.providerOrderId ?? null, orderEventId: order.eventId, orderStatus: order.status ?? null,
        normalizedStatus: order.status ?? null, orderTotalAmountMinor: order.totalAmountMinor ?? null,
        orderSubmittedAt: order.submittedAt ?? null, orderOrderedAt: order.orderedAt ?? null,
        allocatedRoomTypeId: attendee.allocatedRoomTypeId ?? null, customAnswers: extension?.customAnswers ?? null,
        amountDueMinor: 0,
        // Phase 56 — server-owned per-attendee money; filled below from the
        // canonical attribution owner, never re-derived by the client.
        paidAmountMinor: 0,
        outstandingAmountMinor: 0,
      })
    }
    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [...orders.values()])
    // ONE pricing pass: the due breakdown computed above is reused by the
    // attribution owner, whose per-attendee paid / outstanding is the canonical
    // figure (applied payments + allocation credit distributed by remaining
    // need). The added read is one indexed `donationAllocations` pass per order
    // on this page — the page is already bounded by the source-scan collector
    // and `LEDGER_PAGE_MAX`; no payments rescan is added.
    const attributionsByOrderId = await loadOrderPaymentAttributions({
      ctx,
      orders: [...orders.values()],
      dueBreakdownsByOrderId: breakdowns,
    })
    for (const row of rows) {
      const breakdown = breakdowns.get(String(row.orderId))
      const attributionRow = attributionsByOrderId
        .get(String(row.orderId))
        ?.byAttendeeId.get(String(row._id))
      row.amountDueMinor = breakdown?.amountDueByAttendeeId.get(String(row._id)) ?? 0
      row.paidAmountMinor = attributionRow?.paidAmountMinor ?? 0
      row.outstandingAmountMinor = attributionRow?.outstandingAmountMinor ?? 0
    }
    return {
      dateMode, from: dateMode === "all-time" ? null : from, to: dateMode === "all-time" ? null : to,
      rows, page: { hasNextPage: hasNext, nextCursor: hasNext ? encodeLedgerCursor({ version: cursorVersion, signature, sourceCursor: collected.continueCursor, from, to }) : null, totalRows: null, totalPages: null },
    }
  },
})

export const getAttendeeById = query({
  args: { attendeeId: v.id("ticketTailorAttendees") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await ctx.db.get("ticketTailorAttendees", args.attendeeId)
  },
})

export const getAttendeeByEmail = query({
  args: { eventId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one email has very few attendees
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .take(10)
    return attendees.filter((a) => a.providerEventId === args.eventId)
  },
})

export const createAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    ticketTypeLabel: v.optional(v.string()),
    ticketStatus: v.optional(v.string()),
    rawPayload: v.any(),
    customAnswers: v.optional(v.any()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    ageGroup: v.optional(v.string()),
    ticketCategory: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("ticketTailorAttendees", args)
    return id
  },
})

export const upsertAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    ticketTypeLabel: v.optional(v.string()),
    ticketStatus: v.optional(v.string()),
    rawPayload: v.any(),
    customAnswers: v.optional(v.any()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    ageGroup: v.optional(v.string()),
    ticketCategory: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.providerAttendeeId) {
      const existing = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerAttendeeId", (q) =>
          q.eq("providerAttendeeId", args.providerAttendeeId!)
        )
        .first()
      if (existing) {
        await ctx.db.patch("ticketTailorAttendees", existing._id, args)
        return existing._id
      }
    }
    return await ctx.db.insert("ticketTailorAttendees", args)
  },
})

export const updateAttendee = mutation({
  args: {
    attendeeId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    location: v.optional(v.union(v.string(), v.null())),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    priorityReason: v.optional(v.string()),
    tikkieAmountOverrideMinor: v.optional(v.number()),
    ticketTypeId: v.optional(v.id("ticketTypes")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved) {
      throw new Error("Attendee not found.")
    }

    const extensionUpdates: {
      name?: string
      email?: string
      location?: string
      genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
      allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
      priorityReason?: string
      tikkieAmountOverrideMinor?: number
      ticketTypeLabel?: string
    } = {}

    const coreUpdates: {
      name?: string
      email?: string
      location?: string
      gender?: "male" | "female" | "mixed" | "unknown"
      allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
      priorityReason?: string
    } = {}

    if (args.name !== undefined) {
      extensionUpdates.name = args.name
      coreUpdates.name = args.name
    }

    if (args.email !== undefined) {
      extensionUpdates.email = args.email
      coreUpdates.email = args.email
    }

    if (args.location !== undefined) {
      extensionUpdates.location = args.location ?? undefined
      coreUpdates.location = args.location ?? undefined
    }

    if (args.genderType !== undefined) {
      extensionUpdates.genderType = args.genderType
      coreUpdates.gender = normalizeUpperGenderToLower(args.genderType)
    }

    if (args.allocationPriority !== undefined) {
      extensionUpdates.allocationPriority = args.allocationPriority
      coreUpdates.allocationPriority = args.allocationPriority
    }

    if (args.priorityReason !== undefined) {
      extensionUpdates.priorityReason = args.priorityReason
      coreUpdates.priorityReason = args.priorityReason
    }

    if (args.tikkieAmountOverrideMinor !== undefined) {
      extensionUpdates.tikkieAmountOverrideMinor =
        args.tikkieAmountOverrideMinor
    }

    if (args.ticketTypeId !== undefined) {
      if (!resolved.canonicalAttendee) {
        throw new Error("Cannot change ticket type for attendee without an order attendee record.")
      }

      const selection = await ctx.db
        .query("orderTicketSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", resolved.canonicalAttendee!.orderId))
        .take(100)
        .then((selections) =>
          selections.find(
            (entry: { attendeeId?: unknown }) =>
              String(entry.attendeeId) === String(resolved.canonicalAttendee!._id)
          ) ?? null
        )

      if (!selection) {
        throw new Error("Ticket selection not found for attendee.")
      }

      const currentTicketTypeId = String(selection.ticketTypeId)
      const nextTicketTypeId = String(args.ticketTypeId)
      const nextTicketType = await ctx.db.get(args.ticketTypeId)

      if (!nextTicketType) {
        throw new Error("Ticket type not found.")
      }
      const attendeeOrder = await ctx.db.get(
        "orders",
        resolved.canonicalAttendee.orderId
      )
      if (!attendeeOrder || nextTicketType.eventId !== attendeeOrder.eventId) {
        throw new Error("Ticket type does not belong to the attendee's event.")
      }

      if (currentTicketTypeId !== nextTicketTypeId) {
        const currentTicketType = await ctx.db.get(selection.ticketTypeId)

        await ctx.db.patch("orderTicketSelections", selection._id, {
          ticketTypeId: args.ticketTypeId,
        })

        if (currentTicketType) {
          await ctx.db.patch(currentTicketType._id, {
            soldCount: Math.max(
              0,
              (currentTicketType.soldCount ?? 0) - selection.quantity
            ),
          })
        }

        await ctx.db.patch(nextTicketType._id, {
          soldCount: (nextTicketType.soldCount ?? 0) + selection.quantity,
        })
      }

      extensionUpdates.ticketTypeLabel = nextTicketType.label
    }

    if (resolved.canonicalAttendee && Object.keys(coreUpdates).length > 0) {
      await ctx.db.patch(
        "orderAttendees",
        resolved.canonicalAttendee._id,
        coreUpdates
      )
    }

    if (
      resolved.ticketTailorAttendee &&
      Object.keys(extensionUpdates).length > 0
    ) {
      await ctx.db.patch(
        "ticketTailorAttendees",
        resolved.ticketTailorAttendee._id,
        extensionUpdates
      )
    }

    return (
      resolved.canonicalAttendee?._id ??
      resolved.ticketTailorAttendee?._id ??
      args.attendeeId
    )
  },
})

export const addAttendeeToOrder = mutation({
  args: {
    orderId: v.id("orders"),
    eventId: v.id("events"),
    name: v.string(),
    email: v.optional(v.string()),
    ticketTypeId: v.id("ticketTypes"),
  },
  returns: v.object({
    attendeeId: v.id("orderAttendees"),
    orderId: v.id("orders"),
    amountDueMinor: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const name = args.name.trim()
    if (!name) {
      throw new Error("Attendee name is required.")
    }

    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found.")
    }

    const order = await ctx.db.get("orders", args.orderId)
    if (!order) {
      throw new Error("Order not found.")
    }
    if (order.eventId !== args.eventId) {
      throw new Error("Order does not belong to the supplied event.")
    }
    if (order.mergedIntoOrderId) {
      throw new Error("Cannot add an attendee to a merged order.")
    }

    const orderExtension = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .first()
    if (orderExtension && typeof orderExtension.removedAt === "number") {
      throw new Error("Cannot add an attendee to a removed order.")
    }

    const ticketType = await ctx.db.get("ticketTypes", args.ticketTypeId)
    if (!ticketType) {
      throw new Error("Ticket type not found.")
    }
    if (ticketType.eventId !== args.eventId) {
      throw new Error("Ticket type does not belong to the supplied event.")
    }

    let nextSortOrder = 0
    for await (const attendee of ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))) {
      nextSortOrder = Math.max(nextSortOrder, attendee.sortOrder + 1)
    }

    const now = Date.now()
    const attendeeKey = `manual-${now}-${Math.random().toString(36).slice(2, 10)}`
    const email = args.email?.trim() || undefined
    const attendeeId = await ctx.db.insert("orderAttendees", {
      orderId: args.orderId,
      // D-06: the copy is written in the same mutation as the row it lives on.
      eventId: args.eventId,
      attendeeKey,
      name,
      ...(email ? { email } : {}),
      gender: "unknown",
      sortOrder: nextSortOrder,
    })

    await ctx.db.insert("orderTicketSelections", {
      orderId: args.orderId,
      attendeeId,
      ticketTypeId: args.ticketTypeId,
      quantity: 1,
      sortOrder: nextSortOrder,
    })

    await ctx.db.patch("ticketTypes", args.ticketTypeId, {
      soldCount: (ticketType.soldCount ?? 0) + 1,
      updatedAt: now,
    })

    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [order])

    return {
      attendeeId,
      orderId: args.orderId,
      amountDueMinor: breakdowns.get(String(args.orderId))?.amountDueMinor ?? null,
    }
  },
})

export const assignRoom = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
    roomId: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.runMutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: args.attendeeId,
      roomId: args.roomId,
      eventId: args.eventId,
    })
    return args.attendeeId
  },
})

export const unassignRoom = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.runMutation(api.accommodation.unassignAttendeeFromRoom, {
      attendeeId: args.attendeeId,
      eventId: args.eventId,
    })
    return args.attendeeId
  },
})

export const checkInAttendee = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("ticketTailorAttendees", args.attendeeId, {
      checkedInAt: Date.now(),
    })
    return args.attendeeId
  },
})

export const getAttendeeByStringId = query({
  args: { attendeeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved) {
      return null
    }

    const canonicalAttendee = resolved.canonicalAttendee
    const ticketTailorAttendee = resolved.ticketTailorAttendee
    const order = resolved.order

    return {
      _id: canonicalAttendee?._id ?? ticketTailorAttendee?._id,
      name: ticketTailorAttendee?.name ?? canonicalAttendee?.name ?? null,
      email: ticketTailorAttendee?.email ?? canonicalAttendee?.email ?? null,
      ticketTypeId: resolved.ticketFinancials.ticketTypeId ?? null,
      ticketTypeLabel: resolved.ticketFinancials.ticketTypeLabel ?? null,
      amountDueMinor: resolved.ticketFinancials.amountDueMinor ?? 0,
      ticketStatus: ticketTailorAttendee?.ticketStatus ?? null,
      checkedInAt: ticketTailorAttendee?.checkedInAt ?? null,
      providerIssuedTicketId:
        ticketTailorAttendee?.providerIssuedTicketId ?? null,
      providerOrderId:
        ticketTailorAttendee?.providerOrderId ?? order.providerOrderId ?? null,
      providerEventId:
        ticketTailorAttendee?.providerEventId ?? order.providerEventId ?? null,
      eventId: order.eventId,
      orderId: canonicalAttendee?.orderId ?? ticketTailorAttendee?.orderId,
      assignedRoomId:
        ticketTailorAttendee?.assignedRoomId ??
        canonicalAttendee?.assignedRoomId ??
        null,
      customAnswers: mergeCustomAnswers({
        canonicalAttendee: canonicalAttendee
          ? {
              location: canonicalAttendee.location ?? null,
              dietaryRestrictions:
                canonicalAttendee.dietaryRestrictions ?? null,
              roommatePreference: canonicalAttendee.roommatePreference ?? null,
              roommateAvoid: canonicalAttendee.roommateAvoid ?? null,
            }
          : null,
        ticketTailorAttendee: ticketTailorAttendee
          ? { customAnswers: ticketTailorAttendee.customAnswers }
          : null,
      }),
      genderType:
        ticketTailorAttendee?.genderType ??
        (canonicalAttendee
          ? normalizeLowerGenderToUpper(canonicalAttendee.gender)
          : null),
      allocationPriority:
        ticketTailorAttendee?.allocationPriority ??
        canonicalAttendee?.allocationPriority ??
        null,
      priorityReason:
        ticketTailorAttendee?.priorityReason ??
        canonicalAttendee?.priorityReason ??
        null,
      ageGroup: ticketTailorAttendee?.ageGroup ?? null,
      ticketCategory: ticketTailorAttendee?.ticketCategory ?? null,
      tikkieAmountOverrideMinor:
        ticketTailorAttendee?.tikkieAmountOverrideMinor ?? null,
    }
  },
})

/**
 * Admin accommodation edit for one attendee (server-authoritative).
 *
 * The dashboard route accepts only the attendee/event scope plus the
 * simplified-contract choices: occupancy (`single`/`shared`), option
 * selections (optionKey + integer quantity + integer nights), and the
 * optional one-night night-before level/occupancy. The mutation never
 * accepts client money, category, room, or amount fields: the event-owned
 * context is loaded server-side and the choices are resolved through the
 * shared `resolvePublicSignupSelection` rule set (the same authority used
 * by quote, submission, edit, and confirmation). The one base
 * `orderAccommodationSelections` row is upserted and its option child rows
 * are replaced with the resolved server selection, so a repeat write is
 * logically idempotent and can never produce duplicate children. The
 * canonical amount due for the attendee's order is recomputed by
 * `loadOrderAmountDueBreakdowns` before returning.
 */
export const setAttendeeAccommodation = mutation({
  args: {
    attendeeId: v.string(),
    eventId: v.id("events"),
    occupancy: v.optional(
      v.union(v.literal("single"), v.literal("shared"))
    ),
    optionSelections: v.optional(
      v.array(
        v.object({
          optionKey: v.string(),
          quantity: v.number(),
          nights: v.number(),
        })
      )
    ),
    nightBeforeLevel: v.optional(
      v.union(v.literal("standard"), v.literal("superior"))
    ),
    nightBeforeOccupancy: v.optional(
      v.union(v.literal("single"), v.literal("shared"))
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved?.canonicalAttendee) {
      throw new Error("Attendee not found.")
    }

    const attendee = resolved.canonicalAttendee
    const order = await ctx.db.get("orders", attendee.orderId)

    if (!order) {
      throw new Error("Attendee order not found.")
    }

    if (String(order.eventId) !== String(args.eventId)) {
      throw new Error("Attendee does not belong to the supplied event.")
    }

    const ticketSelection = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", attendee.orderId))
      .take(100)
      .then(
        (rows) =>
          rows.find(
            (row) => String(row.attendeeId) === String(attendee._id)
          ) ?? null
      )

    if (!ticketSelection) {
      throw new Error("Ticket selection not found for attendee.")
    }

    const ticketType = await ctx.db.get(
      "ticketTypes",
      ticketSelection.ticketTypeId
    )

    if (!ticketType) {
      throw new Error("Ticket type not found.")
    }

    // Ticket-derived occupancy constraint: a present but unresolvable
    // `ticketTypes.roomTypeId` fails closed, and a constrained occupancy can
    // never be overridden by the caller (CR-02 contract).
    const ticketCategoryById = await resolveTicketCategoryById(
      ctx,
      new Map([[String(ticketType._id), ticketType]])
    )
    const ticketEntitlement = ticketCategoryById.get(String(ticketType._id))

    if (ticketEntitlement === null) {
      throw new Error(
        "The selected ticket's room type is no longer available."
      )
    }

    const occupancy =
      ticketEntitlement?.occupancy ?? args.occupancy ?? null

    if (
      ticketEntitlement?.occupancy &&
      args.occupancy &&
      args.occupancy !== ticketEntitlement.occupancy
    ) {
      throw new Error("Occupancy is determined by the selected ticket.")
    }

    const context = await loadPublicSignupAccommodationContext(
      ctx,
      args.eventId
    )

    let resolvedSelection: PublicSignupSelectionResolved
    try {
      resolvedSelection = resolvePublicSignupSelection({
        context,
        selection: {
          occupancy,
          optionSelections: args.optionSelections ?? [],
          nightBeforeLevel: args.nightBeforeLevel ?? null,
          nightBeforeOccupancy: args.nightBeforeOccupancy ?? null,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message.startsWith("QUOTE_INVALID:")) {
        throw new Error(
          `Invalid accommodation selection:${message.slice("QUOTE_INVALID:".length)}`
        )
      }
      throw error
    }

    // Upsert the one base selection row. An admin set is authoritative even
    // after the organizer confirms: `replace` drops the confirmation fields
    // (confirmedAt/configVersion/priceSnapshot), re-opening the selection for
    // live server repricing.
    const existingSelection = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId_and_attendeeId", (q) =>
        q.eq("orderId", attendee.orderId).eq("attendeeId", attendee._id)
      )
      .first()

    const baseRow = {
      orderId: attendee.orderId,
      attendeeId: attendee._id,
      categoryId: (resolvedSelection.categoryId ??
        undefined) as Id<"accommodationCategories"> | undefined,
      occupancy: resolvedSelection.occupancy ?? undefined,
      checkInAt: context.config?.baseCheckInAt,
      checkOutAt: context.config?.baseCheckOutAt,
      nightCount: resolvedSelection.nightCount ?? undefined,
      nightBeforeLevel: resolvedSelection.nightBeforeLevel ?? undefined,
      nightBeforeOccupancy:
        resolvedSelection.nightBeforeOccupancy ?? undefined,
    }

    let selectionId: Id<"orderAccommodationSelections">
    if (existingSelection) {
      selectionId = existingSelection._id
      await ctx.db.replace(
        "orderAccommodationSelections",
        existingSelection._id,
        baseRow
      )
    } else {
      selectionId = await ctx.db.insert(
        "orderAccommodationSelections",
        baseRow
      )
    }

    // Replace the option child rows with the resolved server selection so a
    // repeat write never duplicates children.
    const existingOptionRows = await ctx.db
      .query("orderAccommodationOptionSelections")
      .withIndex("by_selectionId", (q) => q.eq("selectionId", selectionId))
      .collect()

    for (const optionRow of existingOptionRows) {
      await ctx.db.delete("orderAccommodationOptionSelections", optionRow._id)
    }

    for (const [sortOrder, option] of resolvedSelection.options.entries()) {
      await ctx.db.insert("orderAccommodationOptionSelections", {
        orderId: attendee.orderId,
        attendeeId: attendee._id,
        selectionId,
        optionKey: option.optionKey,
        quantity: option.quantity,
        nights: option.nights,
        sortOrder,
      })
    }

    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [order])
    const breakdown = breakdowns.get(String(order._id))

    return {
      attendeeId: String(attendee._id),
      orderId: String(order._id),
      selection: {
        categoryId: resolvedSelection.categoryId ?? null,
        categoryCode: resolvedSelection.categoryCode ?? null,
        categoryLabel: resolvedSelection.categoryLabel ?? null,
        occupancy: resolvedSelection.occupancy ?? null,
        nightCount: resolvedSelection.nightCount ?? null,
        nightBeforeLevel: resolvedSelection.nightBeforeLevel ?? null,
        nightBeforeOccupancy: resolvedSelection.nightBeforeOccupancy ?? null,
        options: resolvedSelection.options.map((option) => ({
          optionKey: option.optionKey,
          label: option.label,
          pricePerUnitMinor: option.pricePerUnitMinor,
          quantity: option.quantity,
          nights: option.nights,
        })),
      },
      amountDueMinor: breakdown?.amountDueMinor ?? null,
    }
  },
})

/**
 * Admin attendee move between orders in the same event (server-authoritative).
 *
 * Re-links the attendee's canonical row, ticket selection, accommodation
 * selection and option child rows, any room assignment rows, and the
 * ticket-tailor extension rows by patching their `orderId` fields — never
 * duplicating rows, altering ticket inventory, or merging order-level
 * fields. Fails closed before any write when the attendee, ticket selection,
 * accommodation rows, or assignment rows are missing or inconsistent, or
 * when the target order is missing or belongs to another event. Both the
 * source and target orders are recomputed with the canonical
 * `loadOrderAmountDueBreakdowns` loader in the same transaction.
 */
export const moveAttendeeToOrder = mutation({
  args: {
    attendeeId: v.string(),
    targetOrderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved?.canonicalAttendee) {
      throw new Error("Attendee not found.")
    }

    const attendee = resolved.canonicalAttendee
    const sourceOrderId = attendee.orderId

    if (sourceOrderId === args.targetOrderId) {
      throw new Error("Source and target orders must be different")
    }

    const sourceOrder = await ctx.db.get("orders", sourceOrderId)
    if (!sourceOrder) {
      throw new Error("Source order not found")
    }

    const targetOrder = await ctx.db.get("orders", args.targetOrderId)
    if (!targetOrder) {
      throw new Error("Target order not found")
    }

    // D-06 invariant (Phase 62): `orderAttendees.eventId` is a write-once copy
    // of the order's event. Both mutations that re-link `attendee.orderId`
    // are same-event by construction — this guard (pinned by
    // `attendee-order-mutations.handlers.test.ts`) and `orders.mergeOrders`
    // (pinned by `order-merge.handlers.test.ts`) — so the copy cannot go
    // stale and needs no maintenance at either movers' write sites.
    if (String(sourceOrder.eventId ?? "") !== String(targetOrder.eventId ?? "")) {
      throw new Error("Orders must belong to the same event")
    }

    // Fail closed on inconsistent child rows before any write.
    const ticketSelections = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", sourceOrderId))
      .take(100)
    const attendeeTicketSelections = ticketSelections.filter(
      (row) => String(row.attendeeId) === String(attendee._id)
    )

    if (attendeeTicketSelections.length !== 1) {
      throw new Error("Attendee ticket selection is missing or inconsistent.")
    }

    const accommodationSelections = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", sourceOrderId))
      .take(100)
    const attendeeAccommodationSelections = accommodationSelections.filter(
      (row) => String(row.attendeeId) === String(attendee._id)
    )

    if (attendeeAccommodationSelections.length > 1) {
      throw new Error("Attendee accommodation selection is inconsistent.")
    }

    let attendeeOptionChildren: Array<
      Doc<"orderAccommodationOptionSelections">
    > = []
    if (attendeeAccommodationSelections.length === 1) {
      const baseSelection = attendeeAccommodationSelections[0]
      const optionChildren = await ctx.db
        .query("orderAccommodationOptionSelections")
        .withIndex("by_selectionId", (q) =>
          q.eq("selectionId", baseSelection._id)
        )
        .collect()

      const inconsistent = optionChildren.some(
        (row) => String(row.attendeeId) !== String(attendee._id)
      )
      if (inconsistent) {
        throw new Error(
          "Attendee accommodation option rows are inconsistent."
        )
      }
      attendeeOptionChildren = optionChildren
    }

    const assignments = await ctx.db
      .query("orderAssignments")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendee._id))
      .collect()

    const inconsistentAssignment = assignments.some(
      (row) => String(row.orderId) !== String(sourceOrderId)
    )
    if (inconsistentAssignment) {
      throw new Error("Attendee assignment rows are inconsistent.")
    }

    const extensionRows = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("attendeeId", (q) => q.eq("attendeeId", attendee._id))
      .collect()

    const inconsistentExtension = extensionRows.some(
      (row) => String(row.orderId) !== String(sourceOrderId)
    )
    if (inconsistentExtension) {
      throw new Error("Attendee extension rows are inconsistent.")
    }

    // Re-link every canonical child row to the target order.
    await ctx.db.patch("orderAttendees", attendee._id, {
      orderId: args.targetOrderId,
    })

    await ctx.db.patch(
      "orderTicketSelections",
      attendeeTicketSelections[0]._id,
      { orderId: args.targetOrderId }
    )

    for (const extensionRow of extensionRows) {
      await ctx.db.patch("ticketTailorAttendees", extensionRow._id, {
        orderId: args.targetOrderId,
      })
    }

    if (attendeeAccommodationSelections.length === 1) {
      const baseSelection = attendeeAccommodationSelections[0]
      await ctx.db.patch("orderAccommodationSelections", baseSelection._id, {
        orderId: args.targetOrderId,
      })

      for (const optionChild of attendeeOptionChildren) {
        await ctx.db.patch("orderAccommodationOptionSelections", optionChild._id, {
          orderId: args.targetOrderId,
        })
      }
    }

    for (const assignment of assignments) {
      await ctx.db.patch("orderAssignments", assignment._id, {
        orderId: args.targetOrderId,
      })
    }

    // Recompute both orders with the canonical loader in the same mutation.
    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [
      sourceOrder,
      targetOrder,
    ])

    return {
      orderId: String(args.targetOrderId),
      sourceAmountDueMinor:
        breakdowns.get(String(sourceOrderId))?.amountDueMinor ?? null,
      targetAmountDueMinor:
        breakdowns.get(String(args.targetOrderId))?.amountDueMinor ?? null,
    }
  },
})

/**
 * Delete one canonical attendee and every row owned by that attendee, then
 * recompute the order amount from the remaining canonical rows. All reads and
 * consistency checks happen before the first destructive write.
 */
export async function deleteAttendeeScopedRowsAndRecompute(
  ctx: MutationCtx,
  attendee: Doc<"orderAttendees">,
  eventId: Id<"events">
): Promise<{
  orderId: Id<"orders">
  remainingAttendees: number
  amountDueMinor: number | null
}> {
  const event = await ctx.db.get("events", eventId)
  if (!event) {
    throw new Error("Event not found.")
  }

  const order = await ctx.db.get("orders", attendee.orderId)
  if (!order) {
    throw new Error("Attendee order not found.")
  }
  if (order.eventId !== eventId) {
    throw new Error("Attendee does not belong to the supplied event.")
  }

  const orderAttendees: Doc<"orderAttendees">[] = []
  for await (const row of ctx.db
    .query("orderAttendees")
    .withIndex("by_orderId", (q) => q.eq("orderId", attendee.orderId))) {
    orderAttendees.push(row)
  }

  if (!orderAttendees.some((row) => row._id !== attendee._id)) {
    throw new Error("An order must retain at least one attendee.")
  }

  const ticketSelections: Doc<"orderTicketSelections">[] = []
  for await (const row of ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", attendee.orderId))) {
    ticketSelections.push(row)
  }

  const attendeeTicketSelections = ticketSelections.filter(
    (row) => row.attendeeId === attendee._id
  )
  if (attendeeTicketSelections.length !== 1) {
    throw new Error("Attendee ticket selection is missing or inconsistent.")
  }

  const attendeeTicketSelection = attendeeTicketSelections[0]
  if (
    !Number.isInteger(attendeeTicketSelection.quantity) ||
    attendeeTicketSelection.quantity <= 0
  ) {
    throw new Error("Attendee ticket selection is missing or inconsistent.")
  }

  const ticketType = await ctx.db.get(
    "ticketTypes",
    attendeeTicketSelection.ticketTypeId
  )
  if (!ticketType || ticketType.eventId !== eventId) {
    throw new Error("Attendee ticket selection is missing or inconsistent.")
  }

  const accommodationSelections = await ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId_and_attendeeId", (q) =>
      q.eq("orderId", attendee.orderId).eq("attendeeId", attendee._id)
    )
    .collect()
  if (accommodationSelections.length > 1) {
    throw new Error("Attendee accommodation selection is inconsistent.")
  }

  const accommodationOptionChildren = await ctx.db
    .query("orderAccommodationOptionSelections")
    .withIndex("by_orderId_and_attendeeId", (q) =>
      q.eq("orderId", attendee.orderId).eq("attendeeId", attendee._id)
    )
    .collect()

  const accommodationSelection = accommodationSelections[0]
  if (accommodationOptionChildren.length > 0 && !accommodationSelection) {
    throw new Error("Attendee accommodation option rows are inconsistent.")
  }

  if (accommodationSelection) {
    const selectionChildren = await ctx.db
      .query("orderAccommodationOptionSelections")
      .withIndex("by_selectionId", (q) =>
        q.eq("selectionId", accommodationSelection._id)
      )
      .collect()

    if (
      selectionChildren.length !== accommodationOptionChildren.length ||
      selectionChildren.some(
        (row) =>
          row.orderId !== attendee.orderId ||
          row.attendeeId !== attendee._id
      )
    ) {
      throw new Error("Attendee accommodation option rows are inconsistent.")
    }
  }

  const assignments = await ctx.db
    .query("orderAssignments")
    .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendee._id))
    .collect()
  if (assignments.some((row) => row.orderId !== attendee.orderId)) {
    throw new Error("Attendee assignment rows are inconsistent.")
  }

  const extensionRows = await ctx.db
    .query("ticketTailorAttendees")
    .withIndex("attendeeId", (q) => q.eq("attendeeId", attendee._id))
    .collect()
  if (extensionRows.some((row) => row.orderId !== attendee.orderId)) {
    throw new Error("Attendee extension rows are inconsistent.")
  }

  const familyMembers = await ctx.db
    .query("attendeeFamilyMembers")
    .withIndex("attendeeId", (q) => q.eq("attendeeId", String(attendee._id)))
    .collect()
  const familyGroups = await ctx.db
    .query("attendeeFamilyGroups")
    .withIndex("primaryAttendeeId", (q) =>
      q.eq("primaryAttendeeId", String(attendee._id))
    )
    .collect()
  for (const member of familyMembers) {
    const familyGroupId = ctx.db.normalizeId(
      "attendeeFamilyGroups",
      member.familyGroupId
    )
    if (!familyGroupId || !(await ctx.db.get("attendeeFamilyGroups", familyGroupId))) {
      throw new Error("Attendee family records are inconsistent.")
    }
  }

  await ctx.db.delete("orderTicketSelections", attendeeTicketSelection._id)
  await ctx.db.patch("ticketTypes", ticketType._id, {
    soldCount: Math.max(
      0,
      (ticketType.soldCount ?? 0) - attendeeTicketSelection.quantity
    ),
  })

  for (const child of accommodationOptionChildren) {
    await ctx.db.delete("orderAccommodationOptionSelections", child._id)
  }
  if (accommodationSelection) {
    await ctx.db.delete(
      "orderAccommodationSelections",
      accommodationSelection._id
    )
  }
  for (const assignment of assignments) {
    await ctx.db.delete("orderAssignments", assignment._id)
  }
  for (const extensionRow of extensionRows) {
    await ctx.db.delete("ticketTailorAttendees", extensionRow._id)
  }
  for (const member of familyMembers) {
    await ctx.db.delete("attendeeFamilyMembers", member._id)
  }
  for (const group of familyGroups) {
    const members = await ctx.db
      .query("attendeeFamilyMembers")
      .withIndex("familyGroupId", (q) => q.eq("familyGroupId", String(group._id)))
      .collect()
    for (const member of members) {
      await ctx.db.delete("attendeeFamilyMembers", member._id)
    }
    await ctx.db.delete("attendeeFamilyGroups", group._id)
  }
  await ctx.db.delete("orderAttendees", attendee._id)

  const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [order])

  return {
    orderId: order._id,
    remainingAttendees: orderAttendees.length - 1,
    amountDueMinor: breakdowns.get(String(order._id))?.amountDueMinor ?? null,
  }
}

export const removeAttendeeFromOrder = mutation({
  args: {
    attendeeId: v.string(),
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const canonicalAttendeeId = ctx.db.normalizeId(
      "orderAttendees",
      args.attendeeId.trim()
    )
    if (!canonicalAttendeeId) {
      throw new Error("Attendee not found.")
    }

    const attendee = await ctx.db.get("orderAttendees", canonicalAttendeeId)
    if (!attendee) {
      throw new Error("Attendee not found.")
    }

    const result = await deleteAttendeeScopedRowsAndRecompute(
      ctx,
      attendee,
      args.eventId
    )

    return {
      attendeeId: String(attendee._id),
      orderId: String(result.orderId),
      remainingAttendees: result.remainingAttendees,
      amountDueMinor: result.amountDueMinor,
    }
  },
})
