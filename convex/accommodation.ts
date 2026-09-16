import { internalMutation, query, mutation } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { requireIdentity } from "./auth"
import {
  buildAccommodationPriceSnapshot,
  isCompleteAccommodationPriceSnapshot,
  type AccommodationPriceSnapshot,
} from "../lib/domain/finance/accommodation-amounts"
import { SUPERIOR_UPGRADE_OPTION_KEY } from "./signupCatalog"
import {
  loadOrderAmountDueBreakdowns,
  loadOrderAttendeePaymentBreakdowns,
} from "./finance"
import {
  resolveAttendeeBedRequirement,
  resolveAttendeeBedRequirements,
  type BedRequirementResult,
} from "./accommodationBedRequirement"

type DocTables = {
  events: Doc<"events">
  accommodationHotels: Doc<"accommodationHotels">
  accommodationRoomTypes: Doc<"accommodationRoomTypes">
  accommodationRooms: Doc<"accommodationRooms">
  orderAttendees: Doc<"orderAttendees">
  ticketTailorAttendees: Doc<"ticketTailorAttendees">
}

function normalizeDocId<TableName extends keyof DocTables>(
  ctx: {
    db: {
      normalizeId: <T extends keyof DocTables>(
        tableName: T,
        id: string
      ) => Id<T> | null
    }
  },
  tableName: TableName,
  id: string,
  errorMessage: string
) {
  const normalizedId = ctx.db.normalizeId(tableName, id)

  if (!normalizedId) {
    throw new Error(errorMessage)
  }

  return normalizedId
}

type AccommodationCtx = QueryCtx | MutationCtx

/**
 * Read-only string-id resolvers shared by query and mutation handlers. Access
 * is resolved through the caller's authenticated context; these helpers never
 * widen the database surface (no `any` context).
 */
async function getAccommodationHotelByStringId(
  ctx: AccommodationCtx,
  hotelId: string
) {
  const normalizedHotelId = ctx.db.normalizeId("accommodationHotels", hotelId)
  return normalizedHotelId
    ? await ctx.db.get("accommodationHotels", normalizedHotelId)
    : null
}

async function getAccommodationRoomByStringId(
  ctx: AccommodationCtx,
  roomId: string
) {
  const normalizedRoomId = ctx.db.normalizeId("accommodationRooms", roomId)
  return normalizedRoomId
    ? await ctx.db.get("accommodationRooms", normalizedRoomId)
    : null
}

async function getAccommodationRoomTypeByStringId(
  ctx: AccommodationCtx,
  roomTypeId: string
) {
  const normalizedRoomTypeId = ctx.db.normalizeId(
    "accommodationRoomTypes",
    roomTypeId
  )
  return normalizedRoomTypeId
    ? await ctx.db.get("accommodationRoomTypes", normalizedRoomTypeId)
    : null
}

/**
 * Streams an entire Convex query into memory. Hotel reads are intentionally
 * uncapped: hotels and event-hotel links are low-cardinality config, so a fixed
 * cap would either silently truncate or spuriously fail closed. Convex streams
 * the query in batches, so no fixed row bound is imposed here.
 */
async function collectAll<T>(source: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = []
  for await (const row of source) rows.push(row)
  return rows
}

/**
 * Fail-closed truncation reasons. The requested room's occupancy read and the
 * event inventory/resource scan are distinct failure modes and must stay
 * distinguishable: `confirmBuyerAssignment` maps them to different result codes
 * (`OCCUPANCY_INCOMPLETE` vs `INVENTORY_INCOMPLETE`). Conflating the two would
 * misreport an unrelated candidate-room read as the requested room's occupancy.
 *
 * Detection keys off the reason prefix, because the requested-room occupancy
 * reason is shared by more than one message with different suffixes (the family
 * bed check and the physical-room scan).
 */
const OCCUPANCY_INCOMPLETE_REASON = "Occupancy data is incomplete"
const OCCUPANCY_INCOMPLETE_MESSAGE =
  `${OCCUPANCY_INCOMPLETE_REASON}; verify room usage before changing placement`
const INVENTORY_INCOMPLETE_REASON = "Accommodation inventory is incomplete"
const INVENTORY_INCOMPLETE_MESSAGE =
  `${INVENTORY_INCOMPLETE_REASON}; verify room usage before changing placement`

/**
 * RMG-03: event-resource inventory guard. When the event has
 * `eventAccommodationResources` rows (kind "room") for the target room's room
 * type, the number of DISTINCT rooms of that type that currently hold at
 * least one assigned attendee bounds the pool: single occupancy reserves a
 * full room, shared occupancy consumes beds in remaining rooms, and an
 * exhausted pool blocks placement atomically. Runs before any
 * assignment/confirmation write. When the event has no resource rows for the
 * room type (legacy/pre-resource setups), it is a no-op — the existing room
 * capacity check still applies.
 *
 * The scan is event-scoped: rooms are shared physical inventory, but an event's
 * resource pool is bounded by the hotels linked to that event, so a busy
 * multi-event deployment can never exhaust another event's rooms.
 */
async function assertEventRoomInventoryAvailable(
  ctx: MutationCtx,
  order: Doc<"orders"> | null,
  room: Doc<"accommodationRooms">,
  targetRoomHasOccupants: boolean,
  sourceAttendeeIds: string[] = []
): Promise<void> {
  if (!order?.eventId || !room.roomTypeId) {
    return
  }
  const eventId = order.eventId
  const roomTypeId = room.roomTypeId
  const resource = await ctx.db
    .query("eventAccommodationResources")
    .withIndex("by_eventId_and_kind_and_roomTypeId", (q) =>
      q
        .eq("eventId", eventId as Id<"events">)
        .eq("kind", "room")
        .eq("roomTypeId", roomTypeId as Id<"accommodationRoomTypes">)
    )
    .first()
  if (!resource) {
    return
  }
  if (resource.count < 0) {
    throw new Error("Invalid accommodation inventory configuration")
  }
  if (resource.count === 0) {
    throw new Error("No accommodation inventory remains for this room type")
  }

  // Scope the candidate rooms to THIS event's hotels. A room belongs to exactly
  // one hotel, so streaming each linked hotel's rooms yields an exact,
  // duplicate-free set without a global room-type scan.
  const eventHotelLinks = await collectAll(
    ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) => q.eq("eventId", eventId))
  )
  const eventHotelIds = new Set(eventHotelLinks.map((link) => link.hotelId))

  const sourceIds = new Set(sourceAttendeeIds)
  let usedRooms = 0

  for (const hotelId of eventHotelIds) {
    for await (const candidate of ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", hotelId))) {
      if (candidate.roomTypeId !== roomTypeId) continue
      if (
        await hasPhysicalRoomOccupants(
          ctx,
          String(candidate._id),
          sourceIds,
          INVENTORY_INCOMPLETE_MESSAGE
        )
      ) {
        usedRooms += 1
      }
    }
  }

  const projectedUsed = targetRoomHasOccupants ? usedRooms : usedRooms + 1
  if (projectedUsed > resource.count) {
    throw new Error(
      "No accommodation inventory remains for this room type (event resource limit reached)"
    )
  }
}

/**
 * Returns physical presence using the same canonical/provider bridge rule as
 * loadRoomOccupancy, without loading bed metadata for every room of a type.
 * A provider row bridged to any canonical attendee is never physical presence
 * in its stale provider room; the canonical assignment is authoritative.
 *
 * `incompleteMessage` labels a truncated provider read for the caller's context:
 * the requested room's occupancy by default, or the event inventory scan's own
 * message when called for an unrelated candidate room.
 */
async function hasPhysicalRoomOccupants(
  ctx: Pick<MutationCtx, "db">,
  roomId: string,
  excludedCanonicalIds: Set<string> = new Set(),
  incompleteMessage: string = OCCUPANCY_INCOMPLETE_MESSAGE
): Promise<boolean> {
  // Only a non-excluded member matters, and `_id`s are distinct, so reading one
  // row more than the exclusion set is provably sufficient (pigeonhole): if any
  // non-excluded occupant exists it must surface within this bound. This keeps
  // the read proportional to the small source set instead of the room cap.
  const canonicalReadLimit = excludedCanonicalIds.size + 1
  const canonicalOccupants = await ctx.db
    .query("orderAttendees")
    .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", roomId))
    .take(canonicalReadLimit)
  if (canonicalOccupants.some((attendee) => !excludedCanonicalIds.has(String(attendee._id)))) {
    return true
  }

  const providerOccupants = await ctx.db
    .query("ticketTailorAttendees")
    .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", roomId))
    .take(ROOM_OCCUPANT_LIMIT + 1)
  if (providerOccupants.length > ROOM_OCCUPANT_LIMIT) {
    throw new Error(incompleteMessage)
  }
  if (providerOccupants.length === 0) {
    return false
  }

  const bridges = await Promise.all(
    providerOccupants.map((providerAttendee) =>
      providerAttendee.attendeeId
        ? ctx.db.get("orderAttendees", providerAttendee.attendeeId)
        : Promise.resolve(null)
    )
  )
  return providerOccupants.some((providerAttendee, index) => {
    // Missing/invalid bridges are provider-only physical occupants.
    if (!providerAttendee.attendeeId || bridges[index] === null) return true
    const bridge = bridges[index]
    return (
      bridge !== null &&
      !excludedCanonicalIds.has(String(bridge._id)) &&
      bridge.assignedRoomId === roomId
    )
  })
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function getAttendeeLocation(customAnswers: unknown): string | null {
  if (!customAnswers || typeof customAnswers !== "object") {
    return null
  }

  const location = (customAnswers as { location?: unknown }).location
  return typeof location === "string" ? normalizeOptionalString(location) : null
}

function hasPriorityAttendee(
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null | undefined
): boolean {
  return allocationPriority === "CRITICAL" || allocationPriority === "HIGH"
}

/**
 * Normalizes lowercase gender values (from core orderAttendees.gender) to uppercase display values.
 * Core table stores lowercase ("male"|"female"|"mixed"|"unknown"), TT extension stores uppercase ("MALE"|"FEMALE"|"MIXED"|"UNKNOWN").
 */
function normalizeGender(
  gender: "male" | "female" | "mixed" | "unknown"
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" {
  const mapping: Record<string, "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"> = {
    male: "MALE",
    female: "FEMALE",
    mixed: "MIXED",
    unknown: "UNKNOWN",
  }
  return mapping[gender] ?? "UNKNOWN"
}

function allocationPriorityRank(
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null | undefined
): number {
  const ranks: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
  }
  return ranks[priority ?? "NORMAL"] ?? 2
}

/**
 * Primary allocation rank (Phase 44): paid first, partial second, unpaid
 * last. A missing/unknown projection sorts after unpaid so a neutral attendee
 * is never silently promoted ahead of a real state.
 */
function paymentStateRank(
  state: "paid" | "partial" | "unpaid" | null | undefined
): number {
  const ranks: Record<string, number> = {
    paid: 0,
    partial: 1,
    unpaid: 2,
  }
  return state ? (ranks[state] ?? 3) : 3
}

const ROOM_OCCUPANT_LIMIT = 2_000

/**
 * Authoritative-board read caps (CR-07). Each authoritative collection is read
 * with `.take(limit + 1)` and run through `takeDetecting`/`flattenDetecting`
 * so a capped result becomes an explicit `dataCompleteness.incomplete` signal
 * instead of a silently truncated "complete" board. The limits are preserved
 * from the pre-existing bounded reads; only the truncation detection is added.
 * Hotel reads are intentionally uncapped (streamed with `collectAll`) because
 * hotels and event-hotel links are low-cardinality config, so a fixed cap would
 * only spuriously flag the board incomplete.
 */
const BOARD_EVENT_LIMIT = 200
const BOARD_ROOM_TYPE_LIMIT = 100
const BOARD_ROOM_LIMIT = 500
const BOARD_ATTENDEE_LIMIT = 2_000
const BOARD_SLOT_LIMIT = 1_000
const BOARD_EVENT_ORDER_LIMIT = 500
const BOARD_CATEGORY_LIMIT = 100
const BOARD_ORDER_COLLECTION_LIMIT = 100

/**
 * Returns a bounded slice while recording a completeness reason when the read
 * overflowed. Callers must `.take(limit + 1)` so an exact-limit result is never
 * mistaken for truncation.
 */
function takeDetecting<T>(
  rows: T[],
  limit: number,
  reason: string,
  markIncomplete: (reason: string) => void
): T[] {
  if (rows.length > limit) {
    markIncomplete(reason)
    return rows.slice(0, limit)
  }
  return rows
}

/**
 * Flattens per-parent bounded groups (for example per-order collections) while
 * recording one completeness reason when any single group overflowed.
 */
function flattenDetecting<T>(
  groups: ReadonlyArray<T[]>,
  limit: number,
  reason: string,
  markIncomplete: (reason: string) => void
): T[] {
  if (groups.some((rows) => rows.length > limit)) {
    markIncomplete(reason)
  }
  return groups.flatMap((rows) => rows.slice(0, limit))
}

type RoomOccupancy = {
  occupantCount: number
  occupiedBeds: number
  availableBeds: number
  foreignOccupantCount: number
  incomplete: boolean
}

type FamilyRole = "solo" | "parent" | "child"
type FamilyResolutionState =
  | "unresolved"
  | "placed"
  | "waiting-for-parent-room"
  | "inconsistent"
  | "needs-family-link"

type FamilyPlacementChild = {
  attendee: Doc<"orderAttendees">
  requirement: BedRequirementResult
  familyState: FamilyResolutionState
}

type FamilyPlacementUnit = {
  valid: boolean
  familyRole: FamilyRole
  familyGroupId: string | null
  familyLabel: string | null
  familyParentAttendeeId: string | null
  familyState: FamilyResolutionState
  parent: Doc<"orderAttendees"> | null
  members: Doc<"orderAttendees">[]
  eligibleChildren: FamilyPlacementChild[]
  separateMembers: Doc<"orderAttendees">[]
  requirements: Map<string, BedRequirementResult>
  reason: string | null
}

function emptyFamilyUnit(input: {
  valid: boolean
  familyRole: FamilyRole
  familyGroupId?: string | null
  familyLabel?: string | null
  familyParentAttendeeId?: string | null
  familyState: FamilyResolutionState
  parent?: Doc<"orderAttendees"> | null
  members?: Doc<"orderAttendees">[]
  reason?: string | null
  requirement: BedRequirementResult
  attendee: Doc<"orderAttendees">
}): FamilyPlacementUnit {
  return {
    valid: input.valid,
    familyRole: input.familyRole,
    familyGroupId: input.familyGroupId ?? null,
    familyLabel: input.familyLabel ?? null,
    familyParentAttendeeId: input.familyParentAttendeeId ?? null,
    familyState: input.familyState,
    parent:
      input.parent ?? (input.familyRole === "solo" ? input.attendee : null),
    members: input.members ?? [input.attendee],
    eligibleChildren: [],
    separateMembers: [],
    requirements: new Map([[String(input.attendee._id), input.requirement]]),
    reason: input.reason ?? null,
  }
}

/**
 * Bound on the members read for a single family group. The read is executed
 * with `.take(limit + 1)` so a family group larger than the cap surfaces an
 * explicit `dataCompleteness.incomplete` reason instead of being silently
 * truncated.
 */
const FAMILY_GROUP_MEMBER_LIMIT = 200

/**
 * The board read path surfaces `dataCompleteness` instead of throwing, but a
 * write must never place or unassign a subset of a family whose membership read
 * truncated. Write-path validators pass this callback so the mutation fails
 * closed before any attendee patch.
 */
const FAMILY_DATA_INCOMPLETE_MESSAGE =
  "Family data is incomplete; verify family membership before changing placement"

/**
 * Resolve one attendee to a server-owned placement unit. Family tables contain
 * raw string IDs, so this boundary deliberately re-normalizes every reference,
 * validates the declared primary, validates every membership, and then joins
 * live bed requirements. No array order, name, order grouping, or bed flag can
 * select a parent. Family metadata is advisory for now: invalid relationships
 * fall back to a standalone attendee instead of blocking room placement.
 */
async function resolveFamilyPlacementUnit(
  ctx: Pick<QueryCtx, "db">,
  eventId: string,
  attendee: Doc<"orderAttendees">,
  knownRequirements?: Map<string, BedRequirementResult>,
  onIncomplete?: (reason: string) => void
): Promise<FamilyPlacementUnit> {
  const requirement =
    knownRequirements?.get(String(attendee._id)) ??
    (await resolveAttendeeBedRequirement(ctx, attendee._id))
  const memberships = await ctx.db
    .query("attendeeFamilyMembers")
    .withIndex("attendeeId", (q) => q.eq("attendeeId", String(attendee._id)))
    .take(20)

  if (memberships.length === 0) {
    return emptyFamilyUnit({
      valid: true,
      familyRole: "solo",
      familyState: requirement.placementEligible ? "unresolved" : "inconsistent",
      reason: null,
      requirement,
      attendee,
    })
  }

  if (memberships.length !== 1) {
    return emptyFamilyUnit({
      valid: true,
      familyRole: "solo",
      familyState: "inconsistent",
      reason: "Family membership is inconsistent; placing attendee independently",
      requirement,
      attendee,
    })
  }

  const rawGroupId = normalizeOptionalString(memberships[0]?.familyGroupId)
  const familyGroupId = rawGroupId
    ? ctx.db.normalizeId("attendeeFamilyGroups", rawGroupId)
    : null
  if (!familyGroupId) {
    return emptyFamilyUnit({
      valid: true,
      familyRole: "solo",
      familyState: "inconsistent",
      reason: "Family group reference is malformed; placing attendee independently",
      requirement,
      attendee,
    })
  }
  const groupId = rawGroupId!

  const group = await ctx.db.get("attendeeFamilyGroups", familyGroupId)
  const familyLabel =
    normalizeOptionalString(group?.label) ?? `Family ${String(familyGroupId)}`
  const primaryId = group?.primaryAttendeeId
    ? ctx.db.normalizeId("orderAttendees", group.primaryAttendeeId)
    : null
  const groupMembers = await ctx.db
    .query("attendeeFamilyMembers")
    .withIndex("familyGroupId", (q) => q.eq("familyGroupId", groupId))
    .take(FAMILY_GROUP_MEMBER_LIMIT + 1)
  if (groupMembers.length > FAMILY_GROUP_MEMBER_LIMIT) {
    onIncomplete?.("family members")
  }

  const normalizedMemberIds: Id<"orderAttendees">[] = []
  let malformedMembership = groupMembers.length === 0
  for (const member of groupMembers) {
    const memberId = ctx.db.normalizeId(
      "orderAttendees",
      normalizeOptionalString(member.attendeeId) ?? ""
    )
    if (!memberId || String(member.familyGroupId) !== groupId) {
      malformedMembership = true
      continue
    }
    if (normalizedMemberIds.some((id) => String(id) === String(memberId))) {
      malformedMembership = true
      continue
    }
    normalizedMemberIds.push(memberId)
  }

  if (!primaryId || !normalizedMemberIds.some((id) => String(id) === String(primaryId))) {
    malformedMembership = true
  }

  const members = await Promise.all(
    normalizedMemberIds.map((memberId) => ctx.db.get("orderAttendees", memberId))
  )
  const resolvedMembers = members.filter(
    (member): member is Doc<"orderAttendees"> => member !== null
  )
  if (resolvedMembers.length !== normalizedMemberIds.length) {
    malformedMembership = true
  }

  // A member cannot quietly participate in two groups. This is intentionally
  // bounded; more than one membership is a data-quality failure, not a reason
  // to guess which group should control room placement.
  const membershipRowsByMember = await Promise.all(
    normalizedMemberIds.map((memberId) =>
      ctx.db
        .query("attendeeFamilyMembers")
        .withIndex("attendeeId", (q) => q.eq("attendeeId", String(memberId)))
        .take(20)
    )
  )
  for (const rows of membershipRowsByMember) {
    if (
      rows.length !== 1 ||
      String(rows[0]?.familyGroupId) !== String(familyGroupId)
    ) {
      malformedMembership = true
    }
  }

  const orders = await Promise.all(
    resolvedMembers.map((member) => ctx.db.get("orders", member.orderId))
  )
  if (
    resolvedMembers.length !== normalizedMemberIds.length ||
    resolvedMembers.some(
      (_member, index) =>
        !orders[index] || String(orders[index]?.eventId) !== eventId
    )
  ) {
    malformedMembership = true
  }

  const requirements = new Map<string, BedRequirementResult>()
  for (const member of resolvedMembers) {
    requirements.set(
      String(member._id),
      knownRequirements?.get(String(member._id)) ??
        (await resolveAttendeeBedRequirement(ctx, member._id))
    )
  }

  const parent = primaryId
    ? resolvedMembers.find((member) => String(member._id) === String(primaryId)) ??
      null
    : null
  if (malformedMembership || !parent) {
    return {
      ...emptyFamilyUnit({
        valid: true,
        familyRole: "solo",
        familyGroupId: null,
        familyLabel: null,
        familyParentAttendeeId: null,
        familyState: "inconsistent",
        reason: "Family placement data is inconsistent; placing attendee independently",
        requirement,
        attendee,
      }),
      requirements,
    }
  }

  const familyRole: FamilyRole =
    String(parent._id) === String(attendee._id) ? "parent" : "child"

  const eligibleChildren = resolvedMembers
    .filter((member) => String(member._id) !== String(parent._id))
    .filter((member) => {
      const memberRequirement = requirements.get(String(member._id))
      return (
        memberRequirement?.placementEligible === true &&
        memberRequirement.requiresBed === false
      )
    })
    .map((member) => ({
      attendee: member,
      requirement: requirements.get(String(member._id))!,
      familyState: "unresolved" as FamilyResolutionState,
    }))
  // CR-06 follow-up: only members that can actually be placed on their own are
  // separate placement items. A member that is no longer accommodation-eligible
  // (for example a ticket-only attendee) could never be placed, so advertising
  // it forever as "Separate placement required" is misleading. Genuinely
  // placeable bed-requiring members stay in the set.
  const separateMembers = resolvedMembers.filter((member) => {
    if (String(member._id) === String(parent._id)) return false
    if (
      eligibleChildren.some(
        (child) => String(child.attendee._id) === String(member._id)
      )
    ) {
      return false
    }
    return requirements.get(String(member._id))?.placementEligible === true
  })

  const childRooms = eligibleChildren
    .map((child) => child.attendee.assignedRoomId)
    .filter((roomId): roomId is string => Boolean(roomId))
  const allChildrenShareParentRoom = eligibleChildren.every(
    (child) => child.attendee.assignedRoomId === parent.assignedRoomId
  )
  const familyState: FamilyResolutionState =
    !allChildrenShareParentRoom
      ? "inconsistent"
      : parent.assignedRoomId
        ? "placed"
        : "unresolved"
  for (const child of eligibleChildren) {
    child.familyState = parent.assignedRoomId
      ? familyState
      : "waiting-for-parent-room"
  }

  // Keep childRooms referenced so the complete assignment mismatch check is
  // explicit even when every child currently has no room.
  void childRooms

  return {
    valid: true,
    familyRole,
    familyGroupId: String(familyGroupId),
    familyLabel,
    familyParentAttendeeId: String(parent._id),
    familyState,
    parent,
    members: resolvedMembers,
    eligibleChildren,
    separateMembers,
    requirements,
    reason: null,
  }
}

