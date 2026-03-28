"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type PaymentSource = "tikkie" | "bank_transfer" | "cash"
type PaymentMatchStatus =
  | "unassigned"
  | "ambiguous"
  | "manual_assignment"
  | "auto_matched"

type Payment = {
  id: string
  source: PaymentSource
  sourceId: string | null
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
  orderId: string | null
  status: PaymentMatchStatus
  matchedAt: string | null
  matchedBy: string | null
  reference: string | null
  notes: string | null
  createdAt: string
  order: {
    id: string
    providerOrderId: string
    buyerName: string
    totalAmountMinor: number
  } | null
}

type PaymentListProps = {
  filters?: {
    status?: PaymentMatchStatus
    source?: PaymentSource
  }
  onAssign?: (payment: Payment) => void
  refreshKey?: number
}

import { formatMoney } from "@/lib/format"

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function SourceIcon({ source }: { source: PaymentSource }) {
  const styles = {
    tikkie: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    bank_transfer: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    cash: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  }
  const label =
    source === "bank_transfer" ? "Bank" : source.charAt(0) + source.slice(1)

  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
        styles[source]
      )}
    >
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: PaymentMatchStatus }) {
  switch (status) {
    case "unassigned":
      return (
        <Badge
          variant="outline"
          className="h-6 rounded-lg border-slate-500/20 bg-slate-500/5 text-[10px] font-bold tracking-widest text-slate-500 uppercase"
        >
          Unassigned
        </Badge>
      )
    case "ambiguous":
      return (
        <Badge
          variant="outline"
          className="h-6 rounded-lg border-indigo-500/20 bg-indigo-500/5 text-[10px] font-bold tracking-widest text-indigo-500 uppercase"
        >
          Ambiguous
        </Badge>
      )
    case "manual_assignment":
      return (
        <Badge
          variant="outline"
          className="h-6 rounded-lg border-blue-500/20 bg-blue-500/5 text-[10px] font-bold tracking-widest text-blue-600 uppercase"
        >
          Manual
        </Badge>
      )
    case "auto_matched":
      return (
        <Badge
          variant="outline"
          className="h-6 rounded-lg border-emerald-500/20 bg-emerald-500/5 text-[10px] font-bold tracking-widest text-emerald-600 uppercase"
        >
          Auto
        </Badge>
      )
  }
}

export function PaymentList({
  filters,
  onAssign,
  refreshKey,
}: PaymentListProps) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>(
    filters?.status || "all"
  )
  const [sourceFilter, setSourceFilter] = useState<string>(
    filters?.source || "all"
  )
  const limit = 20

  useEffect(() => {
    async function loadPayments() {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("page", page.toString())
        params.set("limit", limit.toString())

        if (statusFilter && statusFilter !== "all") {
          params.set("status", statusFilter)
        }
        if (sourceFilter && sourceFilter !== "all") {
          params.set("source", sourceFilter)
        }

        const response = await fetch(`/api/payments?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          setPayments(data.payments)
          setTotal(data.total)
        }
      } catch (error) {
        console.error("Failed to load payments:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPayments()
  }, [page, statusFilter, sourceFilter, refreshKey])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 w-[180px] rounded-lg border border-border/50 bg-background/50 px-3 text-xs font-bold tracking-wider text-muted-foreground uppercase transition-all hover:bg-muted/50 focus:ring-1 focus:ring-primary/20"
        >
          <option value="all">All statuses</option>
          <option value="unassigned">Unassigned</option>
          <option value="ambiguous">Ambiguous</option>
          <option value="manual_assignment">Manual</option>
          <option value="auto_matched">Auto-matched</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-10 w-[180px] rounded-lg border border-border/50 bg-background/50 px-3 text-xs font-bold tracking-wider text-muted-foreground uppercase transition-all hover:bg-muted/50 focus:ring-1 focus:ring-primary/20"
        >
          <option value="all">All sources</option>
          <option value="tikkie">Tikkie</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cash">Cash</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50 bg-background/50 shadow-sm backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 px-2 hover:bg-transparent">
              <TableHead className="h-10 px-6 text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Date
              </TableHead>
              <TableHead className="h-10 text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Source
              </TableHead>
              <TableHead className="h-10 text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Payer Relation
              </TableHead>
              <TableHead className="h-10 text-right text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Settlement
              </TableHead>
              <TableHead className="h-10 text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Status
              </TableHead>
              <TableHead className="h-10 text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Matching ID
              </TableHead>
              <TableHead className="h-10 px-6 text-right text-[10px] font-black tracking-[0.2em] text-muted-foreground/40 uppercase">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-border/30 px-2">
                  <TableCell className="px-6 py-4">
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-5 w-12 rounded-md" />
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-2.5 w-32" />
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex justify-end">
                      <Skeleton className="h-4 w-14" />
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Skeleton className="h-6 w-20 rounded-lg" />
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-1.5 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-2.5 w-20" />
                        <Skeleton className="h-2 w-16" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="flex justify-end">
                      <Skeleton className="h-8 w-16 rounded-lg" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 px-6 text-center">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase">
                    No transaction data recorded
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow
                  key={payment.id}
                  className="group border-border/30 px-2 transition-colors hover:bg-muted/30"
                >
                  <TableCell className="px-6 py-4 text-[11px] font-bold text-muted-foreground">
                    {formatDate(payment.paidAt)}
                  </TableCell>
                  <TableCell className="py-4">
                    <SourceIcon source={payment.source} />
                  </TableCell>
                  <TableCell className="py-4">
                    <div>
                      <p className="text-xs leading-none font-bold text-foreground">
                        {payment.payerName}
                      </p>
                      <p className="mt-1 max-w-[120px] truncate text-[10px] leading-none text-muted-foreground/60">
                        {payment.payerAccountNumber || "Account hidden"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <span className="text-sm font-black tracking-tight text-foreground">
                      {formatMoney(payment.amountMinor)}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <StatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell className="py-4">
                    {payment.order ? (
                      <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                        <div>
                          <p className="text-[10px] leading-none font-black tracking-widest text-foreground uppercase">
                            {payment.order.providerOrderId}
                          </p>
                          <p className="mt-1 max-w-[100px] truncate text-[10px] leading-none text-muted-foreground/60">
                            {payment.order.buyerName}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 opacity-30">
                        <div className="size-1.5 rounded-full bg-muted-foreground" />
                        <span className="text-[10px] font-black tracking-widest uppercase">
                          Unlinked
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    {(payment.status === "unassigned" ||
                      payment.status === "ambiguous") &&
                    onAssign ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAssign(payment)}
                        className="h-8 rounded-lg border-primary/20 text-[10px] font-black tracking-widest uppercase opacity-0 transition-all group-hover:opacity-100 hover:bg-primary/5 hover:text-primary"
                      >
                        Assign
                      </Button>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 text-[10px] font-black tracking-widest text-emerald-600/60 uppercase opacity-0 transition-opacity group-hover:opacity-100">
                        Verified
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase">
            Entry {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of{" "}
            {total} transactions
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-9 rounded-lg border-border/50 px-4 text-[10px] font-black tracking-widest text-muted-foreground uppercase"
            >
              Previous
            </Button>
            <div className="flex h-9 items-center justify-center rounded-lg border border-border/50 bg-muted/30 px-3">
              <span className="text-[10px] font-black tracking-widest text-primary/70 uppercase">
                {page} <span className="mx-1 text-muted-foreground/30">/</span>{" "}
                {totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="h-9 rounded-lg border-border/50 px-4 text-[10px] font-black tracking-widest text-muted-foreground uppercase"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
