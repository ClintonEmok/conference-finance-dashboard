"use client"

import { Fragment, use, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Link as LinkIcon,
  Loader2,
  ShoppingBag,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/convex/api"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { useAssignPaymentToOrder, useUnassignedPayments } from "@/lib/convex/hooks/payments"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id, Doc } from "@/convex/_generated/dataModel"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

function PaymentAssignList({
  orderId,
  onAssigned,
}: {
  orderId: string
  onAssigned: () => void
}) {
  const unassignedPayments = useUnassignedPayments()
  const assignPayment = useAssignPaymentToOrder()
  const [assigningId, setAssigningId] = useState<string | null>(null)

  async function handleAssign(paymentId: Id<"payments">) {
    setAssigningId(paymentId)
    try {
      await assignPayment({ paymentId, orderId: orderId as Id<"orders"> })
      onAssigned()
    } catch {
      // handled by Convex retry
    } finally {
      setAssigningId(null)
    }
  }

  if (unassignedPayments === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (unassignedPayments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 py-12 text-center">
        <CreditCard className="mx-auto mb-3 size-8 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">
          No unassigned payments
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
        Unassigned payments ({unassignedPayments.length})
      </p>
      {unassignedPayments.map((p: Doc<"payments">) => (
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
      ))}
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
        <TableCell colSpan={6} className="px-6 py-4">
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
      <TableCell colSpan={6} className="px-6 py-4">
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

type OrderRow = {
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

type PageProps = {
  params: Promise<{ slug: string }>
}

export default function EventReconciliationPage({ params }: PageProps) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)

  const ordersQuery = useQuery(
    api.orders.getOrdersForReconciliation,
    event ? { eventId: event._id } : ("skip" as const)
  ) as OrderRow[] | undefined

  const [page, setPage] = useState(1)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const pageSize = 25

  const visibleOrders = useMemo(() => {
    const rows = ordersQuery ?? []
    return rows
      .filter((row) => (row.outstandingAmountMinor ?? row.amountDueMinor ?? 0) > 0)
      .sort((a, b) => (b.outstandingAmountMinor ?? b.amountDueMinor ?? 0) - (a.outstandingAmountMinor ?? a.amountDueMinor ?? 0))
  }, [ordersQuery])

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = visibleOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const selectedOrder = visibleOrders.find((o) => o.orderId === selectedOrderId)

  function totalOutstandingMinor() {
    return visibleOrders.reduce((sum, row) => sum + (row.outstandingAmountMinor ?? row.amountDueMinor ?? 0), 0)
  }

  function handleRowClick(orderId: string) {
    setSelectedOrderId(orderId)
    setIsSheetOpen(true)
  }

  if (event === undefined || ordersQuery === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">The slug &ldquo;{slug}&rdquo; does not exist.</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
    <div className="space-y-8">
      <header className="flex flex-col gap-4 px-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Reconciliation
            </h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Click a row to assign unassigned payments to an outstanding order
          </p>
        </div>
      </header>

      {visibleOrders.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-border/50 bg-card/40 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Outstanding Orders
                </p>
                <p className="mt-0.5 text-xl font-bold">{visibleOrders.length}</p>
              </div>
            </div>
          </article>
          <article className="rounded-xl border border-border/50 bg-card/40 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
                <Calendar className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Total Amount Left
                </p>
                <p className="mt-0.5 text-xl font-bold">{formatMoney(totalOutstandingMinor())}</p>
              </div>
            </div>
          </article>
        </div>
      )}

      <article className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Order</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Contact person</TableHead>
                <TableHead className="px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase">Amount Due</TableHead>
                <TableHead className="px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase">Amount Paid</TableHead>
                <TableHead className="px-6 py-4 text-right text-[10px] font-bold tracking-wider uppercase">Amount Left</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/20">
              {pageRows.length === 0 ? (
                    <TableRow>
                  <TableCell                   colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No outstanding orders
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <Fragment key={row.orderId}>
                    <TableRow
                      onClick={() => handleRowClick(row.orderId)}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="px-6 py-5">
                        <div className="font-mono text-[10px] font-bold text-primary/70">{row.orderId}</div>
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
                        {typeof row.amountDueMinor === "number"
                          ? formatMoney(row.amountDueMinor)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right font-bold tabular-nums text-emerald-600">
                        {typeof row.matchedAmountMinor === "number"
                          ? formatMoney(row.matchedAmountMinor)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right font-bold tabular-nums text-orange-600">
                        {typeof row.outstandingAmountMinor === "number"
                          ? formatMoney(row.outstandingAmountMinor)
                          : typeof row.amountDueMinor === "number"
                            ? formatMoney(row.amountDueMinor)
                            : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
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
                            Click row to assign
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                    <OrderAttendeeRows orderId={row.orderId} />
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-border/30 bg-muted/20 px-8 py-5">
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
        <SheetContent className="sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg font-bold">Assign Payment</SheetTitle>
          </SheetHeader>

          {selectedOrder && (
            <>
              <div className="mb-6 space-y-2 rounded-xl border border-border/40 bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Order
                  </span>
                  <span className="font-mono text-xs font-bold text-primary">
                    {selectedOrder.orderId}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Contact person
                  </span>
                  <span className="text-sm font-bold">
                    {selectedOrder.buyerName || "Anonymous"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Amount Due
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {typeof selectedOrder.amountDueMinor === "number"
                      ? formatMoney(selectedOrder.amountDueMinor)
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Amount Paid
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-emerald-600">
                    {typeof selectedOrder.matchedAmountMinor === "number"
                      ? formatMoney(selectedOrder.matchedAmountMinor)
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Amount Left
                  </span>
                  <span className="font-mono text-sm font-black text-orange-600">
                    {typeof selectedOrder.outstandingAmountMinor === "number"
                      ? formatMoney(selectedOrder.outstandingAmountMinor)
                      : typeof selectedOrder.amountDueMinor === "number"
                        ? formatMoney(selectedOrder.amountDueMinor)
                        : "—"}
                  </span>
                </div>
              </div>

              <PaymentAssignList
                orderId={selectedOrder.orderId}
                onAssigned={() => setIsSheetOpen(false)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
    </TooltipProvider>
  )
}
