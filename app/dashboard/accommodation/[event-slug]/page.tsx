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
  useHotels,
  useRoomTypes,
  useCreateHotel,
  useCreateRooms,
  useCreateRoomType,
  useLinkHotelToEvent,
} from "@/lib/convex/hooks/accommodation"
import { AddHotelDialog } from "@/app/dashboard/events/[slug]/components/add-hotel-dialog"

export default function EventAccommodationPage({
  params,
}: {
  params: Promise<{ "event-slug": string }>
}) {
  const router = useRouter()
  const { "event-slug": eventSlug } = use(params)
  const event = useEventBySlug(eventSlug)

  const eventHotels = useEventHotels(event?._id ?? "")
  const slots = useSlotsForEvent(event?._id)
  const summary = useAccommodationSummaryForEvent(event?._id)

  // Dialog state
  const [isAddHotelDialogOpen, setIsAddHotelDialogOpen] = useState(false)
  const [isLinkingHotel, setIsLinkingHotel] = useState(false)

  // Hooks for hotel creation
  const hotels = useHotels()
  const roomTypes = useRoomTypes()
  const createHotel = useCreateHotel()
  const createRooms = useCreateRooms()
  const createRoomType = useCreateRoomType()
  const linkHotelToEvent = useLinkHotelToEvent()

  const handleAddHotelSubmit = async (data: {
    hotelId?: any
    newHotel?: { name: string; city?: string; address?: string }
    roomTypes: Array<{
      id: string
      label: string
      capacity: number
      roomCount: number
    }>
  }) => {
    if (!event) return
    setIsLinkingHotel(true)
    try {
      let hotelId: any

      // Step 1: Create or use existing hotel
      if (data.hotelId) {
        hotelId = data.hotelId
      } else if (data.newHotel) {
        hotelId = await createHotel({
          name: data.newHotel.name,
          city: data.newHotel.city,
        })
      }

      if (!hotelId) throw new Error("Failed to get or create hotel")

      // Step 2: Create room types for new room types
      const roomTypeMap = new Map<string, any>()
      for (const rt of data.roomTypes) {
        if (rt.id.startsWith("new-")) {
          // Create new room type
          const newRtId = await createRoomType({
            label: rt.label,
            defaultCapacity: rt.capacity,
          })
          roomTypeMap.set(rt.id, newRtId)
        } else {
          // Use existing room type
          roomTypeMap.set(rt.id, rt.id)
        }
      }

      // Step 3: Create rooms (this will auto-generate slots when linked)
      for (const rt of data.roomTypes) {
        const roomTypeId = roomTypeMap.get(rt.id)
        if (!roomTypeId) continue

        // Create the specified number of rooms for this type
        const roomLabels = Array.from(
          { length: rt.roomCount },
          (_, i) => `${rt.label} ${String(i + 1).padStart(2, "0")}`
        )

        await createRooms({
          hotelId,
          roomTypeId,
          quantity: rt.roomCount,
          labels: roomLabels,
        })
      }

      // Step 4: Link hotel to event (this will auto-generate slots for all rooms)
      await linkHotelToEvent({
        eventId: event._id,
        hotelId,
        autoGenerateSlots: true,
      })
    } catch (err) {
      console.error("Failed to add hotel:", err)
      throw err
    } finally {
      setIsLinkingHotel(false)
    }
  }

  if (event === undefined) {
    return (
      <div className="animate-in space-y-6 duration-700 fade-in">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="animate-in space-y-6 duration-700 fade-in">
        <Link
          href="/dashboard/accommodation"
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Accommodation
        </Link>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Event Not Found
          </h1>
          <p className="mt-2 text-muted-foreground">
            The event &quot;{eventSlug}&quot; could not be found.
          </p>
        </div>
      </div>
    )
  }

  if (!event.accommodationEnabled) {
    return (
      <div className="animate-in space-y-6 duration-700 fade-in">
        <header className="flex flex-col gap-4 px-1">
          <Link
            href="/dashboard/accommodation"
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Back to Accommodation
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {event.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Accommodation is not enabled for this event
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/events/${event.slug}`}>
                Manage Event Settings
              </Link>
            </Button>
          </div>
        </header>

        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <BedDouble className="mb-4 size-12 text-muted-foreground/50" />
            <h3 className="text-lg font-medium">Accommodation Not Enabled</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Enable the accommodation module in event settings to manage room
              assignments for this event.
            </p>
            <Button className="mt-4" asChild>
              <Link href={`/dashboard/events/${event.slug}?tab=settings`}>
                Enable Accommodation
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-6 duration-700 fade-in">
      {/* Header */}
      <header className="flex flex-col gap-4 px-1">
        <Link
          href="/dashboard/accommodation"
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Accommodation
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {event.title}
              </h1>
              <Badge variant={event.isPublished ? "default" : "outline"}>
                {event.isPublished ? "Published" : "Draft"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {format(new Date(event.startsAt), "MMM d, yyyy")} • Accommodation
              Management
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href={`/dashboard/accommodation?eventId=${event._id}`}>
                <BedDouble className="mr-2 size-4" />
                Open Full Workspace
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hotels Linked</CardTitle>
            <Hotel className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {eventHotels === undefined ? "-" : eventHotels.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Available for room assignments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Slots</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.totalSlots ?? "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.assignableSlots ?? 0} assignable
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Submissions</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.submissionsCount ?? "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              Accommodation requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
            <BedDouble className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {slots
                ? Math.round(
                    (slots.filter(
                      (s: { isAssignable: boolean }) => !s.isAssignable
                    ).length /
                      (slots.length || 1)) *
                      100
                  )
                : "-"}
              %
            </div>
            <p className="text-xs text-muted-foreground">Beds assigned</p>
          </CardContent>
        </Card>
      </div>

      {/* Hotels Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Linked Hotels</CardTitle>
            <CardDescription>
              Hotels available for room assignments at this event
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsAddHotelDialogOpen(true)}
          >
            <Plus className="mr-2 size-4" />
            Add Hotel
          </Button>
        </CardHeader>
        <CardContent>
          {eventHotels === undefined ? (
            <Skeleton className="h-24" />
          ) : eventHotels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Hotel className="mb-4 size-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No hotels linked yet. Add hotels to enable room assignments.
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <Link href={`/dashboard/events/${event.slug}?tab=settings`}>
                  Manage Hotels
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {eventHotels.map((hotel: any) => (
                <Card key={hotel._id} className="bg-muted/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{hotel.name}</CardTitle>
                    {hotel.city && (
                      <CardDescription>{hotel.city}</CardDescription>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className="cursor-pointer transition-colors hover:border-primary/50"
          onClick={() =>
            router.push(`/dashboard/accommodation?eventId=${event._id}`)
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BedDouble className="size-5" />
              Room Assignments
            </CardTitle>
            <CardDescription>
              Manage room assignments and view occupancy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-primary">
              Open workspace <ArrowRight className="ml-2 size-4" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-primary/50"
          onClick={() => router.push(`/dashboard/accommodation/inventory`)}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-5" />
              Global Inventory
            </CardTitle>
            <CardDescription>
              Manage hotels, rooms, and room types
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-primary">
              Manage inventory <ArrowRight className="ml-2 size-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Hotel Dialog */}
      {event && (
        <AddHotelDialog
          open={isAddHotelDialogOpen}
          onOpenChange={setIsAddHotelDialogOpen}
          eventId={event._id}
          existingHotels={hotels}
          existingRoomTypes={roomTypes}
          onSubmit={handleAddHotelSubmit}
          isSubmitting={isLinkingHotel}
        />
      )}
    </div>
  )
}
