import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

type TicketMetadata = Pick<Doc<"ticketTypes">, "requiresBed" | "accommodationIncluded">

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

  const [ticketSelection, accommodationSelection] = await Promise.all([
    ctx.db
      .query("orderTicketSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
      .take(1),
    ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
      .take(1),
  ])
  const ticket = ticketSelection[0]
    ? await ctx.db.get("ticketTypes", ticketSelection[0].ticketTypeId)
    : null

  return resolveAttendeeResult(attendee, ticket, accommodationSelection.length > 0)
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
  const selections = await Promise.all(
    uniqueAttendeeIds.map((attendeeId) =>
      ctx.db
        .query("orderTicketSelections")
        .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
        .take(1)
    )
  )
  const accommodationSelections = await Promise.all(
    uniqueAttendeeIds.map((attendeeId) =>
      ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))
        .take(1)
    )
  )
  const ticketIds = Array.from(
    new Map(
      selections
        .map((rows) => rows[0]?.ticketTypeId)
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
      const ticketId = selections[index][0]?.ticketTypeId
      return [
        String(attendeeId),
        resolvePlacementEligibility({
          ticket: ticketId ? ticketById.get(String(ticketId)) : null,
          evidence: {
            hasAccommodationSelection: accommodationSelections[index].length > 0,
            hasAllocatedRoomType: attendees[index]?.allocatedRoomTypeId !== undefined,
            hasAssignedRoom: attendees[index]?.assignedRoomId !== undefined,
          },
        }),
      ]
    })
  )
}