/**
 * CR-06: separate family members that still need their own placement. A
 * separate member that has already been placed is no longer an operational
 * item, so it is excluded from the queue/room projection and follow-ups.
 */
function unassignedSeparateMembers(
  unit: FamilyPlacementUnit | undefined
): Doc<"orderAttendees">[] {
  if (!unit || unit.familyRole !== "parent") return []
  return unit.separateMembers.filter((member) => !member.assignedRoomId)
}

/**
 * Physical room occupancy is global because rooms are shared inventory while
 * the allocation board is event-scoped. Canonical attendees are authoritative;
 * an assigned provider row is counted only when it cannot be bridged to one.
 * The optional room cache is deliberately not consulted here.
 */
async function loadRoomOccupancy(
  ctx: Pick<QueryCtx, "db">,
  roomId: string,
  roomCapacity: number,
  visibleEventId: string | null = null
): Promise<RoomOccupancy> {
  const [canonicalOccupants, providerOccupants] = await Promise.all([
    ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", roomId))
      .take(ROOM_OCCUPANT_LIMIT),
    ctx.db
      .query("ticketTailorAttendees")
      .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", roomId))
      .take(ROOM_OCCUPANT_LIMIT),
  ])

  // Resolve provider bridges globally, not just against canonical occupants
  // already loaded for this room. A stale provider room must not double-count a
  // canonical attendee that has since moved elsewhere.
  const providerBridges = await Promise.all(
    providerOccupants.map((providerAttendee) =>
      providerAttendee.attendeeId
        ? ctx.db.get("orderAttendees", providerAttendee.attendeeId)
        : Promise.resolve(null)
    )
  )
  const providerOnly = providerOccupants.filter(
    (_providerAttendee, index) => providerBridges[index] === null
  )
  const requirements = await resolveAttendeeBedRequirements(
    ctx,
    canonicalOccupants.map((attendee) => attendee._id)
  )
  const canonicalOrders = await Promise.all(
    canonicalOccupants.map((attendee) => ctx.db.get("orders", attendee.orderId))
  )
  const providerOrders = await Promise.all(
    providerOnly.map((attendee) => ctx.db.get("orders", attendee.orderId))
  )

  const canonicalBedCount = canonicalOccupants.reduce((sum, attendee) => {
    const requirement = requirements.get(String(attendee._id))
    return sum + (requirement?.requiresBed === false ? 0 : 1)
  }, 0)
  const providerBedCount = providerOnly.length
  const occupantCount = canonicalOccupants.length + providerOnly.length
  const incomplete =
    canonicalOccupants.length >= ROOM_OCCUPANT_LIMIT ||
    providerOccupants.length >= ROOM_OCCUPANT_LIMIT
  const occupiedBeds = canonicalBedCount + providerBedCount
  const foreignOccupantCount = visibleEventId
    ? canonicalOrders.filter(
        (order) => order && String(order.eventId) !== visibleEventId
      ).length +
      providerOrders.filter(
        (order) => order && String(order.eventId) !== visibleEventId
      ).length
    : 0

  return {
    occupantCount,
    occupiedBeds,
    // An incomplete physical read must never advertise a bed as available.
    availableBeds: incomplete
      ? 0
      : Math.max(0, roomCapacity - occupiedBeds),
    foreignOccupantCount,
    incomplete,
  }
}

export function attendeeMatchesSignalFilters(input: {
  attendee: {
    customAnswers?: unknown
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }
  attendeeFamilyGroupId: string | null
  filters: {
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    familyGroupId?: string
    location?: string
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    hasPriority?: boolean
  }
}): boolean {
  if (
    input.filters.genderType &&
    input.attendee.genderType !== input.filters.genderType
  ) {
    return false
  }

  if (
    input.filters.familyGroupId &&
    input.attendeeFamilyGroupId !== input.filters.familyGroupId
  ) {
    return false
  }

  const normalizedLocationFilter = normalizeOptionalString(
    input.filters.location
  )
  if (normalizedLocationFilter) {
    const attendeeLocation = getAttendeeLocation(input.attendee.customAnswers)
    if (
      !attendeeLocation ||
      attendeeLocation.toLowerCase() !== normalizedLocationFilter.toLowerCase()
    ) {
      return false
    }
  }

  if (
    input.filters.allocationPriority &&
    input.attendee.allocationPriority !== input.filters.allocationPriority
  ) {
    return false
  }

  if (
    input.filters.hasPriority !== undefined &&
    hasPriorityAttendee(input.attendee.allocationPriority ?? null) !==
      input.filters.hasPriority
  ) {
    return false
  }

  return true
}

export function hasFamilySignal(input: {
  attendeeId: string
  orderId: string | null
  attendeeFamilyGroupId: string | null
  attendeeCountByOrderId: Map<string, number>
}): boolean {
  if (input.attendeeFamilyGroupId) {
    return true
  }

  return (
    (input.attendeeCountByOrderId.get(input.orderId ?? input.attendeeId) ?? 0) >
    1
  )
}

export const recalculateRoomOccupancy = internalMutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)

    if (!room) {
      throw new Error("Room not found")
    }

    const occupancy = await loadRoomOccupancy(
      ctx,
      String(room._id),
      room.capacity,
      null
    )

    await ctx.db.patch("accommodationRooms", roomId, {
      occupiedBeds: occupancy.occupiedBeds,
    })

    return { ok: true, ...occupancy }
  },
})

