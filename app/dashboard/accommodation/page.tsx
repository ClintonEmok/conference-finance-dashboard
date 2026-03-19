"use client"

import { FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

type AccommodationPayload = {
  hotels: Array<{
    id: string
    name: string
    city: string | null
    notes: string | null
    roomCount: number
  }>
  roomTypes: Array<{
    id: string
    label: string
    defaultCapacity: number
    notes: string | null
    roomCount: number
  }>
  rooms: Array<{
    id: string
    label: string
    capacity: number
    occupiedBeds: number
    notes: string | null
    hotel: {
      id: string
      name: string
    }
    roomType: {
      id: string
      label: string
      defaultCapacity: number
    }
  }>
}

type InventoryErrorState = {
  hotels: string | null
  roomTypes: string | null
  rooms: string | null
  global: string | null
}

function emptyErrors(): InventoryErrorState {
  return {
    hotels: null,
    roomTypes: null,
    rooms: null,
    global: null,
  }
}

export default function AccommodationPage() {
  const [payload, setPayload] = useState<AccommodationPayload>({ hotels: [], roomTypes: [], rooms: [] })
  const [errors, setErrors] = useState<InventoryErrorState>(emptyErrors)
  const [isLoading, setIsLoading] = useState(true)

  const [hotelName, setHotelName] = useState("")
  const [hotelCity, setHotelCity] = useState("")
  const [roomTypeLabel, setRoomTypeLabel] = useState("")
  const [roomTypeCapacity, setRoomTypeCapacity] = useState("2")
  const [roomHotelId, setRoomHotelId] = useState("")
  const [roomTypeId, setRoomTypeId] = useState("")
  const [roomLabel, setRoomLabel] = useState("")
  const [roomCapacity, setRoomCapacity] = useState("2")

  async function loadInventory() {
    setIsLoading(true)
    setErrors((current) => ({ ...current, global: null }))

    try {
      const [hotelsResponse, roomTypesResponse, roomsResponse] = await Promise.all([
        fetch("/api/dashboard/accommodation/hotels"),
        fetch("/api/dashboard/accommodation/room-types"),
        fetch("/api/dashboard/accommodation/rooms"),
      ])

      const hotelsBody = (await hotelsResponse.json().catch(() => null)) as
        | { hotels?: AccommodationPayload["hotels"]; error?: { message?: string } }
        | null
      const roomTypesBody = (await roomTypesResponse.json().catch(() => null)) as
        | { roomTypes?: AccommodationPayload["roomTypes"]; error?: { message?: string } }
        | null
      const roomsBody = (await roomsResponse.json().catch(() => null)) as
        | { rooms?: AccommodationPayload["rooms"]; error?: { message?: string } }
        | null

      if (!hotelsResponse.ok || !roomTypesResponse.ok || !roomsResponse.ok) {
        setErrors({
          hotels: hotelsResponse.ok ? null : hotelsBody?.error?.message ?? "Failed to load hotels.",
          roomTypes: roomTypesResponse.ok ? null : roomTypesBody?.error?.message ?? "Failed to load room types.",
          rooms: roomsResponse.ok ? null : roomsBody?.error?.message ?? "Failed to load rooms.",
          global: "Accommodation inventory could not be loaded completely.",
        })
        return
      }

      setPayload({
        hotels: hotelsBody?.hotels ?? [],
        roomTypes: roomTypesBody?.roomTypes ?? [],
        rooms: roomsBody?.rooms ?? [],
      })
      setErrors(emptyErrors())
    } catch {
      setErrors({
        hotels: null,
        roomTypes: null,
        rooms: null,
        global: "Network error while loading accommodation inventory.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadInventory()
  }, [])

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

  async function submitHotel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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
    await loadInventory()
  }

  async function submitRoomType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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
    await loadInventory()
  }

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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
    await loadInventory()
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Accommodation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define hotels, room types, and rooms before assignment workflows begin.
        </p>
      </header>

      {errors.global && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errors.global}
        </article>
      )}

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Hotels</h3>
          <p className="mt-1 text-sm text-muted-foreground">Capture the venues or properties you will assign attendees into.</p>
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
            <Button type="submit">Create hotel</Button>
          </form>
          {errors.hotels && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.hotels}</p>}
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading hotels…</p>
            ) : payload.hotels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hotels added yet.</p>
            ) : (
              payload.hotels.map((hotel) => (
                <article key={hotel.id} className="rounded-md border border-border/70 p-3 text-sm">
                  <p className="font-medium">{hotel.name}</p>
                  <p className="text-xs text-muted-foreground">{hotel.city ?? "City not set"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Rooms: {hotel.roomCount}</p>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Room types</h3>
          <p className="mt-1 text-sm text-muted-foreground">Define reusable room categories with default bed/capacity expectations.</p>
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
              placeholder="Default capacity"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit">Create room type</Button>
          </form>
          {errors.roomTypes && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.roomTypes}</p>}
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading room types…</p>
            ) : payload.roomTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No room types added yet.</p>
            ) : (
              payload.roomTypes.map((roomType) => (
                <article key={roomType.id} className="rounded-md border border-border/70 p-3 text-sm">
                  <p className="font-medium">{roomType.label}</p>
                  <p className="text-xs text-muted-foreground">Default capacity: {roomType.defaultCapacity}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Rooms: {roomType.roomCount}</p>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold">Rooms</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add actual rooms and expose capacity now so assignment indicators can layer in next.</p>
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
              {payload.roomTypes.map((roomType) => (
                <option key={roomType.id} value={roomType.id}>
                  {roomType.label}
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
              placeholder="Capacity"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit">Create room</Button>
          </form>
          {errors.rooms && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errors.rooms}</p>}
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading rooms…</p>
            ) : payload.rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rooms added yet.</p>
            ) : (
              payload.rooms.map((room) => (
                <article key={room.id} className="rounded-md border border-border/70 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{room.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {room.occupiedBeds}/{room.capacity} occupied
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{room.hotel.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{room.roomType.label} · capacity {room.capacity}</p>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </section>
  )
}
