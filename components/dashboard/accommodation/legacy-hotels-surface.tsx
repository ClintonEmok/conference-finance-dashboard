"use client"

import { use, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  BedDouble,
  Users,
  ArrowRight,
  Plus,
  Hotel,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import {
  useEventHotels,
  useSlotsForEvent,
  useAccommodationSummaryForEvent,
  useHotelById,
  useRoomTypes,
  useCreateHotel,
  useCreateRooms,
  useCreateRoomType,
  useLinkHotelToEvent,
} from "@/lib/convex/hooks/accommodation"
import { LinkedHotelCard } from "@/app/dashboard/events/[slug]/components/linked-hotel-card"
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

  const [isCreateHotelDialogOpen, setIsCreateHotelDialogOpen] = useState(false)
  const [isCreatingHotel, setIsCreatingHotel] = useState(false)
  const [isAddRoomsDialogOpen, setIsAddRoomsDialogOpen] = useState(false)
  const [selectedHotelForRoomsId, setSelectedHotelForRoomsId] = useState<
    string | undefined
  >(undefined)
  const [isAddingRooms, setIsAddingRooms] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)

  const roomTypes = useRoomTypes()
  const createHotel = useCreateHotel()
  const createRooms = useCreateRooms()
  const createRoomType = useCreateRoomType()
  const linkHotelToEvent = useLinkHotelToEvent()
  const selectedHotelForRooms = useHotelById(selectedHotelForRoomsId)

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
        hotelId: hotelId as Id<"accommodationHotels">,
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
    hotelId: Id<"accommodationHotels">
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
      const roomTypeMap = new Map<string, Id<"accommodationRoomTypes">>()
      for (const rt of data.roomTypes) {
        if (rt.id.startsWith("new-")) {
          const newRtId = await createRoomType({
            label: rt.label,
            defaultCapacity: rt.capacity,
          })
          roomTypeMap.set(rt.id, newRtId)
        } else {
          roomTypeMap.set(
            rt.id,
            rt.id as Id<"accommodationRoomTypes">
          )
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
          <p className="text-sm font-semibold">Hotel setup for this event</p>
          <p className="text-xs text-muted-foreground">{event.title} · event-scoped accommodation configuration</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{eventHotels === undefined ? "Checking hotels…" : `${eventHotels.length} hotel${eventHotels.length === 1 ? "" : "s"}`}</span>
          <span>{slots === undefined ? "Checking rooms…" : `${slots.length} slot${slots.length === 1 ? "" : "s"}`}</span>
          {summary && <span>{summary.assignableSlots} assignable</span>}
        </div>
      </div>

      <Card className="border-border/60 bg-card shadow-none">
          <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-lg font-bold">
              Event Hotels
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Hotels configured for room assignments at this event
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              <DashboardQueryState state="unconfigured" title="No hotels configured yet" message="Add a hotel to enable room assignments for this event." />
              <div className="mt-6 flex items-center justify-center">
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
              {eventHotels.map((hotel: Doc<"accommodationHotels">) => (
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

      </div>

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
