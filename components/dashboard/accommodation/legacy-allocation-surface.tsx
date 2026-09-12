"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Users,
  BedDouble,
  Building2,
  X,
  Check,
  CircleCheck,
  CircleAlert,
  CircleDashed,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import type { AccommodationReadPlan } from "@/lib/dashboard/accommodation-read-plan"
import type {
  FamilyChild,
  RoomAllocationBoard,
} from "@/lib/domain/accommodation/assignments"
import {
  useRoomAllocationBoard,
  useAssignAttendeeToRoom,
  useUnassignAttendeeFromRoom,
} from "@/lib/convex/hooks/accommodation"
import {
  getRoomPageForRoomId,
  readAllocationFiltersFromSearchParams,
  syncAllocationFiltersToSearchParams,
  type AllocationFilterState,
} from "@/app/dashboard/accommodation/filter-state"

// ---------------------------------------------------------------------------
// Phase 44: server-owned payment state presentation. The browser NEVER
// derives paid/partial/unpaid from amounts and never reads order status; it
// only labels and styles the typed paymentState the board returned.
// ---------------------------------------------------------------------------

type PaymentState = "paid" | "partial" | "unpaid" | null | undefined

const PAYMENT_LABEL: Record<"paid" | "partial" | "unpaid", string> = {
  paid: "Paid",
  partial: "Partially paid",
  unpaid: "Unpaid",
}

const PAYMENT_ICON: Record<"paid" | "partial" | "unpaid", typeof CircleCheck> = {
  paid: CircleCheck,
  partial: CircleAlert,
  unpaid: CircleDashed,
}

const PAYMENT_TREATMENT: Record<"paid" | "partial" | "unpaid", string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300",
  unpaid:
    "border-border/60 bg-muted/40 text-muted-foreground dark:text-muted-foreground",
}

function isKnownPaymentState(
  state: PaymentState
): state is "paid" | "partial" | "unpaid" {
  return state === "paid" || state === "partial" || state === "unpaid"
}

