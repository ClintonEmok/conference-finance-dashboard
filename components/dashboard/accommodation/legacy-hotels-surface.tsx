"use client"

import { use, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  BedDouble,
  Building2,
  Users,
  ArrowRight,
  Plus,
  Hotel,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import {
  useEventHotels,
  useSlotsForEvent,
  useAccommodationSummaryForEvent,
  useHotelById,
  useHotels,
  useRoomTypes,
  useCreateHotel,
  useCreateRooms,
  useCreateRoomType,
  useLinkHotelToEvent,
} from "@/lib/convex/hooks/accommodation"
import { LinkedHotelCard } from "@/app/dashboard/events/[slug]/components/linked-hotel-card"
import { AddHotelDialog } from "@/app/dashboard/events/[slug]/components/add-hotel-dialog"
import { AddRoomsDialog } from "@/app/dashboard/events/[slug]/accommodation/workspace/components/add-rooms-dialog"
import { CreateHotelDialog } from "@/app/dashboard/events/[slug]/accommodation/workspace/components/create-hotel-dialog"

export default function EventAccommodationWorkspacePage({
  params,
  event,
}: {
  params: Promise<{ slug: string }>
  event: EventDashboardEvent
}) {
  const { slug } = use(params)

  const eventHotels = useEventHotels(event?._id ?? "")
  const slots = useSlotsForEvent(event?._id)
  const summary = useAccommodationSummaryForEvent(event?._id)

  const [isAddHotelDialogOpen, setIsAddHotelDialogOpen] = useState(false)
  const [isLinkingHotel, setIsLinkingHotel] = useState(false)
  const [isCreateHotelDialogOpen, setIsCreateHotelDialogOpen] = useState(false)
  const [isCreatingHotel, setIsCreatingHotel] = useState(false)
  const [isAddRoomsDialogOpen, setIsAddRoomsDialogOpen] = useState(false)
  const [selectedHotelForRoomsId, setSelectedHotelForRoomsId] = useState<
    string | undefined
  >(undefined)
  const [isAddingRooms, setIsAddingRooms] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)

  const hotels = useHotels()
  const roomTypes = useRoomTypes()
  const createHotel = useCreateHotel()
  const createRooms = useCreateRooms()
  const createRoomType = useCreateRoomType()
  const linkHotelToEvent = useLinkHotelToEvent()
  const selectedHotelForRooms = useHotelById(selectedHotelForRoomsId)

  const handleAddHotelSubmit = async (data: { hotelId: any }) => {
    setIsLinkingHotel(true)
    setOperationError(null)
    try {
      await linkHotelToEvent({
        eventId: event._id,
        hotelId: data.hotelId,
        autoGenerateSlots: true,
      })
    } catch (err) {
      console.error("Failed to assign hotel:", err)
      setOperationError(err instanceof Error ? err.message : "Failed to link hotel.")
      throw err
    } finally {
      setIsLinkingHotel(false)
    }
  }

  const handleCreateHotelSubmit = async (data: {
    name: string
    city?: string
  }) => {
    setIsCreatingHotel(true)
    try {
      const hotelId = await createHotel({
        name: data.name,
        city: data.city,
      })
      await linkHotelToEvent({
        eventId: event._id,
        hotelId: hotelId as any,
        autoGenerateSlots: true,
      })
      setSelectedHotelForRoomsId(hotelId)
      setIsAddRoomsDialogOpen(true)
    } catch (err) {
      console.error("Failed to create hotel:", err)
      throw err
    } finally {
      setIsCreatingHotel(false)
    }
  }

  const handleAddRoomsSubmit = async (data: {
    hotelId: any
    roomTypes: Array<{
      id: string
      label: string
      capacity: number
      roomCount: number
    }>
  }) => {
    setIsAddingRooms(true)
    setOperationError(null)
    try {
      const roomTypeMap = new Map<string, any>()
      for (const rt of data.roomTypes) {
        if (rt.id.startsWith("new-")) {
          const newRtId = await createRoomType({
            label: rt.label,
            defaultCapacity: rt.capacity,
          })
          roomTypeMap.set(rt.id, newRtId)
        } else {
          roomTypeMap.set(rt.id, rt.id)
        }
      }

      for (const rt of data.roomTypes) {
        const roomTypeId = roomTypeMap.get(rt.id)
        if (!roomTypeId) continue

        const roomLabels = Array.from(
          { length: rt.roomCount },
          (_, i) => `${rt.label} ${String(i + 1).padStart(2, "0")}`
        )

        await createRooms({
          hotelId: data.hotelId,
          roomTypeId,
          quantity: rt.roomCount,
          labels: roomLabels,
        })
      }
    } catch (err) {
      console.error("Failed to add rooms:", err)
      setOperationError(err instanceof Error ? err.message : "Failed to add rooms.")
      throw err
    } finally {
      setIsAddingRooms(false)
    }
  }

  if (!event.accommodationEnabled) {
    return (
      <div className="space-y-6">
        <Link
          href={`/dashboard/events/${slug}/accommodation`}
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Accommodation
        </Link>

        <Card className="border-dashed border-white/20 bg-white/5 dark:bg-black/10">
          <CardContent className="py-20 text-center">
            <BedDouble className="mx-auto size-16 text-muted-foreground opacity-10" />
            <DashboardQueryState state="disabled" title="Accommodation disabled" message="Enable accommodation in event settings to manage hotels, room assignments, and floor plans." className="mx-auto mt-6 max-w-sm" />
            <Button asChild variant="outline" className="mt-8 rounded-2xl border-white/20">
              <Link href={`/dashboard/events/${slug}/settings`}>
                Go to Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Hotel setup and linked inventory</p>
          <p className="text-xs text-muted-foreground">{event.title} · event-scoped accommodation configuration</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{eventHotels === undefined ? "Checking hotels…" : `${eventHotels.length} linked hotel${eventHotels.length === 1 ? "" : "s"}`}</span>
          <span>{slots === undefined ? "Checking rooms…" : `${slots.length} slot${slots.length === 1 ? "" : "s"}`}</span>
          {summary && <span>{summary.assignableSlots} assignable</span>}
        </div>
      </div>

      <Card className="border-border/60 bg-card shadow-none">
          <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-lg font-bold">
              Linked Hotels
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Hotels linked to this event for room assignments
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddHotelDialogOpen(true)}
              className="rounded-2xl border-white/20 text-[11px] font-bold uppercase"
            >
              <Plus className="mr-2 size-3" />
              Import
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCreateHotelDialogOpen(true)}
              className="rounded-2xl text-[11px] font-bold uppercase"
            >
              <Plus className="mr-2 size-3" />
              Add Hotel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {eventHotels === undefined ? (
            <DashboardQueryState state="loading" className="py-8" />
          ) : eventHotels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
              <Hotel className="mx-auto mb-4 size-12 text-muted-foreground opacity-20" />
              <DashboardQueryState state="unconfigured" title="No hotels linked yet" message="Add a hotel to enable room assignments for this event." />
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddHotelDialogOpen(true)}
                  className="rounded-2xl border-white/20 text-[11px] font-bold uppercase"
                >
                  Import Inventory
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsCreateHotelDialogOpen(true)}
                  className="rounded-2xl text-[11px] font-bold uppercase"
                >
                  Add Hotel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {eventHotels.map((hotel: any) => (
                <LinkedHotelCard
                  key={hotel._id}
                  hotel={hotel}
                  onUnlink={async () => {}}
                  onAddRooms={() => {
                    setSelectedHotelForRoomsId(hotel._id)
                    setIsAddRoomsDialogOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/dashboard/events/${slug}/accommodation/allocation`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Card className="border-border/60 bg-card shadow-none transition-colors hover:border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Users className="size-5 text-muted-foreground" aria-hidden="true" />
              Room Allocation
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              View and manage room assignments, occupancy, and available beds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-primary">
              View allocation <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
        </Link>

        <Link href="/dashboard/accommodation/inventory" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Card className="border-border/60 bg-card shadow-none transition-colors hover:border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
              Global Inventory
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Manage hotels, rooms, and room types across all events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-primary">
              Manage inventory <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
        </Link>
      </div>

      <AddHotelDialog
          open={isAddHotelDialogOpen}
          onOpenChange={setIsAddHotelDialogOpen}
          existingHotels={hotels}
          linkedHotelIds={eventHotels?.map((hotel: any) => hotel._id) ?? []}
          onSubmit={handleAddHotelSubmit}
          isSubmitting={isLinkingHotel}
        />

      <CreateHotelDialog
        open={isCreateHotelDialogOpen}
        onOpenChange={setIsCreateHotelDialogOpen}
        onSubmit={handleCreateHotelSubmit}
        isSubmitting={isCreatingHotel}
      />

      <AddRoomsDialog
        open={isAddRoomsDialogOpen}
        onOpenChange={setIsAddRoomsDialogOpen}
        hotel={selectedHotelForRooms ?? null}
        existingRoomTypes={roomTypes}
        onSubmit={handleAddRoomsSubmit}
        isSubmitting={isAddingRooms}
      />
      {operationError ? <p role="alert" aria-live="assertive" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{operationError}</p> : null}
    </div>
  )
}
