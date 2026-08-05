"use client"

import { Fragment, useMemo, useState } from "react"
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/convex/api"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"
import type { AttentionQueryState } from "@/lib/dashboard/workspace-attention"
import { useAssignPaymentToOrder, useCreatePayment, usePayments, useUnassignedPayments, useUnassignPayment } from "@/lib/convex/hooks/payments"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id, Doc } from "@/convex/_generated/dataModel"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

function PaymentAssignList({
  orderId,
  onAssigned,
  parentUnassignedPayments,
}: {
  orderId: string
  onAssigned: () => void
  parentUnassignedPayments?: AttentionQueryState<ReadonlyArray<Doc<"payments">>>
}) {
  const fallbackUnassignedPayments = useUnassignedPayments(!parentUnassignedPayments)
  const unassignedState = parentUnassignedPayments ?? (
    fallbackUnassignedPayments === undefined
      ? { status: "pending" as const }
      : { status: "ready" as const, data: fallbackUnassignedPayments }
  )
  const assignPayment = useAssignPaymentToOrder()
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [assignError, setAssignError] = useState<string | null>(null)

  const filteredPayments = useMemo(() => {
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
  }, [unassignedState, searchQuery])

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
        (p) => p.status === "auto_matched" || p.status === "manual_assignment"
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
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("link")
  const [source, setSource] = useState<"cash" | "bank_transfer">("cash")
  const [amountString, setAmountString] = useState("")
  const [logPayerName, setLogPayerName] = useState("")
  const [notes, setNotes] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const createPayment = useCreatePayment()
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

  const selectedOrder = visibleOrders.find((o) => o.orderId === selectedOrderId)

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
       const outstanding = knownOutstanding(order)
       setAmountString(outstanding !== null && outstanding > 0 ? (outstanding / 100).toFixed(2) : "")
      setLogPayerName(order.buyerName || "")
      setNotes("")
    }
  }

  async function handleLogNew(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOrderId) return
    setIsCreating(true)
    setFormError(null)
    try {
      const amountMinor = Math.round(parseFloat(amountString) * 100)
      await createPayment({
        source,
        payerName: logPayerName,
        amountMinor,
        paidAt: Date.now(),
        orderId: selectedOrderId,
        notes,
      })
      setIsSheetOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to log payment.")
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
          <p className="font-semibold">Outstanding order reconciliation</p>
          <p className="text-xs text-muted-foreground">Select an order to assign an existing payment or log cash/bank transfer.</p>
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
            <TableCaption>Outstanding event-scoped order reconciliation</TableCaption>
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
                          {moneyDisplay(row.matchedAmountMinor)}
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

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg font-bold">Assign Payment</SheetTitle>
          </SheetHeader>

          {selectedOrder && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
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
                     {moneyDisplay(selectedOrder.matchedAmountMinor)}
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
                <form onSubmit={handleLogNew} className="space-y-4">
                  {formError ? <p role="alert" aria-live="assertive" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p> : null}
                  <div className="space-y-2">
                    <Label htmlFor="reconciliation-payment-source">Payment Source</Label>
                    <Select value={source} onValueChange={(val: "cash" | "bank_transfer") => setSource(val)}>
                      <SelectTrigger id="reconciliation-payment-source">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">
                          <div className="flex items-center text-sm font-medium"><Banknote className="size-4 mr-2 text-emerald-500" /> Cash</div>
                        </SelectItem>
                        <SelectItem value="bank_transfer">
                          <div className="flex items-center text-sm font-medium"><Landmark className="size-4 mr-2 text-blue-500" /> Bank Transfer</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reconciliation-payment-amount">Amount (EUR)</Label>
                    <Input id="reconciliation-payment-amount" type="number" step="0.01" value={amountString} onChange={(e) => setAmountString(e.target.value)} required className="font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reconciliation-payer-name">Payer Name</Label>
                    <Input id="reconciliation-payer-name" value={logPayerName} onChange={(e) => setLogPayerName(e.target.value)} placeholder="E.g. John Doe" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reconciliation-reference-notes">Reference Notes</Label>
                    <Input id="reconciliation-reference-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
                  </div>
                  <Button type="submit" disabled={isCreating} className="w-full font-bold uppercase tracking-wider text-[11px]">
                    {isCreating ? <Loader2 className="size-4 animate-spin" /> : "Log New Payment"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </div>
    </TooltipProvider>
  )
}
