"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import {
  AlertCircle,
  BedDouble,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  Users,
  UserPlus,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/lib/convex/api"
import { formatMoney } from "@/lib/format"
import { useTicketTypesForEvent } from "@/lib/convex/hooks/events"
import { donationsHref } from "@/lib/dashboard/workspace-routes"
import {
  AttendeeOrderEditor,
  matchEditorSelection,
  type AttendeeOrderEditorAttendee,
  type EditorEditContextSelection,
} from "@/components/dashboard/attendee-order-editor"

export type OrderAttendeeRow = {
  id: string
  name: string
  email: string | null
  ticketTypeLabel: string
  amountDueMinor: number
  // Phase 56 server-owned per-attendee money, mapped verbatim from
  // `getOrderWithAttendees`: the row renders the two figures as separate
  // labelled lines and never derives or totals them on the client.
  paidAmountMinor: number
  outstandingAmountMinor: number
}

type AttendeeDetailSnapshot = {
  ticketTypeId: string | null
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  location: string | null
}

type AttendeeEditorContext = {
  bookingRef: string
  selections: EditorEditContextSelection[]
  accommodation: {
    options: Array<{ optionKey: string; label: string }>
  }
}

type AttendeeTicketType = {
  _id: string
  label: string
  priceMinor: number
}

type AttendeesPanelProps = {
  attendees: OrderAttendeeRow[]
  slug: string
  eventId: string
  orderId: string
  bookingRef: string | null
  currency: string
  onSaved: () => void
}

function accommodationSummary(
  selection: EditorEditContextSelection | null,
  options: AttendeeEditorContext["accommodation"]["options"]
) {
  if (!selection) return "No accommodation selection"
  const parts: string[] = []
  const occupancy = selection.ticketOccupancy ?? selection.occupancy
  if (occupancy) {
    parts.push(occupancy.charAt(0).toUpperCase() + occupancy.slice(1))
  }
  for (const optionSelection of selection.optionSelections) {
    if (optionSelection.quantity > 0 && optionSelection.nights > 0) {
      const label =
        options.find((option) => option.optionKey === optionSelection.optionKey)
          ?.label ?? optionSelection.optionKey
      parts.push(label)
    }
  }
  if (selection.nightBeforeLevel) {
    parts.push(
      `Night before ${selection.nightBeforeLevel} · ${selection.nightBeforeOccupancy ?? "shared"}`
    )
  }
  return parts.length > 0 ? parts.join(" · ") : "Included stay"
}

