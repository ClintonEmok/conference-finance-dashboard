"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import {
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  LayoutGrid,
  MapPin,
  RefreshCcw,
  Search,
  Sparkles,
  Users,
  X,
  Calendar,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useEventsWithAccommodation } from "@/lib/convex/hooks/events"
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
      providerEventId: string
      eventName: string | null
      ticketTypeLabel: string | null
      orderId: string | null
    }>
    pendingAssignments: Array<{
      assignmentId: string
      attendeeId: string
      attendeeName: string | null
      attendeeEmail: string | null
      assignmentIntent: "assign" | "skip"
      sortOrder: number
    }>
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
  }>
  unassignedAttendees: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    orderId: string | null
    providerEventId: string
    eventName: string | null
    ticketTypeLabel: string | null
    allocatedRoomTypeId: string | null
    // Signal fields
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    remarks: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    hasFamily: boolean
  }>
  // Submission queue rows from canonical signup submissions
  submissionQueueRows?: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    source: "internal" | "integration"
    submissionId: string
    bookingRef: string | null
    eventName: string | null
    ticketTypeLabel: string | null
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    hasFamily: boolean
    // Assignment intent and notes
    assignmentIntent: "auto_assign" | "manual_select" | "defer" | null
    roommatePreference: string | null
    dietaryRestrictions: string | null
    bookerName: string | null
    submittedAt: string
    // Unresolved state
    isUnresolved: boolean
    unresolvedReason:
      | "no_assignment_record"
      | "skipped_intent"
      | "slot_not_assignable"
      | null
  }>
  summary: {
    totalRooms: number
    emptyRooms: number
    availableRooms: number
    fullRooms: number
    unassignedAttendees: number
    submissionQueueCount?: number
    unresolvedCount?: number
  }
}

type InventoryErrorState = {
  global: string | null
  assignments: string | null
}

