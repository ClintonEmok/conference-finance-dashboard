import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

import {
  deriveOrderAmountBreakdown,
  isOrderAppliedPayment,
} from "../lib/domain/finance/amounts"
import {
  deriveAllocationPaymentBreakdowns,
  type AllocationPaymentState,
} from "../lib/domain/finance/allocation-payment-state"
import {
  deriveAccommodationAmount,
  isCompleteAccommodationPriceSnapshot,
  type AccommodationPriceSnapshot,
  type AccommodationReceiptLine,
} from "../lib/domain/finance/accommodation-amounts"

type FinanceDbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">

type OrderRef = {
  _id: Id<"orders">
  eventId?: Id<"events"> | string | null
}

type OrderSelectionDoc = {
  orderId: Id<"orders">
  attendeeId: Id<"orderAttendees">
  ticketTypeId: Id<"ticketTypes">
  quantity: number
}

type TicketTypeDoc = {
  _id: Id<"ticketTypes">
  priceMinor: number
  accommodationIncluded?: boolean | null
}

/**
 * The accommodation selection row as read by the loader. `confirmedAt`,
 * `configVersion` and `priceSnapshot` are the Phase 44 confirmation contract
 * (schema shape landed in Phase 40, populated by Phase 44). The local shape
 * keeps the loader typed against the snapshot contract before/after codegen.
 */
type OrderAccommodationSelectionDoc = {
  orderId: Id<"orders">
  attendeeId: Id<"orderAttendees">
  categoryId?: Id<"accommodationCategories"> | null
  occupancy?: "single" | "shared" | "family" | null
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode?: string | null
  nightCount?: number | null
  confirmedAt?: number | null
  configVersion?: number | null
  priceSnapshot?: AccommodationPriceSnapshot | null
}

export type OrderAmountDueBreakdown = {
  amountDueMinor: number
  amountDueByAttendeeId: Map<string, number>
  /** Server-derived non-zero accommodation receipt lines (may be empty). */
  accommodationLines: AccommodationReceiptLine[]
}

type MatchedPaymentRecord = {
  amountMinor: number
  orderId?: string | null
  status?:
    | "auto_matched"
    | "manual_assignment"
    | "ambiguous"
    | "unassigned"
    | "donation"
    | null
  donationKind?: "overpayment" | "standalone" | null
}

type EventAccommodationContext = {
  config: { nightCount: number } | null
  ratesByKey: Map<string, { pricePerPersonMinor: number }>
  categoryCodeById: Map<string, string | undefined>
  superiorUpgradePriceMinor: number | null
  cotPriceMinor: number | null
  cotEligibilityAgeBandCode: string | null
}

type EventAccommodationConfigDoc = {
  eventId: Id<"events">
  nightCount: number
  updatedAt?: number
}

type EventAccommodationRateDoc = {
  eventId: Id<"events">
  categoryId: Id<"accommodationCategories">
  occupancy: string
  pricePerPersonMinor: number
}

type EventAccommodationOptionDoc = {
  eventId: Id<"events">
  optionId: Id<"accommodationOptions">
  enabled: boolean
  priceMinor: number
  eligibilityAgeBandCode?: string | null
}

