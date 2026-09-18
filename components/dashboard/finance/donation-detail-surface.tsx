"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "convex/react"

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
 * dialogs. Two properties are load-bearing:
 *
 *   1. The id SHAPE gate runs FIRST. `donationId` is a free URL segment, and a
 *      malformed id handed to `api.payments.getPaymentById` would throw Convex's
 *      argument validation DURING RENDER — into the route error boundary,
 *      bypassing the promised not-found state. The surface therefore skips the
 *      subscription for a malformed id and renders the not-found state.
 *   2. The record renders ONLY for a standalone donation this event owns and
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

export function DonationDetailSurface({
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

  const backLink = (
    <Link
      href={donationsHref(slug)}
      className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
    >
      Back to donations
    </Link>
  )

  const notFoundState = (
    <div className="min-w-0 space-y-4">
      {backLink}
      <DashboardQueryState
        state="empty"
        title="Donation not found"
        message="This donation could not be loaded for this event."
      />
    </div>
  )

  // A malformed id must never reach the query — Convex argument validation
  // would throw into the error boundary instead of this state.
  if (!isValidDonationId) {
    return notFoundState
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
          {backLink}
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

    return notFoundState
  }

  const isStandaloneDonation = payment.donationKind === "standalone"
  const belongsToEvent = String(payment.eventId) === String(event._id)

  if (
    !isStandaloneDonation ||
    !belongsToEvent ||
    allocationCount === undefined
  ) {
    return notFoundState
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backLink}
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
