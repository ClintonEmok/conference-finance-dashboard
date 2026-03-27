"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type PaymentStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"
  | null

type OrderAttendeePayload = {
  order: {
    id: string
    providerOrderId: string
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending" | null
    isArchived?: boolean
    archivedAt: string | null
    archiveReason: string | null
    totalAmountMinor: number | null
    orderedAt: string | null
  }
  attendees: Array<{
    id: string
    name: string
    ticketTypeLabel: string
    normalizedStatus: string
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

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

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
  const [providerOrderId, setProviderOrderId] = useState<string | null>(null)
  const [orderPayload, setOrderPayload] = useState<OrderAttendeePayload | null>(
    null
  )
  const [payments, setPayments] = useState<PaymentsPayload["payments"]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRemoving, setIsRemoving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(
    null
  )

  const eventId = searchParams.get("eventId")
  const source = searchParams.get("source")
  const attendeeId = searchParams.get("attendeeId")
  const attendeeSearch = searchParams.get("search")

  const backHref = useMemo(() => {
    if (source === "attendee-detail" && attendeeId) {
      const params = new URLSearchParams()
      if (eventId) {
        params.set("eventId", eventId)
      }
      if (attendeeSearch) {
        params.set("search", attendeeSearch)
      }
      params.set("source", "order-detail")

      return `/dashboard/attendees/${encodeURIComponent(attendeeId)}?${params.toString()}`
    }

    return "/dashboard/orders"
  }, [attendeeId, attendeeSearch, eventId, source])

  useEffect(() => {
    let cancelled = false

    async function resolveParamsAndLoad() {
      const resolved = await params

      if (cancelled) {
        return
      }

      setProviderOrderId(resolved.orderId)

      if (!eventId) {
        setErrorMessage("Missing event context for this order.")
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const orderResponse = await fetch(
          `/api/dashboard/orders/${encodeURIComponent(resolved.orderId)}?eventId=${encodeURIComponent(eventId)}`
        )

        const orderBody = (await orderResponse.json().catch(() => null)) as
          | OrderAttendeePayload
          | { error?: { message?: string } }
          | null

        if (!orderResponse.ok) {
          if (!cancelled) {
            setOrderPayload(null)
            setPayments([])
            setErrorMessage(
              orderBody && "error" in orderBody
                ? (orderBody.error?.message ?? "Failed to load order details.")
                : "Failed to load order details."
            )
            setIsLoading(false)
          }
          return
        }

        const orderData = orderBody as OrderAttendeePayload
        const paymentQueries = [
          orderData.order.id,
          orderData.order.providerOrderId,
        ]
        const mergedPayments = new Map<
          string,
          PaymentsPayload["payments"][number]
        >()

        for (const orderIdValue of paymentQueries) {
          if (!orderIdValue) {
            continue
          }

          const paymentResponse = await fetch(
            `/api/payments?orderId=${encodeURIComponent(orderIdValue)}&limit=100`
          )

          if (!paymentResponse.ok) {
            continue
          }

          const paymentBody = (await paymentResponse.json()) as PaymentsPayload

          for (const payment of paymentBody.payments ?? []) {
            mergedPayments.set(payment.id, payment)
          }
        }

        if (!cancelled) {
          const sortedPayments = Array.from(mergedPayments.values()).sort(
            (a, b) =>
              new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
          )

          setOrderPayload(orderData)
          setPayments(sortedPayments)
        }
      } catch {
        if (!cancelled) {
          setOrderPayload(null)
          setPayments([])
          setErrorMessage("Network error while loading order details.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void resolveParamsAndLoad()

    return () => {
      cancelled = true
    }
  }, [eventId, params])

  const metrics = useMemo(() => {
    const totalAmountMinor = orderPayload?.order.totalAmountMinor ?? 0
    const matchedPayments = payments.filter(
      (payment) =>
        payment.status === "auto_matched" ||
        payment.status === "manual_assignment"
    )
    const paidAmountMinor = matchedPayments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0
    )

    const outstandingAmountMinor = Math.max(
      0,
      totalAmountMinor - paidAmountMinor
    )
    const overpaidAmountMinor = Math.max(0, paidAmountMinor - totalAmountMinor)
    const coverage =
      totalAmountMinor > 0
        ? Math.min(100, Math.round((paidAmountMinor / totalAmountMinor) * 100))
        : 0

    const attendeeCount = orderPayload?.attendees.length ?? 0
    const sharedOutstandingPerAttendeeMinor =
      attendeeCount > 0 ? Math.ceil(outstandingAmountMinor / attendeeCount) : 0

    return {
      totalAmountMinor,
      paidAmountMinor,
      outstandingAmountMinor,
      overpaidAmountMinor,
      coverage,
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
    if (!providerOrderId || !eventId || !canRemoveLocally) {
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
        `/api/dashboard/orders/${encodeURIComponent(providerOrderId)}?eventId=${encodeURIComponent(eventId)}`,
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
                  {orderPayload.order.providerOrderId}
                </span>
                <Badge
                  variant={statusBadgeVariant(
                    orderPayload.order.normalizedStatus
                  )}
                >
                  {orderPayload.order.normalizedStatus ?? "pending"}
                </Badge>
                {orderPayload.order.isArchived && (
                  <Badge variant="outline">Archived</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Ordered {formatDateTime(orderPayload.order.orderedAt)} ·{" "}
                {eventId ?? "Unknown event"}
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
                    Order total
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {formatMoney(metrics.totalAmountMinor)}
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
                    {formatMoney(metrics.outstandingAmountMinor)}
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
                    {metrics.coverage}%
                  </p>
                </article>
              </div>

              <article className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                {metrics.attendeeCount > 1
                  ? `This order has ${metrics.attendeeCount} attendees. Payment progress is tracked at order level and shared across the group. Current shared outstanding is about ${formatMoney(metrics.sharedOutstandingPerAttendeeMinor)} per attendee if split evenly.`
                  : "This order has one attendee, so order progress maps directly to that attendee."}
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
                          <TableHead className="text-right">
                            Shared due
                          </TableHead>
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
                              {formatMoney(
                                metrics.sharedOutstandingPerAttendeeMinor
                              )}
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
                              {payment.payerName}
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

      {!providerOrderId && !isLoading && !orderPayload && !errorMessage && (
        <article className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          No order selected.
        </article>
      )}
    </section>
  )
}
