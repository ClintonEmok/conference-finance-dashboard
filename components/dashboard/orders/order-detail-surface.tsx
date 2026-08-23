"use client"

import { useEffect, useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"

import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { api } from "@/lib/convex/api"
import { useUnassignPayment } from "@/lib/convex/hooks/payments"
import {
  deriveBalanceAmounts,
  isOrderAppliedPayment,
} from "@/lib/domain/finance/amounts"
import type { Id } from "@/convex/_generated/dataModel"
import { AssignPaymentSheet } from "@/app/dashboard/manage-orders/[orderId]/assign-payment-sheet"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import { OrderSummaryPanel } from "./panels/order-summary-panel"
import { OrderActionsPanel } from "./panels/order-actions-panel"
import { OrderDetailsPanel, type OrderEditDraft } from "./panels/order-details-panel"
import { AttendeesPanel } from "./panels/attendees-panel"
import { PaymentsPanel, type OrderPaymentRow } from "./panels/payments-panel"
import { MergeOrderDialog } from "./panels/merge-order-dialog"

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
  const payload = useQuery(
    api.orders.getOrderWithAttendees,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip"
  )
  const paymentDocs = useQuery(
    api.payments.getPayments,
    orderId ? { orderId } : "skip"
  )
  const unassignPayment = useUnassignPayment()
  const resendOrderConfirmation = useAction(
    api.emailActions.resendOrderConfirmation
  )

  const [isRemoving, setIsRemoving] = useState(false)
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(
    null
  )
  const [isAssignSheetOpen, setIsAssignSheetOpen] = useState(false)
  const [isUnassigningId, setIsUnassigningId] = useState<string | null>(null)
  const [unassignError, setUnassignError] = useState<string | null>(null)
  const [isResendingEmail, setIsResendingEmail] = useState(false)
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

  const orderPayload = (payload ?? null) as OrderAttendeePayload | null

  useEffect(() => {
    if (!orderPayload) return

    setOrderEditDraft({
      bookerName: orderPayload.order.bookerName ?? "",
      bookerEmail: orderPayload.order.bookerEmail ?? "",
      bookingRef: orderPayload.order.bookingRef ?? "",
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

  const isLoading = payload === undefined || paymentDocs === undefined
  const eventOrderMismatch =
    payload !== undefined &&
    payload !== null &&
    String(payload.order.eventId) !== String(event?._id)

  const canResendConfirmation = Boolean(
    orderPayload?.order.bookerEmail && orderPayload?.order.bookingRef
  )

  const metrics = useMemo(() => {
    const amountDueMinor = typeof orderPayload?.order.amountDueMinor === "number"
      ? orderPayload.order.amountDueMinor
      : null
    const hasKnownDue = amountDueMinor !== null
    const matchedPayments = payments.filter(
      (payment) =>
        isOrderAppliedPayment(payment)
    )
    const paidAmountMinor = matchedPayments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0
    )

    const balance = deriveBalanceAmounts(amountDueMinor, paidAmountMinor)
    const coverage =
      amountDueMinor !== null && amountDueMinor > 0
        ? Math.min(100, Math.round((paidAmountMinor / amountDueMinor) * 100))
        : amountDueMinor === 0
          ? 100
          : null

    const attendeeCount = orderPayload?.attendees.length ?? 0
    const sharedOutstandingPerAttendeeMinor =
      hasKnownDue && attendeeCount > 0
        ? Math.ceil(balance.outstandingAmountMinor / attendeeCount)
        : null

    return {
      amountDueMinor: hasKnownDue ? balance.amountDueMinor : null,
      paidAmountMinor: balance.appliedAmountMinor,
      outstandingAmountMinor: hasKnownDue ? balance.outstandingAmountMinor : null,
      donationAmountMinor: hasKnownDue ? balance.donationAmountMinor : null,
      coverage,
      hasKnownDue,
      attendeeCount,
      sharedOutstandingPerAttendeeMinor,
    }
  }, [orderPayload, payments])

  async function resendConfirmationEmail() {
    if (!orderId || !canResendConfirmation) return

    const confirmed = window.confirm(
      "Resend the booking confirmation email to this customer?"
    )
    if (!confirmed) return

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
            bookingRef: orderEditDraft.bookingRef || null,
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

      window.location.reload()
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

  async function removeOrderLocally() {
    if (!orderId || !canDeleteOrder) return

    const confirmed = window.confirm(
      "Permanently delete this order? Attached payments will be unassigned and attendee records will be deleted. This cannot be undone."
    )
    if (!confirmed) return

    setIsRemoving(true)
    setRemoveErrorMessage(null)

    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(orderId)}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setRemoveErrorMessage(body?.error?.message ?? "Failed to remove order.")
        return
      }

      window.location.assign(`/dashboard/events/${slug}/orders`)
    } catch {
      setRemoveErrorMessage("Network error while removing order.")
    } finally {
      setIsRemoving(false)
    }
  }

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
        slug={slug}
        metrics={metrics}
        hasAssignedPayments={hasAssignedPayments}
        canDeleteOrder={canDeleteOrder}
        isRemoving={isRemoving}
        removeErrorMessage={removeErrorMessage}
        onRemoveOrder={() => void removeOrderLocally()}
        actions={
          <OrderActionsPanel
            canResendConfirmation={canResendConfirmation}
            isResendingEmail={isResendingEmail}
            resendMessage={resendMessage}
            resendErrorMessage={resendErrorMessage}
            onResendConfirmation={() => void resendConfirmationEmail()}
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
          />
        }
      />

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
          }))}
          slug={slug}
          eventId={String(event?._id ?? "")}
          orderId={orderId}
          bookingRef={orderPayload.order.bookingRef}
          onSaved={() => window.location.reload()}
        />

        <PaymentsPanel
          payments={payments}
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
        />
      )}

      <MergeOrderDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        orderId={orderId}
        slug={slug}
        eventId={String(event?._id ?? "")}
      />
    </div>
  )
}