type AssignmentToastState = {
  id: number
  title: string
  lines: string[]
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
    setSelectedAttendeeIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
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
  const [assignmentToast, setAssignmentToast] =
    useState<AssignmentToastState | null>(null)
  const toastIdRef = useRef(0)

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

  // Submission queue state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<
    string | null
  >(null)
  const [showSubmissionDetail, setShowSubmissionDetail] = useState(false)

  // Pending assignment confirmation dialog state
  const [selectedPendingAssignment, setSelectedPendingAssignment] = useState<{
    assignmentId: string
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    roomId: string
    roomLabel: string
  } | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [alternativeRooms, setAlternativeRooms] = useState<
    Array<{
      slotId: string
      roomId: string
      roomLabel: string
      roomType: string
      capacity: number | null
      occupantCount: number
      availableSpots: number | null
    }>
  >([])

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

  const roomLabelById = useMemo(() => {
    return new Map(payload.rooms.map((room) => [room.id, room.label]))
  }, [payload.rooms])

  const attendeeNameById = useMemo(() => {
    const names = new Map<string, string>()

    for (const attendee of payload.unassignedAttendees) {
      names.set(
        attendee.attendeeId,
        attendee.attendeeName ?? "Unnamed attendee"
      )
    }

    for (const room of payload.rooms) {
      for (const occupant of room.occupants) {
        names.set(
          occupant.attendeeId,
          occupant.attendeeName ?? "Unnamed attendee"
        )
      }
    }

    for (const suggestion of payload.buyerSuggestions ?? []) {
      names.set(
        suggestion.attendeeId,
        suggestion.attendeeName ?? "Unnamed attendee"
      )
    }

    return names
  }, [payload.buyerSuggestions, payload.rooms, payload.unassignedAttendees])

  const showAssignmentToast = useCallback((title: string, lines: string[]) => {
    const sanitizedLines = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 4)

    toastIdRef.current += 1
    setAssignmentToast({
      id: toastIdRef.current,
      title,
      lines: sanitizedLines,
    })
  }, [])

  useEffect(() => {
    if (!assignmentToast) {
      return
    }

    const timeout = window.setTimeout(() => {
      setAssignmentToast((current) =>
        current?.id === assignmentToast.id ? null : current
      )
    }, 4500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [assignmentToast])

  const buyerSuggestions = useMemo(() => {
    return [...(payload.buyerSuggestions ?? [])].sort((a, b) => {
      if ((a.roomLabel ?? "") !== (b.roomLabel ?? "")) {
        return (a.roomLabel ?? "").localeCompare(b.roomLabel ?? "")
      }

      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder
      }

      return (a.attendeeName ?? "").localeCompare(b.attendeeName ?? "")
    })
  }, [payload.buyerSuggestions])

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

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
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

  function pickFulfillRoom(
    attendee: {
      allocatedRoomTypeId: string | null
      orderId: string | null
    },
    rooms: AccommodationWorkspacePayload["rooms"]
  ) {
    if (!attendee.allocatedRoomTypeId) return null

    const candidates = rooms.filter(
      (room) =>
        room.roomType.id === attendee.allocatedRoomTypeId &&
        room.availableBeds > 0
    )

    const sameOrderRoom = attendee.orderId
      ? candidates.find((room) =>
          room.occupants.some(
            (occupant) => occupant.orderId === attendee.orderId
          )
        )
      : null

    return sameOrderRoom ?? candidates[0] ?? null
  }

  function getFulfillGroupAttendees(
    attendee: AccommodationWorkspacePayload["unassignedAttendees"][number],
    allUnassignedAttendees: AccommodationWorkspacePayload["unassignedAttendees"]
  ) {
    if (!attendee.orderId || !attendee.allocatedRoomTypeId) {
      return [attendee]
    }

    const sameOrderPendingAssignments = allUnassignedAttendees
      .filter((candidate) => candidate.orderId === attendee.orderId)
      .map((candidate) => ({
        attendeeId: candidate.attendeeId,
        roomId: getPendingBuyerAssignment(candidate.attendeeId)?.roomId ?? null,
      }))
      .filter((candidate) => candidate.roomId !== null)

    if (sameOrderPendingAssignments.length > 0) {
      const clickedRequestedRoomId =
        getPendingBuyerAssignment(attendee.attendeeId)?.roomId ?? null

      if (!clickedRequestedRoomId) {
        return [attendee]
      }

      const sameRequestedRoomGroup = allUnassignedAttendees.filter(
        (candidate) => {
          if (candidate.orderId !== attendee.orderId) {
            return false
          }

          const candidateRequestedRoomId =
            getPendingBuyerAssignment(candidate.attendeeId)?.roomId ?? null
          return candidateRequestedRoomId === clickedRequestedRoomId
        }
      )

      return sameRequestedRoomGroup.length > 0
        ? sameRequestedRoomGroup
        : [attendee]
    }

    const sameOrderAndRoomType = allUnassignedAttendees.filter(
      (candidate) =>
        candidate.orderId === attendee.orderId &&
        candidate.allocatedRoomTypeId === attendee.allocatedRoomTypeId
    )

    return sameOrderAndRoomType.length > 0 ? sameOrderAndRoomType : [attendee]
  }

  function pickGroupFulfillRoom(
    attendees: AccommodationWorkspacePayload["unassignedAttendees"],
    rooms: AccommodationWorkspacePayload["rooms"]
  ) {
    if (attendees.length === 0) return null

    const roomTypeId = attendees[0]?.allocatedRoomTypeId
    const orderId = attendees[0]?.orderId

    if (!roomTypeId) return null

    const candidates = rooms
      .filter(
        (room) => room.roomType.id === roomTypeId && room.availableBeds > 0
      )
      .filter((room) => room.availableBeds >= attendees.length)
      .sort((a, b) => {
        const aHasSameOrderOccupant = orderId
          ? a.occupants.some((occupant) => occupant.orderId === orderId)
          : false
        const bHasSameOrderOccupant = orderId
          ? b.occupants.some((occupant) => occupant.orderId === orderId)
          : false

        if (aHasSameOrderOccupant !== bHasSameOrderOccupant) {
          return aHasSameOrderOccupant ? -1 : 1
        }

        const aBedsAfterPlacement = a.availableBeds - attendees.length
        const bBedsAfterPlacement = b.availableBeds - attendees.length
        if (aBedsAfterPlacement !== bBedsAfterPlacement) {
          return aBedsAfterPlacement - bBedsAfterPlacement
        }

        return a.label.localeCompare(b.label)
      })

    return candidates[0] ?? null
  }

  function getPendingBuyerAssignment(attendeeId: string) {
    return (
      payload.buyerSuggestions?.find(
        (assignment) =>
          assignment.attendeeId === attendeeId &&
          assignment.assignmentIntent === "assign"
      ) ?? null
    )
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

      const attendeeName =
        attendeeNameById.get(attendeeId) ?? "Unnamed attendee"
      const roomLabel = roomLabelById.get(roomId) ?? "selected room"

      setErrors((current) => ({ ...current, assignments: null }))
      setAssignmentMessage(
        "Attendee assigned. Occupancy has been refreshed from live server data."
      )
      showAssignmentToast("Room assignment saved", [
        `${attendeeName} -> ${roomLabel}`,
      ])
      setSelectedRoomByAttendee((current) => {
        const next = { ...current }
        delete next[attendeeId]
        return next
      })
      await loadWorkspace()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to assign attendee to room."
      setErrors((current) => ({
        ...current,
        assignments: message,
      }))
    } finally {
      setIsMutating(false)
    }
  }

  async function assignMultipleAttendeesToRoom(
    attendeeIds: string[],
    roomId: string
  ) {
    if (!roomId || attendeeIds.length === 0) return

    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      // Loop or use a bulk endpoint if available. For now, sequential per current API pattern
      for (const id of attendeeIds) {
        const response = await fetch(
          "/api/dashboard/accommodation/assignments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeId: id, roomId }),
          }
        )

        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null

        if (!response.ok) {
          setErrors((prev) => ({
            ...prev,
            assignments:
              body?.error?.message ??
              `Failed while assigning attendee ${id} in group action.`,
          }))
          return
        }
      }

      const roomLabel = roomLabelById.get(roomId) ?? "selected room"
      const assignmentLines = attendeeIds
        .slice(0, 3)
        .map(
          (id) =>
            `${attendeeNameById.get(id) ?? "Unnamed attendee"} -> ${roomLabel}`
        )

      if (attendeeIds.length > 3) {
        const remainder = attendeeIds.length - 3
        assignmentLines.push(
          `+${remainder} more attendee${remainder === 1 ? "" : "s"}`
        )
      }

      setErrors((prev) => ({ ...prev, assignments: null }))
      setAssignmentMessage(`Assigned ${attendeeIds.length} attendees.`)
      showAssignmentToast(
        `Assigned ${attendeeIds.length} attendee${attendeeIds.length === 1 ? "" : "s"}`,
        assignmentLines
      )
      setSelectedAttendeeIds([])
      await loadWorkspace()
    } catch (e) {
      setErrors((prev) => ({ ...prev, assignments: "Bulk assignment failed." }))
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

  async function confirmPendingAssignment(
    assignmentId: string,
    slotId?: string
  ) {
    setIsMutating(true)
    setAssignmentMessage(null)
    setAlternativeRooms([])

    try {
      const response = await fetch(
        "/api/dashboard/accommodation/assignments/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId, slotId }),
        }
      )

      const body = (await response.json().catch(() => null)) as {
        success?: boolean
        error?: string
        message?: string
        alternatives?: Array<{
          slotId: string
          roomId: string
          roomLabel: string
          roomType: string
          capacity: number | null
          occupantCount: number
          availableSpots: number | null
        }>
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          assignments: body?.message ?? "Failed to confirm assignment.",
        }))
        return
      }

      if (body?.error === "SLOT_FULL") {
        // Room is full, show alternatives
        setAlternativeRooms(body.alternatives ?? [])
        setAssignmentMessage(
          "The requested room is full. Please select an alternative."
        )
        return
      }

      if (body?.success) {
        const suggestion = payload.buyerSuggestions?.find(
          (item) => item.assignmentId === assignmentId
        )
        const selectedAlternativeRoomLabel =
          slotId != null
            ? alternativeRooms.find((room) => room.slotId === slotId)?.roomLabel
            : null
        const resolvedRoomLabel =
          selectedAlternativeRoomLabel ??
          suggestion?.roomLabel ??
          "requested room"
        const attendeeName =
          suggestion?.attendeeName ??
          attendeeNameById.get(suggestion?.attendeeId ?? "") ??
          "Unnamed attendee"

        setErrors((current) => ({ ...current, assignments: null }))
        setAssignmentMessage("Assignment confirmed successfully.")
        showAssignmentToast("Request fulfilled", [
          `${attendeeName} -> ${resolvedRoomLabel}`,
        ])
        setShowConfirmDialog(false)
        setSelectedPendingAssignment(null)
        await loadWorkspace()
      }
    } finally {
      setIsMutating(false)
    }
  }

  async function removePendingAssignment(
    assignmentId: string,
    reason?: string
  ) {
    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      const response = await fetch(
        `/api/dashboard/accommodation/assignments/remove`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignmentId, reason }),
        }
      )

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          assignments: body?.error?.message ?? "Failed to remove assignment.",
        }))
        return
      }

      setErrors((current) => ({ ...current, assignments: null }))
      setAssignmentMessage("Assignment removed.")
      setShowConfirmDialog(false)
      setSelectedPendingAssignment(null)
      await loadWorkspace()
    } finally {
      setIsMutating(false)
    }
  }

  // Event selector when no event is selected
  const eventsWithAccommodation = useEventsWithAccommodation()
  const currentEventId = searchParams.get("eventId")

  if (!currentEventId) {
    return (
      <section className="space-y-6">
        <header className="mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Accommodation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select an event to manage room assignments and accommodation
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventsWithAccommodation === undefined ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : eventsWithAccommodation.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BedDouble className="mb-4 size-12 text-muted-foreground/50" />
                <p className="text-lg font-medium">
                  No events with accommodation
                </p>
                <p className="text-sm text-muted-foreground">
                  Enable accommodation in event settings to get started
                </p>
                <Button className="mt-4" asChild>
                  <Link href="/dashboard/events">View Events</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            eventsWithAccommodation.map((event) => (
              <Card
                key={event._id}
                className="cursor-pointer transition-all hover:shadow-md"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set("eventId", event._id)
                  router.push(`${pathname}?${params.toString()}`)
                }}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="size-4 text-muted-foreground" />
                    {event.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.startsAt), "MMM d, yyyy")}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {event.isPublished ? "Published" : "Draft"} •{" "}
                    {event.isSignupOpen ? "Signups Open" : "Signups Closed"}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <header className="mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Room allocation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track hotel capacity, assign attendees, and keep accommodation
              decisions visible.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-10 rounded-lg border-border/50 bg-card/40 text-xs font-bold shadow-sm backdrop-blur"
            >
              <Link href="/dashboard/accommodation/inventory">
                <LayoutGrid className="mr-2 size-3.5" /> Open stock
              </Link>
            </Button>
            {/* <Button
              type="button"
              size="sm"
              className="h-10 rounded-lg bg-primary text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95"
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
              {isLoadingProposal ? "Generating..." : "Auto-allocate"}
            </Button> */}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total capacity",
              value: totalCapacity.toLocaleString(),
              sub: `${payload.summary.totalRooms} rooms`,
            },
            {
              label: "Occupancy",
              value: `${occupancyPercent}%`,
              sub: `${occupiedCapacity} beds used`,
            },
            {
              label: "Unassigned",
              value: payload.unassignedAttendees.length,
              sub: "Waiting list",
            },
            {
              label: "Inventory",
              value: payload.roomTypes.length,
              sub: `${payload.hotels.length} Hoteliers`,
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="relative flex flex-col justify-center overflow-hidden rounded-2xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_8px_30px_rgb(113,84,255,0.2)] transition-transform hover:scale-[1.02]"
            >
              <p className="relative z-10 text-[10px] font-bold tracking-[0.2em] text-white/60 uppercase">
                {metric.label}
              </p>
              <p className="relative z-10 mt-2 text-2xl font-bold text-white">
                {metric.value}
              </p>
              <p className="relative z-10 mt-1 text-[11px] font-medium text-white/50">
                {metric.sub}
              </p>
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

      {buyerSuggestions.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                Contact person suggestions
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Pending requests captured during signup.
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {buyerSuggestions.length} pending
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {buyerSuggestions.map((suggestion) => {
                const roomId = suggestion.roomId
                const roomLabel = suggestion.roomLabel
                const canReview =
                  suggestion.assignmentIntent === "assign" &&
                  !!roomId &&
                  !!roomLabel

                return (
                  <div
                    key={suggestion.assignmentId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {suggestion.attendeeName ?? "Unnamed"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {suggestion.hotelName ?? "Unknown hotel"} •{" "}
                        {roomLabel ?? "Unknown room"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          suggestion.assignmentIntent === "skip"
                            ? "bg-amber-500/10 text-amber-700"
                            : "bg-emerald-500/10 text-emerald-600"
                        )}
                      >
                        {suggestion.assignmentIntent === "skip"
                          ? "Skip request"
                          : "Suggested"}
                      </span>
                      {canReview && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs"
                          onClick={() => {
                            setSelectedPendingAssignment({
                              assignmentId: suggestion.assignmentId,
                              attendeeId: suggestion.attendeeId,
                              attendeeName: suggestion.attendeeName,
                              attendeeEmail: suggestion.attendeeEmail,
                              roomId: roomId!,
                              roomLabel: roomLabel!,
                            })
                            setAlternativeRooms([])
                            setShowConfirmDialog(true)
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
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

              {/* Submission Queue Display */}
              {payload.submissionQueueRows &&
                payload.submissionQueueRows.length > 0 && (
                  <>
                    <section className="mb-6 rounded-3xl border border-border/60 bg-card/60 p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                            Signup Queue
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-foreground">
                            Internal Submissions
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-600">
                            {
                              payload.submissionQueueRows.filter(
                                (r) => r.isUnresolved
                              ).length
                            }{" "}
                            unresolved
                          </span>
                          <span className="text-xs text-muted-foreground">
                            of {payload.submissionQueueRows.length} total
                          </span>
                        </div>
                      </div>

                      {/* Queue rows - sorted by unresolved first */}
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {payload.submissionQueueRows
                          .sort((a, b) => {
                            // Unresolved first, then by submittedAt, then by attendeeId
                            if (a.isUnresolved !== b.isUnresolved)
                              return a.isUnresolved ? -1 : 1
                            const aTime = a.submittedAt
                              ? new Date(a.submittedAt).getTime()
                              : 0
                            const bTime = b.submittedAt
                              ? new Date(b.submittedAt).getTime()
                              : 0
                            if (aTime !== bTime) return aTime - bTime
                            return a.attendeeId.localeCompare(b.attendeeId)
                          })
                          .map((row) => (
                            <div
                              key={row.submissionId + row.attendeeId}
                              className={cn(
                                "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all hover:bg-muted/30",
                                row.isUnresolved
                                  ? "border-orange-200 bg-orange-50/30 dark:border-orange-900/30 dark:bg-orange-950/10"
                                  : "border-border/40 bg-background/50"
                              )}
                              onClick={() => {
                                setSelectedSubmissionId(row.submissionId)
                                setShowSubmissionDetail(true)
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "flex size-8 items-center justify-center rounded-lg",
                                    row.isUnresolved
                                      ? "bg-orange-500/10 text-orange-600"
                                      : "bg-emerald-500/10 text-emerald-600"
                                  )}
                                >
                                  {row.isUnresolved ? (
                                    <Clock className="size-4" />
                                  ) : (
                                    <Check className="size-4" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {row.attendeeName ?? "Unnamed"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {row.bookingRef && `Ref: ${row.bookingRef}`}{" "}
                                    {row.bookerName && `• ${row.bookerName}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {row.isUnresolved && row.unresolvedReason && (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                    {row.unresolvedReason ===
                                    "no_assignment_record"
                                      ? "No record"
                                      : row.unresolvedReason ===
                                          "skipped_intent"
                                        ? "Skipped"
                                        : "Not assignable"}
                                  </span>
                                )}
                                {row.genderType &&
                                  row.genderType !== "UNKNOWN" && (
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                                        row.genderType === "MALE"
                                          ? "border-blue-500/20 bg-blue-500/10 text-blue-500"
                                          : row.genderType === "FEMALE"
                                            ? "border-pink-500/20 bg-pink-500/10 text-pink-500"
                                            : "border-border/40 bg-muted/30 text-muted-foreground/80"
                                      )}
                                    >
                                      {row.genderType.toLowerCase()}
                                    </span>
                                  )}
                                {row.location && (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
                                    <MapPin className="size-2.5" />
                                    {row.location}
                                  </span>
                                )}
                                {row.hasFamily && (
                                  <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                    Group
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </section>

                    {/* Submission Detail Side Panel */}
                    {showSubmissionDetail && selectedSubmissionId && (
                      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card/95 shadow-2xl backdrop-blur-xl">
                        <div className="flex h-full flex-col">
                          {(() => {
                            const submission =
                              payload.submissionQueueRows?.find(
                                (r) => r.submissionId === selectedSubmissionId
                              )
                            if (!submission) return null
                            return (
                              <>
                                <header className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                                  <div>
                                    <h3 className="text-lg font-semibold text-foreground">
                                      Submission Details
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                      {submission.bookingRef ??
                                        "No booking ref"}
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setShowSubmissionDetail(false)
                                    }
                                  >
                                    <X className="size-4" />
                                  </Button>
                                </header>

                                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                                  {/* Attendee Info */}
                                  <Card>
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-sm font-medium">
                                        Attendee
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      <div>
                                        <p className="text-sm font-medium text-foreground">
                                          {submission.attendeeName ?? "Unnamed"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {submission.attendeeEmail}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {submission.genderType &&
                                          submission.genderType !==
                                            "UNKNOWN" && (
                                            <span
                                              className={cn(
                                                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                                                submission.genderType === "MALE"
                                                  ? "border-blue-500/20 bg-blue-500/10 text-blue-500"
                                                  : submission.genderType ===
                                                      "FEMALE"
                                                    ? "border-pink-500/20 bg-pink-500/10 text-pink-500"
                                                    : "border-border/40 bg-muted/30 text-muted-foreground/80"
                                              )}
                                            >
                                              {submission.genderType.toLowerCase()}
                                            </span>
                                          )}
                                        {submission.location && (
                                          <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
                                            <MapPin className="size-2.5" />
                                            {submission.location}
                                          </span>
                                        )}
                                        {submission.hasFamily && (
                                          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                            Group
                                          </span>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>

                                  {/* Assignment Status */}
                                  <Card>
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-sm font-medium">
                                        Assignment Status
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                      {submission.isUnresolved ? (
                                        <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950/20">
                                          <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                                            Unresolved
                                          </p>
                                          <p className="text-xs text-orange-600/80 dark:text-orange-400/80">
                                            {submission.unresolvedReason ===
                                            "no_assignment_record"
                                              ? "No assignment record found"
                                              : submission.unresolvedReason ===
                                                  "skipped_intent"
                                                ? "Assignment was skipped"
                                                : submission.unresolvedReason ===
                                                    "slot_not_assignable"
                                                  ? "Selected slot is not assignable"
                                                  : "Unknown reason"}
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/20">
                                          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                            Resolved
                                          </p>
                                          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                                            Assignment intent:{" "}
                                            {submission.assignmentIntent ??
                                              "N/A"}
                                          </p>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>

                                  {/* Preferences */}
                                  {(submission.roommatePreference ||
                                    submission.dietaryRestrictions) && (
                                    <Card>
                                      <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium">
                                          Preferences
                                        </CardTitle>
                                      </CardHeader>
                                      <CardContent className="space-y-3">
                                        {submission.roommatePreference && (
                                          <div>
                                            <p className="text-xs text-muted-foreground">
                                              Roommate preference
                                            </p>
                                            <p className="text-sm text-foreground">
                                              {submission.roommatePreference}
                                            </p>
                                          </div>
                                        )}
                                        {submission.dietaryRestrictions && (
                                          <div>
                                            <p className="text-xs text-muted-foreground">
                                              Dietary restrictions
                                            </p>
                                            <p className="text-sm text-foreground">
                                              {submission.dietaryRestrictions}
                                            </p>
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  )}

                                  {/* Booking Info */}
                                  <Card>
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-sm font-medium">
                                        Booking Info
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                      {submission.bookingRef && (
                                        <div className="flex justify-between">
                                          <span className="text-xs text-muted-foreground">
                                            Booking Ref
                                          </span>
                                          <span className="text-sm text-foreground">
                                            {submission.bookingRef}
                                          </span>
                                        </div>
                                      )}
                                      {submission.bookerName && (
                                        <div className="flex justify-between">
                                          <span className="text-xs text-muted-foreground">
                                            Booker
                                          </span>
                                          <span className="text-sm text-foreground">
                                            {submission.bookerName}
                                          </span>
                                        </div>
                                      )}
                                      {submission.submittedAt && (
                                        <div className="flex justify-between">
                                          <span className="text-xs text-muted-foreground">
                                            Submitted
                                          </span>
                                          <span className="text-sm text-foreground">
                                            {new Date(
                                              submission.submittedAt
                                            ).toLocaleDateString()}
                                          </span>
                                        </div>
                                      )}
                                      {submission.eventName && (
                                        <div className="flex justify-between">
                                          <span className="text-xs text-muted-foreground">
                                            Event
                                          </span>
                                          <span className="text-sm text-foreground">
                                            {submission.eventName}
                                          </span>
                                        </div>
                                      )}
                                      {submission.ticketTypeLabel && (
                                        <div className="flex justify-between">
                                          <span className="text-xs text-muted-foreground">
                                            Ticket Type
                                          </span>
                                          <span className="text-sm text-foreground">
                                            {submission.ticketTypeLabel}
                                          </span>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </aside>
                    )}
                  </>
                )}

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

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr] xl:gap-8">
          {/* PANE 1: Inbox of unassigned attendees */}
          <div className="flex h-[800px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold tracking-tight text-foreground">
                  Inbox
                </h3>
                <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {payload.unassignedAttendees.length} Waiting
                </p>
              </div>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </div>
            </div>
            <div
              className={`flex-1 space-y-2 overflow-y-auto p-3 transition-opacity duration-200 ${isLoading || isMutating ? "pointer-events-none opacity-50" : ""}`}
            >
              {isLoading && payload.unassignedAttendees.length === 0 ? (
                <div className="space-y-2 p-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-3 rounded-xl border border-border/20 bg-background/30 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-5 rounded-md" />
                        <Skeleton className="h-4 w-32 rounded-md" />
                      </div>
                      <Skeleton className="ml-7 h-3 w-48 rounded-md" />
                      <div className="ml-7 flex gap-1.5">
                        <Skeleton className="h-4 w-12 rounded-md" />
                        <Skeleton className="h-4 w-16 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : payload.unassignedAttendees.length === 0 ? (
                <div className="m-2 rounded-xl border border-dashed border-border/60 bg-background/50 p-8 text-center text-sm text-muted-foreground">
                  Inbox empty! All attendees have been placed.
                </div>
              ) : (
                payload.unassignedAttendees.map((attendee) => {
                  const isSelected = selectedAttendeeIds.includes(
                    attendee.attendeeId
                  )
                  const fulfillGroupAttendees = getFulfillGroupAttendees(
                    attendee,
                    payload.unassignedAttendees
                  )
                  const isGroupFulfill = fulfillGroupAttendees.length > 1
                  return (
                    <div
                      key={attendee.attendeeId}
                      className={`group relative flex w-full cursor-pointer flex-col items-start rounded-xl border p-4 transition-all select-none ${
                        isSelected
                          ? "selected-attendee border-[rgba(113,84,255,0.6)] bg-[rgba(113,84,255,0.08)] shadow-[0_0_20px_rgba(113,84,255,0.1)]"
                          : "border-border/40 bg-background/50 hover:bg-muted/30"
                      }`}
                      onClick={() =>
                        toggleAttendeeSelection(attendee.attendeeId)
                      }
                    >
                      <div className="flex w-full items-start justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <div
                            className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            }`}
                          >
                            {isSelected && <Check className="size-3" />}
                          </div>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {attendee.attendeeName ?? "Unnamed"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Link
                            href={`/dashboard/attendees/${attendee.attendeeId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-muted-foreground transition-colors hover:text-primary"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                          {attendee.allocationPriority === "CRITICAL" && (
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                              Crit
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-1 ml-7 truncate text-xs text-muted-foreground opacity-70">
                        {attendee.ticketTypeLabel ?? attendee.eventName}
                      </p>

                      <div className="mt-3 ml-7 flex flex-wrap gap-1.5">
                        {attendee.allocatedRoomTypeId && (
                          <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                            {payload.roomTypes.find(
                              (rt) => rt.id === attendee.allocatedRoomTypeId
                            )?.label ?? "Room type"}
                          </span>
                        )}
                        {attendee.genderType &&
                          attendee.genderType !== "UNKNOWN" && (
                            <span
                              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                                attendee.genderType === "MALE"
                                  ? "border-blue-500/20 bg-blue-500/10 text-blue-500"
                                  : attendee.genderType === "FEMALE"
                                    ? "border-pink-500/20 bg-pink-500/10 text-pink-500"
                                    : "border-border/40 bg-muted/30 text-muted-foreground/80"
                              }`}
                            >
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
                          <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600">
                            Group
                          </span>
                        )}
                        {attendee.allocatedRoomTypeId && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 rounded-md bg-violet-500/10 px-2 text-[10px] font-medium text-violet-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-violet-600 hover:text-white"
                            onClick={async (e) => {
                              e.stopPropagation()
                              const attendeesWithPendingAssignments =
                                fulfillGroupAttendees
                                  .map((groupMember) => ({
                                    attendeeId: groupMember.attendeeId,
                                    assignment: getPendingBuyerAssignment(
                                      groupMember.attendeeId
                                    ),
                                  }))
                                  .filter((entry) => entry.assignment !== null)
                                  .map((entry) => ({
                                    attendeeId: entry.attendeeId,
                                    assignmentId:
                                      entry.assignment!.assignmentId,
                                  }))

                              for (const entry of attendeesWithPendingAssignments) {
                                await confirmPendingAssignment(
                                  entry.assignmentId
                                )
                              }

                              const remainingAttendees =
                                fulfillGroupAttendees.filter(
                                  (groupMember) =>
                                    !attendeesWithPendingAssignments.some(
                                      (entry) =>
                                        entry.attendeeId ===
                                        groupMember.attendeeId
                                    )
                                )

                              if (remainingAttendees.length === 0) {
                                return
                              }

                              const matchingRoom = isGroupFulfill
                                ? pickGroupFulfillRoom(
                                    remainingAttendees,
                                    payload.rooms
                                  )
                                : pickFulfillRoom(attendee, payload.rooms)
                              if (matchingRoom) {
                                if (isGroupFulfill) {
                                  await assignMultipleAttendeesToRoom(
                                    remainingAttendees.map(
                                      (groupMember) => groupMember.attendeeId
                                    ),
                                    matchingRoom.id
                                  )
                                } else {
                                  await assignAttendeeToSpecificRoom(
                                    attendee.attendeeId,
                                    matchingRoom.id
                                  )
                                }
                              } else {
                                setErrors((current) => ({
                                  ...current,
                                  assignments: isGroupFulfill
                                    ? `No room has enough available beds to fulfill this group (${fulfillGroupAttendees.length}).`
                                    : "No available rooms of the matching room type.",
                                }))
                              }
                            }}
                          >
                            {isGroupFulfill
                              ? `Fulfill ${fulfillGroupAttendees.length}`
                              : "Fulfill"}
                          </Button>
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
            <div className="mb-4 flex items-center justify-between px-1">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  Room availability
                </h3>
                <p className="text-xs font-medium text-muted-foreground">
                  {payload.rooms.length} filtered rooms
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-lg border-border/50 bg-card/40 text-xs font-bold shadow-sm backdrop-blur"
                disabled={isLoading || isMutating}
                onClick={() => void loadWorkspace()}
              >
                <RefreshCcw
                  className={cn("mr-2 size-3.5", isLoading && "animate-spin")}
                />
                Refresh
              </Button>
            </div>

            {isLoading && payload.rooms.length === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-[240px] flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/60"
                  >
                    <div className="flex items-center gap-3 border-b border-border/10 bg-muted/10 p-4">
                      <Skeleton className="size-8 rounded-lg" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24 rounded-md" />
                        <Skeleton className="h-3 w-32 rounded-md" />
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : payload.rooms.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                No room stock matches the current filters.
              </p>
            ) : (
              <div
                className={`grid gap-4 transition-opacity duration-200 sm:grid-cols-2 2xl:grid-cols-3 ${isLoading || isMutating ? "pointer-events-none opacity-50" : ""}`}
              >
                {paginatedRooms.map((room) => (
                  <article
                    key={room.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm transition-all hover:border-[rgba(113,84,255,0.3)] hover:shadow-md"
                  >
                    <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm leading-none font-semibold text-foreground">
                              {room.label}
                            </p>
                            <span
                              className={`inline-flex min-w-5 justify-center rounded px-1.5 py-0.5 text-[10px] font-medium ${room.availableBeds === 0 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"}`}
                            >
                              {room.availableBeds} free
                            </span>
                          </div>
                          <p className="mt-1 max-w-[160px] truncate text-[11px] leading-none text-muted-foreground">
                            {room.hotel.name}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-2 bg-background/50 p-3">
                      {/* Render Occupied Slots */}
                      {room.occupants.map((occupant) => (
                        <div
                          key={occupant.attendeeId}
                          className="group flex items-center justify-between rounded-xl border border-border/40 bg-card p-2 shadow-sm transition-colors hover:border-border/80"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                              <Users className="size-3.5 text-muted-foreground" />
                            </div>
                            <p className="truncate text-xs font-medium text-foreground">
                              {occupant.attendeeName ??
                                occupant.attendeeEmail ??
                                "Unnamed"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-7 shrink-0 p-0 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              void unassignAttendee(occupant.attendeeId)
                            }
                          >
                            <span className="sr-only">Remove</span>
                            <span aria-hidden="true">&times;</span>
                          </Button>
                        </div>
                      ))}

                      {/* Render Pending Assignments (Buyer Intent) */}
                      {room.pendingAssignments?.map((pending) => (
                        <div
                          key={pending.assignmentId}
                          className="group flex items-center justify-between rounded-xl border border-dashed border-gray-300 bg-gray-100/50 p-2 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-100"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-200">
                              <Clock className="size-3.5 text-gray-500" />
                            </div>
                            <div className="flex flex-col">
                              <p className="truncate text-xs font-medium text-gray-700">
                                {pending.attendeeName ??
                                  pending.attendeeEmail ??
                                  "Unnamed"}
                              </p>
                              <p className="text-[9px] text-gray-400">
                                Request
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs font-medium text-emerald-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-emerald-50 hover:text-emerald-700"
                            onClick={() => {
                              setSelectedPendingAssignment({
                                assignmentId: pending.assignmentId,
                                attendeeId: pending.attendeeId,
                                attendeeName: pending.attendeeName,
                                attendeeEmail: pending.attendeeEmail,
                                roomId: room.id,
                                roomLabel: room.label,
                              })
                              setAlternativeRooms([])
                              setShowConfirmDialog(true)
                            }}
                          >
                            Confirm
                          </Button>
                        </div>
                      ))}

                      {/* Render Empty Slots */}
                      {Array.from({ length: room.availableBeds }).map(
                        (_, i) => (
                          <button
                            key={`empty-${room.id}-${i}`}
                            type="button"
                            disabled={!selectedAttendeeId || isMutating}
                            onClick={() => {
                              if (selectedAttendeeIds.length > 0) {
                                assignMultipleAttendeesToRoom(
                                  selectedAttendeeIds,
                                  room.id
                                )
                              }
                            }}
                            className={`flex h-[46px] items-center justify-center rounded-xl border border-dashed transition-all ${
                              selectedAttendeeIds.length > 0
                                ? "cursor-pointer border-[rgba(113,84,255,0.4)] bg-[rgba(113,84,255,0.05)] text-[rgba(113,84,255,0.8)] hover:border-[rgba(113,84,255,0.6)] hover:bg-[rgba(113,84,255,0.1)]"
                                : "cursor-not-allowed border-border/40 bg-background/50 text-muted-foreground/50"
                            }`}
                          >
                            <span className="text-xs font-medium">
                              {selectedAttendeeIds.length > 0
                                ? `+ Assign ${selectedAttendeeIds.length > 1 ? `${selectedAttendeeIds.length} items` : "selected"}`
                                : "+ Empty bed"}
                            </span>
                          </button>
                        )
                      )}
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
                  {Math.min(roomsPage * roomsPerPage, payload.rooms.length)} of{" "}
                  {payload.rooms.length} rooms
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl shadow-sm"
                    disabled={roomsPage === 1}
                    onClick={() =>
                      setRoomsPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <ChevronLeft className="mr-1 size-4" /> Prev
                  </Button>
                  <span className="px-2 text-sm font-medium text-muted-foreground">
                    Page {roomsPage} of {totalRoomPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl shadow-sm"
                    disabled={roomsPage === totalRoomPages}
                    onClick={() =>
                      setRoomsPage((current) =>
                        Math.min(totalRoomPages, current + 1)
                      )
                    }
                  >
                    Next <ChevronRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Confirmation Dialog for Buyer Assignments */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Assignment</DialogTitle>
            <DialogDescription>
              Review the room request before confirming.
            </DialogDescription>
          </DialogHeader>

          {selectedPendingAssignment && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="text-sm font-medium text-foreground">
                  {selectedPendingAssignment.attendeeName ??
                    selectedPendingAssignment.attendeeEmail ??
                    "Unnamed Attendee"}
                </p>
                {selectedPendingAssignment.attendeeEmail &&
                  selectedPendingAssignment.attendeeName && (
                    <p className="text-xs text-muted-foreground">
                      {selectedPendingAssignment.attendeeEmail}
                    </p>
                  )}
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowRight className="size-4" />
                <span>Assign to:</span>
                <span className="font-medium text-foreground">
                  {selectedPendingAssignment.roomLabel}
                </span>
              </div>

              {alternativeRooms.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-600">
                    Alternative rooms available:
                  </p>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {alternativeRooms.map((alt) => (
                      <button
                        key={alt.slotId}
                        type="button"
                        onClick={() =>
                          confirmPendingAssignment(
                            selectedPendingAssignment.assignmentId,
                            alt.slotId
                          )
                        }
                        className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {alt.roomLabel}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {alt.availableSpots} spots available
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {alt.roomType} • {alt.occupantCount}/{alt.capacity}{" "}
                          occupied
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (selectedPendingAssignment) {
                  removePendingAssignment(
                    selectedPendingAssignment.assignmentId
                  )
                }
              }}
              disabled={isMutating}
            >
              Decline
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (selectedPendingAssignment) {
                  confirmPendingAssignment(
                    selectedPendingAssignment.assignmentId
                  )
                }
              }}
              disabled={isMutating || alternativeRooms.length > 0}
            >
              {isMutating ? "Confirming..." : "Confirm Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assignmentToast && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-50 w-[min(26rem,calc(100vw-2rem))]">
          <article
            className="pointer-events-auto rounded-xl border border-emerald-300/60 bg-emerald-50/95 p-3 shadow-lg backdrop-blur dark:border-emerald-800 dark:bg-emerald-950/85"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  {assignmentToast.title}
                </p>
                <div className="mt-1 space-y-1">
                  {assignmentToast.lines.map((line) => (
                    <p
                      key={line}
                      className="truncate text-xs text-emerald-700 dark:text-emerald-300"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900"
                onClick={() => setAssignmentToast(null)}
                aria-label="Dismiss assignment notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
