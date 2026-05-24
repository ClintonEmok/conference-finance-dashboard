"use client"

import Link from "next/link"
import { use, useEffect, useMemo, useState } from "react"
import { useAction, useQuery } from "convex/react"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Link2Off,
  Mail,
  Plus,
  Receipt,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/convex/api"
import { useTicketTypesForEvent } from "@/lib/convex/hooks/events"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { useUnassignPayment } from "@/lib/convex/hooks/payments"
import { deriveBalanceAmounts } from "@/lib/domain/finance/amounts"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id } from "@/convex/_generated/dataModel"
import { AssignPaymentSheet } from "@/app/dashboard/manage-orders/[orderId]/assign-payment-sheet"

type PageProps = {
  params: Promise<{ slug: string; orderId: string }>
}

type PaymentStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"
  | "donation"
  | null

type GenderType = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

type OrderEditDraft = {
  bookerName: string
  bookerEmail: string
  bookingRef: string
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
  totalAmountMinor: string
  orderedAt: string
}

type AttendeeEditDraft = {
  genderType: "" | GenderType
  ticketTypeId: string
}

type AttendeeDetailSnapshot = {
  attendee: {
    id: string
    ticketTypeId: string | null
  }
  signals: {
    genderType: GenderType | null
  }
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
    status: PaymentStatus
    orderId: string | null
    reference: string | null
    notes: string | null
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

function paymentSourceLabel(source: PaymentsPayload["payments"][number]["source"]) {
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

export default function EventOrderDetailPage({ params }: PageProps) {
  const { slug, orderId: rawOrderId } = use(params)
  const orderId = rawOrderId.trim()
  const event = useEventBySlug(slug)
  const { ticketTypes } = useTicketTypesForEvent(event?._id?.toString())
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
  const [attendeeDetailSnapshots, setAttendeeDetailSnapshots] = useState<
    Record<string, AttendeeDetailSnapshot>
  >({})
  const [attendeeEditDrafts, setAttendeeEditDrafts] = useState<
    Record<string, AttendeeEditDraft>
  >({})
  const [savingAttendeeId, setSavingAttendeeId] = useState<string | null>(null)
  const [attendeeSaveErrors, setAttendeeSaveErrors] = useState<
    Record<string, string | null>
  >({})
  const [attendeeLoadError, setAttendeeLoadError] = useState<string | null>(
    null
  )
  const hasAssignedPayments = (paymentDocs?.length ?? 0) > 0

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

  useEffect(() => {
    const attendees = orderPayload?.attendees ?? []

    if (!attendees.length) {
      setAttendeeDetailSnapshots({})
      setAttendeeEditDrafts({})
      return
    }

    const controller = new AbortController()
    setAttendeeLoadError(null)

    async function loadAttendeeDrafts() {
      try {
        const details = await Promise.all(
          attendees.map(async (attendee) => {
            const response = await fetch(
              `/api/dashboard/attendees/${encodeURIComponent(attendee.id)}`,
              { signal: controller.signal }
            )
            if (!response.ok) {
              throw new Error(`Failed to load attendee ${attendee.id}`)
            }

            const body = (await response.json()) as {
              attendee: AttendeeDetailSnapshot["attendee"]
              signals: AttendeeDetailSnapshot["signals"]
            }

            return [attendee.id, body] as const
          })
        )

        if (controller.signal.aborted) return

        const snapshotMap: Record<string, AttendeeDetailSnapshot> = {}
        const draftMap: Record<string, AttendeeEditDraft> = {}

        for (const [attendeeId, detail] of details) {
          snapshotMap[attendeeId] = detail
          draftMap[attendeeId] = {
            genderType: detail.signals.genderType ?? "",
            ticketTypeId: detail.attendee.ticketTypeId ?? "",
          }
        }

        setAttendeeDetailSnapshots(snapshotMap)
        setAttendeeEditDrafts(draftMap)
      } catch (error) {
        if (controller.signal.aborted) return
        setAttendeeLoadError(
          error instanceof Error ? error.message : "Failed to load attendee details."
        )
      }
    }

    loadAttendeeDrafts()

    return () => controller.abort()
  }, [orderPayload?.attendees])

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
    !orderId || event === undefined || payload === undefined || paymentDocs === undefined
  const eventOrderMismatch =
    event !== undefined &&
    payload !== undefined &&
    payload !== null &&
    String(payload.order.eventId) !== String(event?._id)
  const areAttendeeDetailsHydrated = Boolean(
    orderPayload &&
      orderPayload.attendees.every(
        (attendee) => attendeeDetailSnapshots[attendee.id] && attendeeEditDrafts[attendee.id]
      )
  )

  const canResendConfirmation = Boolean(
    orderPayload?.order.bookerEmail && orderPayload?.order.bookingRef
  )

  const metrics = useMemo(() => {
    const hasKnownDue = typeof orderPayload?.order.amountDueMinor === "number"
    const amountDueMinor = orderPayload?.order.amountDueMinor ?? 0
    const matchedPayments = payments.filter(
      (payment) =>
        payment.status === "auto_matched" || payment.status === "manual_assignment"
    )
    const paidAmountMinor = matchedPayments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0
    )

    const balance = deriveBalanceAmounts(amountDueMinor, paidAmountMinor)
    const coverage =
      hasKnownDue && amountDueMinor > 0
        ? Math.min(100, Math.round((paidAmountMinor / amountDueMinor) * 100))
        : amountDueMinor === 0
          ? 100
          : null

    const attendeeCount = orderPayload?.attendees.length ?? 0
    const sharedOutstandingPerAttendeeMinor =
      attendeeCount > 0 ? Math.ceil(balance.outstandingAmountMinor / attendeeCount) : 0

    return {
      amountDueMinor: balance.amountDueMinor,
      paidAmountMinor: balance.paidAmountMinor,
      outstandingAmountMinor: balance.outstandingAmountMinor,
      donationAmountMinor: balance.donationAmountMinor,
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

  async function saveAttendeeDetails(attendeeId: string) {
    const draft = attendeeEditDrafts[attendeeId]
    if (!draft) return

    setSavingAttendeeId(attendeeId)
    setAttendeeSaveErrors((current) => ({ ...current, [attendeeId]: null }))

    try {
      const response = await fetch(
        `/api/dashboard/attendees/${encodeURIComponent(attendeeId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genderType: draft.genderType || null,
            ...(draft.ticketTypeId
              ? { ticketTypeId: draft.ticketTypeId }
              : {}),
          }),
        }
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to save attendee details.")
      }

      window.location.reload()
    } catch (error) {
      setAttendeeSaveErrors((current) => ({
        ...current,
        [attendeeId]:
          error instanceof Error ? error.message : "Failed to save attendee details.",
      }))
    } finally {
      setSavingAttendeeId(null)
    }
  }

  const canRemoveLocally = useMemo(() => {
    if (!orderPayload) return false
    return (
      (orderPayload.order.isArchived === true ||
        orderPayload.order.normalizedStatus === "cancelled") &&
      !hasAssignedPayments
    )
  }, [hasAssignedPayments, orderPayload])

  async function removeOrderLocally() {
    if (!orderId || !canRemoveLocally) return

    const confirmed = window.confirm(
      "Remove this order from local dashboard records? This hides it from order views and reports."
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

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />
  }

  if (event === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">The slug “{slug}” does not exist.</p>
      </div>
    )
  }

  if (orderPayload === null || eventOrderMismatch) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="mt-2 text-muted-foreground">The canonical order could not be loaded.</p>
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
        <Alert variant="destructive" className="rounded-xl border-destructive/20">
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
          <AlertTitle className="text-emerald-700 dark:text-emerald-300">Sent</AlertTitle>
          <AlertDescription className="text-emerald-700/90 dark:text-emerald-300/90">
            {resendMessage}
          </AlertDescription>
        </Alert>
      )}

      <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
        <Link href={`/dashboard/events/${slug}/orders`}>
          <ArrowLeft className="mr-2 size-4" /> Back to orders
        </Link>
      </Button>

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader className="pb-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-xl font-bold tracking-tight text-primary">
                  {orderPayload.order.id}
                </span>
                <Badge
                  variant={statusBadgeVariant(orderPayload.order.normalizedStatus ?? null)}
                  className="rounded-full px-3 py-0.5 text-[10px] font-bold tracking-widest uppercase"
                >
                  {orderPayload.order.normalizedStatus ?? "pending"}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px] uppercase">
                  {slug}
                </Badge>
              </div>
              <CardDescription className="text-sm font-medium">
                {event.title} · /dashboard/events/{slug}/orders/{orderId}
              </CardDescription>
            </div>

            {orderPayload.order.normalizedStatus === "cancelled" || orderPayload.order.isArchived ? (
              <div className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
                    {hasAssignedPayments ? "Removal blocked" : "Order archived"}
                  </p>
                  <p className="text-[10px] text-amber-600/70">
                    {hasAssignedPayments
                      ? "Assigned payments must be removed before this order can be deleted."
                      : "Missing upstream in provider."}
                  </p>
                </div>
                {canRemoveLocally && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={removeOrderLocally}
                    disabled={isRemoving}
                    className="h-8 rounded-lg px-3 text-[10px] font-bold tracking-wider uppercase"
                  >
                    {isRemoving ? "Removing..." : "Remove Locally"}
                  </Button>
                )}
              </div>
            ) : null}
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
                label: "Amount Due",
                value: metrics.hasKnownDue ? formatMoney(metrics.amountDueMinor) : "Missing",
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
                label: "Donation",
                value: formatMoney(metrics.donationAmountMinor),
                icon: AlertCircle,
                color: "text-amber-600 dark:text-amber-300",
              },
              {
                label: "Coverage",
                value: metrics.coverage === null ? "N/A" : `${metrics.coverage}%`,
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
                  <span className={cn("text-2xl font-black tracking-tight", item.color)}>
                    {item.value}
                  </span>
                  <item.icon className={cn("size-5 opacity-20", item.color)} />
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

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold">Order Details</CardTitle>
            <CardDescription>View order fields, then explicitly enter edit mode to update them.</CardDescription>
          </div>
          <Button
            type="button"
            variant={isEditingOrder ? "secondary" : "default"}
            className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
            onClick={() => setIsEditingOrder((current) => !current)}
          >
            {isEditingOrder ? "Close Edit" : "Edit Order"}
          </Button>
        </CardHeader>
        <CardContent>
          {orderSaveError && (
            <Alert variant="destructive" className="mb-4 rounded-xl">
              <AlertCircle className="size-4" />
              <AlertTitle className="text-destructive">Save failed</AlertTitle>
              <AlertDescription className="text-destructive/80">{orderSaveError}</AlertDescription>
            </Alert>
          )}

          {!isEditingOrder ? (
            <div className="grid gap-4 rounded-2xl border border-white/20 bg-background/20 p-4 text-sm lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Booker name</p>
                <p className="mt-1 font-medium">{orderPayload.order.bookerName ?? "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Booker email</p>
                <p className="mt-1 font-medium">{orderPayload.order.bookerEmail ?? "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Booking reference</p>
                <p className="mt-1 font-medium">{orderPayload.order.bookingRef ?? "-"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Order status</p>
                <p className="mt-1 font-medium">{orderPayload.order.normalizedStatus ?? "pending"}</p>
              </div>
              <div>
                <p className="text-[10px] font-black tracking-widest text-muted-foreground uppercase">Ordered at</p>
                <p className="mt-1 font-medium">{formatDateTime(orderPayload.order.orderedAt)}</p>
              </div>
            </div>
          ) : (
            orderEditDraft && (
              <form
                className="grid gap-4 lg:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveOrderDetails()
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="bookerName">Booker name</Label>
                  <Input
                    id="bookerName"
                    value={orderEditDraft.bookerName}
                    onChange={(event) =>
                      setOrderEditDraft((current) =>
                        current ? { ...current, bookerName: event.target.value } : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bookerEmail">Booker email</Label>
                  <Input
                    id="bookerEmail"
                    type="email"
                    value={orderEditDraft.bookerEmail}
                    onChange={(event) =>
                      setOrderEditDraft((current) =>
                        current ? { ...current, bookerEmail: event.target.value } : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bookingRef">Booking reference</Label>
                  <Input
                    id="bookingRef"
                    value={orderEditDraft.bookingRef}
                    onChange={(event) =>
                      setOrderEditDraft((current) =>
                        current ? { ...current, bookingRef: event.target.value } : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="normalizedStatus">Order status</Label>
                  <Select
                    value={orderEditDraft.normalizedStatus}
                    onValueChange={(value) =>
                      setOrderEditDraft((current) =>
                        current
                          ? {
                              ...current,
                              normalizedStatus: value as OrderEditDraft["normalizedStatus"],
                            }
                          : current
                      )
                    }
                  >
                    <SelectTrigger id="normalizedStatus">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">paid</SelectItem>
                      <SelectItem value="refunded">refunded</SelectItem>
                      <SelectItem value="cancelled">cancelled</SelectItem>
                      <SelectItem value="pending">pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="totalAmountMinor">Total amount (minor units)</Label>
                  <Input
                    id="totalAmountMinor"
                    type="number"
                    min="0"
                    step="1"
                    value={orderEditDraft.totalAmountMinor}
                    onChange={(event) =>
                      setOrderEditDraft((current) =>
                        current ? { ...current, totalAmountMinor: event.target.value } : current
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderedAt">Ordered at</Label>
                  <Input
                    id="orderedAt"
                    type="datetime-local"
                    value={orderEditDraft.orderedAt}
                    onChange={(event) =>
                      setOrderEditDraft((current) =>
                        current ? { ...current, orderedAt: event.target.value } : current
                      )
                    }
                  />
                </div>

                <div className="lg:col-span-2 flex items-center justify-between gap-3 pt-2">
                  <p className="text-xs text-muted-foreground">Blank fields clear nullable values.</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsEditingOrder(false)}
                      className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSavingOrder}
                      className="h-9 rounded-lg px-4 text-[11px] font-bold tracking-wider uppercase"
                    >
                      {isSavingOrder ? "Saving..." : "Save order changes"}
                    </Button>
                  </div>
                </div>
              </form>
            )
          )}
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-5">
        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur lg:col-span-3 dark:border-white/10 dark:bg-black/20">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Attendees</CardTitle>
            <CardDescription>Consolidated ticket data for this order</CardDescription>
            {attendeeLoadError && (
              <Alert variant="destructive" className="mt-4 rounded-xl">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-destructive">Attendee load failed</AlertTitle>
                <AlertDescription className="text-destructive/80">
                  {attendeeLoadError}
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent>
            {orderPayload.attendees.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/20 py-12 text-center">
                <Users className="mx-auto mb-3 size-10 opacity-10" />
                <p className="text-sm font-bold tracking-widest uppercase opacity-40">No attendees</p>
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
                      <TableHead className="h-10 text-[10px] font-black tracking-widest uppercase">
                        Ticket Type
                      </TableHead>
                      <TableHead className="h-10 text-right text-[10px] font-black tracking-widest uppercase">
                        Due
                      </TableHead>
                      <TableHead className="h-10 text-[10px] font-black tracking-widest uppercase">
                        Gender
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderPayload.attendees.map((attendee) => {
                      return (
                        <TableRow key={attendee.id} className="border-white/5">
                          <TableCell className="py-4 align-top">
                            <p className="text-sm font-bold">{attendee.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground/60">
                              {attendee.id}
                            </p>
                          </TableCell>
                          <TableCell className="py-4 align-top">
                            <Badge
                              variant="outline"
                              className="border-white/20 text-[10px] font-medium"
                            >
                              {attendee.ticketTypeLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 align-top">
                            <Select
                              value={attendeeEditDrafts[attendee.id]?.ticketTypeId ?? ""}
                              disabled={!areAttendeeDetailsHydrated}
                              onValueChange={(value) =>
                                setAttendeeEditDrafts((current) => ({
                                  ...current,
                                  [attendee.id]: {
                                    ...(current[attendee.id] ?? {
                                      genderType: "",
                                      ticketTypeId: "",
                                    }),
                                    ticketTypeId: value,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="h-9 rounded-lg bg-white/60 text-xs">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {ticketTypes.map((ticketType: { _id: string; label: string }) => (
                                  <SelectItem key={ticketType._id} value={ticketType._id}>
                                    {ticketType.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-4 align-top text-right">
                            <span className="text-sm font-black tabular-nums">
                              {formatMoney(attendee.amountDueMinor)}
                            </span>
                          </TableCell>
                          <TableCell className="py-4 align-top">
                            <Select
                              value={attendeeEditDrafts[attendee.id]?.genderType ?? ""}
                              disabled={!areAttendeeDetailsHydrated}
                              onValueChange={(value) =>
                                setAttendeeEditDrafts((current) => ({
                                  ...current,
                                  [attendee.id]: {
                                    genderType: value as AttendeeEditDraft["genderType"],
                                    ticketTypeId: current[attendee.id]?.ticketTypeId ?? "",
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="h-9 rounded-lg bg-white/60 text-xs">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MALE">MALE</SelectItem>
                                <SelectItem value="FEMALE">FEMALE</SelectItem>
                                <SelectItem value="MIXED">MIXED</SelectItem>
                                <SelectItem value="UNKNOWN">UNKNOWN</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <div className="border-t border-white/10 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-end gap-3">
                    {!areAttendeeDetailsHydrated ? (
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
                        Loading attendee details...
                      </p>
                    ) : (
                      orderPayload.attendees
                        .filter((attendee) => {
                          const draft = attendeeEditDrafts[attendee.id]
                          const snapshot = attendeeDetailSnapshots[attendee.id]

                          return (
                            !!draft &&
                            !!snapshot &&
                            (draft.genderType !== (snapshot.signals.genderType ?? "") ||
                              draft.ticketTypeId !== (snapshot.attendee.ticketTypeId ?? ""))
                          )
                        })
                        .map((attendee) => (
                          <Button
                            key={attendee.id}
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg text-[10px] font-bold tracking-wider uppercase"
                            disabled={savingAttendeeId === attendee.id}
                            onClick={() => void saveAttendeeDetails(attendee.id)}
                          >
                            Save
                          </Button>
                        ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur lg:col-span-2 dark:border-white/10 dark:bg-black/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">Assigned Payments</CardTitle>
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
                <p className="text-sm font-bold tracking-widest uppercase opacity-40">No payments</p>
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
                          <span className="truncate">{paymentSourceLabel(payment.source)}</span>
                          <span>•</span>
                          <span className="shrink-0">{formatDateTime(payment.paidAt)}</span>
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
                    <div className="mt-3 grid gap-2 text-[10px] text-muted-foreground sm:grid-cols-3">
                      <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                        <p className="font-black tracking-[0.2em] uppercase opacity-60">Source</p>
                        <p className="mt-1 font-medium text-foreground">{paymentSourceLabel(payment.source)}</p>
                      </div>
                      <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                        <p className="font-black tracking-[0.2em] uppercase opacity-60">Paid at</p>
                        <p className="mt-1 font-medium text-foreground">{formatDateTime(payment.paidAt)}</p>
                      </div>
                      <div className="rounded-xl bg-black/5 px-2.5 py-2 dark:bg-white/5">
                        <p className="font-black tracking-[0.2em] uppercase opacity-60">Status</p>
                        <p className="mt-1 font-medium text-foreground">{paymentStatusLabel(payment.status)}</p>
                      </div>
                    </div>
                    <div className="absolute -top-2 -right-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="size-7 rounded-full shadow-md"
                        onClick={() => {
                          setIsUnassigningId(payment.id)
                          void unassignPayment({ paymentId: payment.id as Id<"payments"> })
                            .catch((error) => {
                              console.error(error)
                            })
                            .finally(() => setIsUnassigningId(null))
                        }}
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
                          .filter((value): value is string => Boolean(value && value.trim()))
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

      {orderId && metrics && (
        <AssignPaymentSheet
          open={isAssignSheetOpen}
          onOpenChange={setIsAssignSheetOpen}
          orderId={orderId}
          outstandingAmountMinor={metrics.outstandingAmountMinor}
          bookerName={orderPayload?.order.bookerName ?? undefined}
        />
      )}
    </div>
  )
}