export const getRoomAllocationBoard = query({
  args: {
    eventId: v.string(),
    hotelId: v.optional(v.string()),
    roomTypeId: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    familyGroupId: v.optional(v.string()),
    location: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    hasPriority: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const requestedEventId = normalizeOptionalString(args.eventId)
    if (!requestedEventId) {
      throw new Error("Invalid eventId: a non-blank event ID is required")
    }

    const canonicalEventId =
      ctx.db.normalizeId("events", requestedEventId) ??
      (
        await ctx.db
          .query("eventSources")
          .withIndex("by_provider_and_externalEventId", (q) =>
            q
              .eq("provider", "tickettailor")
              .eq("externalEventId", requestedEventId)
          )
          .first()
      )?.eventId
    if (!canonicalEventId) {
      throw new Error("Invalid eventId: event not found")
    }
    const eventId = String(canonicalEventId)

    // CR-07: every authoritative collection below is read with `.take(limit+1)`
    // and unwrapped through the detecting helpers so a capped read becomes an
    // explicit incomplete signal rather than a silently truncated board.
    const boardIncompleteReasons: string[] = []
    const markBoardIncomplete = (reason: string) => {
      if (!boardIncompleteReasons.includes(reason)) {
        boardIncompleteReasons.push(reason)
      }
    }

    const scopedHotelIds = (
      await collectAll(
        ctx.db
          .query("accommodationEventHotels")
          .withIndex("eventId_hotelId", (q) => q.eq("eventId", eventId))
      )
    ).map((eh) => eh.hotelId)

    const [
      canonicalEventsRaw,
      hotelsRaw,
      roomTypesRaw,
      roomsRaw,
      allOrderAttendeesRaw,
      accommodationSlotsRaw,
      allOrdersRaw,
      accommodationCategoriesRaw,
    ] = await Promise.all([
      ctx.db.query("events").take(BOARD_EVENT_LIMIT + 1),
      collectAll(ctx.db.query("accommodationHotels")),
      ctx.db.query("accommodationRoomTypes").take(BOARD_ROOM_TYPE_LIMIT + 1),
      ctx.db.query("accommodationRooms").take(BOARD_ROOM_LIMIT + 1),
      ctx.db.query("orderAttendees").take(BOARD_ATTENDEE_LIMIT + 1),
      ctx.db.query("accommodationSlots").take(BOARD_SLOT_LIMIT + 1),
      ctx.db
        .query("orders")
        .withIndex("by_eventId", (q) =>
          q.eq("eventId", eventId as Id<"events">)
        )
        .take(BOARD_EVENT_ORDER_LIMIT + 1),
      ctx.db.query("accommodationCategories").take(BOARD_CATEGORY_LIMIT + 1),
    ])

    const canonicalEvents = takeDetecting(
      canonicalEventsRaw,
      BOARD_EVENT_LIMIT,
      "events",
      markBoardIncomplete
    )
    const hotels = hotelsRaw
    const roomTypes = takeDetecting(
      roomTypesRaw,
      BOARD_ROOM_TYPE_LIMIT,
      "room types",
      markBoardIncomplete
    )
    const rooms = takeDetecting(
      roomsRaw,
      BOARD_ROOM_LIMIT,
      "rooms",
      markBoardIncomplete
    )
    const allOrderAttendees = takeDetecting(
      allOrderAttendeesRaw,
      BOARD_ATTENDEE_LIMIT,
      "attendees",
      markBoardIncomplete
    )
    const accommodationSlotDocs = takeDetecting(
      accommodationSlotsRaw,
      BOARD_SLOT_LIMIT,
      "accommodation slots",
      markBoardIncomplete
    )
    const allOrders = takeDetecting(
      allOrdersRaw,
      BOARD_EVENT_ORDER_LIMIT,
      "event orders",
      markBoardIncomplete
    )
    const accommodationCategoriesDocs = takeDetecting(
      accommodationCategoriesRaw,
      BOARD_CATEGORY_LIMIT,
      "accommodation categories",
      markBoardIncomplete
    )

    const normalizedLocationFilter = normalizeOptionalString(args.location)

    const internalCanonicalEvents = canonicalEvents.filter(
      (event) => event.primarySourceKind === "internal"
    )
    const internalEventIds = new Set(
      internalCanonicalEvents.map((event) => String(event._id))
    )
    const scopedOrders = allOrders.filter(
      (order) =>
        internalEventIds.has(String(order.eventId)) &&
        (!eventId || String(order.eventId) === String(eventId))
    )

    const scopedTicketSelectionGroups = scopedOrders.length
      ? await Promise.all(
          scopedOrders.map((order) =>
            ctx.db
              .query("orderTicketSelections")
              .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
              .take(BOARD_ORDER_COLLECTION_LIMIT + 1)
          )
        )
      : []
    const scopedTicketSelectionDocs = flattenDetecting(
      scopedTicketSelectionGroups,
      BOARD_ORDER_COLLECTION_LIMIT,
      "order ticket selections",
      markBoardIncomplete
    )
    const scopedTicketTypeIds = Array.from(
      new Set(scopedTicketSelectionDocs.map((selection) => selection.ticketTypeId))
    )
    const scopedTicketTypes = await Promise.all(
      scopedTicketTypeIds.map((ticketTypeId) =>
        ctx.db.get("ticketTypes", ticketTypeId)
      )
    )
    const scopedTicketTypeById = new Map(
      scopedTicketTypes
        .filter((ticket): ticket is NonNullable<typeof ticket> => ticket !== null)
        .map((ticket) => [String(ticket._id), ticket])
    )
    const scopedRoomTypeIds = Array.from(
      new Set(
        scopedTicketTypes
          .filter((ticket): ticket is NonNullable<typeof ticket> => ticket !== null)
          .map((ticket) => ticket.roomTypeId)
          .filter(
            (roomTypeId): roomTypeId is Id<"accommodationRoomTypes"> =>
              roomTypeId !== undefined
          )
      )
    )
    const scopedRoomTypes = await Promise.all(
      scopedRoomTypeIds.map((roomTypeId) =>
        ctx.db.get("accommodationRoomTypes", roomTypeId)
      )
    )
    const occupancyByRoomTypeId = new Map<string, "single" | "shared">()
    for (const roomType of scopedRoomTypes) {
      if (roomType) {
        occupancyByRoomTypeId.set(
          String(roomType._id),
          roomType.defaultCapacity === 1 ? "single" : "shared"
        )
      }
    }
    const ticketOccupancyByAttendeeId = new Map<string, "single" | "shared">()
    for (const selection of scopedTicketSelectionDocs) {
      const ticket = scopedTicketTypeById.get(String(selection.ticketTypeId))
      const occupancy = ticket?.roomTypeId
        ? occupancyByRoomTypeId.get(String(ticket.roomTypeId))
        : undefined
      if (occupancy) {
        ticketOccupancyByAttendeeId.set(String(selection.attendeeId), occupancy)
      }
    }

    // Build order lookup for event scoping
    const orderById = new Map(scopedOrders.map((o) => [o._id as string, o]))

    // Filter attendees to those belonging to scoped orders
    const scopedAttendees = allOrderAttendees.filter((a) => {
      const order = orderById.get(a.orderId as string)
      if (!order) return false
      if (eventId && order.eventId !== eventId) return false
      return true
    })
    const scopedBedRequirements = await resolveAttendeeBedRequirements(
      ctx,
      scopedAttendees.map((attendee) => attendee._id)
    )

    // --- Canonical payment-state projection (Phase 44) ---
    // Group the scoped attendees by order once and load the canonical
    // per-attendee payment breakdown exactly once for the scoped order set.
    // The board never reads orders.status and never queries payments inside
    // the attendee mapping loops below; rows consume the precomputed map.
    const attendeeIdsByOrderId = new Map<string, string[]>()
    for (const attendee of scopedAttendees) {
      const orderKey = String(attendee.orderId)
      const attendeeIds = attendeeIdsByOrderId.get(orderKey) ?? []
      attendeeIds.push(String(attendee._id))
      attendeeIdsByOrderId.set(orderKey, attendeeIds)
    }

    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      scopedOrders
    )
    const paymentById = await loadOrderAttendeePaymentBreakdowns({
      ctx,
      orders: scopedOrders,
      dueBreakdownsByOrderId,
      attendeeIdsByOrderId,
    })

    // --- Accommodation preference projection (quick task 260807-uel) ---
    // Load the scoped orders' stored accommodation selection rows and their
    // generic option child rows, mirroring the per-order Promise.all loading
    // pattern used for orderAttendees/orderAssignments below. The projection
    // feeds an attendeeId-keyed preference map consumed by both attendee
    // surfaces (unassigned inbox and room occupants) so admins see what
    // buyers selected. No schema changes: all fields come from existing
    // stored selection and option rows.
    const scopedOrderIds = scopedOrders.map((s) => s._id)

    const [accommodationSelectionGroups, accommodationOptionGroups]: [
      Doc<"orderAccommodationSelections">[][],
      Doc<"orderAccommodationOptionSelections">[][],
    ] = scopedOrderIds.length
      ? await Promise.all([
          Promise.all(
            scopedOrderIds.map((oid) =>
              ctx.db
                .query("orderAccommodationSelections")
                .withIndex("by_orderId", (q) => q.eq("orderId", oid))
                .take(BOARD_ORDER_COLLECTION_LIMIT + 1)
            )
          ),
          Promise.all(
            scopedOrderIds.map((oid) =>
              ctx.db
                .query("orderAccommodationOptionSelections")
                .withIndex("by_orderId", (q) => q.eq("orderId", oid))
                .take(BOARD_ORDER_COLLECTION_LIMIT + 1)
            )
          ),
        ])
      : [[], []]

    const accommodationSelectionDocs = flattenDetecting(
      accommodationSelectionGroups,
      BOARD_ORDER_COLLECTION_LIMIT,
      "order accommodation selections",
      markBoardIncomplete
    )
    const accommodationOptionDocs = flattenDetecting(
      accommodationOptionGroups,
      BOARD_ORDER_COLLECTION_LIMIT,
      "order accommodation options",
      markBoardIncomplete
    )

    const categoryById = new Map(
      accommodationCategoriesDocs.map((c) => [c._id as string, c])
    )

    // Group generic option child rows by their base selection id. A selection
    // row belongs to exactly one attendee, so selectionId grouping is
    // attendee-safe.
    const optionKeysBySelectionId = new Map<string, string[]>()
    for (const option of accommodationOptionDocs) {
      const selectionKey = String(option.selectionId)
      const existing = optionKeysBySelectionId.get(selectionKey) ?? []
      existing.push(option.optionKey)
      optionKeysBySelectionId.set(selectionKey, existing)
    }

    // attendeeId-keyed preference map; there is one selection row per attendee
    // per order, so the first row wins and duplicates cannot double-join.
    const accommodationPreferenceByAttendeeId = new Map<
      string,
      {
        occupancy: "single" | "shared" | "family" | null
        nightBeforeLevel: "standard" | "superior" | null
        nightBeforeOccupancy: "single" | "shared" | null
        categoryLabel: string | null
        optionKeys: string[]
      }
    >()
    for (const selection of accommodationSelectionDocs) {
      const attendeeKey = String(selection.attendeeId)
      if (accommodationPreferenceByAttendeeId.has(attendeeKey)) continue
      const category = selection.categoryId
        ? (categoryById.get(String(selection.categoryId)) ?? null)
        : null
      accommodationPreferenceByAttendeeId.set(attendeeKey, {
        occupancy:
          ticketOccupancyByAttendeeId.get(attendeeKey) ??
          selection.occupancy ??
          null,
        nightBeforeLevel: selection.nightBeforeLevel ?? null,
        nightBeforeOccupancy: selection.nightBeforeOccupancy ?? null,
        categoryLabel: category?.label ?? null,
        optionKeys: optionKeysBySelectionId.get(String(selection._id)) ?? [],
      })
    }

    const attendeeCountByOrderId = new Map<string, number>()
    for (const attendee of scopedAttendees) {
      attendeeCountByOrderId.set(
        attendee.orderId as string,
        (attendeeCountByOrderId.get(attendee.orderId as string) ?? 0) + 1
      )
    }

    // Build pending assignments by room early so room mapping can read it safely.
    const pendingAssignmentsByRoom = new Map<
      string,
      Array<{
        assignmentId: string
        attendeeId: string
        attendeeName: string | null
        attendeeEmail: string | null
        assignmentIntent: "assign" | "skip"
        sortOrder: number
        familyRole: FamilyRole
        familyGroupId: string | null
        familyParentAttendeeId: string | null
        eligibleChildIds: string[]
        eligibleChildCount: number
      }>
    >()

    const filteredRooms = rooms.filter((room) => {
      if (scopedHotelIds && !scopedHotelIds.includes(room.hotelId as string))
        return false
      if (args.hotelId && room.hotelId !== args.hotelId) return false
      if (args.roomTypeId && room.roomTypeId !== args.roomTypeId) return false
      return true
    })

    const familyUnitByAttendeeId = new Map<string, FamilyPlacementUnit>()
    for (const attendee of scopedAttendees) {
      familyUnitByAttendeeId.set(
        String(attendee._id),
        await resolveFamilyPlacementUnit(
          ctx,
          eventId,
          attendee,
          scopedBedRequirements,
          markBoardIncomplete
        )
      )
    }

    type FamilyFollowUpState =
      | "Needs family link"
      | "Waiting for parent room"
      | "Separate placement required"
      | "inconsistent"
    const familyFollowUps: Array<{
      attendeeId: string
      attendeeName: string | null
      familyGroupId: string | null
      familyLabel: string | null
      familyParentAttendeeId: string | null
      familyParentName: string | null
      state: FamilyFollowUpState
      message: string
    }> = []
    const followUpKeys = new Set<string>()
    const addFamilyFollowUp = (input: {
      attendee: Doc<"orderAttendees">
      unit: FamilyPlacementUnit
      state: FamilyFollowUpState
      message: string
    }) => {
      const key = `${input.state}:${String(input.attendee._id)}`
      if (followUpKeys.has(key)) return
      followUpKeys.add(key)
      familyFollowUps.push({
        attendeeId: String(input.attendee._id),
        attendeeName: input.attendee.name ?? null,
        familyGroupId: input.unit.familyGroupId,
        familyLabel: input.unit.familyLabel,
        familyParentAttendeeId: input.unit.familyParentAttendeeId,
        familyParentName: input.unit.parent?.name ?? null,
        state: input.state,
        message: input.message,
      })
    }

    // WR-04: the same server-side predicate that filters the unassigned queue
    // also filters follow-ups, so a filtered board never advertises unrelated
    // blocked family follow-ups.
    const attendeePassesFilters = (attendee: Doc<"orderAttendees">) => {
      const unit = familyUnitByAttendeeId.get(String(attendee._id))!
      const genderType =
        attendee.gender === "male"
          ? "MALE"
          : attendee.gender === "female"
            ? "FEMALE"
            : attendee.gender === "mixed"
              ? "MIXED"
              : "UNKNOWN"
      if (args.genderType && genderType !== args.genderType) return false
      if (args.familyGroupId && unit.familyGroupId !== args.familyGroupId)
        return false
      const normalizedLocation = normalizeOptionalString(attendee.location)
      if (
        normalizedLocationFilter &&
        (!normalizedLocation ||
          normalizedLocation.toLowerCase() !== normalizedLocationFilter.toLowerCase())
      )
        return false
      if (
        args.allocationPriority &&
        attendee.allocationPriority !== args.allocationPriority
      )
        return false
      if (
        args.hasPriority !== undefined &&
        hasPriorityAttendee(attendee.allocationPriority ?? null) !== args.hasPriority
      )
        return false
      return true
    }

    const isSeparatePlacementMember = (
      unit: FamilyPlacementUnit,
      attendee: Doc<"orderAttendees">
    ) =>
      unit.separateMembers.some(
        (member) => String(member._id) === String(attendee._id)
      )

    for (const attendee of scopedAttendees) {
      const unit = familyUnitByAttendeeId.get(String(attendee._id))!
      const requirement = scopedBedRequirements.get(String(attendee._id))
      if (!requirement?.placementEligible) continue
      if (!attendeePassesFilters(attendee)) continue

      if (!unit.valid && unit.familyState === "needs-family-link") {
        addFamilyFollowUp({
          attendee,
          unit,
          state: "Needs family link",
          message:
            "Review attendee details and link a valid family parent before placing this no-bed attendee.",
        })
      } else if (!unit.valid || unit.familyState === "inconsistent") {
        addFamilyFollowUp({
          attendee,
          unit,
          state: "inconsistent",
          message: "Review the family relationship before placing this attendee.",
        })
      } else if (
        !attendee.assignedRoomId &&
        isSeparatePlacementMember(unit, attendee)
      ) {
        // CR-06: a bed-requiring (or otherwise non-followable) family member is
        // deliberately excluded from the parent's atomic child set. It stays a
        // first-class placement unit in the queue and receives an explicit
        // server-owned follow-up so it can never disappear from operational
        // state once the parent is placed.
        addFamilyFollowUp({
          attendee,
          unit,
          state: "Separate placement required",
          message:
            "This family member requires a separate placement and is not moved with the parent. Assign them to a room directly.",
        })
      } else if (
        unit.familyRole === "child" &&
        unit.parent &&
        !unit.parent.assignedRoomId &&
        unit.eligibleChildren.some(
          (child) => String(child.attendee._id) === String(attendee._id)
        )
      ) {
        addFamilyFollowUp({
          attendee,
          unit,
          state: "Waiting for parent room",
          message: "Place the parent to assign this child to the same room.",
        })
      }
    }

    const eventUnassignedAttendees = scopedAttendees.filter((attendee) => {
      const requirement = scopedBedRequirements.get(String(attendee._id))
      return (
        !attendee.assignedRoomId &&
        requirement?.placementEligible === true
      )
    })

    const unassignedAttendees = eventUnassignedAttendees.filter((attendee) => {
      const unit = familyUnitByAttendeeId.get(String(attendee._id))!
      const coveredByUnassignedParent =
        unit.familyRole === "child" &&
        unit.parent &&
        !unit.parent.assignedRoomId &&
        unit.eligibleChildren.some(
          (child) => String(child.attendee._id) === String(attendee._id)
        )
      if (coveredByUnassignedParent) return false
      return attendeePassesFilters(attendee)
    })

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))
    const roomById = new Map(rooms.map((room) => [room._id as string, room]))

    // Build mapping from canonical eventId to event info
    const canonicalEventById = new Map(
      internalCanonicalEvents.map((e) => [e._id as string, e])
    )

    const attendeesByRoom: Record<string, typeof scopedAttendees> = {}
    for (const attendee of scopedAttendees) {
      if (attendee.assignedRoomId) {
        if (!attendeesByRoom[attendee.assignedRoomId]) {
          attendeesByRoom[attendee.assignedRoomId] = []
        }
        attendeesByRoom[attendee.assignedRoomId].push(attendee)
      }
    }

    const roomOccupancyById = new Map(
      await Promise.all(
        filteredRooms.map(async (room) => [
          String(room._id),
          await loadRoomOccupancy(
            ctx,
            String(room._id),
            room.capacity,
            eventId
          ),
        ] as const)
      )
    )

    // CR-04/CR-05: one provider-reconciliation rule for the whole board. A
    // provider row with a resolvable canonical `attendeeId` bridge is owned by
    // that canonical record — assignment state is globally canonical, so the
    // provider row is never projected or counted as a second identity, even
    // when it carries a stale room value. A provider row with no resolvable
    // bridge is physical occupancy (counted by loadRoomOccupancy) but has no
    // safe selected-event identity, so the room projection is marked
    // incomplete and must be reviewed before further placement. This is the
    // same rule used by loadRoomOccupancy/hasPhysicalRoomOccupants, so
    // occupancy, projection, queue suppression, and capacity writes agree.
    const providerProjectionIncompleteRooms = new Set<string>()
    await Promise.all(
      filteredRooms.map(async (room) => {
        const providerRows = await ctx.db
          .query("ticketTailorAttendees")
          .withIndex("by_assignedRoomId", (q) =>
            q.eq("assignedRoomId", String(room._id))
          )
          .take(ROOM_OCCUPANT_LIMIT)
        for (const provider of providerRows) {
          const canonicalAttendee = provider.attendeeId
            ? await ctx.db.get("orderAttendees", provider.attendeeId)
            : null
          if (canonicalAttendee) continue
          const order = await ctx.db.get("orders", provider.orderId)
          if (!order || String(order.eventId) !== eventId) continue
          providerProjectionIncompleteRooms.add(String(room._id))
        }
      })
    )

    const mappedRooms = filteredRooms.map((room) => {
      const hotel = hotelMap.get(room.hotelId as string)
      const roomType = roomTypeMap.get(room.roomTypeId as string)
      // RMG-04: server-computed mismatch inputs — the assigned room's resolved
      // category code and capacity. Unresolvable => null => the flag fails
      // safe to false (never a fabricated warning).
      const roomCategoryCode = roomType?.categoryId
        ? ((categoryById.get(String(roomType.categoryId)) as
            | { code?: string }
            | undefined)?.code ?? null)
        : null
      const roomCapacity = roomType?.defaultCapacity ?? room.capacity
      const occupants = (attendeesByRoom[room._id] ?? []).map((a) => {
        const familyUnit = familyUnitByAttendeeId.get(String(a._id))
        const order = orderById.get(a.orderId as string)
        const canonicalEvent = order
          ? canonicalEventById.get(order.eventId as string)
          : null
        const payment = paymentById.get(String(a._id))
        const preference = accommodationPreferenceByAttendeeId.get(
          String(a._id)
        )
        // RMG-04: night-before reuses the main-stay assignment — the flag
        // only surfaces when the independent night-before choice cannot be
        // satisfied by the assigned room (category conflict, or a shared
        // night-before choice in a single-capacity room). No night-before
        // selection, no assigned room, or unresolvable category/capacity => false.
        const nbLevel = preference?.nightBeforeLevel ?? null
        const nbOccupancy = preference?.nightBeforeOccupancy ?? null
        let nightBeforeMismatch = false
        if (nbLevel && roomCategoryCode) {
          const levelMatchesCategory =
            (nbLevel === "standard" && roomCategoryCode === "standard") ||
            (nbLevel === "superior" && roomCategoryCode === "superior")
          nightBeforeMismatch = !levelMatchesCategory
        }
        if (!nightBeforeMismatch && nbLevel && nbOccupancy && roomCapacity) {
          if (nbOccupancy === "shared" && roomCapacity === 1) {
            nightBeforeMismatch = true
          }
        }
        const bedRequirement = scopedBedRequirements.get(String(a._id))
        return {
          attendeeId: a._id,
          orderId: order?._id ?? null,
          attendeeName: a.name ?? null,
          attendeeEmail: a.email ?? null,
          genderType: normalizeGender(a.gender),
          providerOrderId: order?.providerOrderId ?? null,
          providerEventId: order?.providerEventId ?? null,
          eventId: canonicalEvent?._id ?? null,
          eventName: canonicalEvent?.title ?? null,
          ticketTypeLabel: null,
          paymentState: payment?.paymentState ?? null,
          amountDueMinor: payment?.amountDueMinor ?? null,
          paidAmountMinor: payment?.paidAmountMinor ?? null,
          occupancy: preference?.occupancy ?? null,
          nightBeforeLevel: preference?.nightBeforeLevel ?? null,
          nightBeforeOccupancy: preference?.nightBeforeOccupancy ?? null,
          categoryLabel: preference?.categoryLabel ?? null,
          optionKeys: preference?.optionKeys ?? [],
          requiresBed: bedRequirement?.requiresBed ?? true,
          nightBeforeMismatch,
          familyRole: familyUnit?.familyRole ?? "solo",
          familyGroupId: familyUnit?.familyGroupId ?? null,
          familyLabel: familyUnit?.familyLabel ?? null,
          familyParentAttendeeId:
            familyUnit?.familyParentAttendeeId ?? null,
          familyState: familyUnit?.familyState ?? "inconsistent",
          eligibleChildren:
            familyUnit?.familyRole === "parent"
              ? familyUnit.eligibleChildren.map((child) => ({
                  attendeeId: String(child.attendee._id),
                  attendeeName: child.attendee.name ?? null,
                  requiresBed: false,
                  familyRole: "child" as const,
                  familyState: child.familyState,
                }))
              : [],
          eligibleChildCount: familyUnit?.eligibleChildren.length ?? 0,
          separateMemberCount: unassignedSeparateMembers(familyUnit).length,
          separateMembers: unassignedSeparateMembers(familyUnit).map((member) => ({
            attendeeId: String(member._id),
            attendeeName: member.name ?? null,
            requiresBed:
              scopedBedRequirements.get(String(member._id))?.requiresBed ?? true,
          })),
        }
      })
      const roomProjectionIncomplete = providerProjectionIncompleteRooms.has(
        String(room._id)
      )
      const physicalOccupancy = roomOccupancyById.get(String(room._id)) ?? {
        occupantCount: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        foreignOccupantCount: 0,
        incomplete: true,
      }
      const occupiedBeds = physicalOccupancy.occupiedBeds
      const availableBeds = physicalOccupancy.availableBeds
      const occupancyIncomplete =
        physicalOccupancy.incomplete || roomProjectionIncomplete
      // WR-03: an incomplete physical or identity projection must never be
      // labelled as a confident empty/available/full room. `review` is the
      // explicit incomplete status consumed by the board UI.
      const availability = occupancyIncomplete
        ? "review"
        : physicalOccupancy.occupantCount === 0
          ? "empty"
          : availableBeds === 0
            ? "full"
            : "available"

      return {
        id: room._id,
        label: room.label,
        capacity: room.capacity,
        occupantCount: physicalOccupancy.occupantCount,
        foreignOccupantCount: physicalOccupancy.foreignOccupantCount,
        occupancyIncomplete,
        occupiedBeds,
        availableBeds,
        availability,
        notes: room.notes ?? null,
        hotel: hotel
          ? { id: hotel._id, name: hotel.name, city: hotel.city ?? null }
          : undefined,
        roomType: roomType
          ? {
              id: roomType._id,
              label: roomType.label,
              defaultCapacity: roomType.defaultCapacity,
            }
          : undefined,
        occupants,
        providerProjectionIncomplete: roomProjectionIncomplete,
        pendingAssignments: pendingAssignmentsByRoom.get(room._id) ?? [],
      }
    })

    // These legacy order-member fields remain additive for older consumers,
    // but they are never used as family authority or an assignment recipe.
    const legacyOrderMemberIdsByAttendeeId = new Map<string, string[]>()
    for (const attendee of eventUnassignedAttendees) {
      const ids = eventUnassignedAttendees
        .filter((candidate) => candidate.orderId === attendee.orderId)
        .map((candidate) => String(candidate._id))
      legacyOrderMemberIdsByAttendeeId.set(String(attendee._id), ids)
    }

    const mappedUnassignedAttendees = unassignedAttendees.map((a) => {
      const order = orderById.get(a.orderId as string)
      const canonicalEvent = order
        ? canonicalEventById.get(order.eventId as string)
        : null
      const familyUnit = familyUnitByAttendeeId.get(String(a._id))!
      const payment = paymentById.get(String(a._id))
      const preference = accommodationPreferenceByAttendeeId.get(String(a._id))
      const legacyOrderMemberIds =
        legacyOrderMemberIdsByAttendeeId.get(String(a._id)) ?? []
      const roomTypeId = a.allocatedRoomTypeId
        ? String(a.allocatedRoomTypeId)
        : null
      const orderMembers = eventUnassignedAttendees.filter(
        (candidate) => candidate.orderId === a.orderId
      )
      return {
        attendeeId: a._id,
        orderId: order?._id ?? null,
        bookingRef: order?.bookingRef ?? null,
        bookerName: order?.bookerName ?? null,
        attendeeName: a.name ?? null,
        attendeeEmail: a.email ?? null,
        providerOrderId: order?.providerOrderId ?? null,
        providerEventId: order?.providerEventId ?? null,
        eventId: canonicalEvent?._id ?? null,
        eventName: canonicalEvent?.title ?? null,
        ticketTypeLabel: null,
        allocatedRoomTypeId: (a.allocatedRoomTypeId as string) ?? null,
        genderType:
          a.gender === "male"
            ? "MALE"
            : a.gender === "female"
              ? "FEMALE"
              : a.gender === "mixed"
                ? "MIXED"
                : "UNKNOWN",
        allocationPriority: a.allocationPriority ?? null,
        location: a.location ?? null,
        remarks: null,
        roommatePreference: a.roommatePreference ?? null,
        roommateAvoid: a.roommateAvoid ?? null,
        hasFamily:
          familyUnit.familyGroupId !== null ||
          hasFamilySignal({
            attendeeId: a._id,
            orderId: order?._id ?? null,
            attendeeFamilyGroupId: familyUnit.familyGroupId,
            attendeeCountByOrderId,
          }),
        groupMemberIds:
          familyUnit.familyGroupId !== null
            ? familyUnit.members.map((member) => String(member._id))
            : legacyOrderMemberIds,
        groupAssignmentAvailable:
          familyUnit.familyGroupId !== null
            ? familyUnit.eligibleChildren.length > 0
            : legacyOrderMemberIds.length > 1 &&
              roomTypeId !== null &&
              orderMembers.every(
                (member) => String(member.allocatedRoomTypeId ?? "") === roomTypeId
              ),
        familyRole: familyUnit.familyRole,
        familyGroupId: familyUnit.familyGroupId,
        familyLabel: familyUnit.familyLabel,
        familyParentAttendeeId: familyUnit.familyParentAttendeeId,
        familyState: familyUnit.familyState,
        eligibleChildren: familyUnit.eligibleChildren.map((child) => ({
          attendeeId: String(child.attendee._id),
          attendeeName: child.attendee.name ?? null,
          attendeeEmail: child.attendee.email ?? null,
          requiresBed: false,
          familyRole: "child" as const,
          familyState: child.familyState,
        })),
        eligibleChildCount: familyUnit.eligibleChildren.length,
        separateMemberCount: unassignedSeparateMembers(familyUnit).length,
        separateMembers: unassignedSeparateMembers(familyUnit).map((member) => ({
          attendeeId: String(member._id),
          attendeeName: member.name ?? null,
          requiresBed:
            scopedBedRequirements.get(String(member._id))?.requiresBed ?? true,
          familyState: familyUnit.familyState,
        })),
        separatePlacementRequired: familyUnit.separateMembers.some(
          (member) => String(member._id) === String(a._id)
        ),
        paymentState: payment?.paymentState ?? null,
        amountDueMinor: payment?.amountDueMinor ?? null,
        paidAmountMinor: payment?.paidAmountMinor ?? null,
        occupancy: preference?.occupancy ?? null,
        nightBeforeLevel: preference?.nightBeforeLevel ?? null,
        nightBeforeOccupancy: preference?.nightBeforeOccupancy ?? null,
        categoryLabel: preference?.categoryLabel ?? null,
        optionKeys: preference?.optionKeys ?? [],
        requiresBed:
          scopedBedRequirements.get(String(a._id))?.requiresBed ?? true,
      }
      })

    // Paid-first ordering (Phase 44): payment state is the primary rank, then
    // the existing allocation priority, then stable group/name/id tie-breakers.
    mappedUnassignedAttendees.sort((a, b) => {
      const aPaymentRank = paymentStateRank(a.paymentState)
      const bPaymentRank = paymentStateRank(b.paymentState)
      if (aPaymentRank !== bPaymentRank) return aPaymentRank - bPaymentRank

      const aPriorityRank = allocationPriorityRank(a.allocationPriority)
      const bPriorityRank = allocationPriorityRank(b.allocationPriority)
      if (aPriorityRank !== bPriorityRank) return aPriorityRank - bPriorityRank

      const orderComparison = (a.orderId ?? "").localeCompare(b.orderId ?? "")
      if (orderComparison !== 0) return orderComparison

      const nameComparison = (a.attendeeName ?? "").localeCompare(
        b.attendeeName ?? ""
      )
      if (nameComparison !== 0) return nameComparison

      return a.attendeeId.localeCompare(b.attendeeId)
    })

    // --- Canonical submission queue rows ---
    const submissionIds = scopedOrders.map((s) => s._id)

    const [orderAttendeeGroups, orderAssignmentGroups]: [
      Doc<"orderAttendees">[][],
      Doc<"orderAssignments">[][],
    ] = submissionIds.length
      ? await Promise.all([
          Promise.all(
            submissionIds.map((sid) =>
              ctx.db
                .query("orderAttendees")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", sid as Id<"orders">)
                )
                .take(BOARD_ORDER_COLLECTION_LIMIT + 1)
            )
          ),
          Promise.all(
            submissionIds.map((sid) =>
              ctx.db
                .query("orderAssignments")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", sid as Id<"orders">)
                )
                .take(BOARD_ORDER_COLLECTION_LIMIT + 1)
            )
          ),
        ])
      : [[], []]

    const orderAttendeesList = flattenDetecting(
      orderAttendeeGroups,
      BOARD_ORDER_COLLECTION_LIMIT,
      "order attendees",
      markBoardIncomplete
    )
    const orderAssignmentsList = flattenDetecting(
      orderAssignmentGroups,
      BOARD_ORDER_COLLECTION_LIMIT,
      "order assignments",
      markBoardIncomplete
    )

    // orderById already declared above

    const slotById = new Map(
      accommodationSlotDocs.map((s) => [s._id as string, s])
    )

    // Build mapping from slotId to roomId
    const slotIdToRoomId = new Map<string, string>()
    for (const slot of accommodationSlotDocs) {
      slotIdToRoomId.set(slot._id as string, slot.roomId as string)
    }

    const attendeeById = new Map(
      orderAttendeesList.map((attendee) => [attendee._id as string, attendee])
    )

    // RMG-02: server-computed mixed Standard/Superior group flags. Under the
    // simplified contract the included category is Standard and Superior is
    // the per-attendee superior_upgrade option, so a member is "Superior"
    // when its stored selection carries that option. A pending buyer group
    // (≥2 attendees sharing a requested room) that spans both is flagged on
    // every member (buyerSuggestions[].mixedCategory) and on the requested
    // room (rooms[].mixedCategoryGroup).
    const suggestionSuperiorByAttendeeId = new Map<string, boolean>()
    for (const attendeeKey of accommodationPreferenceByAttendeeId.keys()) {
      const preference = accommodationPreferenceByAttendeeId.get(attendeeKey)
      const isSuperior =
        preference?.optionKeys.includes(SUPERIOR_UPGRADE_OPTION_KEY) ?? false
      suggestionSuperiorByAttendeeId.set(attendeeKey, isSuperior)
    }
    const mixedMemberAttendeeIds = new Set<string>()
    const mixedGroupRoomIds = new Set<string>()
    {
      const groupByRoom = new Map<string, string[]>()
      for (const assignment of orderAssignmentsList) {
        const roomId = slotIdToRoomId.get(assignment.slotId as string)
        if (!roomId) continue
        const members = groupByRoom.get(roomId) ?? []
        members.push(String(assignment.attendeeId))
        groupByRoom.set(roomId, members)
      }
      for (const [roomId, attendeeIds] of groupByRoom) {
        if (attendeeIds.length < 2) continue
        let hasStandard = false
        let hasSuperior = false
        for (const attendeeId of attendeeIds) {
          if (suggestionSuperiorByAttendeeId.get(attendeeId)) {
            hasSuperior = true
          } else {
            hasStandard = true
          }
        }
        if (hasStandard && hasSuperior) {
          mixedGroupRoomIds.add(roomId)
          for (const attendeeId of attendeeIds) {
            mixedMemberAttendeeIds.add(attendeeId)
          }
        }
      }
    }

    const buyerSuggestions = orderAssignmentsList
      .filter((assignment) => {
        const assignmentAny = assignment as { status?: string }
        if (assignmentAny.status && assignmentAny.status !== "pending") return false
        const attendeeId = String(assignment.attendeeId)
        const familyUnit = familyUnitByAttendeeId.get(attendeeId)
        const requirement = scopedBedRequirements.get(attendeeId)
        return requirement?.placementEligible === true && familyUnit?.valid === true
      })
      .map((assignment) => {
        const roomId = slotIdToRoomId.get(assignment.slotId as string)
        const room = roomId ? roomById.get(roomId) : null
        const hotel = room ? hotelMap.get(room.hotelId as string) : null
        const attendee = attendeeById.get(assignment.attendeeId as string)
        const payment = paymentById.get(String(assignment.attendeeId))
        const familyUnit = familyUnitByAttendeeId.get(
          String(assignment.attendeeId)
        )!

        return {
          assignmentId: assignment._id as string,
          attendeeId: assignment.attendeeId as string,
          attendeeName: attendee?.name ?? null,
          attendeeEmail: attendee?.email ?? null,
          roomId: room?._id ?? null,
          roomLabel: room?.label ?? null,
          hotelName: hotel?.name ?? null,
          assignmentIntent: assignment.assignmentIntent,
          sortOrder: assignment.sortOrder,
          paymentState: payment?.paymentState ?? null,
          amountDueMinor: payment?.amountDueMinor ?? null,
          paidAmountMinor: payment?.paidAmountMinor ?? null,
          mixedCategory: mixedMemberAttendeeIds.has(
            String(assignment.attendeeId)
          ),
          familyRole: familyUnit.familyRole,
          familyGroupId: familyUnit.familyGroupId,
          familyParentAttendeeId: familyUnit.familyParentAttendeeId,
          eligibleChildIds: familyUnit.eligibleChildren.map((child) =>
            String(child.attendee._id)
          ),
          eligibleChildCount: familyUnit.eligibleChildren.length,
        }
      })
      .sort((a, b) => {
        if ((a.roomLabel ?? "") !== (b.roomLabel ?? "")) {
          return (a.roomLabel ?? "").localeCompare(b.roomLabel ?? "")
        }

        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder
        }

        return (a.attendeeName ?? "").localeCompare(b.attendeeName ?? "")
      })

    // Filter pending assignments: assignmentIntent="assign" and (status is undefined/pending)
    for (const assignment of orderAssignmentsList) {
      const assignmentAny = assignment as { status?: string }
        const isPending =
        assignment.assignmentIntent === "assign" &&
        (!assignmentAny.status || assignmentAny.status === "pending") &&
        scopedBedRequirements.get(String(assignment.attendeeId))
          ?.placementEligible === true &&
        familyUnitByAttendeeId.get(String(assignment.attendeeId))?.valid === true

      if (!isPending) continue

      const roomId = slotIdToRoomId.get(assignment.slotId as string)
      if (!roomId) continue

      const attendee = await ctx.db.get(
        "orderAttendees",
        assignment.attendeeId as Id<"orderAttendees">
      )

      const pendingAssignment = {
        assignmentId: assignment._id as string,
        attendeeId: assignment.attendeeId as string,
        attendeeName: attendee?.name ?? null,
        attendeeEmail: attendee?.email ?? null,
        assignmentIntent: assignment.assignmentIntent,
        sortOrder: assignment.sortOrder,
        familyRole:
          familyUnitByAttendeeId.get(String(assignment.attendeeId))?.familyRole ??
          "solo",
        familyGroupId:
          familyUnitByAttendeeId.get(String(assignment.attendeeId))?.familyGroupId ??
          null,
        familyParentAttendeeId:
          familyUnitByAttendeeId.get(String(assignment.attendeeId))
            ?.familyParentAttendeeId ?? null,
        eligibleChildIds:
          familyUnitByAttendeeId
            .get(String(assignment.attendeeId))
            ?.eligibleChildren.map((child) => String(child.attendee._id)) ?? [],
        eligibleChildCount:
          familyUnitByAttendeeId.get(String(assignment.attendeeId))
            ?.eligibleChildren.length ?? 0,
      }

      const existing = pendingAssignmentsByRoom.get(roomId) ?? []
      existing.push(pendingAssignment)
      pendingAssignmentsByRoom.set(roomId, existing)
    }

    const assignmentByAttendeeId = new Map<
      string,
      (typeof orderAssignmentsList)[number]
    >()
    for (const assignment of orderAssignmentsList) {
      assignmentByAttendeeId.set(assignment.attendeeId as string, assignment)
    }

    const submissionQueueRows = orderAttendeesList.map((attendee) => {
      const order = orderById.get(attendee.orderId as string)
      const assignment = assignmentByAttendeeId.get(attendee._id as string)
      const payment = paymentById.get(String(attendee._id))

      let unresolved = false
      let unresolvedReason: string | null = null

      if (!assignment) {
        unresolved = true
        unresolvedReason = "no_assignment_record"
      } else if (assignment.assignmentIntent === "skip") {
        unresolved = true
        unresolvedReason = "skipped_intent"
      } else if (assignment.assignmentIntent === "assign") {
        const slot = slotById.get(assignment.slotId as string)
        if (!slot || !slot.isAssignable) {
          unresolved = true
          unresolvedReason = "slot_not_assignable"
        }
      }

      const genderType = normalizeGender(attendee.gender)

      return {
        attendeeId: `internal-${order?._id ?? "unknown"}-${attendee.attendeeKey}`,
        attendeeName: attendee.name,
        attendeeEmail: attendee.email ?? null,
        source: "internal" as const,
        submissionId: order?._id ?? null,
        bookingRef: order?.bookingRef ?? null,
        submissionNotes: order?.notes ?? null,
        assignmentIntent: assignment?.assignmentIntent ?? null,
        slotId: assignment?.slotId ?? null,
        roommatePreference: attendee.roommatePreference || null,
        roommateAvoid: attendee.roommateAvoid || null,
        dietaryRestrictions: attendee.dietaryRestrictions || null,
        bookerName: order?.bookerName ?? null,
        genderType,
        location: attendee.location || null,
        unresolved,
        unresolvedReason,
        submittedAt: order?.submittedAt ?? null,
        sortOrder: attendee.sortOrder,
        allocationPriority: attendee.allocationPriority ?? null,
        paymentState: payment?.paymentState ?? null,
        amountDueMinor: payment?.amountDueMinor ?? null,
        paidAmountMinor: payment?.paidAmountMinor ?? null,
      }
    })

    const assignedSlotHotelIds = new Set<string>()
    for (const row of submissionQueueRows) {
      if (row.slotId) {
        const slot = slotById.get(row.slotId as string)
        if (slot) {
          assignedSlotHotelIds.add(slot.hotelId as string)
        }
      }
    }

    const missingSlotHotelIds = [...assignedSlotHotelIds].filter(
      (id) => !hotelMap.has(id)
    )
    if (missingSlotHotelIds.length > 0) {
      const extraHotels = await Promise.all(
        missingSlotHotelIds.map((id) =>
          ctx.db.get("accommodationHotels", id as Id<"accommodationHotels">)
        )
      )
      for (const hotel of extraHotels) {
        if (hotel) {
          hotelMap.set(hotel._id as string, hotel)
        }
      }
    }

    // Sort: payment state first (paid/partial/unpaid), then allocation
    // priority (CRITICAL before LOW), then unresolved, then submittedAt,
    // then attendeeId (stable existing tie-breakers preserved).
    submissionQueueRows.sort((a, b) => {
      const aPaymentRank = paymentStateRank(a.paymentState)
      const bPaymentRank = paymentStateRank(b.paymentState)
      if (aPaymentRank !== bPaymentRank) return aPaymentRank - bPaymentRank

      const aPriorityRank = allocationPriorityRank(a.allocationPriority)
      const bPriorityRank = allocationPriorityRank(b.allocationPriority)
      if (aPriorityRank !== bPriorityRank) return aPriorityRank - bPriorityRank

      if (a.unresolved !== b.unresolved) return a.unresolved ? -1 : 1
      const aTime = a.submittedAt ?? 0
      const bTime = b.submittedAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return a.attendeeId.localeCompare(b.attendeeId)
    })

    const eventHotels = await collectAll(
      ctx.db.query("accommodationEventHotels")
    )
    const eventHotelsByEvent: Record<string, string[]> = {}
    for (const eh of eventHotels) {
      if (!eventHotelsByEvent[eh.eventId]) {
        eventHotelsByEvent[eh.eventId] = []
      }
      eventHotelsByEvent[eh.eventId].push(eh.hotelId)
    }

    return {
      generatedAt: new Date().toISOString(),
      // CR-07: explicit server-owned completeness signal. When any authoritative
      // board read was capped, `incomplete` is true and `reasons` names the
      // truncated collection(s); the UI must not claim placement is complete.
      dataCompleteness: {
        incomplete: boardIncompleteReasons.length > 0,
        reasons: boardIncompleteReasons,
      },
      filters: {
        eventId: eventId ?? null,
        search: null,
        hotelId: args.hotelId ?? null,
        roomTypeId: args.roomTypeId ?? null,
        availability: "all" as const,
        genderType: args.genderType ?? null,
        familyGroupId: args.familyGroupId ?? null,
        location: normalizedLocationFilter,
        allocationPriority: args.allocationPriority ?? null,
        hasPriority: args.hasPriority ?? null,
      },
      availableEvents: canonicalEvents
        .filter(
          (e) => e.accommodationEnabled && e.primarySourceKind === "internal"
        )
        .map((e) => ({
          eventId: e._id,
          slug: e.slug,
          name: e.title,
          startsAt: e.startsAt,
        })),
      hotels: hotels
        .filter(
          (h) => !scopedHotelIds || scopedHotelIds.includes(h._id as string)
        )
        .map((h) => ({
          id: h._id,
          name: h.name,
          assignedEventIds: eventHotelsByEvent[h._id] ?? [],
        })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt._id,
        label: rt.label,
        defaultCapacity: rt.defaultCapacity,
      })),
      // RMG-02: room-level mixed-group flag applied after the mixed sets are
      // computed (they depend on orderAssignments/slot loading).
      rooms: mappedRooms.map((room) => ({
        ...room,
        mixedCategoryGroup: mixedGroupRoomIds.has(String(room.id)),
      })),
      buyerSuggestions,
      familyFollowUps,
      unassignedAttendees: mappedUnassignedAttendees,
      submissionQueueRows,
      summary: {
        totalRooms: mappedRooms.length,
        emptyRooms: mappedRooms.filter((r) => r.availability === "empty")
          .length,
        availableRooms: mappedRooms.filter(
          (r) => r.availability === "available"
        ).length,
        fullRooms: mappedRooms.filter((r) => r.availability === "full").length,
        totalBeds: mappedRooms.reduce((sum, r) => sum + r.capacity, 0),
        totalOccupants: mappedRooms.reduce(
          (sum, r) => sum + r.occupantCount,
          0
        ),
        occupiedBeds: mappedRooms.reduce((sum, r) => sum + r.occupiedBeds, 0),
        availableBeds: mappedRooms.reduce((sum, r) => sum + r.availableBeds, 0),
        foreignOccupants: mappedRooms.reduce(
          (sum, r) => sum + r.foreignOccupantCount,
          0
        ),
        occupancyIncomplete: mappedRooms.some((r) => r.occupancyIncomplete),
        incomplete: boardIncompleteReasons.length > 0,
        unassignedAttendeesCount: mappedUnassignedAttendees.length,
        familyFollowUpsCount: familyFollowUps.length,
      },
    }
  },
})

