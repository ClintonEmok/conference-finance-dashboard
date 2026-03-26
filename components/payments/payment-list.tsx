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

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function SourceIcon({ source }: { source: PaymentSource }) {
  switch (source) {
    case "tikkie":
      return (
        <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
          Tikkie
        </span>
      )
    case "bank_transfer":
      return (
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
          Bank
        </span>
      )
    case "cash":
      return (
        <span className="text-xs font-medium text-green-600 dark:text-green-400">
          Cash
        </span>
      )
  }
}

function StatusBadge({ status }: { status: PaymentMatchStatus }) {
  switch (status) {
    case "unassigned":
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
        >
          Unassigned
        </Badge>
      )
    case "ambiguous":
      return (
        <Badge
          variant="secondary"
          className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
        >
          Ambiguous
        </Badge>
      )
    case "manual_assignment":
      return (
        <Badge
          variant="secondary"
          className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
        >
          Manual
        </Badge>
      )
    case "auto_matched":
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
        >
          Auto-matched
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
      <div className="flex flex-wrap gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 w-[180px] rounded-md border border-input bg-background px-3 text-sm"
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
          className="h-10 w-[180px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All sources</option>
          <option value="tikkie">Tikkie</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cash">Cash</option>
        </select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No payments found
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm">
                    {formatDate(payment.paidAt)}
                  </TableCell>
                  <TableCell>
                    <SourceIcon source={payment.source} />
                  </TableCell>
                  <TableCell className="text-sm">{payment.payerName}</TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatMoney(payment.amountMinor)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={payment.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {payment.order ? (
                      <div>
                        <div className="font-mono text-xs">
                          {payment.order.providerOrderId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {payment.order.buyerName}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(payment.status === "unassigned" ||
                      payment.status === "ambiguous") &&
                      onAssign && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onAssign(payment)}
                        >
                          Assign
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
