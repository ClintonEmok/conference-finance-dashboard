"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useConvex, useQuery } from "convex/react"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney } from "@/lib/format"
import {
  scopeLabel,
  type AllocationScope,
} from "@/lib/dashboard/donation-allocation-request"

/**
 * The donation record (Phase 58, plan 58-09) — DACC-04's donation-side target.
 *
 * Every figure in this file comes from `getDonationAllocationSummary` or from a
 * server-provided prop. Nothing is summed, subtracted, clamped or recomputed:
 * a row's `effectiveCapacityMinor` is rendered VERBATIM as `Writable now` and
 * the bare `scopeOutstandingMinor` is demoted to supporting `Scope balance`, so
 * the bare scope ceiling can never be misread as the writable amount (AE-1).
 */

/** One row of `getDonationAllocationSummary.rows` (Phase 55's read projection). */
type DonationAllocationSummaryRow = {
  attendeeId: string
  orderId: string
  scope: AllocationScope
  amountMinor: number
  scopeOutstandingMinor: number
  effectiveCapacityMinor: number
  appliedMinor: number
  unappliedMinor: number
  exceedsCeiling: boolean
  exceedsCapacity: boolean
  createdAt: number
  createdBy: string
}

type DonationAllocationSummary = {
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
  rows: DonationAllocationSummaryRow[]
}

export type DonationRecordPanelProps = {
  donationId: Id<"payments">
  /**
   * Part of the panel's contract with the hosting workspace (the dialogs it
   * opens are event-scoped); the summary read below is donation-scoped, so this
   * file does not consume it.
   */
  eventId: Id<"events">
  payerName: string
  amountMinor: number
  source: "cash" | "bank_transfer" | "tikkie"
  paidAt: number
  notes: string | null
  /**
   * The server's allocation count for this donation. The workspace owns the
   * readiness gate and arms the delete dialog, so the panel receives it as part
   * of the contract and never counts rows itself.
   */
  allocationCount: number
  /** Bumped by the workspace after an allocation or a deletion. */
  reloadToken: number
  allocationSuccess: {
    allocatedTotalMinor: number
    leftoverMinor: number
  } | null
  onAllocate: () => void
  onDelete: () => void
}

const TIKKIE_DELETE_REFUSAL =
  "Tikkie-sourced donations cannot be deleted — the payment sync would recreate this donation."
const RECORD_DELETE_REFUSAL_ID = "donation-record-delete-availability"

const OVER_SCOPE_BALANCE_NOTE = "Above this attendee's scope balance."
const OVER_ORDER_CAPACITY_NOTE =
  "Above the order's remaining capacity — the person is not fully credited."

/** The operator-facing name of a recorded source. */
function donationSourceLabel(source: "cash" | "bank_transfer" | "tikkie") {
  if (source === "tikkie") return "Tikkie"
  if (source === "bank_transfer") return "bank transfer"
  return "cash"
}

/**
 * DACC-04's target resolution: one allocation row's target attendee, read from
 * the order the allocation credited. Its own `useQuery` keeps hooks per row and
 * Convex dedupes identical orders. An unresolved target falls back to the raw
 * attendee id — never an invented label.
 */
function AllocationTargetLabel({
  orderId,
  attendeeId,
}: {
  orderId: string
  attendeeId: string
}) {
  const order = useQuery(api.orders.getOrderWithAttendees, {
    orderId: orderId as Id<"orders">,
  })
  const attendee = order?.attendees.find(
    (entry) => String(entry.id) === attendeeId
  )

  if (attendee) {
    return <span className="font-medium text-foreground">{attendee.name}</span>
  }

  return (
    <span
      className="font-mono text-xs text-muted-foreground"
      title={attendeeId}
    >
      {attendeeId}
    </span>
  )
}

/**
 * The per-row bands. Each is driven by its OWN server field, so one band is
 * never derived from another: `exceedsCeiling` names the attendee bound,
 * `exceedsCapacity` the order bound, and a non-zero `unappliedMinor` renders
 * the figure itself.
 */
function AllocationRowBands({ row }: { row: DonationAllocationSummaryRow }) {
  return (
    <>
      {row.exceedsCeiling === true && (
        <p className="mt-1 text-xs font-medium text-destructive">
          {OVER_SCOPE_BALANCE_NOTE}
        </p>
      )}
      {row.exceedsCapacity === true && (
        <p className="mt-1 text-xs font-medium text-destructive">
          {OVER_ORDER_CAPACITY_NOTE}
        </p>
      )}
      {row.unappliedMinor > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {formatMoney(row.unappliedMinor)} is not credited.
        </p>
      )}
    </>
  )
}

