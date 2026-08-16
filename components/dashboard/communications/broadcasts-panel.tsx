"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { Activity, History, Loader2, RotateCcw } from "lucide-react"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

export type BroadcastStatus =
  | "queued"
  | "sending"
  | "completed"
  | "failed"
  | "cancelled"

export type RecipientStatus = "pending" | "sent" | "failed"

type AudienceFilters = {
  location?: string
  status?: "paid" | "pending" | "cancelled" | "refunded"
  from?: number
  to?: number
  hasAccommodationSelection?: boolean
  ticketTypeId?: Id<"ticketTypes">
  /** Search scope stored by the standard announcement send flow. */
  search?: string
}

export type BroadcastHistoryItem = {
  _id: string
  status: BroadcastStatus
  title: string
  createdAt: number
  totalRecipients: number
  sentCount: number
  failedCount: number
  pendingCount: number
  error: string | null
  completedAt: number | null
  cancelledAt: number | null
}

export type BroadcastDetail = {
  _id: string
  status: BroadcastStatus
  title: string
  message: string
  eventName: string
  eventDate: string
  eventLocation: string
  paymentUrl?: string
  nightBeforeNote?: string
  signupUrl: string
  filters: AudienceFilters
  totalRecipients: number
  sentCount: number
  failedCount: number
  pendingCount: number
  createdBy?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  cancelledAt?: number
  error?: string
}

export type RecipientRow = {
  _id: string
  to: string
  bookerName?: string
  bookingRef?: string
  status: RecipientStatus
  error?: string
  emailId?: string
}

const broadcastStatusLabel: Record<BroadcastStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
}

const recipientStatusLabel: Record<RecipientStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
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

/**
 * Human-readable summary of the stored audience filters. Resolves a raw
 * ticket type ID to its label so operators never see Convex IDs.
 */
export function describeFilters(
  filters: AudienceFilters,
  ticketTypes: Array<{ _id: Id<"ticketTypes">; label: string }> | undefined
) {
  const parts: string[] = []
  if (filters.search) parts.push(`search: “${filters.search}”`)
  if (filters.status) parts.push(`status: ${filters.status}`)
  if (filters.location) parts.push(`location: ${filters.location}`)
  if (filters.from !== undefined)
    parts.push(`from: ${new Date(filters.from).toLocaleDateString("en-GB")}`)
  if (filters.to !== undefined)
    parts.push(`to: ${new Date(filters.to).toLocaleDateString("en-GB")}`)
  if (filters.hasAccommodationSelection) parts.push("with accommodation selection")
  if (filters.ticketTypeId) {
    const label = (ticketTypes ?? []).find(
      (ticketType) => String(ticketType._id) === String(filters.ticketTypeId)
    )?.label
    parts.push(`ticket: ${label ?? String(filters.ticketTypeId)}`)
  }
  return parts.length > 0 ? parts.join(" · ") : "all bookers"
}

function formatTimestamp(timestamp: number | null | undefined) {
  if (typeof timestamp !== "number") return "—"
  return new Date(timestamp).toLocaleString("en-GB")
}

