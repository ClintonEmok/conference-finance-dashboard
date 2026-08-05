"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { PaymentCard } from "@/components/payments/payment-card"
import type { Doc } from "@/convex/_generated/dataModel"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import { financeHref } from "@/lib/dashboard/workspace-routes"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import {
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
  const [busyPaymentId, setBusyPaymentId] = useState<PaymentRow["_id"] | null>(null)
  const [successPaymentId, setSuccessPaymentId] = useState<PaymentRow["_id"] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleMarkDonation(paymentId: PaymentRow["_id"]) {
    if (!event?._id) return

    setBusyPaymentId(paymentId)
    setErrorMessage(null)
    setSuccessPaymentId(null)

    try {
      await markAsDonation({
        paymentId,
        eventId: event._id,
      })
      setSuccessPaymentId(paymentId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to mark donation")
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

  const linkedPayments = eventPayments ?? []
  const pendingDonations = unassignedState.data

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Payment operations</p>
          <p className="text-xs text-muted-foreground">Event-linked payments plus the global unmatched inbox.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-bold uppercase">
          <Link href={financeHref(slug, "reconciliation")}>
            Match a payment
            <ArrowRight className="ml-2 size-3" />
          </Link>
        </Button>
      </div>
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

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">Unassigned payments</CardTitle>
              <CardDescription>Choose an order to link these payments, or mark one as a donation.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-bold uppercase">
              <Link href={financeHref(slug, "reconciliation")}>
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
                  actions={
                    <>
                      <Button
                        size="sm"
                        className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                        onClick={() => void handleMarkDonation(payment._id)}
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
                        <Link href={`/dashboard/events/${slug}/reconciliation`}>Match order</Link>
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
            <CardTitle className="text-lg font-bold">Event payments</CardTitle>
            <CardDescription>All payments already linked to this event, including donations.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            {linkedPayments.length === 0 ? (
              <DashboardQueryState state="empty" message="No linked payments yet." className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6" />
            ) : (
              linkedPayments.map((payment) => (
                <PaymentCard
                  key={payment._id}
                  payment={payment}
                  orderLink={payment.orderId ?? undefined}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