export const getHotels = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Hotels are low-cardinality config; read the full set.
    return await collectAll(ctx.db.query("accommodationHotels"))
  },
})

export const getRoomTypesWithCount = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: small config tables
    const roomTypes = await ctx.db.query("accommodationRoomTypes").take(100)
    const rooms = await ctx.db.query("accommodationRooms").take(500)

    const roomsByType = rooms.reduce(
      (acc, room) => {
        if (!acc[room.roomTypeId]) acc[room.roomTypeId] = []
        acc[room.roomTypeId].push(room)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    return roomTypes.map((rt) => ({
      ...rt,
      roomCount: roomsByType[rt._id]?.length ?? 0,
    }))
  },
})

export const getRoomsWithDetails = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: config tables capped for inventory view
    const [rooms, hotels, roomTypes] = await Promise.all([
      ctx.db.query("accommodationRooms").take(500),
      collectAll(ctx.db.query("accommodationHotels")),
      ctx.db.query("accommodationRoomTypes").take(100),
    ])

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))
    const occupancyByRoom = new Map(
      await Promise.all(
        rooms.map(async (room) => [
          String(room._id),
          await loadRoomOccupancy(ctx, String(room._id), room.capacity, null),
        ] as const)
      )
    )

    return rooms.map((room) => {
      const occupancy = occupancyByRoom.get(String(room._id))!
      return {
        id: room._id,
        label: room.label,
        capacity: room.capacity,
        occupantCount: occupancy.occupantCount,
        occupiedBeds: occupancy.occupiedBeds,
        availableBeds: occupancy.availableBeds,
        foreignOccupantCount: occupancy.foreignOccupantCount,
        occupancyIncomplete: occupancy.incomplete,
        notes: room.notes,
        hotel: hotelMap.get(room.hotelId as string),
        roomType: roomTypeMap.get(room.roomTypeId as string),
      }
    })
  },
})

export const listAccommodationInventory = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: config tables capped for inventory view
    const [canonicalEvents, hotels, roomTypes, rooms] =
      await Promise.all([
        ctx.db.query("events").take(200),
        collectAll(ctx.db.query("accommodationHotels")),
        ctx.db.query("accommodationRoomTypes").take(100),
        ctx.db.query("accommodationRooms").take(500),
      ])

    const eventHotels = await collectAll(ctx.db.query("accommodationEventHotels"))

    const eventHotelsByHotel = eventHotels.reduce(
      (acc, eh) => {
        if (!acc[eh.hotelId]) acc[eh.hotelId] = []
        acc[eh.hotelId].push(eh.eventId)
        return acc
      },
      {} as Record<string, string[]>
    )

    const roomsByHotel = rooms.reduce(
      (acc, room) => {
        if (!acc[room.hotelId]) acc[room.hotelId] = []
        acc[room.hotelId].push(room)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    const roomsByType = roomTypes.reduce(
      (acc, rt) => {
        acc[rt._id] = rooms.filter((r) => r.roomTypeId === rt._id)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))
    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))

    const occupancyByRoom = new Map(
      await Promise.all(
        rooms.map(async (room) => [
          String(room._id),
          await loadRoomOccupancy(ctx, String(room._id), room.capacity, null),
        ] as const)
      )
    )

    return {
      availableEvents: canonicalEvents
        .filter(
          (e) => e.accommodationEnabled && e.primarySourceKind === "internal"
        )
        .map((e) => ({
          eventId: e._id,
          slug: e.slug,
          name: e.title,
          startsAt: e.startsAt,
        })),
      hotels: hotels.map((hotel) => ({
        id: hotel._id,
        name: hotel.name,
        city: hotel.city ?? null,
        address: hotel.address ?? null,
        notes: hotel.notes ?? null,
        roomCount: roomsByHotel[hotel._id]?.length ?? 0,
        assignedEventIds: eventHotelsByHotel[hotel._id] ?? [],
      })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt._id,
        label: rt.label,
        defaultCapacity: rt.defaultCapacity,
        notes: rt.notes ?? null,
        roomCount: roomsByType[rt._id]?.length ?? 0,
      })),
      rooms: rooms.map((room) => {
        const hotel = hotelMap.get(room.hotelId as string)
        const roomType = roomTypeMap.get(room.roomTypeId as string)
        const occupancy = occupancyByRoom.get(String(room._id))!
        return {
          id: room._id,
          label: room.label,
          capacity: room.capacity,
          occupantCount: occupancy.occupantCount,
          occupiedBeds: occupancy.occupiedBeds,
          availableBeds: occupancy.availableBeds,
          foreignOccupantCount: occupancy.foreignOccupantCount,
          occupancyIncomplete: occupancy.incomplete,
          notes: room.notes,
          hotel: hotel ? { id: hotel._id, name: hotel.name } : undefined,
          roomType: roomType
            ? {
                id: roomType._id,
                label: roomType.label,
                defaultCapacity: roomType.defaultCapacity,
              }
            : undefined,
        }
      }),
      summary: {
        totalRooms: rooms.length,
        emptyRooms: rooms.filter(
          (r) => occupancyByRoom.get(String(r._id))?.occupantCount === 0
        )
          .length,
        availableRooms: rooms.filter(
          (r) => (occupancyByRoom.get(String(r._id))?.availableBeds ?? 0) > 0
        ).length,
        fullRooms: rooms.filter(
          (r) => (occupancyByRoom.get(String(r._id))?.availableBeds ?? 0) === 0
        ).length,
        totalOccupants: rooms.reduce(
          (sum, room) =>
            sum + (occupancyByRoom.get(String(room._id))?.occupantCount ?? 0),
          0
        ),
        occupiedBeds: rooms.reduce(
          (sum, room) =>
            sum + (occupancyByRoom.get(String(room._id))?.occupiedBeds ?? 0),
          0
        ),
        availableBeds: rooms.reduce(
          (sum, room) =>
            sum + (occupancyByRoom.get(String(room._id))?.availableBeds ?? 0),
          0
        ),
        occupancyIncomplete: rooms.some(
          (room) => occupancyByRoom.get(String(room._id))?.incomplete
        ),
        unassignedAttendees: 0,
      },
    }
  },
})

