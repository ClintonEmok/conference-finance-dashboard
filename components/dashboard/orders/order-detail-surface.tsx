"use client"

import { useEffect, useMemo, useState } from "react"
import { useAction, useConvexAuth, useQuery } from "convex/react"

import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { api } from "@/lib/convex/api"
import { useUnassignPayment } from "@/lib/convex/hooks/payments"
import type { Id } from "@/convex/_generated/dataModel"
import { AssignPaymentSheet } from "@/app/dashboard/manage-orders/[orderId]/assign-payment-sheet"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import {
  DonationAllocationDialog,
  type DonationAllocationInitialOrder,
} from "@/components/dashboard/finance/donation-allocation-dialog"
import { formatMoney } from "@/lib/format"
import { OrderSummaryPanel } from "./panels/order-summary-panel"
import { OrderActionsPanel } from "./panels/order-actions-panel"
import { OrderDetailsPanel, type OrderEditDraft } from "./panels/order-details-panel"
import { AttendeesPanel } from "./panels/attendees-panel"
import {
  PaymentsPanel,
  type OrderAllocationRow,
  type OrderPaymentRow,
} from "./panels/payments-panel"
import { MergeOrderDialog } from "./panels/merge-order-dialog"
import {
  AllocateDonationToOrder,
  type AllocateDonationChoice,
} from "./panels/allocate-donation-to-order"

type PageProps = {
  slug: string
  orderId: string
  event: EventDashboardEvent
}

type OrderAttendeePayload = {
  order: {
    id: string
    providerOrderId: string | null
    bookerName: string | null
    bookerEmail: string | null
    bookingRef: string | null
    eventId: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending" | null
    isArchived?: boolean
    archivedAt: string | null
    archiveReason: string | null
    amountDueMinor: number | null
    totalAmountMinor: number | null
    orderedAt: string | null
  }
  attendees: Array<{
    id: string
    name: string
    email: string | null
    roommatePreference: string | null
    roommateAvoid: string | null
    ticketTypeLabel: string
    normalizedStatus: string
    amountDueMinor: number
    // Phase 56 server-owned per-attendee money: the panel renders these
    // verbatim and never re-derives them from the payments list.
    paidAmountMinor: number
    outstandingAmountMinor: number
  }>
}

type PaymentsPayload = {
  payments: Array<{
    id: string
    source: "tikkie" | "bank_transfer" | "cash"
    payerName: string
    amountMinor: number
    paidAt: string
    status: OrderPaymentRow["status"]
    donationKind: "overpayment" | "standalone" | null
    orderId: string | null
    reference: string | null
    notes: string | null
  }>
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toISOString().slice(0, 16)
}

function parseDatetimeLocalValue(value: string) {
  if (!value.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid orderedAt. Expected a valid date/time.")
  }
  return parsed.toISOString()
}

