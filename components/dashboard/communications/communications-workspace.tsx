"use client"

import { useMemo, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import {
  AlertCircle,
  CheckCircle2,
  Filter,
  Loader2,
  Mail,
  RotateCcw,
  Send,
} from "lucide-react"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { communicationsHref } from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AudienceFilters = {
  location?: string
  status?: "paid" | "pending" | "cancelled" | "refunded"
  from?: number
  to?: number
  hasAccommodationSelection?: boolean
  ticketTypeId?: Id<"ticketTypes">
}

type BroadcastStatus =
  | "queued"
  | "sending"
  | "completed"
  | "failed"
  | "cancelled"

type RecipientStatus = "pending" | "sent" | "failed"

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success"; broadcastId?: string }
  | { status: "error"; message: string }

function toDayTimestamp(dateStr: string, boundary: "start" | "end") {
  if (!dateStr) return undefined
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return undefined
  return boundary === "start"
    ? date.getTime()
    : date.getTime() + 86_400_000 - 1
}

function formatEventDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function broadcastStatusStyles(status: BroadcastStatus) {
  switch (status) {
    case "completed":
      return {
        variant: "outline" as const,
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
      }
    case "failed":
      return { variant: "destructive" as const, className: "" }
    case "queued":
      return { variant: "secondary" as const, className: "" }
    case "sending":
      return { variant: "default" as const, className: "" }
    case "cancelled":
      return { variant: "outline" as const, className: "" }
  }
}

function recipientStatusStyles(status: RecipientStatus) {
  switch (status) {
    case "sent":
      return {
        variant: "outline" as const,
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
      }
    case "failed":
      return { variant: "destructive" as const, className: "" }
    case "pending":
      return { variant: "secondary" as const, className: "" }
  }
}

export function CommunicationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()

  // --- Compose state -------------------------------------------------------
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [eventName, setEventName] = useState(event.title)
  const [eventDate, setEventDate] = useState(
    formatEventDate(event.startsAt)
  )
  const [eventLocation, setEventLocation] = useState("")
  const [paymentUrl, setPaymentUrl] = useState("")
  const [nightBeforeNote, setNightBeforeNote] = useState("")

  // --- Audience filter state -----------------------------------------------
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [fromFilter, setFromFilter] = useState("")
  const [toFilter, setToFilter] = useState("")
  const [accommodationFilter, setAccommodationFilter] = useState("all")
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all")

  // --- Send / active broadcast state ---------------------------------------
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sendState, setSendState] = useState<SendState>({ status: "idle" })
  const [activeBroadcastId, setActiveBroadcastId] = useState<string | null>(
    null
  )
  const [testRecipient, setTestRecipient] = useState("")
  const [testState, setTestState] = useState<SendState>({ status: "idle" })

  const eventLocations = useQuery(
    api.reports.getEventLocations,
    event?._id ? { eventId: event._id } : ("skip" as const)
  ) as string[] | undefined

  const ticketTypes = useQuery(
    api.events.getTicketTypesForEvent,
    event?._id ? { eventId: event._id } : ("skip" as const)
  )

  const filters = useMemo<AudienceFilters>(() => {
    const value: AudienceFilters = {}
    if (statusFilter !== "all") value.status = statusFilter as AudienceFilters["status"]
    if (locationFilter !== "all") value.location = locationFilter
    const from = toDayTimestamp(fromFilter, "start")
    const to = toDayTimestamp(toFilter, "end")
    if (from !== undefined) value.from = from
    if (to !== undefined) value.to = to
    if (accommodationFilter === "with") value.hasAccommodationSelection = true
    if (ticketTypeFilter !== "all")
      value.ticketTypeId = ticketTypeFilter as Id<"ticketTypes">
    return value
  }, [accommodationFilter, fromFilter, locationFilter, statusFilter, ticketTypeFilter, toFilter])

  const preview = useQuery(
    api.emailBroadcasts.previewAudience,
    event?._id
      ? { eventId: event._id, ...filters, limit: 100 }
      : ("skip" as const)
  )

  const history = useQuery(
    api.emailBroadcasts.getBroadcastHistory,
    event?._id ? { eventId: event._id } : ("skip" as const)
  )

  const activeBroadcast = useQuery(
    api.emailBroadcasts.getBroadcastById,
    activeBroadcastId ? { broadcastId: activeBroadcastId as Id<"emailBroadcasts"> } : ("skip" as const)
  )

  const activeRecipients = useQuery(
    api.emailBroadcasts.getBroadcastRecipients,
    activeBroadcastId
      ? { broadcastId: activeBroadcastId as Id<"emailBroadcasts">, limit: 300 }
      : ("skip" as const)
  )

  const scheduleEmailBroadcast = useMutation(
    api.emailBroadcasts.scheduleEmailBroadcast
  )
  const cancelEmailBroadcast = useMutation(
    api.emailBroadcasts.cancelEmailBroadcast
  )
  const retryFailedEmailBroadcast = useMutation(
    api.emailBroadcasts.retryFailedEmailBroadcast
  )
  const sendAnnouncementTest = useAction(api.emailActions.sendAnnouncementTest)

  const audienceTotal = preview?.total ?? 0
  const canBroadcast = Boolean(
    title.trim() && message.trim() && audienceTotal > 0 && sendState.status !== "sending"
  )

  async function handleTestSend() {
    const to = testRecipient.trim()
    if (!to) {
      setTestState({ status: "error", message: "Enter a recipient email." })
      return
    }
    setTestState({ status: "sending" })
    try {
      const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin
      const result = await sendAnnouncementTest({
        to,
        title: title.trim(),
        message: message.trim(),
        eventName: eventName.trim(),
        eventDate: eventDate.trim(),
        eventLocation: eventLocation.trim(),
        manageBookingUrl: `${origin}/booking/test/manage`,
        signupUrl: `${origin}/signup/${event.slug}`,
        paymentUrl: paymentUrl.trim() || undefined,
        nightBeforeNote: nightBeforeNote.trim() || undefined,
      })
      if (!result.success) {
        setTestState({ status: "error", message: result.error ?? "Send failed." })
        return
      }
      setTestState({ status: "success" })
    } catch (error) {
      setTestState({
        status: "error",
        message: error instanceof Error ? error.message : "Send failed.",
      })
    }
  }

  async function handleConfirmSend() {
    if (!event) return
    setConfirmOpen(false)
    setSendState({ status: "sending" })
    try {
      const result = await scheduleEmailBroadcast({
        eventId: event._id,
        title: title.trim(),
        message: message.trim(),
        eventName: eventName.trim(),
        eventDate: eventDate.trim(),
        eventLocation: eventLocation.trim(),
        paymentUrl: paymentUrl.trim() || undefined,
        nightBeforeNote: nightBeforeNote.trim() || undefined,
        filters: filters as never,
        authorize: true,
      })
      setActiveBroadcastId(String(result.broadcastId))
      setSendState({ status: "success", broadcastId: String(result.broadcastId) })
    } catch (error) {
      setSendState({
        status: "error",
        message: error instanceof Error ? error.message : "Send failed.",
      })
    }
  }

  async function handleCancel() {
    if (!activeBroadcastId) return
    await cancelEmailBroadcast({ broadcastId: activeBroadcastId as Id<"emailBroadcasts"> })
  }

  async function handleRetry() {
    if (!activeBroadcastId) return
    await retryFailedEmailBroadcast({ broadcastId: activeBroadcastId as Id<"emailBroadcasts"> })
  }

  const tabs = useMemo(
    () => [{ value: "communications", label: "Broadcast", href: communicationsHref(slug) }],
    [slug]
  )

  return (
    <WorkspaceFrame
      title="Communications"
      description="Compose announcements, select an audience of order bookers, and send asynchronously with live status."
      eventLabel={event.title}
      workspaceLabel="Communications"
      workspaceId="communications"
      activeTab="communications"
      tabs={
        <WorkspaceTabs
          workspaceId="communications"
          tabs={tabs}
          activeTab="communications"
        />
      }
    >
      <div className="min-w-0 space-y-6">
        <ComposeCard
          title={title}
          onTitleChange={setTitle}
          message={message}
          onMessageChange={setMessage}
          eventName={eventName}
          onEventNameChange={setEventName}
          eventDate={eventDate}
          onEventDateChange={setEventDate}
          eventLocation={eventLocation}
          onEventLocationChange={setEventLocation}
          paymentUrl={paymentUrl}
          onPaymentUrlChange={setPaymentUrl}
          nightBeforeNote={nightBeforeNote}
          onNightBeforeNoteChange={setNightBeforeNote}
        />

        <AudienceCard
          eventId={event._id}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          locationFilter={locationFilter}
          onLocationFilterChange={setLocationFilter}
          fromFilter={fromFilter}
          onFromFilterChange={setFromFilter}
          toFilter={toFilter}
          onToFilterChange={setToFilter}
          accommodationFilter={accommodationFilter}
          onAccommodationFilterChange={setAccommodationFilter}
          ticketTypeFilter={ticketTypeFilter}
          onTicketTypeFilterChange={setTicketTypeFilter}
          eventLocations={eventLocations}
          ticketTypes={ticketTypes}
          preview={preview}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              Send
            </CardTitle>
            <CardDescription>
              First send a diagnostic to a controlled inbox, then broadcast to
              the {audienceTotal} selected booker{audienceTotal === 1 ? "" : "s"}.
              Broadcasting requires explicit confirmation and is delivered
              asynchronously.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="test-recipient">Test recipient email</Label>
                <Input
                  id="test-recipient"
                  type="email"
                  placeholder="your@inbox.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestSend}
                disabled={testState.status === "sending"}
              >
                {testState.status === "sending" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Send test email
              </Button>
            </div>

            {testState.status === "success" && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>Test sent</AlertTitle>
                <AlertDescription>
                  The announcement was delivered to {testRecipient}.
                </AlertDescription>
              </Alert>
            )}
            {testState.status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Test failed</AlertTitle>
                <AlertDescription>{testState.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border/60 pt-4">
              <Button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!canBroadcast}
              >
                {sendState.status === "sending" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send to {audienceTotal} booker{audienceTotal === 1 ? "" : "s"}
              </Button>
              {sendState.status === "error" && (
                <span className="text-sm text-destructive">{sendState.message}</span>
              )}
              {sendState.status === "success" && sendState.broadcastId && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  Broadcast scheduled — tracking below.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {(activeBroadcastId || (history ?? []).length > 0) && (
          <ActiveBroadcastCard
            broadcastId={activeBroadcastId}
            broadcast={activeBroadcast}
            recipients={activeRecipients}
            onSelect={(id) => setActiveBroadcastId(id)}
            onCancel={handleCancel}
            onRetry={handleRetry}
          />
        )}

        <HistoryCard
          history={history}
          activeBroadcastId={activeBroadcastId}
          onSelect={(id) => setActiveBroadcastId(id)}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm broadcast</DialogTitle>
            <DialogDescription>
              This will send the announcement to{" "}
              <strong>{audienceTotal} booker{audienceTotal === 1 ? "" : "s"}</strong>{" "}
              asynchronously. You can track progress and cancel while it is
              running.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
            <p>
              <span className="font-semibold">Subject:</span> {title.trim() || "—"}
            </p>
            <p>
              <span className="font-semibold">Audience filters:</span>{" "}
              {describeFilters(filters)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={sendState.status === "sending"}
            >
              {sendState.status === "sending" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm & send"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  )
}

function describeFilters(filters: AudienceFilters) {
  const parts: string[] = []
  if (filters.status) parts.push(`status: ${filters.status}`)
  if (filters.location) parts.push(`location: ${filters.location}`)
  if (filters.from !== undefined)
    parts.push(`from: ${new Date(filters.from).toLocaleDateString("en-GB")}`)
  if (filters.to !== undefined)
    parts.push(`to: ${new Date(filters.to).toLocaleDateString("en-GB")}`)
  if (filters.hasAccommodationSelection) parts.push("with accommodation selection")
  if (filters.ticketTypeId) parts.push(`ticket: ${String(filters.ticketTypeId)}`)
  return parts.length > 0 ? parts.join(" · ") : "all bookers"
}

function ComposeCard(props: {
  title: string
  onTitleChange: (value: string) => void
  message: string
  onMessageChange: (value: string) => void
  eventName: string
  onEventNameChange: (value: string) => void
  eventDate: string
  onEventDateChange: (value: string) => void
  eventLocation: string
  onEventLocationChange: (value: string) => void
  paymentUrl: string
  onPaymentUrlChange: (value: string) => void
  nightBeforeNote: string
  onNightBeforeNoteChange: (value: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          Compose announcement
        </CardTitle>
        <CardDescription>
          Rendered with the standard AnnouncementEmail template, including
          Manage Booking and Register links.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ann-title">Subject / title</Label>
          <Input
            id="ann-title"
            value={props.title}
            onChange={(e) => props.onTitleChange(e.target.value)}
            placeholder="e.g. New accommodation options are available"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-location">Event location</Label>
          <Input
            id="ann-location"
            value={props.eventLocation}
            onChange={(e) => props.onEventLocationChange(e.target.value)}
            placeholder="e.g. Eindhoven, Netherlands"
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="ann-message">Message</Label>
          <textarea
            id="ann-message"
            rows={6}
            value={props.message}
            onChange={(e) => props.onMessageChange(e.target.value)}
            placeholder="Write the announcement body…"
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-event-name">Event name</Label>
          <Input
            id="ann-event-name"
            value={props.eventName}
            onChange={(e) => props.onEventNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-event-date">Event date</Label>
          <Input
            id="ann-event-date"
            value={props.eventDate}
            onChange={(e) => props.onEventDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-payment-url">Payment URL (optional)</Label>
          <Input
            id="ann-payment-url"
            type="url"
            value={props.paymentUrl}
            onChange={(e) => props.onPaymentUrlChange(e.target.value)}
            placeholder="https://tikkie.me/…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-night-before">Night before note (optional)</Label>
          <Input
            id="ann-night-before"
            value={props.nightBeforeNote}
            onChange={(e) => props.onNightBeforeNoteChange(e.target.value)}
            placeholder="e.g. An extra night is available for early arrivals."
          />
        </div>
      </CardContent>
    </Card>
  )
}

function AudienceCard(props: {
  eventId: Id<"events">
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  locationFilter: string
  onLocationFilterChange: (value: string) => void
  fromFilter: string
  onFromFilterChange: (value: string) => void
  toFilter: string
  onToFilterChange: (value: string) => void
  accommodationFilter: string
  onAccommodationFilterChange: (value: string) => void
  ticketTypeFilter: string
  onTicketTypeFilterChange: (value: string) => void
  eventLocations: string[] | undefined
  ticketTypes: Array<{ _id: Id<"ticketTypes">; label: string }> | undefined
  preview:
    | {
        total: number
        skippedNoEmail: number
        skippedNoRef: number
        recipients: Array<{
          bookerName: string | null
          bookerEmail: string
          bookingRef: string | null
          status: string | null
          location: string | null
          ticketTypeLabels: string[]
        }>
      }
    | undefined
}) {
  const locations = props.eventLocations ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4 text-primary" />
          Audience
        </CardTitle>
        <CardDescription>
          Order bookers matching all selected filters. Live count updates as you
          filter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="aud-status">Order status</Label>
            <Select
              value={props.statusFilter}
              onValueChange={props.onStatusFilterChange}
            >
              <SelectTrigger id="aud-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-location">Location</Label>
            <Select
              value={props.locationFilter}
              onValueChange={props.onLocationFilterChange}
            >
              <SelectTrigger id="aud-location">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-accommodation">Accommodation</Label>
            <Select
              value={props.accommodationFilter}
              onValueChange={props.onAccommodationFilterChange}
            >
              <SelectTrigger id="aud-accommodation">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="with">With a selection</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-from">Submitted from</Label>
            <Input
              id="aud-from"
              type="date"
              value={props.fromFilter}
              onChange={(e) => props.onFromFilterChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-to">Submitted to</Label>
            <Input
              id="aud-to"
              type="date"
              value={props.toFilter}
              onChange={(e) => props.onToFilterChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-ticket">Ticket type</Label>
            <Select
              value={props.ticketTypeFilter}
              onValueChange={props.onTicketTypeFilterChange}
            >
              <SelectTrigger id="aud-ticket">
                <SelectValue placeholder="All tickets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tickets</SelectItem>
                {(props.ticketTypes ?? []).map((ticketType) => (
                  <SelectItem key={String(ticketType._id)} value={String(ticketType._id)}>
                    {ticketType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {props.preview === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Badge variant="secondary" className="text-sm">
                {props.preview.total} booker{props.preview.total === 1 ? "" : "s"}
              </Badge>
              {props.preview.skippedNoEmail > 0 && (
                <span className="text-xs text-muted-foreground">
                  {props.preview.skippedNoEmail} without an email skipped
                </span>
              )}
              {props.preview.skippedNoRef > 0 && (
                <span className="text-xs text-muted-foreground">
                  {props.preview.skippedNoRef} without a booking reference skipped
                </span>
              )}
            </div>

            {props.preview.recipients.length === 0 ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                No bookers match these filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Booking ref</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Tickets</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.preview.recipients.slice(0, 25).map((recipient) => (
                      <TableRow key={recipient.bookerEmail}>
                        <TableCell className="font-medium">
                          {recipient.bookerName ?? "—"}
                        </TableCell>
                        <TableCell>{recipient.bookerEmail}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {recipient.bookingRef ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{recipient.status ?? "—"}</Badge>
                        </TableCell>
                        <TableCell>{recipient.location ?? "—"}</TableCell>
                        <TableCell>
                          {recipient.ticketTypeLabels.length > 0
                            ? recipient.ticketTypeLabels.join(", ")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ActiveBroadcastCard(props: {
  broadcastId: string | null
  broadcast:
    | {
        status: BroadcastStatus
        title: string
        totalRecipients: number
        sentCount: number
        failedCount: number
        pendingCount: number
        error?: string | null
        cancelledAt?: number | null
      }
    | null
    | undefined
  recipients: Array<{
    to: string
    bookerName?: string | null
    status: RecipientStatus
    error?: string | null
    emailId?: string | null
  }> | undefined
  onSelect: (id: string) => void
  onCancel: () => void
  onRetry: () => void
}) {
  if (!props.broadcast) return null
  const total =
    props.broadcast.sentCount +
    props.broadcast.failedCount +
    props.broadcast.pendingCount
  const done =
    props.broadcast.sentCount + props.broadcast.failedCount
  const progress = total > 0 ? Math.round((done / total) * 100) : 0
  const isActive =
    props.broadcast.status === "queued" || props.broadcast.status === "sending"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary" />
          Live broadcast
        </CardTitle>
        <CardDescription className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge
            variant={broadcastStatusStyles(props.broadcast.status).variant}
            className={broadcastStatusStyles(props.broadcast.status).className}
          >
            {props.broadcast.status}
          </Badge>
          <span>{props.broadcast.title}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {props.broadcast.sentCount} sent · {props.broadcast.failedCount}{" "}
              failed · {props.broadcast.pendingCount} pending
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {(isActive || props.broadcast.status === "cancelled") && (
          <Button type="button" variant="outline" onClick={props.onCancel} disabled={!isActive}>
            Cancel broadcast
          </Button>
        )}
        {(props.broadcast.status === "completed" ||
          props.broadcast.status === "failed" ||
          props.broadcast.status === "cancelled") &&
          props.broadcast.failedCount > 0 && (
            <Button type="button" variant="outline" onClick={props.onRetry}>
              <RotateCcw className="size-4" />
              Retry {props.broadcast.failedCount} failed
            </Button>
          )}

        {props.recipients && props.recipients.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.recipients.slice(0, 50).map((recipient) => (
                  <TableRow key={recipient.to}>
                    <TableCell className="font-medium">{recipient.to}</TableCell>
                    <TableCell>
                      <Badge
                        variant={recipientStatusStyles(recipient.status).variant}
                        className={recipientStatusStyles(recipient.status).className}
                      >
                        {recipient.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {recipient.error ?? recipient.emailId ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistoryCard(props: {
  history: Array<{
    _id: string
    status: BroadcastStatus
    title: string
    createdAt: number
    totalRecipients: number
    sentCount: number
    failedCount: number
    pendingCount: number
  }> | undefined
  activeBroadcastId: string | null
  onSelect: (id: string) => void
}) {
  if (!props.history || props.history.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Previous broadcasts for this event.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {props.history.map((item) => (
            <button
              key={item._id}
              type="button"
              onClick={() => props.onSelect(String(item._id))}
              className="flex min-w-0 w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {item.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString("en-GB")} ·{" "}
                  {item.totalRecipients} recipients
                </span>
              </span>
              <Badge
                variant={broadcastStatusStyles(item.status).variant}
                className={broadcastStatusStyles(item.status).className}
              >
                {item.status}
              </Badge>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
