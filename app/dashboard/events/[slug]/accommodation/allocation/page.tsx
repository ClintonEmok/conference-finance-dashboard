"use client"

import { use } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  BedDouble,
  Building2,
  Users,
  Hotel,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { useRoomAllocationBoard } from "@/lib/convex/hooks/accommodation"

export default function EventAllocationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const board = useRoomAllocationBoard(
    event?._id ? { eventId: event._id } : undefined
  )

  const rooms = board?.rooms ?? []
  const hotels = board?.hotels ?? []
  const totalRooms = rooms.length
  const occupiedRooms = rooms.filter((r: any) => r.availability === "full").length
  const partialRooms = rooms.filter(
    (r: any) => r.availability === "available"
  ).length
  const emptyRooms = rooms.filter((r: any) => r.availability === "empty").length

  if (event === undefined || board === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
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
              Enable accommodation in event settings to manage room allocations.
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
        href={`/dashboard/events/${slug}/accommodation/workspace`}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to Workspace
      </Link>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <Building2 className="size-3" />
            Total Rooms
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-foreground">
            {totalRooms}
          </p>
        </div>

        <div className="group rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-5 shadow-sm transition-all hover:bg-emerald-50/80 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-emerald-700/60 uppercase dark:text-emerald-400/60">
            <BedDouble className="size-3" />
            Available
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-emerald-700 dark:text-emerald-400">
            {emptyRooms + partialRooms}
          </p>
        </div>

        <div className="group rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5 shadow-sm transition-all hover:bg-amber-50/80 dark:border-amber-900/30 dark:bg-amber-950/20 dark:hover:bg-amber-950/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-amber-700/60 uppercase dark:text-amber-400/60">
            <Users className="size-3" />
            Partial
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-amber-700 dark:text-amber-400">
            {partialRooms}
          </p>
        </div>

        <div className="group rounded-2xl border border-rose-200/60 bg-rose-50/60 p-5 shadow-sm transition-all hover:bg-rose-50/80 dark:border-rose-900/30 dark:bg-rose-950/20 dark:hover:bg-rose-950/40">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-rose-700/60 uppercase dark:text-rose-400/60">
            <BedDouble className="size-3" />
            Full
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-rose-700 dark:text-rose-400">
            {occupiedRooms}
          </p>
        </div>
      </div>

      {hotels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <Hotel className="mx-auto mb-4 size-12 text-muted-foreground opacity-20" />
          <p className="text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">
            No hotels linked
          </p>
          <p className="mt-2 text-xs text-muted-foreground/60">
            Link hotels to this event to view room allocations
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-2xl border-white/20">
            <Link href={`/dashboard/events/${slug}/accommodation/workspace`}>
              Go to Workspace
            </Link>
          </Button>
        </div>
      ) : (
        hotels.map((hotel: any) => {
          const hotelRooms = rooms.filter((r: any) => r.hotel.id === hotel.id)
          if (hotelRooms.length === 0) return null

          return (
            <Card
              key={hotel.id}
              className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20"
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base font-bold">
                    {hotel.name}
                  </CardTitle>
                  {hotel.city && (
                    <CardDescription>{hotel.city}</CardDescription>
                  )}
                  <Badge variant="outline" className="ml-auto">
                    {hotelRooms.length} rooms
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {hotelRooms.map((room: any) => {
                    const occupantCount = room.occupants.length
                    const isFull = room.availability === "full"
                    const isEmpty = room.availability === "empty"
                    const isPartial = room.availability === "available"

                    return (
                      <div
                        key={room.id}
                        className="rounded-2xl border border-white/40 bg-white/40 p-4 shadow-sm transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{room.label}</p>
                          <Badge
                            variant="outline"
                            className={
                              isFull
                                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400"
                                : isEmpty
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400"
                            }
                          >
                            {occupantCount}/{room.capacity}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {room.roomType.label}
                        </p>
                        {occupantCount > 0 && (
                          <div className="mt-3 space-y-1 border-t border-border/30 pt-3">
                            {room.occupants.slice(0, 3).map((occ: any) => (
                              <p
                                key={occ.attendeeId}
                                className="truncate text-xs text-muted-foreground"
                              >
                                {occ.attendeeName ?? "Unnamed"}
                              </p>
                            ))}
                            {occupantCount > 3 && (
                              <p className="text-xs text-muted-foreground/50">
                                +{occupantCount - 3} more
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