async function loadEventAccommodationContexts(
  ctx: FinanceDbCtx,
  eventIds: Set<Id<"events">>
): Promise<Map<string, EventAccommodationContext>> {
  const contextByEventId = new Map<string, EventAccommodationContext>()
  if (eventIds.size === 0) {
    return contextByEventId
  }

  // Phase A: per-event indexed reads (config, rates, options). These are
  // event-keyed so they cannot be shared across events; each is bounded via
  // async iteration so a large event never silently truncates its rate rows.
  const perEventRows = await Promise.all(
    Array.from(eventIds).map(async (eventId) => {
      const eventKey = String(eventId)

      // Fail loudly on configuration corruption: `.unique()` returns null only
      // for the legitimate no-row case and throws on duplicate config rows or
      // database errors. Catching those here would convert an invalid or
      // transient configuration into a €0 accommodation charge and silently
      // undercharge the order.
      const configRow = (await ctx.db
        .query("eventAccommodationConfig")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .unique()) as EventAccommodationConfigDoc | null

      const rateRows: EventAccommodationRateDoc[] = []
      for await (const row of ctx.db
        .query("eventAccommodationRates")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
        rateRows.push(row as EventAccommodationRateDoc)
      }

      const eventOptionRows: EventAccommodationOptionDoc[] = []
      for await (const row of ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
        eventOptionRows.push(row as EventAccommodationOptionDoc)
      }

      return { eventKey, configRow, rateRows, eventOptionRows }
    })
  )

  // Phase B: resolve catalog references through a single bounded batch/cache.
  // Every referenced option/category id across all events is fetched once
  // (not once per event), so multi-event consumers do not multiply the
  // catalog read count.
  const optionIds = new Set<Id<"accommodationOptions">>()
  const categoryIds = new Set<Id<"accommodationCategories">>()
  for (const { rateRows, eventOptionRows } of perEventRows) {
    for (const row of eventOptionRows) {
      if (row.enabled) optionIds.add(row.optionId)
    }
    for (const row of rateRows) {
      categoryIds.add(row.categoryId)
    }
  }
  const [optionDefinitions, categoryDefinitions] = await Promise.all([
    Promise.all(
      Array.from(optionIds).map((optionId) =>
        ctx.db.get("accommodationOptions", optionId)
      )
    ),
    Promise.all(
      Array.from(categoryIds).map((categoryId) =>
        ctx.db.get("accommodationCategories", categoryId)
      )
    ),
  ])

  const optionCodeById = new Map<string, string | undefined>()
  for (const definition of optionDefinitions) {
    if (!definition) continue
    optionCodeById.set(String(definition._id), definition.code)
  }

  const categoryCodeById = new Map<string, string | undefined>()
  for (const definition of categoryDefinitions) {
    if (!definition) continue
    categoryCodeById.set(String(definition._id), definition.code)
  }

  // Phase C: build the per-event context from the shared catalog cache.
  for (const { eventKey, configRow, rateRows, eventOptionRows } of perEventRows) {
    const enabledOptionRows = eventOptionRows.filter((row) => row.enabled)

    const ratesByKey = new Map<string, { pricePerPersonMinor: number }>()
    for (const rate of rateRows) {
      ratesByKey.set(`${String(rate.categoryId)}:${rate.occupancy}`, {
        pricePerPersonMinor: rate.pricePerPersonMinor,
      })
    }

    let superiorUpgradePriceMinor: number | null = null
    let cotPriceMinor: number | null = null
    let cotEligibilityAgeBandCode: string | null = null
    for (const row of enabledOptionRows) {
      const code = optionCodeById.get(String(row.optionId))
      if (code === "superior_upgrade") {
        superiorUpgradePriceMinor = row.priceMinor
      } else if (code === "cot") {
        cotPriceMinor = row.priceMinor
        cotEligibilityAgeBandCode = row.eligibilityAgeBandCode ?? null
      }
    }

    contextByEventId.set(eventKey, {
      config: configRow ? { nightCount: configRow.nightCount } : null,
      ratesByKey,
      categoryCodeById,
      superiorUpgradePriceMinor,
      cotPriceMinor,
      cotEligibilityAgeBandCode,
    })
  }

  return contextByEventId
}

