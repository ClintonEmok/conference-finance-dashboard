"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { BedDouble, Building2, Hotel, MapPin, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  groupInventoryRoomsByRoomType,
  normalizeInventoryRoom,
} from "@/lib/dashboard/accommodation/inventory-metrics"

type InventoryPayload = {
  generatedAt: string
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  hotels: Array<{
    id: string
    name: string
    city: string | null
    notes: string | null
    roomCount: number
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
  eventHotels: string | null
}

const emptyPayload: InventoryPayload = {
  generatedAt: new Date(0).toISOString(),
  availableEvents: [],
  hotels: [],
  roomTypes: [],
  rooms: [],
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
    eventHotels: null,
  }
}

function availabilityLabel(value: "empty" | "available" | "full") {
  if (value === "full") return "Full"
  if (value === "empty") return "Empty"
  return "Available"
}

function availabilityClasses(value: "empty" | "available" | "full") {
  if (value === "full") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
  }

  if (value === "empty") {
    return "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
  }

  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
}

function metricValueLabel(value: number, suffix = "") {
  return `${value.toLocaleString()}${suffix}`
}

function normalizeInventoryPayload(
  payload: InventoryPayload
): InventoryPayload {
  return {
    ...payload,
    rooms: payload.rooms.map((room) => normalizeInventoryRoom(room)),
  }
}