export const getHotelById = query({
  args: { hotelId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await getAccommodationHotelByStringId(ctx, args.hotelId)
  },
})

export const getRooms = query({
  args: {
    hotelId: v.optional(v.string()),
    roomTypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.hotelId) {
      // Bounded: one hotel has limited rooms
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId!))
        .take(200)
      return rooms
    }
    // Bounded: capped for inventory view
    return await ctx.db.query("accommodationRooms").take(500)
  },
})

export const getRoomById = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await getAccommodationRoomByStringId(ctx, args.roomId)
  },
})

export const getRoomTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: small config table
    return await ctx.db.query("accommodationRoomTypes").take(200)
  },
})

export const getRoomTypeById = query({
  args: { roomTypeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await getAccommodationRoomTypeByStringId(ctx, args.roomTypeId)
  },
})

export const createHotel = mutation({
  args: {
    name: v.string(),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationHotels", args)
    return id
  },
})

export const createRoom = mutation({
  args: {
    hotelId: v.string(),
    roomTypeId: v.string(),
    label: v.string(),
    capacity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationRooms", {
      ...args,
    })
    return id
  },
})

export const createRooms = mutation({
  args: {
    hotelId: v.string(),
    roomTypeId: v.string(),
    quantity: v.number(),
    labels: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    autoGenerateSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const hotel = await getAccommodationHotelByStringId(ctx, args.hotelId)
    const roomType = await getAccommodationRoomTypeByStringId(
      ctx,
      args.roomTypeId
    )

    if (!hotel) throw new Error("Hotel not found")
    if (!roomType) throw new Error("Room type not found")

    const hotelCode =
      hotel.name
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part: string) => part.slice(0, 2).toUpperCase())
        .join("")
        .slice(0, 6) || "HTL"

    const roomTypeCode =
      roomType.label
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part: string) => part.slice(0, 2).toUpperCase())
        .join("")
        .slice(0, 6) || "RM"

    const existingRooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId))
      .take(200)

    const existingCount = existingRooms.length
    const createdIds: string[] = []

    for (let index = 0; index < args.quantity; index += 1) {
      const label =
        args.labels?.[index] ??
        `${hotelCode}-${roomTypeCode}-${String(existingCount + index + 1).padStart(3, "0")}`

      const id = await ctx.db.insert("accommodationRooms", {
        hotelId: args.hotelId,
        roomTypeId: args.roomTypeId,
        label,
        capacity: roomType.defaultCapacity,
        notes: args.notes,
      })
      createdIds.push(id)
    }

    // Auto-generate slots for linked events
    const shouldGenerateSlots = args.autoGenerateSlots !== false
    if (shouldGenerateSlots) {
      // Find all events linked to this hotel
      const linkedEvents = await collectAll(
        ctx.db
          .query("accommodationEventHotels")
          .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
      )

      // Generate slots for each new room in each linked event
      for (const link of linkedEvents) {
        const eventId = link.eventId as Id<"events">

        for (const roomId of createdIds) {
          const room = await ctx.db.get(
            "accommodationRooms",
            roomId as Id<"accommodationRooms">
          )
          if (!room) continue

          const existingSlots = await ctx.db
            .query("accommodationSlots")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .filter((q) =>
              q.eq(q.field("roomId"), roomId as Id<"accommodationRooms">)
            )
            .take(100)

          const startIndex = existingSlots.length
          const capacity = room.capacity

          for (let i = 0; i < capacity; i++) {
            const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

            await ctx.db.insert("accommodationSlots", {
              eventId,
              hotelId: args.hotelId as Id<"accommodationHotels">,
              roomId: roomId as Id<"accommodationRooms">,
              slotLabel,
              genderPolicy: "mixed",
              isAssignable: true,
              updatedAt: Date.now(),
            })
          }
        }
      }
    }

    return createdIds
  },
})

export const createRoomType = mutation({
  args: {
    label: v.string(),
    defaultCapacity: v.number(),
    notes: v.optional(v.string()),
    count: v.optional(v.number()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("accommodationCategories")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const label = args.label.trim()
    if (!label) {
      throw new Error("Room type label is required")
    }
    if (args.count !== undefined && !isNonNegativeInteger(args.count)) {
      throw new Error("count must be a non-negative integer")
    }
    if (
      !Number.isInteger(args.defaultCapacity) ||
      args.defaultCapacity < 1
    ) {
      throw new Error("defaultCapacity must be a positive integer")
    }
    if (args.categoryId !== undefined) {
      const category = await ctx.db.get(
        "accommodationCategories",
        args.categoryId
      )
      if (!category) {
        throw new Error("Category not found")
      }
    }
    const id = await ctx.db.insert("accommodationRoomTypes", {
      label,
      defaultCapacity: args.defaultCapacity,
      notes: normalizeOptionalString(args.notes) ?? undefined,
      count: args.count,
      description: normalizeOptionalString(args.description) ?? undefined,
      categoryId: args.categoryId,
    })
    return id
  },
})

type FamilyRoomAction = "assign" | "move"

type ValidatedFamilyRoomOutcome = {
  unit: FamilyPlacementUnit
  eventId: Id<"events">
  room: Doc<"accommodationRooms">
  occupancy: RoomOccupancy
  incomingBedDelta: number
  affectedAttendees: Doc<"orderAttendees">[]
}

type FamilyAssignmentResult = {
  ok: true
  parentAttendeeId: string
  roomId: string
  targetRoomId: string
  eligibleChildIds: string[]
  eligibleChildCount: number
  affectedAttendeeCount: number
  action: FamilyRoomAction | "unassign"
}

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function assertOrderEventOwnership(
  ctx: MutationCtx,
  eventId: string,
  attendees: Doc<"orderAttendees">[]
): Promise<Map<string, Doc<"orders">>> {
  const event = await ctx.db.get(
    "events",
    normalizeDocId(ctx, "events", eventId, "Event not found")
  )
  if (!event) throw new Error("Event not found")

  const orders = await Promise.all(
    attendees.map((attendee) => ctx.db.get("orders", attendee.orderId))
  )
  const orderById = new Map<string, Doc<"orders">>()
  for (const [index, order] of orders.entries()) {
    if (!order || String(order.eventId) !== eventId) {
      throw new Error("Attendee does not belong to this event")
    }
    orderById.set(String(attendees[index]!.orderId), order)
  }
  return orderById
}

async function assertTargetRoomEventScope(
  ctx: MutationCtx,
  eventId: Id<"events">,
  room: Doc<"accommodationRooms">
): Promise<void> {
  const eventHotelLink = await ctx.db
    .query("accommodationEventHotels")
    .withIndex("eventId_hotelId", (q) =>
      q.eq("eventId", eventId).eq("hotelId", room.hotelId as string)
    )
    .first()
  if (!eventHotelLink) {
    throw new Error("Room hotel is not enabled for this event")
  }
}

function throwFamilyResolutionError(unit: FamilyPlacementUnit): never {
  if (unit.familyState === "needs-family-link") {
    throw new Error("Needs family link")
  }
  throw new Error("Family placement data is inconsistent")
}

/**
 * Write-path `onIncomplete` callback: a family group whose membership read
 * overflowed `FAMILY_GROUP_MEMBER_LIMIT` must not be partially placed or
 * unassigned, so the mutation aborts here before its first attendee patch.
 */
function failOnIncompleteFamilyData(): never {
  throw new Error(FAMILY_DATA_INCOMPLETE_MESSAGE)
}

/**
 * Read-only validation for a complete parent-led target. All relationship,
 * live bed, physical occupancy, inventory, and capacity checks happen before
 * commitFamilyRoomOutcome performs its first attendee patch.
 */
async function validateFamilyRoomOutcome(
  ctx: MutationCtx,
  input: {
    attendeeId: string
    roomId: string
    eventId: string
    rejectAlreadyAssigned?: boolean
  }
): Promise<ValidatedFamilyRoomOutcome> {
  const eventId = normalizeDocId(ctx, "events", input.eventId, "Event not found")
  const attendeeId = normalizeDocId(
    ctx,
    "orderAttendees",
    input.attendeeId,
    "Attendee not found"
  )
  const roomId = normalizeDocId(
    ctx,
    "accommodationRooms",
    input.roomId,
    "Room not found"
  )
  const attendee = await ctx.db.get("orderAttendees", attendeeId)
  const room = await ctx.db.get("accommodationRooms", roomId)
  if (!attendee) throw new Error("Attendee not found")
  if (!room) throw new Error("Room not found")

  const familyUnit = await resolveFamilyPlacementUnit(
    ctx,
    String(eventId),
    attendee,
    undefined,
    failOnIncompleteFamilyData
  )
  if (!familyUnit.valid) throwFamilyResolutionError(familyUnit)

  // Family links are currently best-effort. Keep the atomic parent-led path
  // when possible, but let a child fall back to an individual placement.
  const unit =
    familyUnit.familyRole === "child"
      ? emptyFamilyUnit({
          valid: true,
          familyRole: "solo",
          familyState: "unresolved",
          requirement:
            familyUnit.requirements.get(String(attendee._id)) ??
            (await resolveAttendeeBedRequirement(ctx, attendee._id)),
          attendee,
        })
      : familyUnit

  if (!unit.parent) {
    throw new Error("Family placement data is inconsistent")
  }

  const affectedAttendees = [unit.parent, ...unit.eligibleChildren.map((child) => child.attendee)]
  const requirements = new Map(unit.requirements)
  const missingRequirements = await Promise.all(
    affectedAttendees.map(async (member) => {
      const existing = requirements.get(String(member._id))
      return [
        String(member._id),
        existing ?? (await resolveAttendeeBedRequirement(ctx, member._id)),
      ] as const
    })
  )
  for (const [memberId, requirement] of missingRequirements) {
    requirements.set(memberId, requirement)
    if (!requirement.placementEligible) {
      throw new Error("Attendee is not eligible for accommodation placement")
    }
  }
  await assertOrderEventOwnership(ctx, String(eventId), affectedAttendees)
  await assertTargetRoomEventScope(ctx, eventId, room)

  if (
    input.rejectAlreadyAssigned &&
    unit.parent.assignedRoomId === String(room._id) &&
    unit.familyState === "placed"
  ) {
    throw new Error("Attendee already assigned to this room")
  }

  const occupancy = await loadRoomOccupancy(
    ctx,
    String(room._id),
    room.capacity,
    String(eventId)
  )
  const incomingBedDelta = affectedAttendees.reduce((sum, member) => {
    const alreadyAssigned = member.assignedRoomId === String(room._id)
    const requirement = requirements.get(String(member._id))
    return sum + (alreadyAssigned || requirement?.requiresBed === false ? 0 : 1)
  }, 0)

  if (occupancy.incomplete && incomingBedDelta > 0) {
    throw new Error(
      "Occupancy data is incomplete; verify before assigning a bed-consuming family"
    )
  }
  if (occupancy.occupiedBeds + incomingBedDelta > room.capacity) {
    throw new Error("Room is already full")
  }
  const parentOrder = await ctx.db.get("orders", unit.parent.orderId)
  const affectedIds = affectedAttendees.map((member) => String(member._id))
  const targetHasRemainingOccupants = await hasPhysicalRoomOccupants(
    ctx,
    String(room._id),
    new Set(affectedIds)
  )
  await assertEventRoomInventoryAvailable(
    ctx,
    parentOrder,
    room,
    targetHasRemainingOccupants,
    affectedIds
  )

  return {
    unit,
    eventId,
    room,
    occupancy,
    incomingBedDelta,
    affectedAttendees,
  }
}

async function commitFamilyRoomOutcome(
  ctx: MutationCtx,
  outcome: ValidatedFamilyRoomOutcome,
  action: FamilyRoomAction
): Promise<FamilyAssignmentResult> {
  const orderIds = new Set(
    outcome.affectedAttendees.map((attendee) => String(attendee.orderId))
  )
  for (const orderId of orderIds) {
    await persistOrderAccommodationConfirmation(
      ctx,
      orderId as Id<"orders">
    )
  }

  for (const attendee of outcome.affectedAttendees) {
    await ctx.db.patch("orderAttendees", attendee._id, {
      assignedRoomId: String(outcome.room._id),
    })
  }

  const eligibleChildIds = outcome.unit.eligibleChildren.map((child) =>
    String(child.attendee._id)
  )
  return {
    ok: true,
    parentAttendeeId: String(outcome.unit.parent!._id),
    roomId: String(outcome.room._id),
    targetRoomId: String(outcome.room._id),
    eligibleChildIds,
    eligibleChildCount: eligibleChildIds.length,
    affectedAttendeeCount: 1 + eligibleChildIds.length,
    action,
  }
}

async function validateFamilyUnassignment(
  ctx: MutationCtx,
  input: { attendeeId: string; eventId: string }
): Promise<{
  unit: FamilyPlacementUnit
  affectedAttendees: Doc<"orderAttendees">[]
  assignedAttendees: Doc<"orderAttendees">[]
}> {
  const eventId = normalizeDocId(ctx, "events", input.eventId, "Event not found")
  const attendeeId = normalizeDocId(
    ctx,
    "orderAttendees",
    input.attendeeId,
    "Attendee not found or not assigned to any room"
  )
  const attendee = await ctx.db.get("orderAttendees", attendeeId)
  if (!attendee) {
    throw new Error("Attendee not found or not assigned to any room")
  }
  const familyUnit = await resolveFamilyPlacementUnit(
    ctx,
    String(eventId),
    attendee,
    undefined,
    failOnIncompleteFamilyData
  )
  if (!familyUnit.valid) throwFamilyResolutionError(familyUnit)

  const unit =
    familyUnit.familyRole === "child"
      ? emptyFamilyUnit({
          valid: true,
          familyRole: "solo",
          familyState: "unresolved",
          requirement:
            familyUnit.requirements.get(String(attendee._id)) ??
            (await resolveAttendeeBedRequirement(ctx, attendee._id)),
          attendee,
        })
      : familyUnit

  if (!unit.parent) throw new Error("Family placement data is inconsistent")
  const affectedAttendees = [unit.parent, ...unit.eligibleChildren.map((child) => child.attendee)]
  await assertOrderEventOwnership(ctx, String(eventId), affectedAttendees)
  const assignedAttendees = affectedAttendees.filter(
    (member) => member.assignedRoomId
  )
  if (assignedAttendees.length === 0) {
    throw new Error("Attendee not found or not assigned to any room")
  }
  return { unit, affectedAttendees, assignedAttendees }
}

async function commitFamilyUnassignment(
  ctx: MutationCtx,
  outcome: Awaited<ReturnType<typeof validateFamilyUnassignment>>
): Promise<FamilyAssignmentResult> {
  for (const attendee of outcome.affectedAttendees) {
    await ctx.db.patch("orderAttendees", attendee._id, {
      assignedRoomId: undefined,
    })
  }
  const eligibleChildIds = outcome.unit.eligibleChildren.map((child) =>
    String(child.attendee._id)
  )
  const roomId = outcome.assignedAttendees[0]?.assignedRoomId ?? ""
  return {
    ok: true,
    parentAttendeeId: String(outcome.unit.parent!._id),
    roomId,
    targetRoomId: roomId,
    eligibleChildIds,
    eligibleChildCount: eligibleChildIds.length,
    affectedAttendeeCount: 1 + eligibleChildIds.length,
    action: "unassign",
  }
}

export const assignRoomToAttendee = mutation({
  args: {
    attendeeId: v.string(),
    roomId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const outcome = await validateFamilyRoomOutcome(ctx, {
      ...args,
      rejectAlreadyAssigned: false,
    })
    const result = await commitFamilyRoomOutcome(ctx, outcome, "assign")
    return outcome.unit.familyRole === "solo" ? args.attendeeId : result
  },
})

export const assignAttendeeToRoom = mutation({
  args: {
    attendeeId: v.string(),
    roomId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const outcome = await validateFamilyRoomOutcome(ctx, {
      ...args,
      rejectAlreadyAssigned: true,
    })
    const result = await commitFamilyRoomOutcome(ctx, outcome, "move")
    return outcome.unit.familyRole === "solo" ? { ok: true } : result
  },
})

export const unassignRoomFromAttendee = mutation({
  args: {
    attendeeId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const outcome = await validateFamilyUnassignment(ctx, args)
    const result = await commitFamilyUnassignment(ctx, outcome)
    return outcome.unit.familyRole === "solo" ? { ok: true } : result
  },
})

export const unassignAttendeeFromRoom = mutation({
  args: {
    attendeeId: v.string(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const outcome = await validateFamilyUnassignment(ctx, args)
    const result = await commitFamilyUnassignment(ctx, outcome)
    return outcome.unit.familyRole === "solo" ? { ok: true } : result
  },
})

export const getEventHotels = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const eventHotels = await collectAll(
      ctx.db
        .query("accommodationEventHotels")
        .withIndex("eventId_hotelId", (q) => q.eq("eventId", args.eventId))
    )

    const hotels = await Promise.all(
      eventHotels.map((eh) => getAccommodationHotelByStringId(ctx, eh.hotelId))
    )

    return hotels.filter(Boolean)
  },
})

/**
 * Link a hotel to an event with optional automatic slot generation.
 * Supports both canonical eventId and eventProviderEventId for flexibility.
 */