export function BroadcastsPanel(props: {
  history: BroadcastHistoryItem[] | undefined
  broadcastId: string | null
  onSelect: (id: string) => void
  onCancel: () => void
  onRetry: () => void
  actionPending?: boolean
  actionError?: string | null
  ticketTypes: Array<{ _id: Id<"ticketTypes">; label: string }> | undefined
}) {
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("all")
  const [recipientStatus, setRecipientStatus] = useState<string>("all")

  const broadcast = useQuery(
    api.emailBroadcasts.getBroadcastById,
    props.broadcastId
      ? { broadcastId: props.broadcastId as Id<"emailBroadcasts"> }
      : ("skip" as const)
  ) as BroadcastDetail | null | undefined

  const recipients = useQuery(
    api.emailBroadcasts.getBroadcastRecipients,
    props.broadcastId
      ? {
          broadcastId: props.broadcastId as Id<"emailBroadcasts">,
          status:
            recipientStatus === "all"
              ? undefined
              : (recipientStatus as RecipientStatus),
          limit: 300,
        }
      : ("skip" as const)
  ) as RecipientRow[] | undefined

  const history = props.history ?? []
  const filteredHistory =
    historyStatusFilter === "all"
      ? history
      : history.filter((item) => item.status === historyStatusFilter)

  const isActive =
    broadcast?.status === "queued" || broadcast?.status === "sending"

  const total = broadcast
    ? broadcast.sentCount + broadcast.failedCount + broadcast.pendingCount
    : 0
  const done = broadcast
    ? broadcast.sentCount + broadcast.failedCount
    : 0
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          Broadcasts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
          {/* Master: status-filterable history list */}
          <div className="min-w-0 space-y-3">
            <Select
              value={historyStatusFilter}
              onValueChange={setHistoryStatusFilter}
            >
              <SelectTrigger id="broadcast-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sending">Sending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {props.history === undefined ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                No broadcasts match this filter.
              </p>
            ) : (
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {filteredHistory.map((item) => {
                  const styles = broadcastStatusStyles(item.status)
                  const selected = props.broadcastId === String(item._id)
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => props.onSelect(String(item._id))}
                      className={`flex min-w-0 w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                        selected
                          ? "border-primary/50 bg-muted/40"
                          : "border-border/60 bg-card"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatTimestamp(item.createdAt)} ·{" "}
                          {item.totalRecipients} recipients
                        </span>
                      </span>
                      <Badge
                        variant={styles.variant}
                        className={styles.className}
                      >
                        {broadcastStatusLabel[item.status]}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Detail: selected broadcast progress + recipient tracking */}
          <div className="min-w-0">
            {!props.broadcastId ? (
              <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border/70 p-6">
                <p className="text-center text-sm text-muted-foreground">
                  Select a broadcast to inspect its delivery progress and
                  recipients.
                </p>
              </div>
            ) : broadcast === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : broadcast === null ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                This broadcast could not be found.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="truncate text-base font-semibold">
                      {broadcast.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Created {formatTimestamp(broadcast.createdAt)} ·{" "}
                      {broadcast.totalRecipients} recipients
                    </p>
                  </div>
                  <Badge
                    variant={broadcastStatusStyles(broadcast.status).variant}
                    className={broadcastStatusStyles(broadcast.status).className}
                  >
                    <Activity className="size-3" />
                    {broadcastStatusLabel[broadcast.status]}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {broadcast.sentCount} sent · {broadcast.failedCount}{" "}
                      failed · {broadcast.pendingCount} pending
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

                {broadcast.error && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {broadcast.error}
                  </p>
                )}

                <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Created</dt>
                    <dd>{formatTimestamp(broadcast.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Started</dt>
                    <dd>{formatTimestamp(broadcast.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Completed</dt>
                    <dd>{formatTimestamp(broadcast.completedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Cancelled</dt>
                    <dd>{formatTimestamp(broadcast.cancelledAt)}</dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Stored audience filters
                  </p>
                  <p className="mt-1">
                    {describeFilters(
                      broadcast.filters as AudienceFilters,
                      props.ticketTypes
                    )}
                  </p>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  {(isActive || broadcast.status === "cancelled") && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={props.onCancel}
                      disabled={!isActive || props.actionPending}
                    >
                      {props.actionPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Cancel broadcast
                    </Button>
                  )}
                  {(broadcast.status === "completed" ||
                    broadcast.status === "failed" ||
                    broadcast.status === "cancelled") &&
                    broadcast.failedCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={props.onRetry}
                        disabled={props.actionPending}
                      >
                        {props.actionPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RotateCcw className="size-4" />
                        )}
                        Retry {broadcast.failedCount} failed
                      </Button>
                    )}
                </div>

                {props.actionError && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {props.actionError}
                  </p>
                )}

                <div className="space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">Recipients</p>
                    <Select
                      value={recipientStatus}
                      onValueChange={setRecipientStatus}
                    >
                      <SelectTrigger
                        id="recipient-status-filter"
                        className="w-40"
                      >
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {recipients === undefined ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading recipients…
                    </div>
                  ) : recipients.length === 0 ? (
                    <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                      No recipients match this status filter.
                    </p>
                  ) : (
                    <>
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
                            {recipients.slice(0, 100).map((recipient) => (
                              <TableRow key={recipient._id}>
                                <TableCell className="min-w-0">
                                  <span className="block font-medium">
                                    {recipient.to}
                                  </span>
                                  {(recipient.bookerName ||
                                    recipient.bookingRef) && (
                                    <span className="block text-xs text-muted-foreground">
                                      {recipient.bookerName ?? "—"}
                                      {recipient.bookingRef
                                        ? ` · ${recipient.bookingRef}`
                                        : ""}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      recipientStatusStyles(
                                        recipient.status
                                      ).variant
                                    }
                                    className={
                                      recipientStatusStyles(
                                        recipient.status
                                      ).className
                                    }
                                  >
                                    {recipientStatusLabel[recipient.status]}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {recipient.error ??
                                    recipient.emailId ??
                                    "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {recipients.length > 100 && (
                        <p className="text-xs text-muted-foreground">
                          Showing the first 100 of {recipients.length}{" "}
                          recipients.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