export default function RoomInventoryPage() {
  const [payload, setPayload] = useState<InventoryPayload>(emptyPayload)
  const [errors, setErrors] = useState<InventoryErrorState>(emptyErrors)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [deletingHotelId, setDeletingHotelId] = useState<string | null>(null)
  const [hotelDeleteErrors, setHotelDeleteErrors] = useState<
    Record<string, string>
  >({})

  const [hotelName, setHotelName] = useState("")
  const [hotelCity, setHotelCity] = useState("")
  const [roomTypeLabel, setRoomTypeLabel] = useState("")
  const [roomTypeCapacity, setRoomTypeCapacity] = useState("2")
  const [roomHotelId, setRoomHotelId] = useState("")
  const [roomTypeId, setRoomTypeId] = useState("")
  const [roomQuantity, setRoomQuantity] = useState("1")
  const [manualRoomLabels, setManualRoomLabels] = useState("")
  const [isRegisterInventoryOpen, setIsRegisterInventoryOpen] = useState(false)
  const [activeHotelScopeId, setActiveHotelScopeId] = useState<string | null>(
    null
  )
  const [draftEventIds, setDraftEventIds] = useState<string[]>([])

  const loadInventory = useCallback(async () => {
    setIsLoading(true)
    setErrors((current) => ({ ...current, global: null }))

    try {
      const response = await fetch("/api/dashboard/accommodation/inventory")
      const body = (await response.json().catch(() => null)) as
        | InventoryPayload
        | { error?: { message?: string } }
        | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          global:
            body && "error" in body
              ? (body.error?.message ?? "Failed to load room stock.")
              : "Failed to load room stock.",
        }))
        return
      }

      setPayload(normalizeInventoryPayload(body as InventoryPayload))
    } catch {
      setErrors((current) => ({
        ...current,
        global: "Network error while loading room stock.",
      }))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInventory()
  }, [loadInventory])

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

  const totalCapacity = useMemo(
    () => payload.rooms.reduce((sum, room) => sum + room.capacity, 0),
    [payload.rooms]
  )

  const occupiedCapacity = useMemo(
    () => payload.rooms.reduce((sum, room) => sum + room.occupiedBeds, 0),
    [payload.rooms]
  )

  const capacityUtilization =
    totalCapacity === 0
      ? 0
      : Math.round((occupiedCapacity / totalCapacity) * 100)

  async function mutateHotelEventScope(
    eventId: string,
    hotelId: string,
    isLinked: boolean
  ) {
    const response = await fetch("/api/dashboard/accommodation/event-hotels", {
      method: isLinked ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, hotelId }),
    })

    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null

    if (!response.ok) {
      throw new Error(
        body?.error?.message ?? "Failed to update event hotel scope."
      )
    }
  }

  function openHotelScopeModal(hotelId: string) {
    const hotel = payload.hotels.find((item) => item.id === hotelId)

    if (!hotel) {
      return
    }

    setDraftEventIds(hotel.assignedEventIds)
    setActiveHotelScopeId(hotelId)
    setErrors((current) => ({ ...current, eventHotels: null }))
  }

  function closeHotelScopeModal() {
    setActiveHotelScopeId(null)
    setDraftEventIds([])
  }

  async function saveHotelScope() {
    const hotel = payload.hotels.find((item) => item.id === activeHotelScopeId)

    if (!hotel) {
      return
    }

    setIsMutating(true)

    try {
      const currentEventIds = new Set(hotel.assignedEventIds)
      const nextEventIds = new Set(draftEventIds)

      const attachIds = draftEventIds.filter(
        (eventId) => !currentEventIds.has(eventId)
      )
      const detachIds = hotel.assignedEventIds.filter(
        (eventId) => !nextEventIds.has(eventId)
      )

      for (const eventId of attachIds) {
        await mutateHotelEventScope(eventId, hotel.id, false)
      }

      for (const eventId of detachIds) {
        await mutateHotelEventScope(eventId, hotel.id, true)
      }

      setErrors((current) => ({ ...current, eventHotels: null }))
      await loadInventory()
      closeHotelScopeModal()
    } catch (error) {
      setErrors((current) => ({
        ...current,
        eventHotels:
          error instanceof Error
            ? error.message
            : "Failed to update event hotel scope.",
      }))
    } finally {
      setIsMutating(false)
    }
  }

  async function submitHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsMutating(true)

    try {
      const response = await fetch("/api/dashboard/accommodation/hotels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: hotelName, city: hotelCity }),
      })

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          hotels: body?.error?.message ?? "Failed to create hotel.",
        }))
        return
      }

      setHotelName("")
      setHotelCity("")
      setErrors((current) => ({ ...current, hotels: null }))
      await loadInventory()
    } finally {
      setIsMutating(false)
    }
  }

  async function submitRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsMutating(true)

    try {
      const response = await fetch("/api/dashboard/accommodation/room-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: roomTypeLabel,
          defaultCapacity: Number(roomTypeCapacity),
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          roomTypes: body?.error?.message ?? "Failed to create room type.",
        }))
        return
      }

      setRoomTypeLabel("")
      setRoomTypeCapacity("2")
      setErrors((current) => ({ ...current, roomTypes: null }))
      await loadInventory()
    } finally {
      setIsMutating(false)
    }
  }

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsMutating(true)

    try {
      const response = await fetch("/api/dashboard/accommodation/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId: roomHotelId,
          roomTypeId,
          quantity: Number(roomQuantity),
          labels: manualRoomLabels
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      })

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setErrors((current) => ({
          ...current,
          rooms: body?.error?.message ?? "Failed to create room.",
        }))
        return
      }

      setRoomQuantity("1")
      setManualRoomLabels("")
      setErrors((current) => ({ ...current, rooms: null }))
      await loadInventory()
    } finally {
      setIsMutating(false)
    }
  }

  async function deleteHotelFromInventory(hotelId: string, hotelName: string) {
    const shouldDelete = window.confirm(
      `Delete hotel "${hotelName}"? This only succeeds when the hotel has no rooms and no linked event scope.`
    )

    if (!shouldDelete) {
      return
    }

    setDeletingHotelId(hotelId)
    setHotelDeleteErrors((current) => {
      if (!current[hotelId]) {
        return current
      }

      const next = { ...current }
      delete next[hotelId]
      return next
    })

    try {
      const response = await fetch(
        `/api/dashboard/accommodation/hotels/${hotelId}`,
        {
          method: "DELETE",
        }
      )

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setHotelDeleteErrors((current) => ({
          ...current,
          [hotelId]:
            body?.error?.message ?? "Failed to delete hotel. Please try again.",
        }))
        return
      }

      await loadInventory()
    } catch {
      setHotelDeleteErrors((current) => ({
        ...current,
        [hotelId]: "Network error while deleting hotel.",
      }))
    } finally {
      setDeletingHotelId(null)
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-primary/70 uppercase">
            Room inventory
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Configure hotels, room types, and room stock.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Keep setup work separate from live allocation so operators have more
            room to manage inventory cleanly.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/accommodation">Back to room allocation</Link>
          </Button>
          <Button
            type="button"
            onClick={() => setIsRegisterInventoryOpen(true)}
          >
            Register inventory
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isLoading || isMutating}
            onClick={() => void loadInventory()}
          >
            Refresh
          </Button>
        </div>
      </header>

      {errors.global && (
        <article className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errors.global}
        </article>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1fr]">
        <article className="rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-5 text-primary-foreground shadow-[0_20px_56px_rgba(78,52,166,0.24)]">
          <p className="text-xs text-primary-foreground/72">Total inventory</p>
          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold tracking-tight">
                {metricValueLabel(payload.summary.totalRooms)}
              </p>
              <p className="mt-2 text-xs text-primary-foreground/72">
                Rooms configured across all venues
              </p>
            </div>
            <span className="flex size-12 items-center justify-center rounded-lg bg-white/14">
              <Building2 className="size-6" />
            </span>
          </div>
        </article>

        <Card className="bg-background/88 backdrop-blur">
          <CardHeader>
            <CardDescription className="text-[11px] font-semibold tracking-[0.18em] text-primary/70 uppercase">
              Active capacity
            </CardDescription>
            <CardTitle className="text-4xl font-semibold tracking-tight">
              {capacityUtilization}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${capacityUtilization}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {occupiedCapacity} occupied beds across {totalCapacity} total
                configured beds.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/88 backdrop-blur">
          <CardHeader>
            <CardDescription className="text-[11px] font-semibold tracking-[0.18em] text-primary/70 uppercase">
              Venues managed
            </CardDescription>
            <CardTitle className="text-4xl font-semibold tracking-tight">
              {payload.hotels.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {payload.roomTypes.length} room types and{" "}
              {payload.summary.emptyRooms} empty rooms available for future
              placement.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="bg-background/88 backdrop-blur">
        <CardHeader>
          <CardDescription className="text-[11px] font-semibold tracking-[0.18em] text-primary/70 uppercase">
            Event hotel scope
          </CardDescription>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Assign hotels to one or more events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Hotels are reusable across events. Open a hotel and choose all
              events that should be allowed to allocate into that property.
            </p>
            {errors.eventHotels && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.eventHotels}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payload.hotels.map((hotel) => (
              <article
                key={hotel.id}
                className="rounded-lg border border-border/70 bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{hotel.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hotel.roomCount} room{hotel.roomCount === 1 ? "" : "s"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {hotel.assignedEventIds.length === 0
                        ? "Not assigned to any event yet"
                        : `${hotel.assignedEventIds.length} linked event${hotel.assignedEventIds.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${hotel.assignedEventIds.length > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {hotel.assignedEventIds.length > 0 ? "Scoped" : "Unscoped"}
                  </span>
                </div>

                {hotel.assignedEventIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hotel.assignedEventIds
                      .map((eventId) =>
                        payload.availableEvents.find(
                          (event) => event.providerEventId === eventId
                        )
                      )
                      .filter((event): event is NonNullable<typeof event> =>
                        Boolean(event)
                      )
                      .slice(0, 3)
                      .map((event) => (
                        <span
                          key={event.providerEventId}
                          className="rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary"
                        >
                          {event.name?.trim() || event.providerEventId}
                        </span>
                      ))}
                    {hotel.assignedEventIds.length > 3 && (
                      <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        +{hotel.assignedEventIds.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  className="mt-4 w-full"
                  disabled={isMutating || payload.availableEvents.length === 0}
                  onClick={() => openHotelScopeModal(hotel.id)}
                >
                  Assign to event
                </Button>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="bg-background/88 backdrop-blur">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                  Hotels
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {payload.hotels.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Properties registered in inventory
                </p>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Hotel className="size-5" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-background/88 backdrop-blur">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                  Room types
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {payload.roomTypes.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Templates available for room setup
                </p>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-background/88 backdrop-blur">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                  Empty rooms
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {payload.summary.emptyRooms}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ready for attendee assignment
                </p>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BedDouble className="size-5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-primary/70 uppercase">
                Portfolio inventory
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">
                Venues and room stock
              </h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <div className="rounded-md border border-border/70 bg-background px-3 py-2">
                {payload.summary.availableRooms} available
              </div>
              <div className="rounded-md border border-border/70 bg-background px-3 py-2">
                {payload.summary.fullRooms} full
              </div>
            </div>
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">
                Loading room stock...
              </CardContent>
            </Card>
          ) : payload.hotels.length === 0 ? (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">
                No hotels configured yet.
              </CardContent>
            </Card>
          ) : (
            payload.hotels.map((hotel) => {
              const hotelRooms = payload.rooms.filter(
                (room) => room.hotel.id === hotel.id
              )
              const groupedRoomBlocks =
                groupInventoryRoomsByRoomType(hotelRooms)

              return (
                <Card
                  key={hotel.id}
                  className="overflow-hidden bg-background/90 backdrop-blur"
                >
                  <CardHeader className="border-b border-border/60 bg-muted/30 pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Hotel className="size-5" />
                        </span>
                        <div>
                          <CardTitle className="text-lg">
                            {hotel.name}
                          </CardTitle>
                          <CardDescription className="mt-1 flex items-center gap-1.5 text-xs">
                            <MapPin className="size-3.5" />
                            {hotelRooms[0]?.hotel.city ?? "City not set"} ·{" "}
                            {hotelRooms.length} room units total
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-emerald-700 uppercase dark:bg-emerald-950/30 dark:text-emerald-300">
                          Active
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-red-600 hover:text-red-600 dark:text-red-400"
                          disabled={isMutating || deletingHotelId !== null}
                          onClick={() =>
                            void deleteHotelFromInventory(hotel.id, hotel.name)
                          }
                        >
                          {deletingHotelId === hotel.id
                            ? "Deleting..."
                            : "Delete hotel"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5">
                    {hotelDeleteErrors[hotel.id] && (
                      <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                        {hotelDeleteErrors[hotel.id]}
                      </p>
                    )}
                    {hotelRooms.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No room stock configured for this hotel yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {groupedRoomBlocks.map((block) => (
                          <div
                            key={`${hotel.id}-${block.roomTypeLabel}`}
                            className="grid gap-3 rounded-lg border border-border/70 bg-background px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_140px_140px_140px] md:items-center"
                          >
                            <div>
                              <p className="font-medium text-foreground">
                                {block.roomTypeLabel}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {block.quantity} room
                                {block.quantity === 1 ? "" : "s"} in this block
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                                Bed capacity
                              </p>
                              <p className="mt-1 text-sm font-medium">
                                {block.totalBeds} beds
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                                Occupied beds
                              </p>
                              <p className="mt-1 text-sm font-medium">
                                {block.occupiedBeds}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                                Available beds
                              </p>
                              <p className="mt-1 text-sm font-medium">
                                {block.availableBeds}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </section>

      {isRegisterInventoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-primary/70 uppercase">
                  Register inventory
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  Add a hotel, room type, or room stock block
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Keep inventory setup in one focused modal instead of a
                  permanent sidebar widget.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRegisterInventoryOpen(false)}
              >
                Close
              </Button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              <form
                className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm"
                onSubmit={submitHotel}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Hotel className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        Hotel
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        Create a property
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <input
                      value={hotelName}
                      onChange={(event) => setHotelName(event.target.value)}
                      placeholder="e.g. Grand Plaza Executive"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <input
                      value={hotelCity}
                      onChange={(event) => setHotelCity(event.target.value)}
                      placeholder="City or location"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isMutating}
                    >
                      Add hotel
                    </Button>
                    {errors.hotels && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {errors.hotels}
                      </p>
                    )}
                  </div>
                </div>
              </form>

              <form
                className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm"
                onSubmit={submitRoomType}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        Room type
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        Define a room template
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <input
                      value={roomTypeLabel}
                      onChange={(event) => setRoomTypeLabel(event.target.value)}
                      placeholder="e.g. Executive Double"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <input
                      type="number"
                      min="1"
                      value={roomTypeCapacity}
                      onChange={(event) =>
                        setRoomTypeCapacity(event.target.value)
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full"
                      disabled={isMutating}
                    >
                      Save room type
                    </Button>
                    {errors.roomTypes && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {errors.roomTypes}
                      </p>
                    )}
                  </div>
                </div>
              </form>

              <form
                className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm"
                onSubmit={submitRoom}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <BedDouble className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        Room
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        Add a room stock block to inventory
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <select
                      value={roomHotelId}
                      onChange={(event) => setRoomHotelId(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select room type</option>
                      {payload.roomTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={roomQuantity}
                      onChange={(event) => setRoomQuantity(event.target.value)}
                      placeholder="Quantity"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                    <textarea
                      value={manualRoomLabels}
                      onChange={(event) =>
                        setManualRoomLabels(event.target.value)
                      }
                      placeholder={
                        "Optional manual room labels, one per line\nGH-301\nGH-302\nGH-303"
                      }
                      className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave manual labels empty to auto-generate room numbers.
                      If you fill labels manually, enter one room number per
                      line and those labels will be used instead of quantity.
                    </p>
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full"
                      disabled={isMutating}
                    >
                      Create room stock block
                    </Button>
                    {errors.rooms && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {errors.rooms}
                      </p>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {activeHotelScopeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-primary/70 uppercase">
                  Assign hotel to events
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  {payload.hotels.find(
                    (hotel) => hotel.id === activeHotelScopeId
                  )?.name ?? "Hotel"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose every event that should be allowed to allocate
                  attendees into this hotel.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={closeHotelScopeModal}
              >
                Close
              </Button>
            </div>

            <div className="mt-6 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {payload.availableEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                  No events are available yet. Sync Ticket Tailor events first.
                </div>
              ) : (
                payload.availableEvents.map((event) => {
                  const checked = draftEventIds.includes(event.providerEventId)

                  return (
                    <label
                      key={event.providerEventId}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                        checked
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/70 bg-background"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(inputEvent) =>
                          setDraftEventIds((current) =>
                            inputEvent.target.checked
                              ? [...current, event.providerEventId]
                              : current.filter(
                                  (item) => item !== event.providerEventId
                                )
                          )
                        }
                        className="mt-1 size-4 rounded border-input"
                      />
                      <div>
                        <p className="font-medium text-foreground">
                          {event.name?.trim() || event.providerEventId}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.providerEventId}
                        </p>
                      </div>
                    </label>
                  )
                })
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeHotelScopeModal}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isMutating}
                onClick={() => void saveHotelScope()}
              >
                Save event scope
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
