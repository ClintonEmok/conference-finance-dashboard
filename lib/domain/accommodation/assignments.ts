import { api } from "@/lib/convex/api"
import { convexQuery, convexMutation } from "@/lib/convex/server"
import { Id } from "@/convex/_generated/dataModel"

type RoomAvailability = "all" | "empty" | "available" | "full"

/**
 * Server-owned payment state (Phase 44). The browser never derives this from
 * amounts; the board precomputes it from canonical due/paid maps. Null means
 * the projection is unavailable for that attendee (never a fabricated state).
 */
export type BoardPaymentState = "paid" | "partial" | "unpaid" | null

export type AllocationCompatibility = {
  status: "compatible" | "no_match" | "unavailable"
  summary: string
  recommendedRoomId?: string
}

export type FamilyRole = "solo" | "parent" | "child"
export type FamilyState =
  | "unresolved"
  | "placed"
  | "waiting-for-parent-room"
  | "inconsistent"
  | "needs-family-link"
  | "Needs family link"
  | "Waiting for parent room"

export type FamilyChild = {
  attendeeId: string
  attendeeName: string | null
  attendeeEmail?: string | null
  requiresBed: false
  familyRole: "child"
  familyState: FamilyState
}

export type FamilyFollowUp = {
  attendeeId: string
  attendeeName: string | null
  familyGroupId: string | null
  familyLabel: string | null
  familyParentAttendeeId: string | null
  familyParentName: string | null
  state: "Needs family link" | "Waiting for parent room" | "inconsistent"
  message: string
}

export type SubmissionQueueRow = {
  attendeeId: string
  attendeeName: string
  attendeeEmail: string | null
  source: "internal"
  submissionId: string | null
  bookingRef: string | null
  submissionNotes: string | null
  assignmentIntent: "assign" | "skip" | null
  slotId: string | null
  roommatePreference: string | null
  roommateAvoid: string | null
  dietaryRestrictions: string | null
  bookerName: string | null
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
  location: string | null
  unresolved: boolean
  unresolvedReason: string | null
  submittedAt: number | null
  sortOrder: number
  paymentState: BoardPaymentState
  amountDueMinor: number | null
  paidAmountMinor: number | null
}

type RoommateSignals = {
  roommatePreference?: string | null
  roommateAvoid?: string | null
}

export type RoomAllocationBoardFilters = {
  eventId: string
  search?: string | null
  hotelId?: string | null
  roomTypeId?: string | null
  availability?: RoomAvailability
  genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  familyGroupId?: string | null
  location?: string | null
  allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
  hasPriority?: boolean | null
}

