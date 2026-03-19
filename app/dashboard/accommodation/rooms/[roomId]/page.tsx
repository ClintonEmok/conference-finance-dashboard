"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, BedDouble, Building2, RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type RoomDetailPayload = {
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
}

function availabilityClasses(value: "empty" | "available" | "full") {
  if (value === "full") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
  }

  if (value === "empty") {
    return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
}

function availabilityLabel(value: "empty" | "available" | "full") {
  if (value === "full") return "Occupied"
  if (value === "empty") return "Empty"
  return "Available"
}

export default function RoomDetailPage() {
  const router = useRouter()
  const params = useParams<{ roomId: string }>()
  const roomId = typeof params.roomId === "string" ? params.roomId : ""

  const [payload, setPayload] = useState<RoomDetailPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [labelInput, setLabelInput] = useState("")

  const loadRoom = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const response = await fetch("/api/dashboard/accommodation/assignments")
      const body = (await response.json().catch(() => null)) as RoomDetailPayload | { error?: { message?: string } } | null

      if (!response.ok) {
        setErrorMessage(body && "error" in body ? body.error?.message ?? "Failed to load room detail." : "Failed to load room detail.")
        return
      }

      setPayload(body as RoomDetailPayload)
    } catch {
      setErrorMessage("Network error while loading room detail.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRoom()
  }, [loadRoom])

  const room = useMemo(() => payload?.rooms.find((item) => item.id === roomId) ?? null, [payload, roomId])

  useEffect(() => {
    setLabelInput(room?.label ?? "")
  }, [room?.label])

  async function unassignAttendee(attendeeId: string) {
    setIsMutating(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/dashboard/accommodation/assignments/${attendeeId}`, {
        method: "DELETE",
      })
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrorMessage(body?.error?.message ?? "Failed to unassign attendee.")
        return
      }

      await loadRoom()
    } catch {
      setErrorMessage("Network error while unassigning attendee.")
    } finally {
      setIsMutating(false)
    }
  }

  async function updateRoomNumber() {
    setIsMutating(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/dashboard/accommodation/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelInput }),
      })
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setErrorMessage(body?.error?.message ?? "Failed to update room number.")
        return
      }

      await loadRoom()
    } catch {
      setErrorMessage("Network error while updating room number.")
    } finally {
      setIsMutating(false)
    }
  }

  if (isLoading) {
    return <section className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm"><p className="text-sm text-muted-foreground">Loading room detail...</p></section>
  }

  if (!room) {
    return (
      <section className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Room not found in the current allocation data.</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => router.push("/dashboard/accommodation")}>Back to rooms</Button>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/dashboard/accommodation">
            <ArrowLeft className="mr-2 size-4" />
            Back to room overview
          </Link>
        </Button>

        <Button type="button" variant="outline" className="rounded-xl text-primary" onClick={() => void loadRoom()} disabled={isMutating}>
          <RefreshCcw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      {errorMessage && <article className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMessage}</article>}

      <section className="rounded-3xl border border-primary/12 bg-[radial-gradient(circle_at_top_left,rgba(145,118,255,0.3),transparent_38%),linear-gradient(180deg,rgba(57,47,92,0.96)_0%,rgba(72,60,112,0.92)_36%,rgba(92,79,136,0.9)_100%)] p-6 text-primary-foreground shadow-[0_24px_70px_rgba(40,24,82,0.16)]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/55">Room unit detail</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-semibold tracking-tight">{room.label}</h2>
              <span className="inline-flex rounded-full bg-white/12 px-3 py-1 text-sm font-medium">{room.roomType.label}</span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${availabilityClasses(room.availability)}`}>{availabilityLabel(room.availability)}</span>
            </div>
            <p className="mt-3 text-base text-primary-foreground/78">{room.hotel.name}{room.hotel.city ? `, ${room.hotel.city}` : ""}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/18 p-4 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Capacity</p>
              <p className="mt-2 text-3xl font-semibold">{room.capacity}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/18 p-4 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Occupants</p>
              <p className="mt-2 text-3xl font-semibold">{room.occupiedBeds}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/18 p-4 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/58">Beds available</p>
              <p className="mt-2 text-3xl font-semibold">{room.availableBeds}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assigned attendees</p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">Who is staying in this room</h3>

          {room.occupants.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              No attendees assigned yet.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {room.occupants.map((occupant) => (
                <article key={occupant.attendeeId} className="rounded-2xl border border-border/70 bg-background/85 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{occupant.attendeeName ?? "Unnamed attendee"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{occupant.attendeeEmail ?? occupant.providerOrderId}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{occupant.eventName ?? occupant.providerEventId}{occupant.ticketTypeLabel ? ` · ${occupant.ticketTypeLabel}` : ""}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" className="rounded-xl">
                        <Link href={`/dashboard/attendees/${occupant.attendeeId}?search=${encodeURIComponent(occupant.attendeeName ?? occupant.providerOrderId)}&eventId=${encodeURIComponent(occupant.providerEventId)}&source=room-detail`}>
                          Open attendee detail
                          <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                      <Button type="button" variant="outline" className="rounded-xl" disabled={isMutating} onClick={() => void unassignAttendee(occupant.attendeeId)}>
                        Unassign
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick actions</p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">Manage this room</h3>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Room number</p>
              <div className="mt-3 space-y-3">
                <input
                  value={labelInput}
                  onChange={(event) => setLabelInput(event.target.value)}
                  placeholder="Enter room number"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button type="button" className="w-full rounded-xl" disabled={isMutating} onClick={() => void updateRoomNumber()}>
                  Save room number
                </Button>
              </div>
            </div>
            <Button asChild className="w-full rounded-xl">
              <Link href="/dashboard/accommodation">Open allocation overview</Link>
            </Button>
            <Button asChild variant="outline" className="w-full rounded-xl">
              <Link href="/dashboard/accommodation/inventory">Open room stock setup</Link>
            </Button>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
              Use the overview page to place new attendees into this room. Use this room detail page to inspect who is inside and remove assignments quickly.
            </div>
          </div>
        </article>
      </section>
    </section>
  )
}
