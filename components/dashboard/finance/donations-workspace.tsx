"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { usePaginatedQuery, useQuery } from "convex/react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { DonationForm } from "@/components/dashboard/donation-form"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { DonationAllocationDialog } from "./donation-allocation-dialog"
import { DonationDeleteDialog } from "./donation-delete-dialog"
import { api } from "@/lib/convex/api"
import { buildDonationDeleteDescription } from "@/lib/dashboard/donation-delete-availability"
import { buildDonationDeletionSuccess } from "@/lib/dashboard/donation-deletion-copy"
import { donationDetailHref } from "@/lib/dashboard/workspace-routes"
import { formatMoney } from "@/lib/format"
import type { Doc, Id } from "@/convex/_generated/dataModel"

/**
 * One row of the paginated standalone-donation list. Phase 56's enrichment adds
 * both composition fields to `getStandaloneDonations`, so the page renders them
 * and never re-derives a remainder.
 */
type DonationListRow = Doc<"payments"> & {
  allocatedMinor: number
  unallocatedRemainderMinor: number
}

/** One open allocation target — the row's server fields, nothing derived. */
type AllocationTarget = {
  donationId: Id<"payments">
  payerName: string
  amountMinor: number
}

/**
 * One armed deletion. `allocationCount` is REQUIRED: a target is never armed
 * with an unknown count, so the confirmation can never claim
 * `This removes no allocations.` for a donation that holds some (DDEL-01).
 */
type DeleteTarget = {
  donationId: Id<"payments">
  payerName: string
  amountMinor: number
  allocationCount: number
}

