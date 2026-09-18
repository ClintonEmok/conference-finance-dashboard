"use client"

import { Component, useState, type ReactNode } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"

import { Button } from "@/components/ui/button"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { api } from "@/lib/convex/api"
import { usePaymentById } from "@/lib/convex/hooks/payments"
import { buildDonationDeletionSuccess } from "@/lib/dashboard/donation-deletion-copy"
import { donationsHref } from "@/lib/dashboard/workspace-routes"
import { DonationAllocationDialog } from "./donation-allocation-dialog"
import { DonationDeleteDialog } from "./donation-delete-dialog"
import { DonationRecordPanel } from "./donation-record-panel"
import type { Id } from "@/convex/_generated/dataModel"

/**
 * The dedicated donation detail host (Phase 61, D-01).
 *
 * The list stays a list; this route owns the relocated record and the SAME two
 * dialogs. Three properties are load-bearing:
 *
 *   1. The id SHAPE gate runs first and skips the subscription for an id that
 *      is not 32 lowercase alphanumerics, so the common malformed case never
 *      reaches the query.
 *   2. Convex's `v.id("payments")` validator is STRICTER than any static shape:
 *      it checks the id's encoded table number, which is deployment-specific,
 *      so a fabricated or foreign-table URL segment passes the shape gate and
 *      still throws DURING RENDER. A local render-error boundary therefore
 *      catches every read failure and renders a DISTINCT "could not load" state
 *      with a retry — never the not-found state, which would tell the operator a
 *      donation does not exist when the query merely failed.
 *   3. The record renders ONLY for a standalone donation this event owns and
 *      that the event income projection contains. That mirrors the server's
 *      DDEL-03 refusals (non-standalone, cross-event) client-side and keeps the
 *      panel's required `allocationCount` a KNOWN number.
 *
 * No money is derived here: every figure comes from the panel's own server
 * summary or from a dialog's result payload.
 */

const DONATION_ID_PATTERN = /^[a-z0-9]{32}$/

/** One open allocation target — the payment's server fields, nothing derived. */
type AllocationTarget = {
  donationId: Id<"payments">
  payerName: string
  amountMinor: number
}

/**
 * One armed deletion. `allocationCount` is REQUIRED: the target is never armed
 * with an unknown count, so the confirmation can never claim
 * `This removes no allocations.` for a donation that holds some (DDEL-01).
 */
type DeleteTarget = {
  donationId: Id<"payments">
  payerName: string
  amountMinor: number
  allocationCount: number
}

/** The record's way back — one link, three states. */
function BackToDonations({ slug }: { slug: string }) {
  return (
    <Link
      href={donationsHref(slug)}
      className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
    >
      Back to donations
    </Link>
  )
}

/**
 * The TRUE not-found state: the read resolved and this donation is not
 * available for this event (deleted, non-standalone, cross-event, or an id the
 * income projection does not contain). A retry would be a lie — there is
 * nothing to re-issue — so this state offers only the way back.
 */
function DonationNotFound({ slug }: { slug: string }) {
  return (
    <div className="min-w-0 space-y-4">
      <BackToDonations slug={slug} />
      <DashboardQueryState
        state="empty"
        title="Donation not found"
        message="This donation is not available for this event."
      />
    </div>
  )
}

/**
 * The READ-FAILURE state. It must never claim the donation does not exist: the
 * query failed, which says nothing about existence. It offers BOTH a retry and
 * the way back.
 */
function DonationLoadFailed({
  slug,
  onRetry,
}: {
  slug: string
  onRetry: () => void
}) {
  return (
    <div className="min-w-0 space-y-4">
      <BackToDonations slug={slug} />
      <div
        role="alert"
        aria-live="assertive"
        className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium text-destructive">
          We could not load this donation
        </p>
        <p className="text-muted-foreground">
          Something went wrong while loading it. Try again, or go back to the
          donations list.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-lg"
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    </div>
  )
}

/**
 * The contained render-error boundary around the reading surface. It is keyed
 * per donation by its host, so switching donations resets it. Resetting on
 * retry REMOUNTS the children — the inner surface's `useQuery` subscriptions
 * re-issue the read; a cached failure cannot satisfy the retry chain.
 */