export function DonationRecordPanel({
  donationId,
  payerName,
  amountMinor,
  source,
  paidAt,
  notes,
  reloadToken,
  allocationSuccess,
  onAllocate,
  onDelete,
}: DonationRecordPanelProps) {
  const convex = useConvex()
  const [summary, setSummary] = useState<DonationAllocationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const requestIdRef = useRef(0)

  // The summary read is IMPERATIVE (not `useQuery`, which throws the failure
  // instead of returning it) so `Allocations unavailable` + `Try again` and the
  // session-expired band are real rendered states. The request-id guard
  // supersedes a late response, so a stale summary never overwrites a fresher
  // one and a reload after an allocation or a deletion is safe.
  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setErrorMessage(null)
    setSessionExpired(false)

    try {
      const result = await convex.query(
        api.donations.getDonationAllocationSummary,
        { donationId }
      )
      if (requestIdRef.current !== requestId) return
      setSummary(result)
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : ""
      if (message.startsWith("Unauthorized")) {
        setSessionExpired(true)
      } else {
        setErrorMessage("Allocations unavailable")
      }
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false)
    }
  }, [convex, donationId])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  // Exactly ONE money-state chip, derived by EQUALITY against server figures —
  // never by arithmetic over them.
  const chip =
    summary === null
      ? null
      : summary.recordedAllocatedMinor === 0
        ? {
            label: "Nothing allocated",
            className: "border-border/60 text-muted-foreground",
          }
        : summary.recordedAllocatedMinor === summary.donationAmountMinor
          ? {
              label: "Fully allocated",
              className:
                "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
            }
          : {
              label: "Partially allocated",
              className: "border-primary/30 text-primary",
            }

  const rows = summary?.rows ?? []
  const visibleRows = showAll ? rows : rows.slice(0, 10)
  const historyShell = (
    <div className="min-w-0 rounded-2xl border border-border/50 bg-background/50">
      <Table>
        <TableCaption>Allocations for this donation</TableCaption>
        <TableHeader className="bg-muted/30 text-xs font-bold tracking-wider text-muted-foreground uppercase">
          <TableRow>
            <TableHead>Target attendee</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Scope balance</TableHead>
            <TableHead>Writable now</TableHead>
            <TableHead>Recorded</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Not applied</TableHead>
            <TableHead>Recorded at / by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border/40">
          {/* The ordinal keeps each rendered row unique when one donation holds
              two allocations to the same target (orderId + attendeeId alone
              collided — 61-01). The rows are an append-only, payload-ordered
              list, so the index is stable for a given summary payload. */}
          {visibleRows.map((row, index) => (
            <TableRow key={`${row.orderId}:${row.attendeeId}:${index}`}>
              <TableCell>
                <AllocationTargetLabel
                  orderId={row.orderId}
                  attendeeId={row.attendeeId}
                />
                <AllocationRowBands row={row} />
              </TableCell>
              <TableCell>
                <Badge variant="outline">{scopeLabel(row.scope)}</Badge>
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground tabular-nums">
                {formatMoney(row.scopeOutstandingMinor)}
              </TableCell>
              <TableCell className="font-mono text-sm font-semibold text-primary tabular-nums">
                {formatMoney(row.effectiveCapacityMinor)}
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground tabular-nums">
                {formatMoney(row.amountMinor)}
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground tabular-nums">
                {formatMoney(row.appliedMinor)}
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground tabular-nums">
                {formatMoney(row.unappliedMinor)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(row.createdAt).toLocaleDateString()}
                <span className="block text-xs text-muted-foreground">
                  {row.createdBy}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="break-words">{payerName}</CardTitle>
          <CardDescription>
            {donationSourceLabel(source)} ·{" "}
            {new Date(paidAt).toLocaleDateString()}
          </CardDescription>
        </div>
        {chip !== null && (
          <Badge variant="outline" className={chip.className}>
            {chip.label}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {allocationSuccess !== null && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
          >
            Allocation recorded.{" "}
            {formatMoney(allocationSuccess.allocatedTotalMinor)} allocated;{" "}
            {formatMoney(allocationSuccess.leftoverMinor)} left unallocated.
          </div>
        )}

        {isLoading &&
        summary === null &&
        errorMessage === null &&
        !sessionExpired ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : null}

        {sessionExpired ? (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
            <p className="font-medium text-foreground">
              Your session has expired
            </p>
            <p className="text-muted-foreground">Sign in again to continue.</p>
          </div>
        ) : null}

        {!sessionExpired && errorMessage !== null ? (
          <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">
              Allocations unavailable
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-lg"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {summary !== null && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <span className="font-semibold">
              Donation: {formatMoney(summary.donationAmountMinor)}
            </span>
            <span className="text-muted-foreground">
              Allocated: {formatMoney(summary.recordedAllocatedMinor)}
            </span>
            <span className="text-muted-foreground">
              Remaining: {formatMoney(summary.remainingMinor)}
            </span>
          </div>
        )}

        {notes !== null && (
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Notes
            </p>
            <p className="text-sm break-words text-foreground">{notes}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg"
            onClick={onAllocate}
          >
            Allocate donation
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-9 rounded-lg"
            disabled={source === "tikkie"}
            title={source === "tikkie" ? TIKKIE_DELETE_REFUSAL : undefined}
            aria-describedby={
              source === "tikkie" ? RECORD_DELETE_REFUSAL_ID : undefined
            }
            onClick={onDelete}
          >
            Delete donation
          </Button>
          <p id={RECORD_DELETE_REFUSAL_ID} className="sr-only">
            {TIKKIE_DELETE_REFUSAL}
          </p>
        </div>

        {summary !== null &&
          (rows.length === 0 ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-border/50 bg-background/50 p-6">
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  No allocations yet
                </p>
                <p className="text-sm text-muted-foreground">
                  {"Allocate this donation to credit an attendee's balance."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-lg"
                onClick={onAllocate}
              >
                Allocate donation
              </Button>
            </div>
          ) : (
            <>
              {showAll ? (
                <ScrollArea className="max-h-72">{historyShell}</ScrollArea>
              ) : (
                historyShell
              )}
              {rows.length > 10 && !showAll && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-lg"
                  onClick={() => setShowAll(true)}
                >
                  Show all {rows.length} allocations
                </Button>
              )}
            </>
          ))}
      </CardContent>
    </Card>
  )
}
