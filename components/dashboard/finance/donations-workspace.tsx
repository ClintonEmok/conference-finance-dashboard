"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { DonationRecordPanel } from "./donation-record-panel"
import { api } from "@/lib/convex/api"
import { buildDonationDeletionSuccess } from "@/lib/dashboard/donation-deletion-copy"
import { donationsHref } from "@/lib/dashboard/workspace-routes"
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

/** The row-level delete refusals, exposed through `title`/`aria-describedby`. */
const TIKKIE_DELETE_REFUSAL =
  "Tikkie-sourced donations cannot be deleted — the payment sync would recreate this donation."
const ALLOCATION_COUNT_PENDING = "Preparing the allocation count…"
const DELETE_REFUSAL_DESCRIBED_BY_ID = "donations-delete-availability"

export function DonationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const router = useRouter()
  const searchParams = useSearchParams()

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
  const [recordReloadToken, setRecordReloadToken] = useState(0)

  // DACC-04 link-through: the order and attendee financial views link here with
  // `orderId` / `attendeeId` for INTENT PRESERVATION only. No locked read
  // resolves donations by attendee or order, so this page tolerates those
  // params and does NOT fabricate a filter over data it does not have — the
  // record below is where each allocation's target attendee and recorded scope
  // are shown in full. `donationId` is the only param this page reads.
  const selectedDonationId = searchParams.get("donationId")

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

  const selectedRow: DonationListRow | undefined =
    selectedDonationId === null
      ? undefined
      : donations.results.find((row) => String(row._id) === selectedDonationId)

  const selectedAllocationCount =
    selectedRow === undefined || income === undefined
      ? undefined
      : allocationCountByDonationId.get(String(selectedRow._id))

  function selectDonation(donationId: Id<"payments">) {
    const nextHref = donationsHref(slug, { donationId: String(donationId) })
    router.replace(nextHref, { scroll: false })
  }

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
                    const isSelected = selectedDonationId === String(row._id)
                    return (
                      <TableRow
                        key={row._id}
                        aria-current={isSelected ? "true" : undefined}
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
                              onClick={() => selectDonation(row._id)}
                            >
                              Select
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={() => {
                                selectDonation(row._id)
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
                              disabled={
                                row.source === "tikkie" ||
                                allocationCount === undefined
                              }
                              title={
                                row.source === "tikkie"
                                  ? TIKKIE_DELETE_REFUSAL
                                  : allocationCount === undefined
                                    ? ALLOCATION_COUNT_PENDING
                                    : undefined
                              }
                              aria-describedby={
                                row.source === "tikkie" ||
                                allocationCount === undefined
                                  ? DELETE_REFUSAL_DESCRIBED_BY_ID
                                  : undefined
                              }
                              onClick={() => {
                                if (allocationCount === undefined) return
                                selectDonation(row._id)
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
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {/* The delete refusals the row buttons reference; rendered once. */}
              <p id={DELETE_REFUSAL_DESCRIBED_BY_ID} className="sr-only">
                {TIKKIE_DELETE_REFUSAL} {ALLOCATION_COUNT_PENDING}
              </p>
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

        {/* React requires unique keys among siblings. The record panel and the
            two dialogs below are siblings in this list: when all three keyed on
            the bare donation id, opening the Allocate dialog for the selected
            donation duplicated the panel and left stale copies behind (61-01).
            Each key namespaces the ELEMENT, so one donation can host all three. */}
        {selectedRow !== undefined && selectedAllocationCount !== undefined && (
          <DonationRecordPanel
            key={`record-${selectedRow._id}`}
            donationId={selectedRow._id}
            eventId={event._id}
            payerName={selectedRow.payerName}
            amountMinor={selectedRow.amountMinor}
            source={selectedRow.source}
            paidAt={selectedRow.paidAt}
            notes={selectedRow.notes ?? null}
            allocationCount={selectedAllocationCount}
            reloadToken={recordReloadToken}
            allocationSuccess={allocationSuccess}
            onAllocate={() => {
              if (selectedRow === undefined) return
              setAllocationTarget({
                donationId: selectedRow._id,
                payerName: selectedRow.payerName,
                amountMinor: selectedRow.amountMinor,
              })
            }}
            onDelete={() => {
              if (selectedRow === undefined) return
              if (selectedAllocationCount === undefined) return
              setDeleteTarget({
                donationId: selectedRow._id,
                payerName: selectedRow.payerName,
                amountMinor: selectedRow.amountMinor,
                allocationCount: selectedAllocationCount,
              })
            }}
          />
        )}

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
              setRecordReloadToken((token) => token + 1)
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
              setRecordReloadToken((token) => token + 1)
              router.replace(donationsHref(slug))
            }}
          />
        )}
      </div>
    </WorkspaceFrame>
  )
}
