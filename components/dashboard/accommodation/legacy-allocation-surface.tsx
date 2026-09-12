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
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import type { AccommodationReadPlan } from "@/lib/dashboard/accommodation-read-plan"
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
type AccommodationPreferenceFields = {
  occupancy?: "single" | "shared" | "family" | null
  nightBeforeLevel?: "standard" | "superior" | null
  categoryLabel?: string | null
  optionKeys?: string[] | null
}

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

export type AccommodationBoard = {
  hotels: ReadonlyArray<unknown>
  rooms: ReadonlyArray<unknown>
  unassignedAttendees: ReadonlyArray<unknown>
  roomTypes?: ReadonlyArray<unknown>
  summary: {
    totalRooms: number
    totalBeds: number
    occupiedBeds: number
    availableBeds: number
    unassignedAttendeesCount: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
  }
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
  const [roomPage, setRoomPage] = useState(1)
  const roomsPerPage = 12

  const rooms = useMemo(() => (board?.rooms as any[]) ?? [], [board])
  const hotels = useMemo(() => (board?.hotels as any[]) ?? [], [board])
  const unassigned = useMemo(() => (board?.unassignedAttendees as any[]) ?? [], [board])
  const hasActiveFilters = Object.values(filters).some((value) => value !== null)
  const summary = board?.summary as
    | {
        totalRooms: number
        totalBeds: number
        occupiedBeds: number
        availableBeds: number
        unassignedAttendeesCount: number
        emptyRooms: number
        availableRooms: number
        fullRooms: number
      }
    | undefined

  useEffect(() => {
    if (!board || !roomIntent) return

    const nextPage = getRoomPageForRoomId(
      rooms.map((room: any) => room.id),
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
    board && roomIntent && !rooms.some((room: any) => room.id === roomIntent)
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

  function getGroup(attendee: any) {
    const roomTypeId = attendee.allocatedRoomTypeId ?? null
    if (!attendee.orderId || !roomTypeId) return [attendee]
    return unassigned.filter(
      (a: any) =>
        a.orderId === attendee.orderId &&
        (a.allocatedRoomTypeId ?? null) === roomTypeId
    )
  }

  async function handleAssign(attendeeId: string) {
    if (!selectedRoomId) {
      setError("Select a room first by clicking on it.")
      return
    }
    setError(null)
    setSuccess(null)
    setPendingAction(`assign:${attendeeId}`)
    try {
      await assignAttendee({ attendeeId, roomId: selectedRoomId })
      setSuccess("Attendee assigned to room.")
      setSelectedRoomId(null)
    } catch (err: any) {
      setError(err.message ?? "Failed to assign attendee.")
    } finally {
      setPendingAction(null)
    }
  }

  async function handleAssignGroup(attendee: any) {
    if (!selectedRoomId) {
      setError("Select a room first by clicking on it.")
      return
    }
    setError(null)
    setSuccess(null)
    const group = getGroup(attendee)
    if (group.length < 2) return
    setPendingAction(`group:${attendee.attendeeId}`)
    try {
      for (const a of group) {
        await assignAttendee({ attendeeId: a.attendeeId, roomId: selectedRoomId })
      }
      setSuccess(`Assigned group of ${group.length} attendees to the selected room.`)
      setSelectedRoomId(null)
    } catch (err: any) {
      setError(`Group assignment partially failed: ${err.message ?? "the server rejected an assignment."}`)
    } finally {
      setPendingAction(null)
    }
  }

  function findCompatibleRoom(attendee: any) {
    setError(null)
    setSuccess(null)
    const recommendation = attendee.compatibility
    const recommendedRoom = recommendation?.recommendedRoomId
      ? rooms.find((room: any) => room.id === recommendation.recommendedRoomId)
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
      rooms.map((room: any) => room.id),
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
      `Compatible room found: ${recommendedRoom.label}. Review it, then choose Assign to selected room.`
    )
  }

  async function handleUnassign(attendeeId: string) {
    setError(null)
    setSuccess(null)
    setPendingAction(`unassign:${attendeeId}`)
    try {
      await unassignAttendee({ attendeeId })
      setSuccess("Attendee removed from room.")
    } catch (err: any) {
      setError(err.message ?? "Failed to unassign attendee.")
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
            <span>{summary.availableBeds} available beds</span>
            <span>{summary.occupiedBeds} occupied</span>
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
              {hotels.map((hotel: any) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
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
              {(board?.roomTypes as any[] ?? []).map((roomType: any) => <option key={roomType.id} value={roomType.id}>{roomType.label}</option>)}
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
          Room selected. Review an attendee, then choose Assign to selected room.
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
                {unassigned.length} {unassigned.length === 1 ? "attendee needs placement" : "attendees need placement"}
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
             {unassigned.length === 0 ? (
               hotels.length === 0 || rooms.length === 0 ? (
                 <DashboardQueryState state="unconfigured" message="Configure a hotel and usable rooms before placing attendees." className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8" />
                ) : hasActiveFilters ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-sm">
                    <p className="font-semibold">No attendees match the current filters.</p>
                    <p className="text-muted-foreground">Clear filters to view all attendees needing placement.</p>
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters} className="mt-2 min-h-11">Clear filters</Button>
                  </div>
                ) : (
                  <DashboardQueryState state="empty" title="All attendees have been placed." message="No unresolved attendees need placement. Open Allocation to review room assignments." className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8" />
               )
            ) : (
              unassigned.map((attendee: any) => (
                  <div
                    key={attendee.attendeeId}
                    className="flex flex-col rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                     <p className="min-w-0 break-words text-sm font-semibold">{attendee.attendeeName ?? "Unnamed"}</p>
                     <div className="flex min-w-0 flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" disabled={pendingAction !== null} aria-label={`Find compatible room for ${attendee.attendeeName ?? "attendee"}`} className="min-h-11 h-auto whitespace-normal text-[11px]" onClick={() => findCompatibleRoom(attendee)}>
                         Find compatible room
                       </Button>
                       <Button type="button" size="sm" disabled={!selectedRoomId || pendingAction !== null} aria-label={`Assign ${attendee.attendeeName ?? "attendee"} to selected room`} className="min-h-11 h-auto whitespace-normal text-[11px]" onClick={() => handleAssign(attendee.attendeeId)}>
                         {pendingAction === `assign:${attendee.attendeeId}` ? "Assigning…" : "Assign to selected room"}
                       </Button>
                     </div>
                   </div>
                   <div className="mt-2 flex flex-wrap gap-1.5">
                     <PaymentBadge state={attendee.paymentState} />
                     {attendee.allocationPriority && <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold">{attendee.allocationPriority.charAt(0) + attendee.allocationPriority.slice(1).toLowerCase()}</span>}
                     {attendee.hasFamily && <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold">Family/group</span>}
                     <AccommodationPreferenceChips attendee={attendee} />
                   </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>Order: {attendee.bookingRef ?? attendee.orderId ?? "Unavailable"}</p>
                      {attendee.bookerName && <p>Booker: {attendee.bookerName}</p>}
                      {attendee.location && <p>Location: {attendee.location}</p>}
                      {attendee.roommatePreference && <p>Roommate preference: {attendee.roommatePreference}</p>}
                      {attendee.roommateAvoid && <p>Roommate avoidance: {attendee.roommateAvoid}</p>}
                      <p>Compatibility: {attendee.compatibility?.summary ?? "Compatibility unavailable"}</p>
                    </div>
                   {getGroup(attendee).length > 1 && (
                     <Button type="button" variant="ghost" disabled={!selectedRoomId || pendingAction !== null} className="mt-2 min-h-11 h-auto justify-start whitespace-normal px-0 text-xs" onClick={() => handleAssignGroup(attendee)}>
                       {pendingAction === `group:${attendee.attendeeId}` ? "Assigning group…" : "Assign group to selected room"}
                     </Button>
                   )}
                </div>
              ))
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
                {rooms.slice((roomPage - 1) * roomsPerPage, roomPage * roomsPerPage).map((room: any) => {
                  const isSelected = selectedRoomId === room.id
                  const isFull = room.availability === "full"
                  const isEmpty = room.availability === "empty"
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
                             aria-label={`Room status: ${isFull ? "full" : isEmpty ? "empty" : "available"}; ${room.occupants?.length ?? 0} of ${room.capacity} occupied`}
                             variant="outline"
                            className={
                              isFull
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
                                : isEmpty
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400"
                            }
                          >
                            {room.occupants?.length ?? 0}/{room.capacity}
                          </Badge>
                        </div>
                        {room.hotel && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60">
                             <Building2 className="size-3" aria-hidden="true" />
                            {room.hotel.name}
                          </p>
                        )}
                        {room.roomType && <p className="mt-0.5 text-xs text-muted-foreground">{room.roomType.label}</p>}
                        <p className="mt-2 text-xs font-medium text-foreground">{room.occupiedBeds ?? room.occupants?.length ?? 0} of {room.capacity} occupied</p>
                        <p className="text-xs text-muted-foreground">{room.availableBeds === 0 ? "Room full" : room.availableBeds === room.capacity ? "Empty" : `${room.availableBeds} bed${room.availableBeds === 1 ? "" : "s"} available`}</p>
                        {isSelected && (
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                            <Check className="size-3" /> Selected
                          </div>
                        )}
                        {room.mixedCategoryGroup && <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><CircleAlert className="size-3" aria-hidden="true" />Mixed category group</p>}
                      </button>
                      {room.occupants && room.occupants.length > 0 && (
                        <div className="mt-3 space-y-1 border-t border-border/30 pt-3">
                          {room.occupants.slice(0, 3).map((occ: any) => (
                            <div key={occ.attendeeId} className="group/occ flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1">
                              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="break-words text-xs text-muted-foreground">{occ.attendeeName ?? "Unnamed"}</span>
                                <PaymentBadge state={occ.paymentState} />
                                <OccupancyChip occupancy={occ.occupancy} />
                                {occ.nightBeforeMismatch && <span className="text-[10px] text-amber-700 dark:text-amber-300">Night-before mismatch</span>}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUnassign(occ.attendeeId) }}
                                aria-label={`Unassign ${occ.attendeeName ?? "unnamed attendee"} from ${room.label}`}
                                disabled={pendingAction !== null}
                                className="min-h-11 min-w-11 shrink-0 rounded p-2 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                              >
                                 <X className="size-3" aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                          {room.occupants.length > 3 && (
                            <p className="text-xs text-muted-foreground/50">+{room.occupants.length - 3} more</p>
                          )}
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
    </div>
  )
}
