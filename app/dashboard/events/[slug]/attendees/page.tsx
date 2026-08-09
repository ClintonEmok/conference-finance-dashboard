"use client"

import { use, useMemo, useState } from "react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { useMutation } from "convex/react"
import { api } from "@/lib/convex/api"
import {
  useAttendeesForEvent,
  useTicketTypesForEvent,
  useCreateManualAttendee,
} from "@/lib/convex/hooks/events"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { Id } from "@/convex/_generated/dataModel"

type AttendeeRow = {
  _id: string
  name: string
  email: string | null
  ticketLabel: string | null
  bookingRef: string | null
  orderStatus: string | null
  orderId: string
  submittedAt: string | null
  familyGroupId: string | null
  familyGroupLabel: string | null
  familyPrimaryAttendeeId: string | null
  familyRelationship: string | null
}

type OrderGroup = {
  orderId: string
  bookingRef: string | null
  orderStatus: string | null
  submittedAt: string | null
  attendees: AttendeeRow[]
}

type FamilyGroup = {
  key: string
  label: string
  attendeeCount: number
  orders: OrderGroup[]
}

type ViewMode = "all" | "family" | "order"

type FamilyOption = {
  id: string
  label: string
}

export default function EventAttendeesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const { event } = useEventDashboard()
  
  const [isAddingAttendee, setIsAddingAttendee] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("family")
  const [attendeeName, setAttendeeName] = useState("")
  const [attendeeEmail, setAttendeeEmail] = useState("")
  const [attendeeTicketTypeId, setAttendeeTicketTypeId] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [familyDialogAttendee, setFamilyDialogAttendee] = useState<AttendeeRow | null>(null)
  const [familyGroupId, setFamilyGroupId] = useState("")
  const [familyLabel, setFamilyLabel] = useState("")
  const [familyRelationship, setFamilyRelationship] = useState("")
  const [familyError, setFamilyError] = useState<string | null>(null)
  const [familySaving, setFamilySaving] = useState(false)

  const { attendees, isLoading } = useAttendeesForEvent(event?._id)
  const { ticketTypes } = useTicketTypesForEvent(event?._id)
  const createManualAttendee = useCreateManualAttendee()
  const createFamilyGroup = useMutation(api.sync.createAttendeeFamilyGroup)
  const addAttendeeToFamilyGroup = useMutation(api.sync.addAttendeeToFamilyGroup)

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

  const attendeeRows = useMemo(() => (attendees ?? []) as AttendeeRow[], [attendees])

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    if (!query) {
      return attendeeRows
    }

    return attendeeRows.filter((row) => {
      const haystack = [
        row.name,
        row.email,
        row.ticketLabel,
        row.bookingRef,
        row.orderStatus,
        row.familyGroupLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [attendeeRows, searchTerm])

  const familyOptions = useMemo<FamilyOption[]>(() => {
    const families = new Map<string, string>()

    for (const row of attendeeRows) {
      if (!row.familyGroupId) continue

      const label = row.familyGroupLabel?.trim() || `Family ${row.familyGroupId.slice(-6)}`
      if (!families.has(row.familyGroupId)) {
        families.set(row.familyGroupId, label)
      }
    }

    return Array.from(families.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [attendeeRows])

  const familyGroups = useMemo<FamilyGroup[]>(() => {
    const families = new Map<string, FamilyGroup>()

    for (const row of filteredRows) {
      const familyKey = row.familyGroupId ?? `order:${row.orderId}`
      const familyLabel =
        row.familyGroupLabel?.trim() ||
        (row.familyGroupId ? "Family" : `Order ${row.bookingRef ?? row.orderId.slice(-6)}`)

      const family = families.get(familyKey) ?? {
        key: familyKey,
        label: familyLabel,
        attendeeCount: 0,
        orders: [],
      }

      family.attendeeCount += 1

      let order = family.orders.find((item) => item.orderId === row.orderId)
      if (!order) {
        order = {
          orderId: row.orderId,
          bookingRef: row.bookingRef,
          orderStatus: row.orderStatus,
          submittedAt: row.submittedAt,
          attendees: [],
        }
        family.orders.push(order)
      }

      order.attendees.push(row)
      families.set(familyKey, family)
    }

    return Array.from(families.values())
      .map((family) => ({
        ...family,
        orders: family.orders.sort((a, b) => {
          const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
          const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
          return bTime - aTime
        }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredRows])

  const orderGroups = useMemo<OrderGroup[]>(() => {
    const orders = new Map<string, OrderGroup>()

    for (const row of filteredRows) {
      const order = orders.get(row.orderId)
      if (order) {
        order.attendees.push(row)
        continue
      }

      orders.set(row.orderId, {
        orderId: row.orderId,
        bookingRef: row.bookingRef,
        orderStatus: row.orderStatus,
        submittedAt: row.submittedAt,
        attendees: [row],
      })
    }

    return Array.from(orders.values()).sort((left, right) => {
      const leftTime = left.submittedAt ? new Date(left.submittedAt).getTime() : 0
      const rightTime = right.submittedAt ? new Date(right.submittedAt).getTime() : 0
      return rightTime - leftTime
    })
  }, [filteredRows])

  const allRows = useMemo(
    () =>
      [...filteredRows].sort((left, right) => {
        const leftTime = left.submittedAt ? new Date(left.submittedAt).getTime() : 0
        const rightTime = right.submittedAt ? new Date(right.submittedAt).getTime() : 0
        if (rightTime !== leftTime) return rightTime - leftTime
        return left.name.localeCompare(right.name)
      }),
    [filteredRows]
  )

  const openFamilyDialog = (attendee: AttendeeRow) => {
    setFamilyDialogAttendee(attendee)
    setFamilyGroupId("")
    setFamilyLabel("")
    setFamilyRelationship("")
    setFamilyError(null)
  }

  const closeFamilyDialog = () => {
    if (familySaving) return
    setFamilyDialogAttendee(null)
    setFamilyGroupId("")
    setFamilyLabel("")
    setFamilyRelationship("")
    setFamilyError(null)
  }

  const handleAssignExistingFamily = async () => {
    if (!familyDialogAttendee || !familyGroupId) return

    setFamilySaving(true)
    setFamilyError(null)

    try {
      await addAttendeeToFamilyGroup({
        familyGroupId: familyGroupId as Id<"attendeeFamilyGroups">,
        attendeeId: familyDialogAttendee._id,
        relationship: familyRelationship.trim() || undefined,
      })
      closeFamilyDialog()
    } catch (error) {
      setFamilyError(error instanceof Error ? error.message : "Failed to assign family.")
    } finally {
      setFamilySaving(false)
    }
  }

  const handleCreateFamily = async () => {
    if (!familyDialogAttendee) return

    setFamilySaving(true)
    setFamilyError(null)

    try {
      const label = familyLabel.trim() || `Family of ${familyDialogAttendee.name}`
      const createdFamilyGroupId = await createFamilyGroup({
        label,
        primaryAttendeeId: familyDialogAttendee._id,
      })

      await addAttendeeToFamilyGroup({
        familyGroupId: createdFamilyGroupId,
        attendeeId: familyDialogAttendee._id,
        relationship: familyRelationship.trim() || undefined,
      })

      closeFamilyDialog()
    } catch (error) {
      setFamilyError(error instanceof Error ? error.message : "Failed to create family.")
    } finally {
      setFamilySaving(false)
    }
  }

  const renderAttendeeCard = (attendee: AttendeeRow) => (
    <article
      key={attendee._id}
      className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-white/5 dark:bg-white/5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-6" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold tracking-tight">{attendee.name}</p>
              {attendee.ticketLabel && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-black uppercase tracking-widest">
                  {attendee.ticketLabel}
                </Badge>
              )}
            </div>
            <p className="text-xs font-medium text-muted-foreground">{attendee.email ?? "No email"}</p>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground/60">
              <span>REF: {attendee.bookingRef ?? "-"}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>ID: {attendee._id.slice(-6)}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{attendee.orderStatus ?? "unknown"}</span>
            </div>
            {attendee.familyGroupLabel && (
              <p className="text-[10px] text-muted-foreground">
                Family: <span className="font-medium text-foreground">{attendee.familyGroupLabel}</span>
                {attendee.familyRelationship ? ` · ${attendee.familyRelationship}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link href={`/dashboard/events/${slug}/attendees/${attendee._id}`}>Details</Link>
          </Button>

          {!attendee.familyGroupId ? (
            <Button type="button" size="sm" className="rounded-xl" onClick={() => openFamilyDialog(attendee)}>
              Assign family
            </Button>
          ) : (
            <Badge variant="outline" className="rounded-xl px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              Family linked
            </Badge>
          )}
        </div>
      </div>
    </article>
  )

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
        {isAddingAttendee && (
          <div className="animate-in fade-in zoom-in-95 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 duration-300">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary">New Attendee</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Name</label>
                <Input
                  type="text"
                  value={attendeeName}
                  onChange={(e) => setAttendeeName(e.target.value)}
                  placeholder="Full name"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email</label>
                <Input
                  type="email"
                  value={attendeeEmail}
                  onChange={(e) => setAttendeeEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ticket Type</label>
                <select
                  value={attendeeTicketTypeId}
                  onChange={(e) => setAttendeeTicketTypeId(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
                >
                  <option value="">Select a ticket type</option>
                  {ticketTypes?.map((ticket: any) => (
                    <option key={ticket._id} value={ticket._id} className="dark:bg-zinc-900">
                      {ticket.label} - {event.currency} {(ticket.priceMinor / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAddingAttendee(false)} className="rounded-xl border-white/20">
                Cancel
              </Button>
              <Button
                onClick={handleAddAttendee}
                disabled={!attendeeName.trim() || !attendeeEmail.trim() || !attendeeTicketTypeId}
                className="rounded-xl px-8"
              >
                Add Attendee
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search attendees by name, email, family, or order..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="rounded-xl border-white/20 bg-white/30 pl-10 dark:bg-black/10"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["family", "Per family"],
              ["order", "Per order"],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={viewMode === value ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setViewMode(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-20 text-center text-muted-foreground">
            <Users className="mx-auto mb-4 size-16 opacity-10" />
            <p className="text-sm font-bold uppercase tracking-widest opacity-40">No attendees found</p>
            <p className="mt-1 text-xs">Add attendees manually or wait for public registrations.</p>
          </div>
        ) : viewMode === "all" ? (
          <div className="grid gap-3">
            {allRows.map((attendee) => renderAttendeeCard(attendee))}
          </div>
        ) : viewMode === "order" ? (
          <div className="space-y-4">
            {orderGroups.map((order) => (
              <section key={order.orderId} className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-white/5 dark:bg-white/5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order</p>
                    <h3 className="text-lg font-bold tracking-tight">{order.bookingRef ?? order.orderId.slice(-6)}</h3>
                    <p className="text-xs text-muted-foreground">{order.attendees.length} attendees</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest">
                    {order.orderStatus ?? "unknown"}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {order.attendees.map((attendee) => renderAttendeeCard(attendee))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {familyGroups.map((family) => (
              <section key={family.key} className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-white/5 dark:bg-white/5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Family</p>
                    <h3 className="text-lg font-bold tracking-tight">{family.label}</h3>
                    <p className="text-xs text-muted-foreground">{family.attendeeCount} attendees · {family.orders.length} orders</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest">
                    Grouped
                  </Badge>
                </div>

                <div className="space-y-3">
                  {family.orders.map((order) => (
                    <div key={order.orderId} className="rounded-xl border border-border/50 bg-background/50 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order</p>
                          <p className="font-semibold text-foreground">{order.bookingRef ?? order.orderId.slice(-6)}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest">
                          {order.orderStatus ?? "unknown"}
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {order.attendees.map((attendee) => renderAttendeeCard(attendee))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <Dialog open={Boolean(familyDialogAttendee)} onOpenChange={(open) => !open && closeFamilyDialog()}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Assign family</DialogTitle>
              <DialogDescription>
                Add this attendee to an existing family or create a new family from this attendee.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {familyError && (
                <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {familyError}
                </p>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Existing family</label>
                <select
                  value={familyGroupId}
                  onChange={(event) => setFamilyGroupId(event.target.value)}
                  className="flex h-10 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a family</option>
                  {familyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">New family label</label>
                <Input
                  value={familyLabel}
                  onChange={(event) => setFamilyLabel(event.target.value)}
                  placeholder="Family name"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Relationship</label>
                <Input
                  value={familyRelationship}
                  onChange={(event) => setFamilyRelationship(event.target.value)}
                  placeholder="Optional"
                  className="rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={closeFamilyDialog} disabled={familySaving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAssignExistingFamily()}
                disabled={familySaving || !familyDialogAttendee || !familyGroupId}
              >
                {familySaving ? "Saving..." : "Assign to family"}
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateFamily()}
                disabled={familySaving || !familyDialogAttendee}
              >
                {familySaving ? "Saving..." : "Create family"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