export const linkHotelToEvent = mutation({
  args: {
    eventId: v.optional(v.string()),
    eventProviderEventId: v.optional(v.string()),
    hotelId: v.id("accommodationHotels"),
    autoGenerateSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Resolve eventId from either direct ID or provider event ID
    let canonicalEventId: string

    if (args.eventId) {
      canonicalEventId = args.eventId
    } else if (args.eventProviderEventId) {
      // Look up canonical event via eventSources
      const eventSource = await ctx.db
        .query("eventSources")
        .withIndex("by_provider_and_externalEventId", (q) =>
          q
            .eq("provider", "tickettailor")
            .eq("externalEventId", args.eventProviderEventId as string)
        )
        .first()

      if (eventSource) {
        canonicalEventId = eventSource.eventId as string
      } else {
        // Fallback: try to find by direct ID match (slug)
        const event = await ctx.db
          .query("events")
          .withIndex("by_slug", (q) =>
            q.eq("slug", args.eventProviderEventId as string)
          )
          .first()

        if (!event) {
          throw new Error("Event not found")
        }
        canonicalEventId = event._id as string
      }
    } else {
      throw new Error("Either eventId or eventProviderEventId must be provided")
    }

    // Verify event exists
    const event = await ctx.db.get("events", canonicalEventId as Id<"events">)
    if (!event) {
      throw new Error("Event not found")
    }

    // Verify hotel exists
    const hotel = await ctx.db.get("accommodationHotels", args.hotelId)
    if (!hotel) {
      throw new Error("Hotel not found")
    }

    // Check for existing link
    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId as string)
      )
      .first()

    if (existing) {
      return {
        linkId: existing._id,
        eventId: canonicalEventId,
        hotelId: args.hotelId,
        slotsGenerated: 0,
        alreadyLinked: true,
      }
    }

    // Create the link
    const linkId = await ctx.db.insert("accommodationEventHotels", {
      eventId: canonicalEventId,
      hotelId: args.hotelId as string,
    })

    // Auto-generate slots if requested (default: true)
    let slotsGenerated = 0
    const shouldGenerateSlots = args.autoGenerateSlots !== false

    if (shouldGenerateSlots) {
      // Get all rooms for this hotel
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) =>
          q.eq("hotelId", args.hotelId as string)
        )
        .take(100)

      // Generate slots for each room
      for (const room of rooms) {
        const existingSlots = await ctx.db
          .query("accommodationSlots")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", canonicalEventId as Id<"events">)
          )
          .filter((q) => q.eq(q.field("roomId"), room._id))
          .take(100)

        const startIndex = existingSlots.length
        const capacity = room.capacity

        for (let i = 0; i < capacity; i++) {
          const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

          await ctx.db.insert("accommodationSlots", {
            eventId: canonicalEventId as Id<"events">,
            hotelId: args.hotelId,
            roomId: room._id,
            slotLabel,
            genderPolicy: "mixed", // Default to mixed, can be changed later
            isAssignable: true,
            updatedAt: Date.now(),
          })
          slotsGenerated++
        }
      }
    }

    return {
      linkId,
      eventId: canonicalEventId,
      hotelId: args.hotelId,
      slotsGenerated,
      alreadyLinked: false,
    }
  },
})

export const unlinkHotelFromEvent = mutation({
  args: {
    eventId: v.string(),
    hotelId: v.id("accommodationHotels"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const eventId = normalizeDocId(
      ctx,
      "events",
      args.eventId,
      "Event not found"
    )
    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", eventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) =>
          q.eq("hotelId", args.hotelId as string)
        )
        .take(100)

      for (const room of rooms) {
        const assignedAttendees = await ctx.db
          .query("orderAttendees")
          .withIndex("by_assignedRoomId", (q) =>
            q.eq("assignedRoomId", String(room._id))
          )
          .take(1)

        if (assignedAttendees.length > 0) {
          throw new Error(
            "Cannot unlink a hotel while attendees are assigned to its rooms"
          )
        }
      }

      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})

export const updateHotel = mutation({
  args: {
    hotelId: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { hotelId, ...data } = args
    const normalizedHotelId = normalizeDocId(
      ctx,
      "accommodationHotels",
      hotelId,
      "Hotel not found"
    )
    await ctx.db.patch("accommodationHotels", normalizedHotelId, data)
    return await ctx.db.get("accommodationHotels", normalizedHotelId)
  },
})

export const deleteHotel = mutation({
  args: { hotelId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const hotelId = normalizeDocId(
      ctx,
      "accommodationHotels",
      args.hotelId,
      "Hotel not found"
    )

    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId))
      .take(200)

    for (const room of rooms) {
      const assignedAttendee = await ctx.db
        .query("orderAttendees")
        .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", room._id))
        .first()

      if (assignedAttendee) {
        throw new Error("Cannot delete hotel with assigned attendees")
      }
    }

    const eventHotels = await collectAll(
      ctx.db
        .query("accommodationEventHotels")
        .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
    )

    for (const room of rooms) {
      await ctx.db.delete("accommodationRooms", room._id)
    }

    for (const eventHotel of eventHotels) {
      await ctx.db.delete("accommodationEventHotels", eventHotel._id)
    }

    await ctx.db.delete("accommodationHotels", hotelId)
    return { ok: true }
  },
})

export const updateRoomLabel = mutation({
  args: {
    roomId: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    await ctx.db.patch("accommodationRooms", roomId, {
      label: args.label,
    })
    return await ctx.db.get("accommodationRooms", roomId)
  },
})

export const deleteRoom = mutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (attendees.length > 0) {
      throw new Error("Cannot delete room with assigned attendees")
    }

    await ctx.db.delete("accommodationRooms", roomId)
    return { ok: true }
  },
})

export const updateRoomType = mutation({
  args: {
    roomTypeId: v.string(),
    label: v.optional(v.string()),
    defaultCapacity: v.optional(v.number()),
    notes: v.optional(v.string()),
    count: v.optional(v.number()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("accommodationCategories")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { roomTypeId, count, description, categoryId, ...rest } = args
    const normalizedRoomTypeId = normalizeDocId(
      ctx,
      "accommodationRoomTypes",
      roomTypeId,
      "Room type not found"
    )
    if (count !== undefined && !isNonNegativeInteger(count)) {
      throw new Error("count must be a non-negative integer")
    }
    if (
      args.defaultCapacity !== undefined &&
      (!Number.isInteger(args.defaultCapacity) || args.defaultCapacity < 1)
    ) {
      throw new Error("defaultCapacity must be a positive integer")
    }
    if (categoryId !== undefined) {
      const category = await ctx.db.get("accommodationCategories", categoryId)
      if (!category) {
        throw new Error("Category not found")
      }
    }
    const data: Partial<Doc<"accommodationRoomTypes">> = { ...rest }
    if (count !== undefined) {
      data.count = count
    }
    if (description !== undefined) {
      data.description = normalizeOptionalString(description) ?? undefined
    }
    if (categoryId !== undefined) {
      data.categoryId = categoryId
    }
    await ctx.db.patch("accommodationRoomTypes", normalizedRoomTypeId, data)
    return await ctx.db.get("accommodationRoomTypes", normalizedRoomTypeId)
  },
})

export const deleteRoomType = mutation({
  args: { roomTypeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one room type has limited rooms
    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("roomTypeId", (q) => q.eq("roomTypeId", args.roomTypeId))
      .take(200)

    if (rooms.length > 0) {
      throw new Error("Cannot delete room type with existing rooms")
    }

    const roomTypeId = normalizeDocId(
      ctx,
      "accommodationRoomTypes",
      args.roomTypeId,
      "Room type not found"
    )
    await ctx.db.delete("accommodationRoomTypes", roomTypeId)
    return { ok: true }
  },
})

export const getEventByProviderId = query({
  args: { providerEventId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .first()
    return event
  },
})

/**
 * @deprecated Use linkHotelToEvent instead. This mutation will be removed in a future release.
 * The linkHotelToEvent mutation now supports eventProviderEventId and includes auto-slot generation.
 */
export const attachHotelToEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    console.warn(
      "[DEPRECATED] attachHotelToEventByProviderId is deprecated. Use linkHotelToEvent with autoGenerateSlots option."
    )
    await requireIdentity(ctx)

    // Look up canonical event via eventSources
    const eventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "tickettailor")
          .eq("externalEventId", args.eventProviderEventId)
      )
      .first()

    let canonicalEventId: string

    if (eventSource) {
      canonicalEventId = eventSource.eventId as string
    } else {
      // Fallback: try to find by direct ID match
      const event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.eventProviderEventId))
        .first()

      if (!event) {
        throw new Error("Event not found")
      }
      canonicalEventId = event._id as string
    }

    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert("accommodationEventHotels", {
      eventId: canonicalEventId,
      hotelId: args.hotelId,
    })
  },
})

export const detachHotelFromEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Look up canonical event via eventSources
    const eventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "tickettailor")
          .eq("externalEventId", args.eventProviderEventId)
      )
      .first()

    let canonicalEventId: string

    if (eventSource) {
      canonicalEventId = eventSource.eventId as string
    } else {
      // Fallback: try to find by direct ID match
      const event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.eventProviderEventId))
        .first()

      if (!event) {
        // No event found, nothing to detach
        return { ok: true }
      }
      canonicalEventId = event._id as string
    }

    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})

export const generateSlotsForRoom = mutation({
  args: {
    eventId: v.id("events"),
    roomId: v.id("accommodationRooms"),
    genderPolicy: v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("mixed")
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const room = await ctx.db.get("accommodationRooms", args.roomId)
    if (!room) {
      throw new Error("Room not found")
    }

    const hotel = await ctx.db.get(
      "accommodationHotels",
      room.hotelId as Id<"accommodationHotels">
    )
    if (!hotel) {
      throw new Error("Hotel not found")
    }

    const existingSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("roomId"), args.roomId))
      .take(100)

    const startIndex = existingSlots.length
    const capacity = room.capacity
    const createdIds: Id<"accommodationSlots">[] = []

    for (let i = 0; i < capacity; i++) {
      const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

      const id = await ctx.db.insert("accommodationSlots", {
        eventId: args.eventId,
        hotelId: room.hotelId as Id<"accommodationHotels">,
        roomId: args.roomId,
        slotLabel,
        genderPolicy: args.genderPolicy,
        isAssignable: true,
        updatedAt: Date.now(),
      })
      createdIds.push(id)
    }

    return {
      createdCount: createdIds.length,
      slotIds: createdIds,
      roomLabel: room.label,
      capacity,
    }
  },
})

export const getSlotsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const slots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const roomIds = [...new Set(slots.map((s) => s.roomId))]
    const hotelIds = [...new Set(slots.map((s) => s.hotelId))]

    const rooms = await Promise.all(
      roomIds.map((id) => ctx.db.get("accommodationRooms", id))
    )
    const hotels = await Promise.all(
      hotelIds.map((id) => ctx.db.get("accommodationHotels", id))
    )

    const roomById = new Map(rooms.filter(Boolean).map((r) => [r!._id, r!]))
    const hotelById = new Map(hotels.filter(Boolean).map((h) => [h!._id, h!]))

    return slots.map((slot) => ({
      id: slot._id,
      slotLabel: slot.slotLabel,
      genderPolicy: slot.genderPolicy,
      isAssignable: slot.isAssignable,
      ineligibilityReason: slot.ineligibilityReason,
      room: roomById.get(slot.roomId)
        ? {
            id: roomById.get(slot.roomId)!._id,
            label: roomById.get(slot.roomId)!.label,
            capacity: roomById.get(slot.roomId)!.capacity,
          }
        : null,
      hotel: hotelById.get(slot.hotelId)
        ? {
            id: hotelById.get(slot.hotelId)!._id,
            name: hotelById.get(slot.hotelId)!.name,
          }
        : null,
    }))
  },
})

export const getAccommodationSummaryForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const eventHotels = await collectAll(
      ctx.db
        .query("accommodationEventHotels")
        .withIndex("eventId_hotelId", (q) =>
          q.eq("eventId", args.eventId as unknown as string)
        )
    )

    const slots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const assignableSlots = slots.filter((s) => s.isAssignable)

    return {
      eventSlug: event.slug,
      eventTitle: event.title,
      hotelsLinked: eventHotels.length,
      totalSlots: slots.length,
      assignableSlots: assignableSlots.length,
      submissionsCount: orders.length,
    }
  },
})

/**
 * Confirm a pending buyer assignment and assign attendee to a room.
 * Allows admin to modify slot assignment if needed.
 * Returns alternative room suggestions if requested slot is full.
 */
export const confirmBuyerAssignment = mutation({
  args: {
    assignmentId: v.id("orderAssignments"),
    slotId: v.optional(v.id("accommodationSlots")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    // Get the pending assignment
    const assignment = await ctx.db.get("orderAssignments", args.assignmentId)
    if (!assignment) {
      throw new Error("Assignment not found")
    }

    const assignmentStatus = assignment.status ?? "pending"
    if (assignmentStatus !== "pending") {
      throw new Error("Assignment is not pending")
    }
    if (assignment.assignmentIntent !== "assign") {
      throw new Error("Assignment intent is not assignable")
    }

    // Get the order for context
    const order = await ctx.db.get("orders", assignment.orderId)
    if (!order) {
      throw new Error("Order not found")
    }

    const attendee = await ctx.db.get("orderAttendees", assignment.attendeeId)
    if (!attendee) {
      throw new Error("Attendee not found")
    }
    if (attendee.orderId !== assignment.orderId) {
      throw new Error("Assignment attendee does not belong to the order")
    }
    if (!order.eventId) {
      throw new Error("Order is not linked to an event")
    }

    // Determine which slot to use
    const targetSlotId = args.slotId || assignment.slotId
    if (!targetSlotId) {
      throw new Error("No slot specified for assignment")
    }

    // Get the target slot
    const slot = await ctx.db.get("accommodationSlots", targetSlotId)
    if (!slot) {
      throw new Error("Slot not found")
    }
    if (!slot.isAssignable) {
      throw new Error("Slot is not assignable")
    }
    if (slot.eventId !== order.eventId) {
      throw new Error("Slot does not belong to the order's event")
    }

    // Get the room to check capacity
    const room = await ctx.db.get("accommodationRooms", slot.roomId)
    if (!room) {
      throw new Error("Room not found")
    }
    if (slot.hotelId !== room.hotelId) {
      throw new Error("Slot does not belong to its room's hotel")
    }

    let outcome: ValidatedFamilyRoomOutcome
    try {
      outcome = await validateFamilyRoomOutcome(ctx, {
        attendeeId: String(assignment.attendeeId),
        roomId: String(room._id),
        eventId: String(order.eventId),
        rejectAlreadyAssigned: false,
      })
    } catch (error: unknown) {
      const reason = mutationErrorMessage(error)
      const roomFull = reason.includes("Room is already full")
      const occupancyIncomplete = reason.includes(OCCUPANCY_INCOMPLETE_REASON)
      // The event inventory/resource scan throws its own message (including from
      // an unrelated candidate room's provider read), so it must never be
      // reported as the requested room's occupancy failure.
      const inventoryIncomplete = reason.includes(INVENTORY_INCOMPLETE_REASON)
      if (!roomFull && !occupancyIncomplete && !inventoryIncomplete) {
        throw error
      }

      // Room is full (or a bounded read is incomplete) - find alternative rooms
      // with capacity. An incomplete read is a fail-safe, not a full room, so it
      // is reported with its own code/message rather than a misleading "full
      // capacity".
      const allSlots = await ctx.db
        .query("accommodationSlots")
        .withIndex("by_eventId", (q) => q.eq("eventId", order.eventId!))
        .take(100)

      // Get rooms with available space
      const alternatives: Array<{
        slotId: string
        roomId: string
        roomLabel: string
        roomType: string
        capacity: number
        occupantCount: number
        availableSpots: number
      }> = []

      for (const altSlot of allSlots) {
        if (alternatives.length >= 10) break
        if (!altSlot.isAssignable) continue

        const altRoom = await ctx.db.get("accommodationRooms", altSlot.roomId)
        if (!altRoom) continue

        try {
          const alternativeOutcome = await validateFamilyRoomOutcome(ctx, {
            attendeeId: String(assignment.attendeeId),
            roomId: String(altRoom._id),
            eventId: String(order.eventId),
            rejectAlreadyAssigned: false,
          })
          const roomType = await ctx.db.get(
            "accommodationRoomTypes",
            altRoom.roomTypeId as Id<"accommodationRoomTypes">
          )
          alternatives.push({
            slotId: altSlot._id,
            roomId: altSlot.roomId,
            roomLabel: altRoom.label,
            roomType: roomType?.label || "Unknown",
            capacity: altRoom.capacity,
            occupantCount: alternativeOutcome.occupancy.occupantCount,
            availableSpots: alternativeOutcome.occupancy.availableBeds,
          })
        } catch {
          // Alternatives are suggestions only. Any invalid, cross-event,
          // unlinked, full, or incomplete outcome is omitted without writing.
        }
      }

      return {
        success: false,
        error: occupancyIncomplete
          ? "OCCUPANCY_INCOMPLETE"
          : inventoryIncomplete
            ? "INVENTORY_INCOMPLETE"
            : "ROOM_FULL",
        message: occupancyIncomplete
          ? "Occupancy data for the requested room is incomplete. Verify room usage before assigning; this is a fail-safe, not a full room."
          : inventoryIncomplete
            ? "Accommodation inventory for this event is incomplete. Verify room usage before assigning; this is a fail-safe, not a full room."
            : "The requested room is at full capacity",
        alternatives,
      }
    }

    const familyResult = await commitFamilyRoomOutcome(ctx, outcome, "assign")

    // Update assignment status
    await ctx.db.patch(args.assignmentId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedBy: identity.tokenIdentifier,
      slotId: targetSlotId,
    })

    return {
      success: true,
      assignmentId: args.assignmentId,
      attendeeId: assignment.attendeeId,
      slotId: targetSlotId,
      roomId: familyResult.roomId,
      parentAttendeeId: familyResult.parentAttendeeId,
      eligibleChildIds: familyResult.eligibleChildIds,
      eligibleChildCount: familyResult.eligibleChildCount,
      affectedAttendeeCount: familyResult.affectedAttendeeCount,
    }
  },
})

/**
 * Remove (decline/reject) a pending buyer assignment without assigning.
 * Updates status to 'declined' and records who declined it.
 */
export const removeBuyerAssignment = mutation({
  args: {
    assignmentId: v.id("orderAssignments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get the pending assignment
    const assignment = await ctx.db.get("orderAssignments", args.assignmentId)
    if (!assignment) {
      throw new Error("Assignment not found")
    }

    const assignmentStatus = assignment.status ?? "pending"
    if (assignmentStatus !== "pending") {
      throw new Error("Assignment is not pending")
    }

    // Get current user identity for confirmedBy (we use confirmedBy to track who processed it)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    // Update assignment status to declined
    await ctx.db.patch(args.assignmentId, {
      status: "declined",
      confirmedAt: Date.now(),
      confirmedBy: identity.subject,
    })

    return {
      success: true,
      assignmentId: args.assignmentId,
      attendeeId: assignment.attendeeId,
    }
  },
})

// ---------------------------------------------------------------------------
// Phase 39: Accommodation catalog & event configuration
//
// Reusable catalog tables (categories, options, age bands) and event-scoped
// configuration (stay config, rates, options, resources, age pricing) with
// authenticated, bounded, validated reads and mutations. Purely additive:
// existing hotels/rooms/room-type/assignment exports above are preserved.
// ---------------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000
export const EVENT_OPTION_DEFAULT_PRICE_MINOR = 1000 // €10

/**
 * The pending-order LIST returned to the admin UI is bounded for display
 * while `pendingOrderCount` stays exact (see getEventAccommodationConfig).
 */
export const PENDING_ORDERS_DISPLAY_LIMIT = 50

export const categoryCodeValidator = v.union(
  v.literal("standard"),
  v.literal("superior"),
  v.literal("family")
)
export const optionCodeValidator = v.string()
export const occupancyValidator = v.union(
  v.literal("single"),
  v.literal("shared"),
  v.literal("family")
)
export const resourceKindValidator = v.union(
  v.literal("room"),
  v.literal("cot")
)
export const optionKindValidator = v.union(
  v.literal("addon"),
  v.literal("upgrade"),
  v.literal("eligibility")
)
export const optionUnitValidator = v.union(
  v.literal("per_night"),
  v.literal("per_person")
)

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * Minor-unit money must always be a whole number of the smallest currency
 * unit. Fractional values such as 1000.5 are not valid minor units and could
 * produce non-currency amounts in downstream billing, so they are rejected.
 */
function isNonNegativePrice(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * Derives the night count for a stay window from its timestamps. The night
 * count is never hardcoded or client-supplied: it is always computed from the
 * configured check-in/check-out timestamps.
 */
export function deriveNightCount(checkInAt: number, checkOutAt: number): number {
  if (!Number.isFinite(checkInAt) || !Number.isFinite(checkOutAt)) {
    throw new Error("Invalid stay window: timestamps must be finite numbers")
  }
  if (checkOutAt <= checkInAt) {
    throw new Error("Invalid stay window: check-out must be after check-in")
  }
  return Math.max(1, Math.round((checkOutAt - checkInAt) / DAY_MS))
}

/**
 * The locked initial stay window for a newly initialized event config: one
 * night before the event (check-in the day before the event starts, check-out
 * on the event start day), so the initial derived nightCount is 1.
 */
export function deriveInitialStayWindow(eventStartsAt: number): {
  baseCheckInAt: number
  baseCheckOutAt: number
} {
  if (!Number.isFinite(eventStartsAt)) {
    throw new Error("Invalid event start time")
  }
  return {
    baseCheckInAt: eventStartsAt - DAY_MS,
    baseCheckOutAt: eventStartsAt,
  }
}

/**
 * Omitted upgrade/cot per-night prices default to €10 (1000 minor units).
 * Explicit €0 and any other supplied price are preserved.
 */
export function resolveEventOptionPriceMinor(
  priceMinor: number | null | undefined
): number {
  return priceMinor ?? EVENT_OPTION_DEFAULT_PRICE_MINOR
}

/**
 * Sellable beds for a room resource = physical count × room type
 * defaultCapacity. Room resources must reference a linked room type with a
 * positive-integer default capacity — there is deliberately no capacity-1
 * fallback for a room, because silently misrepresenting a multi-bed room
 * corrupts event availability. Cot resources count one bed per physical item.
 */
export function deriveResourceSellableBeds(input: {
  count: number
  kind: "room" | "cot"
  roomTypeDefaultCapacity?: number | null
}): number {
  if (input.kind === "room") {
    const capacity = input.roomTypeDefaultCapacity
    if (capacity === null || capacity === undefined) {
      throw new Error(
        "Room resources require a linked room type to derive sellable beds"
      )
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(
        "Room type defaultCapacity must be a positive integer to derive sellable beds"
      )
    }
    return input.count * capacity
  }
  // Cot resources count one bed per physical item.
  return input.count
}

/**
 * Active categories are derived solely from eventAccommodationRates rows:
 * a category is active for an event when at least one rate row exists for
 * that (eventId, categoryId). No separate active-categories list/flag exists.
 */
export function deriveActiveCategoryIds(
  rateRows: ReadonlyArray<{ categoryId: string }>
): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const row of rateRows) {
    if (!seen.has(row.categoryId)) {
      seen.add(row.categoryId)
      ids.push(row.categoryId)
    }
  }
  return ids
}

