import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

type TicketMetadata = Pick<
  Doc<"ticketTypes">,
  "requiresBed" | "accommodationIncluded"
>

export type BedRequirementSource = "ticket" | "legacy-fallback" | "ineligible"

export type PlacementEvidence = {
  hasAccommodationSelection: boolean
  hasAllocatedRoomType: boolean
  hasAssignedRoom: boolean
}

export type BedRequirementResult = {
  placementEligible: boolean
  requiresBed: boolean
  source: BedRequirementSource
  evidence: PlacementEvidence
}

export function resolveRequiresBed(
  ticket: Pick<Doc<"ticketTypes">, "requiresBed"> | null | undefined
): boolean {
  return ticket?.requiresBed ?? true
}

export function resolvePlacementEligibility(input: {
  ticket: TicketMetadata | null | undefined
  evidence: PlacementEvidence
}): BedRequirementResult {
  const placementEligible = Boolean(
    input.ticket?.accommodationIncluded === true ||
      input.evidence.hasAccommodationSelection ||
      input.evidence.hasAllocatedRoomType ||
      input.evidence.hasAssignedRoom
  )

  return {
    placementEligible,
    requiresBed: placementEligible ? resolveRequiresBed(input.ticket) : false,
    source: !placementEligible
      ? "ineligible"
      : input.ticket && typeof input.ticket.requiresBed === "boolean"
        ? "ticket"
        : "legacy-fallback",
    evidence: input.evidence,
  }
}

type AccommodationQueryCtx = Pick<QueryCtx, "db">

function resolveAttendeeResult(
  attendee: Doc<"orderAttendees"> | null,
  ticket: Doc<"ticketTypes"> | null,
  hasAccommodationSelection: boolean
): BedRequirementResult {
  if (!attendee) {
    return resolvePlacementEligibility({
      ticket,
      evidence: {
        hasAccommodationSelection,
        hasAllocatedRoomType: false,
        hasAssignedRoom: false,
      },
    })
  }

  return resolvePlacementEligibility({
    ticket,
    evidence: {
      hasAccommodationSelection,
      hasAllocatedRoomType: attendee.allocatedRoomTypeId !== undefined,
      hasAssignedRoom: attendee.assignedRoomId !== undefined,
    },
  })
}

export async function resolveAttendeeBedRequirement(
  ctx: AccommodationQueryCtx,
  attendeeId: Id<"orderAttendees">
): Promise<BedRequirementResult> {
  const attendee = await ctx.db.get("orderAttendees", attendeeId)
  if (!attendee) {
    return resolveAttendeeResult(null, null, false)
  }

  const [order, ticketSelections, accommodationSelections] = await Promise.all([
    ctx.db.get("orders", attendee.orderId),
    ctx.db
      .query("orderTicketSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
      .take(2),
    ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
      .take(2),
  ])

  // Ticket selection rows are untrusted joins. A stale attendee ID, a
  // cross-order row, a duplicate row, or a ticket type from another event may
  // not change the live bed decision. Invalid ticket metadata intentionally
  // falls back to the legacy one-bed rule when accommodation evidence exists.
  const hasAccommodationSelection = accommodationSelections.some(
    (selection) => selection.orderId === attendee.orderId
  )
  const ticketSelection =
    ticketSelections.length === 1 &&
    ticketSelections[0]?.orderId === attendee.orderId
      ? ticketSelections[0]
      : null
  const candidateTicket = ticketSelection
    ? await ctx.db.get("ticketTypes", ticketSelection.ticketTypeId)
    : null
  const ticket =
    candidateTicket &&
    order?.eventId &&
    candidateTicket.eventId === order.eventId
      ? candidateTicket
      : null

  return resolveAttendeeResult(attendee, ticket, hasAccommodationSelection)
}

export async function resolveAttendeeBedRequirements(
  ctx: AccommodationQueryCtx,
  attendeeIds: Id<"orderAttendees">[]
): Promise<Map<string, BedRequirementResult>> {
  const uniqueAttendeeIds = Array.from(
    new Map(attendeeIds.map((attendeeId) => [String(attendeeId), attendeeId])).values()
  )
  const attendees = await Promise.all(
    uniqueAttendeeIds.map((attendeeId) => ctx.db.get("orderAttendees", attendeeId))
  )
  const orders = await Promise.all(
    attendees.map((attendee) =>
      attendee ? ctx.db.get("orders", attendee.orderId) : Promise.resolve(null)
    )
  )
  const selections = await Promise.all(
    uniqueAttendeeIds.map((attendeeId) =>
      ctx.db
        .query("orderTicketSelections")
        .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
        .take(2)
    )
  )
  const accommodationSelections = await Promise.all(
    uniqueAttendeeIds.map((attendeeId) =>
      ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
        .take(2)
    )
  )
  const ticketIds = Array.from(
    new Map(
      selections
        .map((rows, index) =>
          rows.length === 1 && rows[0]?.orderId === attendees[index]?.orderId
            ? rows[0].ticketTypeId
            : undefined
        )
        .filter((ticketId): ticketId is Id<"ticketTypes"> => ticketId !== undefined)
        .map((ticketId) => [String(ticketId), ticketId])
    ).values()
  )
  const tickets = await Promise.all(
    ticketIds.map((ticketId) => ctx.db.get("ticketTypes", ticketId))
  )
  const ticketById = new Map(
    tickets
      .filter((ticket): ticket is Doc<"ticketTypes"> => ticket !== null)
      .map((ticket) => [String(ticket._id), ticket])
  )

  return new Map(
    uniqueAttendeeIds.map((attendeeId, index) => {
      const attendee = attendees[index]
      const order = orders[index]
      const selection =
        selections[index].length === 1 &&
        attendee &&
        selections[index][0]?.orderId === attendee.orderId
          ? selections[index][0]
          : null
      const candidateTicket = selection
        ? ticketById.get(String(selection.ticketTypeId)) ?? null
        : null
      const ticket =
        candidateTicket &&
        order?.eventId &&
        candidateTicket.eventId === order.eventId
          ? candidateTicket
          : null
      return [
        String(attendeeId),
        resolvePlacementEligibility({
          ticket,
          evidence: {
            hasAccommodationSelection:
              accommodationSelections[index].some(
                (row) => attendee && row.orderId === attendee.orderId
              ),
            hasAllocatedRoomType: attendee?.allocatedRoomTypeId !== undefined,
            hasAssignedRoom: attendee?.assignedRoomId !== undefined,
          },
        }),
      ]
    })
  )
}
