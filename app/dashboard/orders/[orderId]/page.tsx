"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { maskPaymentPayer } from "@/lib/utils/privacy"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

type PaymentStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"
  | null

type OrderAttendeePayload = {
  order: {
    id: string
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
    status: PaymentStatus
    orderId: string | null
    reference: string | null
    notes: string | null
  }>
}

type PageProps = {
  params: Promise<{
    orderId: string
  }>
}

import { formatMoney } from "@/lib/format"

function formatDateTime(value: string | null) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function statusBadgeVariant(status: string | null) {
  if (status === "cancelled") return "destructive" as const
  if (status === "refunded") return "outline" as const
  return "secondary" as const
}

function paymentSourceLabel(
  source: PaymentsPayload["payments"][number]["source"]
) {
  if (source === "bank_transfer") return "Bank transfer"
  if (source === "cash") return "Cash"
  return "Tikkie"
}

function paymentStatusLabel(status: PaymentStatus) {
  if (!status) return "-"
  return status.replace(/_/g, " ")
}

function paymentStatusVariant(status: PaymentStatus) {
  if (status === "unassigned") return "outline" as const
  if (status === "ambiguous") return "destructive" as const
  return "secondary" as const
}

export default function OrderDetailPage({ params }: PageProps) {
  const searchParams = useSearchParams()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(
    null
  )

  const source = searchParams.get("source")
  const attendeeId = searchParams.get("attendeeId")
  const attendeeSearch = searchParams.get("search")

  const backHref = useMemo(() => {
    if (source === "attendee-detail" && attendeeId) {
      const params = new URLSearchParams()
      if (attendeeSearch) {
        params.set("search", attendeeSearch)
      }
      params.set("source", "order-detail")

      return `/dashboard/attendees/${encodeURIComponent(attendeeId)}?${params.toString()}`
    }

    return "/dashboard/orders"
  }, [attendeeId, attendeeSearch, source])

  useEffect(() => {
    let cancelled = false

    async function resolveParams() {
      const resolved = await params

      if (cancelled) {
        return
      }

      setOrderId(resolved.orderId)
    }

    void resolveParams()

    return () => {
      cancelled = true
    }
  }, [params])

  const normalizedOrderId = orderId?.trim() ?? ""
  const hasOrderId = normalizedOrderId.length > 0

  const orderQuery = useQuery(
    api.orders.getOrderWithAttendees,
    hasOrderId ? { orderId: normalizedOrderId as Id<"orders"> } : "skip"
  )

  const paymentDocs = useQuery(
    api.payments.getPayments,
    hasOrderId ? { orderId: normalizedOrderId } : "skip"
  )

  const orderPayload = (orderQuery ?? null) as OrderAttendeePayload | null

  const payments = useMemo<PaymentsPayload["payments"]>(
    () =>
      (paymentDocs ?? [])
        .map((payment) => ({
          id: payment._id,
          source: payment.source,
          payerName: payment.payerName,
          amountMinor: payment.amountMinor,
          paidAt: new Date(payment.paidAt).toISOString(),
          status: payment.status ?? null,
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
    !hasOrderId || orderQuery === undefined || paymentDocs === undefined
  const errorMessage =
    hasOrderId && orderQuery === null ? "Order not found." : null

  const metrics = useMemo(() => {
    const hasKnownDue = typeof orderPayload?.order.amountDueMinor === "number"
    const amountDueMinor = orderPayload?.order.amountDueMinor ?? 0
    const matchedPayments = payments.filter(
      (payment) =>
        payment.status === "auto_matched" ||
        payment.status === "manual_assignment"
    )
    const paidAmountMinor = matchedPayments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0
    )

    const outstandingAmountMinor = Math.max(0, amountDueMinor - paidAmountMinor)
    const overpaidAmountMinor = Math.max(0, paidAmountMinor - amountDueMinor)
    const coverage =
      hasKnownDue && amountDueMinor > 0
        ? Math.min(100, Math.round((paidAmountMinor / amountDueMinor) * 100))
        : amountDueMinor === 0
          ? 100
          : null


    const attendeeCount = orderPayload?.attendees.length ?? 0
    const sharedOutstandingPerAttendeeMinor =
      attendeeCount > 0 ? Math.ceil(outstandingAmountMinor / attendeeCount) : 0

    return {
      amountDueMinor,
      paidAmountMinor,
      outstandingAmountMinor,
      overpaidAmountMinor,
      coverage,
      hasKnownDue,
      attendeeCount,
      sharedOutstandingPerAttendeeMinor,
    }
  }, [orderPayload, payments])

  const canRemoveLocally = useMemo(() => {
    if (!orderPayload) {
      return false
    }

    return (
      orderPayload.order.isArchived === true ||
      orderPayload.order.normalizedStatus === "cancelled"
    )
  }, [orderPayload])

  async function removeOrderLocally() {
    if (!orderId || !canRemoveLocally) {
      return
    }

    const confirmed = window.confirm(
      "Remove this order from local dashboard records? This hides it from order views and reports."
    )
    if (!confirmed) {
      return
    }

    setIsRemoving(true)
    setRemoveErrorMessage(null)

    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(orderId)}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setRemoveErrorMessage(
          body?.error?.message ??
          "Failed to remove this order from local records."
        )
        return
      }

      window.location.assign("/dashboard/orders")
    } catch {
      setRemoveErrorMessage("Network error while removing order.")
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Order payment detail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track one order across all its attendees and all assigned payments.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={backHref}>Back</Link>
        </Button>
      </header>

      {removeErrorMessage && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {removeErrorMessage}
        </article>
      )}

      {errorMessage && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Loading order payment detail...
        </article>
      )}

      {!errorMessage && !isLoading && orderPayload && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
                <span className="font-mono text-lg">
                  {orderPayload.order.id}
                </span>
                <Badge
                  variant={statusBadgeVariant(
                    orderPayload.order.normalizedStatus ?? null
                  )}
                >
                  {orderPayload.order.normalizedStatus ?? "pending"}
                </Badge>
                {orderPayload.order.isArchived && (
                  <Badge variant="outline">Archived</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Ordered {formatDateTime(orderPayload.order.orderedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {canRemoveLocally && (
                <article className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                  {orderPayload.order.isArchived
                    ? "This order is archived because it is missing upstream in Ticket Tailor."
                    : "This order is cancelled."}{" "}
                  You can remove it from local records if you no longer need it.
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={removeOrderLocally}
                      disabled={isRemoving || !canRemoveLocally}
                    >
                      {isRemoving ? "Removing..." : "Remove from local records"}
                    </Button>
                  </div>
                </article>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <article className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                    Order due
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {metrics.hasKnownDue
                      ? formatMoney(metrics.amountDueMinor)
                      : "Missing amount"}
                  </p>
                </article>
                <article className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                    Matched paid
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
                    {formatMoney(metrics.paidAmountMinor)}
                  </p>
                </article>
                <article className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                    Outstanding
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-300">
                    {metrics.hasKnownDue
                      ? formatMoney(metrics.outstandingAmountMinor)
                      : "Missing amount"}
                  </p>
                </article>
                <article className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                    Overpaid
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight text-amber-600 dark:text-amber-300">
                    {formatMoney(metrics.overpaidAmountMinor)}
                  </p>
                </article>
                <article className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                    Coverage
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {metrics.coverage === null ? "N/A" : `${metrics.coverage}%`}
                  </p>
                </article>
              </div>

              <article className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                {metrics.attendeeCount > 1
                  ? `This order has ${metrics.attendeeCount} attendees. Payment progress is tracked against attendee ticket dues, with current outstanding averaging about ${formatMoney(metrics.sharedOutstandingPerAttendeeMinor)} per attendee.`
                  : "This order has one attendee, so order progress maps directly to that attendee's ticket due."}
              </article>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Attendees under this order
                </CardTitle>
                <CardDescription>
                  Everyone listed here shares the same order payment progress.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {orderPayload.attendees.length === 0 ? (
                  <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                    No attendees found under this order.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Attendee</TableHead>
                          <TableHead>Ticket</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Due</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderPayload.attendees.map((attendee) => (
                          <TableRow key={attendee.id}>
                            <TableCell>
                              <div className="text-sm font-medium">
                                {attendee.name}
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {attendee.id}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {attendee.ticketTypeLabel}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={statusBadgeVariant(
                                  attendee.normalizedStatus
                                )}
                              >
                                {attendee.normalizedStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatMoney(attendee.amountDueMinor)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assigned payments</CardTitle>
                <CardDescription>
                  Payments matched to this order (manual or automatic).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                    No payments assigned to this order yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <article
                        key={payment.id}
                        className="rounded-lg border border-border/70 bg-background px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">
                              {maskPaymentPayer(payment.payerName)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {paymentSourceLabel(payment.source)} ·{" "}
                              {formatDateTime(payment.paidAt)}
                            </p>
                            {(payment.reference || payment.notes) && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {[payment.reference, payment.notes]
                                  .filter((value): value is string =>
                                    Boolean(value && value.trim())
                                  )
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">
                              {formatMoney(payment.amountMinor)}
                            </p>
                            <Badge
                              variant={paymentStatusVariant(payment.status)}
                              className="mt-1 capitalize"
                            >
                              {paymentStatusLabel(payment.status)}
                            </Badge>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!orderId && !isLoading && !orderPayload && !errorMessage && (
        <article className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          No order selected.
        </article>
      )}
    </section>
  )
}