/**
 * Absent `ticketTypes.accommodationIncluded` is treated as false; only an
 * explicit true marks a ticket as covering the base stay nights.
 */
export function isAccommodationIncluded(ticket: {
  accommodationIncluded?: boolean | null
}): boolean {
  return ticket.accommodationIncluded === true
}

/**
 * Age-band bounds must be non-negative integers with maxAge (when defined)
 * greater than or equal to minAge. 18+ bands may omit maxAge.
 */
export function isValidAgeBandRange(
  minAge: number,
  maxAge: number | null | undefined
): boolean {
  if (!Number.isInteger(minAge) || minAge < 0) {
    return false
  }
  if (maxAge === null || maxAge === undefined) {
    return true
  }
  return Number.isInteger(maxAge) && maxAge >= minAge
}

function sortBySortOrder<T extends { sortOrder: number }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
}

async function getEventOrThrow(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">
) {
  const event = await ctx.db.get("events", eventId)
  if (!event) {
    throw new Error("Event not found")
  }
  return event
}

async function getAccommodationCatalogData(ctx: QueryCtx | MutationCtx) {
  const [categories, options, roomTypes] = await Promise.all([
    ctx.db.query("accommodationCategories").take(50),
    ctx.db.query("accommodationOptions").take(50),
    ctx.db.query("accommodationRoomTypes").take(100),
  ])
  return { categories, options, roomTypes }
}

export const getAccommodationCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    const catalog = await getAccommodationCatalogData(ctx)
    return {
      categories: sortBySortOrder(catalog.categories),
      options: catalog.options,
      roomTypes: catalog.roomTypes,
    }
  },
})

export const getEventAccommodationConfig = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const [
      configRow,
      rateRows,
      eventOptionRows,
      resourceRows,
    ] = await Promise.all([
      ctx.db
        .query("eventAccommodationConfig")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .unique(),
      ctx.db
        .query("eventAccommodationRates")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(200),
      ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(100),
      ctx.db
        .query("eventAccommodationResources")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(100),
    ])

    // Fetch every referenced catalog row by ID instead of relying on the
    // bounded catalog listing. A category, option or room type beyond the
    // 50/100-row limits would otherwise silently drop labels and corrupt
    // derived availability (e.g. a room resource falling back to a wrong
    // capacity). Referenced rows are few per event, so per-ID reads stay
    // bounded.
    const referencedCategoryIds = [
      ...new Set(rateRows.map((rate) => rate.categoryId as string)),
    ]
    const referencedOptionIds = [
      ...new Set(eventOptionRows.map((row) => row.optionId as string)),
    ]
    const referencedRoomTypeIds = [
      ...new Set(
        resourceRows
          .filter((row) => row.roomTypeId !== undefined)
          .map((row) => row.roomTypeId as string)
      ),
    ]
    const [referencedCategories, referencedOptions, referencedRoomTypes] =
      await Promise.all([
        Promise.all(
          referencedCategoryIds.map((id) =>
            ctx.db.get(
              "accommodationCategories",
              id as Id<"accommodationCategories">
            )
          )
        ),
        Promise.all(
          referencedOptionIds.map((id) =>
            ctx.db.get("accommodationOptions", id as Id<"accommodationOptions">)
          )
        ),
        Promise.all(
          referencedRoomTypeIds.map((id) =>
            ctx.db.get(
              "accommodationRoomTypes",
              id as Id<"accommodationRoomTypes">
            )
          )
        ),
      ])

    const categoryById = new Map(
      referencedCategories
        .filter((category): category is NonNullable<typeof category> => {
          return category !== null
        })
        .map((category) => [category._id, category])
    )
    const optionById = new Map(
      referencedOptions
        .filter((option): option is NonNullable<typeof option> => {
          return option !== null
        })
        .map((option) => [option._id, option])
    )
    const roomTypeById = new Map(
      referencedRoomTypes
        .filter((roomType): roomType is NonNullable<typeof roomType> => {
          return roomType !== null
        })
        .map((roomType) => [roomType._id, roomType])
    )

    // The full reusable catalog choices are returned alongside the event
    // configuration so the editor can render add/configure controls for an
    // event that has no rates, options, or resources yet (CR-05). A fresh
    // event must not dead-end on "no active categories" when the catalog is
    // seeded — the admin needs the catalog rows to create the first ones.
    const catalogData = await getAccommodationCatalogData(ctx)

    const activeCategoryIds = deriveActiveCategoryIds(rateRows)
    const activeCategories = activeCategoryIds
      .map((id) => categoryById.get(id as Id<"accommodationCategories">))
      .filter((category): category is NonNullable<typeof category> => {
        return category !== undefined
      })

    // Pending buyer impact: exact, event-scoped projection of orders that
    // carry at least one unconfirmed accommodation selection row. A confirmed
    // order (every row has `confirmedAt`) is never counted as pending, and an
    // order with no selection rows is not pending either (pre-Phase 42). The
    // count and list are server-derived; the UI never computes them.
    // `hasAccommodationSelections` distinguishes the pre-Phase-42 empty state
    // (no selection rows at all) from an all-confirmed event so the admin UI
    // can show the honest signup-empty copy instead of a fake zero state.
    //
    // The COUNT must never be derived from a bounded order fetch: capping the
    // order scan at N would silently drop pending orders beyond N and report
    // a lower repricing impact. The full indexed event order set is streamed
    // via bounded async iteration (never `.collect()`), while only a bounded
    // display list is returned to the admin UI.
    const pendingOrders: Array<{
      orderId: Id<"orders">
      bookingRef: string | null
      bookerName: string | null
      selectionCount: number
    }> = []
    let pendingOrderCount = 0
    let hasAccommodationSelections = false
    for await (const order of ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))) {
      let hasUnconfirmedRow = false
      let selectionCount = 0
      for await (const row of ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
        selectionCount += 1
        hasAccommodationSelections = true
        if (row.confirmedAt === undefined || row.confirmedAt === null) {
          hasUnconfirmedRow = true
        }
      }
      if (hasUnconfirmedRow) {
        pendingOrderCount += 1
        if (pendingOrders.length < PENDING_ORDERS_DISPLAY_LIMIT) {
          pendingOrders.push({
            orderId: order._id,
            bookingRef: order.bookingRef ?? null,
            bookerName: order.bookerName ?? null,
            selectionCount,
          })
        }
      }
    }

    const rates = rateRows.map((rate) => {
      const category = categoryById.get(rate.categoryId)
      return {
        ...rate,
        categoryCode: category?.code ?? null,
        categoryLabel: category?.label ?? null,
      }
    })

    const options = eventOptionRows.map((row) => {
      const option = optionById.get(row.optionId)
      return {
        ...row,
        optionCode: option?.code ?? null,
        optionLabel: option?.label ?? null,
        kind: option?.kind ?? null,
        unit: option?.unit ?? null,
      }
    })

    const resources = resourceRows.map((row) => {
      const roomType = row.roomTypeId
        ? roomTypeById.get(row.roomTypeId)
        : undefined
      return {
        ...row,
        roomTypeLabel: roomType?.label ?? null,
        sellableBeds: deriveResourceSellableBeds({
          count: row.count,
          kind: row.kind,
          roomTypeDefaultCapacity: roomType?.defaultCapacity ?? null,
        }),
      }
    })

    return {
      event: {
        eventId: event._id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        timezone: event.timezone,
      },
      config: configRow ?? null,
      activeCategories,
      rates,
      options,
      resources,
      pendingOrders,
      pendingOrderCount,
      hasAccommodationSelections,
      catalogCategories: sortBySortOrder(catalogData.categories),
      catalogOptions: catalogData.options,
      catalogRoomTypes: catalogData.roomTypes,
    }
  },
})

export const createAccommodationCategory = mutation({
  args: {
    code: categoryCodeValidator,
    label: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const label = args.label.trim()
    if (!label) {
      throw new Error("Category label is required")
    }
    if (!isNonNegativeInteger(args.sortOrder)) {
      throw new Error("sortOrder must be a non-negative integer")
    }
    const existing = await ctx.db
      .query("accommodationCategories")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first()
    if (existing) {
      throw new Error(`Category code "${args.code}" already exists`)
    }
    return await ctx.db.insert("accommodationCategories", {
      code: args.code,
      label,
      description: normalizeOptionalString(args.description) ?? undefined,
      sortOrder: args.sortOrder,
    })
  },
})

