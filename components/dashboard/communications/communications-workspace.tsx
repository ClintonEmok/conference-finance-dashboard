"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Megaphone, Search, Send, Users, X } from "lucide-react"
import { render } from "@react-email/render"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import AnnouncementEmail from "@/lib/email/templates/announcement"
import {
  ANNOUNCEMENT_MESSAGE,
  ANNOUNCEMENT_NOTE,
  ANNOUNCEMENT_TITLE,
} from "@/lib/email/announcement-copy"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { communicationsHref } from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { PaymentReminderCard } from "./payment-reminder-card"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

  // --- Standard announcement send state ------------------------------------
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [sendPending, setSendPending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedAnnouncementIds, setSelectedAnnouncementIds] = useState<Set<string>>(new Set())
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set())
  const [announcementAllMatching, setAnnouncementAllMatching] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

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
  const scheduleEmailBroadcast = useMutation(
    api.emailBroadcasts.scheduleEmailBroadcast
  )
  const scheduleManualPaymentReminders = useMutation(
    api.paymentReminders.scheduleManualPaymentReminders
  )

  // --- Reset progressive reveal when the search changes ---------------------
  useEffect(() => {
    setVisibleCount(AUDIENCE_PAGE)
    setSelectedAnnouncementIds(new Set())
    setSelectedPaymentIds(new Set())
    setAnnouncementAllMatching(false)
  }, [audienceSearch])

  // --- Clear the selected broadcast when the event changes ------------------
  useEffect(() => {
    setSelectedBroadcastId(null)
    setSelectedAnnouncementIds(new Set())
    setSelectedPaymentIds(new Set())
    setAnnouncementAllMatching(false)
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

  // --- Send the fixed standard announcement to the exact searched audience --
  const trimmedSearch = audienceSearch.trim()
  const audienceTotal = preview?.total ?? 0
  const announcementSelectedCount = announcementAllMatching ? audienceTotal : selectedAnnouncementIds.size
  const paymentSelectedCount = selectedPaymentIds.size
  const canSend = announcementSelectedCount > 0 && announcementSelectedCount <= 2000 && !sendPending
  const announcementSelectionFor = (ids: Set<string>, allMatching: boolean) => allMatching
    ? { mode: "allMatching" as const, search: trimmedSearch || undefined }
    : { mode: "explicit" as const, orderIds: Array.from(ids) as Id<"orders">[] }

  async function handleSend() {
    if (sendPending || announcementSelectedCount === 0 || announcementSelectedCount > 2000) return
    setSendPending(true)
    setSendError(null)
    try {
      const result = await scheduleEmailBroadcast({
        eventId: event._id,
        selection: announcementSelectionFor(selectedAnnouncementIds, announcementAllMatching),
        authorize: true,
      })
      setSelectedBroadcastId(String(result.broadcastId))
      setSendDialogOpen(false)
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Could not schedule the announcement."
      )
    } finally {
      setSendPending(false)
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
        <StandardAnnouncementCard
          eventTitle={event.title}
          eventStartsAt={event.startsAt}
          eventSlug={event.slug}
          audienceTotal={audienceTotal}
          selectedCount={announcementSelectedCount}
          allMatching={announcementAllMatching}
          onSelectAll={() => setAnnouncementAllMatching(true)}
          onClear={() => { setAnnouncementAllMatching(false); setSelectedAnnouncementIds(new Set()) }}
          trimmedSearch={trimmedSearch}
          canSend={canSend}
          onSendRequest={() => setSendDialogOpen(true)}
        />

         <PaymentReminderCard eventId={event._id} eventTitle={event.title} eventDate={event.startsAt} audienceTotal={audienceTotal} selectedCount={paymentSelectedCount}
           canSend={paymentSelectedCount > 0 && paymentSelectedCount <= 2000 && !paymentPending}
           onClear={() => setSelectedPaymentIds(new Set())}
           onSendRequest={() => setPaymentDialogOpen(true)} />

        <AudienceCard
          preview={preview}
          audienceSearch={audienceSearch}
          onAudienceSearchChange={setAudienceSearch}
          visibleRecipients={visibleRecipients}
          selectedAnnouncementIds={selectedAnnouncementIds}
          selectedPaymentIds={selectedPaymentIds}
          announcementAllMatching={announcementAllMatching}
           onToggle={(id, path) => {
             if (path === "announcement" && announcementAllMatching) return
            const setter = path === "announcement" ? setSelectedAnnouncementIds : setSelectedPaymentIds
            setter((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })
          }}
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

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send standard announcement?</DialogTitle>
            <DialogDescription>
              This queues “{ANNOUNCEMENT_TITLE}” for {announcementSelectedCount}{" "}
              booker{audienceTotal === 1 ? "" : "s"}
              {announcementAllMatching ? (trimmedSearch ? ` matching all server matches for “${trimmedSearch}”` : " (all server-matching bookers)") : " (selected bookers)"}
              . Delivery is asynchronous and tracked in the broadcasts panel
              below — it cannot be undone after it is queued.
            </DialogDescription>
          </DialogHeader>
          {sendError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {sendError}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={sendPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSend} disabled={sendPending}>
              {sendPending ? (
                <span className="flex items-center gap-2">
                  <Skeleton className="size-3 animate-pulse rounded-full" />
                  Queuing…
                </span>
              ) : (
                "Confirm send"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send payment reminders?</DialogTitle><DialogDescription>
             Queue reminders for exactly {paymentSelectedCount} selected booker{paymentSelectedCount === 1 ? "" : "s"}. Balances, lifecycle, and recipient data are rechecked before queueing; ineligible orders are not sent.
          </DialogDescription></DialogHeader>
          {paymentError && <p className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{paymentError}</p>}
          <DialogFooter><DialogClose asChild><Button variant="outline" disabled={paymentPending}>Cancel</Button></DialogClose>
             <Button disabled={paymentPending} onClick={async () => { setPaymentPending(true); setPaymentError(null); try { await scheduleManualPaymentReminders({ eventId: event._id, selection: { mode: "explicit", orderIds: Array.from(selectedPaymentIds) as Id<"orders">[] }, authorize: true }); setSelectedPaymentIds(new Set()); setPaymentDialogOpen(false) } catch (error) { setPaymentError(error instanceof Error ? error.message : "Could not schedule payment reminders.") } finally { setPaymentPending(false) } }}>{paymentPending ? "Queuing…" : "Confirm send"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  )
}

function StandardAnnouncementCard(props: {
  eventTitle: string
  eventStartsAt: number
  eventSlug: string
  audienceTotal: number
  trimmedSearch: string
  canSend: boolean
  onSendRequest: () => void
  selectedCount: number
  allMatching: boolean
  onSelectAll: () => void
  onClear: () => void
}) {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Render the REAL AnnouncementEmail template client-side. The manage URL is
  // a placeholder for preview only — personalized links are server-derived at
  // schedule time. No venue/location field exists in the template.
  useEffect(() => {
    let cancelled = false
    setPreviewHtml(null)
    setPreviewError(null)
    const origin =
      typeof window === "undefined"
        ? "http://localhost:3000"
        : window.location.origin
    render(
      AnnouncementEmail({
        title: ANNOUNCEMENT_TITLE,
        message: ANNOUNCEMENT_MESSAGE,
        eventName: props.eventTitle,
        eventDate: props.eventStartsAt
          ? new Date(props.eventStartsAt).toLocaleDateString("en-GB")
          : "",
        manageBookingUrl: `${origin}/booking/BK-EXAMPLE/manage`,
        signupUrl: `${origin}/signup/${props.eventSlug}`,
        paymentUrl: null,
        nightBeforeNote: ANNOUNCEMENT_NOTE,
      })
    )
      .then((html) => {
        if (!cancelled) setPreviewHtml(html)
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error ? error.message : "Could not render the preview."
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [props.eventTitle, props.eventStartsAt, props.eventSlug])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" />
          Standard announcement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border/60 bg-white">
          {previewError ? (
            <p className="p-4 text-sm text-destructive">{previewError}</p>
          ) : previewHtml ? (
            <iframe
              title="Standard announcement email preview"
              srcDoc={previewHtml}
              className="h-[520px] w-full bg-white"
            />
          ) : (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-muted-foreground">
            One fixed announcement: event title, date, and booking/register
            links come from this event. Sent to exactly the searched audience
            below after explicit confirmation.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{props.selectedCount} selected{props.allMatching ? " (all matches)" : ""}</span>
            <Button type="button" variant="outline" size="sm" onClick={props.onSelectAll}>Select all matches</Button>
            <Button type="button" variant="ghost" size="sm" onClick={props.onClear}><X className="size-3" /> Clear</Button>
          </div>
          <Button
            type="button"
            onClick={props.onSendRequest}
            disabled={!props.canSend}
          >
            <Send className="size-4" />
            Send announcement
          </Button>
        </div>
        {props.audienceTotal === 0 && (
          <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            No bookers match the current search — nothing can be sent until the
            audience is non-empty.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function AudienceCard(props: {
  preview:
    | {
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
    | undefined
  audienceSearch: string
  onAudienceSearchChange: (value: string) => void
  visibleRecipients: Array<{
    orderId: string
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
  selectedAnnouncementIds: Set<string>
  selectedPaymentIds: Set<string>
  announcementAllMatching: boolean
  onToggle: (id: string, path: "announcement" | "payment") => void
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
                      <TableHead>Select</TableHead><TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Booking ref</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Tickets</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {props.visibleRecipients.map((recipient) => (
                      <TableRow key={recipient.orderId}>
                        <TableCell><div className="flex gap-1"><input aria-label={`Select announcement ${recipient.bookerEmail}`} type="checkbox" checked={props.announcementAllMatching || props.selectedAnnouncementIds.has(recipient.orderId)} onChange={() => props.onToggle(recipient.orderId, "announcement")} /><input aria-label={`Select payment reminder ${recipient.bookerEmail}`} type="checkbox" checked={props.selectedPaymentIds.has(recipient.orderId)} onChange={() => props.onToggle(recipient.orderId, "payment")} /></div></TableCell>
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
