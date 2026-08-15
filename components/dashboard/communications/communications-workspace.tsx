"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Search, Users } from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
    ticketTypeLabels: string[]
  }>
}

const AUDIENCE_PAGE = 25
const MAX_PREVIEW_RECIPIENTS = 200

export function CommunicationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()

  // --- Audience search + progressive reveal --------------------------------
  const [audienceSearch, setAudienceSearch] = useState("")
  const [visibleCount, setVisibleCount] = useState(AUDIENCE_PAGE)

  // --- Broadcast tracking state --------------------------------------------
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(
    null
  )
  const [broadcastActionError, setBroadcastActionError] = useState<string | null>(
    null
  )
  const [broadcastActionPending, setBroadcastActionPending] = useState(false)

  const ticketTypes = useQuery(
    api.events.getTicketTypesForEvent,
    event?._id ? { eventId: event._id } : ("skip" as const)
  )

  const preview = useQuery(
    api.emailBroadcasts.previewAudience,
    event?._id
      ? {
          eventId: event._id,
          search: audienceSearch.trim() || undefined,
          limit: MAX_PREVIEW_RECIPIENTS,
        }
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

  // --- Reset progressive reveal when the search changes ---------------------
  useEffect(() => {
    setVisibleCount(AUDIENCE_PAGE)
  }, [audienceSearch])

  // --- Clear the selected broadcast when the event changes ------------------
  useEffect(() => {
    setSelectedBroadcastId(null)
  }, [event._id])

  // --- Select a sensible initial broadcast without polling ------------------
  useEffect(() => {
    if (!selectedBroadcastId && history && history.length > 0) {
      setSelectedBroadcastId(String(history[0]._id))
    }
  }, [history, selectedBroadcastId])

  const recipients = preview?.recipients ?? []
  const visibleRecipients = useMemo(
    () => recipients.slice(0, visibleCount),
    [recipients, visibleCount]
  )
  const canRevealMore = visibleRecipients.length < recipients.length

  async function handleCancel() {
    if (!selectedBroadcastId || broadcastActionPending) return
    setBroadcastActionPending(true)
    setBroadcastActionError(null)
    try {
      await cancelEmailBroadcast({ broadcastId: selectedBroadcastId as Id<"emailBroadcasts"> })
    } catch (error) {
      setBroadcastActionError(
        error instanceof Error ? error.message : "Could not cancel broadcast."
      )
    } finally {
      setBroadcastActionPending(false)
    }
  }

  async function handleRetry() {
    if (!selectedBroadcastId || broadcastActionPending) return
    setBroadcastActionPending(true)
    setBroadcastActionError(null)
    try {
      await retryFailedEmailBroadcast({ broadcastId: selectedBroadcastId as Id<"emailBroadcasts"> })
    } catch (error) {
      setBroadcastActionError(
        error instanceof Error ? error.message : "Could not retry broadcast."
      )
    } finally {
      setBroadcastActionPending(false)
    }
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
          preview={preview}
          audienceSearch={audienceSearch}
          onAudienceSearchChange={setAudienceSearch}
          visibleRecipients={visibleRecipients}
          canRevealMore={canRevealMore}
          revealCount={recipients.length - visibleRecipients.length}
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
          actionPending={broadcastActionPending}
          actionError={broadcastActionError}
          ticketTypes={ticketTypes}
        />
      </div>
    </WorkspaceFrame>
  )
}

function AudienceCard(props: {
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          Audience
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          </>
        )}
      </CardContent>
    </Card>
  )
}