/** Non-interactive, text-plus-icon payment badge (color is supplemental). */
function PaymentBadge({ state }: { state: PaymentState }) {
  if (!isKnownPaymentState(state)) {
    return null
  }
  const Icon = PAYMENT_ICON[state]
  return (
    <span
      aria-label={`Payment status: ${PAYMENT_LABEL[state]}`}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${PAYMENT_TREATMENT[state]}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {PAYMENT_LABEL[state]}
    </span>
  )
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

// ---------------------------------------------------------------------------
// Quick task 260807-uel: buyer accommodation preferences are rendered from the
// board's server payload fields only (occupancy, nightBeforeLevel, optionKeys,
// categoryLabel). No client money arithmetic, no vocabulary de-enum.
// ---------------------------------------------------------------------------

const OCCUPANCY_LABEL: Record<"single" | "shared" | "family", string> = {
  single: "Single",
  shared: "Shared",
  family: "Family",
}

function isKnownOccupancy(
  occupancy: unknown
): occupancy is "single" | "shared" | "family" {
  return (
    occupancy === "single" ||
    occupancy === "shared" ||
    occupancy === "family"
  )
}

/** Occupancy chip shown beside unassigned attendees and assigned occupants. */
function OccupancyChip({ occupancy }: { occupancy: unknown }) {
  if (!isKnownOccupancy(occupancy)) {
    return null
  }
  return (
    <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {OCCUPANCY_LABEL[occupancy]}
    </span>
  )
}

/**
 * The board's server-payload accommodation preference fields consumed by the
 * chips below. Everything renders from these typed fields only.
 */
type AccommodationPreferenceFields = Pick<
  RoomAllocationBoard["unassignedAttendees"][number],
  "occupancy" | "nightBeforeLevel" | "categoryLabel" | "optionKeys"
>

/**
 * Server-driven accommodation preference chips for unassigned inbox rows.
 * Reads only `occupancy`, `categoryLabel`, `optionKeys`, and
 * `nightBeforeLevel` from the board payload.
 */
function AccommodationPreferenceChips({
  attendee,
}: {
  attendee: AccommodationPreferenceFields
}) {
  const rawOptionKeys = attendee?.optionKeys
  const optionKeys: string[] = Array.isArray(rawOptionKeys)
    ? rawOptionKeys
    : []
  return (
    <>
      <OccupancyChip occupancy={attendee?.occupancy} />
      {attendee?.categoryLabel && (
        <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
          {attendee.categoryLabel}
        </span>
      )}
      {optionKeys.includes("superior_upgrade") && (
        <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-violet-300">
          Superior upgrade
        </span>
      )}
      {optionKeys.includes("cot") && (
        <span className="rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-300">
          Cot
        </span>
      )}
      {attendee?.nightBeforeLevel === "superior" && (
        <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-violet-300">
          Night before · Superior
        </span>
      )}
      {attendee?.nightBeforeLevel === "standard" && (
        <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Night before · Standard
        </span>
      )}
    </>
  )
}

export type AccommodationBoard = RoomAllocationBoard
type AllocationRoom = RoomAllocationBoard["rooms"][number]
type AllocationAttendee = RoomAllocationBoard["unassignedAttendees"][number]
type AllocationOccupant = AllocationRoom["occupants"][number]
type RoomFamilyChild = Pick<FamilyChild, "attendeeId" | "attendeeName">

type RoomOccupantBlock =
  | {
      kind: "family"
      parent: AllocationOccupant
      children: RoomFamilyChild[]
    }
  | { kind: "occupant"; occupant: AllocationOccupant }

function getRoomOccupantBlocks(room: AllocationRoom): RoomOccupantBlock[] {
  const occupants = room.occupants ?? []
  const included = new Set<string>()
  const blocks: RoomOccupantBlock[] = []

  for (const occupant of occupants) {
    if (included.has(occupant.attendeeId)) continue

    if (occupant.familyRole === "parent" && occupant.familyGroupId) {
      const visibleChildren = occupants.filter(
        (candidate) =>
          candidate.familyRole === "child" &&
          candidate.familyGroupId === occupant.familyGroupId &&
          candidate.familyParentAttendeeId === occupant.attendeeId
      )
      const children =
        occupant.familyState === "placed" && occupant.eligibleChildren
          ? occupant.eligibleChildren.map(({ attendeeId, attendeeName }) => ({
              attendeeId,
              attendeeName,
            }))
          : visibleChildren.map(({ attendeeId, attendeeName }) => ({
              attendeeId,
              attendeeName,
            }))
      included.add(occupant.attendeeId)
      visibleChildren.forEach((child) => included.add(child.attendeeId))
      blocks.push({ kind: "family", parent: occupant, children })
      continue
    }

    if (occupant.familyRole === "child" && occupant.familyGroupId) {
      const parent = occupants.find(
        (candidate) =>
          candidate.familyRole === "parent" &&
          candidate.familyGroupId === occupant.familyGroupId &&
          candidate.attendeeId === occupant.familyParentAttendeeId
      )
      if (parent && !included.has(parent.attendeeId)) continue
    }

    included.add(occupant.attendeeId)
    blocks.push({ kind: "occupant", occupant })
  }

  return blocks
}

type RemovalTarget = {
  attendeeId: string
  parentName: string
  roomId: string
  roomLabel: string
  eligibleChildCount: number
}

type AtomicFamilyResult = {
  eligibleChildCount?: number
  affectedAttendeeCount?: number
  roomId?: string
}

export default function EventAllocationPage({
  params,
  roomId: roomIntentProp,
  event,
  parentBoard,
  readPlan,
}: {
  params: Promise<{ slug: string }>
  roomId?: string
  event: EventDashboardEvent
  parentBoard: AttentionQueryState<AccommodationBoard>
  readPlan: AccommodationReadPlan
}) {
  const { slug } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = useMemo(
    () => readAllocationFiltersFromSearchParams(searchParams),
    [searchParams]
  )
  const roomIntent = roomIntentProp?.trim() || searchParams.get("roomId")?.trim() || null
  const activeReadPlan = readPlan
  const boardArgs = useMemo(() => {
    return {
      eventId: event._id,
      ...(filters.hotelId ? { hotelId: filters.hotelId } : {}),
      ...(filters.roomTypeId ? { roomTypeId: filters.roomTypeId } : {}),
      ...(filters.genderType ? { genderType: filters.genderType } : {}),
      ...(filters.familyGroupId ? { familyGroupId: filters.familyGroupId } : {}),
      ...(filters.location ? { location: filters.location } : {}),
      ...(filters.allocationPriority
        ? { allocationPriority: filters.allocationPriority }
        : {}),
      ...(filters.hasPriority !== null ? { hasPriority: filters.hasPriority } : {}),
    }
  }, [event._id, filters])
  const ownBoard = useRoomAllocationBoard(
    boardArgs,
    activeReadPlan.readDetailBoard
  ) as AccommodationBoard | undefined
  const boardState = activeReadPlan.reuseParentBoard
    ? parentBoard
    : ownBoard === undefined
      ? { status: "pending" as const }
      : { status: "ready" as const, data: ownBoard }
  const board = boardState.status === "ready" ? boardState.data : undefined
  const assignAttendee = useAssignAttendeeToRoom()
  const unassignAttendee = useUnassignAttendeeFromRoom()

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [removalTarget, setRemovalTarget] = useState<RemovalTarget | null>(null)
  const [roomPage, setRoomPage] = useState(1)
  const roomsPerPage = 12

  const rooms = useMemo<AllocationRoom[]>(() => board?.rooms ?? [], [board])
  const hotels = useMemo(() => board?.hotels ?? [], [board])
  const unassigned = useMemo<AllocationAttendee[]>(
    () => board?.unassignedAttendees ?? [],
    [board]
  )
  const familyFollowUps = useMemo(
    () => board?.familyFollowUps ?? [],
    [board]
  )
  const hasActiveFilters = Object.values(filters).some((value) => value !== null)
  const summary = board?.summary

  useEffect(() => {
    if (!board || !roomIntent) return

    const nextPage = getRoomPageForRoomId(
      rooms.map((room) => room.id),
      roomIntent,
      roomsPerPage
    )

    if (nextPage === null) {
      setSelectedRoomId(null)
      return
    }

    setSelectedRoomId(roomIntent)
    setRoomPage(nextPage)
  }, [board, roomIntent, rooms])

  const roomIntentUnavailable = Boolean(
    board && roomIntent && !rooms.some((room) => room.id === roomIntent)
  )

  function updateFilter<K extends keyof AllocationFilterState>(
    key: K,
    value: AllocationFilterState[K]
  ) {
    const nextFilters = { ...filters, [key]: value } as AllocationFilterState
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("tab", "allocation")
    syncAllocationFiltersToSearchParams(nextParams, nextFilters)
    nextParams.delete("roomId")
    setRoomPage(1)
    setSelectedRoomId(null)
    router.replace(`?${nextParams.toString()}`, { scroll: false })
  }

  function clearFilters() {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set("tab", "allocation")
    syncAllocationFiltersToSearchParams(nextParams, {
      hotelId: null,
      roomTypeId: null,
      genderType: null,
      familyGroupId: null,
      location: null,
      allocationPriority: null,
      hasPriority: null,
    })
    nextParams.delete("roomId")
    setRoomPage(1)
    setSelectedRoomId(null)
    router.replace(`?${nextParams.toString()}`, { scroll: false })
  }

  function isFamilyAttendee(attendee: AllocationAttendee) {
    return attendee.familyRole === "parent"
  }

  function atomicErrorMessage(error: unknown) {
    const reason = errorMessage(error, "the server rejected the placement.")
    return `Family placement could not be completed. No changes were applied. Review the selected room and family data, then try again. ${reason}`
  }

  function placementSuccessMessage(
    attendee: AllocationAttendee,
    roomLabel: string,
    result: unknown,
    action: "placed" | "moved"
  ) {
    const family = isFamilyAttendee(attendee)
    if (!family) return "Attendee assigned to room."
    const childCount =
      typeof (result as AtomicFamilyResult | null)?.eligibleChildCount === "number"
        ? (result as AtomicFamilyResult).eligibleChildCount!
        : attendee.eligibleChildCount ?? 0
    if (childCount === 0) {
      return `Family ${action} in ${roomLabel}. ${attendee.attendeeName ?? "Parent"}. No eligible children were moved.`
    }
    return `Family ${action} in ${roomLabel}. ${attendee.attendeeName ?? "Parent"} and ${childCount} linked ${childCount === 1 ? "child" : "children"} now share the same room.`
  }

  async function handleAssign(
    attendee: AllocationAttendee,
    action: "assign" | "move" = "assign"
  ) {
    if (!selectedRoomId) {
      setError("Select a room first by clicking on it.")
      return
    }
    setError(null)
    setSuccess(null)
    setPendingAction(`${action}:${attendee.attendeeId}`)
    try {
      const result = await assignAttendee({
        attendeeId: attendee.attendeeId,
        roomId: selectedRoomId,
        eventId: event._id,
      })
      const selectedRoom = rooms.find((room) => room.id === selectedRoomId)
      setSuccess(
        placementSuccessMessage(
          attendee,
          selectedRoom?.label ?? "the selected room",
          result,
          action === "move" ? "moved" : "placed"
        )
      )
      setSelectedRoomId(null)
    } catch (error: unknown) {
      setError(
        isFamilyAttendee(attendee)
          ? atomicErrorMessage(error)
          : errorMessage(error, "Failed to assign attendee.")
      )
    } finally {
      setPendingAction(null)
    }
  }

  function findCompatibleRoom(attendee: AllocationAttendee) {
    setError(null)
    setSuccess(null)
    const recommendation = attendee.compatibility
    const recommendedRoom = recommendation?.recommendedRoomId
      ? rooms.find((room) => room.id === recommendation.recommendedRoomId)
      : null
    if (!recommendedRoom) {
      setError(
        recommendation?.status === "no_match"
          ? "No compatible available room was found."
          : "Compatibility is unavailable for this attendee."
      )
      return
    }
    const nextPage = getRoomPageForRoomId(
      rooms.map((room) => room.id),
      recommendedRoom.id,
      roomsPerPage
    )
    if (nextPage === null) {
      setError("The compatible room is hidden by the current filters.")
      return
    }
    setRoomPage(nextPage)
    setSelectedRoomId(recommendedRoom.id)
    setSuccess(
      isFamilyAttendee(attendee)
        ? `Compatible room found: ${recommendedRoom.label}. Review family placement, then choose Assign family to selected room.`
        : `Compatible room found: ${recommendedRoom.label}. Review it, then choose Assign to selected room.`
    )
  }

  function openFamilyRemoval(target: RemovalTarget) {
    setError(null)
    setSuccess(null)
    setRemovalTarget(target)
  }

  function removalSuccessMessage(target: RemovalTarget, result: unknown) {
    const childCount =
      typeof (result as AtomicFamilyResult | null)?.eligibleChildCount === "number"
        ? (result as AtomicFamilyResult).eligibleChildCount!
        : target.eligibleChildCount
    if (childCount === 0) {
      return `Family placement removed from ${target.roomLabel}. ${target.parentName} is no longer assigned; no linked children were assigned.`
    }
    return `Family placement removed from ${target.roomLabel}. ${target.parentName} and ${childCount} linked ${childCount === 1 ? "child" : "children"} are no longer assigned.`
  }

  async function handleUnassign(
    attendeeId: string,
    familyTarget?: RemovalTarget
  ) {
    setError(null)
    setSuccess(null)
    setPendingAction(`unassign:${attendeeId}`)
    try {
      const result = await unassignAttendee({ attendeeId, eventId: event._id })
      setSuccess(
        familyTarget
          ? removalSuccessMessage(familyTarget, result)
          : "Attendee removed from room."
      )
      if (familyTarget) setRemovalTarget(null)
    } catch (error: unknown) {
      setError(
        familyTarget
          ? atomicErrorMessage(error)
          : errorMessage(error, "Failed to unassign attendee.")
      )
    } finally {
      setPendingAction(null)
    }
  }

  if (!event.accommodationEnabled) {
    return (
      <div className="space-y-6">
        <Link href={`/dashboard/events/${slug}/settings`} className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Go to Settings
        </Link>
        <DashboardQueryState state="disabled" title="Accommodation disabled" message="Enable accommodation in event settings before managing allocation." className="rounded-xl border border-dashed p-12 text-center" />
      </div>
    )
  }

  if (boardState.status === "pending") {
    return (
      <DashboardQueryState state="loading" className="rounded-xl border border-border/60 bg-card p-6" />
    )
  }

  if (boardState.status === "error") {
    return <DashboardQueryState state="error" message={boardState.message} className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" />
  }

  if (board === undefined) {
    return <DashboardQueryState state="unavailable" message="The allocation board is unavailable." className="rounded-xl border border-border/60 bg-card p-6" />
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
        <div className="min-w-0">
          <p className="font-semibold">Manual allocation</p>
          <p className="text-xs text-muted-foreground">Review server-owned context, preview a compatible room, then assign deliberately.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Payment priority: paid first · partially paid · unpaid
          </p>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{summary.totalRooms} rooms</span>
            <span>{summary.totalOccupants ?? 0} occupants</span>
            <span>{summary.occupiedBeds} beds used</span>
            <span>{summary.availableBeds} available beds</span>
            <span className="font-semibold text-foreground">{summary.unassignedAttendeesCount} need placement</span>
          </div>
        )}
      </div>
      {error && (
        <div role="alert" aria-live="assertive" className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive">{error}</div>
      )}
      {success && (
        <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{success}</div>
      )}

      <section aria-labelledby="allocation-filters" className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="allocation-filters" className="text-sm font-semibold">Allocation filters</h2>
            <p className="mt-1 text-xs text-muted-foreground">Filter the board without changing room capacity data.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
            Clear filters
          </Button>
        </div>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 text-xs font-medium">
            <span>Hotel</span>
            <select
              aria-label="Filter by hotel"
              value={filters.hotelId ?? ""}
              onChange={(event) => updateFilter("hotelId", event.target.value || null)}
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="">All hotels</option>
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Room type</span>
            <select
              aria-label="Filter by room type"
              value={filters.roomTypeId ?? ""}
              onChange={(event) => updateFilter("roomTypeId", event.target.value || null)}
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="">All room types</option>
              {(board?.roomTypes ?? []).map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Gender</span>
            <select
              aria-label="Filter by gender"
              value={filters.genderType ?? ""}
              onChange={(event) => updateFilter("genderType", (event.target.value || null) as AllocationFilterState["genderType"])}
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="">All genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="MIXED">Mixed</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Allocation priority</span>
            <select
              aria-label="Filter by allocation priority"
              value={filters.allocationPriority ?? ""}
              onChange={(event) => updateFilter("allocationPriority", (event.target.value || null) as AllocationFilterState["allocationPriority"])}
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="">All priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Priority present</span>
            <select
              aria-label="Filter by priority presence"
              value={filters.hasPriority === null ? "" : String(filters.hasPriority)}
              onChange={(event) => updateFilter("hasPriority", event.target.value === "" ? null : event.target.value === "true")}
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            >
              <option value="">Any priority state</option>
              <option value="true">Has priority</option>
              <option value="false">No priority</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            <span>Family group</span>
            <input
              aria-label="Filter by family group"
              value={filters.familyGroupId ?? ""}
              onChange={(event) => updateFilter("familyGroupId", event.target.value || null)}
              placeholder="Family group ID"
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium sm:col-span-2">
            <span>Location</span>
            <input
              aria-label="Filter by location"
              value={filters.location ?? ""}
              onChange={(event) => updateFilter("location", event.target.value || null)}
              placeholder="Location"
              className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
            />
          </label>
        </div>
      </section>

      {roomIntentUnavailable && (
        <div role="status" className="rounded-xl border border-amber-300/70 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
          Room <span className="font-mono">{roomIntent}</span> is not available in this event or is hidden by the current filters.
        </div>
      )}

      {selectedRoomId && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-3 text-sm text-primary">
          Room selected. Review the family, then choose Assign family to selected room.
          <Button variant="ghost" size="sm" onClick={() => setSelectedRoomId(null)} className="ml-3 h-6 text-xs">
            Clear selection
          </Button>
        </div>
      )}

       <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
         <div className="flex h-[700px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-none">
           <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Needs Placement</h3>
              <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                 {summary?.unassignedAttendeesCount ?? 0} {summary?.unassignedAttendeesCount === 1 ? "placement unit needs action" : "placement units need action"}
              </p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
          </div>
          <p className="border-b border-border/40 px-5 py-2 text-[11px] leading-snug text-muted-foreground">
            Confirming an assignment confirms this buyer's accommodation configuration and closes further buyer changes.
          </p>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
             {familyFollowUps.length > 0 && (
               <section aria-labelledby="family-follow-up" className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                 <h4 id="family-follow-up" className="font-semibold text-amber-900 dark:text-amber-200">Family follow-up</h4>
                 <div className="mt-2 space-y-2">
                   {familyFollowUps.map((followUp) => (
                     <div key={`${followUp.state}:${followUp.attendeeId}`} className="rounded-lg border border-amber-300/50 bg-background/70 p-2 dark:border-amber-900/50">
                       <p className="font-semibold text-amber-900 dark:text-amber-200">{followUp.state}</p>
                       <p className="break-words text-xs text-amber-800 dark:text-amber-300">{followUp.message}</p>
                       <p className="mt-1 break-words text-xs text-muted-foreground">{followUp.attendeeName ?? "Unnamed attendee"}</p>
                     </div>
                   ))}
                 </div>
               </section>
             )}
             {unassigned.length === 0 ? (
               hotels.length === 0 || rooms.length === 0 ? (
                  <DashboardQueryState state="unconfigured" message="Configure a hotel and usable rooms before placing attendees." className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8" />
                 ) : hasActiveFilters ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-sm">
                    <p className="font-semibold">No attendees match the current filters.</p>
                    <p className="text-muted-foreground">Clear filters to view all attendees needing placement.</p>
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters} className="mt-2 min-h-11">Clear filters</Button>
                  </div>
                 ) : familyFollowUps.length > 0 ? (
                   <div className="space-y-2 rounded-xl border border-dashed border-amber-300/60 bg-amber-50/40 p-8 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                     <p className="font-semibold">Placement queue clear; family follow-up needed.</p>
                     <p className="text-muted-foreground">Review Needs family link and Waiting for parent room items before closing allocation.</p>
                   </div>
                 ) : (
                  <DashboardQueryState state="empty" title="All attendees have been placed." message="No unresolved attendees need placement. Open Allocation to review room assignments." className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8" />
               )
            ) : (
                unassigned.map((attendee) => {
                  const familyChildren =
                    attendee.familyRole === "parent"
                      ? attendee.eligibleChildren ?? []
                      : []
                  const isFamily = isFamilyAttendee(attendee)
                  const isBlockedChild = attendee.familyRole === "child"
                  const childCount = attendee.eligibleChildCount ?? 0
                  return (
                    <div
                      key={attendee.attendeeId}
                      role={isFamily ? "group" : undefined}
                      aria-label={isFamily ? `Family placement led by ${attendee.attendeeName ?? "unnamed parent"}` : undefined}
                      className={`flex min-w-0 flex-col rounded-xl border p-3 transition-colors ${
                        isBlockedChild
                          ? "border-amber-300/60 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20"
                          : "border-border/60 bg-card hover:border-primary/30"
                      }`}
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          {isFamily && <p className="text-xs font-semibold text-primary">Family placement</p>}
                          <p className="break-words text-sm font-semibold">
                            {isFamily ? "Parent · " : isBlockedChild ? "Child · " : ""}
                            {attendee.attendeeName ?? "Unnamed"}
                          </p>
                        </div>
                        {!isBlockedChild && (
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Button type="button" size="sm" variant="outline" disabled={pendingAction !== null} aria-label={`Find compatible room for ${attendee.attendeeName ?? "attendee"}`} className="min-h-11 h-auto whitespace-normal text-[11px]" onClick={() => findCompatibleRoom(attendee)}>
                              Find compatible room
                            </Button>
                            <Button type="button" size="sm" disabled={!selectedRoomId || pendingAction !== null} aria-label={`${isFamily ? "Assign family led by" : "Assign"} ${attendee.attendeeName ?? "attendee"} to selected room`} className="min-h-11 h-auto whitespace-normal text-[11px]" onClick={() => handleAssign(attendee)}>
                              {pendingAction === `assign:${attendee.attendeeId}` ? isFamily ? "Assigning family…" : "Assigning…" : isFamily ? "Assign family to selected room" : "Assign to selected room"}
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <PaymentBadge state={attendee.paymentState} />
                        {attendee.allocationPriority && <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold">{attendee.allocationPriority.charAt(0) + attendee.allocationPriority.slice(1).toLowerCase()}</span>}
                        {isFamily && <span className="rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{attendee.familyLabel ?? "Family"}</span>}
                        <AccommodationPreferenceChips attendee={attendee} />
                      </div>
                      {isFamily && childCount > 0 && (
                        <ul className="mt-3 space-y-1 border-l-2 border-primary/20 pl-3 text-xs" aria-label={`Eligible children for ${attendee.attendeeName ?? "parent"}`}>
                          {familyChildren.map((child) => (
                            <li key={child.attendeeId} className="break-words text-muted-foreground">
                              <span className="font-semibold text-foreground">Child · {child.attendeeName ?? "Unnamed"}</span>
                              <span className="ml-1">No bed required · follows parent</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {isFamily && (attendee.separateMemberCount ?? 0) > 0 && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Some family members require separate placement.</p>
                      )}
                      {isBlockedChild && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Parent placement required — Select the parent anchor; children cannot be placed directly.</p>
                      )}
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>Order: {attendee.bookingRef || attendee.orderId || "Unavailable"}</p>
                        {attendee.bookerName && <p>Booker: {attendee.bookerName}</p>}
                        {attendee.location && <p>Location: {attendee.location}</p>}
                        {attendee.roommatePreference && <p>Roommate preference: {attendee.roommatePreference}</p>}
                        {attendee.roommateAvoid && <p>Roommate avoidance: {attendee.roommateAvoid}</p>}
                        {(attendee.roommatePreference || attendee.roommateAvoid) && <p className="font-semibold text-muted-foreground">Advisory only</p>}
                        <p>Compatibility: {attendee.compatibility?.summary ?? "Compatibility unavailable"}</p>
                      </div>
                      {isFamily && (
                        <p className="mt-2 text-xs text-muted-foreground">Confirming this placement confirms the buyer&apos;s accommodation configuration and closes further buyer changes.</p>
                      )}
                    </div>
                  )
                })
            )}
          </div>
        </div>

         <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Room capacity</h3>
              <p className="text-xs font-medium text-muted-foreground">{rooms.length} rooms · {summary?.availableBeds ?? 0} beds available</p>
            </div>
            {rooms.length > roomsPerPage && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={roomPage <= 1}
                  aria-label="Previous room page"
                  onClick={() => setRoomPage((p) => p - 1)}
                  className="h-8 rounded-lg border-white/20 text-xs"
                >
                   <ChevronLeft className="size-3.5" aria-hidden="true" />
                </Button>
                <span className="text-xs font-medium text-muted-foreground">
                  {roomPage} / {Math.ceil(rooms.length / roomsPerPage)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={roomPage >= Math.ceil(rooms.length / roomsPerPage)}
                  aria-label="Next room page"
                  onClick={() => setRoomPage((p) => p + 1)}
                  className="h-8 rounded-lg border-white/20 text-xs"
                >
                   <ChevronRight className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>

           {rooms.length === 0 ? (
             <DashboardQueryState state="unconfigured" title="No rooms found" message="Add room inventory before using allocation." className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                 {rooms.slice((roomPage - 1) * roomsPerPage, roomPage * roomsPerPage).map((room) => {
                    const isSelected = selectedRoomId === room.id
                    const isFull = room.availability === "full"
                    const isEmpty = room.availability === "empty"
                    const occupantBlocks = getRoomOccupantBlocks(room)
                   return (
                    <div
                      key={room.id}
                      className={`rounded-2xl border p-4 shadow-sm transition-all ${
                        isSelected
                          ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
                          : "border-border/60 bg-card hover:border-primary/30"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`${isSelected ? "Deselect room" : "Select a room"} ${room.label}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedRoomId(isSelected ? null : room.id)}
                        className="min-h-11 w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{room.label}</p>
                            <Badge
                              aria-label={`Room status: ${isFull ? "full" : isEmpty ? "empty" : "available"}; ${room.occupantCount ?? 0} occupants; ${room.occupiedBeds} beds used; ${room.availableBeds} beds available`}
                             variant="outline"
                            className={
                              isFull
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
                                : isEmpty
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400"
                            }
                          >
                             {room.occupantCount ?? 0} occupants
                           </Badge>
                        </div>
                        {room.hotel && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60">
                             <Building2 className="size-3" aria-hidden="true" />
                            {room.hotel.name}
                          </p>
                        )}
                        {room.roomType && <p className="mt-0.5 text-xs text-muted-foreground">{room.roomType.label}</p>}
                         <p className="mt-2 text-xs font-medium text-foreground">
                           {room.occupantCount ?? 0} occupants · {room.occupiedBeds} beds used · {room.availableBeds} beds available
                         </p>
                         {room.foreignOccupantCount ? (
                           <p className="text-xs text-muted-foreground">
                             {room.foreignOccupantCount} occupant{room.foreignOccupantCount === 1 ? "" : "s"} from another event · identity hidden
                           </p>
                         ) : null}
                         {room.occupancyIncomplete ? (
                           <p className="text-xs text-amber-700 dark:text-amber-300">
                             Occupancy data is incomplete; verify before assigning.
                           </p>
                         ) : null}
                        {isSelected && (
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                            <Check className="size-3" /> Selected
                          </div>
                        )}
                        {room.mixedCategoryGroup && <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><CircleAlert className="size-3" aria-hidden="true" />Mixed category group</p>}
                      </button>
                        {occupantBlocks.length > 0 && (
                          <div className="mt-3 space-y-1 border-t border-border/30 pt-3">
                            {occupantBlocks.map((block) => {
                              if (block.kind === "family") {
                                const parent = block.parent
                                const familyChildCount = parent.eligibleChildCount ?? 0
                                const moveAvailable = Boolean(
                                  selectedRoomId && selectedRoomId !== room.id
                                )
                                return (
                                  <div key={`family:${parent.attendeeId}`} role="group" aria-label={`Family placement led by ${parent.attendeeName ?? "unnamed parent"}`} className="rounded-lg border border-primary/15 bg-primary/[0.03] p-2">
                                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-semibold text-primary">Family placement{parent.familyLabel ? ` · ${parent.familyLabel}` : ""}</p>
                                        <p className="break-words text-xs font-semibold">Parent · {parent.attendeeName ?? "Unnamed"}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                          <PaymentBadge state={parent.paymentState} />
                                          <OccupancyChip occupancy={parent.occupancy} />
                                          {parent.requiresBed === false ? <span className="text-[10px] text-sky-700 dark:text-sky-300">No bed required</span> : <span className="text-[10px] text-muted-foreground">Bed required</span>}
                                          {parent.nightBeforeMismatch && <span className="text-[10px] text-amber-700 dark:text-amber-300">Night-before mismatch</span>}
                                        </div>
                                      </div>
                                      <div className="flex min-w-0 flex-wrap gap-1">
                                        {moveAvailable && (
                                          <Button type="button" size="sm" variant="outline" disabled={pendingAction !== null} aria-busy={pendingAction === `move:${parent.attendeeId}`} aria-label={`Move family led by ${parent.attendeeName ?? "parent"} to selected room`} className="min-h-11 h-auto whitespace-normal text-[11px]" onClick={() => handleAssign({ ...parent, familyRole: "parent", eligibleChildCount: familyChildCount } as AllocationAttendee, "move")}>
                                            {pendingAction === `move:${parent.attendeeId}` ? "Moving family…" : "Move family to selected room"}
                                          </Button>
                                        )}
                                        <Button type="button" size="sm" variant="ghost" disabled={pendingAction !== null} aria-label={`Remove family placement led by ${parent.attendeeName ?? "parent"} from ${room.label}`} aria-busy={pendingAction === `unassign:${parent.attendeeId}`} className="min-h-11 h-auto whitespace-normal text-[11px] text-destructive hover:bg-destructive/10" onClick={() => openFamilyRemoval({ attendeeId: parent.attendeeId, parentName: parent.attendeeName ?? "Unnamed parent", roomId: room.id, roomLabel: room.label, eligibleChildCount: familyChildCount })}>
                                          {pendingAction === `unassign:${parent.attendeeId}` ? "Removing family placement…" : "Remove family placement"}
                                        </Button>
                                      </div>
                                    </div>
                                    {block.children.length > 0 && (
                                      <details open className="mt-2 border-l-2 border-primary/20 pl-3">
                                        <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                          Show family members for {parent.attendeeName ?? "parent"}; {familyChildCount} {familyChildCount === 1 ? "child" : "children"}
                                        </summary>
                                        <ul className="space-y-1 pb-1">
                                          {block.children.map((child) => (
                                            <li key={child.attendeeId} className="break-words text-xs text-muted-foreground">
                                              <span className="font-semibold text-foreground">Child · {child.attendeeName ?? "Unnamed"}</span>
                                              <span className="ml-1">No bed required · follows parent</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </details>
                                    )}
                                  </div>
                                )
                              }

                              const occ = block.occupant
                              const isChild = occ.familyRole === "child"
                              return (
                                <div key={occ.attendeeId} className="group/occ flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1">
                                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                    <span className="break-words text-xs text-muted-foreground">{isChild ? "Child · " : ""}{occ.attendeeName ?? "Unnamed"}</span>
                                    <PaymentBadge state={occ.paymentState} />
                                    <OccupancyChip occupancy={occ.occupancy} />
                                    {isChild ? <span className="text-[10px] text-sky-700 dark:text-sky-300">No bed required · follows parent</span> : occ.requiresBed === false ? <span className="text-[10px] text-sky-700 dark:text-sky-300">No bed required</span> : occ.requiresBed === true ? <span className="text-[10px] text-muted-foreground">Bed required</span> : null}
                                    {occ.nightBeforeMismatch && <span className="text-[10px] text-amber-700 dark:text-amber-300">Night-before mismatch</span>}
                                  </span>
                                  {!isChild && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleUnassign(occ.attendeeId) }}
                                      aria-label={pendingAction === `unassign:${occ.attendeeId}` ? `Unassigning ${occ.attendeeName ?? "unnamed attendee"} from ${room.label}` : `Unassign ${occ.attendeeName ?? "unnamed attendee"} from ${room.label}`}
                                      aria-busy={pendingAction === `unassign:${occ.attendeeId}`}
                                      disabled={pendingAction !== null}
                                      className="min-h-11 min-w-11 shrink-0 rounded p-2 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                    >
                                      {pendingAction === `unassign:${occ.attendeeId}` ? "Unassigning…" : <X className="size-3" aria-hidden="true" />}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
         </div>
       </div>
       <Dialog
         open={removalTarget !== null}
         onOpenChange={(open) => {
           if (!open && pendingAction === null) setRemovalTarget(null)
         }}
       >
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Remove family placement?</DialogTitle>
             <DialogDescription>
               {removalTarget
                 ? `This removes ${removalTarget.parentName} and ${removalTarget.eligibleChildCount} linked ${removalTarget.eligibleChildCount === 1 ? "child" : "children"} from ${removalTarget.roomLabel}. No family member will remain assigned to that room.`
                 : "Review this family placement before removing it."}
             </DialogDescription>
           </DialogHeader>
           <DialogFooter>
             <DialogClose asChild>
               <Button type="button" variant="outline" disabled={pendingAction !== null}>Keep placement</Button>
             </DialogClose>
             {removalTarget && (
               <Button
                 type="button"
                 variant="destructive"
                 disabled={pendingAction !== null}
                 aria-busy={pendingAction === `unassign:${removalTarget.attendeeId}`}
                 onClick={() => handleUnassign(removalTarget.attendeeId, removalTarget)}
               >
                 {pendingAction === `unassign:${removalTarget.attendeeId}` ? "Removing family placement…" : "Remove family placement"}
               </Button>
             )}
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
  )
}
