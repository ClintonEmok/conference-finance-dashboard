"use client"

import { use, useState } from "react"
import Link from "next/link"
import { Users, Plus, Search } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  useAttendeesForEvent,
  useTicketTypesForEvent,
  useCreateManualAttendee,
  useEventBySlug,
} from "@/lib/convex/hooks/events"
import { Id } from "@/convex/_generated/dataModel"

export default function EventAttendeesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  
  const [isAddingAttendee, setIsAddingAttendee] = useState(false)
  const [attendeeName, setAttendeeName] = useState("")
  const [attendeeEmail, setAttendeeEmail] = useState("")
  const [attendeeTicketTypeId, setAttendeeTicketTypeId] = useState("")

  const { attendees, isLoading } = useAttendeesForEvent(event?._id)
  const { ticketTypes } = useTicketTypesForEvent(event?._id)
  const createManualAttendee = useCreateManualAttendee()

  if (!event) return null

  const handleAddAttendee = async () => {
    if (
      !attendeeName.trim() ||
      !attendeeEmail.trim() ||
      !attendeeTicketTypeId
    ) {
      return
    }

    try {
      await createManualAttendee({
        eventId: event._id,
        attendeeName: attendeeName.trim(),
        attendeeEmail: attendeeEmail.trim(),
        ticketTypeId: attendeeTicketTypeId as Id<"ticketTypes">,
      })
      setIsAddingAttendee(false)
      setAttendeeName("")
      setAttendeeEmail("")
      setAttendeeTicketTypeId("")
    } catch (error) {
      console.error("Failed to create attendee:", error)
    }
  }

  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl font-bold">Attendees</CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Manage event attendees and registrations
            </CardDescription>
          </div>
          {!isAddingAttendee && (
            <Button 
              onClick={() => setIsAddingAttendee(true)}
              className="rounded-xl shadow-lg shadow-primary/20"
            >
              <Plus className="mr-2 size-4" />
              Add Attendee
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Attendee Form */}
        {isAddingAttendee && (
          <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 animate-in fade-in zoom-in-95 duration-300">
            <h4 className="text-sm font-black tracking-widest text-primary uppercase">New Attendee</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Name</label>
                <Input
                  type="text"
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  placeholder="Full name"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Email</label>
                <Input
                  type="email"
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Ticket Type</label>
                <select
                  value={attendeeTicketTypeId}
                  onChange={(e) => setAttendeeTicketTypeId(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
                >
                  <option value="">Select a ticket type</option>
                  {ticketTypes?.map((ticket: any) => (
                    <option key={ticket._id} value={ticket._id} className="dark:bg-zinc-900">
                      {ticket.label} - {event.currency}{" "}
                      {(ticket.priceMinor / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsAddingAttendee(false)}
                className="rounded-xl border-white/20"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddAttendee}
                disabled={
                  !attendeeName.trim() ||
                  !attendeeEmail.trim() ||
                  !attendeeTicketTypeId
                }
                className="rounded-xl px-8"
              >
                Add Attendee
              </Button>
            </div>
          </div>
        )}

        {/* Search & Filter - Placeholder of what will come */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input 
            placeholder="Search attendees by name or email..." 
            className="pl-10 rounded-xl border-white/20 bg-white/30 dark:bg-black/10"
          />
        </div>

        {/* Attendees List */}
        {isLoading ? (
          <div className="space-y-3">
             <Skeleton className="h-20 w-full rounded-xl" />
             <Skeleton className="h-20 w-full rounded-xl" />
             <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : attendees?.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground rounded-2xl border border-dashed border-white/20 bg-white/5">
            <Users className="mx-auto mb-4 size-16 opacity-10" />
            <p className="text-sm font-bold tracking-widest uppercase opacity-40">No attendees found</p>
            <p className="text-xs mt-1">
              Add attendees manually or wait for public registrations.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 overflow-hidden">
            {attendees?.map((attendee: any) => (
              <div
                key={attendee._id}
                className="group flex flex-col gap-4 rounded-2xl border border-white/60 bg-white/60 p-5 shadow-sm transition-all hover:bg-white/80 hover:shadow-md sm:flex-row sm:items-center sm:justify-between dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Users className="size-6" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-bold tracking-tight">{attendee.name}</p>
                      <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest h-4 px-1.5">
                        {attendee.ticketLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
                      {attendee.email}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-mono">
                      <span>REF: {attendee.bookingRef}</span>
                      <span className="h-1 w-1 rounded-full bg-border" />
                      <span>ID: {attendee._id.slice(-6)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <Badge
                    variant={
                      attendee.orderStatus === "confirmed"
                        ? "default"
                        : "outline"
                    }
                    className={cn(
                      "text-[10px] font-black tracking-widest uppercase h-5 px-2",
                      attendee.orderStatus === "confirmed" 
                        ? "bg-emerald-500 hover:bg-emerald-600 border-none shadow-sm shadow-emerald-500/20" 
                        : "text-amber-600 border-amber-500/30 bg-amber-50 dark:bg-amber-900/10"
                    )}
                  >
                    {attendee.orderStatus}
                  </Badge>
                  <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg text-xs font-bold text-muted-foreground hover:text-primary">
                    <Link href={`/dashboard/attendees/${attendee._id}`}>
                      Details
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
