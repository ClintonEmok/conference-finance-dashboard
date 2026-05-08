"use client"

import { use, useState } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  Users,
  BedDouble,
  Building2,
  Hotel,
  X,
  Check,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import {
  useRoomAllocationBoard,
  useAssignAttendeeToRoom,
  useUnassignAttendeeFromRoom,
} from "@/lib/convex/hooks/accommodation"

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
  const assignAttendee = useAssignAttendeeToRoom()
  const unassignAttendee = useUnassignAttendeeFromRoom()

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const rooms = (board?.rooms as any[]) ?? []
  const hotels = (board?.hotels as any[]) ?? []
  const unassigned = (board?.unassignedAttendees as any[]) ?? []
  const summary = board?.summary as
    | {
        totalRooms: number
        totalBeds: number
        occupiedBeds: number
        availableBeds: number
        unassignedAttendeesCount: number
        emptyRooms: number
        availableRooms: number
        fullRooms: number
      }
    | undefined

  async function handleAssign(attendeeId: string) {
    if (!selectedRoomId) {
      setError("Select a room first by clicking on it.")
      return
    }
    setError(null)
    setSuccess(null)
    try {
      await assignAttendee({ attendeeId, roomId: selectedRoomId })
      setSuccess("Attendee assigned to room.")
      setSelectedRoomId(null)
    } catch (err: any) {
      setError(err.message ?? "Failed to assign attendee.")
    }
  }

  async function handleUnassign(attendeeId: string) {
    setError(null)
    setSuccess(null)
    try {
      await unassignAttendee({ attendeeId })
      setSuccess("Attendee removed from room.")
    } catch (err: any) {
      setError(err.message ?? "Failed to unassign attendee.")
    }
  }

  if (event === undefined || board === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <Skeleton className="h-[600px] rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
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
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
          <BedDouble className="mx-auto size-12 text-muted-foreground opacity-20" />
          <p className="mt-4 text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">
            Accommodation Disabled
          </p>
        </div>
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
        <div className="group rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm dark:border-white/5 dark:bg-black/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-muted-foreground/60 uppercase">
            <Building2 className="size-3" />
            Total Rooms
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter">
            {summary?.totalRooms ?? 0}
          </p>
        </div>

        <div className="group rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-emerald-700/60 uppercase dark:text-emerald-400/60">
            <BedDouble className="size-3" />
            Available Beds
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-emerald-700 dark:text-emerald-400">
            {summary?.availableBeds ?? 0}
          </p>
        </div>

        <div className="group rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-amber-700/60 uppercase dark:text-amber-400/60">
            <Users className="size-3" />
            Occupied
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-amber-700 dark:text-amber-400">
            {summary?.occupiedBeds ?? 0}
          </p>
        </div>

        <div className="group rounded-2xl border border-rose-200/60 bg-rose-50/60 p-5 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/20">
          <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-rose-700/60 uppercase dark:text-rose-400/60">
            <Users className="size-3" />
            Unassigned
          </p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-rose-700 dark:text-rose-400">
            {summary?.unassignedAttendeesCount ?? 0}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
          {success}
        </div>
      )}

      {selectedRoomId && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-3 text-sm text-primary">
          Room selected. Click an attendee in the inbox to assign them.
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRoomId(null)}
            className="ml-3 h-6 text-xs"
          >
            Clear selection
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_1fr]">
        <div className="flex h-[700px] flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Inbox</h3>
              <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                {unassigned.length} waiting
              </p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {unassigned.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-sm text-muted-foreground">
                All attendees have been placed.
              </div>
            ) : (
              unassigned.map((attendee: any) => (
                <div
                  key={attendee.attendeeId}
                  className="group flex flex-col rounded-xl border border-white/40 bg-white/40 p-3 transition-all hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {attendee.attendeeName ?? "Unnamed"}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 rounded-lg bg-primary/10 px-2.5 text-[11px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary hover:text-white"
                      onClick={() => handleAssign(attendee.attendeeId)}
                    >
                      Assign
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attendee.genderType &&
                      attendee.genderType !== "UNKNOWN" && (
                        <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground/80">
                          {attendee.genderType.toLowerCase()}
                        </span>
                      )}
                    {attendee.allocationPriority === "CRITICAL" && (
                      <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                        Critical
                      </span>
                    )}
                    {attendee.allocationPriority === "HIGH" && (
                      <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-500">
                        High
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight">
              Room availability
            </h3>
            <p className="text-xs font-medium text-muted-foreground">
              {rooms.length} rooms
            </p>
          </div>

          {hotels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-12 text-center">
              <Hotel className="mx-auto size-12 text-muted-foreground opacity-20" />
              <p className="mt-4 text-sm font-bold tracking-widest text-muted-foreground/40 uppercase">
                No hotels linked
              </p>
            </div>
          ) : (
            hotels.map((hotel: any) => {
              const hotelRooms = rooms.filter(
                (r: any) => r.hotel?.id === hotel.id
              )
              if (hotelRooms.length === 0) return null
              return (
                <div
                  key={hotel.id}
                  className="rounded-2xl border border-white/40 bg-white/40 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20"
                >
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <Building2 className="size-4 text-muted-foreground" />
                    <h4 className="text-sm font-bold">{hotel.name}</h4>
                    <Badge variant="outline" className="ml-auto">
                      {hotelRooms.length} rooms
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {hotelRooms.map((room: any) => {
                      const isSelected = selectedRoomId === room.id
                      const isFull = room.availability === "full"
                      const isEmpty = room.availability === "empty"
                      return (
                        <div
                          key={room.id}
                          onClick={() =>
                            setSelectedRoomId(
                              isSelected ? null : room.id
                            )
                          }
                          className={`cursor-pointer rounded-2xl border p-4 shadow-sm transition-all ${
                            isSelected
                              ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
                              : "border-white/40 bg-white/40 hover:bg-white/60 dark:border-white/5 dark:bg-black/20 dark:hover:bg-black/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">
                              {room.label}
                            </p>
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
                              {room.occupants?.length ?? 0}/{room.capacity}
                            </Badge>
                          </div>
                          {room.roomType && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {room.roomType.label}
                            </p>
                          )}
                          {room.occupants && room.occupants.length > 0 && (
                            <div className="mt-3 space-y-1 border-t border-border/30 pt-3">
                              {room.occupants
                                .slice(0, 3)
                                .map((occ: any) => (
                                  <div
                                    key={occ.attendeeId}
                                    className="group/occ flex items-center justify-between rounded-lg bg-muted/30 px-2 py-1"
                                  >
                                    <span className="truncate text-xs text-muted-foreground">
                                      {occ.attendeeName ?? "Unnamed"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleUnassign(occ.attendeeId)
                                      }}
                                      className="size-5 shrink-0 rounded p-0.5 text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover/occ:opacity-100"
                                    >
                                      <X className="size-3" />
                                    </button>
                                  </div>
                                ))}
                              {room.occupants.length > 3 && (
                                <p className="text-xs text-muted-foreground/50">
                                  +{room.occupants.length - 3} more
                                </p>
                              )}
                            </div>
                          )}
                          {isSelected && (
                            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                              <Check className="size-3" />
                              Selected
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
