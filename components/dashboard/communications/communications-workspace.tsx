"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Filter, Search } from "lucide-react"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { communicationsHref } from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import {
  BroadcastsPanel,
  type BroadcastHistoryItem,
} from "./broadcasts-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

type AudiencePreview = {
  total: number
  skippedNoEmail: number
  skippedNoRef: number
  recipients: Array<{
    orderId: string
    bookerName: string | null
    bookerEmail: string
    bookingRef: string | null
    status: string | null
    location: string | null
    hasAccommodationSelection: boolean
    ticketTypeLabels: string[]
    submittedAt: number | null
  }>
}

const AUDIENCE_PAGE = 25
const MAX_PREVIEW_RECIPIENTS = 200

function toDayTimestamp(dateStr: string, boundary: "start" | "end") {
  if (!dateStr) return undefined
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return undefined
  return boundary === "start"
    ? date.getTime()
    : date.getTime() + 86_400_000 - 1
}

export function CommunicationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()

  // --- Audience filter state -----------------------------------------------
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [fromFilter, setFromFilter] = useState("")
  const [toFilter, setToFilter] = useState("")
  const [accommodationFilter, setAccommodationFilter] = useState("all")
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all")

  // --- Audience search + progressive reveal --------------------------------
  const [audienceSearch, setAudienceSearch] = useState("")
  const [visibleCount, setVisibleCount] = useState(AUDIENCE_PAGE)

  // --- Broadcast tracking state --------------------------------------------
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(
    null
  )

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
      ? { eventId: event._id, ...filters, limit: MAX_PREVIEW_RECIPIENTS }
      : ("skip" as const)
  ) as AudiencePreview | undefined

  const history = useQuery(
    api.emailBroadcasts.getBroadcastHistory,
    event?._id ? { eventId: event._id } : ("skip" as const)
  ) as BroadcastHistoryItem[] | undefined

  const cancelEmailBroadcast = useMutation(
    api.emailBroadcasts.cancelEmailBroadcast
  )
  const retryFailedEmailBroadcast = useMutation(
    api.emailBroadcasts.retryFailedEmailBroadcast
  )

  // --- Reset audience search/reveal when the filters change -----------------
  useEffect(() => {
    setAudienceSearch("")
    setVisibleCount(AUDIENCE_PAGE)
  }, [filters])

  // --- Select a sensible initial broadcast without polling ------------------
  useEffect(() => {
    if (!selectedBroadcastId && history && history.length > 0) {
      setSelectedBroadcastId(String(history[0]._id))
    }
  }, [history, selectedBroadcastId])

  const searchedRecipients = useMemo(() => {
    const rows = preview?.recipients ?? []
    const query = audienceSearch.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(
      (recipient) =>
        (recipient.bookerName ?? "").toLowerCase().includes(query) ||
        recipient.bookerEmail.toLowerCase().includes(query) ||
        (recipient.bookingRef ?? "").toLowerCase().includes(query)
    )
  }, [audienceSearch, preview])

  const visibleRecipients = searchedRecipients.slice(0, visibleCount)
  const canRevealMore = visibleRecipients.length < searchedRecipients.length

  async function handleCancel() {
    if (!selectedBroadcastId) return
    await cancelEmailBroadcast({ broadcastId: selectedBroadcastId as Id<"emailBroadcasts"> })
  }

  async function handleRetry() {
    if (!selectedBroadcastId) return
    await retryFailedEmailBroadcast({ broadcastId: selectedBroadcastId as Id<"emailBroadcasts"> })
  }

  const tabs = useMemo(
    () => [{ value: "communications", label: "Broadcast", href: communicationsHref(slug) }],
    [slug]
  )

  return (
    <WorkspaceFrame
      title="Communications"
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
        <AudienceCard
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
          audienceSearch={audienceSearch}
          onAudienceSearchChange={setAudienceSearch}
          visibleRecipients={visibleRecipients}
          canRevealMore={canRevealMore}
          revealCount={searchedRecipients.length - visibleRecipients.length}
          onRevealMore={() =>
            setVisibleCount((count) => count + AUDIENCE_PAGE)
          }
        />

        <BroadcastsPanel
          history={history}
          broadcastId={selectedBroadcastId}
          onSelect={setSelectedBroadcastId}
          onCancel={handleCancel}
          onRetry={handleRetry}
          ticketTypes={ticketTypes}
        />
      </div>
    </WorkspaceFrame>
  )
}

function AudienceCard(props: {
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
  audienceSearch: string
  onAudienceSearchChange: (value: string) => void
  visibleRecipients: Array<{
    bookerName: string | null
    bookerEmail: string
    bookingRef: string | null
    status: string | null
    location: string | null
    ticketTypeLabels: string[]
  }>
  canRevealMore: boolean
  revealCount: number
  onRevealMore: () => void
}) {
  const locations = props.eventLocations ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4 text-primary" />
          Audience
        </CardTitle>
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
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="audience-search"
                    type="search"
                    value={props.audienceSearch}
                    onChange={(e) => props.onAudienceSearchChange(e.target.value)}
                    placeholder="Search by name, email, or booking reference"
                    className="pl-9"
                  />
                </div>

                {props.visibleRecipients.length === 0 ? (
                  <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                    No bookers match your search.
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
                        {props.visibleRecipients.map((recipient) => (
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

                {props.canRevealMore && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={props.onRevealMore}
                  >
                    Show more ({props.revealCount} more)
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
