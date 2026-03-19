"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, BedDouble, Building2, ChevronLeft, ChevronRight, RefreshCcw, Search, Sparkles, Users } from "lucide-react"

import { Button } from "@/components/ui/button"

type AvailabilityFilter = "all" | "empty" | "available" | "full"

type AccommodationWorkspacePayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    search: string | null
    hotelId: string | null
    roomTypeId: string | null
    availability: AvailabilityFilter
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
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
    occupiedBeds: number
    availableBeds: number
    availability: "empty" | "available" | "full"
    notes: string | null
    hotel: {
      id: string
      name: string
      city: string | null
    }
    roomType: {
      id: string
      label: string
      defaultCapacity: number
    }
    occupants: Array<{
      attendeeId: string
      attendeeName: string | null
      attendeeEmail: string | null
      providerOrderId: string
      providerEventId: string
      eventName: string | null
      ticketTypeLabel: string | null
    }>
  }>
  unassignedAttendees: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    ticketTypeLabel: string | null
    matchingRoomCount: number
  }>
  summary: {
    totalRooms: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
    unassignedAttendees: number
  }
}

type InventoryErrorState = {
  global: string | null
  assignments: string | null
}

const emptyPayload: AccommodationWorkspacePayload = {
  generatedAt: new Date(0).toISOString(),
  filters: {
    eventId: null,
    search: null,
    hotelId: null,
    roomTypeId: null,
    availability: "all",
  },
  availableEvents: [],
  hotels: [],
  roomTypes: [],
  rooms: [],
  unassignedAttendees: [],
  summary: {
    totalRooms: 0,
    emptyRooms: 0,
    availableRooms: 0,
    fullRooms: 0,
    unassignedAttendees: 0,
  },
}

function emptyErrors(): InventoryErrorState {
  return {
    global: null,
    assignments: null,
  }
}