export function DonationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const router = useRouter()

  const income = useQuery(api.donations.getEventDonationIncome, {
    eventId: event._id,
  })
  const donations = usePaginatedQuery(
    api.payments.getStandaloneDonations,
    { eventId: event._id },
    { initialNumItems: 50 }
  )

  const [showForm, setShowForm] = useState(false)
  const [allocationSuccess, setAllocationSuccess] = useState<{
    allocatedTotalMinor: number
    leftoverMinor: number
  } | null>(null)
  const [deletionSuccess, setDeletionSuccess] = useState<{
    allocationCount: number
  } | null>(null)
  const [allocationTarget, setAllocationTarget] =
    useState<AllocationTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  // DACC-04 link-through: the order and attendee financial views link here with
  // `orderId` / `attendeeId` for INTENT PRESERVATION only. No locked read
  // resolves donations by attendee or order, so this list tolerates those
  // params by NOT reading any search param at all — it never fabricates a
  // filter over data it does not have. The `?donationId=` legacy intent is
  // adopted exactly once by the PAGE (`donations/page.tsx`), which resolves it
  // onto the dedicated detail route — the record on that route is where each
  // allocation's target attendee and recorded scope are shown in full.

  // ONE map, built from the server projection only. The count is TRI-STATE:
  // `income === undefined` means the projection has not resolved yet, and an
  // unresolved count is never coerced to zero — the delete confirmation NAMES
  // this figure, so an unknown count must not read as a clean deletion.
  const allocationCountByDonationId = useMemo(
    () =>
      new Map<string, number>(
        (income?.donations ?? []).map((entry) => [
          String(entry.donationId),
          entry.allocationCount,
        ])
      ),
    [income]
  )

  return (
    <WorkspaceFrame
      title="Donations"
      description="Record, allocate, and review standalone donations for this event."
      eventLabel={event.title}
      workspaceLabel="Donations"
      workspaceId="donations"
      actions={
        <Button
          type="button"
          className="h-9 rounded-lg"
          onClick={() => setShowForm((current) => !current)}
        >
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {showForm ? "Cancel" : "Record donation"}
        </Button>
      }
      summary={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          {income === undefined ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : (
            <>
              <span className="font-semibold">
                Recorded total: {formatMoney(income.totals.donationsMinor)}
              </span>
              <span className="text-muted-foreground">
                {income.totals.donationCount} donation
                {income.totals.donationCount === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground">
                Allocated: {formatMoney(income.totals.allocatedMinor)}
              </span>
              <span className="text-muted-foreground">
                Unallocated remainder:{" "}
                {formatMoney(income.totals.unallocatedRemainderMinor)}
              </span>
            </>
          )}
        </div>
      }
    >
      <div className="min-w-0 space-y-6">
        {showForm && (
          <DonationForm
            eventId={String(event._id)}
            eventTitle={event.title}
            onSuccess={() => setShowForm(false)}
          />
        )}

        {/* A successful allocation launched from this list must confirm here:
            the record panel that used to render this band left the list with
            61-03, so `allocationSuccess` would otherwise be dead state and the
            operator would get NO feedback. Both figures come from the dialog's
            own result payload — nothing is re-derived. */}
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

        {deletionSuccess !== null && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
          >
            {buildDonationDeletionSuccess({
              allocationCount: deletionSuccess.allocationCount,
            })}
          </div>
        )}

        <div className="min-w-0 rounded-2xl border border-border/50 bg-background/50">
          {donations.status === "LoadingFirstPage" ? (
            <DashboardQueryState state="loading" className="py-8" />
          ) : donations.results.length === 0 ? (
            <DashboardQueryState
              state="empty"
              title="No donations recorded"
              message="Record a cash or bank transfer donation to start allocating it across attendees."
              className="rounded-2xl border border-dashed border-border/50 bg-background/50 p-6"
            />
          ) : (
            <>
              <Table>
                <TableCaption>Standalone donations</TableCaption>
                <TableHeader className="bg-muted/30 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  <TableRow>
                    <TableHead>Payer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead>Unallocated remainder</TableHead>
                    <TableHead>Allocations</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {donations.results.map((row: DonationListRow) => {
                    const allocationCount =
                      income === undefined
                        ? undefined
                        : allocationCountByDonationId.get(String(row._id))
                    // The delete description is PER-ROW and CONDITIONAL — a row
                    // must never announce a reason that is not true of it (the
                    // shared-element defect this replaces).
                    const deleteDescription = buildDonationDeleteDescription({
                      source: row.source,
                      allocationCount,
                    })
                    const deleteDescriptionId = `donation-delete-availability-${row._id}`
                    return (
                      <TableRow
                        key={row._id}
                        className="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <TableCell className="max-w-48 truncate font-medium text-foreground">
                          {row.payerName}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-primary tabular-nums">
                          {formatMoney(row.amountMinor)}
                        </TableCell>
                        <TableCell className="text-muted-foreground capitalize">
                          {row.source.replace("_", " ")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(row.paidAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground tabular-nums">
                          {formatMoney(row.allocatedMinor)}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground tabular-nums">
                          {formatMoney(row.unallocatedRemainderMinor)}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {allocationCount === undefined
                            ? "—"
                            : allocationCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() =>
                                router.push(donationDetailHref(slug, row._id))
                              }
                            >
                              Select
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => {
                                setAllocationTarget({
                                  donationId: row._id,
                                  payerName: row.payerName,
                                  amountMinor: row.amountMinor,
                                })
                              }}
                            >
                              Allocate
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8 rounded-lg"
                              disabled={deleteDescription !== null}
                              title={deleteDescription ?? undefined}
                              aria-describedby={
                                deleteDescription === null
                                  ? undefined
                                  : deleteDescriptionId
                              }
                              onClick={() => {
                                if (allocationCount === undefined) return
                                setDeleteTarget({
                                  donationId: row._id,
                                  payerName: row.payerName,
                                  amountMinor: row.amountMinor,
                                  allocationCount,
                                })
                              }}
                            >
                              Delete donation
                            </Button>
                            {deleteDescription !== null && (
                              <p id={deleteDescriptionId} className="sr-only">
                                {deleteDescription}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </>
          )}

          {donations.status === "CanLoadMore" && (
            <div className="border-t border-border/40 p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-lg"
                onClick={() => donations.loadMore(50)}
              >
                Load more donations
              </Button>
            </div>
          )}
          {donations.status === "LoadingMore" && (
            <p className="border-t border-border/40 p-3 text-sm text-muted-foreground">
              Loading…
            </p>
          )}
        </div>

        {/* The record panel left this list for the dedicated detail route
            (61-03); the two dialogs below remain, armed from the row actions.
            React requires unique keys among siblings: each key still namespaces
            the ELEMENT (`allocation-` / `deletion-`) so one donation can never
            collide — the `record-` namespace now lives on the detail host
            (`donation-detail-surface.tsx`), still pinned by
            `tests/dashboard/donation-key-collision.test.ts`. */}
        {allocationTarget !== null && (
          <DonationAllocationDialog
            key={`allocation-${allocationTarget.donationId}`}
            open
            onOpenChange={(next) => {
              if (!next) setAllocationTarget(null)
            }}
            donationId={allocationTarget.donationId}
            eventId={event._id}
            payerName={allocationTarget.payerName}
            amountMinor={allocationTarget.amountMinor}
            onAllocated={(result) => {
              setAllocationSuccess({
                allocatedTotalMinor: result.allocatedTotalMinor,
                leftoverMinor: result.leftoverMinor,
              })
              setDeletionSuccess(null)
            }}
          />
        )}

        {deleteTarget !== null && (
          <DonationDeleteDialog
            key={`deletion-${deleteTarget.donationId}`}
            open
            onOpenChange={(next) => {
              if (!next) setDeleteTarget(null)
            }}
            donationId={deleteTarget.donationId}
            eventId={event._id}
            amountMinor={deleteTarget.amountMinor}
            payerName={deleteTarget.payerName}
            allocationCount={deleteTarget.allocationCount}
            onDeleted={(result) => {
              setDeletionSuccess({ allocationCount: result.allocationCount })
              setAllocationSuccess(null)
            }}
          />
        )}
      </div>
    </WorkspaceFrame>
  )
}
