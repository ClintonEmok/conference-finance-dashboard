"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"

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
  hotels: Array<{
    id: string
    name: string
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
  hotels: string | null
  roomTypes: string | null
  rooms: string | null
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
    hotels: null,
    roomTypes: null,
    rooms: null,
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

export default function AccommodationPage() {
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

  const [hotelName, setHotelName] = useState("")
  const [hotelCity, setHotelCity] = useState("")
  const [roomTypeLabel, setRoomTypeLabel] = useState("")
  const [roomTypeCapacity, setRoomTypeCapacity] = useState("2")
  const [roomHotelId, setRoomHotelId] = useState("")
  const [roomTypeId, setRoomTypeId] = useState("")
  const [roomLabel, setRoomLabel] = useState("")
  const [roomCapacity, setRoomCapacity] = useState("2")
  const [selectedRoomByAttendee, setSelectedRoomByAttendee] = useState<Record<string, string>>({})

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

  useEffect(() => {
    if (!roomHotelId && payload.hotels[0]) {
      setRoomHotelId(payload.hotels[0].id)
    }
  }, [payload.hotels, roomHotelId])

  useEffect(() => {
    if (!roomTypeId && payload.roomTypes[0]) {
      setRoomTypeId(payload.roomTypes[0].id)
    }
  }, [payload.roomTypes, roomTypeId])

  const assignableRooms = useMemo(
    () => payload.rooms.filter((room) => room.availableBeds > 0),
    [payload.rooms],
  )

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAssignmentMessage(null)
    setAppliedEventId(eventIdInput)
    setAppliedSearch(searchInput)
    setAppliedHotelFilter(hotelFilter)
    setAppliedRoomTypeFilter(roomTypeFilter)
    setAppliedAvailability(availabilityFilter)
  }

  async function submitHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      const response = await fetch("/api/dashboard/accommodation/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: hotelName, city: hotelCity }),
      })

      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrors((current) => ({ ...current, hotels: body?.error?.message ?? "Failed to create hotel." }))
        return
      }

      setHotelName("")
      setHotelCity("")
      setErrors((current) => ({ ...current, hotels: null }))
      await loadWorkspace()
    } finally {
      setIsMutating(false)
    }
  }

  async function submitRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      const response = await fetch("/api/dashboard/accommodation/room-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: roomTypeLabel, defaultCapacity: Number(roomTypeCapacity) }),
      })

      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrors((current) => ({ ...current, roomTypes: body?.error?.message ?? "Failed to create room type." }))
        return
      }

      setRoomTypeLabel("")
      setRoomTypeCapacity("2")
      setErrors((current) => ({ ...current, roomTypes: null }))
      await loadWorkspace()
    } finally {
      setIsMutating(false)
    }
  }

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsMutating(true)
    setAssignmentMessage(null)

    try {
      const response = await fetch("/api/dashboard/accommodation/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: roomHotelId,
          roomTypeId,
          label: roomLabel,
          capacity: Number(roomCapacity),
        }),
      })

      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrors((current) => ({ ...current, rooms: body?.error?.message ?? "Failed to create room." }))
        return
      }

      setRoomLabel("")
      setRoomCapacity("2")
      setErrors((current) => ({ ...current, rooms: null }))
      await loadWorkspace()
    } finally {
      setIsMutating(false)
    }
  }

  async function assignAttendee(attendeeId: string) {
    const roomId = selectedRoomByAttendee[attendeeId]

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

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Accommodation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage room inventory, identify occupancy pressure, and assign or unassign attendees from one workspace.
        </p>
      </header>

      {errors.global && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errors.global}
        </article>
      )}

      {errors.assignments && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errors.assignments}
        </article>
      )}

      {assignmentMessage && (
        <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
          {assignmentMessage}
        </article>
      )}

      <section className="grid gap-4 md:grid-cols-5">
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Rooms in scope</p>
          <p className="mt-2 text-2xl font-semibold">{payload.summary.totalRooms}</p>
        </article>
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Empty rooms</p>
          <p className="mt-2 text-2xl font-semibold">{payload.summary.emptyRooms}</p>
        </article>
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Available rooms</p>
          <p className="mt-2 text-2xl font-semibold">{payload.summary.availableRooms}</p>
        </article>
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Full rooms</p>
          <p className="mt-2 text-2xl font-semibold">{payload.summary.fullRooms}</p>
        </article>
        <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Unassigned attendees</p>
          <p className="mt-2 text-2xl font-semibold">{payload.summary.unassignedAttendees}</p>
        </article>
      </section>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <form className="space-y-4" onSubmit={applyFilters}>
          <div className="grid gap-4 lg:grid-cols-5">
            <label className="space-y-1">
              <span className="text-sm font-medium">Event ID</span>
              <input
                value={eventIdInput}
                onChange={(event) => setEventIdInput(event.target.value)}
                placeholder="All events"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Search</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Room, hotel, attendee, order"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Hotel</span>
              <select
                value={hotelFilter}
                onChange={(event) => setHotelFilter(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All hotels</option>
                {payload.hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Room type</span>
              <select
                value={roomTypeFilter}
                onChange={(event) => setRoomTypeFilter(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All room types</option>
                {payload.roomTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Availability</span>
              <select
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value as AvailabilityFilter)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All rooms</option>
                <option value="empty">Empty</option>
                <option value="available">Available</option>
                <option value="full">Full</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isLoading || isMutating}>
              {isLoading ? "Loading..." : "Apply filters"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || isMutating}
              onClick={() => {
                setEventIdInput("")
                setSearchInput("")
                setHotelFilter("")
                setRoomTypeFilter("")
                setAvailabilityFilter("all")
                setAppliedEventId("")
                setAppliedSearch("")
                setAppliedHotelFilter("")
                setAppliedRoomTypeFilter("")
                setAppliedAvailability("all")
                setAssignmentMessage(null)
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      </article>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Hotels</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add or review the hotels you assign attendees into.</p>
          <form className="mt-4 space-y-3" onSubmit={submitHotel}>
            <input
              value={hotelName}
              onChange={(event) => setHotelName(event.target.value)}
              placeholder="Hotel name"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              value={hotelCity}
              onChange={(event) => setHotelCity(event.target.value)}
              placeholder="City (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={isMutating}>Create hotel</Button>
          </form>
          {errors.hotels && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.hotels}</p>}
          <div className="mt-4 space-y-3">
            {payload.hotels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hotels added yet.</p>
            ) : (
              payload.hotels.map((hotel) => (
                <article key={hotel.id} className="rounded-md border border-border/70 p-3 text-sm">
                  <p className="font-medium">{hotel.name}</p>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Room types</h3>
          <p className="mt-1 text-sm text-muted-foreground">Define reusable room categories before assigning attendees.</p>
          <form className="mt-4 space-y-3" onSubmit={submitRoomType}>
            <input
              value={roomTypeLabel}
              onChange={(event) => setRoomTypeLabel(event.target.value)}
              placeholder="Room type label"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="1"
              value={roomTypeCapacity}
              onChange={(event) => setRoomTypeCapacity(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={isMutating}>Create room type</Button>
          </form>
          {errors.roomTypes && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.roomTypes}</p>}
          <div className="mt-4 space-y-3">
            {payload.roomTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No room types added yet.</p>
            ) : (
              payload.roomTypes.map((type) => (
                <article key={type.id} className="rounded-md border border-border/70 p-3 text-sm">
                  <p className="font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground">Default capacity {type.defaultCapacity}</p>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Rooms</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create rooms and expose bed capacity before allocating attendees.</p>
          <form className="mt-4 space-y-3" onSubmit={submitRoom}>
            <select
              value={roomHotelId}
              onChange={(event) => setRoomHotelId(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select hotel</option>
              {payload.hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
            <select
              value={roomTypeId}
              onChange={(event) => setRoomTypeId(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select room type</option>
              {payload.roomTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            <input
              value={roomLabel}
              onChange={(event) => setRoomLabel(event.target.value)}
              placeholder="Room label"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="1"
              value={roomCapacity}
              onChange={(event) => setRoomCapacity(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={isMutating}>Create room</Button>
          </form>
          {errors.rooms && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.rooms}</p>}
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>{payload.rooms.length} rooms currently match the active filters.</p>
            <p>{assignableRooms.length} filtered rooms can still accept attendees.</p>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Room allocation board</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Review occupancy, spot full or empty rooms, and unassign directly from each room.
              </p>
            </div>
            <Button type="button" variant="outline" disabled={isLoading || isMutating} onClick={() => void loadWorkspace()}>
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading room allocation board...</p>
          ) : payload.rooms.length === 0 ? (
            <p className="mt-4 rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
              No rooms match the current filters.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {payload.rooms.map((room) => (
                <article key={room.id} className="rounded-lg border border-border/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{room.label}</h4>
                      <p className="text-sm text-muted-foreground">
                        {room.hotel.name}
                        {room.hotel.city ? `, ${room.hotel.city}` : ""} · {room.roomType.label}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${availabilityClasses(room.availability)}`}>
                      {room.availability}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/70 px-2.5 py-1">
                      {room.occupiedBeds}/{room.capacity} occupied
                    </span>
                    <span className="rounded-full border border-border/70 px-2.5 py-1">
                      {room.availableBeds} beds free
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {room.occupants.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                        No attendees assigned to this room yet.
                      </p>
                    ) : (
                      room.occupants.map((occupant) => (
                        <div key={occupant.attendeeId} className="rounded-md border border-border/70 p-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{occupant.attendeeName ?? "Unnamed attendee"}</p>
                              <p className="text-xs text-muted-foreground">{occupant.attendeeEmail ?? occupant.providerOrderId}</p>
                              <p className="text-xs text-muted-foreground">
                                {occupant.eventName ?? occupant.providerEventId}
                                {occupant.ticketTypeLabel ? ` · ${occupant.ticketTypeLabel}` : ""}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isMutating}
                              onClick={() => void unassignAttendee(occupant.attendeeId)}
                            >
                              Unassign
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Unassigned attendees</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a filtered room with available beds and assign attendees without leaving this page.
          </p>

          {payload.unassignedAttendees.length === 0 ? (
            <p className="mt-4 rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
              No unassigned attendees match the current filters.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {payload.unassignedAttendees.map((attendee) => (
                <article key={attendee.attendeeId} className="rounded-md border border-border/70 p-3 text-sm">
                  <p className="font-medium">{attendee.attendeeName ?? "Unnamed attendee"}</p>
                  <p className="text-xs text-muted-foreground">{attendee.attendeeEmail ?? attendee.providerOrderId}</p>
                  <p className="text-xs text-muted-foreground">
                    {attendee.eventName ?? attendee.providerEventId}
                    {attendee.ticketTypeLabel ? ` · ${attendee.ticketTypeLabel}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {attendee.matchingRoomCount} room{attendee.matchingRoomCount === 1 ? "" : "s"} currently fit the active filters.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <select
                      value={selectedRoomByAttendee[attendee.attendeeId] ?? ""}
                      onChange={(event) =>
                        setSelectedRoomByAttendee((current) => ({
                          ...current,
                          [attendee.attendeeId]: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select room</option>
                      {assignableRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.label} · {room.hotel.name} · {room.availableBeds} free
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      disabled={isMutating || assignableRooms.length === 0}
                      onClick={() => void assignAttendee(attendee.attendeeId)}
                    >
                      Assign attendee
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  )
}
