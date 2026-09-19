"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { PaymentCard } from "@/components/payments/payment-card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Doc } from "@/convex/_generated/dataModel"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import { reconciliationHref } from "@/lib/dashboard/workspace-routes"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import { formatMoney } from "@/lib/format"
import {
  useDeletePayment,
  useMarkPaymentAsDonation,
  usePayments,
  useUnassignedPayments,
} from "@/lib/convex/hooks/payments"

export type PaymentRow = Doc<"payments">

export default function EventPaymentsPage({
  slug,
  event,
  unassignedPayments: parentUnassignedPayments,
}: {
  slug: string
  event: EventDashboardEvent
  unassignedPayments?: AttentionQueryState<ReadonlyArray<PaymentRow>>
}) {
  const eventPayments = usePayments(event?._id ? { eventId: event._id } : undefined) as
    | PaymentRow[]
    | undefined
  const fallbackUnassignedPayments = useUnassignedPayments(!parentUnassignedPayments) as
    | PaymentRow[]
    | undefined
  const unassignedState = parentUnassignedPayments ?? (
    fallbackUnassignedPayments === undefined
      ? { status: "pending" as const }
      : { status: "ready" as const, data: fallbackUnassignedPayments }
  )
  const markAsDonation = useMarkPaymentAsDonation()
  const deletePayment = useDeletePayment()
  const [busyPaymentId, setBusyPaymentId] = useState<PaymentRow["_id"] | null>(null)
  const [successPaymentId, setSuccessPaymentId] = useState<PaymentRow["_id"] | null>(null)
  const [deletedPaymentId, setDeletedPaymentId] = useState<PaymentRow["_id"] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{
    action: "donation" | "delete"
    payment: PaymentRow
  } | null>(null)

  async function handleMarkDonation(payment: PaymentRow) {
    if (!event?._id) return

    setBusyPaymentId(payment._id)
    setErrorMessage(null)
    setSuccessPaymentId(null)
    setDeletedPaymentId(null)

    try {
      await markAsDonation({
        paymentId: payment._id,
        eventId: event._id,
      })
      setSuccessPaymentId(payment._id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to mark donation")
    } finally {
      setBusyPaymentId(null)
    }
  }

  async function handleDeletePayment(payment: PaymentRow) {
    if (!event?._id || payment.eventId !== event._id) return
    if (
      payment.status !== "unassigned" ||
      (payment.source !== "cash" && payment.source !== "bank_transfer") ||
      payment.orderId !== undefined ||
      payment.donationKind !== undefined
    ) {
      return
    }

    setBusyPaymentId(payment._id)
    setErrorMessage(null)
    setSuccessPaymentId(null)
    setDeletedPaymentId(null)

    try {
      await deletePayment({ paymentId: payment._id, eventId: event._id })
      setDeletedPaymentId(payment._id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete payment")
    } finally {
      setBusyPaymentId(null)
    }
  }

  if (eventPayments === undefined || unassignedState.status === "pending") {
    return (
      <DashboardQueryState state="loading" className="rounded-xl border border-border/60 bg-card p-6" />
    )
  }

  if (unassignedState.status === "error") {
    return <DashboardQueryState state="error" message={unassignedState.message} className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" />
  }

  // Standalone donations have their own operator surface (`/donations`, the
  // Phase 58 dedicated page), so a row for one here duplicates a record the
  // operator already sees there. `overpayment` rows stay: they are order
  // payments whose excess was treated as a donation, so they belong on the
  // order-linked list and have no home on `/donations`.
  const linkedPayments = (eventPayments ?? []).filter(
    (payment) => payment.donationKind !== "standalone"
  )
  const pendingDonations = unassignedState.data

  return (
    <>
      <div className="min-w-0 space-y-6">
      {errorMessage && (
        <div role="alert" aria-live="assertive" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}
      {successPaymentId && (
        <p role="status" aria-live="polite" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          Payment marked as a donation.
        </p>
      )}
      {deletedPaymentId && (
        <p role="status" aria-live="polite" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          Payment deleted.
        </p>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">Unassigned payments</CardTitle>
              <CardDescription>Choose an order to link these payments, or mark one as a donation.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-bold uppercase">
              <Link href={reconciliationHref(slug)}>
                Choose an order
                <ArrowRight className="ml-2 size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
              <p className="font-semibold text-foreground">How to assign a payment</p>
              <p className="mt-1 text-muted-foreground">
                Open Reconciliation, select the outstanding order, then choose <span className="font-medium text-foreground">Link Existing</span> and click <span className="font-medium text-foreground">Assign to order</span>.
              </p>
            </div>
            {pendingDonations.length === 0 ? (
              <DashboardQueryState state="empty" message="No unassigned payments right now." className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6" />
            ) : (
              pendingDonations.map((payment) => (
                <PaymentCard
                  key={payment._id}
                  payment={payment}
                  currency={event.currency}
                  actions={
                    <>
                      <Button
                        size="sm"
                        className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                        onClick={() => setConfirmation({ action: "donation", payment })}
                        disabled={busyPaymentId === payment._id}
                      >
                        {busyPaymentId === payment._id ? (
                            <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" />
                        ) : successPaymentId === payment._id ? (
                            <CheckCircle2 className="mr-2 size-3.5" aria-hidden="true" />
                        ) : null}
                        {successPaymentId === payment._id ? "Done" : "Mark donation"}
                      </Button>
                      <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                        <Link href={reconciliationHref(slug)}>Match order</Link>
                      </Button>
                    </>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Payments</CardTitle>
            <CardDescription>Payments linked to this event.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            {linkedPayments.length === 0 ? (
              <DashboardQueryState state="empty" message="No payments linked yet." className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6" />
            ) : (
               linkedPayments.map((payment) => (
                  <PaymentCard
                    key={payment._id}
                    payment={payment}
                    currency={event.currency}
                    orderLink={payment.orderId ?? undefined}
                   actions={
                     payment.eventId === event._id &&
                     payment.status === "unassigned" &&
                     (payment.source === "cash" || payment.source === "bank_transfer") &&
                     payment.orderId === undefined &&
                     payment.donationKind === undefined ? (
                       <Button
                         type="button"
                         variant="destructive"
                         size="sm"
                         className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                          onClick={() => setConfirmation({ action: "delete", payment })}
                         disabled={busyPaymentId === payment._id}
                       >
                         {busyPaymentId === payment._id ? (
                           <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" />
                         ) : (
                           <Trash2 className="mr-2 size-3.5" aria-hidden="true" />
                         )}
                         Delete payment
                       </Button>
                     ) : undefined
                   }
                 />
               ))
            )}
          </CardContent>
        </Card>
      </div>
      </div>

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && busyPaymentId === null) setConfirmation(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action === "donation"
                ? "Mark payment as a donation?"
                : "Delete this payment?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.action === "donation"
                 ? `Mark the ${formatMoney(confirmation.payment.amountMinor, event.currency)} payment from ${confirmation.payment.payerName || "this payer"} as a standalone donation? It will leave the Payments list.`
                : `Delete this ${confirmation?.payment.source === "cash" ? "cash" : "bank transfer"} payment? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busyPaymentId !== null}>
                Keep payment
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={confirmation?.action === "delete" ? "destructive" : "default"}
              disabled={busyPaymentId !== null}
              onClick={() => {
                if (!confirmation) return
                const next = confirmation
                setConfirmation(null)
                if (next.action === "donation") void handleMarkDonation(next.payment)
                else void handleDeletePayment(next.payment)
              }}
            >
              {confirmation?.action === "donation" ? "Mark donation" : "Delete payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
