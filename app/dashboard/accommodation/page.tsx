"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  RefreshCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  appendSignalFiltersToQuery,
  normalizeSignalFilters,
  readSignalFiltersFromSearchParams,
  shouldRenderFamilyBadge,
  syncSignalFiltersToSearchParams,
  type AccommodationSignalFilters,
} from "./filter-state"

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
    hasFamily: boolean
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
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([])
  
  const selectedAttendeeId = selectedAttendeeIds[0] || null

  const toggleAttendeeSelection = (id: string) => {
    setSelectedAttendeeIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id)
      }
      return [...prev, id]
    })
  }

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
  const [appliedSignalFilters, setAppliedSignalFilters] =
    useState<AccommodationSignalFilters>(
      normalizeSignalFilters({
        genderType: null,
        allocationPriority: null,
        hasPriority: null,
        location: null,
        familyGroupId: null,
      })
    )
  const [roomsPage, setRoomsPage] = useState(1)

  const [selectedRoomByAttendee, setSelectedRoomByAttendee] = useState<
    Record<string, string>
  >({})

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
      familyGroupId?: string | null
      source?: string | null
    }) => {
      const params = new URLSearchParams(searchParams.toString())
      const currentSignals = readSignalFiltersFromSearchParams(searchParams)

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

      const nextSignals = normalizeSignalFilters({
        genderType:
          next.genderType !== undefined
            ? next.genderType
            : currentSignals.genderType,
        allocationPriority:
          next.allocationPriority !== undefined
            ? next.allocationPriority
            : currentSignals.allocationPriority,
        hasPriority:
          next.hasPriority !== undefined
            ? next.hasPriority
            : currentSignals.hasPriority,
        location:
          next.location !== undefined ? next.location : currentSignals.location,
        familyGroupId:
          next.familyGroupId !== undefined
            ? next.familyGroupId
            : currentSignals.familyGroupId,
      })

      syncSignalFiltersToSearchParams(params, nextSignals)

      if (next.availability && next.availability !== "all") {
        params.set("availability", next.availability)
      } else {
        params.delete("availability")
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
    const nextSignals = readSignalFiltersFromSearchParams(searchParams)

    setEventIdInput(nextEventId)
    setSearchInput(nextSearch)
    setHotelFilter(nextHotelId)
    setRoomTypeFilter(nextRoomTypeId)
    setAvailabilityFilter(nextAvailability)
    setGenderFilter(nextSignals.genderType ?? "")
    setPriorityFilter(nextSignals.allocationPriority ?? "")
    setHasPriorityFilter(nextSignals.hasPriority === true)
    setLocationFilter(nextSignals.location ?? "")

    setAppliedEventId(nextEventId)
    setAppliedSearch(nextSearch)
    setAppliedHotelFilter(nextHotelId)
    setAppliedRoomTypeFilter(nextRoomTypeId)
    setAppliedAvailability(nextAvailability)
    setAppliedSignalFilters(nextSignals)
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
      appendSignalFiltersToQuery(query, appliedSignalFilters)

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
    appliedSignalFilters,
  ])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const assignableRooms = useMemo(
    () => payload.rooms.filter((room) => room.availableBeds > 0),
    [payload.rooms]
  )


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
    appliedSignalFilters,
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
      genderType: genderFilter,
      allocationPriority: priorityFilter,
      hasPriority: hasPriorityFilter,
      location: locationFilter,
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

  async function assignMultipleAttendeesToRoom(attendeeIds: string[], roomId: string) {
    if (!roomId || attendeeIds.length === 0) return
    
    setIsMutating(true)
    setAssignmentMessage(null)
    
    try {
      // Loop or use a bulk endpoint if available. For now, sequential per current API pattern
      for (const id of attendeeIds) {
        await fetch("/api/dashboard/accommodation/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attendeeId: id, roomId }),
        })
      }
      
      setAssignmentMessage(`Assigned ${attendeeIds.length} attendees.`)
      setSelectedAttendeeIds([])
      await loadWorkspace()
    } catch (e) {
      setErrors(prev => ({ ...prev, assignments: "Bulk assignment failed." }))
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



  return (
    <section className="space-y-6">
      <header className="mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Room allocation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track hotel capacity, assign attendees, and keep accommodation decisions visible.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-xl bg-background/50 backdrop-blur"
            >
              <Link href="/dashboard/accommodation/inventory">
                Open stock
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white shadow-sm hover:opacity-90 transition-opacity"
              disabled={isLoadingProposal || payload.unassignedAttendees.length === 0}
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
              <Sparkles className="mr-1.5 size-3.5" />
              {isLoadingProposal ? "Generating..." : "Auto-allocate"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total capacity", value: totalCapacity.toLocaleString(), sub: `${payload.summary.totalRooms} rooms` },
            { label: "Occupancy", value: `${occupancyPercent}%`, sub: `${occupiedCapacity} beds used` },
            { label: "Unassigned", value: payload.summary.unassignedAttendees, sub: "Waiting list" },
            { label: "Inventory", value: payload.roomTypes.length, sub: `${payload.hotels.length} Hoteliers` },
          ].map((metric) => (
            <article key={metric.label} className="relative flex flex-col justify-center overflow-hidden rounded-2xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_8px_30px_rgb(113,84,255,0.2)] transition-transform hover:scale-[1.02]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 relative z-10">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold text-white relative z-10">{metric.value}</p>
              <p className="mt-1 text-[11px] font-medium text-white/50 relative z-10">{metric.sub}</p>
            </article>
          ))}
        </div>
      </header>

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

      <section className="flex flex-col gap-8">
        <div className="space-y-6">



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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 xl:gap-8 items-start">
          {/* PANE 1: Inbox of unassigned attendees */}
          <div className="flex flex-col rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-xl overflow-hidden h-[800px]">
            <div className="border-b border-border/60 bg-muted/30 px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm tracking-tight text-foreground">Inbox</h3>
                <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mt-0.5">
                  {payload.unassignedAttendees.length} Waiting
                </p>
              </div>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto p-3 space-y-2 transition-opacity duration-200 ${isLoading || isMutating ? "opacity-50 pointer-events-none" : ""}`}>
              {isLoading && payload.unassignedAttendees.length === 0 ? (
                <div className="p-8 flex items-center justify-center text-sm text-muted-foreground m-2">
                  Loading inbox...
                </div>
              ) : payload.unassignedAttendees.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-xl m-2 bg-background/50">
                  Inbox empty! All attendees have been placed.
                </div>
              ) : (
                payload.unassignedAttendees.map((attendee) => {
                  const isSelected = selectedAttendeeIds.includes(attendee.attendeeId)
                  return (
                    <div
                      key={attendee.attendeeId}
                      className={`group relative w-full flex flex-col items-start p-4 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? "border-[rgba(113,84,255,0.6)] bg-[rgba(113,84,255,0.08)] shadow-[0_0_20px_rgba(113,84,255,0.1)] selected-attendee"
                          : "border-border/40 bg-background/50 hover:bg-muted/30"
                      }`}
                      onClick={() => toggleAttendeeSelection(attendee.attendeeId)}
                    >
                      <div className="flex w-full items-start justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <div className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            isSelected 
                              ? "bg-primary border-primary text-primary-foreground" 
                              : "border-border bg-background"
                          }`}>
                            {isSelected && <Check className="size-3" />}
                          </div>
                          <p className="font-semibold text-sm text-foreground truncate">
                            {attendee.attendeeName ?? "Unnamed"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Link 
                            href={`/dashboard/attendees/${attendee.attendeeId}?search=${encodeURIComponent(
                              appliedSearch ||
                                attendee.attendeeName ||
                                attendee.providerOrderId
                            )}&eventId=${encodeURIComponent(appliedEventId || attendee.providerEventId)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                          {attendee.allocationPriority === "CRITICAL" && (
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">Crit</span>
                          )}
                        </div>
                      </div>
                      
                      <p className="mt-1 ml-7 text-xs text-muted-foreground truncate opacity-70">
                        {attendee.ticketTypeLabel ?? attendee.eventName}
                      </p>
                      
                      <div className="mt-3 ml-7 flex flex-wrap gap-1.5">
                        {attendee.genderType && attendee.genderType !== "UNKNOWN" && (
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                            attendee.genderType === "MALE" 
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                              : attendee.genderType === "FEMALE"
                                ? "bg-pink-500/10 text-pink-500 border-pink-500/20"
                                : "bg-muted/30 text-muted-foreground/80 border-border/40"
                          }`}>
                            {attendee.genderType.toLowerCase()}
                          </span>
                        )}
                        {attendee.location && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
                            <MapPin className="size-2.5" />
                            {attendee.location}
                          </span>
                        )}
                        {shouldRenderFamilyBadge(attendee) && (
                          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">Group</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* PANE 2: Visual Room Board */}
          <div id="assignment-queue" className="flex flex-col gap-4">
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">Room availability</h3>
                <p className="text-xs text-muted-foreground font-medium">{payload.rooms.length} filtered rooms</p>
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

            {isLoading && payload.rooms.length === 0 ? (
              <p className="mt-5 text-sm text-muted-foreground">
                Loading room overview...
              </p>
            ) : payload.rooms.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                No room stock matches the current filters.
              </p>
            ) : (
              <div className={`grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 transition-opacity duration-200 ${isLoading || isMutating ? "opacity-50 pointer-events-none" : ""}`}>
                {paginatedRooms.map((room) => (
                  <article key={room.id} className="flex flex-col rounded-2xl border border-border/70 bg-card/95 shadow-sm overflow-hidden transition-all hover:border-[rgba(113,84,255,0.3)] hover:shadow-md">
                    <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm text-foreground leading-none">{room.label}</p>
                            <span className={`inline-flex px-1.5 min-w-5 justify-center py-0.5 rounded text-[10px] font-medium ${room.availableBeds === 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"}`}>
                              {room.availableBeds} free
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground leading-none truncate max-w-[160px]">{room.hotel.name}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-2 p-3 bg-background/50 min-h-0">
                      {/* Render Occupied Slots */}
                      {room.occupants.map((occupant) => (
                        <div key={occupant.attendeeId} className="flex items-center justify-between group rounded-xl border border-border/40 bg-card p-2 shadow-sm transition-colors hover:border-border/80">
                          <div className="flex items-center gap-2 truncate">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                              <Users className="size-3.5 text-muted-foreground" />
                            </div>
                            <p className="text-xs font-medium text-foreground truncate">
                              {occupant.attendeeName ?? occupant.attendeeEmail ?? "Unnamed"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                            onClick={() => void unassignAttendee(occupant.attendeeId)}
                          >
                            <span className="sr-only">Remove</span>
                            <span aria-hidden="true">&times;</span>
                          </Button>
                        </div>
                      ))}

                      {/* Render Empty Slots */}
                      {Array.from({ length: room.availableBeds }).map((_, i) => (
                        <button
                          key={`empty-${room.id}-${i}`}
                          type="button"
                          disabled={!selectedAttendeeId || isMutating}
                          onClick={() => {
                            if (selectedAttendeeIds.length > 0) {
                               assignMultipleAttendeesToRoom(selectedAttendeeIds, room.id)
                            }
                          }}
                          className={`flex h-[46px] items-center justify-center rounded-xl border border-dashed transition-all ${
                            selectedAttendeeIds.length > 0 
                              ? "border-[rgba(113,84,255,0.4)] bg-[rgba(113,84,255,0.05)] text-[rgba(113,84,255,0.8)] hover:bg-[rgba(113,84,255,0.1)] hover:border-[rgba(113,84,255,0.6)] cursor-pointer" 
                              : "border-border/40 bg-background/50 text-muted-foreground/50 cursor-not-allowed"
                          }`}
                        >
                          <span className="text-xs font-medium">
                            {selectedAttendeeIds.length > 0 
                              ? `+ Assign ${selectedAttendeeIds.length > 1 ? `${selectedAttendeeIds.length} items` : "selected"}` 
                              : "+ Empty bed"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalRoomPages > 1 && (
              <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-4">
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
                    className="rounded-xl shadow-sm"
                    disabled={roomsPage === 1}
                    onClick={() => setRoomsPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="size-4 mr-1" /> Prev
                  </Button>
                  <span className="text-sm font-medium text-muted-foreground px-2">
                    Page {roomsPage} of {totalRoomPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl shadow-sm"
                    disabled={roomsPage === totalRoomPages}
                    onClick={() => setRoomsPage((current) => Math.min(totalRoomPages, current + 1))}
                  >
                    Next <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </section>
  )
}
