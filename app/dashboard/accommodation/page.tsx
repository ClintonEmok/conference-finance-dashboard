"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  BedDouble,
  Building2,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react"

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
    // Signal-aware filters
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    familyGroupId: string | null
    location: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    hasPriority: boolean | null
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
    // Signal fields
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    remarks: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    familyGroupId: string | null
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
    genderType: null,
    familyGroupId: null,
    location: null,
    allocationPriority: null,
    hasPriority: null,
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
  const [payload, setPayload] =
    useState<AccommodationWorkspacePayload>(emptyPayload)
  const [errors, setErrors] = useState<InventoryErrorState>(emptyErrors)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(
    null
  )

  const [eventIdInput, setEventIdInput] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [hotelFilter, setHotelFilter] = useState("")
  const [roomTypeFilter, setRoomTypeFilter] = useState("")
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>("all")
  // Signal-aware filters
  const [genderFilter, setGenderFilter] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")
  const [hasPriorityFilter, setHasPriorityFilter] = useState(false)
  const [locationFilter, setLocationFilter] = useState("")

  // Smart allocation proposal state
  const [proposal, setProposal] = useState<{
    suggestions: Array<{
      attendeeId: string
      attendeeName: string | null
      roomId: string
      roomLabel: string
      hotelName: string
      reason: string
      priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    }>
    unplacedAttendees: Array<{
      attendeeId: string
      attendeeName: string | null
      reason: string
      priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    }>
    summary: {
      totalSuggested: number
      totalUnplaced: number
      familyGroupsKeptTogether: number
      highPriorityPlaced: number
    }
  } | null>(null)
  const [isLoadingProposal, setIsLoadingProposal] = useState(false)
  const [showProposal, setShowProposal] = useState(false)

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [appliedHotelFilter, setAppliedHotelFilter] = useState("")
  const [appliedRoomTypeFilter, setAppliedRoomTypeFilter] = useState("")
  const [appliedAvailability, setAppliedAvailability] =
    useState<AvailabilityFilter>("all")
  const [roomsPage, setRoomsPage] = useState(1)

  const [selectedRoomByAttendee, setSelectedRoomByAttendee] = useState<
    Record<string, string>
  >({})

  const selectedAttendeeId = searchParams.get("attendeeId")

  const syncUrlState = useCallback(
    (next: {
      attendeeId?: string | null
      eventId?: string | null
      search?: string | null
      hotelId?: string | null
      roomTypeId?: string | null
      availability?: AvailabilityFilter
      genderType?: string | null
      allocationPriority?: string | null
      hasPriority?: boolean | null
      location?: string | null
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
      assign("genderType", next.genderType)
      assign("allocationPriority", next.allocationPriority)
      assign("location", next.location)

      if (next.availability && next.availability !== "all") {
        params.set("availability", next.availability)
      } else {
        params.delete("availability")
      }

      if (next.hasPriority) {
        params.set("hasPriority", "true")
      } else {
        params.delete("hasPriority")
      }

      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    const nextEventId = searchParams.get("eventId") ?? ""
    const nextSearch = searchParams.get("search") ?? ""
    const nextHotelId = searchParams.get("hotelId") ?? ""
    const nextRoomTypeId = searchParams.get("roomTypeId") ?? ""
    const nextAvailability =
      (searchParams.get("availability") as AvailabilityFilter | null) ?? "all"
    const nextGender = searchParams.get("genderType") ?? ""
    const nextPriority = searchParams.get("allocationPriority") ?? ""
    const nextHasPriority = searchParams.get("hasPriority") === "true"
    const nextLocation = searchParams.get("location") ?? ""

    setEventIdInput(nextEventId)
    setSearchInput(nextSearch)
    setHotelFilter(nextHotelId)
    setRoomTypeFilter(nextRoomTypeId)
    setAvailabilityFilter(nextAvailability)
    setGenderFilter(nextGender)
    setPriorityFilter(nextPriority)
    setHasPriorityFilter(nextHasPriority)
    setLocationFilter(nextLocation)

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
      // Signal-aware filters
      if (genderFilter) {
        query.set("genderType", genderFilter)
      }
      if (priorityFilter) {
        query.set("allocationPriority", priorityFilter)
      }
      if (hasPriorityFilter) {
        query.set("hasPriority", "true")
      }
      if (locationFilter.trim()) {
        query.set("location", locationFilter.trim())
      }

      const response = await fetch(
        `/api/dashboard/accommodation/assignments?${query.toString()}`
      )
      const body = (await response.json().catch(() => null)) as
        | AccommodationWorkspacePayload
        | { error?: { message?: string } }
        | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          global:
            body && "error" in body
              ? (body.error?.message ??
                "Failed to load accommodation workspace.")
              : "Failed to load accommodation workspace.",
        }))
        return
      }

      setPayload(body as AccommodationWorkspacePayload)
      setErrors((current) => ({ ...current, global: null }))
    } catch {
      setErrors((current) => ({
        ...current,
        global: "Network error while loading accommodation workspace.",
      }))
    } finally {
      setIsLoading(false)
    }
  }, [
    appliedAvailability,
    appliedEventId,
    appliedHotelFilter,
    appliedRoomTypeFilter,
    appliedSearch,
  ])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const assignableRooms = useMemo(
    () => payload.rooms.filter((room) => room.availableBeds > 0),
    [payload.rooms]
  )

  const selectedAttendeeContext = useMemo(() => {
    if (!selectedAttendeeId) {
      return null
    }

    const unassignedAttendee = payload.unassignedAttendees.find(
      (attendee) => attendee.attendeeId === selectedAttendeeId
    )

    if (unassignedAttendee) {
      return {
        status: "unassigned" as const,
        attendeeName: unassignedAttendee.attendeeName,
        attendeeEmail: unassignedAttendee.attendeeEmail,
        detailHref: `/dashboard/attendees/${unassignedAttendee.attendeeId}?search=${encodeURIComponent(
          appliedSearch ||
            unassignedAttendee.attendeeName ||
            unassignedAttendee.providerOrderId
        )}&eventId=${encodeURIComponent(appliedEventId || unassignedAttendee.providerEventId)}`,
      }
    }

    for (const room of payload.rooms) {
      const occupant = room.occupants.find(
        (attendee) => attendee.attendeeId === selectedAttendeeId
      )

      if (occupant) {
        return {
          status: "assigned" as const,
          attendeeName: occupant.attendeeName,
          attendeeEmail: occupant.attendeeEmail,
          roomLabel: room.label,
          hotelName: room.hotel.name,
          detailHref: `/dashboard/attendees/${occupant.attendeeId}?search=${encodeURIComponent(
            appliedSearch || occupant.attendeeName || occupant.providerOrderId
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
  }, [
    appliedEventId,
    appliedSearch,
    payload.rooms,
    payload.unassignedAttendees,
    selectedAttendeeId,
  ])

  const totalCapacity = useMemo(
    () => payload.rooms.reduce((sum, room) => sum + room.capacity, 0),
    [payload.rooms]
  )

  const occupiedCapacity = useMemo(
    () => payload.rooms.reduce((sum, room) => sum + room.occupiedBeds, 0),
    [payload.rooms]
  )

  const occupancyPercent =
    totalCapacity === 0
      ? 0
      : Math.round((occupiedCapacity / totalCapacity) * 100)

  const highlightedSuggestion = useMemo(() => {
    if (
      payload.unassignedAttendees.length === 0 ||
      assignableRooms.length === 0
    ) {
      return null
    }

    const attendee = payload.unassignedAttendees[0]
    const room = assignableRooms[0]
    const attendeeDisplayName =
      attendee.attendeeName?.trim() ||
      attendee.attendeeEmail ||
      attendee.providerOrderId

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

    return payload.hotels.filter((hotel) =>
      hotel.assignedEventIds.includes(eventIdInput)
    ).length
  }, [eventIdInput, payload.hotels])

  const roomsPerPage = 8

  const totalRoomPages = Math.max(
    1,
    Math.ceil(payload.rooms.length / roomsPerPage)
  )

  const paginatedRooms = useMemo(() => {
    const start = (roomsPage - 1) * roomsPerPage
    return payload.rooms.slice(start, start + roomsPerPage)
  }, [payload.rooms, roomsPage])

  useEffect(() => {
    setRoomsPage(1)
  }, [
    appliedAvailability,
    appliedEventId,
    appliedHotelFilter,
    appliedRoomTypeFilter,
    appliedSearch,
  ])

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
      setErrors((current) => ({
        ...current,
        assignments: "Select a room before assigning an attendee.",
      }))
      return
    }

    await assignAttendeeToSpecificRoom(attendeeId, roomId)
  }

  async function assignAttendeeToSpecificRoom(
    attendeeId: string,
    roomId: string
  ) {
    if (!roomId) {
      setErrors((current) => ({
        ...current,
        assignments: "Select a room before assigning an attendee.",
      }))
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

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          assignments: body?.error?.message ?? "Failed to assign attendee.",
        }))
        return
      }

      setErrors((current) => ({ ...current, assignments: null }))
      setAssignmentMessage(
        "Attendee assigned. Occupancy has been refreshed from live server data."
      )
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
      const response = await fetch(
        `/api/dashboard/accommodation/assignments/${attendeeId}`,
        {
          method: "DELETE",
        }
      )

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          assignments: body?.error?.message ?? "Failed to unassign attendee.",
        }))
        return
      }

      setErrors((current) => ({ ...current, assignments: null }))
      setAssignmentMessage(
        "Attendee removed from room. Occupancy has been refreshed from live server data."
      )
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
            <p className="text-xs font-semibold tracking-[0.24em] text-primary-foreground/55 uppercase">
              Rooms
            </p>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight text-primary-foreground">
              Room allocation manager
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/72">
              Track hotel capacity, assign attendees, and keep accommodation
              decisions visible in one operator workflow.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/20 bg-white/8 text-primary-foreground hover:bg-white/14 hover:text-primary-foreground"
            >
              <Link href="/dashboard/accommodation/inventory">
                Open room stock
              </Link>
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
            <p className="text-xs font-semibold tracking-[0.2em] text-primary-foreground/58 uppercase">
              Total capacity
            </p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">
              {totalCapacity.toLocaleString()}
            </p>
            <p className="mt-2 text-sm text-primary-foreground/68">
              {payload.summary.totalRooms} rooms in active scope
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary-foreground/58 uppercase">
              Occupied beds
            </p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">
              {occupiedCapacity.toLocaleString()}
            </p>
            <div className="mt-3 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.82),rgba(190,168,255,0.98))]"
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-primary-foreground/68">
              {occupancyPercent}% of current room capacity in use
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary-foreground/58 uppercase">
              Unassigned attendees
            </p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">
              {payload.summary.unassignedAttendees}
            </p>
            <p className="mt-2 text-sm text-primary-foreground/68">
              People still waiting for a room
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/18 p-5 shadow-[0_18px_40px_rgba(12,8,24,0.24)] backdrop-blur-sm">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary-foreground/58 uppercase">
              Room mix
            </p>
            <p className="mt-3 text-3xl font-semibold text-primary-foreground">
              {payload.roomTypes.length}
            </p>
            <p className="mt-2 text-sm text-primary-foreground/68">
              Across {payload.hotels.length} hotels
            </p>
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
                <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  Refine view
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  Filter the allocation board
                </h3>
              </div>
            </div>

            <form className="mt-5 space-y-4" onSubmit={applyFilters}>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">
                  Search rooms or attendees
                </span>
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
                    <option
                      key={event.providerEventId}
                      value={event.providerEventId}
                    >
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
                <span className="font-medium text-foreground">Gender</span>
                <select
                  value={genderFilter}
                  onChange={(event) => setGenderFilter(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="">All genders</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="MIXED">Mixed (Family)</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="">All priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Location</span>
                <input
                  value={locationFilter}
                  onChange={(event) => setLocationFilter(event.target.value)}
                  placeholder="Filter by location"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasPriorityFilter}
                  onChange={(event) =>
                    setHasPriorityFilter(event.target.checked)
                  }
                  className="size-4 rounded border-input"
                />
                <span className="font-medium text-foreground">
                  Priority only
                </span>
              </label>

              <label className="block space-y-2 text-sm">
                <span className="font-medium text-foreground">Status</span>
                <select
                  value={availabilityFilter}
                  onChange={(event) =>
                    setAvailabilityFilter(
                      event.target.value as AvailabilityFilter
                    )
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm"
                >
                  <option value="all">All rooms</option>
                  <option value="empty">Empty</option>
                  <option value="available">Available</option>
                  <option value="full">Occupied</option>
                </select>
              </label>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isLoading || isMutating}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                >
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
                    setGenderFilter("")
                    setPriorityFilter("")
                    setHasPriorityFilter(false)
                    setLocationFilter("")
                    setAssignmentMessage(null)
                    syncUrlState({
                      attendeeId: selectedAttendeeId,
                      eventId: null,
                      search: null,
                      hotelId: null,
                      roomTypeId: null,
                      availability: "all",
                      genderType: null,
                      allocationPriority: null,
                      hasPriority: null,
                      location: null,
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
              <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                Selected attendee
              </p>
              <h3 className="mt-2 text-lg font-semibold text-foreground">
                {selectedAttendeeContext.attendeeName ?? "Focused attendee"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedAttendeeContext.status === "assigned"
                  ? `${selectedAttendeeContext.attendeeName ?? "This attendee"} is already assigned to ${selectedAttendeeContext.roomLabel} at ${selectedAttendeeContext.hotelName}.`
                  : selectedAttendeeContext.status === "unassigned"
                    ? `${selectedAttendeeContext.attendeeName ?? "This attendee"} is unassigned and ready for room placement.`
                    : "This attendee is outside the current filters. Clear the filters or reopen from attendee detail."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="rounded-xl bg-background text-primary"
                >
                  <Link href={selectedAttendeeContext.detailHref}>
                    Open attendee detail
                  </Link>
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-white/12">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-primary-foreground/70 uppercase">
                    Suggestion
                  </p>
                  <h3 className="text-lg font-semibold">Smart allocation</h3>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-white/20 bg-white/10 text-primary-foreground hover:bg-white/20"
                disabled={
                  isLoadingProposal || payload.unassignedAttendees.length === 0
                }
                onClick={async () => {
                  setIsLoadingProposal(true)
                  try {
                    const response = await fetch(
                      "/api/dashboard/accommodation/auto-allocate",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          eventId: appliedEventId || null,
                        }),
                      }
                    )
                    if (response.ok) {
                      const data = await response.json()
                      setProposal(data)
                      setShowProposal(true)
                    }
                  } finally {
                    setIsLoadingProposal(false)
                  }
                }}
              >
                {isLoadingProposal ? "Generating..." : "Generate proposal"}
              </Button>
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

          {/* Smart Allocation Proposal Display */}
          {showProposal && proposal && (
            <article className="rounded-3xl border border-primary/20 bg-primary/6 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                    Smart Allocation Results
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">
                    Proposed assignments
                  </h3>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowProposal(false)
                    setProposal(null)
                  }}
                >
                  Close
                </Button>
              </div>

              {/* Summary stats */}
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-background/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-foreground">
                    {proposal.summary.totalSuggested}
                  </p>
                  <p className="text-xs text-muted-foreground">Suggested</p>
                </div>
                <div className="rounded-xl bg-background/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-foreground">
                    {proposal.summary.totalUnplaced}
                  </p>
                  <p className="text-xs text-muted-foreground">Unplaced</p>
                </div>
                <div className="rounded-xl bg-background/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-emerald-600">
                    {proposal.summary.familyGroupsKeptTogether}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Families together
                  </p>
                </div>
                <div className="rounded-xl bg-background/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-orange-600">
                    {proposal.summary.highPriorityPlaced}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    High priority placed
                  </p>
                </div>
              </div>

              {/* Suggestions list */}
              {proposal.suggestions.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-foreground">
                    Suggested placements
                  </h4>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {proposal.suggestions.map((suggestion, index) => (
                      <div
                        key={`${suggestion.attendeeId}-${index}`}
                        className="flex items-center justify-between rounded-lg bg-background/50 p-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {suggestion.attendeeName ?? "Unnamed"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            → {suggestion.roomLabel} at {suggestion.hotelName}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {suggestion.reason}
                          </p>
                          {suggestion.priority === "CRITICAL" && (
                            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                              Critical
                            </span>
                          )}
                          {suggestion.priority === "HIGH" && (
                            <span className="mt-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                              High
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unplaced attendees */}
              {proposal.unplacedAttendees.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-foreground">
                    Cannot be placed
                  </h4>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                    {proposal.unplacedAttendees.map((unplaced, index) => (
                      <div
                        key={`${unplaced.attendeeId}-${index}`}
                        className="flex items-center justify-between rounded-lg bg-red-50 p-3 dark:bg-red-950/20"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {unplaced.attendeeName ?? "Unnamed"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {unplaced.reason}
                          </p>
                        </div>
                        <div className="text-right">
                          {unplaced.priority === "CRITICAL" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                              Critical
                            </span>
                          )}
                          {unplaced.priority === "HIGH" && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                              High
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          )}
        </aside>

        <div className="space-y-6">
          <article
            id="assignment-queue"
            className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  Allocation board
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">
                  Room overview and occupancy
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-primary"
                disabled={isLoading || isMutating}
                onClick={() => void loadWorkspace()}
              >
                <RefreshCcw className="mr-2 size-4" />
                Refresh
              </Button>
            </div>

            {isLoading ? (
              <p className="mt-5 text-sm text-muted-foreground">
                Loading room overview...
              </p>
            ) : payload.rooms.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                No room stock matches the current filters.
              </p>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-border/70">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border/70 text-sm">
                    <thead className="bg-muted/35">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Room
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Hotel
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Type
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Occupancy
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Guests
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-background/80">
                      {paginatedRooms.map((room) => (
                        <tr
                          key={room.id}
                          className="cursor-pointer align-top transition-colors hover:bg-primary/5"
                          onClick={() =>
                            router.push(
                              `/dashboard/accommodation/rooms/${room.id}`
                            )
                          }
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                                <Building2 className="size-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">
                                  {room.label}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {room.availableBeds} bed
                                  {room.availableBeds === 1 ? "" : "s"} free
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            <p>{room.hotel.name}</p>
                            <p className="mt-1 text-xs">
                              {room.hotel.city ?? "City not set"}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              {room.roomType.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {room.occupiedBeds}/{room.capacity}
                            </p>
                            <p className="mt-1 text-xs">occupied beds</p>
                          </td>
                          <td className="px-4 py-4">
                            {room.occupants.length === 0 ? (
                              <span className="text-muted-foreground">
                                No attendees
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {room.occupants.slice(0, 2).map((occupant) => (
                                  <span
                                    key={occupant.attendeeId}
                                    className="rounded-full border border-border/80 bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground"
                                  >
                                    {occupant.attendeeName ??
                                      occupant.attendeeEmail ??
                                      occupant.providerOrderId}
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
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${availabilityClasses(room.availability)}`}
                            >
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
                    Showing {(roomsPage - 1) * roomsPerPage + 1}-
                    {Math.min(roomsPage * roomsPerPage, payload.rooms.length)}{" "}
                    of {payload.rooms.length} rooms
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      disabled={roomsPage === 1}
                      onClick={() =>
                        setRoomsPage((current) => Math.max(1, current - 1))
                      }
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
                      onClick={() =>
                        setRoomsPage((current) =>
                          Math.min(totalRoomPages, current + 1)
                        )
                      }
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
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Assignment queue
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">
                  Unassigned attendees
                </h3>
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
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Attendee
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Event
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Suggested scope
                        </th>
                        <th className="px-4 py-3 font-semibold text-muted-foreground">
                          Assign to room
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 bg-background/80">
                      {payload.unassignedAttendees.map((attendee) => (
                        <tr
                          key={attendee.attendeeId}
                          className={
                            attendee.attendeeId === selectedAttendeeId
                              ? "bg-primary/5 align-top"
                              : "align-top"
                          }
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                                <BedDouble className="size-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">
                                  {attendee.attendeeName ?? "Unnamed attendee"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {attendee.attendeeEmail ??
                                    attendee.providerOrderId}
                                </p>
                                {/* Signal badges */}
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {attendee.allocationPriority ===
                                    "CRITICAL" && (
                                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                      Critical
                                    </span>
                                  )}
                                  {attendee.allocationPriority === "HIGH" && (
                                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                      High
                                    </span>
                                  )}
                                  {attendee.genderType === "MALE" && (
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                      Male
                                    </span>
                                  )}
                                  {attendee.genderType === "FEMALE" && (
                                    <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                                      Female
                                    </span>
                                  )}
                                  {attendee.genderType === "MIXED" && (
                                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                      Family
                                    </span>
                                  )}
                                  {attendee.familyGroupId && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      Group
                                    </span>
                                  )}
                                  {attendee.location && (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                      {attendee.location}
                                    </span>
                                  )}
                                </div>
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
                            <p>
                              {attendee.eventName ?? attendee.providerEventId}
                            </p>
                            <p className="mt-1 text-xs">
                              {attendee.ticketTypeLabel ?? "No ticket type"}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            {attendee.matchingRoomCount} room
                            {attendee.matchingRoomCount === 1 ? "" : "s"} fit
                            the active filters.
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex min-w-[260px] flex-col gap-2">
                              <select
                                value={
                                  selectedRoomByAttendee[attendee.attendeeId] ??
                                  ""
                                }
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
                                    {room.label} · {room.hotel.name} ·{" "}
                                    {room.availableBeds} free
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                className="w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                                disabled={
                                  isMutating || assignableRooms.length === 0
                                }
                                onClick={() =>
                                  void assignAttendee(attendee.attendeeId)
                                }
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
