"use client"

import Link from "next/link"
import {
  ArrowRight,
  CircleAlert,
  HandCoins,
  SearchCheck,
  Wallet,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Plus,
  RefreshCw,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"

import { OrderAttendeeBreakdown } from "@/components/dashboard/order-attendee-breakdown"
import { PaymentList } from "@/components/payments/payment-list"
import { AssignDialog } from "@/components/payments/assign-dialog"
import { ManualPaymentEntryForm } from "@/components/payments/manual-entry-form"
import { buildReconciliationFollowUpHref } from "@/lib/domain/finance/reconciliation-follow-up"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type ReconciliationPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: Array<{
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    normalizedStatus: CanonicalOrderStatus
    totalAmountMinor: number
    currency: string | null
    orderedAt: string | null
    refundedAt: string | null
    outstandingMinor: number
    reasons: Array<
      | "pending-payment"
      | "cancelled-with-amount"
      | "missing-amount"
      | "refund-without-refunded-at"
    >
  }>
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toIsoBoundary(value: string, boundary: "start" | "end") {
  if (!value.trim()) {
    return null
  }

  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"
  const parsed = new Date(`${value}${suffix}`)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatReason(reason: string) {
  switch (reason) {
    case "pending-payment":
      return "Outstanding pending payment"
    case "cancelled-with-amount":
      return "Cancelled order still has amount"
    case "missing-amount":
      return "Missing amount"
    case "refund-without-refunded-at":
      return "Refunded status missing refunded timestamp"
    default:
      return reason
  }
}

export default function ReconciliationPage() {
  const [eventIdInput, setEventIdInput] = useState("")
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedStatus, setAppliedStatus] = useState<
    "all" | CanonicalOrderStatus
  >("all")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReconciliationPayload | null>(null)
  const [resolvedAttendeeIdsByOrderId, setResolvedAttendeeIdsByOrderId] =
    useState<Record<string, string>>({})

  const handleResolvedAttendeeId = useCallback(
    ({
      providerOrderId,
      attendeeId,
    }: {
      providerOrderId: string
      attendeeId: string | null
    }) => {
      setResolvedAttendeeIdsByOrderId((previous) => {
        const trimmedAttendeeId = attendeeId?.trim() || null

        if (!trimmedAttendeeId) {
          if (!(providerOrderId in previous)) {
            return previous
          }

          const next = { ...previous }
          delete next[providerOrderId]
          return next
        }

        if (previous[providerOrderId] === trimmedAttendeeId) {
          return previous
        }

        return {
          ...previous,
          [providerOrderId]: trimmedAttendeeId,
        }
      })
    },
    []
  )

  const dateValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromInput, "start")
    const toIso = toIsoBoundary(toInput, "end")

    if (!fromIso || !toIso) {
      return "Select valid from/to dates."
    }

    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }

    return null
  }, [fromInput, toInput])

  useEffect(() => {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    if (!fromIso || !toIso) {
      setErrorMessage("Active filter dates are invalid.")
      setPayload(null)
      setIsLoading(false)
      return
    }

    const safeFromIso = fromIso
    const safeToIso = toIso
    const controller = new AbortController()

    async function loadReconciliation() {
      setIsLoading(true)
      setErrorMessage(null)
      setResolvedAttendeeIdsByOrderId({})

      try {
        const query = new URLSearchParams()
        query.set("from", safeFromIso)
        query.set("to", safeToIso)

        if (appliedEventId.trim()) {
          query.set("eventId", appliedEventId.trim())
        }

        if (appliedStatus !== "all") {
          query.set("status", appliedStatus)
        }

        const response = await fetch(
          `/api/dashboard/reconciliation?${query.toString()}`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          setPayload(null)
          setErrorMessage(
            body?.error?.message ??
              `Failed to load reconciliation data (${response.status}).`
          )
          return
        }

        const body = (await response.json()) as ReconciliationPayload
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }

        setPayload(null)
        setErrorMessage("Network error while loading reconciliation rows.")
      } finally {
        setIsLoading(false)
      }
    }

    loadReconciliation()

    return () => {
      controller.abort()
    }
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (dateValidationError) {
      setErrorMessage(dateValidationError)
      return
    }

    setAppliedEventId(eventIdInput)
    setAppliedStatus(statusInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
  }

  return (
    <section className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <Card className="border border-border p-6 md:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Outstanding balances
              </p>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground md:text-[2rem]">
                Resolve the orders that still need payment or operator
                attention.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Start here when a balance needs action, then carry the order
                context straight into attendee follow-up and room assignment.
              </p>
            </div>

            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 sm:grid-rows-2">
              <div className="rounded-lg border border-border bg-muted/40 p-4 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Flagged rows</p>
                <p className="mt-1.5 text-2xl font-semibold text-foreground">
                  {payload?.totals.rows ?? "--"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="mt-1.5 text-base font-semibold text-foreground">
                  {payload
                    ? formatMoney(payload.totals.outstandingMinor)
                    : "--"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Status view</p>
                <p className="mt-1.5 text-base font-semibold text-foreground">
                  {appliedStatus === "all" ? "All" : appliedStatus}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-white/10 dark:text-primary-foreground">
                <SearchCheck className="size-5" />
              </span>
              <div>
                <CardDescription className="text-[11px] font-semibold tracking-[0.2em] text-primary/70 uppercase">
                  Refine list
                </CardDescription>
                <CardTitle className="mt-1 text-lg">
                  Find the balances that need attention
                </CardTitle>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={applyFilters}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    Event ID
                  </span>
                  <select
                    value={eventIdInput}
                    onChange={(event) => setEventIdInput(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  >
                    <option value="">All events</option>
                    {(payload?.availableEvents ?? []).map((event) => (
                      <option
                        key={event.providerEventId}
                        value={event.providerEventId}
                      >
                        {event.name?.trim() || event.providerEventId}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    Status
                  </span>
                  <select
                    value={statusInput}
                    onChange={(event) =>
                      setStatusInput(
                        event.target.value as "all" | CanonicalOrderStatus
                      )
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="pending">Pending</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    From
                  </span>
                  <input
                    type="date"
                    value={fromInput}
                    onChange={(event) => setFromInput(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    To
                  </span>
                  <input
                    type="date"
                    value={toInput}
                    onChange={(event) => setToInput(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  />
                </label>
              </div>

              {dateValidationError && (
                <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
                  {dateValidationError}
                </p>
              )}

              <Button
                className="h-10 w-full rounded-md text-xs"
                type="submit"
                disabled={Boolean(dateValidationError) || isLoading}
              >
                {isLoading ? "Loading..." : "Apply follow-up filters"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                <HandCoins className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Outstanding
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {payload
                    ? formatMoney(payload.totals.outstandingMinor)
                    : "--"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                <CircleAlert className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Flagged rows
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {payload?.totals.rows ?? "--"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-5 text-sm leading-5 text-muted-foreground">
            Open attendee follow-up from any row to preserve order context and
            avoid backtracking.
          </CardContent>
        </Card>
      </section>

      {errorMessage && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {!errorMessage && isLoading && (
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-[150px]" />
              <div className="flex flex-col gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-16 w-[120px]" />
                    <Skeleton className="h-16 w-[100px]" />
                    <Skeleton className="h-16 w-[70px]" />
                    <Skeleton className="h-16 w-[80px]" />
                    <Skeleton className="h-16 w-[80px]" />
                    <Skeleton className="h-16 w-[150px]" />
                    <Skeleton className="h-16 w-[100px]" />
                    <Skeleton className="h-16 w-[120px]" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!errorMessage && !isLoading && payload && (
        <Card className="border border-border">
          <CardContent className="p-4 lg:p-6">
            {payload.rows.length === 0 ? (
              <p className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
                No outstanding or mismatch candidates found for the selected
                filters.
              </p>
            ) : (
              <>
                <div className="hidden md:block">
                  <div className="grid gap-4 lg:grid-cols-2">
                    {payload.rows.map((row) => {
                      const followUpHref = buildReconciliationFollowUpHref({
                        attendeeId:
                          resolvedAttendeeIdsByOrderId[row.providerOrderId] ??
                          null,
                        providerOrderId: row.providerOrderId,
                        providerEventId: row.providerEventId,
                      })

                      return (
                        <Card
                          key={row.providerOrderId}
                          className="flex flex-col gap-3 border border-border p-4"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mono text-xs font-medium text-foreground">
                                {row.providerOrderId}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {row.eventName ?? "Unknown event"}
                              </p>
                              {row.orderedAt && (
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {new Date(row.orderedAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant={
                                row.normalizedStatus === "cancelled"
                                  ? "destructive"
                                  : row.normalizedStatus === "refunded"
                                    ? "outline"
                                    : "secondary"
                              }
                              className="shrink-0 capitalize"
                            >
                              {row.normalizedStatus}
                            </Badge>
                          </div>

                          <div className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
                            <div>
                              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                                Amount
                              </p>
                              <p className="mt-0.5 text-sm text-foreground">
                                {formatMoney(row.totalAmountMinor)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                                Outstanding
                              </p>
                              <p className="mt-0.5 text-base font-semibold text-foreground">
                                {formatMoney(row.outstandingMinor)}
                              </p>
                            </div>
                          </div>

                          {row.reasons.length > 0 && (
                            <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                              {row.reasons.map((reason) => (
                                <li key={reason}>{formatReason(reason)}</li>
                              ))}
                            </ul>
                          )}

                          <OrderAttendeeBreakdown
                            orderId={row.providerOrderId}
                            eventId={row.providerEventId}
                            onResolvedAttendeeId={handleResolvedAttendeeId}
                          />

                          <div className="flex flex-col gap-1.5 border-t border-border/50 pt-1">
                            <Button
                              asChild
                              className="h-9 justify-between rounded-md px-3 text-[11px]"
                              size="sm"
                            >
                              <Link href={followUpHref}>
                                Open attendee follow-up
                                <ArrowRight className="size-4" />
                              </Link>
                            </Button>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>

                <div className="block divide-y divide-border md:hidden">
                  {payload.rows.map((row) => {
                    const followUpHref = buildReconciliationFollowUpHref({
                      attendeeId:
                        resolvedAttendeeIdsByOrderId[row.providerOrderId] ??
                        null,
                      providerOrderId: row.providerOrderId,
                      providerEventId: row.providerEventId,
                    })

                    return (
                      <div
                        key={row.providerOrderId}
                        className="flex flex-col gap-3 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs text-foreground">
                              {row.providerOrderId}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.eventName ?? "Unknown event"}
                            </p>
                          </div>
                          <Badge
                            variant={
                              row.normalizedStatus === "cancelled"
                                ? "destructive"
                                : row.normalizedStatus === "refunded"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {row.normalizedStatus}
                          </Badge>
                        </div>

                        <div className="flex items-baseline justify-between gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Amount
                            </p>
                            <p className="text-sm text-foreground">
                              {formatMoney(row.totalAmountMinor)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Outstanding
                            </p>
                            <p className="text-base font-semibold text-foreground">
                              {formatMoney(row.outstandingMinor)}
                            </p>
                          </div>
                        </div>

                        {row.reasons.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {row.reasons.map((reason) => (
                              <p key={reason}>{formatReason(reason)}</p>
                            ))}
                          </div>
                        )}

                        <OrderAttendeeBreakdown
                          orderId={row.providerOrderId}
                          eventId={row.providerEventId}
                          onResolvedAttendeeId={handleResolvedAttendeeId}
                        />

                        <div className="flex flex-col gap-2 pt-1">
                          <Button
                            asChild
                            className="w-full justify-between rounded-md text-xs"
                            size="sm"
                          >
                            <Link href={followUpHref}>
                              Open attendee follow-up
                              <ArrowRight className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Reconciliation Section */}
      <PaymentReconciliationSection />
    </section>
  )
}

type PaymentSource = "tikkie" | "bank_transfer" | "cash"
type PaymentMatchStatus =
  | "unassigned"
  | "ambiguous"
  | "manual_assignment"
  | "auto_matched"

type OrderPaymentStatus = "unassigned" | "partial" | "paid" | "overpaid"

type PaymentSummary = {
  summary: {
    unassigned: number
    partial: number
    paid: number
    overpaid: number
    totalOrders: number
  }
  totalAmountMinor: number
  bySource: {
    tikkie: number
    bank_transfer: number
    cash: number
  }
  legacyPaymentStatus?: {
    unassigned: number
    ambiguous: number
    manual_assignment: number
    auto_matched: number
  }
}

type Payment = {
  id: string
  source: PaymentSource
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
  status: PaymentMatchStatus
}

function PaymentReconciliationSection() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    async function loadSummary() {
      try {
        const response = await fetch("/api/reconciliation")
        if (response.ok) {
          const data = await response.json()
          setSummary(data)
        }
      } catch (error) {
        console.error("Failed to load payment summary:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSummary()
  }, [])

  async function handleSyncTikkie() {
    setIsSyncing(true)
    try {
      // Call the Tikkie sync API to sync payments and run auto-match
      const response = await fetch("/api/payments/tikkie/sync", {
        method: "POST",
      })
      if (!response.ok) {
        console.error("Tikkie sync failed:", response.status)
      }
      // Reload summary after sync
      const summaryResponse = await fetch("/api/reconciliation")
      if (summaryResponse.ok) {
        const data = await summaryResponse.json()
        setSummary(data)
      }
    } catch (error) {
      console.error("Failed to sync Tikkie payments:", error)
    } finally {
      setIsSyncing(false)
    }
  }

  function handleAssign(payment: Payment) {
    setSelectedPayment(payment)
    setAssignDialogOpen(true)
  }

  function handleAssigned() {
    // Reload summary and list
    window.location.reload()
  }

  function formatMoney(minor: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100)
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Wallet className="size-5" />
        <h2 className="text-xl font-semibold">Payment Reconciliation</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">
                <AlertCircle className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Unassigned
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {isLoading ? "--" : (summary?.summary.unassigned ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  No payments linked
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <HelpCircle className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Partial
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {isLoading ? "--" : (summary?.summary.partial ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Partially paid
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Paid
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {isLoading ? "--" : (summary?.summary.paid ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">Fully paid</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <CircleAlert className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Overpaid
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {isLoading ? "--" : (summary?.summary.overpaid ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Excess payment
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setShowEntryForm(!showEntryForm)}
          className="gap-2"
        >
          <Plus className="size-4" />
          Add Payment
        </Button>
        <Button
          variant="outline"
          onClick={handleSyncTikkie}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Tikkie"}
        </Button>
      </div>

      {/* Manual Entry Form */}
      {showEntryForm && (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle>Record Manual Payment</CardTitle>
            <CardDescription>
              Enter bank transfer or cash payment details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManualPaymentEntryForm
              onSuccess={() => {
                setShowEntryForm(false)
                window.location.reload()
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Payment List */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            All payments with filtering by status and source
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentList onAssign={handleAssign} />
        </CardContent>
      </Card>

      {/* Assign Dialog */}
      {selectedPayment && (
        <AssignDialog
          payment={selectedPayment}
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          onAssigned={handleAssigned}
        />
      )}
    </section>
  )
}
