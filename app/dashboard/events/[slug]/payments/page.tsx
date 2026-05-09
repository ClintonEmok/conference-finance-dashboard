"use client"

import Link from "next/link"
import { use, useMemo, useState } from "react"
import { ArrowRight, CalendarRange, CheckCircle2, CreditCard, HandCoins, Loader2, ShieldCheck } from "lucide-react"

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

  const summary = useMemo(() => {
    const linked = eventPayments ?? []
    const unassigned = unassignedPayments ?? []

    return {
      linkedCount: linked.length,
      donationCount: linked.filter((payment) => payment.status === "donation").length,
      matchedCount: linked.filter(
        (payment) => payment.status === "auto_matched" || payment.status === "manual_assignment"
      ).length,
      unassignedCount: unassigned.length,
    }
  }, [eventPayments, unassignedPayments])

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
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  const linkedPayments = eventPayments ?? []
  const pendingDonations = unassignedPayments ?? []

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <div className="space-y-3">
            <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
              Payments inbox
            </p>
            <CardTitle className="text-3xl font-bold tracking-tight">{event.title}</CardTitle>
            <CardDescription className="max-w-2xl text-muted-foreground/80">
              Review incoming payments, classify orphan donations, and jump to reconciliation when an order needs matching.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Linked payments", value: linkedPayments.length, desc: "Payments tied to this event", icon: CreditCard },
          { label: "Matched", value: summary.matchedCount, desc: "Auto or manual matches", icon: HandCoins },
          { label: "Donations", value: summary.donationCount, desc: "Persisted donation payments", icon: ShieldCheck },
          { label: "Unassigned", value: summary.unassignedCount, desc: "Waiting in the global inbox", icon: CalendarRange },
        ].map((metric) => {
          const Icon = metric.icon

          return (
            <Card key={metric.label} className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
              <CardContent className="flex items-start justify-between gap-4 p-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">{metric.label}</p>
                  <p className="text-3xl font-bold tracking-tight text-foreground">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.desc}</p>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
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

        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
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