class DonationReadBoundary extends Component<
  {
    fallback: (retry: () => void) => ReactNode
    children: ReactNode
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  private retry = () => {
    this.setState({ failed: false })
  }

  render() {
    return this.state.failed
      ? this.props.fallback(this.retry)
      : this.props.children
  }
}

export function DonationDetailSurface({
  slug,
  donationId,
}: {
  slug: string
  donationId: string
}) {
  return (
    <DonationReadBoundary
      key={`read-${donationId}`}
      fallback={(retry) => <DonationLoadFailed slug={slug} onRetry={retry} />}
    >
      <DonationDetailSurfaceInner slug={slug} donationId={donationId} />
    </DonationReadBoundary>
  )
}

function DonationDetailSurfaceInner({
  slug,
  donationId,
}: {
  slug: string
  donationId: string
}) {
  const { event } = useEventDashboard()

  const isValidDonationId = DONATION_ID_PATTERN.test(donationId)
  const payment = usePaymentById(
    isValidDonationId ? (donationId as Id<"payments">) : null
  )
  const income = useQuery(api.donations.getEventDonationIncome, {
    eventId: event._id,
  })

  const [allocationSuccess, setAllocationSuccess] = useState<{
    allocatedTotalMinor: number
    leftoverMinor: number
  } | null>(null)
  const [deletionSuccess, setDeletionSuccess] = useState<{
    allocationCount: number
  } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [allocationTarget, setAllocationTarget] =
    useState<AllocationTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  // TRI-STATE: `income === undefined` means the projection has not resolved
  // yet. The entry is the record's readiness gate — the panel's `allocationCount`
  // prop is required and is never fabricated from an unresolved projection.
  const incomeRow =
    income === undefined
      ? undefined
      : income.donations.find(
          (entry) => String(entry.donationId) === donationId
        )
  const allocationCount =
    incomeRow === undefined ? undefined : incomeRow.allocationCount

  // A malformed id must never reach the query — Convex argument validation
  // would throw (the containing boundary would catch it) instead of this state.
  if (!isValidDonationId) {
    return <DonationNotFound slug={slug} />
  }

  if (payment === undefined || income === undefined) {
    return <DashboardQueryState state="loading" />
  }

  if (payment === null) {
    // A deletion completed on this route: the payment row is gone, so report
    // DDEL-02's reversal here rather than bouncing back to the list.
    if (deletionSuccess !== null) {
      return (
        <div className="min-w-0 space-y-4">
          <BackToDonations slug={slug} />
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
          >
            {buildDonationDeletionSuccess({
              allocationCount: deletionSuccess.allocationCount,
            })}
          </div>
        </div>
      )
    }

    return <DonationNotFound slug={slug} />
  }

  const isStandaloneDonation = payment.donationKind === "standalone"
  const belongsToEvent = String(payment.eventId) === String(event._id)

  if (
    !isStandaloneDonation ||
    !belongsToEvent ||
    allocationCount === undefined
  ) {
    return <DonationNotFound slug={slug} />
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackToDonations slug={slug} />
      </div>

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

      <DonationRecordPanel
        key={`record-${donationId}`}
        donationId={payment._id}
        eventId={event._id}
        payerName={payment.payerName}
        amountMinor={payment.amountMinor}
        source={payment.source}
        paidAt={payment.paidAt}
        notes={payment.notes ?? null}
        allocationCount={allocationCount}
        reloadToken={reloadToken}
        allocationSuccess={allocationSuccess}
        onAllocate={() => {
          setAllocationTarget({
            donationId: payment._id,
            payerName: payment.payerName,
            amountMinor: payment.amountMinor,
          })
        }}
        onDelete={() => {
          setDeleteTarget({
            donationId: payment._id,
            payerName: payment.payerName,
            amountMinor: payment.amountMinor,
            allocationCount,
          })
        }}
      />

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
            setReloadToken((token) => token + 1)
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
            setReloadToken((token) => token + 1)
          }}
        />
      )}
    </div>
  )
}
