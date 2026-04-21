"use client"

import { use, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAction, useQuery } from "convex/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
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
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import {
  CreditCard,
  Users,
  Receipt,
  AlertCircle,
  Trash2,
  Calendar,
  ShieldCheck,
  Clock,
  Zap,
  Plus,
  Loader2,
  Link2Off,
  Mail,
  CheckCircle2,
} from "lucide-react"
import { AssignPaymentSheet } from "./assign-payment-sheet"
import { useUnassignPayment } from "@/lib/convex/hooks/payments"

type PaymentStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"
  | null

type OrderAttendeePayload = {
  order: {
    id: string
    buyerName: string | null
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

function formatDateTime(value: string | null) {
  if (!value) return "-"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
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
  const { orderId: rawOrderId } = use(params)
  const searchParams = useSearchParams()
  const [isRemoving, setIsRemoving] = useState(false)
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(
    null
  )
  const [isAssignSheetOpen, setIsAssignSheetOpen] = useState(false)
  const [isUnassigningId, setIsUnassigningId] = useState<string | null>(null)
  const [isResendingEmail, setIsResendingEmail] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [resendErrorMessage, setResendErrorMessage] = useState<string | null>(
    null
  )
  const unassignPayment = useUnassignPayment()
  const resendOrderConfirmation = useAction(
    api.emailActions.resendOrderConfirmation
  )

  const handleUnassign = async (paymentId: string) => {
    if (!window.confirm("Are you sure you want to unlink this payment?")) return
    setIsUnassigningId(paymentId)
    try {
      await unassignPayment({ paymentId: paymentId as Id<"payments"> })
    } catch (err) {
      console.error(err)
    } finally {
      setIsUnassigningId(null)
    }
  }

  const source = searchParams.get("source")
  const attendeeId = searchParams.get("attendeeId")
  const attendeeSearch = searchParams.get("search")

  const normalizedOrderId = rawOrderId?.trim() ?? ""
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

  const canResendConfirmation = Boolean(
    orderPayload?.order.bookerEmail && orderPayload?.order.bookingRef
  )

  async function resendConfirmationEmail() {
    if (!hasOrderId || !canResendConfirmation) return

    const confirmed = window.confirm(
      "Resend the booking confirmation email to this customer?"
    )
    if (!confirmed) return

    setIsResendingEmail(true)
    setResendMessage(null)
    setResendErrorMessage(null)

    try {
      const result = await resendOrderConfirmation({
        orderId: normalizedOrderId as Id<"orders">,
      })

      if (!result.success) {
        setResendErrorMessage(
          result.error ?? "Failed to send confirmation email."
        )
        return
      }

      setResendMessage(
        orderPayload?.order.bookerEmail
          ? `Confirmation email sent to ${orderPayload.order.bookerEmail}.`
          : "Confirmation email sent."
      )
    } catch (error) {
      setResendErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to send confirmation email."
      )
    } finally {
      setIsResendingEmail(false)
    }
  }

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
    if (!orderPayload) return false
    return (
      orderPayload.order.isArchived === true ||
      orderPayload.order.normalizedStatus === "cancelled"
    )
  }, [orderPayload])

  async function removeOrderLocally() {
    if (!normalizedOrderId || !canRemoveLocally) return

    const confirmed = window.confirm(
      "Remove this order from local dashboard records? This hides it from order views and reports."
    )
    if (!confirmed) return

    setIsRemoving(true)
    setRemoveErrorMessage(null)

    try {
      const response = await fetch(
        `/api/dashboard/orders/${encodeURIComponent(normalizedOrderId)}`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setRemoveErrorMessage(body?.error?.message ?? "Failed to remove order.")
        return
      }

      window.location.assign("/dashboard/manage-orders")
    } catch {
      setRemoveErrorMessage("Network error while removing order.")
    } finally {
      setIsRemoving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="mx-auto mb-4 size-12 text-destructive opacity-40" />
        <h3 className="text-lg font-bold text-destructive">Error</h3>
        <p className="text-sm text-destructive/70">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-8 duration-700 fade-in slide-in-from-bottom-4">
      {removeErrorMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {removeErrorMessage}
        </div>
      )}

      {resendErrorMessage && (
        <Alert
          variant="destructive"
          className="rounded-xl border-destructive/20"
        >
          <AlertCircle className="size-4" />
          <AlertTitle className="text-destructive">Send failed</AlertTitle>
          <AlertDescription className="text-destructive/80">
            {resendErrorMessage}
          </AlertDescription>
        </Alert>
      )}

      {resendMessage && (
        <Alert className="rounded-xl border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" />
          <AlertTitle className="text-emerald-700 dark:text-emerald-300">
            Sent
          </AlertTitle>
          <AlertDescription className="text-emerald-700/90 dark:text-emerald-300/90">
            {resendMessage}
          </AlertDescription>
        </Alert>
      )}

      {orderPayload && (
        <>
          {/* Hero Card */}
          <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
            <CardHeader className="pb-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-xl font-bold tracking-tight text-primary">
                      {orderPayload.order.id}
                    </span>
                    <Badge
                      variant={statusBadgeVariant(
                        orderPayload.order.normalizedStatus ?? null
                      )}
                      className="rounded-full px-3 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                    >
                      {orderPayload.order.normalizedStatus ?? "pending"}
                    </Badge>
                  </div>
                  <CardDescription className="text-sm font-medium">
                    Placed on {formatDateTime(orderPayload.order.orderedAt)}
                  </CardDescription>
                </div>

                {canRemoveLocally && (
                  <div className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="space-y-1">
                      <p className="text-xs font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
                        Order Archived
                      </p>
                      <p className="text-[10px] text-amber-600/70">
                        Missing upstream in provider.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={removeOrderLocally}
                      disabled={isRemoving}
                      className="h-8 rounded-lg px-3 text-[10px] font-bold tracking-wider uppercase"
                    >
                      {isRemoving ? "Removing..." : "Remove Locally"}
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resendConfirmationEmail}
                  disabled={isResendingEmail || !canResendConfirmation}
                  className="h-9 rounded-lg border-white/20 text-[11px] font-bold tracking-wider uppercase"
                >
                  {isResendingEmail ? (
                    <>
                      <Loader2 className="mr-2 size-3.5 animate-spin" />
                      Sending
                    </>
                  ) : resendMessage ? (
                    <>
                      <CheckCircle2 className="mr-2 size-3.5 text-emerald-600" />
                      Sent
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 size-3.5" />
                      Send email
                    </>
                  )}
                </Button>
                {!canResendConfirmation && (
                  <p className="text-xs text-muted-foreground">
                    Missing recipient email or booking reference.
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    label: "Order Due",
                    value: metrics.hasKnownDue
                      ? formatMoney(metrics.amountDueMinor)
                      : "Missing",
                    icon: Receipt,
                    color: "text-foreground",
                  },
                  {
                    label: "Paid Amount",
                    value: formatMoney(metrics.paidAmountMinor),
                    icon: ShieldCheck,
                    color: "text-emerald-600 dark:text-emerald-400",
                  },
                  {
                    label: "Outstanding",
                    value: metrics.hasKnownDue
                      ? formatMoney(metrics.outstandingAmountMinor)
                      : "Missing",
                    icon: Clock,
                    color: "text-rose-600 dark:text-rose-400",
                  },
                  {
                    label: "Overpaid",
                    value: formatMoney(metrics.overpaidAmountMinor),
                    icon: AlertCircle,
                    color: "text-amber-600 dark:text-amber-300",
                  },
                  {
                    label: "Coverage",
                    value:
                      metrics.coverage === null
                        ? "N/A"
                        : `${metrics.coverage}%`,
                    icon: Zap,
                    color: "text-primary",
                  },
                ].map((item, i) => (
                  <article
                    key={i}
                    className="rounded-2xl border border-white/60 bg-white/50 p-4 transition-all hover:bg-white/80 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <p className="mb-3 px-1 text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
                      {item.label}
                    </p>
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-2xl font-black tracking-tight",
                          item.color
                        )}
                      >
                        {item.value}
                      </span>
                      <item.icon
                        className={cn("size-5 opacity-20", item.color)}
                      />
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
                <Users className="size-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">
                  {metrics.attendeeCount > 1
                    ? `Consolidated ledger for ${metrics.attendeeCount} attendees. Outstanding averages ${formatMoney(metrics.sharedOutstandingPerAttendeeMinor)} per ticket.`
                    : "Direct progress mapping for a single attendee order."}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-8 lg:grid-cols-5">
            {/* Attendees Section */}
            <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur lg:col-span-3 dark:border-white/10 dark:bg-black/20">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Attendees</CardTitle>
                <CardDescription>
                  Consolidated ticket data for this order
                </CardDescription>
              </CardHeader>
              <CardContent>
                {orderPayload.attendees.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/20 py-12 text-center">
                    <Users className="mx-auto mb-3 size-10 opacity-10" />
                    <p className="text-sm font-bold tracking-widest uppercase opacity-40">
                      No attendees
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/20 bg-background/20">
                    <Table>
                      <TableHeader className="bg-white/10">
                        <TableRow>
                          <TableHead className="h-10 text-[10px] font-black tracking-widest uppercase">
                            Attendee
                          </TableHead>
                          <TableHead className="h-10 text-[10px] font-black tracking-widest uppercase">
                            Ticket
                          </TableHead>
                          <TableHead className="h-10 text-right text-[10px] font-black tracking-widest uppercase">
                            Due
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderPayload.attendees.map((attendee) => (
                          <TableRow
                            key={attendee.id}
                            className="border-white/5"
                          >
                            <TableCell className="py-4">
                              <p className="text-sm font-bold">
                                {attendee.name}
                              </p>
                              <p className="font-mono text-[10px] text-muted-foreground/60">
                                {attendee.id}
                              </p>
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge
                                variant="outline"
                                className="border-white/20 text-[10px] font-medium"
                              >
                                {attendee.ticketTypeLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-4 text-right">
                              <span className="text-sm font-black tabular-nums">
                                {formatMoney(attendee.amountDueMinor)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payments Section */}
            <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur lg:col-span-2 dark:border-white/10 dark:bg-black/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">
                    Assigned Payments
                  </CardTitle>
                  <CardDescription>Matched to this order ID</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAssignSheetOpen(true)}
                  className="h-8 rounded-lg border-white/20 text-[11px] font-bold uppercase transition-all hover:bg-white/10"
                >
                  <Plus className="mr-2 size-3" /> Assign
                </Button>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/20 py-12 text-center">
                    <CreditCard className="mx-auto mb-3 size-10 opacity-10" />
                    <p className="text-sm font-bold tracking-widest uppercase opacity-40">
                      No payments
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {payments.map((payment) => (
                      <article
                        key={payment.id}
                        className="group relative rounded-2xl border border-white/60 bg-white/60 p-4 transition-all hover:bg-white/80 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between">
                          <div className="max-w-[60%] space-y-1">
                            <p className="truncate text-sm font-bold tracking-tight">
                              {payment.payerName}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground/60">
                              <span className="truncate">
                                {paymentSourceLabel(payment.source)}
                              </span>
                              <span>•</span>
                              <span className="shrink-0">
                                {formatDateTime(payment.paidAt)}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1 text-right">
                            <p className="text-sm font-black text-foreground tabular-nums">
                              {formatMoney(payment.amountMinor)}
                            </p>
                            <Badge
                              variant={paymentStatusVariant(payment.status)}
                              className="h-4 px-1.5 text-[9px] font-black tracking-widest uppercase"
                            >
                              {paymentStatusLabel(payment.status)}
                            </Badge>
                          </div>
                        </div>
                        <div className="absolute -top-2 -right-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="destructive"
                            size="icon"
                            className="size-7 rounded-full shadow-md"
                            onClick={() => handleUnassign(payment.id)}
                            disabled={isUnassigningId === payment.id}
                            title="Unlink Payment"
                          >
                            {isUnassigningId === payment.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Link2Off className="size-3.5" />
                            )}
                          </Button>
                        </div>
                        {(payment.reference || payment.notes) && (
                          <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-muted-foreground/50 italic">
                            {[payment.reference, payment.notes]
                              .filter((v): v is string =>
                                Boolean(v && v.trim())
                              )
                              .join(" — ")}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {hasOrderId && metrics && (
        <AssignPaymentSheet
          open={isAssignSheetOpen}
          onOpenChange={setIsAssignSheetOpen}
          orderId={normalizedOrderId}
          outstandingAmountMinor={metrics.outstandingAmountMinor}
          bookerName={orderPayload?.attendees?.[0]?.name}
        />
      )}
    </div>
  )
}