export type RoomAllocationBoard = {
  generatedAt: string
  filters: {
    eventId: string | null
    search: string | null
    hotelId: string | null
    roomTypeId: string | null
    availability: RoomAvailability
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    familyGroupId: string | null
    location: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    hasPriority: boolean | null
  }
  availableEvents: Array<{
    eventId: string
    slug: string
    name: string
    startsAt: number
  }>
  hotels: Array<{
    id: string
    name: string
    assignedEventIds: string[]
  }>
  roomTypes: Array<{
    id: string
    label: string
    defaultCapacity: number
  }>
  rooms: Array<{
    id: string
    label: string
    capacity: number
    occupantCount?: number
    foreignOccupantCount?: number
    occupancyIncomplete?: boolean
    occupiedBeds: number
    availableBeds: number
    availability: "empty" | "available" | "full"
    notes: string | null
    hotel?: {
      id: string
      name: string
      city: string | null
    }
    roomType?: {
      id: string
      label: string
      defaultCapacity: number
    }
    occupants: Array<{
      attendeeId: string
      attendeeName: string | null
      attendeeEmail: string | null
      orderId: string | null
      providerOrderId: string | null
      providerEventId: string | null
      eventName: string | null
      ticketTypeLabel: string | null
      paymentState: BoardPaymentState
      amountDueMinor: number | null
      paidAmountMinor: number | null
      /** Server-computed buyer preference projection (quick task 260807-uel); the live payload always includes these. */
      occupancy?: "single" | "shared" | "family" | null
      nightBeforeLevel?: "standard" | "superior" | null
      nightBeforeOccupancy?: "single" | "shared" | null
      categoryLabel?: string | null
      optionKeys?: string[]
      requiresBed?: boolean
      /** RMG-04: server-computed; true only when the night-before choice cannot be satisfied by the assigned room. Fail-safe false. */
      nightBeforeMismatch?: boolean
      familyRole?: FamilyRole
      familyGroupId?: string | null
      familyLabel?: string | null
      familyParentAttendeeId?: string | null
      familyState?: FamilyState
      eligibleChildren?: FamilyChild[]
      eligibleChildCount?: number
      separateMemberCount?: number
    }>
    pendingAssignments: Array<{
      assignmentId: string
      attendeeId: string
      attendeeName: string | null
      attendeeEmail: string | null
      assignmentIntent: "assign" | "skip"
      sortOrder: number
      familyRole?: FamilyRole
      familyGroupId?: string | null
      familyLabel?: string | null
      familyParentAttendeeId?: string | null
      familyState?: FamilyState
      eligibleChildren?: FamilyChild[]
      eligibleChildCount?: number
      separateMemberCount?: number
    }>
    /** RMG-02: server-computed; true when a pending buyer group requested on this room spans Standard and Superior. */
    mixedCategoryGroup?: boolean
  }>
  buyerSuggestions?: Array<{
    assignmentId: string
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    roomId: string | null
    roomLabel: string | null
    hotelName: string | null
    assignmentIntent: "assign" | "skip"
    sortOrder: number
    paymentState: BoardPaymentState
    amountDueMinor: number | null
    paidAmountMinor: number | null
    /** RMG-02: server-computed; true on every member of a pending group that spans Standard and Superior. */
    mixedCategory?: boolean
    familyRole?: FamilyRole
    familyGroupId?: string | null
    familyParentAttendeeId?: string | null
    eligibleChildIds?: string[]
    eligibleChildCount?: number
  }>
  familyFollowUps?: FamilyFollowUp[]
  unassignedAttendees: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    orderId: string | null
    bookingRef: string | null
    bookerName: string | null
    providerOrderId: string | null
    providerEventId: string | null
    eventId: string | null
    eventName: string | null
    ticketTypeLabel: string | null
    allocatedRoomTypeId: string | null
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    location: string | null
    remarks: string | null
    hasFamily: boolean
    groupMemberIds: string[]
    groupAssignmentAvailable: boolean
    roommatePreference?: string | null
    roommateAvoid?: string | null
    occupancy?: "single" | "shared" | "family" | null
    nightBeforeLevel?: "standard" | "superior" | null
    nightBeforeOccupancy?: "single" | "shared" | null
    categoryLabel?: string | null
    optionKeys?: string[]
    requiresBed?: boolean
    paymentState: BoardPaymentState
    amountDueMinor: number | null
    paidAmountMinor: number | null
    compatibility?: AllocationCompatibility
    familyRole?: FamilyRole
    familyGroupId?: string | null
    familyLabel?: string | null
    familyParentAttendeeId?: string | null
    familyState?: FamilyState
    eligibleChildren?: FamilyChild[]
    eligibleChildCount?: number
    separateMemberCount?: number
    separateMembers?: Array<{
      attendeeId: string
      attendeeName: string | null
    }>
  }>
  submissionQueueRows: SubmissionQueueRow[]
  summary: {
    totalRooms: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
    totalBeds: number
    totalOccupants?: number
    occupiedBeds: number
    availableBeds: number
    foreignOccupants?: number
    occupancyIncomplete?: boolean
    unassignedAttendeesCount: number
  }
}

export type AllocationProposal = {
  generatedAt: string
  eventId: string | null
  suggestions: Array<{
    attendeeId: string
    attendeeName: string | null
    roomId: string
    roomLabel: string
    hotelName: string
    reason: string
    priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    paymentState: BoardPaymentState
    familyRole: FamilyRole
    familyGroupId: string | null
    familyParentAttendeeId: string | null
    eligibleChildIds: string[]
    eligibleChildCount: number
  }>
  unplacedAttendees: Array<{
    attendeeId: string
    attendeeName: string | null
    reason: string
    priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    paymentState: BoardPaymentState
  }>
  summary: {
    totalSuggested: number
    totalUnplaced: number
    familyGroupsKeptTogether: number
  }
}

type AllocationPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
type AttendeeGender = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null

type ProposalAttendee = RoomAllocationBoard["unassignedAttendees"][number]
type ProposalRoom = RoomAllocationBoard["rooms"][number]
type BuyerSuggestion = NonNullable<
  RoomAllocationBoard["buyerSuggestions"]
>[number]

type RoomState = {
  room: ProposalRoom
  remainingBeds: number
  projectedOccupantCount: number
  projectedGenders: Set<Exclude<AttendeeGender, null>>
  projectedOrderIds: Set<string>
  projectedOccupantSignatures: Set<string>
}

function normalizeRoommateTokens(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[;,\n]/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function buildPersonSignatures(
  attendeeName: string | null | undefined,
  attendeeEmail: string | null | undefined
): string[] {
  const signatures = [attendeeName, attendeeEmail]
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(Boolean)
  return [...new Set(signatures)]
}

function roommatePreferenceRank(
  attendee: ProposalAttendee & RoommateSignals,
  roomState: RoomState
): number {
  const preferredTokens = normalizeRoommateTokens(attendee.roommatePreference)
  if (preferredTokens.length === 0) return 0
  return preferredTokens.some((token) =>
    roomState.projectedOccupantSignatures.has(token)
  )
    ? 1
    : 0
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function canonicalOrderKey(
  orderId: string | null | undefined,
  fallbackAttendeeId: string
): string {
  return orderId ?? fallbackAttendeeId
}

function normalizeAvailability(
  value: string | null | undefined
): RoomAvailability {
  const allowed: RoomAvailability[] = ["all", "empty", "available", "full"]
  if (!value || !allowed.includes(value as RoomAvailability)) {
    return "all"
  }
  return value as RoomAvailability
}

function normalizeGenderType(
  value: string | null | undefined
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null {
  const allowed = ["MALE", "FEMALE", "MIXED", "UNKNOWN"] as const
  if (!value || !allowed.includes(value as (typeof allowed)[number])) {
    return null
  }
  return value as (typeof allowed)[number]
}

function normalizeAllocationPriority(
  value: string | null | undefined
): "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null {
  const allowed = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const
  if (!value || !allowed.includes(value as (typeof allowed)[number])) {
    return null
  }
  return value as (typeof allowed)[number]
}

function normalizeBoolean(value: boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  return value
}

function matchesSearch(value: string | null, search: string): boolean {
  if (!value || !search) return false
  return value.toLowerCase().includes(search.toLowerCase())
}

function attendeeMatchesSearch(
  attendee: {
    attendeeName: string | null
    attendeeEmail: string | null
    orderId: string | null
    providerEventId: string | null
    eventName: string | null
    ticketTypeLabel: string | null
  },
  search: string
): boolean {
  const searchLower = search.toLowerCase()
  return [
    attendee.attendeeName,
    attendee.attendeeEmail,
    attendee.orderId,
    attendee.providerEventId,
    attendee.eventName,
    attendee.ticketTypeLabel,
  ].some((value) => matchesSearch(value, searchLower))
}

function priorityRank(priority: AllocationPriority | null | undefined): number {
  const priorityOrder: Record<AllocationPriority, number> = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
  }

  return priorityOrder[priority ?? "NORMAL"]
}

/**
 * Phase 44 primary rank: paid first, partial second, unpaid last, unknown/missing
 * last. The server already sorts board rows this way; the client proposal keeps
 * the same contract so generated suggestions can never undo paid-first order.
 */
function paymentStateRank(state: BoardPaymentState | undefined): number {
  const rankOrder: Record<Exclude<BoardPaymentState, null>, number> = {
    paid: 0,
    partial: 1,
    unpaid: 2,
  }
  return state ? (rankOrder[state] ?? 3) : 3
}

function normalizeAttendeeGender(
  gender: AttendeeGender
): Exclude<AttendeeGender, null> {
  return gender ?? "UNKNOWN"
}

function isGenderCompatible(
  attendeeGender: Exclude<AttendeeGender, null>,
  roomGenders: Set<Exclude<AttendeeGender, null>>
): boolean {
  if (roomGenders.size === 0) {
    return true
  }

  const roomAllowsMixed =
    attendeeGender === "MIXED" ||
    attendeeGender === "UNKNOWN" ||
    roomGenders.has("MIXED") ||
    roomGenders.has("UNKNOWN")

  if (roomAllowsMixed) {
    return true
  }

  if (attendeeGender === "MALE" && roomGenders.has("FEMALE")) {
    return false
  }

  if (attendeeGender === "FEMALE" && roomGenders.has("MALE")) {
    return false
  }

  return true
}

function rankGenderFit(
  attendeeGender: Exclude<AttendeeGender, null>,
  roomGenders: Set<Exclude<AttendeeGender, null>>
): number {
  if (roomGenders.size === 0) {
    return 3
  }

  if (attendeeGender === "MIXED" || attendeeGender === "UNKNOWN") {
    return 2
  }

  if (roomGenders.has(attendeeGender)) {
    return 3
  }

  if (roomGenders.has("MIXED") || roomGenders.has("UNKNOWN")) {
    return 2
  }

  return 1
}

function getFamilyCohesionRank(
  attendee: ProposalAttendee,
  roomState: RoomState
): number {
  const attendeeOrderKey = canonicalOrderKey(
    attendee.orderId,
    attendee.attendeeId
  )
  const hasGroupInRoom = roomState.projectedOrderIds.has(attendeeOrderKey)
  if (hasGroupInRoom) {
    return 3
  }

  if (
    attendee.familyRole === "parent" &&
    (attendee.eligibleChildCount ?? attendee.eligibleChildren?.length ?? 0) > 0
  ) {
    return 3
  }

  if (attendee.hasFamily && roomState.projectedOccupantCount === 0) {
    return 2
  }

  return 1
}

function buildPlacementReason(input: {
  attendee: ProposalAttendee
  roomState: RoomState
  priority: AllocationPriority
  familyMatch: boolean
  genderFitRank: number
  buyerSuggestionHonored?: boolean
}): string {
  const gender = normalizeAttendeeGender(input.attendee.genderType)
  const rationale: string[] = []

  if (input.buyerSuggestionHonored) {
    rationale.push("honors buyer room suggestion")
  }

  if (input.familyMatch) {
    rationale.push("keeps family/order group together")
  }

  if (input.genderFitRank >= 3) {
    rationale.push(`matches ${gender.toLowerCase()} room profile`)
  } else {
    rationale.push("passes mixed/unknown gender guardrail")
  }

  rationale.push(`priority ${input.priority}`)
  rationale.push(
    `${input.roomState.remainingBeds} bed(s) remain after placement`
  )

  return `Compatibility placement: ${rationale.join("; ")}`
}

export async function getRoomAllocationBoard(
  filters: RoomAllocationBoardFilters
): Promise<RoomAllocationBoard> {
  const eventId = normalizeOptionalString(filters.eventId)
  if (!eventId) {
    throw new Error("Invalid eventId: a non-blank event ID is required")
  }
  const search = normalizeOptionalString(filters.search)
  const hotelId = normalizeOptionalString(filters.hotelId)
  const roomTypeId = normalizeOptionalString(filters.roomTypeId)
  const availability = normalizeAvailability(filters.availability)
  const genderType = normalizeGenderType(filters.genderType ?? undefined)
  const familyGroupId = normalizeOptionalString(filters.familyGroupId)
  const location = normalizeOptionalString(filters.location)
  const allocationPriority = normalizeAllocationPriority(
    filters.allocationPriority ?? undefined
  )
  const hasPriority = normalizeBoolean(filters.hasPriority ?? undefined)

  const result = await convexQuery(api.accommodation.getRoomAllocationBoard, {
    eventId,
    hotelId: hotelId ?? undefined,
    roomTypeId: roomTypeId ?? undefined,
    genderType: genderType ?? undefined,
    familyGroupId: familyGroupId ?? undefined,
    location: location ?? undefined,
    allocationPriority: allocationPriority ?? undefined,
    hasPriority: hasPriority ?? undefined,
  })

  let mappedRooms = result.rooms
  if (search) {
    mappedRooms = result.rooms
      .map((room: RoomAllocationBoard["rooms"][number]) => {
        const occupants = search
          ? room.occupants.filter((occupant: (typeof room.occupants)[number]) =>
              attendeeMatchesSearch(occupant, search)
            )
          : room.occupants
        const doesMatchSearch =
          !search ||
          matchesSearch(room.label, search) ||
          matchesSearch(room.hotel?.name ?? null, search) ||
          matchesSearch(room.hotel?.city ?? null, search) ||
          matchesSearch(room.roomType?.label ?? null, search) ||
          occupants.length > 0
        return { ...room, occupants, doesMatchSearch }
      })
      .filter((room: { doesMatchSearch: boolean }) => room.doesMatchSearch)
      .map(
        ({
          doesMatchSearch,
          ...room
        }: {
          doesMatchSearch: boolean
          [key: string]: unknown
        }) => room as (typeof result.rooms)[number]
      )
  }

  if (availability !== "all") {
    mappedRooms = mappedRooms.filter(
      (room: (typeof result.rooms)[number]) =>
        room.availability === availability
    )
  }

  return {
    ...result,
    filters: {
      ...result.filters,
      search,
    },
    rooms: mappedRooms,
  }
}

export async function assignAttendeeToRoom(input: {
  attendeeId: string
  roomId: string
  eventId: string
}) {
  return await convexMutation(api.accommodation.assignAttendeeToRoom, {
    attendeeId: input.attendeeId,
    roomId: input.roomId,
    eventId: input.eventId,
  })
}

export async function unassignAttendeeFromRoom(input: {
  attendeeId: string
  eventId: string
}) {
  const attendeeIdValue = input.attendeeId
  const attendeeId = normalizeOptionalString(attendeeIdValue) ?? ""

  return await convexMutation(api.accommodation.unassignAttendeeFromRoom, {
    attendeeId,
    eventId: input.eventId,
  })
}

export async function generateAllocationProposal(input: {
  eventId: string
}): Promise<AllocationProposal> {
  const eventId = normalizeOptionalString(input.eventId)
  if (!eventId) {
    throw new Error("Invalid eventId: a non-blank event ID is required")
  }

  const board = await getRoomAllocationBoard({ eventId })

  const suggestions: AllocationProposal["suggestions"] = []
  const unplacedAttendees: AllocationProposal["unplacedAttendees"] = []

  // The server already suppresses eligible family children from this queue.
  // Keep the guard here as a second, additive boundary so a stale or mocked
  // payload can never turn a child into an independent proposal candidate.
  const placementUnits = board.unassignedAttendees.filter(
    (attendee) => (attendee.familyRole ?? "solo") !== "child"
  )

  const buyerSuggestionsByAttendeeId = new Map<string, BuyerSuggestion>()
  for (const suggestion of board.buyerSuggestions ?? []) {
    if (suggestion.assignmentIntent !== "assign") continue
    buyerSuggestionsByAttendeeId.set(suggestion.attendeeId, suggestion)
  }

  const availableRooms = board.rooms
    .sort((a, b) => {
      if (a.availability === "available" && b.availability === "empty")
        return -1
      if (a.availability === "empty" && b.availability === "available") return 1
      return a.label.localeCompare(b.label)
    })
    .map<RoomState>((room) => ({
      room,
      remainingBeds: room.availableBeds,
      projectedOccupantCount: room.occupantCount ?? 0,
      projectedGenders: new Set<Exclude<AttendeeGender, null>>(),
      projectedOrderIds: new Set(
        room.occupants.map((occupant) =>
          canonicalOrderKey(occupant.orderId, occupant.attendeeId)
        )
      ),
      projectedOccupantSignatures: new Set(
        room.occupants.flatMap((occupant) =>
          buildPersonSignatures(occupant.attendeeName, occupant.attendeeEmail)
        )
      ),
    }))

  const sortedAttendees = [...placementUnits].sort((a, b) => {
    const aPaymentRank = paymentStateRank(a.paymentState)
    const bPaymentRank = paymentStateRank(b.paymentState)
    if (aPaymentRank !== bPaymentRank) return aPaymentRank - bPaymentRank

    const aPriority = priorityRank(a.allocationPriority)
    const bPriority = priorityRank(b.allocationPriority)
    if (aPriority !== bPriority) return aPriority - bPriority

    const aOrderKey = canonicalOrderKey(a.orderId, a.attendeeId)
    const bOrderKey = canonicalOrderKey(b.orderId, b.attendeeId)
    const aGroupSize =
      (a.familyRole === "parent" ? (a.eligibleChildCount ?? 0) : 0) + 1
    const bGroupSize =
      (b.familyRole === "parent" ? (b.eligibleChildCount ?? 0) : 0) + 1
    if (aGroupSize !== bGroupSize) {
      return bGroupSize - aGroupSize
    }

    const orderComparison = aOrderKey.localeCompare(bOrderKey)
    if (orderComparison !== 0) return orderComparison

    const nameComparison = (a.attendeeName ?? "").localeCompare(
      b.attendeeName ?? ""
    )
    if (nameComparison !== 0) return nameComparison

    return a.attendeeId.localeCompare(b.attendeeId)
  })

  const placeAttendee = (
    attendee: ProposalAttendee,
    preferredRoomId: string | null,
    buyerSuggestionRequested = false
  ) => {
    const priority = attendee.allocationPriority ?? "NORMAL"
    const attendeeGender = normalizeAttendeeGender(attendee.genderType)
    const attendeeRequiresBed = attendee.requiresBed !== false

    const rankedRooms = availableRooms
      .filter(
        (roomState) =>
          !attendeeRequiresBed || roomState.remainingBeds > 0
      )
      .filter((roomState) =>
        isGenderCompatible(attendeeGender, roomState.projectedGenders)
      )
      .map((roomState) => {
        const familyRank = getFamilyCohesionRank(attendee, roomState)
        const genderRank = rankGenderFit(
          attendeeGender,
          roomState.projectedGenders
        )
        const preferredRoommateRank = roommatePreferenceRank(
          attendee,
          roomState
        )
        const availabilityRank =
          roomState.room.availability === "available" ? 1 : 0
        const remainingBedsAfterPlacement =
          roomState.remainingBeds - (attendeeRequiresBed ? 1 : 0)

        return {
          roomState,
          familyRank,
          genderRank,
          preferredRoommateRank,
          availabilityRank,
          remainingBedsAfterPlacement,
        }
      })
      .sort((a, b) => {
        if (a.familyRank !== b.familyRank) return b.familyRank - a.familyRank
        if (a.genderRank !== b.genderRank) return b.genderRank - a.genderRank
        if (a.preferredRoommateRank !== b.preferredRoommateRank) {
          return b.preferredRoommateRank - a.preferredRoommateRank
        }
        if (a.availabilityRank !== b.availabilityRank) {
          return b.availabilityRank - a.availabilityRank
        }
        if (a.remainingBedsAfterPlacement !== b.remainingBedsAfterPlacement) {
          return a.remainingBedsAfterPlacement - b.remainingBedsAfterPlacement
        }
        return a.roomState.room.label.localeCompare(b.roomState.room.label)
      })

    const preferredCandidate = preferredRoomId
      ? rankedRooms.find(
          (candidate) => candidate.roomState.room.id === preferredRoomId
        )
      : null
    const bestCandidate = preferredCandidate ?? rankedRooms[0] ?? null
    const buyerSuggestionHonored =
      buyerSuggestionRequested && Boolean(preferredCandidate)

    if (bestCandidate) {
      const bestRoom = bestCandidate.roomState
      const attendeeOrderKey = canonicalOrderKey(
        attendee.orderId,
        attendee.attendeeId
      )

      if (attendeeRequiresBed) {
        bestRoom.remainingBeds -= 1
      }
      const eligibleChildren =
        attendee.familyRole === "parent" ? attendee.eligibleChildren ?? [] : []
      bestRoom.projectedOccupantCount += 1 + eligibleChildren.length
      bestRoom.projectedGenders.add(attendeeGender)
      bestRoom.projectedOrderIds.add(attendeeOrderKey)
      for (const signature of buildPersonSignatures(
        attendee.attendeeName,
        attendee.attendeeEmail
      )) {
        bestRoom.projectedOccupantSignatures.add(signature)
      }
      for (const child of eligibleChildren) {
        for (const signature of buildPersonSignatures(
          child.attendeeName,
          child.attendeeEmail
        )) {
          bestRoom.projectedOccupantSignatures.add(signature)
        }
      }

      suggestions.push({
        attendeeId: attendee.attendeeId,
        attendeeName: attendee.attendeeName,
        roomId: bestRoom.room.id,
        roomLabel: bestRoom.room.label,
        hotelName: bestRoom.room.hotel?.name ?? "Unknown hotel",
        reason: buildPlacementReason({
          attendee,
          roomState: bestRoom,
          priority,
          familyMatch: bestCandidate.familyRank >= 3,
          genderFitRank: bestCandidate.genderRank,
          buyerSuggestionHonored,
        }),
        priority,
        paymentState: attendee.paymentState ?? null,
        familyRole: attendee.familyRole ?? "solo",
        familyGroupId: attendee.familyGroupId ?? null,
        familyParentAttendeeId: attendee.familyParentAttendeeId ?? null,
        eligibleChildIds: eligibleChildren.map((child) => child.attendeeId),
        eligibleChildCount: eligibleChildren.length,
      })
      return
    }

    const hasAnyBeds = availableRooms.some((roomState) => roomState.remainingBeds > 0)
    unplacedAttendees.push({
      attendeeId: attendee.attendeeId,
      attendeeName: attendee.attendeeName,
      reason: hasAnyBeds
        ? "No compatible rooms available after gender guardrails"
        : "No rooms with available beds",
      priority,
      paymentState: attendee.paymentState ?? null,
    })
  }

  const suggestedAttendees = sortedAttendees.filter((attendee) =>
    buyerSuggestionsByAttendeeId.has(attendee.attendeeId)
  )
  const remainingAttendees = sortedAttendees.filter(
    (attendee) => !buyerSuggestionsByAttendeeId.has(attendee.attendeeId)
  )

  for (const attendee of suggestedAttendees) {
    const suggestion = buyerSuggestionsByAttendeeId.get(attendee.attendeeId)
    placeAttendee(attendee, suggestion?.roomId ?? null, true)
  }

  for (const attendee of remainingAttendees) {
    placeAttendee(attendee, null)
  }

  const familyGroupsKeptTogether = suggestions.filter(
    (suggestion) =>
      suggestion.familyRole === "parent" &&
      (suggestion.eligibleChildCount ?? 0) > 0
  ).length

  return {
    generatedAt: new Date().toISOString(),
    eventId,
    suggestions,
    unplacedAttendees,
    summary: {
      totalSuggested: suggestions.length,
      totalUnplaced: unplacedAttendees.length,
      familyGroupsKeptTogether,
    },
  }
}

export type ConfirmBuyerAssignmentResult =
  | {
      success: true
      assignmentId: string
      attendeeId: string
      slotId: string
      roomId: string
      parentAttendeeId: string
      eligibleChildIds: string[]
      eligibleChildCount: number
      affectedAttendeeCount: number
    }
  | {
      success: false
      error: "ROOM_FULL"
      message: string
      alternatives: Array<{
        slotId: string
        roomId: string
        roomLabel: string
        roomType: string
        capacity: number
        occupantCount: number
        availableSpots: number
      }>
    }

export async function confirmBuyerAssignment(input: {
  assignmentId: string
  slotId?: string | null
}): Promise<ConfirmBuyerAssignmentResult> {
  return await convexMutation(api.accommodation.confirmBuyerAssignment, {
    assignmentId: input.assignmentId as Id<"orderAssignments">,
    slotId: input.slotId
      ? (input.slotId as Id<"accommodationSlots">)
      : undefined,
  })
}

export async function removeBuyerAssignment(input: {
  assignmentId: string
  reason?: string | null
}): Promise<{
  success: boolean
  assignmentId: string
  attendeeId: string
}> {
  return await convexMutation(api.accommodation.removeBuyerAssignment, {
    assignmentId: input.assignmentId as Id<"orderAssignments">,
    reason: input.reason ?? undefined,
  })
}
