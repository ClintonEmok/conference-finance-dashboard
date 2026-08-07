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
  Hotel,
  X,
  Check,
  Sparkles,
  CircleCheck,
  CircleAlert,
  CircleDashed,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

type Suggestion = {
  attendee: any
  roomId: string
  accepted: boolean
}

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
 * Server-driven accommodation preference chips for unassigned inbox rows.
 * Reads only `occupancy`, `categoryLabel`, `optionKeys`, and
 * `nightBeforeLevel` from the board payload.
 */
function AccommodationPreferenceChips({ attendee }: { attendee: any }) {
  const optionKeys: string[] = Array.isArray(attendee?.optionKeys)
    ? attendee.optionKeys
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
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [roomPage, setRoomPage] = useState(1)
  const roomsPerPage = 12

  const rooms = useMemo(() => (board?.rooms as any[]) ?? [], [board])
  const hotels = useMemo(() => (board?.hotels as any[]) ?? [], [board])
  const unassigned = useMemo(() => (board?.unassignedAttendees as any[]) ?? [], [board])
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
    setRoomPage(1)
    setSelectedRoomId(null)
    router.replace(`?${nextParams.toString()}`, { scroll: false })
  }

  function resolveRoomTypeId(attendee: any) {
    return attendee.allocatedRoomTypeId ?? (event as any)?.defaultRoomTypeId ?? null
  }

  function pickFulfillRoom(attendee: any, availableRooms: any[]) {
    const roomTypeId = resolveRoomTypeId(attendee)
    if (!roomTypeId) return null
    const candidates = availableRooms.filter(
      (r: any) => r.roomType?.id === roomTypeId && r.availableBeds > 0
    )
    const sameOrderRoom = attendee.orderId
      ? candidates.find((r: any) =>
          r.occupants?.some((o: any) => o.orderId === attendee.orderId)
        )
      : null
    return sameOrderRoom ?? candidates[0] ?? null
  }

  function getFulfillGroup(attendee: any) {
    const roomTypeId = resolveRoomTypeId(attendee)
    if (!attendee.orderId || !roomTypeId) return [attendee]
    return unassigned.filter(
      (a: any) =>
        a.orderId === attendee.orderId &&
        resolveRoomTypeId(a) === roomTypeId
    )
  }

  function generateSuggestions() {
    const processed = new Set<string>()
    const result: Suggestion[] = []

    const mutableRooms = rooms.map((r: any) => ({ ...r }))

    for (const attendee of unassigned) {
      if (processed.has(attendee.attendeeId)) continue

      const group = getFulfillGroup(attendee)
      const isGroup = group.length > 1
      const roomTypeId = resolveRoomTypeId(attendee)
      let matchingRoom: any = null

      if (isGroup && roomTypeId) {
        matchingRoom = mutableRooms
          .filter((r: any) => r.roomType?.id === roomTypeId && r.availableBeds >= group.length)
          .sort((a: any, b: any) => a.availableBeds - b.availableBeds)[0] ?? null
      } else if (roomTypeId) {
        matchingRoom = pickFulfillRoom(attendee, mutableRooms)
      }

      for (const a of group) {
        processed.add(a.attendeeId)
        result.push({
          attendee: a,
          roomId: matchingRoom?.id ?? "",
          accepted: !!matchingRoom,
        })
        if (matchingRoom) {
          mutableRooms.find((r: any) => r.id === matchingRoom.id).availableBeds--
        }
      }
    }

    setSuggestions(result)
  }

  async function applySuggestions() {
    setIsApplying(true)
    setError(null)
    setSuccess(null)
    try {
      const accepted = suggestions?.filter((s) => s.accepted && s.roomId) ?? []
      for (const s of accepted) {
        await assignAttendee({ attendeeId: s.attendee.attendeeId, roomId: s.roomId })
      }
      setSuccess(`Assigned ${accepted.length} attendee${accepted.length === 1 ? "" : "s"}.`)
      setSuggestions(null)
    } catch (err: any) {
      setError(err.message ?? "Failed to apply suggestions.")
    } finally {
      setIsApplying(false)
    }
  }

  async function handleAssign(attendeeId: string) {
    if (!selectedRoomId) {
      setError("Select a room first by clicking on it.")
      return
    }
    setError(null)
    setSuccess(null)
    try {
      await assignAttendee({ attendeeId, roomId: selectedRoomId })
      setSuccess("Attendee assigned to room.")
      setSelectedRoomId(null)
    } catch (err: any) {
      setError(err.message ?? "Failed to assign attendee.")
    }
  }

  async function handleFulfill(attendee: any) {
    setError(null)
    setSuccess(null)
    const group = getFulfillGroup(attendee)
    const isGroup = group.length > 1
    const mutableRooms = rooms.map((r: any) => ({ ...r }))
    const roomTypeId = resolveRoomTypeId(attendee)
    let room: any = null

    if (isGroup && roomTypeId) {
      room = mutableRooms
        .filter((r: any) => r.roomType?.id === roomTypeId && r.availableBeds >= group.length)
        .sort((a: any, b: any) => a.availableBeds - b.availableBeds)[0] ?? null
    } else {
      room = pickFulfillRoom(attendee, mutableRooms)
    }

    if (!room) {
      setError(
        isGroup
          ? `No room has enough available beds for this group (${group.length}).`
          : "No available rooms of the matching room type."
      )
      return
    }
    try {
      for (const a of group) {
        await assignAttendee({ attendeeId: a.attendeeId, roomId: room.id })
      }
      setSuccess(
        isGroup
          ? `Assigned ${group.length} attendees to ${room.label}.`
          : `${attendee.attendeeName ?? "Attendee"} assigned to ${room.label}.`
      )
    } catch (err: any) {
      setError(err.message ?? "Failed to assign.")
    }
  }

  async function handleUnassign(attendeeId: string) {
    setError(null)
    setSuccess(null)
    try {
      await unassignAttendee({ attendeeId })
      setSuccess("Attendee removed from room.")
    } catch (err: any) {
      setError(err.message ?? "Failed to unassign attendee.")
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
          <p className="font-semibold">Allocation inbox and room board</p>
          <p className="text-xs text-muted-foreground">Select a room, then assign waiting attendees or fulfill a compatible group.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Payment priority: paid first · partially paid · unpaid
          </p>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{summary.totalRooms} rooms</span>
            <span>{summary.availableBeds} available beds</span>
            <span>{summary.occupiedBeds} occupied</span>
            <span className="font-semibold text-foreground">{summary.unassignedAttendeesCount} unassigned</span>
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
          Room selected. Click an attendee in the inbox to assign them.
          <Button variant="ghost" size="sm" onClick={() => setSelectedRoomId(null)} className="ml-3 h-6 text-xs">
            Clear selection
          </Button>
        </div>
      )}

      {/* QUICK TASK 260807-UEL: the Generate Suggestions trigger is dormant.
          The suggestion algorithm (`generateSuggestions`), the application
          flow (`applySuggestions`/`isApplying`), and the result panel below
          remain intact for a later rebuild. */}
      {/* {unassigned.length > 0 && !suggestions && (
        <div className="flex justify-center">
          <Button
            onClick={generateSuggestions}
            className="rounded-2xl px-6 text-xs font-bold uppercase tracking-wider"
          >
            Generate Suggestions
          </Button>
        </div>
      )} */}

      {suggestions && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Sparkles className="size-4 text-primary" />
                Suggested Assignments
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {suggestions.filter((s) => s.accepted).length} of {suggestions.length} accepted
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuggestions(null)}
                className="rounded-xl border-white/20 text-xs"
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                onClick={applySuggestions}
                disabled={isApplying || suggestions.filter((s) => s.accepted && s.roomId).length === 0}
                className="rounded-xl text-xs"
              >
                {isApplying ? "Applying..." : `Apply (${suggestions.filter((s) => s.accepted && s.roomId).length})`}
              </Button>
            </div>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {suggestions.map((s) => {
              const room = rooms.find((r: any) => r.id === s.roomId)
              return (
                 <div
                   key={s.attendee.attendeeId}
                   className={`flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition-all sm:flex-row sm:items-center ${
                    s.accepted ? "border-emerald-200/60 bg-emerald-50/40" : "border-border/30 bg-muted/20 opacity-60"
                  }`}
                >
                   <button
                     type="button"
                     aria-pressed={s.accepted}
                     aria-label={`${s.accepted ? "Remove" : "Accept"} suggested assignment for ${s.attendee.attendeeName ?? "unnamed attendee"}`}
                    onClick={() =>
                      setSuggestions((prev) =>
                        prev?.map((p) =>
                          p.attendee.attendeeId === s.attendee.attendeeId
                            ? { ...p, accepted: !p.accepted }
                            : p
                        ) ?? null
                      )
                    }
                    className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      s.accepted ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-background"
                    }`}
                  >
                    {s.accepted && <Check className="size-3" aria-hidden="true" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{s.attendee.attendeeName ?? "Unnamed"}</span>
                      <PaymentBadge state={s.attendee.paymentState} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.roomId && room ? `→ ${room.label} (${room.hotel?.name ?? ""})` : "No matching room"}
                    </p>
                  </div>

                   <Select
                     aria-label={`Suggested room for ${s.attendee.attendeeName ?? "unnamed attendee"}`}
                    value={s.roomId}
                    onValueChange={(val) =>
                      setSuggestions((prev) =>
                        prev?.map((p) =>
                          p.attendee.attendeeId === s.attendee.attendeeId ? { ...p, roomId: val } : p
                        ) ?? null
                      )
                    }
                  >
                     <SelectTrigger className="h-8 w-full rounded-lg border-white/20 text-xs sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms
                        .filter((r: any) => r.availableBeds > 0)
                        .map((r: any) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {r.label} — {r.hotel?.name} ({r.availableBeds} free)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        </div>
      )}

       <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
         <div className="flex h-[700px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-none">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Inbox</h3>
              <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {unassigned.length} waiting
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
               ) : (
                 <DashboardQueryState state="empty" message="All attendees have been placed." className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8" />
               )
            ) : (
              unassigned.map((attendee: any) => (
                  <div
                    key={attendee.attendeeId}
                    className="flex flex-col rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-primary/30"
                  >
                   <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{attendee.attendeeName ?? "Unnamed"}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        aria-label={`Fulfill ${attendee.attendeeName ?? "attendee"}`}
                        className="h-7 rounded-lg bg-emerald-500/10 px-2.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-600 hover:text-white"
                        onClick={() => handleFulfill(attendee)}
                      >
                        Fulfill
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        aria-label={`Assign ${attendee.attendeeName ?? "attendee"} to selected room`}
                        className="h-7 rounded-lg bg-primary/10 px-2.5 text-[11px] font-bold text-primary hover:bg-primary hover:text-white"
                        onClick={() => handleAssign(attendee.attendeeId)}
                      >
                        Assign
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <PaymentBadge state={attendee.paymentState} />
                    {attendee.genderType && attendee.genderType !== "UNKNOWN" && (
                      <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground/80">
                        {attendee.genderType.toLowerCase()}
                      </span>
                    )}
                    {attendee.allocationPriority === "CRITICAL" && (
                      <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">Critical</span>
                    )}
                    {attendee.allocationPriority === "HIGH" && (
                      <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-500">High</span>
                    )}
                    <AccommodationPreferenceChips attendee={attendee} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

         <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Room availability</h3>
              <p className="text-xs font-medium text-muted-foreground">{rooms.length} rooms</p>
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
                        aria-label={`${isSelected ? "Deselect" : "Select"} room ${room.label}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedRoomId(isSelected ? null : room.id)}
                        className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        {isSelected && (
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                            <Check className="size-3" /> Selected
                          </div>
                        )}
                      </button>
                      {room.occupants && room.occupants.length > 0 && (
                        <div className="mt-3 space-y-1 border-t border-border/30 pt-3">
                          {room.occupants.slice(0, 3).map((occ: any) => (
                            <div key={occ.attendeeId} className="group/occ flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1">
                              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="truncate text-xs text-muted-foreground">{occ.attendeeName ?? "Unnamed"}</span>
                                <PaymentBadge state={occ.paymentState} />
                                <OccupancyChip occupancy={occ.occupancy} />
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUnassign(occ.attendeeId) }}
                                aria-label={`Unassign ${occ.attendeeName ?? "unnamed attendee"} from ${room.label}`}
                                className="size-7 shrink-0 rounded p-1 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
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
