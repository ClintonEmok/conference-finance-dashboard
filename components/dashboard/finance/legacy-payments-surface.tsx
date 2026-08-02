"use client"

import Link from "next/link"
import { use, useState } from "react"
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PaymentCard } from "@/components/payments/payment-card"
import type { Doc } from "@/convex/_generated/dataModel"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import {
  useMarkPaymentAsDonation,
  usePayments,
  useUnassignedPayments,
} from "@/lib/convex/hooks/payments"

type PaymentRow = Doc<"payments">

export default function EventPaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const eventPayments = usePayments(event?._id ? { eventId: event._id } : undefined) as
    | PaymentRow[]
    | undefined
  const unassignedPayments = useUnassignedPayments() as PaymentRow[] | undefined
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

  if (event === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">The slug &ldquo;{slug}&rdquo; does not exist.</p>
      </div>
    )
  }

  if (event === undefined || eventPayments === undefined || unassignedPayments === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  const linkedPayments = eventPayments ?? []
  const pendingDonations = unassignedPayments ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Payment operations</p>
          <p className="text-xs text-muted-foreground">Event-linked payments plus the global unmatched inbox.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-bold uppercase">
          <Link href={`/dashboard/events/${slug}/reconciliation`}>
            Reconciliation
            <ArrowRight className="ml-2 size-3" />
          </Link>
        </Button>
      </div>
      {errorMessage && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">Unassigned payments</CardTitle>
              <CardDescription>Mark orphan payments as donations for this event.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-bold uppercase">
              <Link href={`/dashboard/events/${slug}/reconciliation`}>
                Reconciliation
                <ArrowRight className="ml-2 size-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingDonations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6 text-sm text-muted-foreground">
                No unassigned payments right now.
              </div>
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
                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                        ) : successPaymentId === payment._id ? (
                          <CheckCircle2 className="mr-2 size-3.5" />
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
          <CardContent className="space-y-3">
            {linkedPayments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6 text-sm text-muted-foreground">
                No linked payments yet.
              </div>
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
