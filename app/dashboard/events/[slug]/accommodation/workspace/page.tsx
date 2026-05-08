"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useEventBySlug } from "@/lib/convex/hooks/events"
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
import { LinkedHotelCard } from "../../components/linked-hotel-card"
import { AddHotelDialog } from "../../components/add-hotel-dialog"
import { AddRoomsDialog } from "./components/add-rooms-dialog"
import { CreateHotelDialog } from "./components/create-hotel-dialog"

export default function EventAccommodationWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const router = useRouter()
  const { slug } = use(params)
  const event = useEventBySlug(slug)

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

  const hotels = useHotels()
  const roomTypes = useRoomTypes()
  const createHotel = useCreateHotel()
  const createRooms = useCreateRooms()
  const createRoomType = useCreateRoomType()
  const linkHotelToEvent = useLinkHotelToEvent()
  const selectedHotelForRooms = useHotelById(selectedHotelForRoomsId)

  const handleAddHotelSubmit = async (data: { hotelId: any }) => {
    if (!event) return
    setIsLinkingHotel(true)
    try {
      await linkHotelToEvent({
        eventId: event._id,
        hotelId: data.hotelId,
        autoGenerateSlots: true,
      })
    } catch (err) {
      console.error("Failed to assign hotel:", err)
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
      if (!event) return
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
    if (!event) return
    setIsAddingRooms(true)
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
      throw err
    } finally {
      setIsAddingRooms(false)
    }
  }

  if (event === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="space-y-6">
        <Link
          href={`/dashboard/events/${slug}/accommodation`}
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Accommodation
        </Link>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Event Not Found
          </h1>
          <p className="mt-2 text-muted-foreground">
            The event &quot;{slug}&quot; could not be found.
          </p>
        </div>
      </div>
    )
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
            <h3 className="mt-6 text-xl font-bold tracking-tight">
              Accommodation Disabled
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Enable accommodation in event settings to manage hotels, room
              assignments, and floor plans.
            </p>
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
    <div className="space-y-6">
      <Link
        href={`/dashboard/events/${slug}/accommodation`}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to Accommodation
      </Link>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <Hotel className="size-3" />
            Hotels Linked
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-foreground">
            {eventHotels === undefined ? "-" : eventHotels.length}
          </p>
        </div>

        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <Building2 className="size-3" />
            Total Slots
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-foreground">
            {summary?.totalSlots ?? "-"}
          </p>
          {summary && (
            <p className="mt-1 text-xs text-muted-foreground/60">
              {summary.assignableSlots} assignable
            </p>
          )}
        </div>

        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <Users className="size-3" />
            Submissions
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-foreground">
            {summary?.submissionsCount ?? "-"}
          </p>
        </div>

        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <BedDouble className="size-3" />
            Occupancy
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-foreground">
            {slots
              ? `${Math.round(
                  (slots.filter(
                    (s: { isAssignable: boolean }) => !s.isAssignable
                  ).length /
                    (slots.length || 1)) *
                    100
                )}%`
              : "-"}
          </p>
        </div>
      </div>

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">
              Linked Hotels
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Hotels linked to this event for room assignments
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
            <Skeleton className="h-24 rounded-2xl" />
          ) : eventHotels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
              <Hotel className="mx-auto mb-4 size-12 text-muted-foreground opacity-20" />
              <p className="text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">
                No hotels linked yet
              </p>
              <p className="mt-2 text-xs text-muted-foreground/60">
                Add hotels to enable room assignments for this event
              </p>
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
        <Card
          className="cursor-pointer border-white/40 bg-white/40 shadow-sm backdrop-blur transition-colors hover:border-primary/30 dark:border-white/10 dark:bg-black/20"
          onClick={() => router.push(`/dashboard/events/${slug}/accommodation/allocation`)}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Users className="size-5 text-muted-foreground" />
              Room Allocation
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              View and manage room assignments, occupancy, and available beds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-primary">
              View allocation <ArrowRight className="ml-2 size-4" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer border-white/40 bg-white/40 shadow-sm backdrop-blur transition-colors hover:border-primary/30 dark:border-white/10 dark:bg-black/20"
          onClick={() => router.push("/dashboard/accommodation/inventory")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Building2 className="size-5 text-muted-foreground" />
              Global Inventory
            </CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Manage hotels, rooms, and room types across all events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-primary">
              Manage inventory <ArrowRight className="ml-2 size-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {event && (
        <AddHotelDialog
          open={isAddHotelDialogOpen}
          onOpenChange={setIsAddHotelDialogOpen}
          existingHotels={hotels}
          linkedHotelIds={eventHotels?.map((hotel: any) => hotel._id) ?? []}
          onSubmit={handleAddHotelSubmit}
          isSubmitting={isLinkingHotel}
        />
      )}

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
    </div>
  )
}