export function AttendeesPanel({
  attendees,
  slug,
  eventId,
  orderId,
  bookingRef,
  currency,
  onSaved,
}: AttendeesPanelProps) {
  const editContextRaw = useQuery(
    api.publicTracking.getTrackPaymentEditContext,
    bookingRef ? { bookingRef } : "skip"
  )
  const editContext = (editContextRaw ?? null) as AttendeeEditorContext | null

  const [detailByAttendeeId, setDetailByAttendeeId] = useState<
    Record<string, AttendeeDetailSnapshot>
  >({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingAttendeeId, setEditingAttendeeId] = useState<string | null>(null)
  const [removingAttendeeId, setRemovingAttendeeId] = useState<string | null>(null)
  const [isRemovingAttendee, setIsRemovingAttendee] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newAttendeeName, setNewAttendeeName] = useState("")
  const [newAttendeeEmail, setNewAttendeeEmail] = useState("")
  const [newAttendeeTicketTypeId, setNewAttendeeTicketTypeId] = useState("")
  const [isAddingAttendee, setIsAddingAttendee] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const { ticketTypes, isLoading: isTicketTypesLoading } =
    useTicketTypesForEvent(eventId)

  useEffect(() => {
    const attendeesKey = attendees.map((attendee) => attendee.id).join("|")
    if (!attendeesKey) {
      setDetailByAttendeeId({})
      setLoadError(null)
      return
    }

    const controller = new AbortController()
    setLoadError(null)

    async function loadAttendeeDetails() {
      try {
        const details = await Promise.all(
          attendees.map(async (attendee) => {
            const response = await fetch(
              `/api/dashboard/attendees/${encodeURIComponent(attendee.id)}`,
              { signal: controller.signal }
            )
            if (!response.ok) {
              throw new Error(`Failed to load attendee ${attendee.id}`)
            }
            const body = (await response.json()) as {
              attendee: { ticketTypeId: string | null }
              signals: {
                genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
                location: string | null
              }
            }
            return [
              attendee.id,
              {
                ticketTypeId: body.attendee.ticketTypeId,
                genderType: body.signals.genderType,
                location: body.signals.location,
              },
            ] as const
          })
        )

        if (controller.signal.aborted) return

        const snapshotMap: Record<string, AttendeeDetailSnapshot> = {}
        for (const [attendeeId, snapshot] of details) {
          snapshotMap[attendeeId] = snapshot
        }
        setDetailByAttendeeId(snapshotMap)
      } catch (error) {
        if (controller.signal.aborted) return
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load attendee details."
        )
      }
    }

    loadAttendeeDetails()

    return () => controller.abort()
  }, [attendees, loadAttempt, refreshKey])

  const editorAttendee = useMemo<AttendeeOrderEditorAttendee | null>(() => {
    if (!editingAttendeeId) return null
    const row = attendees.find((attendee) => attendee.id === editingAttendeeId)
    if (!row) return null
    const detail = detailByAttendeeId[row.id]
    return {
      id: row.id,
      name: row.name,
      ticketTypeId: detail?.ticketTypeId ?? null,
      ticketTypeLabel:
        row.ticketTypeLabel !== "-" ? row.ticketTypeLabel : null,
      genderType: detail?.genderType ?? null,
      location: detail?.location ?? null,
      orderId,
      bookingRef,
      eventId,
    }
  }, [attendees, bookingRef, detailByAttendeeId, editingAttendeeId, eventId, orderId])

  const accommodationByAttendeeId = useMemo(() => {
    if (!editContext) return {}
    const map: Record<string, EditorEditContextSelection | null> = {}
    for (const attendee of attendees) {
      map[attendee.id] = matchEditorSelection(
        editContext.selections,
        { id: attendee.id, name: attendee.name }
      )
    }
    return map
  }, [attendees, editContext])

  const editingRow = attendees.find(
    (attendee) => attendee.id === editingAttendeeId
  )
  const removingRow = attendees.find(
    (attendee) => attendee.id === removingAttendeeId
  )

  async function confirmRemoveAttendee() {
    if (!removingAttendeeId || isRemovingAttendee) return

    setIsRemovingAttendee(true)
    setRemoveError(null)
    try {
      const response = await fetch(
        `/api/dashboard/attendees/${encodeURIComponent(removingAttendeeId)}/remove`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        }
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to remove attendee.")
      }
      setRemovingAttendeeId(null)
      onSaved()
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : "Failed to remove attendee."
      )
    } finally {
      setIsRemovingAttendee(false)
    }
  }

  function resetAddAttendeeForm() {
    setNewAttendeeName("")
    setNewAttendeeEmail("")
    setNewAttendeeTicketTypeId("")
    setAddError(null)
  }

  async function addAttendee() {
    const name = newAttendeeName.trim()
    if (!name) {
      setAddError("Name is required.")
      return
    }
    if (!newAttendeeTicketTypeId) {
      setAddError("Ticket type is required.")
      return
    }

    setIsAddingAttendee(true)
    setAddError(null)
    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(orderId)}/attendees`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            name,
            email: newAttendeeEmail.trim() || undefined,
            ticketTypeId: newAttendeeTicketTypeId,
          }),
        }
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to add attendee.")
      }

      setIsAddDialogOpen(false)
      resetAddAttendeeForm()
      onSaved()
    } catch (error) {
      setAddError(
        error instanceof Error ? error.message : "Failed to add attendee."
      )
    } finally {
      setIsAddingAttendee(false)
    }
  }

  return (
    <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur lg:col-span-3 dark:border-white/10 dark:bg-black/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold">Attendees</CardTitle>
            <CardDescription>Consolidated ticket data for this order</CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAddError(null)
              setIsAddDialogOpen(true)
            }}
            className="h-8 shrink-0 rounded-lg px-3 text-[10px] font-bold tracking-wider uppercase"
          >
            <UserPlus className="mr-1.5 size-3.5" />
            Add attendee
          </Button>
        </div>
        {loadError && (
          <Alert variant="destructive" className="mt-4 rounded-xl">
            <AlertCircle className="size-4" />
            <AlertTitle className="text-destructive">Attendee load failed</AlertTitle>
            <AlertDescription className="text-destructive/80">
              {loadError}
            </AlertDescription>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="mt-2 h-8 rounded-lg text-[10px] font-bold tracking-wider uppercase"
            >
              Retry
            </Button>
          </Alert>
        )}
      </CardHeader>
      <CardContent>
        {attendees.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 py-12 text-center">
            <Users className="mx-auto mb-3 size-10 opacity-10" />
            <p className="text-sm font-bold tracking-widest uppercase opacity-40">No attendees</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attendees.map((attendee) => {
              const detail = detailByAttendeeId[attendee.id]
              const accommodation = accommodationByAttendeeId[attendee.id]
              return (
                <article
                  key={attendee.id}
                  className="rounded-2xl border border-white/60 bg-white/60 p-4 transition-all hover:bg-white/80 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Link
                        href={`/dashboard/events/${slug}/attendees/${attendee.id}`}
                        className="block truncate text-sm font-bold text-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        {attendee.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-white/20 text-[10px] font-medium"
                        >
                          {attendee.ticketTypeLabel}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {attendee.id}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black tabular-nums">
                        {formatMoney(attendee.amountDueMinor, currency)}
                      </p>
                      <div className="mt-1.5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <span>Allocated credit</span>
                        <span className="font-mono tabular-nums text-foreground">
                           {formatMoney(attendee.paidAmountMinor, currency)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <span>Remaining</span>
                        <span className="font-mono tabular-nums text-foreground">
                           {formatMoney(attendee.outstandingAmountMinor, currency)}
                        </span>
                      </div>
                      <Link
                        href={donationsHref(slug, { orderId })}
                        className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
                      >
                        View allocations
                      </Link>
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!detail}
                          onClick={() => setEditingAttendeeId(attendee.id)}
                          className="h-8 rounded-lg border-white/20 text-[10px] font-bold tracking-wider uppercase"
                        >
                          {detail ? (
                            <>
                              <Pencil className="mr-1.5 size-3" />
                              Edit
                            </>
                          ) : (
                            <>
                              <Loader2 className="mr-1.5 size-3 animate-spin" />
                              Loading…
                            </>
                          )}
                        </Button>
                        {attendees.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${attendee.name} from this order`}
                            title="Remove attendee"
                            onClick={() => {
                              setRemoveError(null)
                              setRemovingAttendeeId(attendee.id)
                            }}
                            className="h-8 w-8 rounded-lg text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-[10px] text-muted-foreground sm:grid-cols-2">
                    <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                      <p className="flex items-center gap-1 font-black tracking-[0.2em] uppercase opacity-60">
                        <MapPin className="size-2.5" /> Location · Gender
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {detail
                          ? [detail.location, detail.genderType]
                              .filter(Boolean)
                              .join(" · ") || "Not set"
                          : "Loading…"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                      <p className="flex items-center gap-1 font-black tracking-[0.2em] uppercase opacity-60">
                        <BedDouble className="size-2.5" /> Accommodation
                      </p>
                      <p className="mt-1 font-medium text-foreground capitalize">
                        {editContext
                          ? accommodationSummary(
                              accommodation,
                              editContext.accommodation.options
                            )
                          : "Loading…"}
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={Boolean(editingAttendeeId)}
        onOpenChange={(open) => {
          if (!open) setEditingAttendeeId(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit attendee</DialogTitle>
            <DialogDescription>
              Update ticket, location, gender, accommodation preferences, or
              move this attendee to another order.
            </DialogDescription>
          </DialogHeader>
          {editorAttendee && editingRow ? (
            <AttendeeOrderEditor
              attendee={editorAttendee}
              canRemove={attendees.length > 1}
              onSaved={() => {
                setEditingAttendeeId(null)
                setRefreshKey((key) => key + 1)
                setDetailByAttendeeId({})
                onSaved()
              }}
            />
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/2 rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (isAddingAttendee) return
          setIsAddDialogOpen(open)
          if (!open) resetAddAttendeeForm()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add attendee to order</DialogTitle>
            <DialogDescription>
              Add a new attendee and ticket to this order. The order amount is
              recalculated on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="order-add-attendee-name">Name</Label>
              <Input
                id="order-add-attendee-name"
                value={newAttendeeName}
                disabled={isAddingAttendee}
                placeholder="Full name"
                onChange={(event) => setNewAttendeeName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-add-attendee-email">Email</Label>
              <Input
                id="order-add-attendee-email"
                type="email"
                value={newAttendeeEmail}
                disabled={isAddingAttendee}
                placeholder="name@example.com (optional)"
                onChange={(event) => setNewAttendeeEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-add-attendee-ticket">Ticket type</Label>
              {isTicketTypesLoading ? (
                <Skeleton className="h-9 w-full rounded-lg" />
              ) : (
                <Select
                  value={newAttendeeTicketTypeId}
                  onValueChange={setNewAttendeeTicketTypeId}
                  disabled={isAddingAttendee}
                >
                  <SelectTrigger id="order-add-attendee-ticket">
                    <SelectValue placeholder="Select ticket type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(ticketTypes as AttendeeTicketType[]).map((ticketType) => (
                      <SelectItem key={ticketType._id} value={String(ticketType._id)}>
                        {ticketType.label} · {formatMoney(ticketType.priceMinor, currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {addError ? (
              <Alert variant="destructive" className="rounded-xl">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-destructive">Add failed</AlertTitle>
                <AlertDescription className="text-destructive/80">
                  {addError}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isAddingAttendee}
              onClick={() => setIsAddDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isAddingAttendee || isTicketTypesLoading}
              onClick={() => void addAttendee()}
            >
              {isAddingAttendee ? "Adding…" : "Add attendee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removingAttendeeId)}
        onOpenChange={(open) => {
          if (!open) setRemovingAttendeeId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove attendee</DialogTitle>
            <DialogDescription>
              Remove {removingRow?.name ?? "this attendee"} from this order?
              Their ticket, accommodation, room assignment, family, and search
              records will be deleted and the order amount due recalculated.
              Existing payments stay on the order.
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-destructive">Remove failed</AlertTitle>
              <AlertDescription className="text-destructive/80">
                {removeError}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemovingAttendeeId(null)}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isRemovingAttendee}
              onClick={() => void confirmRemoveAttendee()}
              className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            >
              {isRemovingAttendee ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove attendee"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