function availabilityClasses(value: "empty" | "available" | "full") {
  if (value === "full") {
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
  }

  if (value === "empty") {
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300"
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
}

function availabilityLabel(value: "empty" | "available" | "full") {
  if (value === "full") {
    return "Occupied"
  }

  if (value === "empty") {
    return "Empty"
  }

  return "Available"
}

export default function AccommodationPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [payload, setPayload] = useState<AccommodationWorkspacePayload>(emptyPayload)
  const [errors, setErrors] = useState<InventoryErrorState>(emptyErrors)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null)

  const [eventIdInput, setEventIdInput] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [hotelFilter, setHotelFilter] = useState("")
  const [roomTypeFilter, setRoomTypeFilter] = useState("")
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all")

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [appliedHotelFilter, setAppliedHotelFilter] = useState("")
  const [appliedRoomTypeFilter, setAppliedRoomTypeFilter] = useState("")
  const [appliedAvailability, setAppliedAvailability] = useState<AvailabilityFilter>("all")
  const [roomsPage, setRoomsPage] = useState(1)

  const [selectedRoomByAttendee, setSelectedRoomByAttendee] = useState<Record<string, string>>({})

  const selectedAttendeeId = searchParams.get("attendeeId")

  const syncUrlState = useCallback(
    (next: {
      attendeeId?: string | null
      eventId?: string | null
      search?: string | null
      hotelId?: string | null
      roomTypeId?: string | null
      availability?: AvailabilityFilter
      source?: string | null
    }) => {
      const params = new URLSearchParams(searchParams.toString())

      const assign = (key: string, value: string | null | undefined) => {
        if (value && value.trim()) {
          params.set(key, value)
          return
        }

        params.delete(key)
      }

      assign("attendeeId", next.attendeeId)
      assign("eventId", next.eventId)
      assign("search", next.search)
      assign("hotelId", next.hotelId)
      assign("roomTypeId", next.roomTypeId)
      assign("source", next.source)

      if (next.availability && next.availability !== "all") {
        params.set("availability", next.availability)
      } else {
        params.delete("availability")
      }

      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    const nextEventId = searchParams.get("eventId") ?? ""
    const nextSearch = searchParams.get("search") ?? ""
    const nextHotelId = searchParams.get("hotelId") ?? ""
    const nextRoomTypeId = searchParams.get("roomTypeId") ?? ""
    const nextAvailability = (searchParams.get("availability") as AvailabilityFilter | null) ?? "all"

    setEventIdInput(nextEventId)
    setSearchInput(nextSearch)
    setHotelFilter(nextHotelId)
    setRoomTypeFilter(nextRoomTypeId)
    setAvailabilityFilter(nextAvailability)

    setAppliedEventId(nextEventId)
    setAppliedSearch(nextSearch)
    setAppliedHotelFilter(nextHotelId)
    setAppliedRoomTypeFilter(nextRoomTypeId)
    setAppliedAvailability(nextAvailability)
  }, [searchParams])

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true)
    setErrors((current) => ({ ...current, global: null, assignments: null }))

    try {
      const query = new URLSearchParams()

      if (appliedEventId.trim()) {
        query.set("eventId", appliedEventId.trim())
      }
      if (appliedSearch.trim()) {
        query.set("search", appliedSearch.trim())
      }
      if (appliedHotelFilter.trim()) {
        query.set("hotelId", appliedHotelFilter)
      }
      if (appliedRoomTypeFilter.trim()) {
        query.set("roomTypeId", appliedRoomTypeFilter)
      }
      if (appliedAvailability !== "all") {
        query.set("availability", appliedAvailability)
      }

      const response = await fetch(`/api/dashboard/accommodation/assignments?${query.toString()}`)
      const body = (await response.json().catch(() => null)) as
        | AccommodationWorkspacePayload
        | { error?: { message?: string } }
        | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          global: body && "error" in body ? body.error?.message ?? "Failed to load accommodation workspace." : "Failed to load accommodation workspace.",
        }))
        return
      }

      setPayload(body as AccommodationWorkspacePayload)
      setErrors((current) => ({ ...current, global: null }))
    } catch {
      setErrors((current) => ({ ...current, global: "Network error while loading accommodation workspace." }))
    } finally {
      setIsLoading(false)
    }
  }, [appliedAvailability, appliedEventId, appliedHotelFilter, appliedRoomTypeFilter, appliedSearch])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const assignableRooms = useMemo(
    () => payload.rooms.filter((room) => room.availableBeds > 0),
    [payload.rooms],
  )

  const selectedAttendeeContext = useMemo(() => {
    if (!selectedAttendeeId) {
      return null
    }

    const unassignedAttendee = payload.unassignedAttendees.find(
      (attendee) => attendee.attendeeId === selectedAttendeeId,
    )

    if (unassignedAttendee) {
      return {
        status: "unassigned" as const,
        attendeeName: unassignedAttendee.attendeeName,
        attendeeEmail: unassignedAttendee.attendeeEmail,
        detailHref: `/dashboard/attendees/${unassignedAttendee.attendeeId}?search=${encodeURIComponent(
          appliedSearch || unassignedAttendee.attendeeName || unassignedAttendee.providerOrderId,
        )}&eventId=${encodeURIComponent(appliedEventId || unassignedAttendee.providerEventId)}`,
      }
    }

    for (const room of payload.rooms) {
      const occupant = room.occupants.find((attendee) => attendee.attendeeId === selectedAttendeeId)

      if (occupant) {
        return {
          status: "assigned" as const,
          attendeeName: occupant.attendeeName,
          attendeeEmail: occupant.attendeeEmail,
          roomLabel: room.label,
          hotelName: room.hotel.name,
          detailHref: `/dashboard/attendees/${occupant.attendeeId}?search=${encodeURIComponent(
            appliedSearch || occupant.attendeeName || occupant.providerOrderId,
          )}&eventId=${encodeURIComponent(appliedEventId || occupant.providerEventId)}`,
        }
      }
    }

    return {
      status: "hidden" as const,
      attendeeName: null,
      attendeeEmail: null,
      detailHref: "/dashboard/attendees",
    }
  }, [appliedEventId, appliedSearch, payload.rooms, payload.unassignedAttendees, selectedAttendeeId])

  const totalCapacity = useMemo(
    () => payload.rooms.reduce((sum, room) => sum + room.capacity, 0),
    [payload.rooms],
  )

  const occupiedCapacity = useMemo(
    () => payload.rooms.reduce((sum, room) => sum + room.occupiedBeds, 0),
    [payload.rooms],
  )

  const occupancyPercent = totalCapacity === 0 ? 0 : Math.round((occupiedCapacity / totalCapacity) * 100)

  const highlightedSuggestion = useMemo(() => {
    if (payload.unassignedAttendees.length === 0 || assignableRooms.length === 0) {
      return null
    }

    const attendee = payload.unassignedAttendees[0]
    const room = assignableRooms[0]
    const attendeeDisplayName = attendee.attendeeName?.trim() || attendee.attendeeEmail || attendee.providerOrderId

    return {
      attendeeName: attendeeDisplayName,
      roomLabel: room.label,
      hotelName: room.hotel.name,
    }
  }, [assignableRooms, payload.unassignedAttendees])

  const selectedEventHotelCount = useMemo(() => {
    if (!eventIdInput) {
      return 0
    }

    return payload.hotels.filter((hotel) => hotel.assignedEventIds.includes(eventIdInput)).length
  }, [eventIdInput, payload.hotels])

  const roomsPerPage = 8

  const totalRoomPages = Math.max(1, Math.ceil(payload.rooms.length / roomsPerPage))

  const paginatedRooms = useMemo(() => {
    const start = (roomsPage - 1) * roomsPerPage
    return payload.rooms.slice(start, start + roomsPerPage)
  }, [payload.rooms, roomsPage])

  useEffect(() => {
    setRoomsPage(1)
  }, [appliedAvailability, appliedEventId, appliedHotelFilter, appliedRoomTypeFilter, appliedSearch])

  useEffect(() => {
    if (roomsPage > totalRoomPages) {
      setRoomsPage(totalRoomPages)
    }
  }, [roomsPage, totalRoomPages])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAssignmentMessage(null)
    syncUrlState({
      attendeeId: selectedAttendeeId,
      eventId: eventIdInput,
      search: searchInput,
      hotelId: hotelFilter,
      roomTypeId: roomTypeFilter,
      availability: availabilityFilter,
      source: searchParams.get("source"),
    })
  }

  async function assignAttendee(attendeeId: string) {
    const roomId = selectedRoomByAttendee[attendeeId]

    if (!roomId) {
      setErrors((current) => ({ ...current, assignments: "Select a room before assigning an attendee." }))
      return
    }

    await assignAttendeeToSpecificRoom(attendeeId, roomId)
  }

  async function assignAttendeeToSpecificRoom(attendeeId: string, roomId: string) {
    if (!roomId) {
      setErrors((current) => ({ ...current, assignments: "Select a room before assigning an attendee." }))
      return
    }

    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      const response = await fetch("/api/dashboard/accommodation/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId, roomId }),
      })

      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrors((current) => ({ ...current, assignments: body?.error?.message ?? "Failed to assign attendee." }))
        return
      }

      setErrors((current) => ({ ...current, assignments: null }))
      setAssignmentMessage("Attendee assigned. Occupancy has been refreshed from live server data.")
      setSelectedRoomByAttendee((current) => {
        const next = { ...current }
        delete next[attendeeId]
        return next
      })
      await loadWorkspace()
    } finally {
      setIsMutating(false)
    }
  }

  async function unassignAttendee(attendeeId: string) {
    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      const response = await fetch(`/api/dashboard/accommodation/assignments/${attendeeId}`, {
        method: "DELETE",
      })

      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrors((current) => ({ ...current, assignments: body?.error?.message ?? "Failed to unassign attendee." }))
        return
      }

      setErrors((current) => ({ ...current, assignments: null }))
      setAssignmentMessage("Attendee removed from room. Occupancy has been refreshed from live server data.")
      await loadWorkspace()
    } finally {
      setIsMutating(false)
    }
  }

  function jumpToAssignmentQueue() {
    const target = document.getElementById("assignment-queue")
    target?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <section className="space-y-6">
      <section className="rounded-3xl border border-primary/12 bg-[radial-gradient(circle_at_top_left,rgba(145,118,255,0.3),transparent_38%),linear-gradient(180deg,rgba(57,47,92,0.96)_0%,rgba(72,60,112,0.92)_36%,rgba(92,79,136,0.9)_100%)] p-6 shadow-[0_24px_70px_rgba(40,24,82,0.16)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/55">Rooms</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight text-primary-foreground">Room allocation manager</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/72">
              Track hotel capacity, assign attendees, and keep accommodation decisions visible in one operator workflow.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-full border-white/20 bg-white/8 text-primary-foreground hover:bg-white/14 hover:text-primary-foreground">
              <Link href="/dashboard/accommodation/inventory">Open room stock</Link>
            </Button>
            <Button
              type="button"
              className="rounded-full border border-white/10 bg-white/92 text-primary shadow-sm hover:bg-white"
              onClick={jumpToAssignmentQueue}
            >
              Bulk assign
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Total capacity</p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">{totalCapacity.toLocaleString()}</p>
            <p className="mt-2 text-sm text-primary-foreground/68">{payload.summary.totalRooms} rooms in active scope</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Occupied beds</p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">{occupiedCapacity.toLocaleString()}</p>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(190,168,255,0.98))]" style={{ width: `${occupancyPercent}%` }} />
            </div>
            <p className="mt-2 text-sm text-primary-foreground/68">{occupancyPercent}% of current room capacity in use</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Unassigned attendees</p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">{payload.summary.unassignedAttendees}</p>
            <p className="mt-2 text-sm text-primary-foreground/68">People still waiting for a room</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Room mix</p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">{payload.roomTypes.length}</p>
            <p className="mt-2 text-sm text-primary-foreground/68">Across {payload.hotels.length} hotels</p>
          </article>
        </div>
      </section>

      {(errors.global || errors.assignments || assignmentMessage) && (
        <div className="space-y-3">
          {errors.global && (
            <article className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errors.global}
            </article>
          )}
          {errors.assignments && (
            <article className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errors.assignments}
            </article>
          )}
          {assignmentMessage && (
            <article className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
              {assignmentMessage}
            </article>
          )}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <article className="rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                <Search className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Refine view</p>
                <h3 className="text-lg font-semibold text-foreground">Filter the allocation board</h3>
              </div>
            </div>

            <form className="mt-5 space-y-4" onSubmit={applyFilters}>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Search rooms or attendees</span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Room, hotel, attendee, order"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                />
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Event</span>
                <select
                  value={eventIdInput}
                  onChange={(event) => setEventIdInput(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="">All events</option>
                  {payload.availableEvents.map((event) => (
                    <option key={event.providerEventId} value={event.providerEventId}>
                      {event.name?.trim() || event.providerEventId}
                    </option>
                  ))}
                </select>
                {eventIdInput && (
                  <p className="text-xs text-muted-foreground">
                    {selectedEventHotelCount > 0
                      ? `This event is currently scoped to ${selectedEventHotelCount} hotel${selectedEventHotelCount === 1 ? "" : "s"}.`
                      : "No hotel scope is configured for this event yet, so all hotels remain visible."}
                  </p>
                )}
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Hotel</span>
                <select
                  value={hotelFilter}
                  onChange={(event) => setHotelFilter(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="">All hotels</option>
                  {payload.hotels.map((hotel) => (
                    <option key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Room type</span>
                <select
                  value={roomTypeFilter}
                  onChange={(event) => setRoomTypeFilter(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="">All room types</option>
                  {payload.roomTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Status</span>
                <select
                  value={availabilityFilter}
                  onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="all">All rooms</option>
                  <option value="empty">Empty</option>
                  <option value="available">Available</option>
                  <option value="full">Occupied</option>
                </select>
              </label>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={isLoading || isMutating} className="flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={isLoading || isMutating}
                  onClick={() => {
                    setEventIdInput("")
                    setSearchInput("")
                    setHotelFilter("")
                    setRoomTypeFilter("")
                    setAvailabilityFilter("all")
                    setAssignmentMessage(null)
                    syncUrlState({
                      attendeeId: selectedAttendeeId,
                      eventId: null,
                      search: null,
                      hotelId: null,
                      roomTypeId: null,
                      availability: "all",
                      source: searchParams.get("source"),
                    })
                  }}
                >
                  Reset
                </Button>
              </div>
            </form>
          </article>

          {selectedAttendeeId && selectedAttendeeContext && (
            <article className="rounded-3xl border border-primary/12 bg-primary/6 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Selected attendee</p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{selectedAttendeeContext.attendeeName ?? "Focused attendee"}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedAttendeeContext.status === "assigned"
                  ? `${selectedAttendeeContext.attendeeName ?? "This attendee"} is already assigned to ${selectedAttendeeContext.roomLabel} at ${selectedAttendeeContext.hotelName}.`
                  : selectedAttendeeContext.status === "unassigned"
                    ? `${selectedAttendeeContext.attendeeName ?? "This attendee"} is unassigned and ready for room placement.`
                    : "This attendee is outside the current filters. Clear the filters or reopen from attendee detail."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" className="rounded-xl bg-background text-primary">
                  <Link href={selectedAttendeeContext.detailHref}>Open attendee detail</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl text-primary"
                  onClick={() =>
                    syncUrlState({
                      attendeeId: null,
                      eventId: appliedEventId,
                      search: appliedSearch,
                      hotelId: appliedHotelFilter,
                      roomTypeId: appliedRoomTypeFilter,
                      availability: appliedAvailability,
                      source: searchParams.get("source"),
                    })
                  }
                >
                  Clear focus
                </Button>
              </div>
            </article>
          )}

          <article className="rounded-3xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-[0_24px_54px_rgba(83,56,171,0.28)]">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-white/12">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">Suggestion</p>
                <h3 className="text-lg font-semibold">Next best move</h3>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-primary-foreground/85">
              {highlightedSuggestion
                ? `${highlightedSuggestion.attendeeName} can likely be placed in ${highlightedSuggestion.roomLabel} at ${highlightedSuggestion.hotelName} based on the active scope.`
                : "No suggestion yet. Add more inventory or widen the current filters to reveal available room matches."}
            </p>
            <div className="mt-5 flex items-center justify-between text-sm text-primary-foreground/75">
              <span>{payload.summary.unassignedAttendees} waiting</span>
              <span>{assignableRooms.length} rooms open</span>
            </div>
          </article>
        </aside>

        <div className="space-y-6">
          <article id="assignment-queue" className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Allocation board</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">Room overview and occupancy</h3>
              </div>
              <Button type="button" variant="outline" className="rounded-xl text-primary" disabled={isLoading || isMutating} onClick={() => void loadWorkspace()}>
                <RefreshCcw className="mr-2 size-4" />
                Refresh
              </Button>
            </div>

            {isLoading ? (
              <p className="mt-5 text-sm text-muted-foreground">Loading room overview...</p>
            ) : payload.rooms.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">No room stock matches the current filters.</p>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-border/70">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border/70 text-sm">
                    <thead className="bg-muted/35">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Room</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Hotel</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Type</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Occupancy</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Guests</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-background/80">
                      {paginatedRooms.map((room) => (
                        <tr
                          key={room.id}
                          className="cursor-pointer align-top transition-colors hover:bg-primary/5"
                          onClick={() => router.push(`/dashboard/accommodation/rooms/${room.id}`)}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                                <Building2 className="size-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">{room.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{room.availableBeds} bed{room.availableBeds === 1 ? "" : "s"} free</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            <p>{room.hotel.name}</p>
                            <p className="mt-1 text-xs">{room.hotel.city ?? "City not set"}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              {room.roomType.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            <p className="font-medium text-foreground">{room.occupiedBeds}/{room.capacity}</p>
                            <p className="mt-1 text-xs">occupied beds</p>
                          </td>
                          <td className="px-4 py-4">
                            {room.occupants.length === 0 ? (
                              <span className="text-muted-foreground">No attendees</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {room.occupants.slice(0, 2).map((occupant) => (
                                  <span key={occupant.attendeeId} className="rounded-full border border-border/80 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                                    {occupant.attendeeName ?? occupant.attendeeEmail ?? occupant.providerOrderId}
                                  </span>
                                ))}
                                {room.occupants.length > 2 && (
                                  <span className="rounded-full border border-border/80 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground">
                                    +{room.occupants.length - 2} more
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${availabilityClasses(room.availability)}`}>
                              {availabilityLabel(room.availability)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(roomsPage - 1) * roomsPerPage + 1}-{Math.min(roomsPage * roomsPerPage, payload.rooms.length)} of {payload.rooms.length} rooms
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      disabled={roomsPage === 1}
                      onClick={() => setRoomsPage((current) => Math.max(1, current - 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {roomsPage} of {totalRoomPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      disabled={roomsPage === totalRoomPages}
                      onClick={() => setRoomsPage((current) => Math.min(totalRoomPages, current + 1))}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assignment queue</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">Unassigned attendees</h3>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-primary/8 px-4 py-2 text-sm text-primary">
                <Users className="size-4" />
                {payload.unassignedAttendees.length} waiting
              </div>
            </div>

            {payload.unassignedAttendees.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                No unassigned attendees match the current filters.
              </p>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-border/70">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border/70 text-sm">
                    <thead className="bg-muted/35">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Attendee</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Event</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Suggested scope</th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">Assign to room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-background/80">
                      {payload.unassignedAttendees.map((attendee) => (
                        <tr
                          key={attendee.attendeeId}
                          className={attendee.attendeeId === selectedAttendeeId ? "bg-primary/5 align-top" : "align-top"}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                                <BedDouble className="size-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">{attendee.attendeeName ?? "Unnamed attendee"}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{attendee.attendeeEmail ?? attendee.providerOrderId}</p>
                                <Link
                                  className="mt-2 inline-flex items-center text-xs font-medium text-primary"
                                  href={`/dashboard/attendees/${attendee.attendeeId}?search=${encodeURIComponent(attendee.attendeeName ?? attendee.providerOrderId)}&eventId=${encodeURIComponent(attendee.providerEventId)}&source=room-allocation`}
                                >
                                  Open attendee detail
                                  <ArrowRight className="ml-1 size-3" />
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            <p>{attendee.eventName ?? attendee.providerEventId}</p>
                            <p className="mt-1 text-xs">{attendee.ticketTypeLabel ?? "No ticket type"}</p>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            {attendee.matchingRoomCount} room{attendee.matchingRoomCount === 1 ? "" : "s"} fit the active filters.
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex min-w-[260px] flex-col gap-2">
                              <select
                                value={selectedRoomByAttendee[attendee.attendeeId] ?? ""}
                                onChange={(event) =>
                                  setSelectedRoomByAttendee((current) => ({
                                    ...current,
                                    [attendee.attendeeId]: event.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                              >
                                <option value="">Select room unit</option>
                                {assignableRooms.map((room) => (
                                  <option key={room.id} value={room.id}>
                                    {room.label} · {room.hotel.name} · {room.availableBeds} free
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                                disabled={isMutating || assignableRooms.length === 0}
                                onClick={() => void assignAttendee(attendee.attendeeId)}
                              >
                                Assign attendee
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </article>
        </div>
      </section>
    </section>
  )
}