export const updateAccommodationCategory = mutation({
  args: {
    categoryId: v.id("accommodationCategories"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const category = await ctx.db.get("accommodationCategories", args.categoryId)
    if (!category) {
      throw new Error("Category not found")
    }
    const patch: Partial<Doc<"accommodationCategories">> = {}
    if (args.label !== undefined) {
      const label = args.label.trim()
      if (!label) {
        throw new Error("Category label is required")
      }
      patch.label = label
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalString(args.description) ?? undefined
    }
    if (args.sortOrder !== undefined) {
      if (!isNonNegativeInteger(args.sortOrder)) {
        throw new Error("sortOrder must be a non-negative integer")
      }
      patch.sortOrder = args.sortOrder
    }
    await ctx.db.patch("accommodationCategories", args.categoryId, patch)
    return await ctx.db.get("accommodationCategories", args.categoryId)
  },
})

/**
 * Locked catalog semantics for the built-in option codes. The event option
 * mutation always stores a per-unit price, so the cot code must be `per_night`
 * with the addon kind or the catalog would describe an option whose unit
 * disagrees with the pricing contract. Custom option codes are free-form.
 */
export const LOCKED_OPTION_SEMANTICS: Record<
  string,
  {
    kind: "addon" | "upgrade" | "eligibility"
    unit: "per_night" | "per_person"
  }
> = {
  cot: { kind: "addon", unit: "per_night" },
}

export function isValidOptionSemantics(input: {
  code: string
  kind: string
  unit: string
}): boolean {
  const locked = LOCKED_OPTION_SEMANTICS[input.code]
  if (!locked) {
    return true
  }
  return input.kind === locked.kind && input.unit === locked.unit
}

export const createAccommodationOption = mutation({
  args: {
    code: optionCodeValidator,
    label: v.string(),
    description: v.optional(v.string()),
    kind: optionKindValidator,
    unit: optionUnitValidator,
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const label = args.label.trim()
    if (!label) {
      throw new Error("Option label is required")
    }
    if (!isValidOptionSemantics({ code: args.code, kind: args.kind, unit: args.unit })) {
      const locked = LOCKED_OPTION_SEMANTICS[args.code]
      throw new Error(
        `Option code "${args.code}" requires kind "${locked?.kind}" and unit "${locked?.unit}"`
      )
    }
    const existing = await ctx.db
      .query("accommodationOptions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first()
    if (existing) {
      throw new Error(`Option code "${args.code}" already exists`)
    }
    return await ctx.db.insert("accommodationOptions", {
      code: args.code,
      label,
      description: normalizeOptionalString(args.description) ?? undefined,
      kind: args.kind,
      unit: args.unit,
    })
  },
})

export const updateAccommodationOption = mutation({
  args: {
    optionId: v.id("accommodationOptions"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const option = await ctx.db.get("accommodationOptions", args.optionId)
    if (!option) {
      throw new Error("Option not found")
    }
    const patch: Partial<Doc<"accommodationOptions">> = {}
    if (args.label !== undefined) {
      const label = args.label.trim()
      if (!label) {
        throw new Error("Option label is required")
      }
      patch.label = label
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalString(args.description) ?? undefined
    }
    await ctx.db.patch("accommodationOptions", args.optionId, patch)
    return await ctx.db.get("accommodationOptions", args.optionId)
  },
})

/**
 * Extended-stay policy is stored as three booleans. `allowExtendedStayBoth`
 * must imply both directional flags, otherwise consumers would read a
 * contradictory policy ("both" while neither direction is allowed). This
 * normalizes the trio so `both` forces both directions to true.
 */
export function normalizeExtendedStayFlags(input: {
  allowExtendedStayBefore: boolean
  allowExtendedStayAfter: boolean
  allowExtendedStayBoth: boolean
}): {
  allowExtendedStayBefore: boolean
  allowExtendedStayAfter: boolean
  allowExtendedStayBoth: boolean
} {
  const { allowExtendedStayBoth } = input
  return {
    allowExtendedStayBefore:
      allowExtendedStayBoth || input.allowExtendedStayBefore,
    allowExtendedStayAfter: allowExtendedStayBoth || input.allowExtendedStayAfter,
    allowExtendedStayBoth,
  }
}

/**
 * Returns a strictly monotonic config version: `Date.now()` when there is no
 * previous version, or at least `previous + 1` so two successful writes in
 * the same millisecond can never share a version. The single version boundary
 * must strictly advance for a confirmation to record an unambiguous
 * `configVersion`.
 */
function nextConfigVersion(
  previousUpdatedAt: number | null | undefined
): number {
  return Math.max(Date.now(), (previousUpdatedAt ?? 0) + 1)
}

/**
 * Advances the single event accommodation config version boundary after an
 * event-scoped pricing/config write (rates, options, resources, age pricing).
 * The version lives on `eventAccommodationConfig.updatedAt` — there is
 * deliberately no second version field. When no config row exists yet (e.g.
 * an admin saves a rate before ever saving the stay window), the singleton is
 * initialized from the existing default one-night-before-event window so a
 * later confirmation always has a `configVersion` to record. This never
 * touches orders, selection rows, totals, or payment links.
 */
async function touchEventAccommodationConfigVersion(
  ctx: MutationCtx,
  eventId: Id<"events">
) {
  const existing = await ctx.db
    .query("eventAccommodationConfig")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique()

  if (existing) {
    await ctx.db.patch("eventAccommodationConfig", existing._id, {
      updatedAt: nextConfigVersion(existing.updatedAt),
    })
    return
  }

  const event = await getEventOrThrow(ctx, eventId)
  const window = deriveInitialStayWindow(event.startsAt)
  const nightCount = deriveNightCount(window.baseCheckInAt, window.baseCheckOutAt)
  await ctx.db.insert("eventAccommodationConfig", {
    eventId,
    baseCheckInAt: window.baseCheckInAt,
    baseCheckOutAt: window.baseCheckOutAt,
    allowExtendedStayBefore: false,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
    breakfastIncluded: false,
    nightCount,
    updatedAt: nextConfigVersion(null),
  })
}

export const upsertEventAccommodationConfig = mutation({
  args: {
    eventId: v.id("events"),
    baseCheckInAt: v.optional(v.number()),
    baseCheckOutAt: v.optional(v.number()),
    allowExtendedStayBefore: v.optional(v.boolean()),
    allowExtendedStayAfter: v.optional(v.boolean()),
    allowExtendedStayBoth: v.optional(v.boolean()),
    defaultCategoryId: v.optional(v.id("accommodationCategories")),
    breakfastIncluded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await getEventOrThrow(ctx, args.eventId)
    if (
      (args.baseCheckInAt === undefined) !== (args.baseCheckOutAt === undefined)
    ) {
      throw new Error("Both baseCheckInAt and baseCheckOutAt are required")
    }
    if (args.defaultCategoryId !== undefined) {
      const category = await ctx.db.get(
        "accommodationCategories",
        args.defaultCategoryId
      )
      if (!category) {
        throw new Error("Category not found")
      }
    }

    const existing = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique()

    if (existing) {
      const baseCheckInAt = args.baseCheckInAt ?? existing.baseCheckInAt
      const baseCheckOutAt = args.baseCheckOutAt ?? existing.baseCheckOutAt
      const nightCount = deriveNightCount(baseCheckInAt, baseCheckOutAt)
      const extendedStay = normalizeExtendedStayFlags({
        allowExtendedStayBefore:
          args.allowExtendedStayBefore ?? existing.allowExtendedStayBefore,
        allowExtendedStayAfter:
          args.allowExtendedStayAfter ?? existing.allowExtendedStayAfter,
        allowExtendedStayBoth:
          args.allowExtendedStayBoth ?? existing.allowExtendedStayBoth,
      })
      await ctx.db.patch("eventAccommodationConfig", existing._id, {
        baseCheckInAt,
        baseCheckOutAt,
        allowExtendedStayBefore: extendedStay.allowExtendedStayBefore,
        allowExtendedStayAfter: extendedStay.allowExtendedStayAfter,
        allowExtendedStayBoth: extendedStay.allowExtendedStayBoth,
        defaultCategoryId:
          args.defaultCategoryId === undefined
            ? existing.defaultCategoryId
            : args.defaultCategoryId,
        breakfastIncluded: args.breakfastIncluded ?? existing.breakfastIncluded,
        nightCount,
        updatedAt: nextConfigVersion(existing.updatedAt),
      })
      return await ctx.db.get("eventAccommodationConfig", existing._id)
    }

    // Newly initialized: default to the locked initial one-night-before-event
    // window when no explicit timestamps are supplied.
    const window =
      args.baseCheckInAt !== undefined && args.baseCheckOutAt !== undefined
        ? {
            baseCheckInAt: args.baseCheckInAt,
            baseCheckOutAt: args.baseCheckOutAt,
          }
        : deriveInitialStayWindow(event.startsAt)
    const nightCount = deriveNightCount(window.baseCheckInAt, window.baseCheckOutAt)
    const extendedStay = normalizeExtendedStayFlags({
      allowExtendedStayBefore: args.allowExtendedStayBefore ?? false,
      allowExtendedStayAfter: args.allowExtendedStayAfter ?? false,
      allowExtendedStayBoth: args.allowExtendedStayBoth ?? false,
    })
    const id = await ctx.db.insert("eventAccommodationConfig", {
      eventId: args.eventId,
      baseCheckInAt: window.baseCheckInAt,
      baseCheckOutAt: window.baseCheckOutAt,
      allowExtendedStayBefore: extendedStay.allowExtendedStayBefore,
      allowExtendedStayAfter: extendedStay.allowExtendedStayAfter,
      allowExtendedStayBoth: extendedStay.allowExtendedStayBoth,
      defaultCategoryId: args.defaultCategoryId,
      breakfastIncluded: args.breakfastIncluded ?? false,
      nightCount,
      updatedAt: nextConfigVersion(null),
    })
    return await ctx.db.get("eventAccommodationConfig", id)
  },
})

export const upsertEventAccommodationRate = mutation({
  args: {
    eventId: v.id("events"),
    categoryId: v.id("accommodationCategories"),
    occupancy: occupancyValidator,
    pricePerPersonMinor: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await getEventOrThrow(ctx, args.eventId)
    const category = await ctx.db.get("accommodationCategories", args.categoryId)
    if (!category) {
      throw new Error("Category not found")
    }
    if (!isNonNegativePrice(args.pricePerPersonMinor)) {
      throw new Error("pricePerPersonMinor must be a non-negative number")
    }
    const existing = await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId_and_categoryId_and_occupancy", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("categoryId", args.categoryId)
          .eq("occupancy", args.occupancy)
      )
      .first()
    if (existing) {
      await ctx.db.patch("eventAccommodationRates", existing._id, {
        pricePerPersonMinor: args.pricePerPersonMinor,
      })
      await touchEventAccommodationConfigVersion(ctx, args.eventId)
      return await ctx.db.get("eventAccommodationRates", existing._id)
    }
    const id = await ctx.db.insert("eventAccommodationRates", args)
    await touchEventAccommodationConfigVersion(ctx, args.eventId)
    return await ctx.db.get("eventAccommodationRates", id)
  },
})

export const upsertEventAccommodationOption = mutation({
  args: {
    eventId: v.id("events"),
    optionId: v.id("accommodationOptions"),
    enabled: v.optional(v.boolean()),
    priceMinor: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await getEventOrThrow(ctx, args.eventId)
    const option = await ctx.db.get("accommodationOptions", args.optionId)
    if (!option) {
      throw new Error("Option not found")
    }
    if (args.priceMinor !== undefined && !isNonNegativePrice(args.priceMinor)) {
      throw new Error("priceMinor must be a non-negative number")
    }

    const existing = await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId_and_optionId", (q) =>
        q.eq("eventId", args.eventId).eq("optionId", args.optionId)
      )
      .first()

    if (existing) {
      await ctx.db.patch("eventAccommodationOptions", existing._id, {
        enabled: args.enabled ?? existing.enabled,
        priceMinor: args.priceMinor ?? existing.priceMinor,
        notes:
          args.notes === undefined
            ? existing.notes
            : normalizeOptionalString(args.notes) ?? undefined,
      })
      await touchEventAccommodationConfigVersion(ctx, args.eventId)
      return await ctx.db.get("eventAccommodationOptions", existing._id)
    }

    const id = await ctx.db.insert("eventAccommodationOptions", {
      eventId: args.eventId,
      optionId: args.optionId,
      enabled: args.enabled ?? false,
      priceMinor: resolveEventOptionPriceMinor(args.priceMinor),
      notes: normalizeOptionalString(args.notes) ?? undefined,
    })
    await touchEventAccommodationConfigVersion(ctx, args.eventId)
    return await ctx.db.get("eventAccommodationOptions", id)
  },
})

export const upsertEventAccommodationResource = mutation({
  args: {
    eventId: v.id("events"),
    kind: resourceKindValidator,
    roomTypeId: v.optional(v.id("accommodationRoomTypes")),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await getEventOrThrow(ctx, args.eventId)
    if (!isNonNegativeInteger(args.count)) {
      throw new Error("count must be a non-negative integer")
    }
    if (args.kind === "cot" && args.roomTypeId !== undefined) {
      throw new Error("Cot resources cannot reference a room type")
    }
    if (args.kind === "room" && args.roomTypeId === undefined) {
      throw new Error("Room resources require a room type")
    }
    if (args.roomTypeId !== undefined) {
      const roomType = await ctx.db.get("accommodationRoomTypes", args.roomTypeId)
      if (!roomType) {
        throw new Error("Room type not found")
      }
    }
    const existing = await ctx.db
      .query("eventAccommodationResources")
      .withIndex("by_eventId_and_kind_and_roomTypeId", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("kind", args.kind)
          .eq("roomTypeId", args.roomTypeId ?? undefined)
      )
      .first()
    if (existing) {
      await ctx.db.patch("eventAccommodationResources", existing._id, {
        count: args.count,
      })
      await touchEventAccommodationConfigVersion(ctx, args.eventId)
      return await ctx.db.get("eventAccommodationResources", existing._id)
    }
    const id = await ctx.db.insert("eventAccommodationResources", args)
    await touchEventAccommodationConfigVersion(ctx, args.eventId)
    return await ctx.db.get("eventAccommodationResources", id)
  },
})

// ---------------------------------------------------------------------------
// Phase 41: Per-order accommodation configuration confirmation
//
// An explicit, authenticated confirmation persists the Phase 40 snapshot
// boundary (`confirmedAt` + `configVersion = eventAccommodationConfig.updatedAt`
// + the pure module's immutable `priceSnapshot`) on every unconfirmed
// `orderAccommodationSelections` row atomically. Confirmation accepts only an
// order ID — every rate, option price, category, night count and ticket
// inclusion flag is resolved server-side, and no client amount is ever
// accepted. Configuration saves never eagerly re-price or rewrite orders; the
// confirmation boundary is the only place selection rows are locked.
// ---------------------------------------------------------------------------

type SelectionConfirmationPatch = {
  selectionId: Id<"orderAccommodationSelections">
  confirmedAt: number
  configVersion: number
  priceSnapshot: AccommodationPriceSnapshot
}

/**
 * Resolves every unconfirmed accommodation selection of an order into a
 * Phase 40 snapshot patch using current server-side configuration. Throws for
 * missing config, an order with no selection rows, already-confirmed rows,
 * unknown selection references, or rows that cannot be priced from a complete
 * event configuration. Exported so Phase 44 assignment confirmation reuses
 * the exact snapshot-boundary code path instead of inventing a second one.
 */
export async function resolveOrderAccommodationConfirmation(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<{
  configVersion: number
  patches: SelectionConfirmationPatch[]
}> {
  const order = await ctx.db.get("orders", orderId)
  if (!order) {
    throw new Error("Order not found")
  }
  if (!order.eventId) {
    throw new Error("Order is not linked to an event")
  }
  const eventId = order.eventId

  const config = await ctx.db
    .query("eventAccommodationConfig")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique()
  if (!config) {
    throw new Error(
      "Event accommodation configuration is required before confirming an order"
    )
  }
  const configVersion = config.updatedAt

  // All selection rows through bounded async iteration — a fixed `.take(100)`
  // would silently truncate large orders and lock only part of the order.
  const selectionRows: Array<Doc<"orderAccommodationSelections">> = []
  for await (const row of ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    selectionRows.push(row)
  }
  if (selectionRows.length === 0) {
    throw new Error("Order has no accommodation selections to confirm")
  }
  for (const row of selectionRows) {
    if (row.confirmedAt !== undefined && row.confirmedAt !== null) {
      throw new Error(
        "Order already has confirmed accommodation selections"
      )
    }
  }

  // Attendee ticket selections: accommodationIncluded is resolved from the
  // attendee's ticket type (absent = false), exactly like the canonical
  // loader's live derivation. Fail-closed ownership checks: every attendee
  // must have at most one ticket selection row, and the referenced ticket
  // type must exist and belong to the order's event — a ticket type from a
  // different event must never influence this order's snapshot.
  const ticketTypeIdByAttendeeId = new Map<
    Id<"orderAttendees">,
    Id<"ticketTypes">
  >()
  for await (const ticketSelection of ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    // Fail closed: every ticket row must reference a real attendee of this
    // order, and each attendee may have at most one ticket selection row —
    // duplicates of the same ticket type are malformed and must never be
    // silently collapsed.
    const ticketAttendee = await ctx.db.get(
      "orderAttendees",
      ticketSelection.attendeeId
    )
    if (!ticketAttendee) {
      throw new Error("Ticket selection references an unknown attendee")
    }
    if (ticketAttendee.orderId !== orderId) {
      throw new Error("Ticket selection attendee does not belong to the order")
    }
    if (ticketTypeIdByAttendeeId.has(ticketSelection.attendeeId)) {
      throw new Error(
        "Attendee has more than one ticket selection and cannot be confirmed"
      )
    }
    ticketTypeIdByAttendeeId.set(
      ticketSelection.attendeeId,
      ticketSelection.ticketTypeId
    )
  }
  const ticketTypeIds = [...new Set(ticketTypeIdByAttendeeId.values())]
  const ticketTypes = await Promise.all(
    ticketTypeIds.map((ticketTypeId) => ctx.db.get("ticketTypes", ticketTypeId))
  )
  const ticketTypeById = new Map<
    string,
    Doc<"ticketTypes">
  >()
  for (const ticketType of ticketTypes) {
    if (!ticketType) continue
    ticketTypeById.set(String(ticketType._id), ticketType)
  }
  const ticketAccommodationIncludedByType = new Map<
    string,
    boolean
  >()
  for (const [, ticketTypeId] of ticketTypeIdByAttendeeId) {
    const ticketType = ticketTypeById.get(String(ticketTypeId))
    if (!ticketType) {
      throw new Error("Attendee references an unknown ticket type")
    }
    if (ticketType.eventId !== eventId) {
      throw new Error(
        "Attendee ticket type does not belong to the order's event"
      )
    }
    ticketAccommodationIncludedByType.set(
      String(ticketTypeId),
      ticketType.accommodationIncluded === true
    )
  }

  // Event rates keyed by `${categoryId}:${occupancy}` and enabled option
  // prices keyed by option code — the same resolution the canonical loader
  // uses, so a confirmed snapshot always matches live pricing at confirmation.
  const rateByKey = new Map<string, number>()
  for await (const rate of ctx.db
    .query("eventAccommodationRates")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
    rateByKey.set(`${String(rate.categoryId)}:${rate.occupancy}`, rate.pricePerPersonMinor)
  }

  const eventOptionRows: Array<Doc<"eventAccommodationOptions">> = []
  for await (const optionRow of ctx.db
    .query("eventAccommodationOptions")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
    eventOptionRows.push(optionRow)
  }
  const optionDefinitionById = new Map<string, Doc<"accommodationOptions">>()
  for (const optionRow of eventOptionRows) {
    const definition = await ctx.db.get(
      "accommodationOptions",
      optionRow.optionId
    )
    if (definition) {
      optionDefinitionById.set(String(optionRow.optionId), definition)
    }
  }
  // Enabled event options resolved to typed per-unit prices keyed by option
  // code — the same resolution the canonical loader uses, so a confirmed
  // snapshot always matches live pricing at confirmation.
  const optionsByKey = new Map<
    string,
    { label: string; priceMinor: number; unit: "per_night" | "per_person" }
  >()
  for (const optionRow of eventOptionRows) {
    if (!optionRow.enabled) continue
    const definition = optionDefinitionById.get(String(optionRow.optionId))
    if (!definition) continue
    optionsByKey.set(definition.code, {
      label: definition.label,
      priceMinor: optionRow.priceMinor,
      unit: definition.unit,
    })
  }

  const optionSelectionsBySelectionId = new Map<
    string,
    Array<{ optionKey: string; quantity: number; nights: number }>
  >()
  for await (const optionRow of ctx.db
    .query("orderAccommodationOptionSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    const selectionId = String(optionRow.selectionId)
    const existing = optionSelectionsBySelectionId.get(selectionId) ?? []
    existing.push({
      optionKey: optionRow.optionKey,
      quantity: optionRow.quantity,
      nights: optionRow.nights,
    })
    optionSelectionsBySelectionId.set(selectionId, existing)
  }

  const patches: SelectionConfirmationPatch[] = []
  const confirmedAt = Date.now()

  for (const row of selectionRows) {
    if (!row.categoryId || !row.occupancy) {
      throw new Error(
        "Selection is missing a category or occupancy and cannot be priced"
      )
    }
    if (
      row.nightCount === undefined ||
      row.nightCount === null ||
      !Number.isInteger(row.nightCount) ||
      row.nightCount < 0
    ) {
      throw new Error(
        "Selection night count must be a non-negative integer"
      )
    }
    // Every attendee reference must resolve to a real attendee of this
    // order — a cross-order attendee ID must never be priced or locked.
    const attendee = await ctx.db.get("orderAttendees", row.attendeeId)
    if (!attendee) {
      throw new Error("Selection references an unknown attendee")
    }
    if (attendee.orderId !== orderId) {
      throw new Error("Selection attendee does not belong to the order")
    }
    const category = await ctx.db.get(
      "accommodationCategories",
      row.categoryId
    )
    if (!category) {
      throw new Error("Selection references an unknown category")
    }
    const baseRatePerNightMinor =
      rateByKey.get(`${String(row.categoryId)}:${row.occupancy}`) ?? null
    if (baseRatePerNightMinor === null) {
      throw new Error(
        "No rate is configured for the selected category and occupancy"
      )
    }
    const nightBeforeOccupancy =
      row.nightBeforeOccupancy ??
      (row.occupancy === "single" || row.occupancy === "shared"
        ? row.occupancy
        : null)
    const nightBeforeRatePerNightMinor = nightBeforeOccupancy
      ? rateByKey.get(
          `${String(row.categoryId)}:${nightBeforeOccupancy}`
        ) ?? null
      : null
    if (row.nightBeforeLevel && nightBeforeRatePerNightMinor === null) {
      throw new Error(
        "No rate is configured for the selected night-before occupancy"
      )
    }

    // Every selected option must be a key in the event's enabled option set.
    // Unknown/disabled keys fail closed; quantity and nights are normalized.
    const selectedOptionKeys = optionSelectionsBySelectionId.get(String(row._id)) ?? []
    const seenKeys = new Set<string>()
    const resolvedOptions: Array<{
      optionKey: string
      label: string
      pricePerUnitMinor: number
      quantity: number
      nights: number
      unit: "per_night" | "per_person"
    }> = []
    for (const selected of selectedOptionKeys) {
      if (seenKeys.has(selected.optionKey)) {
        throw new Error(
          `Selection selects option '${selected.optionKey}' more than once`
        )
      }
      seenKeys.add(selected.optionKey)
      const option = optionsByKey.get(selected.optionKey)
      if (!option) {
        throw new Error(
          `Selected option '${selected.optionKey}' is not enabled for this event`
        )
      }
      if (!Number.isInteger(selected.quantity) || selected.quantity <= 0) {
        throw new Error(
          `Selected option '${selected.optionKey}' has an invalid quantity`
        )
      }
      if (!Number.isInteger(selected.nights) || selected.nights <= 0) {
        throw new Error(
          `Selected option '${selected.optionKey}' has an invalid night count`
        )
      }
      resolvedOptions.push({
        optionKey: selected.optionKey,
        label: option.label,
        pricePerUnitMinor: option.priceMinor,
        quantity: selected.quantity,
        nights: selected.nights,
        unit: option.unit,
      })
    }

    const attendeeTicketTypeId = ticketTypeIdByAttendeeId.get(row.attendeeId)
    if (attendeeTicketTypeId === undefined) {
      throw new Error(
        "Selection attendee has no ticket selection and cannot be confirmed"
      )
    }
    const ticketAccommodationIncluded =
      ticketAccommodationIncludedByType.get(String(attendeeTicketTypeId)) ??
      false

    const priceSnapshot = buildAccommodationPriceSnapshot({
      selection: {
        attendeeId: String(row.attendeeId),
        categoryCode: category.code,
        occupancy: row.occupancy,
        nightCount: row.nightCount,
        nightBeforeLevel: row.nightBeforeLevel ?? null,
        nightBeforeOccupancy,
        optionSelections: resolvedOptions,
      },
      pricing: {
        baseRatePerNightMinor,
        nightBeforeRatePerNightMinor,
        options: resolvedOptions,
        ticketAccommodationIncluded,
        eventBaseNights: config.nightCount,
      },
    })

    patches.push({
      selectionId: row._id,
      confirmedAt,
      configVersion,
      priceSnapshot,
    })
  }

  return { configVersion, patches }
}

/**
 * Assignment-confirmation boundary (Phase 44, D-08/D-09): persists the Phase
 * 41 `confirmedAt`/`configVersion`/`priceSnapshot` boundary through the shared
 * `resolveOrderAccommodationConfirmation` resolver in the SAME Convex
 * transaction as the assignment write that follows. Every admin assignment
 * entry point that can finalize a room placement calls this before patching
 * the attendee or assignment.
 *
 * Path decisions:
 *   - No selection rows        -> legacy order, skip cleanly (nothing to lock)
 *   - Every row already confirmed -> idempotent no-op; a repeat assignment is
 *                                   allowed to proceed without re-confirming
 *   - Mixed confirmed/unconfirmed -> fail closed; an order is never half-locked
 *   - None confirmed           -> resolve + patch all rows atomically
 *
 * The resolver keeps every rate, night, timestamp, and snapshot
 * server-resolved; this wrapper never accepts client money or confirmation
 * fields and never duplicates the snapshot formula.
 */
export async function persistOrderAccommodationConfirmation(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<void> {
  const selectionRows: Array<Doc<"orderAccommodationSelections">> = []
  for await (const row of ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    selectionRows.push(row)
  }

  if (selectionRows.length === 0) {
    // Legacy order with no options-only selection rows: existing assignment
    // behavior is preserved and nothing is locked.
    return
  }

  // Classify each row as completely unconfirmed, completely confirmed, or
  // malformed. A confirmed row is only complete when it carries a valid
  // positive `confirmedAt`, a positive finite `configVersion`, and a complete
  // price snapshot — matching the canonical finance loader's fail-closed
  // checks exactly (any `<= 0`/non-finite value is malformed).
  const isFullyConfirmed = (row: Doc<"orderAccommodationSelections">) =>
    typeof row.confirmedAt === "number" &&
    Number.isFinite(row.confirmedAt) &&
    row.confirmedAt > 0 &&
    typeof row.configVersion === "number" &&
    Number.isFinite(row.configVersion) &&
    row.configVersion > 0 &&
    row.priceSnapshot !== undefined &&
    row.priceSnapshot !== null &&
    isCompleteAccommodationPriceSnapshot(row.priceSnapshot)

  const isCompletelyUnconfirmed = (row: Doc<"orderAccommodationSelections">) =>
    (row.confirmedAt === undefined || row.confirmedAt === null) &&
    (row.configVersion === undefined || row.configVersion === null) &&
    row.priceSnapshot === undefined

  let confirmedCount = 0
  let malformedCount = 0
  for (const row of selectionRows) {
    if (isFullyConfirmed(row)) {
      confirmedCount += 1
    } else if (!isCompletelyUnconfirmed(row)) {
      // Partial fields (e.g. confirmedAt present without a complete
      // snapshot, or a snapshot without confirmedAt) are malformed.
      malformedCount += 1
    }
  }

  if (malformedCount > 0) {
    throw new Error(
      "Order has malformed accommodation confirmation state and cannot be assigned"
    )
  }
  if (confirmedCount === selectionRows.length) {
    // Already fully confirmed: repeat assignment is an idempotent no-op.
    return
  }
  if (confirmedCount > 0) {
    throw new Error(
      "Order has partially confirmed accommodation selections and cannot be assigned"
    )
  }

  const { patches } = await resolveOrderAccommodationConfirmation(ctx, orderId)
  for (const patch of patches) {
    await ctx.db.patch("orderAccommodationSelections", patch.selectionId, {
      confirmedAt: patch.confirmedAt,
      configVersion: patch.configVersion,
      priceSnapshot: patch.priceSnapshot,
    })
  }
}

export const confirmAccommodationOrderConfiguration = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { configVersion, patches } = await resolveOrderAccommodationConfirmation(
      ctx,
      args.orderId
    )
    for (const patch of patches) {
      await ctx.db.patch(
        "orderAccommodationSelections",
        patch.selectionId,
        {
          confirmedAt: patch.confirmedAt,
          configVersion: patch.configVersion,
          priceSnapshot: patch.priceSnapshot,
        }
      )
    }
    return {
      orderId: args.orderId,
      configVersion,
      confirmedSelectionCount: patches.length,
    }
  },
})