export async function loadOrderAmountDueBreakdowns(
  ctx: FinanceDbCtx,
  orders: OrderRef[]
): Promise<Map<string, OrderAmountDueBreakdown>> {
  const selectionsByOrderId = new Map<string, OrderSelectionDoc[]>()
  const ticketTypeIds = new Set<Id<"ticketTypes">>()

  await Promise.all(
    orders.map(async (order) => {
      // Read every ticket selection for the order through bounded async
      // iteration. A fixed `.take(100)` would silently truncate orders with
      // more than 100 attendees/selections and undercount the amount due.
      const selections: OrderSelectionDoc[] = []
      for await (const row of ctx.db
        .query("orderTicketSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
        selections.push(row as OrderSelectionDoc)
      }

      selectionsByOrderId.set(String(order._id), selections)

      for (const selection of selections) {
        ticketTypeIds.add(selection.ticketTypeId)
      }
    })
  )

  const ticketTypes = await Promise.all(
    Array.from(ticketTypeIds).map((ticketTypeId) =>
      ctx.db.get("ticketTypes", ticketTypeId)
    )
  )

  const ticketTypePriceById = new Map<string, number>()
  const ticketTypeInfoById = new Map<
    string,
    { priceMinor: number; accommodationIncluded: boolean }
  >()

  for (const ticketType of ticketTypes as Array<TicketTypeDoc | null>) {
    if (!ticketType) {
      continue
    }

    ticketTypePriceById.set(String(ticketType._id), ticketType.priceMinor)
    ticketTypeInfoById.set(String(ticketType._id), {
      priceMinor: ticketType.priceMinor,
      accommodationIncluded: ticketType.accommodationIncluded === true,
    })
  }

  // Resolve the event id per order (bare refs must fetch the order doc).
  const eventIdByOrderId = new Map<string, Id<"events"> | null>()
  await Promise.all(
    orders.map(async (order) => {
      if (order.eventId) {
        eventIdByOrderId.set(String(order._id), order.eventId as Id<"events">)
        return
      }

      const doc = await ctx.db.get("orders", order._id)
      eventIdByOrderId.set(String(order._id), doc?.eventId ?? null)
    })
  )

  // Batch-load accommodation selections by indexed orderId. All rows are read
  // through bounded async iteration — a fixed `.take(100)` would truncate
  // large orders and silently drop accommodation charges.
  const accommodationSelectionsByOrderId = new Map<
    string,
    OrderAccommodationSelectionDoc[]
  >()
  await Promise.all(
    orders.map(async (order) => {
      const rows: OrderAccommodationSelectionDoc[] = []
      for await (const row of ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
        rows.push(row as OrderAccommodationSelectionDoc)
      }
      accommodationSelectionsByOrderId.set(String(order._id), rows)
    })
  )

  // Collect distinct event ids and resolve each event's config bundle once.
  const eventIds = new Set<Id<"events">>()
  for (const eventId of eventIdByOrderId.values()) {
    if (eventId) {
      eventIds.add(eventId)
    }
  }
  const eventAccommodationContextByEventId =
    await loadEventAccommodationContexts(ctx, eventIds)

  const breakdownByOrderId = new Map<string, OrderAmountDueBreakdown>()

  for (const order of orders) {
    const orderKey = String(order._id)
    const selections = selectionsByOrderId.get(orderKey) ?? []

    const attendeeTicketTypeId = new Map<string, Id<"ticketTypes">>()
    for (const selection of selections) {
      const attendeeKey = String(selection.attendeeId)
      if (!attendeeTicketTypeId.has(attendeeKey)) {
        attendeeTicketTypeId.set(attendeeKey, selection.ticketTypeId)
      }
    }

    const baseBreakdown = deriveOrderAmountBreakdown({
      selections,
      ticketTypePriceById,
    })
    let amountDueMinor = baseBreakdown.amountDueMinor
    const amountDueByAttendeeId = baseBreakdown.amountDueByAttendeeId
    const accommodationLines: AccommodationReceiptLine[] = []

    const eventId = eventIdByOrderId.get(orderKey)
    const accommodationContext = eventId
      ? eventAccommodationContextByEventId.get(String(eventId))
      : null

    for (const row of accommodationSelectionsByOrderId.get(orderKey) ?? []) {
      const attendeeKey = String(row.attendeeId)
      const ticketTypeId = attendeeTicketTypeId.get(attendeeKey)
      const ticketInfo = ticketTypeId
        ? ticketTypeInfoById.get(String(ticketTypeId))
        : undefined

      // Confirmation is determined by field presence, not by a positive
      // timestamp: a malformed/epoch `confirmedAt` is still inside the
      // confirmation boundary and must never be re-priced as live.
      const isConfirmed = row.confirmedAt !== undefined && row.confirmedAt !== null

      // Fail closed BEFORE any config-dependent pricing branch: every
      // confirmed row must carry a valid `confirmedAt`, a `configVersion`
      // boundary, and a complete snapshot. A confirmed row that lacks any of
      // these is a broken confirmation — it is never silently re-priced from
      // the current config and never silently dropped as €0, even when the
      // event has no accommodation config.
      if (isConfirmed) {
        if (
          typeof row.confirmedAt !== "number" ||
          !Number.isFinite(row.confirmedAt) ||
          row.confirmedAt <= 0 ||
          typeof row.configVersion !== "number" ||
          !Number.isFinite(row.configVersion) ||
          row.configVersion <= 0 ||
          !isCompleteAccommodationPriceSnapshot(row.priceSnapshot)
        ) {
          throw new Error(
            "Invalid accommodation snapshot: selection is confirmed but missing a complete priceSnapshot."
          )
        }
      }

      const snapshot: AccommodationPriceSnapshot | null = row.priceSnapshot ?? null

      // Live derivation needs the event config; when it is missing (legacy or
      // unconfigured event) an unconfirmed row contributes €0 — the legacy
      // behavior is preserved for unconfirmed rows only. Confirmed rows price
      // exclusively from their persisted snapshot and never need live config.
      const canPrice =
        isConfirmed || accommodationContext?.config !== null

      if (!canPrice) {
        continue
      }

      const rate =
        row.categoryId && row.occupancy
          ? accommodationContext?.ratesByKey.get(
              `${String(row.categoryId)}:${row.occupancy}`
            )
          : undefined
      const categoryCode = row.categoryId
        ? accommodationContext?.categoryCodeById.get(String(row.categoryId))
        : undefined

      const result = deriveAccommodationAmount({
        selection: {
          attendeeId: attendeeKey,
          categoryCode,
          occupancy: row.occupancy,
          upgradeSelected: row.upgradeSelected,
          cotSelected: row.cotSelected,
          ageBandCode: row.ageBandCode,
          nightCount: row.nightCount,
        },
        pricing: {
          baseRatePerNightMinor: rate?.pricePerPersonMinor,
          superiorUpgradePriceMinor:
            accommodationContext?.superiorUpgradePriceMinor ?? null,
          cotPriceMinor: accommodationContext?.cotPriceMinor ?? null,
          cotEligibilityAgeBandCode:
            accommodationContext?.cotEligibilityAgeBandCode ?? null,
          ticketAccommodationIncluded: ticketInfo?.accommodationIncluded,
          eventBaseNights: accommodationContext?.config?.nightCount,
        },
        snapshot: isConfirmed ? snapshot : null,
      })

      if (result.totalMinor > 0) {
        amountDueMinor += result.totalMinor
        amountDueByAttendeeId.set(
          attendeeKey,
          (amountDueByAttendeeId.get(attendeeKey) ?? 0) + result.totalMinor
        )
      }

      for (const line of result.lines) {
        accommodationLines.push(line)
      }
    }

    breakdownByOrderId.set(orderKey, {
      amountDueMinor,
      amountDueByAttendeeId,
      accommodationLines,
    })
  }

  return breakdownByOrderId
}

export async function loadMatchedPaymentTotalsByOrderId(
  ctx: FinanceDbCtx,
  orders: OrderRef[]
): Promise<Map<string, number>> {
  // Read the complete applied-payment set through bounded async iteration.
  // A fixed `.take(2000)` would silently truncate payments beyond the page and
  // make a paid/partial attendee render as unpaid/partial.
  const payments: MatchedPaymentRecord[] = []
  for await (const payment of ctx.db.query("payments")) {
    payments.push(payment as MatchedPaymentRecord)
  }
  const canonicalOrderIdsByAlias = new Map<string, string>()

  for (const order of orders) {
    canonicalOrderIdsByAlias.set(String(order._id), String(order._id))
  }

  const orderByProviderId = new Map<string, string>()
  for (const order of orders as Array<OrderRef & { providerOrderId?: string | null }>) {
    const providerOrderId = order.providerOrderId?.trim()
    if (providerOrderId) {
      orderByProviderId.set(providerOrderId, String(order._id))
    }
  }

  const totalsByOrderId = new Map<string, number>()

  for (const payment of payments) {
    if (
      !payment ||
      !isOrderAppliedPayment(payment) ||
      !Number.isFinite(payment.amountMinor) ||
      payment.amountMinor <= 0
    ) {
      continue
    }

    const rawOrderId = typeof payment.orderId === "string" ? payment.orderId.trim() : ""
    if (!rawOrderId) continue

    const canonicalOrderId =
      canonicalOrderIdsByAlias.get(rawOrderId) ?? orderByProviderId.get(rawOrderId)
    if (!canonicalOrderId) continue

    totalsByOrderId.set(
      canonicalOrderId,
      (totalsByOrderId.get(canonicalOrderId) ?? 0) + payment.amountMinor
    )
  }

  return totalsByOrderId
}

export type AllocationAttendeePaymentRow = {
  attendeeId: string
  amountDueMinor: number
  paidAmountMinor: number
  paymentState: AllocationPaymentState
}

/**
 * Canonical per-attendee payment projection for the Allocation board (Phase
 * 44). Accepts the already-scoped orders, their `loadOrderAmountDueBreakdowns`
 * result, and the attendee IDs grouped by order; calls the matched-payment
 * loader exactly once for the scoped set, then uses the pure due-weight
 * allocation helper to produce an attendeeId-keyed tri-state map.
 *
 * The projection never reads `orders.status` or provider status as a payment
 * authority — a pending internal order with a recorded applied payment renders
 * as paid because the canonical matched balance says so. Attendees absent from
 * the canonical due map (no ticket selection) are omitted; callers fall back
 * to a neutral untyped row rather than fabricating an unpaid state.
 */
export async function loadOrderAttendeePaymentBreakdowns(input: {
  ctx: FinanceDbCtx
  orders: OrderRef[]
  dueBreakdownsByOrderId: Map<string, OrderAmountDueBreakdown>
  attendeeIdsByOrderId: Map<string, string[]>
}): Promise<Map<string, AllocationAttendeePaymentRow>> {
  const paidTotalsByOrderId = await loadMatchedPaymentTotalsByOrderId(
    input.ctx,
    input.orders
  )

  const paymentById = new Map<string, AllocationAttendeePaymentRow>()

  for (const order of input.orders) {
    const orderKey = String(order._id)
    const dueBreakdown = input.dueBreakdownsByOrderId.get(orderKey)
    const attendeeIds = input.attendeeIdsByOrderId.get(orderKey) ?? []
    if (!dueBreakdown || attendeeIds.length === 0) {
      continue
    }

    const amountDueByAttendeeId = new Map<string, number>()
    for (const attendeeId of attendeeIds) {
      const dueMinor = dueBreakdown.amountDueByAttendeeId.get(attendeeId)
      if (dueMinor !== undefined) {
        amountDueByAttendeeId.set(attendeeId, dueMinor)
      }
    }

    const breakdowns = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId,
      paidTotalMinor: paidTotalsByOrderId.get(orderKey) ?? 0,
    })

    for (const [, breakdown] of breakdowns) {
      paymentById.set(breakdown.attendeeId, breakdown)
    }
  }

  return paymentById
}
