"use client"

import Link from "next/link"
import {
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  BedDouble,
  Building2,
  Hotel,
  MapPin,
  Sparkles,
  Plus,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Trash2,
  LayoutGrid,
  Info,
  CheckCircle2,
  X,
  Layers,
  ArrowLeft,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  groupInventoryRoomsByRoomType,
  normalizeInventoryRoom,
} from "@/lib/dashboard/accommodation/inventory-metrics"
import {
  useCreateHotel,
  useCreateRoomType,
  useCreateRooms,
  useDeleteHotel,
  useDeleteRoomType,
  useAttachHotelToEventByProviderId,
  useDetachHotelFromEventByProviderId,
} from "@/lib/convex/hooks/accommodation"

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
    roomCount: number
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
  const [deletingRoomTypeId, setDeletingRoomTypeId] = useState<string | null>(
    null
  )
  const [roomTypeDeleteErrors, setRoomTypeDeleteErrors] = useState<
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

  // Multi-step form state
  const [isRegisterInventoryOpen, setIsRegisterInventoryOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  const [activeHotelScopeId, setActiveHotelScopeId] = useState<string | null>(
    null
  )
  const [draftEventIds, setDraftEventIds] = useState<string[]>([])

  // Convex mutation hooks
  const createHotel = useCreateHotel()
  const createRoomType = useCreateRoomType()
  const createRooms = useCreateRooms()
  const deleteHotel = useDeleteHotel()
  const deleteRoomType = useDeleteRoomType()
  const attachHotelToEventByProviderId = useAttachHotelToEventByProviderId()
  const detachHotelFromEventByProviderId = useDetachHotelFromEventByProviderId()

  const loadInventory = useCallback(async () => {
    setIsLoading(true)
    setErrors((current) => ({ ...current, global: null }))
    try {
      const response = await fetch("/api/dashboard/accommodation/inventory")
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message || "Failed to load")
      setPayload(normalizeInventoryPayload(body))
    } catch (e: any) {
      setErrors((current) => ({ ...current, global: e.message }))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  useEffect(() => {
    if (!roomHotelId && payload.hotels[0]) setRoomHotelId(payload.hotels[0].id)
    if (!roomTypeId && payload.roomTypes[0])
      setRoomTypeId(payload.roomTypes[0].id)
  }, [payload.hotels, payload.roomTypes, roomHotelId, roomTypeId])

  const totalCapacity = useMemo(
    () => payload.rooms.reduce((acc, r) => acc + r.capacity, 0),
    [payload.rooms]
  )
  const occupiedCapacity = useMemo(
    () => payload.rooms.reduce((acc, r) => acc + r.occupiedBeds, 0),
    [payload.rooms]
  )
  const capacityUtilization =
    totalCapacity > 0 ? Math.round((occupiedCapacity / totalCapacity) * 100) : 0

  const openHotelScopeModal = (hotelId: string) => {
    const hotel = payload.hotels.find((h) => h.id === hotelId)
    setDraftEventIds(hotel?.assignedEventIds ?? [])
    setActiveHotelScopeId(hotelId)
  }

  const closeHotelScopeModal = () => {
    setActiveHotelScopeId(null)
    setDraftEventIds([])
    setErrors((current) => ({ ...current, eventHotels: null }))
  }

  const saveHotelScope = async () => {
    if (!activeHotelScopeId) return
    setIsMutating(true)
    try {
      const hotel = payload.hotels.find((h) => h.id === activeHotelScopeId)
      const currentEventIds = hotel?.assignedEventIds || []

      // Events to attach (in draft but not currently assigned)
      const toAttach = draftEventIds.filter(
        (id) => !currentEventIds.includes(id)
      )
      // Events to detach (currently assigned but not in draft)
      const toDetach = currentEventIds.filter(
        (id) => !draftEventIds.includes(id)
      )

      // Execute all attach operations
      await Promise.all(
        toAttach.map((eventId) =>
          attachHotelToEventByProviderId({
            hotelId: activeHotelScopeId,
            eventProviderEventId: eventId,
          })
        )
      )

      // Execute all detach operations
      await Promise.all(
        toDetach.map((eventId) =>
          detachHotelFromEventByProviderId({
            hotelId: activeHotelScopeId,
            eventProviderEventId: eventId,
          })
        )
      )

      await loadInventory()
      closeHotelScopeModal()
    } catch (err: any) {
      setErrors((current) => ({ ...current, eventHotels: err.message }))
    } finally {
      setIsMutating(false)
    }
  }

  const submitHotel = async (e: SyntheticEvent) => {
    e.preventDefault()
    if (!hotelName.trim()) return
    setIsMutating(true)
    try {
      await createHotel({ name: hotelName, city: hotelCity })
      setHotelName("")
      setHotelCity("")
      await loadInventory()
      setCurrentStep(2)
    } catch (err: any) {
      setErrors((current) => ({ ...current, hotels: err.message }))
    } finally {
      setIsMutating(false)
    }
  }

  const submitRoomType = async (e: SyntheticEvent) => {
    e.preventDefault()
    if (!roomTypeLabel.trim()) return
    setIsMutating(true)
    try {
      await createRoomType({
        label: roomTypeLabel,
        defaultCapacity: Number(roomTypeCapacity),
      })
      setRoomTypeLabel("")
      setRoomTypeCapacity("2")
      await loadInventory()
      setCurrentStep(3)
    } catch (err: any) {
      setErrors((current) => ({ ...current, roomTypes: err.message }))
    } finally {
      setIsMutating(false)
    }
  }

  const submitRoom = async (e: SyntheticEvent) => {
    e.preventDefault()
    if (!roomHotelId || !roomTypeId) return
    setIsMutating(true)
    try {
      await createRooms({
        hotelId: roomHotelId,
        roomTypeId,
        quantity: Number(roomQuantity),
        labels: manualRoomLabels
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      })
      setRoomQuantity("1")
      setManualRoomLabels("")
      await loadInventory()
      setIsRegisterInventoryOpen(false)
      setCurrentStep(1)
    } catch (err: any) {
      setErrors((current) => ({ ...current, rooms: err.message }))
    } finally {
      setIsMutating(false)
    }
  }

  const handleDeleteHotel = async (id: string, name: string) => {
    if (!window.confirm(`Delete hotel "${name}"?`)) return
    setDeletingHotelId(id)
    try {
      await deleteHotel({ hotelId: id as any })
      await loadInventory()
    } catch (err: any) {
      setHotelDeleteErrors((c) => ({ ...c, [id]: err.message }))
    } finally {
      setDeletingHotelId(null)
    }
  }

  const handleDeleteRoomType = async (id: string, label: string) => {
    if (!window.confirm(`Delete room type "${label}"?`)) return
    setDeletingRoomTypeId(id)
    try {
      await deleteRoomType({ roomTypeId: id as any })
      await loadInventory()
    } catch (err: any) {
      setRoomTypeDeleteErrors((c) => ({ ...c, [id]: err.message }))
    } finally {
      setDeletingRoomTypeId(null)
    }
  }

  return (
    <div className="animate-in space-y-8 pb-12 duration-700 fade-in">
      {/* Premium Header */}
      <header className="flex flex-col gap-6 px-1 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
              INV
            </span>
            <p className="py-0.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              Global Repository
            </p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Inventory Center
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Coordinate venue logistics, room specifications and estate stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-10 rounded-lg border-border/50 bg-card/40 text-xs font-bold shadow-sm backdrop-blur"
          >
            <Link href="/dashboard/accommodation">
              <ChevronLeft className="mr-2 size-3.5" /> Back to Allocation
            </Link>
          </Button>
          <Button
            onClick={() => {
              setCurrentStep(1)
              setIsRegisterInventoryOpen(true)
            }}
            size="sm"
            className="h-10 rounded-lg bg-primary text-xs font-bold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95"
          >
            <Plus className="mr-2 size-3.5" /> Register Inventory
          </Button>
          <Button
            onClick={() => loadInventory()}
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
          >
            <RefreshCcw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </header>

      {/* Hero Analytics */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <article className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
          <div className="absolute -top-4 -right-4 size-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
            Total Estate
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded-lg" />
            ) : (
              <>
                <span className="text-4xl font-black tracking-tight">
                  {payload.summary.totalRooms}
                </span>
                <span className="text-xs font-bold tracking-wider text-muted-foreground/60">
                  ROOMS
                </span>
              </>
            )}
          </div>
        </article>

        <article className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
          <div className="absolute -top-4 -right-4 size-24 rounded-full bg-indigo-500/5 blur-2xl transition-all group-hover:bg-indigo-500/10" />
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
            Active Capacity
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded-lg" />
            ) : (
              <span className="text-4xl font-black tracking-tight text-indigo-500">
                {capacityUtilization}%
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-1000"
                style={{ width: `${capacityUtilization}%` }}
              />
            </div>
            <p className="text-[10px] font-medium text-muted-foreground/60">
              {occupiedCapacity} of {totalCapacity} beds taken
            </p>
          </div>
        </article>

        <article className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
          <div className="absolute -top-4 -right-4 size-24 rounded-full bg-amber-500/5 blur-2xl transition-all group-hover:bg-amber-500/10" />
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
            Ready Supply
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded-lg" />
            ) : (
              <span className="text-4xl font-black tracking-tight text-amber-500">
                {payload.summary.emptyRooms}
              </span>
            )}
          </div>
        </article>

        <article className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
          <div className="absolute -top-4 -right-4 size-24 rounded-full bg-rose-500/5 blur-2xl transition-all group-hover:bg-rose-500/10" />
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
            Spec Diversity
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            {isLoading ? (
              <Skeleton className="h-10 w-24 rounded-lg" />
            ) : (
              <span className="text-4xl font-black tracking-tight text-rose-500">
                {payload.roomTypes.length}
              </span>
            )}
          </div>
        </article>
      </section>

      {/* Live Estate View */}
      <section className="grid gap-8 lg:grid-cols-3">
        {/* Main Estate Column */}
        <div className="space-y-8 lg:col-span-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold tracking-tight">Active Estate</h3>
            <div className="flex items-center gap-4 text-[10px] font-black tracking-widest text-muted-foreground/40 uppercase">
              <span className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-emerald-500" />{" "}
                Operational
              </span>
              <span className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-amber-500" /> Partially
                Full
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
              ))}
            </div>
          ) : payload.hotels.length === 0 ? (
            <article className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-12 text-center">
              <Building2 className="mx-auto mb-4 size-12 text-muted-foreground/20" />
              <h4 className="text-lg font-bold text-muted-foreground/60">
                No venues synchronized
              </h4>
              <p className="mt-1 text-sm text-muted-foreground/40">
                Start by registering your first hotel property.
              </p>
            </article>
          ) : (
            <div className="space-y-6">
              {payload.hotels.map((hotel) => {
                const hotelRooms = payload.rooms.filter(
                  (r) => r.hotel.id === hotel.id
                )
                const grouped = groupInventoryRoomsByRoomType(hotelRooms)
                return (
                  <article
                    key={hotel.id}
                    className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm backdrop-blur-xl transition-all hover:border-primary/20"
                  >
                    <div className="flex items-center justify-between border-b border-border/30 bg-muted/40 p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                          <Hotel className="size-6" strokeWidth={2.5} />
                        </div>
                        <div>
                          <h4 className="text-lg font-black tracking-tight">
                            {hotel.name}
                          </h4>
                          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
                            <MapPin className="size-3" />{" "}
                            {hotel.city || "Not set"} · {hotelRooms.length}{" "}
                            Units configured
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openHotelScopeModal(hotel.id)}
                          className="rounded-lg text-primary hover:bg-primary/5"
                        >
                          <RefreshCcw className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingHotelId === hotel.id}
                          onClick={() =>
                            handleDeleteHotel(hotel.id, hotel.name)
                          }
                          className="rounded-lg text-rose-500 hover:bg-rose-500/5 hover:text-rose-600"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-6">
                      {hotelRooms.length === 0 ? (
                        <p className="py-8 text-center text-[10px] font-bold tracking-widest text-muted-foreground/40 uppercase italic">
                          No room blocks defined
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {grouped.map((block) => (
                            <div
                              key={block.roomTypeLabel}
                              className="group flex items-center justify-between rounded-lg border border-border/20 bg-background/40 p-4 transition-all hover:bg-background/60"
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex size-8 items-center justify-center rounded-lg border border-indigo-500/10 bg-indigo-500/5 text-indigo-500/50">
                                  <BedDouble className="size-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-black text-foreground">
                                    {block.roomTypeLabel}
                                  </p>
                                  <p className="text-[10px] font-bold text-muted-foreground/50 uppercase">
                                    {block.quantity} ROOMS
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-8">
                                <div className="text-center">
                                  <p className="text-[9px] font-black text-muted-foreground/40 uppercase">
                                    Capacity
                                  </p>
                                  <p className="text-xs font-bold">
                                    {block.totalBeds}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[9px] font-black tracking-wider text-muted-foreground/40 uppercase">
                                    Occupied
                                  </p>
                                  <p
                                    className={cn(
                                      "text-xs font-bold",
                                      block.occupiedBeds >= block.totalBeds
                                        ? "text-rose-500"
                                        : "text-amber-600"
                                    )}
                                  >
                                    {block.occupiedBeds}
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[9px] font-black text-muted-foreground/40 uppercase">
                                    Available
                                  </p>
                                  <p className="text-xs font-bold text-emerald-600">
                                    {block.availableBeds}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {hotelDeleteErrors[hotel.id] && (
                        <p className="mt-4 rounded-lg border border-rose-500/10 bg-rose-500/5 p-2 text-[10px] font-bold text-rose-500">
                          {hotelDeleteErrors[hotel.id]}
                        </p>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {/* Side Spec Column */}
        <div className="space-y-8">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold tracking-tight">Catalogs</h3>
          </div>

          <article className="rounded-xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="mb-0.5 text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
                  Asset Templates
                </p>
                <h4 className="text-sm font-black tracking-tight tracking-widest uppercase">
                  Room Type Specs
                </h4>
              </div>
            </div>

            <div className="grid gap-3">
              {payload.roomTypes.length === 0 ? (
                <p className="py-4 text-center text-[10px] font-bold text-muted-foreground/30 uppercase italic">
                  No specs defined
                </p>
              ) : (
                payload.roomTypes.map((type) => (
                  <div
                    key={type.id}
                    className="group flex items-center justify-between rounded-lg border border-border/30 bg-background/40 p-3.5 transition-all hover:bg-background/60"
                  >
                    <div>
                      <p className="text-xs font-black text-foreground">
                        {type.label}
                      </p>
                      <p className="text-[9px] font-bold text-muted-foreground/50 uppercase">
                        {type.defaultCapacity}-Bed Capacity
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deletingRoomTypeId === type.id}
                      onClick={() => handleDeleteRoomType(type.id, type.label)}
                      className="size-7 rounded-md text-rose-300 opacity-20 transition-opacity group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>

      {/* Multi-Step Provisioning Modal */}
      {isRegisterInventoryOpen && (
        <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-background/80 p-4 backdrop-blur-xl duration-300 fade-in">
          <div className="relative flex min-h-[500px] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border/50 bg-card/60 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/20 p-8 pb-4">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl transition-all",
                    currentStep === 1
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                      : currentStep === 2
                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                        : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  )}
                >
                  {currentStep === 1 ? (
                    <Hotel className="size-5" />
                  ) : currentStep === 2 ? (
                    <Sparkles className="size-5" />
                  ) : (
                    <BedDouble className="size-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight">
                    Provision Inventory
                  </h2>
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Phase {currentStep} of 3
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsRegisterInventoryOpen(false)}
                className="rounded-full text-muted-foreground/40 hover:text-foreground"
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* Step Progress Bar */}
            <div className="flex items-center gap-2 px-8 pt-6">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all duration-500",
                    currentStep >= step
                      ? step === 1
                        ? "bg-indigo-500"
                        : step === 2
                          ? "bg-rose-500"
                          : "bg-emerald-500"
                      : "bg-muted/40"
                  )}
                />
              ))}
            </div>

            {/* Form Content Area */}
            <div className="flex-1 p-8">
              {currentStep === 1 && (
                <div className="animate-in space-y-8 duration-500 slide-in-from-right-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-black tracking-tight">
                      Identify the Property
                    </h3>
                    <p className="text-sm font-medium text-muted-foreground">
                      Create a new hotel or venue entry in the global registry.
                    </p>
                  </div>
                  <form onSubmit={submitHotel} className="space-y-5">
                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                        Venue Name
                      </label>
                      <input
                        autoFocus
                        value={hotelName}
                        onChange={(e) => setHotelName(e.target.value)}
                        placeholder="e.g. Grand Plaza Executive..."
                        className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                        City / Locale
                      </label>
                      <input
                        value={hotelCity}
                        onChange={(e) => setHotelCity(e.target.value)}
                        placeholder="e.g. Lagos, Nigeria..."
                        className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    {errors.hotels && (
                      <p className="rounded-lg border border-rose-500/10 bg-rose-500/5 p-2 text-[10px] font-bold text-rose-500 uppercase">
                        {errors.hotels}
                      </p>
                    )}
                  </form>
                  <div className="flex items-center gap-3 pt-4">
                    {payload.hotels.length > 0 && (
                      <Button
                        variant="ghost"
                        className="h-12 rounded-lg px-6 text-xs font-bold text-muted-foreground uppercase"
                        onClick={() => setCurrentStep(2)}
                      >
                        Skip to Templates
                      </Button>
                    )}
                    <Button
                      disabled={isMutating || !hotelName.trim()}
                      onClick={submitHotel}
                      className="h-12 flex-1 rounded-lg bg-indigo-600 text-xs font-bold tracking-widest text-white uppercase shadow-lg shadow-indigo-600/20"
                    >
                      Create & Continue <ChevronRight className="ml-2 size-4" />
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="animate-in space-y-8 duration-500 slide-in-from-right-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-black tracking-tight text-rose-500">
                      Define the Spec
                    </h3>
                    <p className="text-sm font-medium text-muted-foreground">
                      Create a reusable room blueprint with specific bed
                      capacity.
                    </p>
                  </div>
                  <form onSubmit={submitRoomType} className="space-y-5">
                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                        Type Label
                      </label>
                      <input
                        autoFocus
                        value={roomTypeLabel}
                        onChange={(e) => setRoomTypeLabel(e.target.value)}
                        placeholder="e.g. Executive Platinum Double..."
                        className="flex h-12 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm font-bold transition-all outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                        Bed Capacity
                      </label>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={roomTypeCapacity}
                          onChange={(e) => setRoomTypeCapacity(e.target.value)}
                          className="flex-1 accent-rose-500"
                        />
                        <span className="flex size-12 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-lg font-black text-rose-500">
                          {roomTypeCapacity}
                        </span>
                      </div>
                    </div>
                    {errors.roomTypes && (
                      <p className="rounded-lg border border-rose-500/10 bg-rose-500/5 p-2 text-[10px] font-bold text-rose-500 uppercase">
                        {errors.roomTypes}
                      </p>
                    )}
                  </form>
                  <div className="flex items-center gap-3 pt-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 rounded-lg text-muted-foreground"
                      onClick={() => setCurrentStep(1)}
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    {payload.roomTypes.length > 0 &&
                      payload.hotels.length > 0 && (
                        <Button
                          variant="ghost"
                          className="h-12 rounded-lg px-6 text-xs font-bold text-muted-foreground uppercase"
                          onClick={() => setCurrentStep(3)}
                        >
                          Skip to Stock
                        </Button>
                      )}
                    <Button
                      disabled={isMutating || !roomTypeLabel.trim()}
                      onClick={submitRoomType}
                      className="h-12 flex-1 rounded-lg bg-rose-500 text-xs font-bold tracking-widest text-white uppercase shadow-lg shadow-rose-500/20"
                    >
                      Save Template <ChevronRight className="ml-2 size-4" />
                    </Button>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="animate-in space-y-8 duration-500 slide-in-from-right-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-black tracking-tight text-emerald-500">
                      Provision Stock
                    </h3>
                    <p className="text-sm font-medium text-muted-foreground">
                      Link a physical room block to a property using a template
                      spec.
                    </p>
                  </div>
                  <form onSubmit={submitRoom} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                          Target Venue
                        </label>
                        <select
                          value={roomHotelId}
                          onChange={(e) => setRoomHotelId(e.target.value)}
                          className="flex h-12 w-full appearance-none rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-bold transition-all outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="">Select Venue</option>
                          {payload.hotels.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                          Spec Template
                        </label>
                        <select
                          value={roomTypeId}
                          onChange={(e) => setRoomTypeId(e.target.value)}
                          className="flex h-12 w-full appearance-none rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-bold transition-all outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="">Select Spec</option>
                          {payload.roomTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                            Number of Rooms
                          </label>
                          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-500">
                            {roomQuantity}
                          </span>
                        </div>
                        <Slider
                          value={[Number(roomQuantity)]}
                          onValueChange={(value) =>
                            setRoomQuantity(value[0].toString())
                          }
                          min={1}
                          max={50}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase">
                          <span>1</span>
                          <span>25</span>
                          <span>50</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
                          Custom Room Labels (Optional)
                        </label>
                        <textarea
                          value={manualRoomLabels}
                          onChange={(e) => setManualRoomLabels(e.target.value)}
                          placeholder="Enter room names one per line to override auto-generated labels..."
                          className="flex min-h-[100px] w-full rounded-lg border border-border/40 bg-background/50 px-4 py-4 text-xs font-bold transition-all outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <p className="ml-1 text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase italic">
                          Leave empty to auto-generate room identifiers.
                        </p>
                      </div>
                    </div>
                    {errors.rooms && (
                      <p className="rounded-lg border border-rose-500/10 bg-rose-500/5 p-2 text-[10px] font-bold text-rose-500 uppercase">
                        {errors.rooms}
                      </p>
                    )}
                  </form>
                  <div className="flex items-center gap-3 pt-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 rounded-lg text-muted-foreground"
                      onClick={() => setCurrentStep(2)}
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <Button
                      disabled={isMutating || !roomHotelId || !roomTypeId}
                      onClick={submitRoom}
                      className="h-12 flex-1 rounded-lg bg-emerald-600 text-xs font-bold tracking-widest text-white uppercase shadow-lg shadow-emerald-500/20"
                    >
                      Sync Stock Block <CheckCircle2 className="ml-2 size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scope Management Modal */}
      {activeHotelScopeId && (
        <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-background/80 p-4 backdrop-blur-xl duration-300 zoom-in-95">
          <div className="w-full max-w-xl rounded-xl border border-border/50 bg-card/60 p-8 shadow-2xl">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black tracking-tight">
                  {
                    payload.hotels.find((h) => h.id === activeHotelScopeId)
                      ?.name
                  }
                </h3>
                <p className="mt-1 text-xs font-bold tracking-widest text-muted-foreground/60 uppercase">
                  Scope Reach Management
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Layers className="size-5" />
              </div>
            </div>

            <div className="mb-8 max-h-[300px] space-y-3 overflow-y-auto pr-2">
              {isLoading && payload.hotels.length === 0 ? (
                <div className="grid gap-6">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex h-[340px] flex-col rounded-xl border border-border/40 bg-card/60 p-6"
                    >
                      <div className="flex items-center justify-between border-b border-border/10 pb-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-10 rounded-lg" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-48 rounded-md" />
                            <Skeleton className="h-3 w-32 rounded-md" />
                          </div>
                        </div>
                        <Skeleton className="h-6 w-24 rounded-lg" />
                      </div>
                      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <Skeleton key={j} className="h-32 rounded-xl" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : payload.availableEvents.length === 0 ? (
                <p className="py-6 text-center text-sm font-bold text-muted-foreground italic">
                  No events available
                </p>
              ) : (
                payload.availableEvents.map((event) => {
                  const checked = draftEventIds.includes(event.providerEventId)
                  return (
                    <label
                      key={event.providerEventId}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all",
                        checked
                          ? "border-primary bg-primary/[0.03]"
                          : "border-border/40 bg-background/40"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex size-4 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/20"
                          )}
                        >
                          {checked && (
                            <CheckCircle2 className="size-3 text-white" />
                          )}
                        </div>
                        <span className="text-xs font-black tracking-tight">
                          {event.name}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={(e) => {
                          setDraftEventIds((curr) =>
                            e.target.checked
                              ? [...curr, event.providerEventId]
                              : curr.filter(
                                  (id) => id !== event.providerEventId
                                )
                          )
                        }}
                      />
                      <span className="text-[9px] font-black tracking-widest text-muted-foreground/40 uppercase">
                        {event.providerEventId}
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={closeHotelScopeModal}
                className="h-11 flex-1 rounded-lg text-xs font-bold tracking-widest uppercase"
              >
                Cancel
              </Button>
              <Button
                onClick={saveHotelScope}
                disabled={isMutating}
                className="h-11 flex-1 rounded-lg bg-primary text-xs font-bold tracking-widest text-white uppercase shadow-lg shadow-primary/20"
              >
                Sync Reach
              </Button>
            </div>
            {errors.eventHotels && (
              <p className="mt-4 text-center text-[10px] font-bold text-rose-500 uppercase">
                {errors.eventHotels}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function metricValueLabel(value: number, suffix = "") {
  return `${value.toLocaleString()}${suffix}`
}
