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
import { Skeleton } from "@/components/ui/skeleton"
import { useEventBySlug } from "@/lib/convex/hooks/events"
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

export default function EventAllocationPage({
  params,
  roomId: roomIntentProp,
}: {
  params: Promise<{ slug: string }>
  roomId?: string
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const router = useRouter()
  const searchParams = useSearchParams()
  const filters = useMemo(
    () => readAllocationFiltersFromSearchParams(searchParams),
    [searchParams]
  )
  const boardArgs = useMemo(() => {
    if (!event?._id) return undefined

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
  }, [event?._id, filters])
  const board = useRoomAllocationBoard(boardArgs)
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

  const roomIntent = roomIntentProp?.trim() || searchParams.get("roomId")?.trim() || null

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

  if (event === undefined || board === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <Skeleton className="h-[600px] rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="space-y-6">
        <Link
          href={`/dashboard/events/${slug}/accommodation`}
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Accommodation
        </Link>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">Event Not Found</h1>
          <p className="mt-2 text-muted-foreground">
            The event &quot;{slug}&quot; could not be found.
          </p>
        </div>
      </div>
    )
  }

  if (!event.accommodationEnabled) {
    return (
      <div className="space-y-6">
        <Link
          href={`/dashboard/events/${slug}/settings`}
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Go to Settings
        </Link>
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <BedDouble className="mx-auto size-12 text-muted-foreground opacity-20" />
          <p className="mt-4 text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">
            Accommodation Disabled
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/events/${slug}/accommodation/workspace`}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to Workspace
      </Link>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm dark:border-white/5 dark:bg-black/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <Building2 className="size-3" />
            Total Rooms
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter">{summary?.totalRooms ?? 0}</p>
        </div>
        <div className="group rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-emerald-700/60 uppercase dark:text-emerald-400/60">
            <BedDouble className="size-3" />
            Available Beds
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-emerald-700 dark:text-emerald-400">
            {summary?.availableBeds ?? 0}
          </p>
        </div>
        <div className="group rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-amber-700/60 uppercase dark:text-amber-400/60">
            <Users className="size-3" />
            Occupied
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-amber-700 dark:text-amber-400">
            {summary?.occupiedBeds ?? 0}
          </p>
        </div>
        <div className="group rounded-2xl border border-rose-200/60 bg-rose-50/60 p-5 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-rose-700/60 uppercase dark:text-rose-400/60">
            <Users className="size-3" />
            Unassigned
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-rose-700 dark:text-rose-400">
            {summary?.unassignedAttendeesCount ?? 0}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive">{error}</div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{success}</div>
      )}

      <section aria-labelledby="allocation-filters" className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="allocation-filters" className="text-sm font-semibold">Allocation filters</h2>
            <p className="mt-1 text-xs text-muted-foreground">Filter the event-scoped board without changing room capacity data.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
            Clear filters
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      {unassigned.length > 0 && !suggestions && (
        <div className="flex justify-center">
          <Button
            onClick={generateSuggestions}
            className="rounded-2xl px-6 text-xs font-bold uppercase tracking-wider"
          >
            Generate Suggestions
          </Button>
        </div>
      )}

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
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                    s.accepted ? "border-emerald-200/60 bg-emerald-50/40" : "border-border/30 bg-muted/20 opacity-60"
                  }`}
                >
                  <button
                    type="button"
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
                    {s.accepted && <Check className="size-3" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.attendee.attendeeName ?? "Unnamed"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.roomId && room ? `→ ${room.label} (${room.hotel?.name ?? ""})` : "No matching room"}
                    </p>
                  </div>

                  <Select
                    value={s.roomId}
                    onValueChange={(val) =>
                      setSuggestions((prev) =>
                        prev?.map((p) =>
                          p.attendee.attendeeId === s.attendee.attendeeId ? { ...p, roomId: val } : p
                        ) ?? null
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-44 rounded-lg border-white/20 text-xs">
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

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
        <div className="flex h-[700px] flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
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

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {unassigned.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-sm text-muted-foreground">
                All attendees have been placed.
              </div>
            ) : (
              unassigned.map((attendee: any) => (
                  <div
                    key={attendee.attendeeId}
                    className="flex flex-col rounded-xl border border-white/40 bg-white/40 p-3 transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40"
                  >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{attendee.attendeeName ?? "Unnamed"}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-lg bg-emerald-500/10 px-2.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-600 hover:text-white"
                        onClick={() => handleFulfill(attendee)}
                      >
                        Fulfill
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 rounded-lg bg-primary/10 px-2.5 text-[11px] font-bold text-primary hover:bg-primary hover:text-white"
                        onClick={() => handleAssign(attendee.attendeeId)}
                      >
                        Assign
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
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
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
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
                  onClick={() => setRoomPage((p) => p - 1)}
                  className="h-8 rounded-lg border-white/20 text-xs"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="text-xs font-medium text-muted-foreground">
                  {roomPage} / {Math.ceil(rooms.length / roomsPerPage)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={roomPage >= Math.ceil(rooms.length / roomsPerPage)}
                  onClick={() => setRoomPage((p) => p + 1)}
                  className="h-8 rounded-lg border-white/20 text-xs"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
              <Hotel className="mx-auto size-12 text-muted-foreground opacity-20" />
              <p className="mt-4 text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">No rooms found</p>
            </div>
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
                          : "border-white/40 bg-white/40 hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40"
                      }`}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedRoomId(isSelected ? null : room.id)}
                        className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{room.label}</p>
                          <Badge
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
                            <Building2 className="size-3" />
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
                            <div key={occ.attendeeId} className="group/occ flex items-center justify-between rounded-lg bg-muted/30 px-2 py-1">
                              <span className="truncate text-xs text-muted-foreground">{occ.attendeeName ?? "Unnamed"}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUnassign(occ.attendeeId) }}
                                aria-label={`Unassign ${occ.attendeeName ?? "unnamed attendee"} from ${room.label}`}
                                className="size-7 shrink-0 rounded p-1 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                              >
                                <X className="size-3" />
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