function parseMinorUnitInput(value: string, field: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Invalid ${field}. Expected a non-negative whole number in minor units.`
    )
  }
  return parsed
}

export function OrderDetailSurface({ slug, orderId: rawOrderId, event }: PageProps) {
  const orderId = rawOrderId.trim()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const canQueryProtectedData = isAuthenticated && !authLoading
  const payload = useQuery(
    api.orders.getOrderWithAttendees,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip"
  )
  const paymentDocs = useQuery(
    api.payments.getPayments,
    orderId && canQueryProtectedData ? { orderId } : "skip"
  )
  // D-07: the canonical balance and the order's recorded allocation rows come
  // from the server's one owner (`getOrderAllocationLedger` →
  // `loadCanonicalOrderBalances`). This surface renders fields; it derives
  // nothing from the payments list.
  const ledger = useQuery(
    api.orders.getOrderAllocationLedger,
    orderId && canQueryProtectedData
      ? { orderId: orderId as Id<"orders">, eventId: event._id }
      : "skip"
  )
  const unassignPayment = useUnassignPayment()
  const resendOrderConfirmation = useAction(
    api.emailActions.resendOrderConfirmation
  )

  const [isAssignSheetOpen, setIsAssignSheetOpen] = useState(false)
  const [isUnassigningId, setIsUnassigningId] = useState<string | null>(null)
  const [unassignError, setUnassignError] = useState<string | null>(null)
  const [isResendingEmail, setIsResendingEmail] = useState(false)
  const [isResendDialogOpen, setIsResendDialogOpen] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [resendErrorMessage, setResendErrorMessage] = useState<string | null>(
    null
  )
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [orderSaveError, setOrderSaveError] = useState<string | null>(null)
  const [isEditingOrder, setIsEditingOrder] = useState(false)
  const [orderEditDraft, setOrderEditDraft] = useState<OrderEditDraft | null>(
    null
  )
  const hasAssignedPayments = (paymentDocs?.length ?? 0) > 0

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false)

  // D-02: the order-entry allocation session. The chooser picks a donation,
  // the shared editor receives this order's public identity, and the dialog's
  // own result feeds the status band.
  const [isAllocateChooserOpen, setIsAllocateChooserOpen] = useState(false)
  const [allocationDonation, setAllocationDonation] =
    useState<AllocateDonationChoice | null>(null)
  const [allocationSuccess, setAllocationSuccess] = useState<{
    allocatedTotalMinor: number
    leftoverMinor: number
  } | null>(null)

  const orderPayload = (payload ?? null) as OrderAttendeePayload | null

  // The order-first seam: only order-facing identity crosses into the shared
  // editor. `undefined` until the order payload resolves; the editor treats an
  // absent prop as an unselected donation-side session.
  const orderIdentity = useMemo<DonationAllocationInitialOrder | undefined>(
    () =>
      orderPayload
        ? {
            orderId: orderPayload.order.id as Id<"orders">,
            bookingRef: orderPayload.order.bookingRef,
            providerOrderId: orderPayload.order.providerOrderId,
            bookerName: orderPayload.order.bookerName,
            bookerEmail: orderPayload.order.bookerEmail,
          }
        : undefined,
    [orderPayload]
  )

  useEffect(() => {
    if (!orderPayload) return

    setOrderEditDraft({
      bookerName: orderPayload.order.bookerName ?? "",
      bookerEmail: orderPayload.order.bookerEmail ?? "",
      normalizedStatus: orderPayload.order.normalizedStatus ?? "pending",
      totalAmountMinor:
        orderPayload.order.totalAmountMinor === null
          ? ""
          : String(orderPayload.order.totalAmountMinor),
      orderedAt: toDatetimeLocalValue(orderPayload.order.orderedAt),
    })
  }, [orderPayload])

  const payments = useMemo<OrderPaymentRow[]>(
    () =>
      (paymentDocs ?? [])
        .map((payment) => ({
          id: payment._id,
          source: payment.source,
          payerName: payment.payerName,
          amountMinor: payment.amountMinor,
          paidAt: new Date(payment.paidAt).toISOString(),
          status: payment.status ?? null,
          donationKind: payment.donationKind ?? null,
          orderId: payment.orderId ?? null,
          reference: payment.reference ?? null,
          notes: payment.notes ?? null,
        }))
        .sort(
          (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
        ),
    [paymentDocs]
  )

  const isLoading =
    payload === undefined || paymentDocs === undefined || ledger === undefined
  const eventOrderMismatch =
    payload !== undefined &&
    payload !== null &&
    String(payload.order.eventId) !== String(event?._id)

  const canResendConfirmation = Boolean(
    orderPayload?.order.bookerEmail && orderPayload?.order.bookingRef
  )

  // D-07: every figure is a FIELD of the server's canonical balance
  // (`getOrderAllocationLedger` → `loadCanonicalOrderBalances`), passed
  // through verbatim. A local payments reduce used to live here and excluded
  // donation allocation credit entirely — the second-owner defect this
  // replaced. The surface performs no money arithmetic of its own: whatever
  // a figure needs, the read already computed it.
  const metrics = useMemo(() => {
    const balances = ledger?.balances ?? null
    return {
      amountDueMinor: balances?.amountDueMinor ?? null,
      paidAmountMinor: balances?.paidAmountMinor ?? null,
      outstandingAmountMinor: balances?.outstandingAmountMinor ?? null,
      donationAmountMinor: balances?.donationAmountMinor ?? null,
      coverage: ledger?.coveragePercent ?? null,
      hasKnownDue: balances !== null,
      attendeeCount: orderPayload?.attendees.length ?? 0,
      sharedOutstandingPerAttendeeMinor:
        ledger?.sharedOutstandingPerAttendeeMinor ?? null,
    }
  }, [ledger, orderPayload])

  // Display mapping only: whole-order rows deliberately stay order-facing so
  // the server's private anchor cannot become an operator label. Legacy
  // event-charge rows retain their attendee-facing lookup. No money is computed
  // here.
  const allocationRows: OrderAllocationRow[] = useMemo(
    () =>
      (ledger?.allocationRows ?? []).map((row) => ({
        donationId: row.donationId,
        attendeeId: row.attendeeId,
        attendeeName:
          row.scope === "whole_order"
            ? "Whole-order credit"
            : orderPayload?.attendees.find(
                (attendee) => String(attendee.id) === String(row.attendeeId)
              )?.name ?? String(row.attendeeId),
        amountMinor: row.amountMinor,
        scope: row.scope,
        recordedAt: new Date(row.recordedAt).toISOString(),
      })),
    [ledger, orderPayload]
  )

  async function resendConfirmationEmail() {
    if (!orderId || !canResendConfirmation) return
    setIsResendDialogOpen(false)

    setIsResendingEmail(true)
    setResendMessage(null)
    setResendErrorMessage(null)

    try {
      const result = await resendOrderConfirmation({
        orderId: orderId as Id<"orders">,
      })

      if (!result.success) {
        setResendErrorMessage(result.error ?? "Failed to send confirmation email.")
        return
      }

      setResendMessage(
        orderPayload?.order.bookerEmail
          ? `Confirmation email sent to ${orderPayload.order.bookerEmail}.`
          : "Confirmation email sent."
      )
    } catch (error) {
      setResendErrorMessage(
        error instanceof Error ? error.message : "Failed to send confirmation email."
      )
    } finally {
      setIsResendingEmail(false)
    }
  }

  async function saveOrderDetails() {
    if (!orderId || !orderPayload || !orderEditDraft) return

    setIsSavingOrder(true)
    setOrderSaveError(null)

    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(orderId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookerName: orderEditDraft.bookerName || null,
            bookerEmail: orderEditDraft.bookerEmail || null,
            normalizedStatus: orderEditDraft.normalizedStatus,
            totalAmountMinor: parseMinorUnitInput(
              orderEditDraft.totalAmountMinor,
              "totalAmountMinor"
            ),
            orderedAt: parseDatetimeLocalValue(orderEditDraft.orderedAt),
          }),
        }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to save order details.")
      }

      setIsEditingOrder(false)
    } catch (error) {
      setOrderSaveError(
        error instanceof Error ? error.message : "Failed to save order details."
      )
    } finally {
      setIsSavingOrder(false)
    }
  }

  const canDeleteOrder = useMemo(() => {
    if (!orderPayload) return false
    return (
      orderPayload.order.isArchived === true ||
      orderPayload.order.normalizedStatus === "cancelled"
    )
  }, [orderPayload])

  async function deleteOrder() {
    if (!orderId) return

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(orderId)}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setDeleteError(body?.error?.message ?? "Failed to delete order.")
        return
      }

      window.location.assign(`/dashboard/events/${slug}/orders`)
    } catch {
      setDeleteError("Network error while deleting order.")
    } finally {
      setIsDeleting(false)
    }
  }

  function unassignPaymentById(paymentId: string) {
    setIsUnassigningId(paymentId)
    setUnassignError(null)
    unassignPayment({ paymentId: paymentId as Id<"payments"> })
      .catch((error) => {
        setUnassignError(
          error instanceof Error ? error.message : "Failed to unlink payment."
        )
      })
      .finally(() => setIsUnassigningId(null))
  }

  if (!orderId) {
    return <DashboardQueryState state="unavailable" message="This order link is unavailable." className="rounded-xl border border-border/60 bg-card p-6" />
  }

  if (isLoading) {
    return <DashboardQueryState state="loading" className="rounded-xl border border-border/60 bg-card p-6" />
  }

  if (orderPayload === null || eventOrderMismatch) {
    return <DashboardQueryState state="empty" title="Order not found" message="This order could not be loaded for this event." className="rounded-xl border border-border/60 bg-card p-6" />
  }

  return (
    <div className="min-w-0 animate-in space-y-8 duration-700 fade-in slide-in-from-bottom-4">
      <OrderSummaryPanel
        order={orderPayload.order}
        eventTitle={event.title}
        currency={event.currency}
        slug={slug}
        metrics={metrics}
        hasAssignedPayments={hasAssignedPayments}
        canDeleteOrder={canDeleteOrder}
         isRemoving={isDeleting}
         removeErrorMessage={deleteError}
         onRemoveOrder={() => {
           setDeleteError(null)
           setIsDeleteDialogOpen(true)
         }}
        actions={
          <OrderActionsPanel
            canResendConfirmation={canResendConfirmation}
            isResendingEmail={isResendingEmail}
            resendMessage={resendMessage}
            resendErrorMessage={resendErrorMessage}
            onResendConfirmation={() => void resendConfirmationEmail()}
            isResendDialogOpen={isResendDialogOpen}
            onOpenResendDialog={() => setIsResendDialogOpen(true)}
            onCloseResendDialog={() => setIsResendDialogOpen(false)}
            isDeleteDialogOpen={isDeleteDialogOpen}
            onOpenDeleteDialog={() => {
              setDeleteError(null)
              setIsDeleteDialogOpen(true)
            }}
            onCloseDeleteDialog={() => {
              setIsDeleteDialogOpen(false)
              setDeleteError(null)
            }}
            isDeleting={isDeleting}
            deleteError={deleteError}
            onDelete={() => void deleteOrder()}
            onOpenMergeDialog={() => setIsMergeDialogOpen(true)}
            onOpenAllocateDialog={() => {
              setAllocationSuccess(null)
              setIsAllocateChooserOpen(true)
            }}
          />
        }
      />

      {allocationSuccess !== null && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
        >
          Allocation recorded.{" "}
           {formatMoney(allocationSuccess.allocatedTotalMinor, event.currency)} allocated;{" "}
           {formatMoney(allocationSuccess.leftoverMinor, event.currency)} left unallocated.
        </div>
      )}

      <OrderDetailsPanel
        order={orderPayload.order}
        isEditingOrder={isEditingOrder}
        onToggleEditing={() => setIsEditingOrder((current) => !current)}
        orderEditDraft={orderEditDraft}
        onDraftChange={(patch) =>
          setOrderEditDraft((current) =>
            current ? { ...current, ...patch } : current
          )
        }
        isSavingOrder={isSavingOrder}
        orderSaveError={orderSaveError}
        onSave={() => void saveOrderDetails()}
      />

      <div className="grid gap-8 lg:grid-cols-5">
        <AttendeesPanel
          attendees={orderPayload.attendees.map((attendee) => ({
            id: attendee.id,
            name: attendee.name,
            email: attendee.email,
            ticketTypeLabel: attendee.ticketTypeLabel,
            amountDueMinor: attendee.amountDueMinor,
            paidAmountMinor: attendee.paidAmountMinor,
            outstandingAmountMinor: attendee.outstandingAmountMinor,
          }))}
          slug={slug}
          eventId={String(event?._id ?? "")}
           orderId={orderId}
           bookingRef={orderPayload.order.bookingRef}
           currency={event.currency}
           onSaved={() => undefined}
        />

        <PaymentsPanel
           payments={payments}
           allocations={allocationRows}
           currency={event.currency}
           hasKnownDue={metrics.hasKnownDue}
          isUnassigningId={isUnassigningId}
          unassignError={unassignError}
          onOpenAssignSheet={() => setIsAssignSheetOpen(true)}
          onUnassign={(paymentId) => unassignPaymentById(paymentId)}
        />
      </div>

      {orderId && metrics && metrics.hasKnownDue && metrics.outstandingAmountMinor !== null && (
        <AssignPaymentSheet
          open={isAssignSheetOpen}
          onOpenChange={setIsAssignSheetOpen}
          orderId={orderId}
           outstandingAmountMinor={metrics.outstandingAmountMinor}
           bookerName={orderPayload?.order.bookerName ?? undefined}
           currency={event.currency}
         />
      )}

      <MergeOrderDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        orderId={orderId}
        slug={slug}
        eventId={String(event?._id ?? "")}
        currency={event.currency}
      />

      <AllocateDonationToOrder
        open={isAllocateChooserOpen}
        onOpenChange={setIsAllocateChooserOpen}
        eventId={event._id}
        currency={event.currency}
        onSelect={(donation) => {
          setIsAllocateChooserOpen(false)
          setAllocationSuccess(null)
          setAllocationDonation(donation)
        }}
      />

      {allocationDonation !== null && (
        <DonationAllocationDialog
          key={`allocation-${allocationDonation.donationId}`}
          open
          onOpenChange={(next) => {
            if (!next) setAllocationDonation(null)
          }}
          donationId={allocationDonation.donationId}
          eventId={event._id}
          payerName={allocationDonation.payerName}
          amountMinor={allocationDonation.amountMinor}
          currency={event.currency}
           initialOrder={orderIdentity}
          onAllocated={(result) => {
            setAllocationSuccess(result)
            setAllocationDonation(null)
          }}
        />
      )}
    </div>
  )
}
