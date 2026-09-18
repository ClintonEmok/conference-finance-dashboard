"use client"

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react"
import { useQuery } from "convex/react"
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Link as LinkIcon,
  Link2Off,
  Loader2,
  MousePointerClick,
  Search,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/convex/api"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import { useAssignPaymentToOrder, useLogReconciliationPayment, usePayments, useUnassignedPayments, useUnassignPayment } from "@/lib/convex/hooks/payments"
import { formatMoney } from "@/lib/format"
import { isOrderAppliedPayment } from "@/lib/domain/finance/amounts"
import { cn } from "@/lib/utils"
import type { Id, Doc } from "@/convex/_generated/dataModel"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

const SEARCH_DEBOUNCE_MS = 250

function PaymentAssignList({
  orderId,
  onAssigned,
  parentUnassignedPayments,
}: {
  orderId: string
  onAssigned: () => void
  parentUnassignedPayments?: AttentionQueryState<ReadonlyArray<Doc<"payments">>>
}) {
  const hasParentUnassignedPayments = parentUnassignedPayments !== undefined
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [searchQuery])

  const fallbackUnassignedPayments = useUnassignedPayments(
    !hasParentUnassignedPayments,
    debouncedSearch
  )
  const unassignedState = parentUnassignedPayments ?? (
    fallbackUnassignedPayments === undefined
      ? { status: "pending" as const }
      : { status: "ready" as const, data: fallbackUnassignedPayments }
  )
  const assignPayment = useAssignPaymentToOrder()
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  const filteredPayments = useMemo(() => {
    // The fallback query already searched the full bounded source range with
    // the server's punctuation/whitespace fold. Applying the old page-local
    // filter here would silently discard valid server matches. Parent hosts
    // own their read and therefore retain the historical client filter.
    if (!hasParentUnassignedPayments) {
      return unassignedState.status === "ready" ? unassignedState.data : []
    }
    if (unassignedState.status !== "ready" || !searchQuery.trim()) {
      return unassignedState.status === "ready" ? unassignedState.data : []
    }
    const query = searchQuery.trim().toLowerCase()
    return unassignedState.data.filter(
      (p: Doc<"payments">) =>
        p.payerName?.toLowerCase().includes(query) ||
        p.reference?.toLowerCase().includes(query) ||
        p.notes?.toLowerCase().includes(query) ||
        p.source?.toLowerCase().includes(query)
    )
  }, [hasParentUnassignedPayments, unassignedState, searchQuery])

  async function handleAssign(paymentId: Id<"payments">) {
    setAssigningId(paymentId)
    setAssignError(null)
    try {
      await assignPayment({ paymentId, orderId: orderId as Id<"orders"> })
      onAssigned()
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : "Failed to assign payment.")
    } finally {
      setAssigningId(null)
    }
  }

  if (unassignedState.status === "pending") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (unassignedState.status === "error") {
    return <DashboardQueryState state="error" message={unassignedState.message} className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" />
  }

  const unassignedPayments = unassignedState.data

  const isEmpty = (filteredPayments ?? []).length === 0

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {assignError ? <p role="alert" aria-live="assertive" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{assignError}</p> : null}
      <div className="shrink-0 space-y-3">
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Unassigned payments ({unassignedPayments.length})
        </p>
          <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Label htmlFor="unassigned-payment-search" className="sr-only">Search unassigned payments</Label>
          <Input
            id="unassigned-payment-search"
            placeholder="Search by name, reference, source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-border/50 py-12 text-center">
            <CreditCard className="mx-auto mb-3 size-8 text-muted-foreground/30" />
            <DashboardQueryState state="empty" message={searchQuery.trim() ? "No payments match your search." : "No unassigned payments."} />
          </div>
        ) : (
          (filteredPayments ?? unassignedPayments).map((p: Doc<"payments">) => (
            <article
              key={p._id}
              className="rounded-xl border border-border/40 bg-background/50 p-4 transition-all hover:border-primary/30"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    {p.payerName || "Unknown"}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[9px] font-black uppercase tracking-widest"
                    >
                      {p.source.replace("_", " ")}
                    </Badge>
                    <span>&middot;</span>
                    <span>
                      {new Date(p.paidAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-black tabular-nums text-foreground">
                  {formatMoney(p.amountMinor)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleAssign(p._id)}
                disabled={assigningId !== null}
                className="mt-3 h-8 w-full rounded-lg text-[10px] font-bold uppercase tracking-wider"
              >
                {assigningId === p._id ? (
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                ) : (
                  <LinkIcon className="mr-2 size-3.5" />
                )}
                Assign to order
              </Button>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function AssignedPaymentsList({
  orderId,
  onUnassigned,
}: {
  orderId: string
  onUnassigned: () => void
}) {
  const payments = usePayments({ orderId }) as Doc<"payments">[] | undefined
  const unassignPayment = useUnassignPayment()
  const [unassigningId, setUnassigningId] = useState<string | null>(null)

  const assignedPayments = useMemo(
    () =>
      (payments ?? []).filter(
        (p) => isOrderAppliedPayment(p)
      ),
    [payments]
  )

  async function handleUnassign(paymentId: Id<"payments">) {
    setUnassigningId(paymentId)
    try {
      await unassignPayment({ paymentId })
      onUnassigned()
    } catch {
      // handled by Convex retry
    } finally {
      setUnassigningId(null)
    }
  }

  if (payments === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (assignedPayments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 py-12 text-center">
        <CreditCard className="mx-auto mb-3 size-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">
          No assigned payments for this order.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        Assigned ({assignedPayments.length})
      </p>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {assignedPayments.map((p: Doc<"payments">) => (
          <article
            key={p._id}
            className="rounded-xl border border-border/40 bg-background/50 p-4 transition-all hover:border-destructive/30"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-bold text-foreground">
                  {p.payerName || "Unknown"}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                  <Badge
                    variant="secondary"
                    className="h-4 px-1.5 text-[9px] font-black uppercase tracking-widest"
                  >
                    {p.source.replace("_", " ")}
                  </Badge>
                  <span>&middot;</span>
                  <span>
                    {new Date(p.paidAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <p className="shrink-0 text-sm font-black tabular-nums text-foreground">
                {formatMoney(p.amountMinor)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleUnassign(p._id)}
              disabled={unassigningId !== null}
              className="mt-3 h-8 w-full rounded-lg text-[10px] font-bold uppercase tracking-wider text-destructive hover:text-destructive"
            >
              {unassigningId === p._id ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <Link2Off className="mr-2 size-3.5" />
              )}
              Detach
            </Button>
          </article>
        ))}
      </div>
    </div>
  )
}

function OrderAttendeeRows({ orderId }: { orderId: string }) {
  const data = useQuery(api.orders.getOrderWithAttendees, {
    orderId: orderId as Id<"orders">,
  })

  if (data === undefined) {
    return (
      <TableRow className="border-border/10 bg-muted/10">
        <TableCell colSpan={7} className="px-6 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </TableCell>
      </TableRow>
    )
  }

  if (!data?.attendees.length) {
    return null
  }

  return (
    <TableRow className="border-border/10 bg-muted/20">
        <TableCell colSpan={7} className="px-6 py-4">
        <div className="space-y-2 rounded-xl border border-border/30 bg-background/70 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Attendees
          </p>
          <div className="grid gap-2">
            {data.attendees.map((attendee) => (
              <div
                key={attendee.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {attendee.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {attendee.ticketTypeLabel}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {formatMoney(attendee.amountDueMinor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

export type ReconciliationOrderRow = {
  orderId: string
  eventTitle: string | null
  totalAmountMinor: number | null
  amountDueMinor: number | null
  matchedAmountMinor: number | undefined
  appliedAmountMinor: number | null | undefined
  donationAmountMinor: number | null | undefined
  outstandingAmountMinor: number | undefined
  normalizedStatus: CanonicalOrderStatus
  buyerName: string | null
  buyerEmail: string | null
  orderedAt: string | null
}

function knownOutstanding(row: ReconciliationOrderRow) {
  return typeof row.outstandingAmountMinor === "number"
    ? row.outstandingAmountMinor
    : null
}

function moneyDisplay(value: number | null | undefined) {
  return typeof value === "number" ? formatMoney(value) : "Unavailable"
}

function appliedMoneyDisplay(value: number | null | undefined) {
  return typeof value === "number" ? formatMoney(value) : "Unavailable"
}

type PageProps = {
  slug: string
  event: EventDashboardEvent
  reconciliation?: AttentionQueryState<ReadonlyArray<ReconciliationOrderRow>>
  unassignedPayments?: AttentionQueryState<ReadonlyArray<Doc<"payments">>>
}

export default function EventReconciliationPage({
  slug,
  event,
  reconciliation: parentReconciliation,
  unassignedPayments: parentUnassignedPayments,
}: PageProps) {
  const ordersQuery = useQuery(
    api.orders.getOrdersForReconciliation,
    parentReconciliation ? "skip" : { eventId: event._id }
  ) as ReconciliationOrderRow[] | undefined
  const reconciliationState = parentReconciliation ?? (
    ordersQuery === undefined
      ? { status: "pending" as const }
      : { status: "ready" as const, data: ordersQuery }
  )
  const resolvedOrders = reconciliationState.status === "ready" ? reconciliationState.data : undefined

  const [page, setPage] = useState(1)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrderSnapshot, setSelectedOrderSnapshot] = useState<ReconciliationOrderRow | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("link")
  const [source, setSource] = useState<"cash" | "bank_transfer" | "">("")
  const [amountString, setAmountString] = useState("")
  const [logPayerName, setLogPayerName] = useState("")
  const [paidAt, setPaidAt] = useState("")
  const [reference, setReference] = useState("")
  const [payerAccountNumber, setPayerAccountNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const logReconciliationPayment = useLogReconciliationPayment()
  const pageSize = 25

  const visibleOrders = useMemo(() => {
    const rows = resolvedOrders ?? []
    return rows
      .filter((row) => {
        const outstanding = knownOutstanding(row)
        return outstanding !== null && outstanding > 0
      })
      .sort((a, b) => knownOutstanding(b)! - knownOutstanding(a)!)
  }, [resolvedOrders])

  const hasUnresolvedBalances = Boolean(
    resolvedOrders?.some((row) => knownOutstanding(row) === null)
  )

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = visibleOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const liveSelectedOrder = resolvedOrders?.find((o) => o.orderId === selectedOrderId) ?? null
  const selectedOrder = liveSelectedOrder ?? selectedOrderSnapshot
  const selectedOrderIsStale = Boolean(
    selectedOrderSnapshot &&
      (!liveSelectedOrder ||
        knownOutstanding(liveSelectedOrder) === null ||
        knownOutstanding(liveSelectedOrder)! <= 0)
  )

  function totalOutstandingMinor() {
    if (hasUnresolvedBalances) return null
    return visibleOrders.reduce((sum, row) => sum + knownOutstanding(row)!, 0)
  }

  function handleRowClick(orderId: string) {
    setSelectedOrderId(orderId)
    setIsSheetOpen(true)
    setActiveTab("link")
    const order = visibleOrders.find((o) => o.orderId === orderId)
    if (order) {
      setSelectedOrderSnapshot(order)
      const outstanding = knownOutstanding(order)
      setAmountString(outstanding !== null && outstanding > 0 ? (outstanding / 100).toFixed(2) : "")
      setLogPayerName(order.buyerName || "")
      setSource("")
      setPaidAt("")
      setReference("")
      setPayerAccountNumber("")
      setNotes("")
      setFieldErrors({})
      setFormError(null)
      setStatusMessage(null)
    }
  }

  async function handleLogNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedOrderId || selectedOrderIsStale) {
      setFormError("This order is no longer outstanding. Close this form and choose another outstanding order.")
      return
    }
    const nextErrors: Record<string, string> = {}
    const normalizedPayerName = logPayerName.trim()
    const parsedAmount = amountString.trim()
    if (!selectedOrderId) nextErrors.order = "Select an outstanding order before logging a payment."
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(parsedAmount) || Number(parsedAmount) <= 0) {
      nextErrors.amount = "Enter a positive amount with up to two decimal places."
    }
    if (!source) nextErrors.source = "Select Cash or Bank transfer."
    if (!normalizedPayerName) nextErrors.payerName = "Payer name is required."
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      setFormError("Check the highlighted fields before logging a payment.")
      return
    }
    setIsCreating(true)
    setFormError(null)
    setFieldErrors({})
    setStatusMessage("Logging payment…")
    try {
      const [whole, fractional = ""] = parsedAmount.split(".")
      const amountMinor = Number(whole) * 100 + Number(fractional.padEnd(2, "0"))
      const optionalText = (value: string) => value.trim() || undefined
      await logReconciliationPayment({
        eventId: event._id,
        orderId: selectedOrderId as Id<"orders">,
        source: source as "cash" | "bank_transfer",
        payerName: normalizedPayerName,
        amountMinor,
        ...(paidAt ? { paidAt: Date.parse(`${paidAt}T00:00:00`) } : {}),
        ...(optionalText(payerAccountNumber) ? { payerAccountNumber: optionalText(payerAccountNumber) } : {}),
        ...(optionalText(reference) ? { reference: optionalText(reference) } : {}),
        ...(optionalText(notes) ? { notes: optionalText(notes) } : {}),
      })
      setStatusMessage("Payment logged.")
      setIsSheetOpen(false)
      setSelectedOrderId(null)
      setSelectedOrderSnapshot(null)
      setAmountString("")
      setLogPayerName("")
      setSource("")
      setPaidAt("")
      setReference("")
      setPayerAccountNumber("")
      setNotes("")
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Payment could not be logged. Check the required fields and try again.")
      setStatusMessage(null)
    } finally {
      setIsCreating(false)
    }
  }

  if (reconciliationState.status === "pending") {
    return (
      <DashboardQueryState state="loading" className="rounded-xl border border-border/60 bg-card p-6" />
    )
  }

  if (reconciliationState.status === "error") {
    return <DashboardQueryState state="error" message={reconciliationState.message} className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" />
  }

  return (
    <TooltipProvider>
    <div className="min-w-0 space-y-8">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
        <div className="min-w-0">
          <p className="font-semibold">Reconciliation</p>
          <p className="text-xs text-muted-foreground">Select an order to assign a payment or log a new one.</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{visibleOrders.length} outstanding order{visibleOrders.length === 1 ? "" : "s"}</span>
          <span className="font-semibold text-foreground">{moneyDisplay(totalOutstandingMinor())} outstanding</span>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-3">
        <div className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
          <div><p className="text-sm font-semibold">Choose an order</p><p className="mt-1 text-xs text-muted-foreground">Use Assign payment, or tap the row on a small screen.</p></div>
        </div>
        <div className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
          <div><p className="text-sm font-semibold">Link Existing</p><p className="mt-1 text-xs text-muted-foreground">Search the unmatched payment by name or reference.</p></div>
        </div>
        <div className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
          <div><p className="text-sm font-semibold">Assign to order</p><p className="mt-1 text-xs text-muted-foreground">The order balance updates after confirmation.</p></div>
        </div>
      </div>

      <article className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Order</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Contact person</TableHead>
                <TableHead className="px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase">Amount Due</TableHead>
                <TableHead className="px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase">Amount Paid</TableHead>
                <TableHead className="px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase">Amount Left</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Status</TableHead>
                 <TableHead className="hidden px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase sm:table-cell">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/20">
              {hasUnresolvedBalances ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12">
                    <DashboardQueryState state="unavailable" message="Some outstanding balances are unavailable." className="text-center" />
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12">
                    <DashboardQueryState state="empty" message="No outstanding orders." className="text-center" />
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <Fragment key={row.orderId}>
                     <TableRow
                       role="button"
                       tabIndex={0}
                       aria-label={`Assign a payment to ${row.buyerName || "this order"}`}
                       onClick={(event) => {
                         if ((event.target as HTMLElement).closest("a,button")) return
                         handleRowClick(row.orderId)
                       }}
                       onKeyDown={(event) => {
                         if (event.target !== event.currentTarget) return
                         if (event.key === "Enter" || event.key === " ") {
                           event.preventDefault()
                           handleRowClick(row.orderId)
                         }
                       }}
                       className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                     >
                       <TableCell className="px-6 py-5">
                         <button type="button" onClick={(event) => { event.stopPropagation(); handleRowClick(row.orderId) }} className="rounded font-mono text-left text-[10px] font-bold text-primary/70 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{row.orderId}</button>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.orderedAt
                            ? new Date(row.orderedAt).toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <div className="font-bold text-foreground">{row.buyerName || "Anonymous"}</div>
                        <div className="text-[11px] text-muted-foreground/60">{row.buyerEmail}</div>
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right font-bold tabular-nums">
                          {moneyDisplay(row.amountDueMinor)}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right font-bold tabular-nums text-emerald-600">
                           {appliedMoneyDisplay(row.appliedAmountMinor)}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right font-bold tabular-nums text-orange-600">
                          {moneyDisplay(row.outstandingAmountMinor)}
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                               aria-label={`Order status: ${row.normalizedStatus}`}
                              variant={row.normalizedStatus === "paid" ? "secondary" : row.normalizedStatus === "cancelled" ? "destructive" : "outline"}
                              className={cn(
                                "h-6 rounded-lg px-2 text-[10px] font-bold tracking-wider uppercase",
                                row.normalizedStatus === "paid" && "border-none bg-emerald-500/10 text-emerald-600",
                                row.normalizedStatus === "pending" && "border-none bg-orange-500/10 text-orange-600"
                              )}
                            >
                              {row.normalizedStatus}
                            </Badge>
                          </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10px]">
                              Use Assign payment to link an existing payment
                           </TooltipContent>
                        </Tooltip>
                       </TableCell>
                       <TableCell className="hidden px-6 py-5 text-right sm:table-cell">
                         <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           onClick={(event) => { event.stopPropagation(); handleRowClick(row.orderId) }}
                           className="h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                         >
                           <MousePointerClick className="mr-2 size-3.5" aria-hidden="true" />
                           Assign payment
                         </Button>
                       </TableCell>
                     </TableRow>
                    <OrderAttendeeRows orderId={row.orderId} />
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>

        {totalPages > 1 && (
          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border/30 bg-muted/20 px-4 py-5 md:px-8">
            <p className="text-xs font-medium text-muted-foreground">
              Showing <span className="text-foreground">{pageRows.length}</span> of{" "}
              <span className="text-foreground">{visibleOrders.length}</span> entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="h-9 rounded-xl px-4"
              >
                <ChevronLeft className="mr-2 size-4" /> Previous
              </Button>
              <div className="px-4 text-xs font-bold tracking-widest text-muted-foreground/60 uppercase">
                {currentPage} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                className="h-9 rounded-xl px-4"
              >
                Next <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </footer>
        )}
      </article>

      <Sheet open={isSheetOpen} onOpenChange={(open) => { if (!isCreating) setIsSheetOpen(open) }}>
        <SheetContent className="min-w-0 max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg font-bold">Assign Payment</SheetTitle>
            <SheetDescription>Link an existing payment or log a new payment for this order.</SheetDescription>
          </SheetHeader>

          {selectedOrder && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2 px-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="link">Link Existing</TabsTrigger>
                <TabsTrigger value="new">Log New</TabsTrigger>
              </TabsList>

              <div className="my-4 space-y-2 rounded-xl border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Order</span>
                  <span className="font-mono text-xs font-bold text-primary">{selectedOrder.orderId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Contact person</span>
                  <span className="text-sm font-bold">{selectedOrder.buyerName || "Anonymous"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Amount Due</span>
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {moneyDisplay(selectedOrder.amountDueMinor)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Amount Paid</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-emerald-600">
                       {appliedMoneyDisplay(selectedOrder.appliedAmountMinor)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Amount Left</span>
                  <span className="font-mono text-sm font-black text-orange-600">
                     {moneyDisplay(selectedOrder.outstandingAmountMinor)}
                  </span>
                </div>
              </div>

              <TabsContent value="link" className="space-y-6">
                <PaymentAssignList
                  orderId={selectedOrder.orderId}
                  onAssigned={() => setIsSheetOpen(false)}
                  parentUnassignedPayments={parentUnassignedPayments}
                />

                <AssignedPaymentsList
                  orderId={selectedOrder.orderId}
                  onUnassigned={() => {
                    // refetch happens automatically via hooks
                  }}
                />
              </TabsContent>

                <TabsContent value="new">
                 <form onSubmit={handleLogNew} aria-busy={isCreating} className="min-w-0 space-y-4">
                   {statusMessage ? <p role="status" aria-live="polite" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">{statusMessage}</p> : null}
                   {formError ? <p role="alert" aria-live="assertive" className="break-words rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p> : null}
                   {selectedOrderIsStale ? <p role="alert" aria-live="assertive" className="break-words rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">This order is no longer outstanding. Close this form and choose another outstanding order.</p> : null}
                   <fieldset disabled={isCreating || selectedOrderIsStale} className="min-w-0 space-y-4">
                     <div className="space-y-2"><Label htmlFor="reconciliation-payment-order">Order</Label><div id="reconciliation-payment-order" role="group" aria-label={`Order ${selectedOrder.orderId}, contact ${selectedOrder.buyerName || "Anonymous"}`} className="min-h-11 max-w-full break-words rounded-lg border border-input bg-muted/20 px-3 py-2 font-mono text-sm">{selectedOrder.orderId}</div></div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payment-amount">Amount ({event.currency})</Label><Input id="reconciliation-payment-amount" type="text" inputMode="decimal" value={amountString} onChange={(e) => setAmountString(e.target.value)} aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? "reconciliation-payment-amount-error" : undefined} className="min-h-11 font-mono" />{fieldErrors.amount ? <p id="reconciliation-payment-amount-error" className="text-sm text-destructive">{fieldErrors.amount}</p> : null}</div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payment-source">Payment source</Label><Select value={source} onValueChange={(value) => setSource(value as "cash" | "bank_transfer")}><SelectTrigger id="reconciliation-payment-source" className="min-h-11 w-full" aria-invalid={Boolean(fieldErrors.source)} aria-describedby={fieldErrors.source ? "reconciliation-payment-source-error" : undefined}><SelectValue placeholder="Select source" /></SelectTrigger><SelectContent><SelectItem value="cash"><span className="flex items-center text-sm font-medium"><Banknote className="mr-2 size-4 text-emerald-500" aria-hidden="true" />Cash</span></SelectItem><SelectItem value="bank_transfer"><span className="flex items-center text-sm font-medium"><Landmark className="mr-2 size-4 text-blue-500" aria-hidden="true" />Bank transfer</span></SelectItem></SelectContent></Select>{fieldErrors.source ? <p id="reconciliation-payment-source-error" className="text-sm text-destructive">{fieldErrors.source}</p> : null}</div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payer-name">Payer name</Label><Input id="reconciliation-payer-name" value={logPayerName} onChange={(e) => setLogPayerName(e.target.value)} aria-invalid={Boolean(fieldErrors.payerName)} aria-describedby={fieldErrors.payerName ? "reconciliation-payer-name-error" : undefined} className="min-h-11" />{fieldErrors.payerName ? <p id="reconciliation-payer-name-error" className="text-sm text-destructive">{fieldErrors.payerName}</p> : null}</div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payment-date">Payment date (optional)</Label><Input id="reconciliation-payment-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="min-h-11" /><p className="text-xs text-muted-foreground">Leave blank to use the current date and time.</p></div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payment-reference">Bank reference (optional)</Label><Input id="reconciliation-payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} className="min-h-11" /></div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payer-account">Payer account details (optional)</Label><Input id="reconciliation-payer-account" value={payerAccountNumber} onChange={(e) => setPayerAccountNumber(e.target.value)} className="min-h-11" /></div>
                     <div className="space-y-2"><Label htmlFor="reconciliation-payment-notes">Notes (optional)</Label><textarea id="reconciliation-payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-24 w-full max-w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
                     <p className="text-xs text-muted-foreground">Optional details are saved for reconciliation history.</p>
                     <Button type="submit" disabled={isCreating || selectedOrderIsStale} className="min-h-11 w-full font-bold uppercase tracking-wider text-[11px]">{isCreating ? <><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Logging payment…</> : "Log payment"}</Button>
                   </fieldset>
                 </form>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
       </Sheet>
       <p role="status" aria-live="polite" className="sr-only">{statusMessage}</p>
     </div>
    </TooltipProvider>
  )
}
