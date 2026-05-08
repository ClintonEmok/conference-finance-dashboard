"use client"

import { use, useEffect, useMemo, useState, type FormEvent } from "react"
import { useQuery } from "convex/react"
import { CheckCircle2, Calendar, Filter, HandCoins, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/convex/api"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id } from "@/convex/_generated/dataModel"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type PaymentRow = {
  _id: string
  payerName: string
  amountMinor: number
  status: string | null
}

type OrderRow = {
  orderId: string
  eventTitle: string | null
  amountDueMinor: number | null
  normalizedStatus: CanonicalOrderStatus
}

type PageProps = {
  params: Promise<{ slug: string }>
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toIsoBoundary(value: string, boundary: "start" | "end") {
  if (!value.trim()) return null
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"
  const parsed = new Date(`${value}${suffix}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export default function EventReconciliationPage({ params }: PageProps) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)

  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    return toDateInputValue(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000))
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)
  const [appliedStatus, setAppliedStatus] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [hiddenPaymentIds, setHiddenPaymentIds] = useState<string[]>([])
  const [hiddenOrderIds, setHiddenOrderIds] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const dateValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromInput, "start")
    const toIso = toIsoBoundary(toInput, "end")
    if (!fromIso || !toIso) return "Select valid from/to dates."
    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }
    return null
  }, [fromInput, toInput])

  const fromIso = toIsoBoundary(appliedFrom, "start") ?? undefined
  const toIso = toIsoBoundary(appliedTo, "end") ?? undefined

  const paymentsQuery = useQuery(api.payments.getUnassignedPayments) as
    | PaymentRow[]
    | undefined
  const ordersQuery = useQuery(
    api.orders.getOrdersForReconciliation,
    event
      ? {
          eventId: event._id,
          from: fromIso ? new Date(fromIso).getTime() : undefined,
          to: toIso ? new Date(toIso).getTime() : undefined,
          status: appliedStatus === "all" ? undefined : appliedStatus,
        }
      : ("skip" as const)
  ) as OrderRow[] | undefined

  useEffect(() => {
    if (!successMessage) return
    const timer = window.setTimeout(() => setSuccessMessage(null), 3000)
    return () => window.clearTimeout(timer)
  }, [successMessage])

  const visiblePayments = useMemo(() => {
    const rows = paymentsQuery ?? []
    return rows.filter((payment) => !hiddenPaymentIds.includes(payment._id))
  }, [hiddenPaymentIds, paymentsQuery])

  const visibleOrders = useMemo(() => {
    const rows = ordersQuery ?? []
    return rows.filter((row) => !hiddenOrderIds.includes(row.orderId))
  }, [hiddenOrderIds, ordersQuery])

  const selectedPayment =
    visiblePayments.find((payment) => payment._id === selectedPaymentId) ?? null
  const selectedOrder =
    visibleOrders.find((row) => row.orderId === selectedOrderId) ?? null

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dateValidationError) return
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setAppliedStatus(statusInput)
    setSelectedPaymentId(null)
    setSelectedOrderId(null)
  }

  async function matchPayment() {
    if (!selectedPayment || !selectedOrder) return

    const matchSummary = [
      `Payment: ${selectedPayment.payerName} — ${formatMoney(selectedPayment.amountMinor)}`,
      `Order: ${selectedOrder.orderId} — ${formatMoney(selectedOrder.amountDueMinor ?? 0)}`,
      `Matched amount: ${formatMoney(Math.min(selectedPayment.amountMinor, selectedOrder.amountDueMinor ?? 0))}`,
      `Allocation record: payment ${selectedPayment._id} -> order ${selectedOrder.orderId}`,
    ].join("\n")

    if (!window.confirm(`${matchSummary}\n\nConfirm Match payment?`)) {
      return
    }

    setErrorMessage(null)

    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(selectedPayment._id)}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedOrder.orderId }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(body?.error?.message ?? "Failed to match payment.")
      }

      setHiddenPaymentIds((current) => [...current, selectedPayment._id])
      setHiddenOrderIds((current) => [...current, selectedOrder.orderId])
      setSelectedPaymentId(null)
      setSelectedOrderId(null)
      setSuccessMessage("Payment matched successfully.")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to match payment.")
    }
  }

  if (event === undefined || paymentsQuery === undefined || ordersQuery === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[640px] rounded-2xl" />
          <Skeleton className="h-[640px] rounded-2xl" />
        </div>
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">The slug “{slug}” does not exist.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          Could not load canonical money data. Check your network and retry.
          <div className="mt-1 text-xs opacity-80">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="mr-2 inline size-4" /> {successMessage}
        </div>
      )}

      <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Reconciliation
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {event.slug}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{event.title} · split-screen payment matching</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
          Selected: {selectedPaymentId && selectedOrderId ? "Ready to match" : "Choose one payment and one order"}
        </div>
      </header>

      <article className="rounded-xl border border-border/50 bg-card/40 p-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Filter className="size-3" /> Status
            </label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value as any)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="min-w-[280px] flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Calendar className="size-3" /> Date range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
              />
              <input
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
              />
            </div>
          </div>

          <Button type="submit" disabled={Boolean(dateValidationError)} className="h-11 rounded-2xl px-8">
            Apply Filters
          </Button>
        </form>
        {dateValidationError && (
          <p className="mt-3 px-1 text-[11px] font-bold text-destructive">{dateValidationError}</p>
        )}
      </article>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
          <div className="sticky top-0 z-10 border-b border-border/30 bg-muted/80 px-5 py-4 backdrop-blur">
            <h2 className="text-sm font-bold tracking-widest uppercase">Unmatched payments</h2>
          </div>
          <div className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                      No records match these filters
                    </TableCell>
                  </TableRow>
                ) : (
                  visiblePayments.map((payment) => (
                    <TableRow
                      key={payment._id}
                      onClick={() => setSelectedPaymentId(payment._id)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/30",
                        selectedPaymentId === payment._id && "bg-primary/10"
                      )}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">{payment.payerName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{payment._id}</div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{formatMoney(payment.amountMinor)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {payment.status ?? "unassigned"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
          <div className="sticky top-0 z-10 border-b border-border/30 bg-muted/80 px-5 py-4 backdrop-blur">
            <h2 className="text-sm font-bold tracking-widest uppercase">Amount left orders</h2>
          </div>
          <div className="max-h-[640px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Amount left</TableHead>
                  <TableHead>Amount left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                      No records match these filters
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleOrders.map((order) => (
                    <TableRow
                      key={order.orderId}
                      onClick={() => setSelectedOrderId(order.orderId)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/30",
                        selectedOrderId === order.orderId && "bg-primary/10"
                      )}
                    >
                      <TableCell>
                        <div className="font-medium text-foreground">{order.eventTitle ?? event.title}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{order.orderId}</div>
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">{formatMoney(order.amountDueMinor ?? 0)}</TableCell>
                      <TableCell className="font-mono tabular-nums text-orange-600">{formatMoney(order.amountDueMinor ?? 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {selectedPayment && selectedOrder && (
        <div className="sticky bottom-4 z-20 rounded-2xl border border-border/50 bg-background/90 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Match payment <span className="font-medium text-foreground">{selectedPayment.payerName}</span> to order <span className="font-mono text-foreground">{selectedOrder.orderId}</span>
            </div>
            <Button onClick={() => void matchPayment()} className="h-11 rounded-2xl px-6">
              {errorMessage ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Match payment
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
